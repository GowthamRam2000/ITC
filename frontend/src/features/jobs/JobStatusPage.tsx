import { useEffect, useMemo, useState } from 'react'
import { DoneAll, ErrorOutline, Sync } from '@mui/icons-material'
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  LinearProgress,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useParams } from 'react-router-dom'

import { MotionDiv } from '../../components/common/MotionDiv'
import { ModelPipelineCard } from './ModelPipelineCard'
import { getJobName, updateJobName, updateJobStatus } from '../../services/api/jobHistory'
import { createJobEventsSource, getJobStatus, getModelConfig } from '../../services/api/jobs'
import type { JobEvent, JobStage, JobStatusResponse, ModelConfigResponse } from '../../services/api/types'

const STAGE_ORDER: JobStage[] = ['QUEUED', 'PARSING', 'RECONCILING', 'COMPLETED']

function stageIndex(stage?: JobStage) {
  if (!stage) {
    return 0
  }
  const index = STAGE_ORDER.indexOf(stage)
  return index === -1 ? 0 : index
}

function isTerminal(status?: JobStage) {
  return status === 'COMPLETED' || status === 'FAILED'
}

export function JobStatusPage() {
  const { t } = useTranslation()
  const { jobId = '' } = useParams()
  const [status, setStatus] = useState<JobStatusResponse | null>(null)
  const [models, setModels] = useState<ModelConfigResponse | null>(null)
  const [events, setEvents] = useState<JobEvent[]>([])
  const [error, setError] = useState('')
  const [fallbackPolling, setFallbackPolling] = useState(false)
  const [jobName, setJobName] = useState('')

  useEffect(() => {
    let active = true
    void getModelConfig()
      .then((config) => {
        if (active) {
          setModels(config)
        }
      })
      .catch(() => {
        if (active) {
          setModels(null)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!jobId) {
      return
    }

    let active = true
    const source = createJobEventsSource(jobId)

    void getJobStatus(jobId)
      .then((initialStatus) => {
        if (!active) {
          return
        }
        setStatus(initialStatus)
        updateJobStatus(jobId, initialStatus.status)
        const fromStatus = initialStatus.job_name?.trim()
        if (fromStatus) {
          setJobName(fromStatus)
          updateJobName(jobId, fromStatus)
        } else {
          setJobName(getJobName(jobId) ?? '')
        }
      })
      .catch((nextError: unknown) => {
        if (!active) {
          return
        }
        setError(nextError instanceof Error ? nextError.message : 'Failed to load job status.')
      })

    source.onmessage = (event) => {
      if (!active) {
        return
      }
      try {
        const parsed = JSON.parse(event.data) as JobEvent
        setEvents((previous) => [...previous, parsed].slice(-80))
        if (parsed.stage) {
          setStatus((previous) => {
            if (!previous) {
              return null
            }
            return {
              ...previous,
              status: parsed.stage ?? previous.status,
              stage_message: parsed.message ?? previous.stage_message,
              progress_pct: parsed.progress_pct ?? previous.progress_pct,
              processed_files: parsed.processed_files ?? previous.processed_files,
              total_files: parsed.total_files ?? previous.total_files,
              updated_at: parsed.ts,
            }
          })
          updateJobStatus(jobId, parsed.stage)
          if (parsed.stage === 'COMPLETED' || parsed.stage === 'FAILED') {
            setFallbackPolling(false)
          }
        }
      } catch {
        setFallbackPolling(true)
      }
    }

    source.onerror = () => {
      if (active) {
        setFallbackPolling(true)
      }
      source.close()
    }

    return () => {
      active = false
      source.close()
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId || !fallbackPolling || isTerminal(status?.status)) {
      return
    }

    const interval = window.setInterval(() => {
      void getJobStatus(jobId)
        .then((nextStatus) => {
          setStatus(nextStatus)
          updateJobStatus(jobId, nextStatus.status)
          const fromStatus = nextStatus.job_name?.trim()
          if (fromStatus) {
            setJobName(fromStatus)
            updateJobName(jobId, fromStatus)
          }
          if (isTerminal(nextStatus.status)) {
            setFallbackPolling(false)
          }
        })
        .catch(() => {
          // ignore temporary polling errors
        })
    }, 7000)

    return () => window.clearInterval(interval)
  }, [fallbackPolling, jobId, status?.status])

  const activeStep = useMemo(() => {
    if (status?.status === 'FAILED') {
      return 2
    }
    return stageIndex(status?.status)
  }, [status?.status])

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 4 } }}>
      <Stack spacing={2}>
        <Typography variant="h4">{t('job.statusTitle')}</Typography>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {fallbackPolling && !isTerminal(status?.status) ? (
          <Alert severity="warning">{t('job.fallbackPolling')}</Alert>
        ) : null}

        <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent>
              <Stack spacing={1.4}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Stack spacing={0.2}>
                    <Typography fontWeight={700}>{jobName || `Job ${jobId.slice(0, 10)}`}</Typography>
                    {jobName ? (
                      <Typography variant="caption" color="text.secondary">
                        {jobId}
                      </Typography>
                    ) : null}
                  </Stack>
                  <Chip
                    label={status?.status ?? 'QUEUED'}
                    color={
                      status?.status === 'FAILED'
                        ? 'error'
                        : status?.status === 'COMPLETED'
                          ? 'success'
                          : 'primary'
                    }
                  />
                </Stack>

                <LinearProgress value={status?.progress_pct ?? 0} variant="determinate" sx={{ height: 8, borderRadius: 8 }} />

                <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
                  <Sync fontSize="small" />
                  <Typography variant="body2">{status?.stage_message ?? t('job.watching')}</Typography>
                </Stack>

                <Stepper activeStep={activeStep} alternativeLabel>
                  <Step>
                    <StepLabel>{t('job.queued')}</StepLabel>
                  </Step>
                  <Step>
                    <StepLabel>{t('job.parsing')}</StepLabel>
                  </Step>
                  <Step>
                    <StepLabel>{t('job.reconciling')}</StepLabel>
                  </Step>
                  <Step>
                    <StepLabel>{t('job.completed')}</StepLabel>
                  </Step>
                </Stepper>

                {status?.status === 'FAILED' ? (
                  <Alert icon={<ErrorOutline />} severity="error">
                    {status.error ?? 'Job failed. Please verify file format and retry.'}
                  </Alert>
                ) : null}

                {status?.status === 'COMPLETED' ? (
                  <Button
                    component={RouterLink}
                    to={`/app/results/${jobId}`}
                    variant="contained"
                    startIcon={<DoneAll />}
                  >
                    {t('job.openResults')}
                  </Button>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </MotionDiv>

        <MotionDiv initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <ModelPipelineCard status={status} models={models} />
        </MotionDiv>

        <Card>
          <CardContent>
            <Typography variant="h6" mb={1}>
              Event timeline
            </Typography>
            <Stack spacing={0.8}>
              {events.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('job.watching')}
                </Typography>
              ) : (
                events
                  .slice()
                  .reverse()
                  .map((event, index) => (
                    <Card key={`${event.ts}_${index}`} variant="outlined">
                      <CardContent sx={{ py: 1.1 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                          <Typography variant="body2">{event.message ?? event.type}</Typography>
                          {event.stage ? <Chip size="small" label={event.stage} /> : null}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(event.ts).toLocaleString()}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
