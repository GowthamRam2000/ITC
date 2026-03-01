import { useEffect, useRef, useState } from 'react'
import { Mic, PlayCircle, StopCircle, UploadFile } from '@mui/icons-material'
import {
  Alert,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

import type { AssistantLanguageMode } from '../../services/api/types'
import { transcribeVoice } from '../../services/api/jobs'

interface VoiceQueryPanelProps {
  languageMode: AssistantLanguageMode
  onUseTranscript: (text: string) => void
}

export function VoiceQueryPanel({ languageMode, onUseTranscript }: VoiceQueryPanelProps) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [recordedFile, setRecordedFile] = useState<File | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl)
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [recordedUrl])

  const startRecording = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone recording is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []
      setRecordSeconds(0)
      setIsRecording(true)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const extension = blob.type.includes('wav') ? 'wav' : 'webm'
        const nextFile = new File([blob], `voice-query-${Date.now()}.${extension}`, {
          type: blob.type,
        })
        if (recordedUrl) {
          URL.revokeObjectURL(recordedUrl)
        }
        setRecordedFile(nextFile)
        setRecordedUrl(URL.createObjectURL(blob))
        setIsRecording(false)
        stream.getTracks().forEach((track) => track.stop())
      }

      recorder.start()
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((previous) => previous + 1)
      }, 1000)
    } catch {
      setError('Unable to access microphone. Please allow mic permissions.')
    }
  }

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      return
    }
    recorderRef.current.stop()
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleTranscribe = async () => {
    const selectedFile = recordedFile ?? file
    if (!selectedFile) {
      setError('Please record or upload audio first.')
      return
    }

    setPending(true)
    setError('')
    try {
      const result = await transcribeVoice(selectedFile, languageMode)
      setTranscript(result.text)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Voice transcription failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.4}>
          <Typography variant="h6">{t('voice.title')}</Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {!isRecording ? (
              <Button variant="contained" startIcon={<Mic />} onClick={startRecording}>
                {t('voice.recordStart')}
              </Button>
            ) : (
              <Button color="error" variant="contained" startIcon={<StopCircle />} onClick={stopRecording}>
                {t('voice.recordStop')}
              </Button>
            )}

            <Button component="label" variant="outlined" startIcon={<UploadFile />}>
              {t('voice.upload')}
              <input
                hidden
                type="file"
                accept="audio/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Button>
          </Stack>

          {isRecording ? (
            <Stack spacing={0.7}>
              <Typography variant="caption" color="error.main">
                {t('voice.recording')} {recordSeconds}s
              </Typography>
              <LinearProgress />
            </Stack>
          ) : null}

          {recordedFile ? (
            <Typography variant="caption" color="text.secondary">
              {t('voice.recorded')}: {recordedFile.name}
            </Typography>
          ) : null}

          {recordedUrl ? <audio controls src={recordedUrl} /> : null}

          {!recordedFile ? (
            <Typography variant="caption" color="text.secondary">
              {file ? file.name : 'No file selected'}
            </Typography>
          ) : null}

          <Button variant="contained" onClick={handleTranscribe} disabled={pending || (!recordedFile && !file)}>
            {t('voice.transcribe')}
          </Button>

          <TextField
            label={t('voice.transcript')}
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            multiline
            minRows={3}
          />

          <Button
            variant="text"
            startIcon={<PlayCircle />}
            onClick={() => onUseTranscript(transcript)}
            disabled={!transcript.trim()}
          >
            {t('voice.askChat')}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
