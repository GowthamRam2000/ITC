import { Launch } from '@mui/icons-material'
import {
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router-dom'

import { formatJobLabel, listJobHistory } from '../../services/api/jobHistory'

export function HistoryPage() {
  const { t } = useTranslation()
  const jobs = listJobHistory()

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
      <Typography variant="h4" mb={2.5}>
        {t('history.title')}
      </Typography>

      {jobs.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary">{t('history.empty')}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {jobs.map((job) => (
            <Card key={job.jobId}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Stack spacing={0.6}>
                    <Typography fontWeight={700}>{formatJobLabel(job)}</Typography>
                    <Typography color="text.secondary" variant="body2">
                      {new Date(job.createdAt).toLocaleString()} {'\u2022'} {job.jobId}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={job.status} color={job.status === 'COMPLETED' ? 'success' : 'default'} />
                    <Button
                      component={RouterLink}
                      to={`/app/jobs/${job.jobId}`}
                      size="small"
                      endIcon={<Launch fontSize="small" />}
                    >
                      {t('common.open')}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  )
}
