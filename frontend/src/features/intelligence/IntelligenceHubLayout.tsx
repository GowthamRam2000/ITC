import { useEffect, useMemo, useRef, useState } from 'react'
import { AutoAwesome, Campaign, OutlinedFlag, PlayCircle, PushPin, StopCircle } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { formatJobLabel, listJobHistory, type JobHistoryItem } from '../../services/api/jobHistory'
import {
  dispatchJob,
  getPhase6Readiness,
  getPortfolioOverview,
  getNarrationVoices,
  listJobs,
  speakVoice,
} from '../../services/api/jobs'
import type { JobListItemResponse, NarrationLanguage } from '../../services/api/types'
import type { IntelligenceScope, IntelligenceShellContext } from './context'

const SCOPE_KEY = 'gst-intelligence-scope'
const JOB_KEY = 'gst-intelligence-selected-job'
const PINNED_JOB_KEY = 'gst-intelligence-pinned-job'
const BASELINE_JOB_KEY = 'gst-intelligence-baseline-job'

export function IntelligenceHubLayout() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const routeTabs = useMemo(
    () => [
      { key: 'portfolio', label: t('intelligence.tabs.portfolio') },
      { key: 'compliance', label: t('intelligence.tabs.compliance') },
      { key: 'risk', label: t('intelligence.tabs.risk') },
      { key: 'operations', label: t('intelligence.tabs.operations') },
    ],
    [t],
  )

  const localHistory = useMemo<JobHistoryItem[]>(() => listJobHistory(), [])
  const [selectedJobId, setSelectedJobId] = useState(() => localStorage.getItem(JOB_KEY) || '')
  const [scope, setScope] = useState<IntelligenceScope>(() => {
    const saved = localStorage.getItem(SCOPE_KEY)
    return saved === 'job' ? 'job' : 'all'
  })
  const [voiceLanguage, setVoiceLanguage] = useState<NarrationLanguage>('en')
  const [pinnedJobId, setPinnedJobId] = useState(() => localStorage.getItem(PINNED_JOB_KEY) || '')
  const [baselineJobId, setBaselineJobId] = useState(() => localStorage.getItem(BASELINE_JOB_KEY) || '')
  const [speakError, setSpeakError] = useState('')
  const [speakingBlock, setSpeakingBlock] = useState<string | null>(null)
  const [speakingLabel, setSpeakingLabel] = useState<string | null>(null)
  const [dispatchMessage, setDispatchMessage] = useState('')

  const narrationAudioRef = useRef<HTMLAudioElement | null>(null)
  const narrationUrlRef = useRef<string | null>(null)

  const currentTab = useMemo(() => {
    const match = location.pathname.match(/\/app\/intelligence\/([^/]+)/)
    return match?.[1] ?? 'portfolio'
  }, [location.pathname])

  useEffect(() => {
    return () => {
      if (narrationAudioRef.current) {
        narrationAudioRef.current.pause()
      }
      if (narrationUrlRef.current) {
        URL.revokeObjectURL(narrationUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(SCOPE_KEY, scope)
  }, [scope])

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'canonical'],
    queryFn: () => listJobs(false),
    refetchInterval: 15000,
  })

  const jobOptions = useMemo<JobListItemResponse[]>(() => {
    if (jobsQuery.data && jobsQuery.data.length > 0) {
      return jobsQuery.data
    }
    return localHistory.map((item) => ({
      job_id: item.jobId,
      job_name: item.jobName ?? null,
      status: item.status,
      created_at: item.createdAt,
      updated_at: item.createdAt,
      has_results: item.status === 'COMPLETED',
      has_invoice_source: false,
      input_profile: 'unknown',
    }))
  }, [jobsQuery.data, localHistory])

  const effectiveSelectedJobId = useMemo(() => {
    if (jobOptions.length === 0) {
      return ''
    }
    if (selectedJobId && jobOptions.some((job) => job.job_id === selectedJobId)) {
      return selectedJobId
    }
    const preferredCompleted = jobOptions.find((job) => job.status === 'COMPLETED')
    return preferredCompleted?.job_id ?? jobOptions[0]?.job_id ?? ''
  }, [jobOptions, selectedJobId])

  const hasJobContext = Boolean(effectiveSelectedJobId)

  useEffect(() => {
    if (effectiveSelectedJobId) {
      localStorage.setItem(JOB_KEY, effectiveSelectedJobId)
    } else {
      localStorage.removeItem(JOB_KEY)
    }
  }, [effectiveSelectedJobId])

  useEffect(() => {
    if (pinnedJobId) {
      localStorage.setItem(PINNED_JOB_KEY, pinnedJobId)
    } else {
      localStorage.removeItem(PINNED_JOB_KEY)
    }
  }, [pinnedJobId])

  useEffect(() => {
    if (baselineJobId) {
      localStorage.setItem(BASELINE_JOB_KEY, baselineJobId)
    } else {
      localStorage.removeItem(BASELINE_JOB_KEY)
    }
  }, [baselineJobId])

  const selectedJob = useMemo(
    () => jobOptions.find((job) => job.job_id === effectiveSelectedJobId) ?? null,
    [effectiveSelectedJobId, jobOptions],
  )

  const voicesQuery = useQuery({
    queryKey: ['phase6', 'voices'],
    queryFn: getNarrationVoices,
  })

  const portfolioQuery = useQuery({
    queryKey: ['phase6', 'portfolio'],
    queryFn: () => getPortfolioOverview(),
  })

  const readinessQuery = useQuery({
    queryKey: ['phase6', 'readiness', effectiveSelectedJobId],
    queryFn: () => getPhase6Readiness(effectiveSelectedJobId),
    enabled: Boolean(effectiveSelectedJobId && scope === 'job'),
  })

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveSelectedJobId) {
        throw new Error('No job selected.')
      }
      return dispatchJob(effectiveSelectedJobId)
    },
    onSuccess: async (data) => {
      setDispatchMessage(data.message)
      await queryClient.invalidateQueries({ queryKey: ['jobs', 'canonical'] })
      await queryClient.invalidateQueries({ queryKey: ['job-status', effectiveSelectedJobId] })
    },
  })

  const stopNarration = () => {
    if (narrationAudioRef.current) {
      narrationAudioRef.current.pause()
      narrationAudioRef.current.src = ''
      narrationAudioRef.current.onended = null
      narrationAudioRef.current.onerror = null
      narrationAudioRef.current = null
    }
    if (narrationUrlRef.current) {
      URL.revokeObjectURL(narrationUrlRef.current)
      narrationUrlRef.current = null
    }
    setSpeakingBlock(null)
    setSpeakingLabel(null)
  }

  const playNarration = async (
    block: string,
    text: string,
    segmentType: 'chat_answer' | 'summary' | 'report' | 'generic' = 'summary',
    label?: string,
  ) => {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    if (speakingBlock === block) {
      stopNarration()
      return
    }

    stopNarration()
    setSpeakError('')
    setSpeakingBlock(block)
    setSpeakingLabel(label ?? null)
    try {
      const blob = await speakVoice({
        text: trimmed,
        language: voiceLanguage,
        response_style: 'plain',
        context_job_id: effectiveSelectedJobId || null,
        segment_type: segmentType,
      })
      const url = URL.createObjectURL(blob)
      narrationUrlRef.current = url
      const audio = new Audio(url)
      narrationAudioRef.current = audio
      audio.onended = () => {
        setSpeakingBlock(null)
        setSpeakingLabel(null)
      }
      audio.onerror = () => {
        setSpeakingBlock(null)
        setSpeakingLabel(null)
        setSpeakError(t('intelligence.errors.playbackFailed'))
      }
      await audio.play()
    } catch (error) {
      setSpeakingBlock(null)
      setSpeakingLabel(null)
      setSpeakError(error instanceof Error ? error.message : t('intelligence.errors.playbackFailed'))
    }
  }

  const contextLabel =
    scope === 'all'
      ? t('intelligence.hub.scopeAll')
      : selectedJob
        ? `${formatJobLabel({ jobId: selectedJob.job_id, jobName: selectedJob.job_name ?? undefined })} (${new Date(selectedJob.created_at).toLocaleString()})`
        : t('intelligence.hub.noJobs')

  const outletContext: IntelligenceShellContext = {
    selectedJobId: effectiveSelectedJobId,
    hasJobContext,
    scope,
    setScope,
    contextLabel,
    voiceLanguage,
    speakingBlock,
    speakingLabel,
    setVoiceLanguage,
    playNarration,
    stopNarration,
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 3.5 } }}>
      <Stack spacing={1.6}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.2}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h4" fontWeight={800}>
              {t('intelligence.hub.title')}
            </Typography>
            <Typography color="text.secondary">
              {t('intelligence.hub.subtitle')}
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 220, position: 'relative' }}>
              <InputLabel id="int-job-label">{t('intelligence.hub.jobContext')}</InputLabel>
              <Select
                labelId="int-job-label"
                label={t('intelligence.hub.jobContext')}
                value={effectiveSelectedJobId}
                onChange={(event) => {
                  setDispatchMessage('')
                  setSelectedJobId(String(event.target.value))
                }}
              >
                {jobOptions.map((item) => (
                  <MenuItem key={item.job_id} value={item.job_id}>
                    <Stack direction="row" spacing={1} alignItems="center" width="100%">
                      <Typography variant="body2" noWrap>
                        {formatJobLabel({ jobId: item.job_id, jobName: item.job_name ?? undefined })}{' '}
                        ({new Date(item.created_at).toLocaleString()})
                      </Typography>
                      {item.job_id === pinnedJobId ? <Chip size="small" icon={<PushPin />} label="Pinned" /> : null}
                      {item.job_id === baselineJobId ? <Chip size="small" icon={<OutlinedFlag />} label="Baseline" /> : null}
                      <Chip
                        size="small"
                        label={item.status}
                        color={item.status === 'COMPLETED' ? 'success' : item.status === 'FAILED' ? 'error' : 'warning'}
                      />
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
              {jobsQuery.isFetching ? <CircularProgress size={14} sx={{ position: 'absolute', right: 10, top: 10 }} /> : null}
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 190 }}>
              <InputLabel id="int-voice-label">{t('intelligence.hub.narrationVoice')}</InputLabel>
              <Select
                labelId="int-voice-label"
                label={t('intelligence.hub.narrationVoice')}
                value={voiceLanguage}
                onChange={(event) => setVoiceLanguage(event.target.value as NarrationLanguage)}
              >
                <MenuItem value="en">{t('common.english')}</MenuItem>
                <MenuItem value="hi">{t('common.hindi')}</MenuItem>
                <MenuItem value="ta">{t('common.tamil')}</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>

        <Card
          className="glass-surface"
          sx={{
            backdropFilter: 'blur(10px)',
            background: (theme) =>
              theme.palette.mode === 'light'
                ? 'linear-gradient(135deg, rgba(255,255,255,0.84), rgba(240,248,255,0.74))'
                : 'linear-gradient(135deg, rgba(18,28,46,0.84), rgba(16,24,39,0.76))',
          }}
        >
          <CardContent>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', md: 'center' }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" color="text.secondary">{t('intelligence.hub.scope')}</Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={scope}
                  onChange={(_, value) => {
                    if (!value) return
                    setScope(value as IntelligenceScope)
                  }}
                >
                  <ToggleButton value="all">{t('intelligence.hub.scopeAll')}</ToggleButton>
                  <ToggleButton value="job" disabled={!hasJobContext}>{t('intelligence.hub.scopeJob')}</ToggleButton>
                </ToggleButtonGroup>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Chip size="small" color="primary" label={`${t('intelligence.hub.contextLabel')}: ${contextLabel}`} />
                <Button
                  size="small"
                  variant={pinnedJobId === effectiveSelectedJobId ? 'contained' : 'outlined'}
                  startIcon={<PushPin />}
                  disabled={!effectiveSelectedJobId}
                  onClick={() => {
                    setPinnedJobId(pinnedJobId === effectiveSelectedJobId ? '' : effectiveSelectedJobId)
                  }}
                >
                  Pin
                </Button>
                <Button
                  size="small"
                  variant={baselineJobId === effectiveSelectedJobId ? 'contained' : 'outlined'}
                  startIcon={<OutlinedFlag />}
                  disabled={!effectiveSelectedJobId}
                  onClick={() => {
                    setBaselineJobId(baselineJobId === effectiveSelectedJobId ? '' : effectiveSelectedJobId)
                  }}
                >
                  Baseline
                </Button>
                {selectedJob && selectedJob.status !== 'COMPLETED' ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      void dispatchMutation.mutateAsync()
                    }}
                    disabled={dispatchMutation.isPending}
                  >
                    {dispatchMutation.isPending ? t('intelligence.hub.dispatching') : t('intelligence.hub.dispatch')}
                  </Button>
                ) : null}
              </Stack>
            </Stack>
            {dispatchMessage ? <Typography variant="body2" color="text.secondary" mt={0.9}>{dispatchMessage}</Typography> : null}
          </CardContent>
        </Card>

        {!hasJobContext ? (
          <Alert severity="warning">
            {t('intelligence.hub.noJobs')}
          </Alert>
        ) : null}

        {scope === 'job' && readinessQuery.data?.reasons?.length ? (
          <Alert severity={readinessQuery.data.compliance_ready && readinessQuery.data.anomaly_ready ? 'info' : 'warning'}>
            {readinessQuery.data.reasons.join(' ')}
          </Alert>
        ) : null}

        {speakError ? <Alert severity="error">{speakError}</Alert> : null}

        <Card
          className="glass-surface"
          sx={{
            backdropFilter: 'blur(10px)',
            background: (theme) =>
              theme.palette.mode === 'light'
                ? 'linear-gradient(135deg, rgba(255,255,255,0.86), rgba(233,247,255,0.75))'
                : 'linear-gradient(135deg, rgba(18,30,48,0.84), rgba(13,24,39,0.76))',
          }}
        >
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <AutoAwesome color="primary" />
                <Box>
                  <Typography fontWeight={700}>{t('intelligence.hub.narrationEngine')}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {voicesQuery.data?.enabled
                      ? `${voicesQuery.data.provider} • ${voicesQuery.data.model ?? t('intelligence.hub.defaultModel')}`
                      : t('intelligence.hub.narrationDisabled')}
                  </Typography>
                </Box>
              </Stack>
              {speakingLabel ? <Chip size="small" color="info" label={`${t('intelligence.hub.narrating')}: ${speakingLabel}`} /> : null}
              <Button
                variant={speakingBlock === 'morning' ? 'outlined' : 'contained'}
                startIcon={speakingBlock === 'morning' ? <StopCircle /> : <PlayCircle />}
                onClick={() => {
                  void playNarration('morning', portfolioQuery.data?.narration_text ?? '', 'summary', t('intelligence.hub.scopeAll'))
                }}
                disabled={!portfolioQuery.data?.narration_text}
              >
                {speakingBlock === 'morning'
                  ? t('intelligence.hub.stopBrief')
                  : t('intelligence.hub.playMorningBrief')}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card className="glass-surface-soft">
          <CardContent sx={{ pb: '12px !important' }}>
            <Tabs
              value={currentTab}
              onChange={(_, value: string) => navigate(`/app/intelligence/${value}`)}
              variant="scrollable"
              scrollButtons="auto"
            >
              {routeTabs.map((tab) => (
                <Tab key={tab.key} value={tab.key} icon={<Campaign fontSize="small" />} iconPosition="start" label={tab.label} />
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <Outlet context={outletContext} />
      </Stack>
    </Container>
  )
}
