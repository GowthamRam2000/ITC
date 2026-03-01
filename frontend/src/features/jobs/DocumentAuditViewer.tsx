import { useMemo } from 'react'
import { Alert, Box, Chip, CircularProgress, Divider, Stack, Tooltip, Typography } from '@mui/material'
import { useQuery } from '@tanstack/react-query'

import { getApiBaseUrl } from '../../services/api/client'
import { getInvoicePreview } from '../../services/api/jobs'
import type { AuditFlag, MismatchIssue } from '../../services/api/types'

interface DocumentAuditViewerProps {
  jobId: string
  issue: MismatchIssue | null
}

function flagColor(flag: AuditFlag): 'error' | 'warning' | 'info' {
  if (flag.severity === 'CRITICAL') {
    return 'error'
  }
  if (flag.severity === 'WARNING') {
    return 'warning'
  }
  return 'info'
}

export function DocumentAuditViewer({ jobId, issue }: DocumentAuditViewerProps) {
  const invoiceId = issue?.invoice_id ?? ''
  const query = useQuery({
    queryKey: ['result-invoice-preview', jobId, invoiceId],
    queryFn: () => getInvoicePreview(jobId, invoiceId),
    enabled: Boolean(jobId && invoiceId),
  })

  const flags = useMemo(() => issue?.audit_flags ?? [], [issue?.audit_flags])
  const sourceUrl = query.data?.source_download_url ? `${getApiBaseUrl()}${query.data.source_download_url}` : ''

  if (!issue) {
    return <Alert severity="info">Select an issue row to inspect source proof and AI audit flags.</Alert>
  }

  return (
    <Stack spacing={1}>
      {query.isLoading ? (
        <Stack alignItems="center" py={2}>
          <CircularProgress size={22} />
        </Stack>
      ) : null}
      {query.isError ? (
        <Alert severity="warning">Source preview unavailable. Showing OCR/evidence fallback.</Alert>
      ) : null}

      {query.data?.source_available && sourceUrl ? (
        <>
          {query.data.preview_type === 'image' ? (
            <Box
              sx={{
                position: 'relative',
                borderRadius: 2,
                overflow: 'hidden',
                border: (theme) => `1px solid ${theme.palette.divider}`,
              }}
            >
              <Box component="img" src={sourceUrl} alt={query.data.source_filename || issue.invoice_no} sx={{ width: '100%', display: 'block' }} />
              {flags.map((flag, idx) => {
                const box = flag.bbox
                if (!box) {
                  return null
                }
                const left = `${Math.max(0, Math.min(1, box.x)) * 100}%`
                const top = `${Math.max(0, Math.min(1, box.y)) * 100}%`
                const width = `${Math.max(0.04, Math.min(1, box.width)) * 100}%`
                const height = `${Math.max(0.03, Math.min(1, box.height)) * 100}%`
                return (
                  <Tooltip key={`${flag.flag_code}_${idx}`} title={`${flag.summary} (${Math.round(flag.confidence * 100)}%)`} arrow>
                    <Box
                      sx={{
                        position: 'absolute',
                        left,
                        top,
                        width,
                        height,
                        border: (theme) => `2px solid ${theme.palette.error.main}`,
                        background: 'rgba(225, 77, 77, 0.16)',
                        borderRadius: 0.8,
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                      }}
                    />
                  </Tooltip>
                )
              })}
            </Box>
          ) : null}
          {query.data.preview_type === 'pdf' ? (
            <Box
              component="iframe"
              src={sourceUrl}
              title={query.data.source_filename || issue.invoice_no}
              sx={{ width: '100%', height: 300, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 2 }}
            />
          ) : null}
        </>
      ) : (
        <Alert severity="info">Original source file is not available for this invoice. Showing parsed evidence only.</Alert>
      )}

      {query.data?.ocr_excerpt ? (
        <Typography variant="body2" color="text.secondary">
          <strong>OCR:</strong> {query.data.ocr_excerpt}
        </Typography>
      ) : null}

      <Divider />

      <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap">
        <Chip size="small" label={`Issue: ${issue.issue_code.replaceAll('_', ' ')}`} />
        <Chip size="small" label={`Risk: ₹${issue.amount_at_risk.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} color="warning" />
      </Stack>

      {flags.length > 0 ? (
        <Stack spacing={0.8}>
          <Typography variant="subtitle2" fontWeight={700}>
            AI Auditor Flags
          </Typography>
          {flags.map((flag, idx) => (
            <Alert key={`${flag.flag_code}_${idx}`} severity={flagColor(flag)}>
              <strong>{flag.flag_code.replaceAll('_', ' ')}</strong> • {flag.summary}
              <br />
              Confidence: {Math.round((flag.confidence || 0) * 100)}%
              {flag.line_item_ref ? ` • ${flag.line_item_ref}` : ''}
            </Alert>
          ))}
        </Stack>
      ) : (
        <Alert severity="info">No additional semantic spot-check flags for this invoice.</Alert>
      )}
    </Stack>
  )
}
