import { useMemo, useState, type ReactNode } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Container,
  Drawer,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useQuery } from '@tanstack/react-query'
import {
  ErrorOutline,
  ExpandMore,
  ReceiptLong,
  WarningAmber,
  Rule,
  Business,
  AutoAwesome,
} from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import type { MismatchIssue, Severity } from '../../services/api/types'
import { MotionDiv } from '../../components/common/MotionDiv'
import { ReportExportCard } from '../reports/ReportExportCard'
import { getJobResults } from '../../services/api/jobs'
import { DocumentAuditViewer } from './DocumentAuditViewer'

type QuickFilter = 'all' | 'critical' | 'missing_in_2b' | 'gstin_status_risk' | 'hsn_mismatch'

function severityColor(severity: Severity): 'error' | 'warning' | 'info' {
  if (severity === 'CRITICAL') {
    return 'error'
  }
  if (severity === 'WARNING') {
    return 'warning'
  }
  return 'info'
}

function issueCodeLabel(issue: string) {
  return issue.replaceAll('_', ' ')
}

export function ResultsPage() {
  const { t } = useTranslation()
  const { jobId = '' } = useParams()
  const [severity, setSeverity] = useState<'ALL' | Severity>('ALL')
  const [minRisk, setMinRisk] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [selectedIssue, setSelectedIssue] = useState<MismatchIssue | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['job-result', jobId],
    queryFn: () => getJobResults(jobId),
    enabled: Boolean(jobId),
  })

  const filteredIssues = useMemo(() => {
    if (!data) {
      return []
    }

    const min = Number(minRisk || '0')
    return data.issues.filter((issue) => {
      const severityPass = severity === 'ALL' ? true : issue.severity === severity
      const riskPass = Number.isNaN(min) ? true : issue.amount_at_risk >= min
      const quickPass =
        quickFilter === 'all'
          ? true
          : quickFilter === 'critical'
            ? issue.severity === 'CRITICAL'
            : issue.issue_code === quickFilter
      return severityPass && riskPass && quickPass
    })
  }, [data, minRisk, quickFilter, severity])

  const columns = useMemo<GridColDef<MismatchIssue>[]>(
    () => [
      {
        field: 'severity',
        headerName: t('results.severity'),
        width: 138,
        renderCell: (params) => (
          <Chip size="small" label={String(params.value)} color={severityColor(params.value as Severity)} />
        ),
      },
      { field: 'invoice_no', headerName: t('results.invoiceNo'), minWidth: 150, flex: 0.9 },
      { field: 'supplier_gstin', headerName: t('results.supplier'), minWidth: 180, flex: 1 },
      {
        field: 'issue_code',
        headerName: t('results.issueCode'),
        minWidth: 150,
        flex: 0.8,
        renderCell: (params) => issueCodeLabel(String(params.value)),
      },
      {
        field: 'amount_at_risk',
        headerName: t('results.itcAtRisk'),
        width: 160,
        valueFormatter: (value) => `₹${Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      },
      {
        field: 'suggested_action',
        headerName: t('results.suggestedAction'),
        minWidth: 320,
        flex: 1.7,
        renderCell: (params) => (
          <Typography variant="body2" sx={{ whiteSpace: 'normal', lineHeight: 1.4, py: 0.6 }}>
            {String(params.value)}
          </Typography>
        ),
      },
    ],
    [t],
  )

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography>{t('common.loading')}</Typography>
      </Container>
    )
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error instanceof Error ? error.message : 'Failed to load results.'}</Alert>
      </Container>
    )
  }

  if (!data) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="warning">Result not available for this job.</Alert>
      </Container>
    )
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 3.5 } }}>
      <Stack spacing={1.8}>
        <Typography variant="h4">{t('results.title')}</Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <MetricCard title={t('results.totalInvoices')} value={String(data.summary.total_invoices)} />
          <MetricCard title={t('results.matchedPct')} value={`${data.summary.matched_pct.toFixed(1)}%`} />
          <MetricCard
            title={t('results.critical')}
            value={String(data.summary.critical_count)}
            icon={<ErrorOutline color="error" fontSize="small" />}
          />
          <MetricCard
            title={t('results.warnings')}
            value={String(data.summary.warning_count)}
            icon={<WarningAmber color="warning" fontSize="small" />}
          />
          <MetricCard
            title={t('results.itcAtRisk')}
            value={`₹${data.summary.total_itc_at_risk.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          />
        </Stack>

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems="stretch">
          <Stack spacing={1.5} flex={1.25} minWidth={0}>
            <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" mb={1.2}>
                    <Chip
                      color={quickFilter === 'all' ? 'primary' : 'default'}
                      size="small"
                      label={t('results.all')}
                      onClick={() => setQuickFilter('all')}
                    />
                    <Chip
                      color={quickFilter === 'critical' ? 'error' : 'default'}
                      size="small"
                      icon={<WarningAmber sx={{ fontSize: 16 }} />}
                      label={t('results.criticalOnly')}
                      onClick={() => setQuickFilter('critical')}
                    />
                    <Chip
                      color={quickFilter === 'missing_in_2b' ? 'warning' : 'default'}
                      size="small"
                      icon={<ReceiptLong sx={{ fontSize: 16 }} />}
                      label={t('results.missingIn2b')}
                      onClick={() => setQuickFilter('missing_in_2b')}
                    />
                    <Chip
                      color={quickFilter === 'gstin_status_risk' ? 'warning' : 'default'}
                      size="small"
                      icon={<Business sx={{ fontSize: 16 }} />}
                      label={t('results.inactiveGstin')}
                      onClick={() => setQuickFilter('gstin_status_risk')}
                    />
                    <Chip
                      color={quickFilter === 'hsn_mismatch' ? 'warning' : 'default'}
                      size="small"
                      icon={<Rule sx={{ fontSize: 16 }} />}
                      label={t('results.hsnMismatch')}
                      onClick={() => setQuickFilter('hsn_mismatch')}
                    />
                  </Stack>

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} mb={1.2}>
                    <FormControl>
                      <InputLabel>{t('results.severity')}</InputLabel>
                      <Select
                        label={t('results.severity')}
                        value={severity}
                        onChange={(event) => setSeverity(event.target.value as 'ALL' | Severity)}
                      >
                        <MenuItem value="ALL">{t('results.all')}</MenuItem>
                        <MenuItem value="CRITICAL">CRITICAL</MenuItem>
                        <MenuItem value="WARNING">WARNING</MenuItem>
                        <MenuItem value="INFO">INFO</MenuItem>
                      </Select>
                    </FormControl>

                    <TextField
                      label={t('results.minRisk')}
                      value={minRisk}
                      onChange={(event) => setMinRisk(event.target.value)}
                      type="number"
                    />
                  </Stack>

                  <Box sx={{ height: 460 }}>
                    <DataGrid
                      rows={filteredIssues}
                      columns={columns}
                      getRowId={(row) => `${row.invoice_id}_${row.issue_code}`}
                      getRowHeight={() => 'auto'}
                      disableRowSelectionOnClick
                      pageSizeOptions={[10, 20, 50]}
                      onRowClick={(params) => setSelectedIssue(params.row as MismatchIssue)}
                      initialState={{ pagination: { paginationModel: { page: 0, pageSize: 10 } } }}
                      sx={{
                        '& .MuiDataGrid-cell': {
                          alignItems: 'flex-start',
                          py: 1,
                        },
                        '& .MuiDataGrid-columnHeaderTitle': {
                          fontWeight: 700,
                        },
                      }}
                    />
                  </Box>

                  {filteredIssues.length === 0 ? (
                    <Typography mt={0.8} color="text.secondary" variant="body2">
                      {t('results.empty')}
                    </Typography>
                  ) : null}
                </CardContent>
              </Card>
            </MotionDiv>

            <Accordion disableGutters>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography fontWeight={600}>{t('results.technicalTrace')}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={0.4}>
                  {data.notes.map((note) => (
                    <Typography key={note} variant="body2" color="text.secondary">
                      - {note}
                    </Typography>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Stack>

          <Stack spacing={1.5} flex={0.88} minWidth={{ xs: '100%', lg: 360 }}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center">
                  <AutoAwesome color="primary" />
                  <Box>
                    <Typography fontWeight={700}>{t('assistant.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('assistant.fabHint')}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
            <ReportExportCard jobId={jobId} />
          </Stack>
        </Stack>
      </Stack>

      <Drawer anchor="right" open={Boolean(selectedIssue)} onClose={() => setSelectedIssue(null)}>
        <Box sx={{ width: { xs: 360, sm: 520 }, p: 2 }}>
          <Typography variant="h6" mb={1}>
            {t('results.openDetails')}
          </Typography>
          {selectedIssue ? (
            <Stack spacing={1}>
              <Typography variant="body2"><strong>{t('results.invoiceNo')}:</strong> {selectedIssue.invoice_no}</Typography>
              <Typography variant="body2"><strong>{t('results.supplier')}:</strong> {selectedIssue.supplier_gstin}</Typography>
              <Typography variant="body2"><strong>{t('results.issueCode')}:</strong> {issueCodeLabel(selectedIssue.issue_code)}</Typography>
              <Typography variant="body2"><strong>{t('results.itcAtRisk')}:</strong> ₹{selectedIssue.amount_at_risk.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Typography>
              <Typography variant="body2"><strong>{t('results.suggestedAction')}:</strong> {selectedIssue.suggested_action}</Typography>
              <Typography variant="subtitle2" mt={1}>Evidence</Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: 'background.default',
                  overflow: 'auto',
                  fontSize: 12,
                  maxHeight: 220,
                }}
              >
                {JSON.stringify(selectedIssue.evidence, null, 2)}
              </Box>
              <DocumentAuditViewer jobId={jobId} issue={selectedIssue} />
            </Stack>
          ) : null}
        </Box>
      </Drawer>
    </Container>
  )
}

interface MetricCardProps {
  title: string
  value: string
  icon?: ReactNode
}

function MetricCard({ title, value, icon }: MetricCardProps) {
  return (
    <Card sx={{ flex: 1 }}>
      <CardContent sx={{ py: 1.1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.8}>
          <Typography variant="caption" color="text.secondary">
            {title}
          </Typography>
          {icon ?? null}
        </Stack>
        <Typography variant="h5" mt={0.35}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  )
}
