import type { AccountState, EventKind } from '../types'

export const ACCOUNT_STATE_STYLES: Record<AccountState, { label: string; badge: string; dot: string }> = {
  connected: {
    label: 'Connected',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  expired: {
    label: 'Needs reconnect',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  error: {
    label: 'Connection error',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  unconfigured: {
    label: 'Not connected',
    badge: 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    dot: 'bg-slate-400',
  },
}

/** Friendly display names for live-feed service tags. Account ids (used in
 * API paths) and event tags (used on /events) don't always match — e.g. the
 * YouTube Music account id is "ytmusic" but its log tag is "yt" — so this is
 * keyed by whichever string shows up, covering both. */
export const TAG_LABELS: Record<string, string> = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  yt: 'YouTube Music',
  ytmusic: 'YouTube Music',
  jellyfin: 'Jellyfin',
  sync: 'Sync',
  local: 'Local files',
}

const TAG_STYLES: Record<string, string> = {
  spotify: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  apple: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  yt: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  ytmusic: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  jellyfin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  sync: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300',
  local: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
}
const DEFAULT_TAG_STYLE = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag
}

export function tagStyle(tag: string): string {
  return TAG_STYLES[tag] ?? DEFAULT_TAG_STYLE
}

interface KindStyle {
  label: string
  text: string
  dot: string
  /** Extra classes for the whole row — used for kinds that deserve a
   * highlighted band (warnings, summaries, section dividers). */
  row?: string
}

export const KIND_STYLES: Record<EventKind, KindStyle> = {
  add: { label: 'Added', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  remove: { label: 'Removed', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  hold: { label: 'Held', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  miss: { label: 'Missing', text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400' },
  download: { label: 'Downloaded', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  note: { label: 'Note', text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-300 dark:bg-slate-600' },
  warn: {
    label: 'Warning',
    text: 'font-semibold text-red-700 dark:text-red-300',
    dot: 'bg-red-600',
    row: 'bg-red-50 dark:bg-red-950/30',
  },
  summary: {
    label: 'Summary',
    text: 'font-semibold text-brand-700 dark:text-brand-300',
    dot: 'bg-brand-500',
    row: 'bg-brand-50/70 dark:bg-brand-950/20',
  },
  section: {
    label: 'Section',
    text: 'font-bold text-slate-700 dark:text-slate-200',
    dot: 'bg-slate-500',
    row: 'bg-slate-100 dark:bg-slate-800/60',
  },
}

export const DOWNLOAD_FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Default (MP3)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC (lossless)' },
  { value: 'ogg', label: 'OGG Vorbis' },
  { value: 'opus', label: 'Opus (no re-encode from YouTube)' },
  { value: 'm4a', label: 'M4A / AAC' },
  { value: 'wav', label: 'WAV (uncompressed)' },
]
