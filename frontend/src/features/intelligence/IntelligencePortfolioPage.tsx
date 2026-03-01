import { Alert, Chip, Grid, Card, CardContent, Stack, Typography, Box, Tooltip, Button } from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getDeltaDigest, getPortfolioOverview, getWatchlist } from '../../services/api/jobs'
import type { PortfolioEntityRow, WatchlistItem } from '../../services/api/types'
import { formatCurrency, useIntelligenceShellContext } from './context'
import { InvoiceWorkbenchDrawer } from './InvoiceWorkbenchDrawer'
import { useInvoicePreview } from './useInvoicePreview'

export function IntelligencePortfolioPage() {
  const { t } = useTranslation()
  const { scope, selectedJobId, contextLabel, setScope } = useIntelligenceShellContext()
  const invoicePreview = useInvoicePreview(selectedJobId)
  const portfolioQuery = useQuery({
    queryKey: ['phase6', 'portfolio', scope, selectedJobId],
    queryFn: () => getPortfolioOverview(scope === 'job' ? selectedJobId : undefined),
    enabled: scope === 'all' || Boolean(selectedJobId),
  })

  const watchlistQuery = useQuery({
    queryKey: ['phase6', 'watchlist', scope, selectedJobId],
    queryFn: () => getWatchlist(scope === 'job' ? selectedJobId : undefined),
    enabled: scope === 'all' || Boolean(selectedJobId),
  })

  const deltaQuery = useQuery({
    queryKey: ['phase6', 'delta'],
    queryFn: getDeltaDigest,
  })

  const entityColumns = useMemo<GridColDef<PortfolioEntityRow>[]>(
    () => [
      {
        field: 'entity_gstin',
        headerName: t('intelligence.portfolio.columns.entityGstin'),
        minWidth: 170,
        flex: 1.1,
        renderCell: (params) => (
          <Tooltip title={String(params.value ?? '')}>
            <Typography variant="body2" noWrap>{String(params.value ?? '')}</Typography>
          </Tooltip>
        ),
      },
      { field: 'invoice_count', headerName: t('intelligence.portfolio.columns.invoices'), width: 100 },
      {
        field: 'taxable_value',
        headerName: t('intelligence.portfolio.columns.taxableValue'),
        width: 160,
        valueFormatter: (value) => formatCurrency(Number(value || 0)),
      },
      {
        field: 'itc_at_risk',
        headerName: t('intelligence.portfolio.columns.itcAtRisk'),
        width: 150,
        valueFormatter: (value) => formatCurrency(Number(value || 0)),
      },
      {
        field: 'risk_badge',
        headerName: t('intelligence.portfolio.columns.risk'),
        width: 126,
        renderCell: (params) => (
          <Chip
            size="small"
            color={params.value === 'HIGH' ? 'error' : params.value === 'MEDIUM' ? 'warning' : 'success'}
            label={String(params.value)}
          />
        ),
      },
    ],
    [t],
  )

  const watchlistColumns = useMemo<GridColDef<WatchlistItem>[]>(
    () => [
      {
        field: 'supplier_gstin',
        headerName: t('intelligence.portfolio.columns.supplierGstin'),
        minWidth: 180,
        flex: 1.1,
        renderCell: (params) => (
          <Tooltip title={String(params.value ?? '')}>
            <Typography variant="body2" noWrap>{String(params.value ?? '')}</Typography>
          </Tooltip>
        ),
      },
      { field: 'critical_count', headerName: t('intelligence.portfolio.columns.critical'), width: 88 },
      { field: 'warning_count', headerName: t('intelligence.portfolio.columns.warnings'), width: 88 },
      {
        field: 'itc_risk',
        headerName: t('intelligence.portfolio.columns.itcRisk'),
        width: 135,
        valueFormatter: (value) => formatCurrency(Number(value || 0)),
      },
      {
        field: 'risk_badge',
        headerName: t('intelligence.portfolio.columns.badge'),
        width: 126,
        renderCell: (params) => (
          <Chip
            size="small"
            color={params.value === 'HIGH' ? 'error' : params.value === 'MEDIUM' ? 'warning' : 'success'}
            label={String(params.value)}
          />
        ),
      },
      {
        field: 'latest_issue',
        headerName: t('intelligence.portfolio.columns.latestIssue'),
        minWidth: 170,
        flex: 1,
        renderCell: (params) => {
          const value = String(params.value ?? '').replaceAll('_', ' ')
          return (
            <Tooltip title={value}>
              <Typography variant="body2" noWrap>{value}</Typography>
            </Tooltip>
          )
        },
      },
    ],
    [t],
  )

  return (
    <Grid container spacing={1.5}>
      <Grid size={{ xs: 12, xl: 7 }}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="h6">{t('intelligence.portfolio.title')}</Typography>
                <Chip size="small" color="info" label={contextLabel} />
              </Stack>
              <Chip size="small" color="primary" label={`${t('intelligence.portfolio.jobs')}: ${portfolioQuery.data?.jobs_covered ?? 0}`} />
            </Stack>
            {portfolioQuery.isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void portfolioQuery.refetch()}>Retry</Button>}
              >
                Failed to load portfolio summary.
              </Alert>
            ) : null}
            <Box sx={{ height: 360 }}>
              <DataGrid
                rows={portfolioQuery.data?.entities ?? []}
                columns={entityColumns}
                getRowId={(row) => row.entity_gstin}
                disableRowSelectionOnClick
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

      <Grid size={{ xs: 12, xl: 5 }}>
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">{t('intelligence.portfolio.deltaTitle')}</Typography>
                <Chip
                  size="small"
                  color={deltaQuery.data?.direction === 'improved' ? 'success' : 'warning'}
                  label={(deltaQuery.data?.direction ?? 'n/a').toUpperCase()}
                />
              </Stack>
              {scope === 'job' ? (
                <Alert
                  severity="info"
                  action={<Button size="small" onClick={() => setScope('all')}>Use All Jobs scope</Button>}
                >
                  Delta digest compares filing cycles portfolio-wide.
                </Alert>
              ) : null}
              <Typography variant="body2" color="text.secondary">
                {deltaQuery.data?.message ?? t('intelligence.portfolio.loadingDelta')}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip
                  label={`${t('intelligence.portfolio.deltaCritical')}: ${Number(deltaQuery.data?.delta?.critical_count ?? 0) >= 0 ? '+' : ''}${Number(deltaQuery.data?.delta?.critical_count ?? 0)}`}
                  color={Number(deltaQuery.data?.delta?.critical_count ?? 0) <= 0 ? 'success' : 'warning'}
                />
                <Chip
                  label={`${t('intelligence.portfolio.deltaWarning')}: ${Number(deltaQuery.data?.delta?.warning_count ?? 0) >= 0 ? '+' : ''}${Number(deltaQuery.data?.delta?.warning_count ?? 0)}`}
                />
                <Chip
                  label={`${t('intelligence.portfolio.deltaRisk')}: ${formatCurrency(Number(deltaQuery.data?.delta?.total_itc_at_risk ?? 0))}`}
                  color={Number(deltaQuery.data?.delta?.total_itc_at_risk ?? 0) <= 0 ? 'success' : 'error'}
                />
                <Chip
                  label={`${t('intelligence.portfolio.deltaMatched')}: ${Number(deltaQuery.data?.delta?.matched_pct ?? 0).toFixed(2)}%`}
                  color="info"
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12 }}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6">{t('intelligence.portfolio.watchlistTitle')}</Typography>
              <Chip size="small" label={`${t('intelligence.portfolio.suppliers')}: ${watchlistQuery.data?.watchlist.length ?? 0}`} />
            </Stack>
            {watchlistQuery.isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void watchlistQuery.refetch()}>Retry</Button>}
                sx={{ mb: 1 }}
              >
                Data unavailable for current scope.
              </Alert>
            ) : null}
            {!watchlistQuery.isError && (watchlistQuery.data?.watchlist.length ?? 0) === 0 ? (
              <Alert
                severity="info"
                action={scope === 'job' ? <Button size="small" onClick={() => setScope('all')}>Use All Jobs scope</Button> : undefined}
                sx={{ mb: 1 }}
              >
                {scope === 'job'
                  ? 'No supplier watchlist data for selected job.'
                  : 'No supplier watchlist data is available yet.'}
              </Alert>
            ) : null}
            <Box sx={{ height: 360 }}>
              <DataGrid
                rows={watchlistQuery.data?.watchlist ?? []}
                columns={watchlistColumns}
                getRowId={(row) => row.supplier_gstin}
                disableRowSelectionOnClick
                onRowClick={(params) => {
                  const row = params.row as WatchlistItem
                  const invoiceId = row.latest_invoice_id || row.latest_invoice_no || ''
                  const rowJobId = row.latest_job_id || selectedJobId
                  if (invoiceId && rowJobId) {
                    invoicePreview.openForInvoice(invoiceId, rowJobId)
                  }
                }}
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
      <InvoiceWorkbenchDrawer
        open={invoicePreview.open}
        onClose={invoicePreview.close}
        loading={invoicePreview.query.isLoading}
        error={invoicePreview.query.isError ? (invoicePreview.query.error as Error)?.message ?? 'Failed to load invoice preview.' : ''}
        data={invoicePreview.query.data}
      />
    </Grid>
  )
}
