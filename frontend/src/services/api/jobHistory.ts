import type { JobStage } from './types'

const KEY = 'gst-itc-job-history'

export interface JobHistoryItem {
  jobId: string
  jobName?: string
  createdAt: string
  status: JobStage
}

export function listJobHistory(): JobHistoryItem[] {
  const raw = localStorage.getItem(KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as JobHistoryItem[]
    return parsed.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

export function rememberJob(item: JobHistoryItem) {
  const next = [item, ...listJobHistory().filter((entry) => entry.jobId !== item.jobId)].slice(0, 50)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function updateJobStatus(jobId: string, status: JobStage) {
  const next = listJobHistory().map((entry) => (entry.jobId === jobId ? { ...entry, status } : entry))
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function updateJobName(jobId: string, jobName?: string) {
  const cleaned = jobName?.trim()
  const next = listJobHistory().map((entry) =>
    entry.jobId === jobId
      ? {
          ...entry,
          jobName: cleaned && cleaned.length > 0 ? cleaned : undefined,
        }
      : entry,
  )
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function getJobName(jobId: string): string | undefined {
  return listJobHistory().find((entry) => entry.jobId === jobId)?.jobName
}

export function formatJobLabel(item: Pick<JobHistoryItem, 'jobId' | 'jobName'>): string {
  const name = item.jobName?.trim()
  if (name) {
    return name
  }
  return `Job ${item.jobId.slice(0, 10)}`
}
