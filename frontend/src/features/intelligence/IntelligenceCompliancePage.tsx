import { useMemo } from 'react'
import { PlayCircle, StopCircle } from '@mui/icons-material'
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, Tooltip, Typography } from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getCircularImpact, getGstr3bSanity, getHsnSuggestions } from '../../services/api/jobs'
import type { HsnSuggestion } from '../../services/api/types'
import { formatCurrency, useIntelligenceShellContext } from './context'
import { InvoiceWorkbenchDrawer } from './InvoiceWorkbenchDrawer'
import { useInvoicePreview } from './useInvoicePreview'

export function IntelligenceCompliancePage() {
  const { t } = useTranslation()
  const { selectedJobId, hasJobContext, scope, setScope, contextLabel, playNarration, speakingBlock } =
    useIntelligenceShellContext()
  const isJobScope = scope === 'job'
  const invoicePreview = useInvoicePreview(selectedJobId)

  const gstr3bQuery = useQuery({
    queryKey: ['phase6', 'gstr3b', selectedJobId],
    queryFn: () => getGstr3bSanity(selectedJobId),
    enabled: hasJobContext && isJobScope,
  })

  const hsnQuery = useQuery({
    queryKey: ['phase6', 'hsn', selectedJobId],
    queryFn: () => getHsnSuggestions(selectedJobId),
    enabled: hasJobContext && isJobScope,
  })

  const circularQuery = useQuery({
    queryKey: ['phase6', 'circular', selectedJobId],
    queryFn: () => getCircularImpact(selectedJobId),
    enabled: hasJobContext && isJobScope,
  })

  const hsnColumns = useMemo<GridColDef<HsnSuggestion>[]>(
    () => [
      { field: 'invoice_no', headerName: t('intelligence.compliance.columns.invoice'), minWidth: 140, flex: 0.8 },
      {
        field: 'supplier_gstin',
        headerName: t('intelligence.compliance.columns.supplierGstin'),
        minWidth: 170,
        flex: 1,
        renderCell: (params) => (
          <Tooltip title={String(params.value ?? '')}>
            <Typography variant="body2" noWrap>{String(params.value ?? '')}</Typography>
          </Tooltip>
        ),
      },
      { field: 'current_hsn', headerName: t('intelligence.compliance.columns.currentHsn'), width: 95 },
      { field: 'gstr2b_hsn', headerName: t('intelligence.compliance.columns.twoBHsn'), width: 95 },
      { field: 'suggested_hsn', headerName: t('intelligence.compliance.columns.suggestedHsn'), width: 115 },
      {
        field: 'confidence',
        headerName: t('intelligence.compliance.columns.confidence'),
        width: 110,
        valueFormatter: (value) => `${Math.round(Number(value || 0) * 100)}%`,
      },
      {
        field: 'reason',
        headerName: t('intelligence.compliance.columns.reason'),
        minWidth: 240,
        flex: 1.4,
        renderCell: (params) => (
          <Tooltip title={String(params.value ?? '')}>
            <Typography variant="body2" sx={{ whiteSpace: 'normal', lineHeight: 1.35, py: 0.6 }}>
              {String(params.value ?? '')}
            </Typography>
          </Tooltip>
        ),
      },
    ],
    [t],
  )

  if (!hasJobContext) {
    return <Alert severity="warning">{t('intelligence.compliance.selectJobWarning')}</Alert>
  }
  if (!isJobScope) {
    return (
      <Alert severity="info" action={<Button size="small" onClick={() => setScope('job')}>Use Selected Job scope</Button>}>
        Return readiness insights are job-specific. Switch scope to Selected Job.
      </Alert>
    )
  }

  return (
    <>
      <Grid container spacing={1.5}>
      <Grid size={{ xs: 12, xl: 6 }}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="h6">{t('intelligence.compliance.gstrTitle')}</Typography>
                <Chip size="small" color="info" label={contextLabel} />
              </Stack>
              <Button
                size="small"
                variant={speakingBlock === 'gstr' ? 'outlined' : 'contained'}
                startIcon={speakingBlock === 'gstr' ? <StopCircle /> : <PlayCircle />}
                onClick={() => {
                  void playNarration('gstr', gstr3bQuery.data?.narration_text ?? '', 'summary', `Return Readiness • ${contextLabel}`)
                }}
                disabled={!gstr3bQuery.data?.narration_text}
              >
                {speakingBlock === 'gstr' ? t('intelligence.common.stop') : t('intelligence.common.narrate')}
              </Button>
            </Stack>

            {gstr3bQuery.isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void gstr3bQuery.refetch()}>Retry</Button>}
                sx={{ mb: 1 }}
              >
                Data unavailable for this job.
              </Alert>
            ) : null}

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" mb={1}>
              <Chip label={`${t('intelligence.compliance.expectedItc')}: ${formatCurrency(gstr3bQuery.data?.prefill.itc_expected ?? 0)}`} />
              <Chip label={`${t('intelligence.compliance.claimedItc')}: ${formatCurrency(gstr3bQuery.data?.prefill.itc_claimed ?? 0)}`} />
              <Chip label={`${t('intelligence.compliance.blockedItc')}: ${formatCurrency(gstr3bQuery.data?.prefill.blocked_itc ?? 0)}`} color="warning" />
            </Stack>

            <Stack spacing={1}>
              {gstr3bQuery.data?.exceptions.map((entry) => (
                <Alert key={entry.code} severity={entry.severity === 'CRITICAL' ? 'error' : 'warning'}>
                  <strong>{entry.code}</strong>: {entry.message} | Expected {formatCurrency(entry.expected)} vs Claimed{' '}
                  {formatCurrency(entry.claimed)}
                </Alert>
              ))}
              {gstr3bQuery.data?.exceptions.length === 0 ? (
                <Alert severity="success">{t('intelligence.compliance.noExceptions')}</Alert>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, xl: 6 }}>
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="h6">{t('intelligence.compliance.circularTitle')}</Typography>
              {circularQuery.isError ? (
                <Alert
                  severity="error"
                  action={<Button color="inherit" size="small" onClick={() => void circularQuery.refetch()}>Retry</Button>}
                >
                  Circular mapping is unavailable for this job.
                </Alert>
              ) : null}
              {(circularQuery.data?.relevant_circulars ?? []).map((item) => (
                <Alert key={item.id} severity={item.impact.toLowerCase().startsWith('high') ? 'warning' : 'info'}>
                  <strong>{item.title}</strong> ({item.id}) - {item.summary}
                </Alert>
              ))}
              {(circularQuery.data?.relevant_circulars ?? []).length === 0 ? (
                <Alert severity="success">{t('intelligence.compliance.noCircularImpact')}</Alert>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12 }}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6">{t('intelligence.compliance.hsnTitle')}</Typography>
              <Chip size="small" label={`${t('intelligence.common.rows')}: ${hsnQuery.data?.suggestions.length ?? 0}`} />
            </Stack>
            {hsnQuery.isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void hsnQuery.refetch()}>Retry</Button>}
                sx={{ mb: 1 }}
              >
                Data unavailable for this job.
              </Alert>
            ) : null}
            {!hsnQuery.isError && (hsnQuery.data?.suggestions.length ?? 0) === 0 ? (
              <Alert severity="info" sx={{ mb: 1 }}>
                No HSN mismatch suggestions for this job.
              </Alert>
            ) : null}
            <Box sx={{ height: 360 }}>
              <DataGrid
                rows={hsnQuery.data?.suggestions ?? []}
                columns={hsnColumns}
                getRowId={(row) => `${row.invoice_id}_${row.suggested_hsn}`}
                disableRowSelectionOnClick
                onRowClick={(params) => {
                  const row = params.row as HsnSuggestion
                  invoicePreview.openForInvoice(row.invoice_id)
                }}
                density="compact"
                getRowHeight={() => 'auto'}
                localeText={{ noRowsLabel: t('intelligence.common.noRows') }}
                pageSizeOptions={[5, 10, 25]}
                initialState={{ pagination: { paginationModel: { page: 0, pageSize: 8 } } }}
                sx={{
                  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
                  '& .MuiDataGrid-cell': { alignItems: 'flex-start', py: 0.5 },
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
