import { useOutletContext } from 'react-router-dom'

import type { NarrationLanguage } from '../../services/api/types'

export type IntelligenceScope = 'all' | 'job'

export interface IntelligenceShellContext {
  selectedJobId: string
  hasJobContext: boolean
  scope: IntelligenceScope
  setScope: (scope: IntelligenceScope) => void
  contextLabel: string
  voiceLanguage: NarrationLanguage
  speakingBlock: string | null
  speakingLabel: string | null
  setVoiceLanguage: (language: NarrationLanguage) => void
  playNarration: (
    block: string,
    text: string,
    segmentType?: 'chat_answer' | 'summary' | 'report' | 'generic',
    label?: string,
  ) => Promise<void>
  stopNarration: () => void
}

export function useIntelligenceShellContext() {
  return useOutletContext<IntelligenceShellContext>()
}

export function formatCurrency(value: number) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export function severityColor(severity: string): 'default' | 'error' | 'warning' | 'info' {
  if (severity === 'CRITICAL') {
    return 'error'
  }
  if (severity === 'WARNING') {
    return 'warning'
  }
  if (severity === 'INFO') {
    return 'info'
  }
  return 'default'
}
