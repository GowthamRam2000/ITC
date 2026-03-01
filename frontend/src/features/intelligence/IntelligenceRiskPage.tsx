import { useMemo, useState } from 'react'
import { PlayCircle, StopCircle } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Chip, Grid, Slider, Stack, Tooltip, Typography, Alert } from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getAnomalyHighlights, getCashflowSimulator, getSlaAnalytics } from '../../services/api/jobs'
import type { AnomalyItem, SupplierSlaItem } from '../../services/api/types'
import { formatCurrency, severityColor, useIntelligenceShellContext } from './context'
import { InvoiceWorkbenchDrawer } from './InvoiceWorkbenchDrawer'
import { useInvoicePreview } from './useInvoicePreview'

export function IntelligenceRiskPage() {
  const { t } = useTranslation()
  const { selectedJobId, hasJobContext, scope, setScope, contextLabel, playNarration, speakingBlock } =
    useIntelligenceShellContext()
  const isJobScope = scope === 'job'
  const invoicePreview = useInvoicePreview(selectedJobId)
  const [annualInterestPct, setAnnualInterestPct] = useState(14)

  const anomalyQuery = useQuery({
    queryKey: ['phase6', 'anomalies', selectedJobId],
    queryFn: () => getAnomalyHighlights(selectedJobId),
    enabled: hasJobContext && isJobScope,
  })

  const cashflowQuery = useQuery({
    queryKey: ['phase6', 'cashflow', selectedJobId, annualInterestPct],
    queryFn: () => getCashflowSimulator(selectedJobId, annualInterestPct),
    enabled: hasJobContext && isJobScope,
  })

  const slaQuery = useQuery({
    queryKey: ['phase6', 'sla', scope, selectedJobId],
    queryFn: () => getSlaAnalytics(isJobScope ? selectedJobId : undefined),
    enabled: scope === 'all' || hasJobContext,
  })

  const anomalyColumns = useMemo<GridColDef<AnomalyItem>[]>(
    () => [
      {
        field: 'type',
        headerName: t('intelligence.risk.columns.type'),
        minWidth: 140,
        flex: 0.9,
        renderCell: (params) => (
          <Tooltip title={String(params.value ?? '')}>
            <Typography variant="body2" noWrap>{String(params.value ?? '').replaceAll('_', ' ')}</Typography>
          </Tooltip>
        ),
      },
      {
        field: 'severity',
        headerName: t('intelligence.risk.columns.severity'),
        width: 132,
        renderCell: (params) => (
          <Chip size="small" label={String(params.value)} color={severityColor(String(params.value))} />
        ),
      },
      {
        field: 'supplier_gstin',
        headerName: t('intelligence.risk.columns.supplierGstin'),
        minWidth: 170,
        flex: 1,
        renderCell: (params) => (
          <Tooltip title={String(params.value ?? '')}>
            <Typography variant="body2" noWrap>{String(params.value ?? '')}</Typography>
          </Tooltip>
        ),
      },
      { field: 'invoice_no', headerName: t('intelligence.risk.columns.invoice'), minWidth: 140, flex: 0.9 },
      {
        field: 'amount',
        headerName: t('intelligence.risk.columns.amount'),
        width: 125,
        valueFormatter: (value) => formatCurrency(Number(value || 0)),
      },
    ],
    [t],
  )

  const slaColumns = useMemo<GridColDef<SupplierSlaItem>[]>(
    () => [
      {
        field: 'supplier_gstin',
        headerName: t('intelligence.risk.columns.supplierGstin'),
        minWidth: 180,
        flex: 1,
        renderCell: (params) => (
          <Tooltip title={String(params.value ?? '')}>
            <Typography variant="body2" noWrap>{String(params.value ?? '')}</Typography>
          </Tooltip>
        ),
      },
      { field: 'total_tickets', headerName: t('intelligence.risk.columns.tickets'), width: 84 },
      { field: 'critical_tickets', headerName: t('intelligence.risk.columns.critical'), width: 88 },
      { field: 'synthetic_avg_resolution_days', headerName: t('intelligence.risk.columns.avgResolveDays'), width: 112 },
      {
        field: 'sla_breach_pct',
        headerName: t('intelligence.risk.columns.slaBreach'),
        width: 96,
        valueFormatter: (value) => `${Number(value || 0).toFixed(1)}%`,
      },
      {
        field: 'compliance_score',
        headerName: t('intelligence.risk.columns.complianceScore'),
        width: 100,
        valueFormatter: (value) => Number(value || 0).toFixed(1),
      },
    ],
    [t],
  )

  if (!hasJobContext) {
    return <Alert severity="warning">{t('intelligence.risk.selectJobWarning')}</Alert>
  }

  return (
    <>
    <Grid container spacing={1.5}>
      <Grid size={{ xs: 12, xl: 6 }}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="h6">{t('intelligence.risk.anomalyTitle')}</Typography>
                <Chip size="small" color="info" label={contextLabel} />
              </Stack>
              <Button
                size="small"
                variant={speakingBlock === 'anomaly' ? 'outlined' : 'contained'}
                startIcon={speakingBlock === 'anomaly' ? <StopCircle /> : <PlayCircle />}
                onClick={() => {
                  void playNarration('anomaly', anomalyQuery.data?.narration_text ?? '', 'summary', `Fraud & Risk Triage • ${contextLabel}`)
                }}
                disabled={!anomalyQuery.data?.narration_text}
              >
                {speakingBlock === 'anomaly' ? t('intelligence.common.stop') : t('intelligence.common.narrate')}
              </Button>
            </Stack>
            {!isJobScope ? (
              <Alert severity="info" action={<Button size="small" onClick={() => setScope('job')}>Use Selected Job scope</Button>} sx={{ mb: 1 }}>
                Anomaly triage needs a selected job context.
              </Alert>
            ) : null}
            {isJobScope && anomalyQuery.isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void anomalyQuery.refetch()}>Retry</Button>}
                sx={{ mb: 1 }}
              >
                Data unavailable for this job.
              </Alert>
            ) : null}
            {isJobScope && !anomalyQuery.isError && (anomalyQuery.data?.anomalies.length ?? 0) === 0 ? (
              <Alert severity="info" sx={{ mb: 1 }}>
                No anomalies found for this job. Use Results page for full mismatch list.
              </Alert>
            ) : null}
            <Box sx={{ height: 360 }}>
              <DataGrid
                rows={anomalyQuery.data?.anomalies ?? []}
                columns={anomalyColumns}
                getRowId={(row) =>
                  `${row.type}_${row.supplier_gstin}_${row.invoice_no}_${Number(row.amount || 0).toFixed(2)}`
                }
                disableRowSelectionOnClick
                onRowClick={(params) => {
                  const row = params.row as AnomalyItem
                  invoicePreview.openForInvoice(row.invoice_id || row.invoice_no)
                }}
                density="compact"
                localeText={{ noRowsLabel: t('intelligence.common.noRows') }}
                pageSizeOptions={[5, 10, 20]}
                initialState={{ pagination: { paginationModel: { page: 0, pageSize: 8 } } }}
                sx={{
                  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
                }}
              />
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, xl: 6 }}>
        <Card>
          <CardContent>
            <Stack spacing={1.2}>
              <Typography variant="h6">{t('intelligence.risk.cashflowTitle')}</Typography>
              {!isJobScope ? (
                <Alert severity="info" action={<Button size="small" onClick={() => setScope('job')}>Use Selected Job scope</Button>}>
                  Cash-flow simulation is computed per selected job.
                </Alert>
              ) : null}
              {isJobScope && cashflowQuery.isError ? (
                <Alert
                  severity="error"
                  action={<Button color="inherit" size="small" onClick={() => void cashflowQuery.refetch()}>Retry</Button>}
                >
                  Cash-flow data unavailable for this job.
                </Alert>
              ) : null}

              <Box sx={{ px: 1 }}>
                <Typography variant="body2" color="text.secondary" mb={0.6}>
                  {t('intelligence.risk.annualInterest')}
                </Typography>
                <Slider
                  min={8}
                  max={30}
                  step={0.5}
                  value={annualInterestPct}
                  onChange={(_, value) => setAnnualInterestPct(value as number)}
                  valueLabelDisplay="on"
                />
              </Box>

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label={`${t('intelligence.risk.blockedItc')}: ${formatCurrency(cashflowQuery.data?.blocked_itc ?? 0)}`} color="warning" />
                <Chip label={`${t('intelligence.risk.monthly')}: ${formatCurrency(cashflowQuery.data?.monthly_financing_cost ?? 0)}`} />
                <Chip label={`${t('intelligence.risk.quarter')}: ${formatCurrency(cashflowQuery.data?.quarter_financing_cost ?? 0)}`} />
                <Chip label={`${t('intelligence.risk.annual')}: ${formatCurrency(cashflowQuery.data?.annual_financing_cost ?? 0)}`} />
                <Chip label={`${t('intelligence.risk.wcStress')}: ${(cashflowQuery.data?.working_capital_stress_pct ?? 0).toFixed(2)}%`} color="error" />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12 }}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6">{t('intelligence.risk.slaTitle')}</Typography>
              <Chip size="small" label={`${t('intelligence.portfolio.suppliers')}: ${slaQuery.data?.suppliers.length ?? 0}`} />
            </Stack>
            {slaQuery.isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void slaQuery.refetch()}>Retry</Button>}
                sx={{ mb: 1 }}
              >
                Data unavailable for current scope.
              </Alert>
            ) : null}
            <Box sx={{ height: 360 }}>
              <DataGrid
                rows={slaQuery.data?.suppliers ?? []}
                columns={slaColumns}
                getRowId={(row) => row.supplier_gstin}
                disableRowSelectionOnClick
                density="compact"
                localeText={{ noRowsLabel: t('intelligence.common.noRows') }}
                pageSizeOptions={[5, 10, 25]}
                initialState={{ pagination: { paginationModel: { page: 0, pageSize: 10 } } }}
                sx={{
                  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
                }}
              />
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
    <InvoiceWorkbenchDrawer
      open={invoicePreview.open}
      onClose={invoicePreview.close}
      loading={invoicePreview.query.isLoading}
      error={invoicePreview.query.isError ? (invoicePreview.query.error as Error)?.message ?? 'Failed to load invoice preview.' : ''}
      data={invoicePreview.query.data}
    />
    </>
  )
}
