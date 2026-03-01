import { useMemo, type ReactNode } from 'react'
import {
  AutoAwesome,
  CheckCircle,
  DocumentScanner,
  Hub,
  PsychologyAlt,
  Summarize,
} from '@mui/icons-material'
import { alpha, Box, Card, CardContent, Chip, Stack, Typography, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'

import type { JobStage, JobStatusResponse, ModelConfigResponse } from '../../services/api/types'

interface ModelPipelineCardProps {
  status: JobStatusResponse | null
  models: ModelConfigResponse | null
}

interface PipelineStep {
  key: 'ocr' | 'extract' | 'reason' | 'report'
  label: string
  model: string
  icon: ReactNode
}

type PipelineState = 'DONE' | 'RUNNING' | 'FAILED' | 'WAITING'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function resolveActiveStep(stage: JobStage | undefined, progressPct: number): PipelineStep['key'] {
  if (stage === 'RECONCILING') {
    return 'reason'
  }
  if (stage === 'COMPLETED') {
    return 'report'
  }
  if (stage === 'PARSING') {
    return progressPct < 40 ? 'ocr' : 'extract'
  }
  if (stage === 'FAILED') {
    if (progressPct >= 70) {
      return 'reason'
    }
    return progressPct >= 40 ? 'extract' : 'ocr'
  }
  return 'ocr'
}

function resolveRobotTrackPosition(stage: JobStage | undefined, progressPct: number): number {
  if (stage === 'QUEUED') {
    return 0
  }
  if (stage === 'PARSING') {
    return clamp((progressPct - 10) / 55, 0, 1)
  }
  if (stage === 'RECONCILING') {
    return 1 + clamp((progressPct - 65) / 35, 0, 1)
  }
  if (stage === 'COMPLETED') {
    return 3
  }
  if (stage === 'FAILED') {
    if (progressPct <= 65) {
      return clamp((progressPct - 10) / 55, 0, 1)
    }
    return 1 + clamp((progressPct - 65) / 35, 0, 1)
  }
  return 0
}

function resolveStateLabel(stepIndex: number, activeIndex: number, stage: JobStage | undefined): PipelineState {
  if (stage === 'COMPLETED') {
    return 'DONE'
  }
  if (stepIndex < activeIndex) {
    return 'DONE'
  }
  if (stepIndex === activeIndex) {
    return stage === 'FAILED' ? 'FAILED' : 'RUNNING'
  }
  return 'WAITING'
}

export function ModelPipelineCard({ status, models }: ModelPipelineCardProps) {
  const { t } = useTranslation()
  const theme = useTheme()
  const progressPct = status?.progress_pct ?? 0
  const stage = status?.status

  const steps = useMemo<PipelineStep[]>(
    () => [
      {
        key: 'ocr',
        label: t('job.pipeline.ocr'),
        model: models?.ocr ?? 'mistral-ocr-latest',
        icon: <DocumentScanner fontSize="small" />,
      },
      {
        key: 'extract',
        label: t('job.pipeline.extract'),
        model: models?.extract_default ?? models?.extract_fast ?? 'ministral-8b-latest',
        icon: <Hub fontSize="small" />,
      },
      {
        key: 'reason',
        label: t('job.pipeline.reason'),
        model: models?.reasoning ?? 'magistral-medium-latest',
        icon: <PsychologyAlt fontSize="small" />,
      },
      {
        key: 'report',
        label: t('job.pipeline.report'),
        model: models?.report_chat ?? 'mistral-large-latest',
        icon: <Summarize fontSize="small" />,
      },
    ],
    [models, t],
  )

  const activeKey = resolveActiveStep(stage, progressPct)
  const activeIndex = steps.findIndex((step) => step.key === activeKey)
  const activeModel = steps[Math.max(0, activeIndex)]?.model ?? '-'
  const robotStepPosition = resolveRobotTrackPosition(stage, progressPct)
  const robotLeft = `${(robotStepPosition / (steps.length - 1)) * 100}%`

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Stack direction="row" spacing={1} alignItems="center">
                <AutoAwesome color="primary" />
                <Box>
                <Typography variant="h6">{t('job.pipeline.title')}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {stage === 'COMPLETED' ? t('job.pipeline.finalModel') : t('job.pipeline.runningModel')}:{' '}
                  {activeModel}
                </Typography>
              </Box>
            </Stack>
            <Chip
              size="small"
              color={stage === 'COMPLETED' ? 'success' : stage === 'FAILED' ? 'error' : 'primary'}
              label={stage ?? 'QUEUED'}
            />
          </Stack>

          <Box
            sx={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 3,
              p: { xs: 1.2, sm: 1.6 },
              border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
              background:
                theme.palette.mode === 'light'
                  ? 'linear-gradient(145deg, rgba(231,242,255,0.78), rgba(255,255,255,0.66))'
                  : 'linear-gradient(145deg, rgba(26,42,66,0.86), rgba(18,30,48,0.78))',
              backdropFilter: 'blur(10px)',
              '&::before': {
                content: '""',
                position: 'absolute',
                width: 180,
                height: 180,
                borderRadius: '50%',
                top: -80,
                right: -40,
                background: alpha(theme.palette.primary.main, 0.13),
              },
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: 24,
                right: 24,
                top: 42,
                height: 4,
                borderRadius: 999,
                background: alpha(theme.palette.primary.main, 0.22),
              }}
            />

            <Box
              sx={{
                position: 'absolute',
                top: 24,
                left: `clamp(8px, calc(${robotLeft} - 20px), calc(100% - 48px))`,
                width: 40,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'left 700ms cubic-bezier(0.22, 1, 0.36, 1)',
                animation: 'pipelineRobotBob 1.4s ease-in-out infinite',
                '@keyframes pipelineRobotBob': {
                  '0%, 100%': { transform: 'translateY(0px)' },
                  '50%': { transform: 'translateY(-4px)' },
                },
              }}
            >
              <Box
                component="svg"
                viewBox="0 0 64 36"
                aria-label={t('job.pipeline.robotLabel')}
                sx={{ width: '100%', height: '100%' }}
              >
                <rect x="12" y="8" width="40" height="20" rx="8" fill={theme.palette.primary.main} />
                <circle cx="28" cy="18" r="3" fill="#fff" />
                <circle cx="36" cy="18" r="3" fill="#fff" />
                <rect x="30" y="2" width="4" height="7" rx="2" fill={theme.palette.primary.main} />
                <circle cx="32" cy="2" r="2.8" fill={theme.palette.secondary.main} />
              </Box>
            </Box>

            <Box
              sx={{
                mt: 6,
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 1,
              }}
            >
              {steps.map((step, index) => {
                const state = resolveStateLabel(index, activeIndex, stage)
                const isActive = state === 'RUNNING'
                const isDone = state === 'DONE'
                const isFailed = state === 'FAILED'
                const stateLabel = t(`job.pipeline.state.${state.toLowerCase()}`)
                return (
                  <Box
                    key={step.key}
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      border: `1px solid ${
                        isFailed
                          ? alpha(theme.palette.error.main, 0.4)
                          : isActive
                            ? alpha(theme.palette.primary.main, 0.45)
                            : alpha(theme.palette.divider, 0.8)
                      }`,
                      bgcolor: isActive
                        ? alpha(theme.palette.primary.main, 0.08)
                        : isDone
                          ? alpha(theme.palette.success.main, 0.08)
                          : 'transparent',
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Box color={isFailed ? 'error.main' : isActive ? 'primary.main' : 'text.secondary'}>
                          {isDone ? <CheckCircle fontSize="small" color="success" /> : step.icon}
                        </Box>
                        <Chip
                          size="small"
                          label={stateLabel}
                          color={
                            isFailed ? 'error' : isDone ? 'success' : isActive ? 'primary' : 'default'
                          }
                        />
                      </Stack>
                      <Typography variant="body2" fontWeight={700}>
                        {step.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          overflow: 'hidden',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          wordBreak: 'break-word',
                          minHeight: '2.1em',
                        }}
                      >
                        {step.model}
                      </Typography>
                    </Stack>
                  </Box>
                )
              })}
            </Box>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}
