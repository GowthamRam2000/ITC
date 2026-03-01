import { getApiBaseUrl, requestJson } from './client'
import type {
  AnomalyHighlightsResponse,
  AssistantLanguageMode,
  CashflowSimulatorResponse,
  ChatRequest,
  ChatResponse,
  CircularImpactResponse,
  CreateJobResponse,
  DeltaDigestResponse,
  EvidencePackResponse,
  ExportReportResponse,
  InvoicePreviewResponse,
  JobDispatchResponse,
  JobListItemResponse,
  Gstr3bSanityResponse,
  HsnSuggestionsResponse,
  InboxResponse,
  Phase6ReadinessResponse,
  JobResultResponse,
  JobStatusResponse,
  ModelConfigResponse,
  NarrationVoicesResponse,
  PortfolioOverviewResponse,
  SlaAnalyticsResponse,
  WatchlistResponse,
  VoiceTranscriptionResponse,
  VoiceSpeakRequest,
} from './types'

export async function createJob(files: File[], jobName?: string) {
  const formData = new FormData()
  files.forEach((file) => {
    formData.append('files', file)
  })
  const cleanedName = jobName?.trim()
  if (cleanedName) {
    formData.append('job_name', cleanedName)
  }

  return requestJson<CreateJobResponse>('/v1/jobs', {
    method: 'POST',
    body: formData,
  })
}

export async function getJobStatus(jobId: string) {
  return requestJson<JobStatusResponse>(`/v1/jobs/${jobId}`)
}

export async function listJobs(completedOnly = false) {
  return requestJson<JobListItemResponse[]>(
    `/v1/jobs?completed_only=${encodeURIComponent(String(completedOnly))}`,
  )
}

export async function dispatchJob(jobId: string) {
  return requestJson<JobDispatchResponse>(`/v1/jobs/${jobId}/dispatch`, {
    method: 'POST',
  })
}

export async function getJobResults(jobId: string) {
  return requestJson<JobResultResponse>(`/v1/jobs/${jobId}/results`)
}

export async function getModelConfig() {
  return requestJson<ModelConfigResponse>('/v1/config/models')
}

export async function askChat(payload: ChatRequest) {
  return requestJson<ChatResponse>('/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_style: 'plain',
      ...payload,
    }),
  })
}

export async function transcribeVoice(file: File, language: AssistantLanguageMode = 'auto') {
  const normalizedLanguage =
    language === 'hinglish' ? 'auto' : language === 'tanglish' ? 'ta' : language
  const formData = new FormData()
  formData.append('file', file)
  return requestJson<VoiceTranscriptionResponse>(
    `/v1/voice/transcribe?language=${encodeURIComponent(normalizedLanguage)}`,
    {
      method: 'POST',
      body: formData,
    },
  )
}

export async function speakVoice(payload: VoiceSpeakRequest) {
  const response = await fetch(`${getApiBaseUrl()}/v1/voice/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_style: 'plain',
      segment_type: 'chat_answer',
      ...payload,
    }),
  })

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = await response.json()
      if (body?.detail) {
        detail = String(body.detail)
      }
    } catch {
      const text = await response.text()
      if (text) {
        detail = text
      }
    }
    throw new Error(detail)
  }

  return response.blob()
}

export async function exportReport(jobId: string) {
  return requestJson<ExportReportResponse>(`/v1/reports/${jobId}/export`, {
    method: 'POST',
  })
}

export async function getNarrationVoices() {
  return requestJson<NarrationVoicesResponse>('/v1/phase6/voices/narration')
}

export async function getPhase6Readiness(jobId: string) {
  return requestJson<Phase6ReadinessResponse>(`/v1/phase6/readiness/${jobId}`)
}

export async function getEvidencePack(jobId: string) {
  return requestJson<EvidencePackResponse>(`/v1/phase6/evidence-pack/${jobId}`)
}

export async function getPortfolioOverview(jobId?: string) {
  const suffix = jobId ? `?job_id=${encodeURIComponent(jobId)}` : ''
  return requestJson<PortfolioOverviewResponse>(`/v1/phase6/portfolio/overview${suffix}`)
}

export async function getMorningBrief() {
  return requestJson<PortfolioOverviewResponse>('/v1/phase6/portfolio/morning-brief')
}

export async function getGstr3bSanity(jobId: string) {
  return requestJson<Gstr3bSanityResponse>(`/v1/phase6/gstr3b-sanity/${jobId}`)
}

export async function getAnomalyHighlights(jobId: string) {
  return requestJson<AnomalyHighlightsResponse>(`/v1/phase6/anomalies/${jobId}`)
}

export async function getWatchlist(jobId?: string) {
  const suffix = jobId ? `?job_id=${encodeURIComponent(jobId)}` : ''
  return requestJson<WatchlistResponse>(`/v1/phase6/watchlist${suffix}`)
}

export async function getHsnSuggestions(jobId: string) {
  return requestJson<HsnSuggestionsResponse>(`/v1/phase6/hsn-suggestions/${jobId}`)
}

export async function getDeltaDigest() {
  return requestJson<DeltaDigestResponse>('/v1/phase6/delta-digest')
}

export async function getRoleInbox(role: 'manager' | 'team', jobId?: string) {
  const params = new URLSearchParams({ role })
  if (jobId) {
    params.set('job_id', jobId)
  }
  return requestJson<InboxResponse>(`/v1/phase6/inbox?${params.toString()}`)
}

export async function getCashflowSimulator(jobId: string, annualInterestPct: number) {
  return requestJson<CashflowSimulatorResponse>(
    `/v1/phase6/cashflow/${jobId}?annual_interest_pct=${encodeURIComponent(String(annualInterestPct))}`,
  )
}

export async function getCircularImpact(jobId: string) {
  return requestJson<CircularImpactResponse>(`/v1/phase6/circular-impact/${jobId}`)
}

export async function getSlaAnalytics(jobId?: string) {
  const suffix = jobId ? `?job_id=${encodeURIComponent(jobId)}` : ''
  return requestJson<SlaAnalyticsResponse>(`/v1/phase6/sla-analytics${suffix}`)
}

export async function getInvoicePreview(jobId: string, invoiceId: string) {
  return requestJson<InvoicePreviewResponse>(
    `/v1/jobs/${jobId}/invoices/${encodeURIComponent(invoiceId)}/preview`,
  )
}

export function createJobEventsSource(jobId: string) {
  return new EventSource(`${getApiBaseUrl()}/v1/jobs/${jobId}/events`)
}
