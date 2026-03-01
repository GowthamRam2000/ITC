const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL && typeof import.meta.env.VITE_API_BASE_URL === 'string'
    ? import.meta.env.VITE_API_BASE_URL
    : 'http://127.0.0.1:8000'

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: BodyInit | null
  headers?: Record<string, string>
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: options.headers,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as unknown)
    : ((await response.text()) as unknown)

  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail)
        : String(payload)
    throw new ApiError(detail || 'Request failed', response.status)
  }

  return payload as T
}

export function getApiBaseUrl() {
  return API_BASE_URL
}
