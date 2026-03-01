import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getInvoicePreview } from '../../services/api/jobs'

export function useInvoicePreview(selectedJobId: string) {
  const [open, setOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState('')
  const [requestedJobId, setRequestedJobId] = useState('')
  const jobId = requestedJobId || selectedJobId

  const query = useQuery({
    queryKey: ['invoice-preview', jobId, invoiceId],
    queryFn: () => getInvoicePreview(jobId, invoiceId),
    enabled: open && Boolean(jobId) && Boolean(invoiceId),
  })

  const actions = useMemo(
    () => ({
      openForInvoice: (nextInvoiceId: string, nextJobId?: string) => {
        const resolvedJobId = (nextJobId || selectedJobId || '').trim()
        if (!resolvedJobId || !nextInvoiceId) {
          return
        }
        setRequestedJobId(resolvedJobId)
        setInvoiceId(nextInvoiceId)
        setOpen(true)
      },
      close: () => {
        setOpen(false)
        setRequestedJobId('')
      },
    }),
    [selectedJobId],
  )

  return {
    open,
    jobId,
    invoiceId,
    setInvoiceId,
    ...actions,
    query,
  }
}
