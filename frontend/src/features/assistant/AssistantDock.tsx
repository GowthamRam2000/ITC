import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AutoAwesome,
  Close,
  ContentCopy,
  GraphicEq,
  Mic,
  Send,
  StopCircle,
  VolumeUp,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'

import { formatJobLabel, getJobName, listJobHistory, type JobHistoryItem } from '../../services/api/jobHistory'
import { askChat, speakVoice, transcribeVoice } from '../../services/api/jobs'
import type { AssistantLanguageMode, ScenarioCard } from '../../services/api/types'
import { MotionDiv } from '../../components/common/MotionDiv'

interface AssistantDockProps {
  open: boolean
  onClose: () => void
  languageMode: AssistantLanguageMode
  routeJobId: string | null
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  simulatorCard?: ScenarioCard | null
}

type VoiceModeState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

const SILENCE_THRESHOLD = 0.02
const SILENCE_MS_TO_STOP = 1400

function hasTamilScript(text: string) {
  return /[\u0B80-\u0BFF]/.test(text)
}

function hasDevanagariScript(text: string) {
  return /[\u0900-\u097F]/.test(text)
}

function looksLikeRomanTamil(text: string) {
  const tokens = new Set((text.toLowerCase().match(/[a-z']+/g) ?? []))
  const hints = ['intha', 'enna', 'irukku', 'unga', 'illai', 'idhu', 'epdi', 'pannu', 'la']
  let score = 0
  hints.forEach((hint) => {
    if (tokens.has(hint)) {
      score += 1
    }
  })
  return score >= 2
}

function looksLikeRomanHindi(text: string) {
  const tokens = new Set((text.toLowerCase().match(/[a-z']+/g) ?? []))
  const hints = ['kya', 'hai', 'nahi', 'mein', 'ka', 'ki', 'ye', 'mujhe']
  let score = 0
  hints.forEach((hint) => {
    if (tokens.has(hint)) {
      score += 1
    }
  })
  return score >= 2
}

function normalizeTranscriptionLanguage(code?: string | null): AssistantLanguageMode | null {
  const normalized = (code ?? '').toLowerCase().trim()
  if (!normalized) {
    return null
  }
  if (normalized.startsWith('ta')) {
    return 'ta'
  }
  if (normalized.startsWith('hi')) {
    return 'hi'
  }
  if (normalized.startsWith('en')) {
    return 'en'
  }
  return null
}

function inferTurnLanguage(
  transcript: string,
  transcriptionLanguage: string | null | undefined,
  fallbackMode: AssistantLanguageMode,
): AssistantLanguageMode {
  const sttHint = normalizeTranscriptionLanguage(transcriptionLanguage)
  if (sttHint) {
    return sttHint
  }
  const message = transcript.trim()
  if (!message) {
    return fallbackMode
  }
  if (hasTamilScript(message)) {
    return 'ta'
  }
  if (hasDevanagariScript(message)) {
    return 'hi'
  }
  if (looksLikeRomanTamil(message)) {
    return 'tanglish'
  }
  if (looksLikeRomanHindi(message)) {
    return 'hinglish'
  }
  return fallbackMode === 'auto' ? 'en' : fallbackMode
}

function isAutoplayBlockedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return (
    message.includes('notallowederror') ||
    message.includes('not allowed by the user agent') ||
    message.includes('not allowed by the platform') ||
    message.includes('user gesture')
  )
}

export function AssistantDock({
  open,
  onClose,
  languageMode,
  routeJobId,
}: AssistantDockProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'))
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [followups, setFollowups] = useState<string[]>([])
  const [simulatorMode, setSimulatorMode] = useState(false)

  const [jobs, setJobs] = useState<JobHistoryItem[]>([])
  const [selectedJobId, setSelectedJobId] = useState('')

  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [prefillFromVoice, setPrefillFromVoice] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [ttsLoadingMessageId, setTtsLoadingMessageId] = useState<string | null>(null)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [voiceModeOpen, setVoiceModeOpen] = useState(false)
  const [voiceModeState, setVoiceModeState] = useState<VoiceModeState>('idle')
  const [voiceModeError, setVoiceModeError] = useState('')
  const [voiceModeTranscript, setVoiceModeTranscript] = useState('')
  const [voiceModeSeconds, setVoiceModeSeconds] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const monitorFrameRef = useRef<number | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const speechDetectedRef = useRef(false)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsObjectUrlRef = useRef<string | null>(null)
  const voiceModeRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceModeStreamRef = useRef<MediaStream | null>(null)
  const voiceModeChunksRef = useRef<BlobPart[]>([])
  const voiceModeTimerRef = useRef<number | null>(null)
  const voiceModeAudioContextRef = useRef<AudioContext | null>(null)
  const voiceModeAnalyserRef = useRef<AnalyserNode | null>(null)
  const voiceModeMonitorFrameRef = useRef<number | null>(null)
  const voiceModeSilenceStartRef = useRef<number | null>(null)
  const voiceModeSpeechDetectedRef = useRef(false)

  const contextJobId = routeJobId ?? (selectedJobId || null)
  const needsJobSelection = !routeJobId
  const canSubmit = question.trim().length > 0 && Boolean(contextJobId) && !pending

  const stopAudioMonitor = useCallback(() => {
    if (monitorFrameRef.current) {
      window.cancelAnimationFrame(monitorFrameRef.current)
      monitorFrameRef.current = null
    }
    silenceStartRef.current = null
    speechDetectedRef.current = false
    analyserRef.current = null

    const activeAudioContext = audioContextRef.current
    audioContextRef.current = null
    if (activeAudioContext && activeAudioContext.state !== 'closed') {
      void activeAudioContext.close()
    }
  }, [])

  const stopVoiceModeMonitor = useCallback(() => {
    if (voiceModeMonitorFrameRef.current) {
      window.cancelAnimationFrame(voiceModeMonitorFrameRef.current)
      voiceModeMonitorFrameRef.current = null
    }
    voiceModeSilenceStartRef.current = null
    voiceModeSpeechDetectedRef.current = false
    voiceModeAnalyserRef.current = null

    const activeAudioContext = voiceModeAudioContextRef.current
    voiceModeAudioContextRef.current = null
    if (activeAudioContext && activeAudioContext.state !== 'closed') {
      void activeAudioContext.close()
    }
  }, [])

  const stopTtsPlayback = useCallback(() => {
    const activeAudio = ttsAudioRef.current
    if (activeAudio) {
      activeAudio.pause()
      activeAudio.src = ''
      activeAudio.onended = null
      activeAudio.onerror = null
    }
    ttsAudioRef.current = null

    const activeObjectUrl = ttsObjectUrlRef.current
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl)
    }
    ttsObjectUrlRef.current = null
    setTtsLoadingMessageId(null)
    setSpeakingMessageId(null)
  }, [])

  const unlockAudioPlayback = useCallback(async () => {
    try {
      const ContextCtor = window.AudioContext
      if (!ContextCtor) {
        return false
      }
      const context = new ContextCtor()
      await context.resume()
      const gain = context.createGain()
      gain.gain.value = 0.00001
      gain.connect(context.destination)
      const osc = context.createOscillator()
      osc.frequency.value = 1
      osc.connect(gain)
      osc.start()
      osc.stop(context.currentTime + 0.02)
      await new Promise((resolve) => {
        window.setTimeout(resolve, 40)
      })
      await context.close()
      return true
    } catch {
      return false
    }
  }, [])

  const playAudioWithRetry = useCallback(
    async (audio: HTMLAudioElement) => {
      try {
        await audio.play()
        return
      } catch (error) {
        if (!isAutoplayBlockedError(error)) {
          throw error
        }
      }

      const unlocked = await unlockAudioPlayback()
      if (!unlocked) {
        throw new Error('AUTOPLAY_BLOCKED')
      }
      try {
        await audio.play()
      } catch {
        throw new Error('AUTOPLAY_BLOCKED')
      }
    },
    [unlockAudioPlayback],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    setJobs(listJobHistory().slice(0, 30))
  }, [open])

  useEffect(() => {
    if (!open) {
      stopTtsPlayback()
    }
  }, [open, stopTtsPlayback])

  useEffect(() => {
    if (voiceModeOpen) {
      return
    }
    if (voiceModeTimerRef.current) {
      window.clearInterval(voiceModeTimerRef.current)
      voiceModeTimerRef.current = null
    }
    voiceModeStreamRef.current?.getTracks().forEach((track) => track.stop())
    stopVoiceModeMonitor()
    setVoiceModeState('idle')
    setVoiceModeSeconds(0)
  }, [voiceModeOpen, stopVoiceModeMonitor])

  useEffect(() => {
    if (routeJobId) {
      setSelectedJobId(routeJobId)
    }
  }, [routeJobId])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
      if (voiceModeTimerRef.current) {
        window.clearInterval(voiceModeTimerRef.current)
      }
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl)
      }
      stopTtsPlayback()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      voiceModeStreamRef.current?.getTracks().forEach((track) => track.stop())
      stopAudioMonitor()
      stopVoiceModeMonitor()
    }
  }, [recordedUrl, stopAudioMonitor, stopTtsPlayback, stopVoiceModeMonitor])

  const submitQuestion = useCallback(
    async (text: string, asVoiceInput = false) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }
      if (!contextJobId) {
        setError(t('assistant.choosePrompt'))
        return
      }

      stopTtsPlayback()
      setPending(true)
      setError('')
      setMessages((previous) => [
        ...previous,
        {
          id: `${Date.now()}_u`,
          role: 'user',
          text: trimmed,
        },
      ])
      setQuestion('')
      setPrefillFromVoice(false)
      setVoiceStatus('')

      try {
        const response = await askChat({
          job_id: contextJobId,
          question: trimmed,
          voice_input_text: asVoiceInput ? trimmed : undefined,
          language: languageMode,
          response_style: 'plain',
          simulator_mode: simulatorMode,
        })
        setMessages((previous) => [
          ...previous,
          {
            id: `${Date.now()}_a`,
            role: 'assistant',
            text: response.answer,
            simulatorCard: response.simulator_card ?? null,
          },
        ])
        setFollowups(response.followups ?? [])
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Assistant request failed.')
      } finally {
        setPending(false)
      }
    },
    [contextJobId, languageMode, simulatorMode, stopTtsPlayback, t],
  )

  const transcribeMediaFile = useCallback(
    async (file: File) => {
      setError('')
      setTranscribing(true)
      setVoiceStatus(t('voice.transcribingNow'))
      try {
        const response = await transcribeVoice(file, languageMode)
        const text = response.text?.trim() ?? ''
        if (!text) {
          setError(t('voice.transcriptionFailed'))
          setVoiceStatus('')
          return
        }
        setTranscript(text)
        setQuestion(text)
        setPrefillFromVoice(true)
        setVoiceStatus(t('voice.transcriptReady'))
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : t('voice.transcriptionFailed'))
        setVoiceStatus('')
      } finally {
        setTranscribing(false)
      }
    },
    [languageMode, t],
  )

  const handleSpeakMessage = useCallback(
    async (message: Message) => {
      if (message.role !== 'assistant') {
        return
      }

      if (speakingMessageId === message.id) {
        stopTtsPlayback()
        return
      }

      stopTtsPlayback()
      setError('')
      setTtsLoadingMessageId(message.id)
      try {
        const blob = await speakVoice({
          text: message.text,
          language: languageMode,
          response_style: 'plain',
          context_job_id: contextJobId,
          segment_type: 'chat_answer',
        })
        const objectUrl = URL.createObjectURL(blob)
        ttsObjectUrlRef.current = objectUrl

        const audio = new Audio(objectUrl)
        ttsAudioRef.current = audio
        audio.onended = () => {
          setSpeakingMessageId(null)
        }
        audio.onerror = () => {
          setSpeakingMessageId(null)
          setError(t('voice.playbackFailed'))
        }

        await playAudioWithRetry(audio)
        setSpeakingMessageId(message.id)
      } catch (nextError) {
        if (nextError instanceof Error && nextError.message === 'AUTOPLAY_BLOCKED') {
          setError(t('voice.autoplayBlocked'))
        } else {
          setError(nextError instanceof Error ? nextError.message : t('voice.playbackFailed'))
        }
      } finally {
        setTtsLoadingMessageId(null)
      }
    },
    [contextJobId, languageMode, playAudioWithRetry, speakingMessageId, stopTtsPlayback, t],
  )

  const stopVoiceModeRecording = useCallback(() => {
    const recorder = voiceModeRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    if (voiceModeTimerRef.current) {
      window.clearInterval(voiceModeTimerRef.current)
      voiceModeTimerRef.current = null
    }
    stopVoiceModeMonitor()
  }, [stopVoiceModeMonitor])

  const closeVoiceMode = useCallback(() => {
    stopVoiceModeRecording()
    stopTtsPlayback()
    setVoiceModeOpen(false)
    setVoiceModeError('')
  }, [stopTtsPlayback, stopVoiceModeRecording])

  const runVoiceModeTurn = useCallback(
    async (audioFile: File) => {
      if (!contextJobId) {
        setVoiceModeState('idle')
        setVoiceModeError(t('assistant.choosePrompt'))
        return
      }

      setVoiceModeError('')
      setVoiceModeState('transcribing')
      try {
        const transcription = await transcribeVoice(audioFile, languageMode)
        const transcriptText = transcription.text?.trim() ?? ''
        if (!transcriptText) {
          throw new Error(t('voice.transcriptionFailed'))
        }
        const turnLanguage = inferTurnLanguage(transcriptText, transcription.language, languageMode)

        setVoiceModeTranscript(transcriptText)
        setVoiceModeState('thinking')

        const response = await askChat({
          job_id: contextJobId,
          question: transcriptText,
          voice_input_text: transcriptText,
          language: turnLanguage,
          response_style: 'plain',
          simulator_mode: simulatorMode,
        })

        setVoiceModeState('speaking')
        stopTtsPlayback()
        const blob = await speakVoice({
          text: response.answer,
          language: turnLanguage,
          response_style: 'plain',
          context_job_id: contextJobId,
          segment_type: 'chat_answer',
        })

        const objectUrl = URL.createObjectURL(blob)
        ttsObjectUrlRef.current = objectUrl
        const audio = new Audio(objectUrl)
        ttsAudioRef.current = audio
        audio.onended = () => {
          setVoiceModeState('idle')
        }
        audio.onerror = () => {
          setVoiceModeState('idle')
          setVoiceModeError(t('voice.playbackFailed'))
        }

        await playAudioWithRetry(audio)
      } catch (nextError) {
        setVoiceModeState('idle')
        if (nextError instanceof Error && nextError.message === 'AUTOPLAY_BLOCKED') {
          setVoiceModeError(t('voice.autoplayBlocked'))
        } else {
          setVoiceModeError(nextError instanceof Error ? nextError.message : t('voice.playbackFailed'))
        }
      }
    },
    [contextJobId, languageMode, playAudioWithRetry, simulatorMode, stopTtsPlayback, t],
  )

  const startVoiceModeRecording = useCallback(async () => {
    if (!contextJobId) {
      setVoiceModeError(t('assistant.choosePrompt'))
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceModeError(t('voice.micUnsupported'))
      return
    }

    setVoiceModeError('')
    setVoiceModeTranscript('')
    setVoiceModeState('listening')
    setVoiceModeSeconds(0)
    stopTtsPlayback()
    await unlockAudioPlayback()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      voiceModeStreamRef.current = stream
      voiceModeRecorderRef.current = recorder
      voiceModeChunksRef.current = []
      voiceModeSilenceStartRef.current = null
      voiceModeSpeechDetectedRef.current = false

      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      voiceModeAudioContextRef.current = audioContext
      voiceModeAnalyserRef.current = analyser

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          voiceModeChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(voiceModeChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const extension = blob.type.includes('wav') ? 'wav' : 'webm'
        const clip = new File([blob], `assistant-live-${Date.now()}.${extension}`, {
          type: blob.type,
        })

        stream.getTracks().forEach((track) => track.stop())
        stopVoiceModeMonitor()
        if (voiceModeTimerRef.current) {
          window.clearInterval(voiceModeTimerRef.current)
          voiceModeTimerRef.current = null
        }
        setVoiceModeSeconds(0)

        if (clip.size > 0) {
          void runVoiceModeTurn(clip)
        } else {
          setVoiceModeState('idle')
        }
      }

      recorder.start()
      voiceModeTimerRef.current = window.setInterval(() => {
        setVoiceModeSeconds((value) => value + 1)
      }, 1000)

      const monitorSilence = () => {
        const activeAnalyser = voiceModeAnalyserRef.current
        const activeRecorder = voiceModeRecorderRef.current
        if (!activeAnalyser || !activeRecorder || activeRecorder.state !== 'recording') {
          return
        }

        const samples = new Uint8Array(activeAnalyser.fftSize)
        activeAnalyser.getByteTimeDomainData(samples)
        let sumSquares = 0
        for (let index = 0; index < samples.length; index += 1) {
          const normalized = (samples[index] - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / samples.length)
        const now = performance.now()

        if (rms > SILENCE_THRESHOLD) {
          voiceModeSpeechDetectedRef.current = true
          voiceModeSilenceStartRef.current = null
        } else if (voiceModeSpeechDetectedRef.current) {
          if (voiceModeSilenceStartRef.current === null) {
            voiceModeSilenceStartRef.current = now
          } else if (now - voiceModeSilenceStartRef.current >= SILENCE_MS_TO_STOP) {
            stopVoiceModeRecording()
            return
          }
        }

        voiceModeMonitorFrameRef.current = window.requestAnimationFrame(monitorSilence)
      }

      voiceModeMonitorFrameRef.current = window.requestAnimationFrame(monitorSilence)
    } catch (nextError) {
      setVoiceModeState('idle')
      if (isAutoplayBlockedError(nextError)) {
        setVoiceModeError(t('voice.autoplayBlocked'))
      } else {
        setVoiceModeError(t('voice.micPermissionDenied'))
      }
      stopVoiceModeMonitor()
    }
  }, [
    contextJobId,
    runVoiceModeTurn,
    stopTtsPlayback,
    stopVoiceModeMonitor,
    stopVoiceModeRecording,
    t,
    unlockAudioPlayback,
  ])

  const startRecording = async () => {
    setError('')
    setVoiceStatus('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('voice.micUnsupported'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []
      silenceStartRef.current = null
      speechDetectedRef.current = false
      setRecordSeconds(0)
      setIsRecording(true)

      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const extension = blob.type.includes('wav') ? 'wav' : 'webm'
        const clip = new File([blob], `assistant-query-${Date.now()}.${extension}`, {
          type: blob.type,
        })
        if (recordedUrl) {
          URL.revokeObjectURL(recordedUrl)
        }
        setRecordedUrl(URL.createObjectURL(blob))
        setIsRecording(false)
        if (timerRef.current) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        stream.getTracks().forEach((track) => track.stop())
        stopAudioMonitor()
        void transcribeMediaFile(clip)
      }

      recorder.start()
      const monitorSilence = () => {
        const activeAnalyser = analyserRef.current
        const activeRecorder = recorderRef.current
        if (!activeAnalyser || !activeRecorder || activeRecorder.state !== 'recording') {
          return
        }

        const samples = new Uint8Array(activeAnalyser.fftSize)
        activeAnalyser.getByteTimeDomainData(samples)
        let sumSquares = 0
        for (let index = 0; index < samples.length; index += 1) {
          const normalized = (samples[index] - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / samples.length)
        const now = performance.now()

        if (rms > SILENCE_THRESHOLD) {
          speechDetectedRef.current = true
          silenceStartRef.current = null
        } else if (speechDetectedRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now
          } else if (now - silenceStartRef.current >= SILENCE_MS_TO_STOP) {
            stopRecording()
            return
          }
        }

        monitorFrameRef.current = window.requestAnimationFrame(monitorSilence)
      }
      monitorFrameRef.current = window.requestAnimationFrame(monitorSilence)
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((value) => value + 1)
      }, 1000)
    } catch {
      setError(t('voice.micPermissionDenied'))
      stopAudioMonitor()
    }
  }

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      return
    }
    stopAudioMonitor()
    recorderRef.current.stop()
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const drawerAnchor: 'right' | 'bottom' = isDesktop ? 'right' : 'bottom'

  const headerSubtitle = useMemo(() => {
    if (contextJobId) {
      const fromList = jobs.find((job) => job.jobId === contextJobId)?.jobName
      const label = formatJobLabel({ jobId: contextJobId, jobName: fromList ?? getJobName(contextJobId) })
      return `${t('assistant.contextJob')}: ${label}`
    }
    return t('assistant.choosePrompt')
  }, [contextJobId, jobs, t])

  const voiceModeStatusLabel = useMemo(() => {
    if (voiceModeState === 'listening') {
      return `${t('voice.liveListening')} ${voiceModeSeconds}s`
    }
    if (voiceModeState === 'transcribing') {
      return t('voice.liveTranscribing')
    }
    if (voiceModeState === 'thinking') {
      return t('voice.liveThinking')
    }
    if (voiceModeState === 'speaking') {
      return t('voice.liveSpeaking')
    }
    return t('voice.liveReady')
  }, [t, voiceModeSeconds, voiceModeState])

  const voiceWaveActive = voiceModeState !== 'idle'

  return (
    <>
      <Drawer
      anchor={drawerAnchor}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: isDesktop ? 440 : '100%',
          height: isDesktop ? '82vh' : '86vh',
          maxHeight: isDesktop ? '82vh' : '86vh',
          right: isDesktop ? 14 : undefined,
          top: isDesktop ? 'auto' : undefined,
          bottom: isDesktop ? 14 : undefined,
          mx: isDesktop ? undefined : 'auto',
          mb: isDesktop ? undefined : 0,
          borderRadius: {
            xs: '24px 24px 0 0',
            md: '24px',
          },
          overflow: 'hidden',
          border: (theme) => `1px solid ${theme.palette.divider}`,
          boxShadow: (theme) =>
            theme.palette.mode === 'light'
              ? '0 28px 72px rgba(16,34,70,0.20)'
              : '0 28px 72px rgba(0,0,0,0.55)',
          backdropFilter: 'blur(14px)',
          animation: isDesktop
            ? 'assistantDockRise 220ms cubic-bezier(0.22, 1, 0.36, 1)'
            : 'assistantDockRiseMobile 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          '@keyframes assistantDockRise': {
            from: { transform: 'translateY(32px)', opacity: 0.74 },
            to: { transform: 'translateY(0)', opacity: 1 },
          },
          '@keyframes assistantDockRiseMobile': {
            from: { transform: 'translateY(24px)', opacity: 0.74 },
            to: { transform: 'translateY(0)', opacity: 1 },
          },
        },
      }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
            background: (theme) =>
              theme.palette.mode === 'light' ? 'rgba(232,242,255,0.86)' : 'rgba(21,36,60,0.9)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Stack direction="row" spacing={1.2} alignItems="center" minWidth={0}>
            <AutoAwesome color="primary" />
            <Box minWidth={0}>
              <Typography fontWeight={800} noWrap>
                {t('assistant.title')}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {headerSubtitle}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.5}>
            <IconButton onClick={onClose} aria-label={t('assistant.close')}>
              <Close />
            </IconButton>
          </Stack>
        </Stack>

        <Stack spacing={1.2} sx={{ p: 1.6, flex: 1, minHeight: 0 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          {needsJobSelection ? (
            jobs.length > 0 ? (
              <FormControl size="small">
                <InputLabel>{t('assistant.pickJob')}</InputLabel>
                <Select
                  label={t('assistant.pickJob')}
                  value={selectedJobId}
                  onChange={(event) => setSelectedJobId(event.target.value)}
                >
                  {jobs.map((job) => (
                    <MenuItem key={job.jobId} value={job.jobId}>
                      <ListItemText
                        primary={formatJobLabel(job)}
                        secondary={`${new Date(job.createdAt).toLocaleString()} \u2022 ${job.jobId.slice(0, 10)}`}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <Alert severity="warning">{t('assistant.noJobs')}</Alert>
            )
          ) : (
            <Chip size="small" color="primary" label={t('assistant.routeBound')} />
          )}

          <Stack
            spacing={0.9}
            sx={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              border: (theme) => `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              p: 1,
              bgcolor: (theme) =>
                theme.palette.mode === 'light' ? 'rgba(255,255,255,0.7)' : 'rgba(18,29,49,0.45)',
            }}
          >
            {messages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('assistant.listenHint')}
              </Typography>
            ) : (
              messages.map((message) => (
                <MotionDiv
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Box
                    sx={{
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      width: 'fit-content',
                      maxWidth: '89%',
                      backgroundColor: message.role === 'user' ? 'primary.main' : 'background.default',
                      color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
                      px: 1.2,
                      py: 1,
                      borderRadius: 2.4,
                      borderTopRightRadius: message.role === 'user' ? 0.6 : 2,
                      borderTopLeftRadius: message.role === 'assistant' ? 0.6 : 2,
                      borderBottomLeftRadius: 2.4,
                      borderBottomRightRadius: 2.4,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                      <Typography variant="caption" sx={{ opacity: 0.84 }}>
                        {message.role === 'user' ? t('chat.you') : t('chat.assistant')}
                      </Typography>
                      <Stack direction="row" spacing={0.2}>
                        {message.role === 'assistant' ? (
                          <IconButton
                            size="small"
                            sx={{ color: 'inherit', opacity: 0.9 }}
                            aria-label={
                              speakingMessageId === message.id
                                ? t('voice.stopSpeak')
                                : t('voice.speak')
                            }
                            onClick={() => {
                              void handleSpeakMessage(message)
                            }}
                          >
                            {ttsLoadingMessageId === message.id ? (
                              <CircularProgress size={14} color="inherit" />
                            ) : speakingMessageId === message.id ? (
                              <StopCircle sx={{ fontSize: 14 }} />
                            ) : (
                              <VolumeUp sx={{ fontSize: 14 }} />
                            )}
                          </IconButton>
                        ) : null}
                        <IconButton
                          size="small"
                          sx={{ color: 'inherit', opacity: 0.74 }}
                          onClick={() => {
                            void navigator.clipboard.writeText(message.text)
                          }}
                        >
                          <ContentCopy sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </Stack>
                    {message.role === 'assistant' ? (
                      <Stack spacing={1}>
                        <Box
                          sx={{
                            fontSize: '0.94rem',
                            lineHeight: 1.55,
                            '& p': { m: 0 },
                            '& p + p': { mt: 1 },
                            '& ul, & ol': { m: 0, pl: 2.2 },
                          }}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                        </Box>
                        {message.simulatorCard ? (
                          <Box
                            sx={{
                              borderRadius: 2,
                              p: 1.1,
                              border: (currentTheme) => `1px solid ${currentTheme.palette.divider}`,
                              backdropFilter: 'blur(10px)',
                              background: (currentTheme) =>
                                currentTheme.palette.mode === 'light'
                                  ? 'rgba(255,255,255,0.64)'
                                  : 'rgba(19,29,46,0.62)',
                            }}
                          >
                            <Typography variant="subtitle2" fontWeight={700}>
                              {message.simulatorCard.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" mb={0.6}>
                              {message.simulatorCard.subtitle}
                            </Typography>
                            <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" mb={0.6}>
                              {message.simulatorCard.metrics.map((metric) => (
                                <Chip
                                  key={`${message.id}_${metric.label}`}
                                  size="small"
                                  label={`${metric.label}: ${metric.value}`}
                                  color={
                                    metric.tone === 'critical'
                                      ? 'error'
                                      : metric.tone === 'warning'
                                        ? 'warning'
                                        : metric.tone === 'good'
                                          ? 'success'
                                          : metric.tone === 'info'
                                            ? 'info'
                                            : 'default'
                                  }
                                />
                              ))}
                            </Stack>
                            {message.simulatorCard.assumptions.map((assumption) => (
                              <Typography key={`${message.id}_${assumption}`} variant="caption" display="block" color="text.secondary">
                                • {assumption}
                              </Typography>
                            ))}
                            <Typography variant="caption" display="block" mt={0.6} color="text.secondary">
                              {message.simulatorCard.disclaimer}
                            </Typography>
                          </Box>
                        ) : null}
                      </Stack>
                    ) : (
                      <Typography variant="body2" whiteSpace="pre-wrap">
                        {message.text}
                      </Typography>
                    )}
                  </Box>
                </MotionDiv>
              ))
            )}
          </Stack>

          <Stack spacing={1}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={simulatorMode}
                  onChange={(event) => setSimulatorMode(event.target.checked)}
                />
              }
              label="Scenario Sandbox"
              sx={{ mt: -0.2 }}
            />
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {!isRecording ? (
                <Button
                  variant="contained"
                  startIcon={<Mic />}
                  onClick={startRecording}
                  disabled={transcribing || pending}
                >
                  {t('voice.askWithVoice')}
                </Button>
              ) : (
                <Button color="error" variant="contained" startIcon={<StopCircle />} onClick={stopRecording}>
                  {t('voice.stopListening')}
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<GraphicEq />}
                onClick={() => {
                  setVoiceModeError('')
                  setVoiceModeOpen(true)
                }}
                disabled={pending || transcribing}
              >
                {t('voice.liveOpen')}
              </Button>
            </Stack>

            {isRecording ? (
              <Stack spacing={0.6}>
                <Typography variant="caption" color="error.main">
                  {t('voice.recording')} {recordSeconds}s
                </Typography>
                <LinearProgress color="error" />
              </Stack>
            ) : null}

            {transcribing ? (
              <Stack spacing={0.6}>
                <Typography variant="caption" color="text.secondary">
                  {t('voice.transcribingNow')}
                </Typography>
                <LinearProgress />
              </Stack>
            ) : null}

            {voiceStatus && !isRecording && !transcribing ? (
              <Typography variant="caption" color="success.main">
                {voiceStatus}
              </Typography>
            ) : null}

            {recordedUrl ? <audio controls src={recordedUrl} /> : null}
          </Stack>

          <Divider />

          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              value={question}
              onChange={(event) => {
                const nextValue = event.target.value
                setQuestion(nextValue)
                if (prefillFromVoice && nextValue.trim() !== transcript.trim()) {
                  setPrefillFromVoice(false)
                }
              }}
              placeholder={t('chat.placeholder')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (canSubmit) {
                    void submitQuestion(question, prefillFromVoice)
                  }
                }
              }}
            />
            <Button
              variant="contained"
              endIcon={<Send />}
              disabled={!canSubmit}
              onClick={() => {
                void submitQuestion(question, prefillFromVoice)
              }}
            >
              {t('chat.send')}
            </Button>
          </Stack>

          {followups.length > 0 ? (
            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
              {followups.map((item) => (
                <Chip
                  key={item}
                  size="small"
                  label={item}
                  onClick={() => {
                    void submitQuestion(item)
                  }}
                />
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Stack>
      </Drawer>

      <Drawer
        anchor="bottom"
        open={voiceModeOpen}
        onClose={closeVoiceMode}
        PaperProps={{
          sx: {
            width: { xs: '100%', md: 430 },
            height: { xs: '78vh', md: 560 },
            maxHeight: { xs: '78vh', md: 560 },
            ml: { xs: 0, md: 'auto' },
            mr: { xs: 0, md: 2 },
            mb: { xs: 0, md: 2 },
            borderRadius: { xs: '26px 26px 0 0', md: '26px' },
            overflow: 'hidden',
            border: (currentTheme) => `1px solid ${currentTheme.palette.divider}`,
            background: (currentTheme) =>
              currentTheme.palette.mode === 'light'
                ? 'linear-gradient(180deg, rgba(239,247,255,0.96) 0%, rgba(248,252,255,0.98) 100%)'
                : 'linear-gradient(180deg, rgba(20,31,51,0.97) 0%, rgba(15,22,36,0.98) 100%)',
          },
        }}
      >
        <Stack sx={{ height: '100%' }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              px: 2,
              py: 1.6,
              borderBottom: (currentTheme) => `1px solid ${currentTheme.palette.divider}`,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
              <GraphicEq color="primary" />
              <Box minWidth={0}>
                <Typography fontWeight={800} noWrap>
                  {t('voice.liveTitle')}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {headerSubtitle}
                </Typography>
              </Box>
            </Stack>
            <IconButton onClick={closeVoiceMode} aria-label={t('voice.liveClose')}>
              <Close />
            </IconButton>
          </Stack>

          <Stack sx={{ p: 2, gap: 1.2, flex: 1 }}>
            {!contextJobId ? <Alert severity="warning">{t('assistant.choosePrompt')}</Alert> : null}
            {voiceModeError ? <Alert severity="error">{voiceModeError}</Alert> : null}

            <Box
              sx={{
                flex: 1,
                borderRadius: 3,
                border: (currentTheme) => `1px solid ${currentTheme.palette.divider}`,
                px: 2,
                py: 2.2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: (currentTheme) =>
                  currentTheme.palette.mode === 'light'
                    ? 'rgba(255,255,255,0.7)'
                    : 'rgba(13,20,34,0.7)',
              }}
            >
              <Stack spacing={0.8} alignItems="center">
                <Typography variant="h6">{t('voice.livePulse')}</Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {voiceModeStatusLabel}
                </Typography>
              </Stack>

              <Box
                sx={{
                  height: 170,
                  borderRadius: 999,
                  px: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  background: (currentTheme) =>
                    currentTheme.palette.mode === 'light'
                      ? 'linear-gradient(180deg, rgba(216,232,255,0.45), rgba(240,248,255,0.6))'
                      : 'linear-gradient(180deg, rgba(28,54,88,0.45), rgba(18,30,52,0.72))',
                  '@keyframes voiceWave': {
                    '0%, 100%': { transform: 'scaleY(0.3)' },
                    '50%': { transform: 'scaleY(1)' },
                  },
                }}
              >
                {Array.from({ length: 20 }).map((_, index) => (
                  <Box
                    key={`voice_wave_${index}`}
                    sx={{
                      width: 5,
                      height: `${12 + ((index * 7) % 34)}px`,
                      borderRadius: 99,
                      transformOrigin: 'bottom',
                      bgcolor: index % 2 === 0 ? 'primary.main' : 'secondary.main',
                      opacity: voiceWaveActive ? 1 : 0.34,
                      animation: voiceWaveActive
                        ? `voiceWave ${0.95 + (index % 4) * 0.14}s ease-in-out ${index * 0.04}s infinite`
                        : 'none',
                    }}
                  />
                ))}
              </Box>

              <Stack spacing={1}>
                {voiceModeTranscript ? (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {t('voice.liveHeard')}: {voiceModeTranscript}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {t('voice.liveHint')}
                  </Typography>
                )}

                <Stack direction="row" spacing={1}>
                  {voiceModeState === 'listening' ? (
                    <Button color="error" variant="contained" startIcon={<StopCircle />} onClick={stopVoiceModeRecording}>
                      {t('voice.liveStop')}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      startIcon={<Mic />}
                      onClick={() => {
                        void startVoiceModeRecording()
                      }}
                      disabled={voiceModeState === 'transcribing' || voiceModeState === 'thinking' || voiceModeState === 'speaking'}
                    >
                      {t('voice.liveStart')}
                    </Button>
                  )}
                  <Button variant="outlined" onClick={closeVoiceMode}>
                    {t('voice.liveClose')}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </Drawer>
    </>
  )
}
