import { useState } from 'react'
import { Download } from '@mui/icons-material'
import {
  Alert,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'

import { getApiBaseUrl } from '../../services/api/client'
import { exportReport } from '../../services/api/jobs'

interface ReportExportCardProps {
  jobId: string
}

export function ReportExportCard({ jobId }: ReportExportCardProps) {
  const { t } = useTranslation()
  const [reportReady, setReportReady] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const triggerDownload = () => {
    const link = document.createElement('a')
    link.href = `${getApiBaseUrl()}/v1/reports/${jobId}/download`
    link.download = `gst-itc-report-${jobId}.pdf`
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleExport = async () => {
    setPending(true)
    setError('')
    try {
      await exportReport(jobId)
      setReportReady(true)
      triggerDownload()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Report export failed.')
      setReportReady(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h6">{t('report.title')}</Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Button variant="contained" startIcon={<Download />} onClick={handleExport} disabled={pending}>
            {t('report.export')}
          </Button>

          {reportReady ? (
            <>
              <Alert severity="success">{t('report.downloaded')}</Alert>
              <Button variant="outlined" startIcon={<Download />} onClick={triggerDownload}>
                {t('report.downloadAgain')}
              </Button>
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  )
}
