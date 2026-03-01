import { useMemo, useState } from 'react'
import { CloudUpload, Description } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useNavigate } from 'react-router-dom'

import { formatJobLabel, listJobHistory, rememberJob } from '../../services/api/jobHistory'
import { ApiError } from '../../services/api/client'
import { createJob } from '../../services/api/jobs'

const ALLOWED_EXTENSIONS = ['.jsonl', '.json', '.csv', '.pdf', '.png', '.jpg', '.jpeg']

function isSupported(filename: string) {
  const lower = filename.toLowerCase()
  return ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [jobName, setJobName] = useState('')
  const [error, setError] = useState('')
  const recentJobs = listJobHistory().slice(0, 5)

  const mutation = useMutation({
    mutationFn: async () => createJob(files, jobName),
    onSuccess: (data) => {
      const cleanedName = jobName.trim()
      rememberJob({
        jobId: data.job_id,
        jobName: cleanedName.length > 0 ? cleanedName : undefined,
        createdAt: data.created_at,
        status: data.status,
      })
      setJobName('')
      navigate(`/app/jobs/${data.job_id}`)
    },
    onError: (nextError) => {
      if (nextError instanceof ApiError) {
        setError(nextError.message)
      } else if (nextError instanceof Error) {
        setError(nextError.message)
      } else {
        setError('Upload failed. Please retry.')
      }
    },
  })

  const onDrop = (acceptedFiles: File[]) => {
    setError('')
    const invalid = acceptedFiles.filter((file) => !isSupported(file.name))
    if (invalid.length > 0) {
      setError(t('dashboard.invalidType'))
      return
    }
    setFiles((prev) => [...prev, ...acceptedFiles])
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const summaryText = useMemo(() => {
    if (files.length === 0) {
      return t('dashboard.supported')
    }
    return `${files.length} ${t('dashboard.filesSelected').toLowerCase()}`
  }, [files.length, t])

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4">{t('dashboard.title')}</Typography>
          <Typography color="text.secondary" mt={0.6}>
            {t('dashboard.subtitle')}
          </Typography>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box
                {...getRootProps()}
                sx={(theme) => ({
                  border: `2px dashed ${theme.palette.primary.main}`,
                  borderRadius: 3,
                  p: { xs: 3, md: 5 },
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: isDragActive
                    ? theme.palette.action.hover
                    : theme.palette.mode === 'light'
                      ? 'rgba(255,255,255,0.7)'
                      : 'rgba(22,31,49,0.6)',
                })}
              >
                <input {...getInputProps()} />
                <CloudUpload sx={{ fontSize: 40 }} color="primary" />
                <Typography fontWeight={700} mt={1}>
                  {t('dashboard.dropzone')}
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  {summaryText}
                </Typography>
              </Box>

              {files.length > 0 ? (
                <List dense sx={{ maxHeight: 220, overflow: 'auto' }}>
                  {files.map((file) => (
                    <ListItem
                      key={`${file.name}_${file.lastModified}`}
                      secondaryAction={<Chip size="small" label={`${Math.round(file.size / 1024)} KB`} />}
                    >
                      <ListItemIcon>
                        <Description fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={file.name} />
                    </ListItem>
                  ))}
                </List>
              ) : null}

              {files.length > 0 ? (
                <TextField
                  label={t('dashboard.jobName')}
                  value={jobName}
                  onChange={(event) => setJobName(event.target.value)}
                  placeholder={t('dashboard.jobNamePlaceholder')}
                  helperText={t('dashboard.jobNameHelper')}
                  inputProps={{ maxLength: 80 }}
                  fullWidth
                />
              ) : null}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
                <Button
                  variant="contained"
                  disabled={files.length === 0 || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {t('dashboard.start')}
                </Button>
                <Button
                  variant="outlined"
                  disabled={files.length === 0 || mutation.isPending}
                  onClick={() => {
                    setFiles([])
                    setJobName('')
                  }}
                >
                  {t('common.clear')}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" mb={1.2}>
              {t('dashboard.recentJobs')}
            </Typography>
            {recentJobs.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                {t('history.empty')}
              </Typography>
            ) : (
              <Stack spacing={1}>
                {recentJobs.map((job) => (
                  <Stack
                    key={job.jobId}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    justifyContent="space-between"
                  >
                    <Stack spacing={0.4}>
                      <Typography variant="body2" fontWeight={700}>
                        {formatJobLabel(job)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(job.createdAt).toLocaleString()} {'\u2022'} {job.jobId.slice(0, 10)}
                      </Typography>
                    </Stack>
                    <Button component={RouterLink} to={`/app/jobs/${job.jobId}`} size="small">
                      {t('common.open')}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
