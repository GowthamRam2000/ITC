import { OpenInNew } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'

import { getApiBaseUrl } from '../../services/api/client'
import type { InvoicePreviewResponse } from '../../services/api/types'

interface InvoiceWorkbenchDrawerProps {
  open: boolean
  onClose: () => void
  loading: boolean
  error: string
  data?: InvoicePreviewResponse
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (!value) {
    return null
  }
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} mb={0.4}>
        {label}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1,
          borderRadius: 2,
          bgcolor: 'action.hover',
          fontSize: 12,
          maxHeight: 220,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(value, null, 2)}
      </Box>
    </Box>
  )
}

export function InvoiceWorkbenchDrawer({ open, onClose, loading, error, data }: InvoiceWorkbenchDrawerProps) {
  const sourceUrl = data?.source_download_url ? `${getApiBaseUrl()}${data.source_download_url}` : ''

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', sm: 520 }, p: 2, display: 'flex', flexDirection: 'column', gap: 1.3 }}>
        <Typography variant="h6" fontWeight={800}>
          Invoice Workbench
        </Typography>
        {data ? (
          <Typography variant="body2" color="text.secondary">
            {data.invoice_no || data.invoice_id} • {data.supplier_gstin || 'Unknown supplier'}
          </Typography>
        ) : null}
        <Divider />

        {loading ? (
          <Stack alignItems="center" py={3}>
            <CircularProgress size={26} />
          </Stack>
        ) : null}
        {!loading && error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && !error && data ? (
          <Stack spacing={1.25}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Source Preview
              </Typography>
              {data.source_available && sourceUrl ? (
                <Stack spacing={1}>
                  {data.preview_type === 'image' ? (
                    <Box
                      component="img"
                      src={sourceUrl}
                      alt={data.source_filename || 'invoice source'}
                      sx={{ width: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                    />
                  ) : null}
                  {data.preview_type === 'pdf' ? (
                    <Box
                      component="iframe"
                      src={sourceUrl}
                      title={data.source_filename || 'invoice pdf preview'}
                      sx={{ width: '100%', height: 360, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                    />
                  ) : null}
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<OpenInNew />}
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Source File
                  </Button>
                </Stack>
              ) : (
                <Alert severity="info">No source file preview is available for this invoice.</Alert>
              )}
            </Box>

            {data.ocr_excerpt ? (
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  OCR Excerpt
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.ocr_excerpt}
                </Typography>
              </Box>
            ) : null}

            <JsonBlock label="Mismatch Evidence" value={data.issue} />
            <JsonBlock label="Invoice Parsed Record" value={data.invoice_record} />
            <JsonBlock label="GSTR-2B Parsed Record" value={data.gstr2b_record} />

            {data.actions.length ? (
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Actions
                </Typography>
                <List dense disablePadding>
                  {data.actions.map((row, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemText
                        primary={String(row.action || 'Action')}
                        secondary={`Owner: ${String(row.owner || 'CA Team')} • Due in ${String(row.due_in_days || '-') } days`}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            ) : null}

            {data.timeline.length ? (
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Timeline
                </Typography>
                <List dense disablePadding>
                  {data.timeline.slice().reverse().slice(0, 8).map((evt, idx) => (
                    <ListItem key={idx} sx={{ px: 0 }}>
                      <ListItemText
                        primary={String(evt.message || evt.stage || 'Event')}
                        secondary={`${String(evt.stage || '-') } • ${String(evt.ts || '-')}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            ) : null}

            {data.reasons.length ? (
              <Alert severity="info">{data.reasons.join(' ')}</Alert>
            ) : null}
          </Stack>
        ) : null}
      </Box>
    </Drawer>
  )
}

