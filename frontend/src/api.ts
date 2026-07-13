// Thin typed fetch wrapper for the FastAPI backend. Same-origin in
// production (FastAPI serves the built SPA); proxied through Vite in dev
// (see vite.config.ts). No client-side base URL needed either way.
import type {
  Account,
  ConnectResponse,
  OkResponse,
  PollResponse,
  RunResponse,
  ScheduleRequest,
  Settings,
  SyncStatus,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check that it is running and reachable.')
  }

  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`
    try {
      const body: unknown = await res.clone().json()
      if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
        detail = body.detail
      }
    } catch {
      // Response wasn't JSON — fall back to the status text above.
    }
    throw new ApiError(res.status, detail)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  // Accounts
  getAccounts: () => request<Account[]>('/api/accounts'),
  saveAccountConfig: (id: string, values: Record<string, string>) =>
    request<OkResponse>(`/api/accounts/${id}/config`, json(values)),
  connectAccount: (id: string, values?: Record<string, string>) =>
    request<ConnectResponse>(`/api/accounts/${id}/connect`, { method: 'POST', ...(values ? { body: JSON.stringify(values) } : {}) }),
  pollAccount: (id: string, deviceCode: string, interval: number) =>
    request<PollResponse>(`/api/accounts/${id}/poll`, json({ device_code: deviceCode, interval })),
  disconnectAccount: (id: string) => request<OkResponse>(`/api/accounts/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request<Settings>('/api/settings'),
  saveSettings: (values: Settings) => request<OkResponse>('/api/settings', { method: 'PUT', body: JSON.stringify(values) }),

  // Sync
  runSync: (execute: boolean) => request<RunResponse>(`/api/sync/run?execute=${execute ? 1 : 0}`, { method: 'POST' }),
  getSyncStatus: () => request<SyncStatus>('/api/sync/status'),
  setSchedule: (body: ScheduleRequest) => request<SyncStatus>('/api/sync/schedule', json(body)),
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
