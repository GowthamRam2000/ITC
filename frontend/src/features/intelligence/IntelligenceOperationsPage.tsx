import { useMemo, useState } from 'react'
import { Groups, PlayCircle, StopCircle } from '@mui/icons-material'
import { Alert, Box, Button, Card, CardContent, Chip, FormControl, Grid, InputLabel, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getEvidencePack, getRoleInbox } from '../../services/api/jobs'
import type { InboxTask } from '../../services/api/types'
import { formatCurrency, severityColor, useIntelligenceShellContext } from './context'
import { formatJobLabel, getJobName } from '../../services/api/jobHistory'
import { InvoiceWorkbenchDrawer } from './InvoiceWorkbenchDrawer'
import { useInvoicePreview } from './useInvoicePreview'

export function IntelligenceOperationsPage() {
  const { t } = useTranslation()
  const { selectedJobId, hasJobContext, scope, setScope, contextLabel, playNarration, speakingBlock } =
    useIntelligenceShellContext()
  const isJobScope = scope === 'job'
  const [role, setRole] = useState<'manager' | 'team'>('manager')
  const [focusedTask, setFocusedTask] = useState<InboxTask | null>(null)
  const invoicePreview = useInvoicePreview(selectedJobId)

  const inboxQuery = useQuery({
    queryKey: ['phase6', 'inbox', role, scope, selectedJobId],
    queryFn: () => getRoleInbox(role, isJobScope ? selectedJobId : undefined),
    enabled: scope === 'all' || hasJobContext,
  })

  const evidenceQuery = useQuery({
    queryKey: ['phase6', 'evidence', selectedJobId, scope],
    queryFn: () => getEvidencePack(selectedJobId),
    enabled: hasJobContext && isJobScope,
  })

  const inboxColumns = useMemo<GridColDef<InboxTask>[]>(
    () => [
      {
        field: 'job_id',
        headerName: t('intelligence.operations.columns.job'),
        minWidth: 150,
        flex: 0.9,
        renderCell: (params) => {
          const value = String(params.value ?? '')
          const label = formatJobLabel({ jobId: value, jobName: getJobName(value) })
          return (
            <Tooltip title={value}>
              <Typography variant="body2" noWrap>{label}</Typography>
            </Tooltip>
          )
        },
      },
      { field: 'invoice_no', headerName: t('intelligence.operations.columns.invoice'), minWidth: 125, flex: 0.8 },
      {
        field: 'supplier_gstin',
        headerName: t('intelligence.operations.columns.supplierGstin'),
        minWidth: 170,
        flex: 1,
        renderCell: (params) => (
          <Tooltip title={String(params.value ?? '')}>
            <Typography variant="body2" noWrap>{String(params.value ?? '')}</Typography>
          </Tooltip>
        ),
      },
      {
        field: 'severity',
        headerName: t('intelligence.operations.columns.severity'),
        width: 132,
        renderCell: (params) => <Chip size="small" color={severityColor(String(params.value))} label={String(params.value)} />,
      },
      {
        field: 'amount_at_risk',
        headerName: t('intelligence.operations.columns.atRisk'),
        width: 126,
        valueFormatter: (value) => formatCurrency(Number(value || 0)),
      },
      { field: 'assignee', headerName: t('intelligence.operations.columns.assignee'), minWidth: 130, flex: 0.8 },
      { field: 'due_in_days', headerName: t('intelligence.operations.columns.dueDays'), width: 86 },
      {
        field: 'action',
        headerName: t('common.action'),
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

  return (
    <>
    <Grid container spacing={1.5}>
      <Grid size={{ xs: 12, xl: 7 }}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6">{t('intelligence.operations.inboxTitle')}</Typography>
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <InputLabel id="int-role-label">{t('intelligence.operations.roleView')}</InputLabel>
                <Select
                  labelId="int-role-label"
                  label={t('intelligence.operations.roleView')}
                  value={role}
                  onChange={(event) => setRole(event.target.value as 'manager' | 'team')}
                >
                  <MenuItem value="manager">{t('intelligence.operations.roleManager')}</MenuItem>
                  <MenuItem value="team">{t('intelligence.operations.roleTeam')}</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            {inboxQuery.isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void inboxQuery.refetch()}>Retry</Button>}
                sx={{ mb: 1 }}
              >
                Data unavailable for current scope.
              </Alert>
            ) : null}
            {!inboxQuery.isError && (inboxQuery.data?.tasks.length ?? 0) === 0 ? (
              <Alert severity="info" sx={{ mb: 1 }}>
                {scope === 'job'
                  ? 'No action items for this job and role.'
                  : 'No action items available for this role.'}
              </Alert>
            ) : null}
            <Box sx={{ height: 360 }}>
              <DataGrid
                rows={inboxQuery.data?.tasks ?? []}
                columns={inboxColumns}
                getRowId={(row) =>
                  `${row.job_id}_${row.invoice_no}_${row.issue_code}_${Number(row.amount_at_risk || 0).toFixed(2)}`
                }
                disableRowSelectionOnClick
                onRowClick={(params) => {
                  const row = params.row as InboxTask
                  setFocusedTask(row)
                  if (row.invoice_id) {
                    invoicePreview.openForInvoice(row.invoice_id, row.job_id)
                    return
                  }
                  invoicePreview.openForInvoice(row.invoice_no, row.job_id)
                }}
                density="compact"
                getRowHeight={() => 'auto'}
                localeText={{ noRowsLabel: t('intelligence.common.noRows') }}
                pageSizeOptions={[5, 10, 20]}
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

      <Grid size={{ xs: 12, xl: 5 }}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="h6">{t('intelligence.operations.evidenceTitle')}</Typography>
                <Chip size="small" color="info" label={contextLabel} />
              </Stack>
              <Button
                size="small"
                variant={speakingBlock === 'evidence' ? 'outlined' : 'contained'}
                startIcon={speakingBlock === 'evidence' ? <StopCircle /> : <PlayCircle />}
                onClick={() => {
                  const focusedSummary =
                    focusedTask && focusedTask.invoice_no
                      ? `Focused action: ${focusedTask.invoice_no} • ${focusedTask.issue_code.replaceAll('_', ' ')} • ${formatCurrency(Number(focusedTask.amount_at_risk || 0))}. `
                      : ''
                  void playNarration(
                    'evidence',
                    `${focusedSummary}${evidenceQuery.data?.narration_text ?? ''}`,
                    'report',
                    focusedTask?.invoice_no
                      ? `Action Inbox • ${focusedTask.invoice_no}`
                      : `Action Inbox & Evidence • ${contextLabel}`,
                  )
                }}
                disabled={!evidenceQuery.data?.narration_text}
              >
                {speakingBlock === 'evidence' ? t('intelligence.common.stop') : t('intelligence.common.narrate')}
              </Button>
            </Stack>

            {!hasJobContext ? <Alert severity="warning">{t('intelligence.operations.selectJobWarning')}</Alert> : null}
            {scope !== 'job' ? (
              <Alert severity="info" action={<Button size="small" onClick={() => setScope('job')}>Use Selected Job scope</Button>} sx={{ mb: 1 }}>
                Evidence pack is generated for the selected job context.
              </Alert>
            ) : null}
            {scope === 'job' && evidenceQuery.isError ? (
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void evidenceQuery.refetch()}>Retry</Button>}
                sx={{ mb: 1 }}
              >
                Evidence data unavailable for this job.
              </Alert>
            ) : null}

            <Stack spacing={1}>
              <Chip color="primary" icon={<Groups />} label={`${t('common.actions')}: ${evidenceQuery.data?.actions.length ?? 0}`} />
              {(evidenceQuery.data?.actions ?? []).slice(0, 8).map((row) => (
                <Alert key={`${row.invoice_id}_${row.issue_code}`} severity={row.severity === 'CRITICAL' ? 'error' : 'warning'}>
                  <strong>{row.invoice_id}</strong> {'\u2022'} {row.issue_code.replaceAll('_', ' ')} {'\u2022'} {t('intelligence.operations.owner')} {row.owner}
                  {'\u2022'} {t('intelligence.operations.dueIn')} {row.due_in_days} {t('intelligence.operations.days')}
                </Alert>
              ))}
            </Stack>
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
