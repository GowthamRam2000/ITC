export type JobStage = 'QUEUED' | 'PARSING' | 'RECONCILING' | 'COMPLETED' | 'FAILED'
export type Severity = 'CRITICAL' | 'WARNING' | 'INFO'
export type AssistantLanguageMode = 'auto' | 'en' | 'hi' | 'hinglish' | 'ta' | 'tanglish'
export type ChatResponseStyle = 'plain' | 'markdown'
export type NarrationLanguage = 'en' | 'hi' | 'ta'

export interface CreateJobResponse {
  job_id: string
  status: JobStage
  created_at: string
  job_name?: string | null
}

export interface JobStatusResponse {
  job_id: string
  job_name?: string | null
  status: JobStage
  created_at: string
  updated_at: string
  progress_pct: number
  stage_message: string
  total_files: number
  processed_files: number
  error: string | null
}

export interface JobListItemResponse {
  job_id: string
  job_name?: string | null
  status: JobStage
  created_at: string
  updated_at: string
  has_results: boolean
  has_invoice_source: boolean
  input_profile: string
}

export interface JobDispatchResponse {
  job_id: string
  scheduled: boolean
  status: JobStage
  runner_mode: string
  message: string
}

export interface ResultSummary {
  total_invoices: number
  matched_invoices: number
  critical_count: number
  warning_count: number
  info_count: number
  total_itc_at_risk: number
  matched_pct: number
  parse_failures: number
}

export interface MismatchIssue {
  invoice_id: string
  supplier_gstin: string
  invoice_no: string
  issue_code: string
  severity: Severity
  amount_at_risk: number
  evidence: Record<string, unknown>
  suggested_action: string
  audit_flags?: AuditFlag[]
}

export interface JobResultResponse {
  job_id: string
  summary: ResultSummary
  issues: MismatchIssue[]
  notes: string[]
}

export interface ChatRequest {
  job_id: string
  question: string
  language: AssistantLanguageMode
  response_style?: ChatResponseStyle
  voice_input_text?: string
  simulator_mode?: boolean
}

export interface ScenarioMetric {
  label: string
  value: string
  tone?: 'default' | 'good' | 'warning' | 'critical' | 'info'
}

export interface ScenarioCard {
  title: string
  subtitle: string
  assumptions: string[]
  metrics: ScenarioMetric[]
  disclaimer: string
}

export interface ChatResponse {
  answer: string
  citations: string[]
  filters_applied: string[]
  followups: string[]
  simulator_card?: ScenarioCard | null
}

export interface AuditBoundingBox {
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface AuditFlag {
  flag_code: string
  severity: Severity
  summary: string
  confidence: number
  line_item_ref?: string | null
  bbox?: AuditBoundingBox | null
  model?: string | null
  source?: 'ai_auditor' | 'rule'
}

export interface VoiceTranscriptionResponse {
  text: string
  model: string
  language?: string | null
}

export interface ModelConfigResponse {
  job_runner_mode?: string
  worker_auth_enabled?: boolean
  firestore_persistence_enabled?: boolean
  firestore_persistence_reason?: string
  gcs_artifact_store_enabled?: boolean
  gcs_artifact_store_reason?: string
  task_queue_enabled?: boolean
  task_queue_reason?: string
  doc_ai_enabled?: boolean
  chat_ai_enabled?: boolean
  ocr: string
  extract_fast: string
  extract_default: string
  extract_fallback: string
  reasoning: string
  report_chat: string
  voice_stt?: string
  voice_stt_tamil_provider?: 'elevenlabs' | 'mistral'
  voice_stt_tamil_model?: string
  voice_tts_enabled?: boolean
  voice_tts_provider?: 'elevenlabs' | 'none'
  voice_tts_model?: string | null
}

export interface ExportReportResponse {
  job_id: string
  report_path: string
  format: string
}

export interface JobEvent {
  type: string
  job_id: string
  stage?: JobStage
  message?: string
  progress_pct?: number
  processed_files?: number
  total_files?: number
  ts: string
}

export interface VoiceSpeakRequest {
  text: string
  language: AssistantLanguageMode
  response_style?: ChatResponseStyle
  context_job_id?: string | null
  segment_type?: 'chat_answer' | 'summary' | 'report' | 'generic'
}

export interface NarrationVoicesResponse {
  provider: string
  enabled: boolean
  model: string | null
  voices: Record<
    NarrationLanguage,
    {
      label: string
      voice_id: string | null
    }
  >
}

export interface EvidencePackAction {
  invoice_id: string
  issue_code: string
  severity: Severity
  owner: string
  action: string
  due_in_days: number
}

export interface EvidencePackTimelineItem {
  ts: string
  stage: string
  message: string
  type: string
}

export interface EvidencePackResponse {
  job_id: string
  generated_at: string
  summary: ResultSummary
  actions: EvidencePackAction[]
  timeline: EvidencePackTimelineItem[]
  narration_text: string
}

export interface PortfolioEntityRow {
  entity_gstin: string
  invoice_count: number
  taxable_value: number
  itc_at_risk: number
  risk_badge: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface PortfolioOverviewResponse {
  entities: PortfolioEntityRow[]
  jobs_covered: number
  narration_text: string
}

export interface Gstr3bPrefill {
  taxable_value_expected: number
  taxable_value_claimed: number
  itc_expected: number
  itc_claimed: number
  blocked_itc: number
}

export interface Gstr3bException {
  code: string
  severity: Severity | 'WARNING' | 'CRITICAL'
  expected: number
  claimed: number
  difference: number
  message: string
}

export interface Gstr3bSanityResponse {
  job_id: string
  prefill: Gstr3bPrefill
  exceptions: Gstr3bException[]
  narration_text: string
}

export interface AnomalyItem {
  type: string
  severity: Severity | 'WARNING' | 'CRITICAL'
  invoice_id?: string
  supplier_gstin: string
  invoice_no: string
  amount: number
  evidence: Record<string, unknown>
}

export interface AnomalyHighlightsResponse {
  job_id: string
  anomalies: AnomalyItem[]
  narration_text: string
}

export interface WatchlistItem {
  supplier_gstin: string
  critical_count: number
  warning_count: number
  itc_risk: number
  risk_badge: 'LOW' | 'MEDIUM' | 'HIGH'
  latest_issue: string
  latest_invoice_id?: string | null
  latest_invoice_no?: string | null
  latest_job_id?: string | null
}

export interface WatchlistResponse {
  job_id?: string | null
  watchlist: WatchlistItem[]
}

export interface HsnSuggestion {
  invoice_id: string
  invoice_no: string
  supplier_gstin: string
  current_hsn: string
  gstr2b_hsn: string
  suggested_hsn: string
  suggested_rate: number | null
  confidence: number
  reason: string
}

export interface HsnSuggestionsResponse {
  job_id: string
  suggestions: HsnSuggestion[]
}

export interface DeltaDigestResponse {
  current_job_id: string | null
  previous_job_id: string | null
  delta: Record<string, number>
  direction?: string
  message: string
}

export interface InboxTask {
  job_id: string
  invoice_id?: string
  invoice_no: string
  supplier_gstin: string
  severity: Severity | 'WARNING' | 'CRITICAL'
  issue_code: string
  amount_at_risk: number
  queue: string
  assignee: string
  status: string
  due_in_days: number
  action: string
}

export interface InboxResponse {
  role: 'manager' | 'team'
  job_id?: string | null
  tasks: InboxTask[]
}

export interface CashflowSimulatorResponse {
  job_id: string
  blocked_itc: number
  annual_interest_pct: number
  monthly_financing_cost: number
  quarter_financing_cost: number
  annual_financing_cost: number
  working_capital_stress_pct: number
}

export interface CircularItem {
  id: string
  title: string
  impact: 'High' | 'Medium' | 'Low' | string
  applies: boolean
  summary: string
}

export interface CircularImpactResponse {
  job_id: string
  relevant_circulars: CircularItem[]
  all_circulars: CircularItem[]
}

export interface SupplierSlaItem {
  supplier_gstin: string
  total_tickets: number
  critical_tickets: number
  synthetic_avg_resolution_days: number
  sla_breach_pct: number
  compliance_score: number
}

export interface SlaAnalyticsResponse {
  job_id?: string | null
  suppliers: SupplierSlaItem[]
}

export interface Phase6ReadinessResponse {
  job_id: string
  compliance_ready: boolean
  anomaly_ready: boolean
  evidence_ready: boolean
  reasons: string[]
}

export interface InvoicePreviewResponse {
  job_id: string
  invoice_id: string
  invoice_no?: string | null
  supplier_gstin?: string | null
  source_available: boolean
  source_file_id?: string | null
  source_download_url?: string | null
  source_filename?: string | null
  source_content_type?: string | null
  preview_type: 'image' | 'pdf' | 'none'
  ocr_excerpt?: string | null
  invoice_record?: Record<string, unknown> | null
  gstr2b_record?: Record<string, unknown> | null
  issue?: Record<string, unknown> | null
  timeline: Array<Record<string, unknown>>
  actions: Array<Record<string, unknown>>
  notes: string[]
  reasons: string[]
}
