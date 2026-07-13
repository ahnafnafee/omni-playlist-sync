/** Formats a duration in seconds compactly, e.g. 45 -> "45s", 125 -> "2m 05s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${String(rem).padStart(2, '0')}s`
}

/** Formats a schedule interval given in seconds as a friendly string, e.g.
 * 900 -> "15m", 3600 -> "1h", 90 -> "1m 30s". Inverse of the backend's
 * `parse_interval` (config.py). */
export function formatInterval(seconds: number): string {
  if (seconds <= 0) return '0s'
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** Formats a Unix-epoch-seconds timestamp (as sent on /events) as a local
 * HH:MM:SS clock reading for the live feed. */
export function formatClock(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Loosely validates the interval text format the backend accepts
 * (`parse_interval`): digits optionally followed by s/m/h. */
export function isValidIntervalText(value: string): boolean {
  return /^\d+\s*[smh]?$/i.test(value.trim())
}

/** Matches the backend's `--max-adds` validation (config.py: must be >= 1). */
export function isValidPositiveInt(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) >= 1
}

/** Matches the backend's `--max-removals` validation (config.py: must be >= 0). */
export function isValidNonNegativeInt(value: string): boolean {
  return /^\d+$/.test(value.trim())
}
