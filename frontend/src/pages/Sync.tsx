import { useEffect, useMemo, useState } from 'react'
import { LuLock } from 'react-icons/lu'

import { api, errorMessage } from '@/api'
import { PlaylistFilterField } from '@/components/settings/PlaylistFilterField'
import { Button } from '@/components/ui/Button'
import { RadioCard } from '@/components/ui/RadioCard'
import { SelectField } from '@/components/ui/SelectField'
import { ServiceLogo } from '@/components/ui/ServiceLogo'
import { SettingsGroup } from '@/components/ui/SettingsGroup'
import { LoadingStatus, Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { Toggle } from '@/components/ui/Toggle'
import { useAccounts } from '@/hooks/useAccounts'
import { useSettings } from '@/hooks/useSettings'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { cn } from '@/lib/cn'
import { DOWNLOAD_FORMAT_OPTIONS, serviceLogoId, tagDot, tagText } from '@/lib/constants'
import { formatInterval, isValidIntervalText, isValidNonNegativeInt, isValidPositiveInt } from '@/lib/format'
import type { Account, Settings as SettingsMap } from '@/types'

// Everything sync-behavior-related lives here now — Settings only keeps
// identity + local appearance. Its own default map (not the full backend
// contract) so saving here only ever touches these keys — the settings
// store merges by key, so this can't clobber Settings' DISPLAY_NAME even if
// it hasn't loaded in this session.
const DEFAULTS: SettingsMap = {
  SYNC_MODE: 'oneway',
  SYNC_INTERVAL: '15m',
  PROVIDERS: '',
  MAX_ADDS: '200',
  MAX_REMOVALS: '25',
  PLAYLISTS: '',
  DOWNLOAD_DIR: '',
  LOCAL_MIRROR_FORMAT: '',
}

// The N-way sync peers — mirrors the backend's own DEFAULT_PROVIDERS
// (engine/config.py). Jellyfin is a real connected account but isn't a sync
// peer (it only ever receives pushed cover art), so it's deliberately
// excluded from this list and never appears as a Providers toggle.
const SYNC_PEER_IDS = ['spotify', 'apple', 'ytmusic']

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function ProviderChip({
  account,
  checked,
  locked,
  onToggle,
}: {
  account: Account
  checked: boolean
  locked: boolean
  onToggle: () => void
}) {
  const logoId = serviceLogoId(account.id)
  const connected = account.state === 'connected'

  return (
    <button
      type="button"
      onClick={connected && !locked ? onToggle : undefined}
      disabled={!connected}
      aria-pressed={connected ? checked : undefined}
      title={
        !connected
          ? `Connect ${account.name} on the Accounts page to include it in syncing.`
          : locked
            ? `${account.name} is always included — every sync is built around it.`
            : undefined
      }
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-chip border-[1.5px] px-3 text-[13px] font-semibold transition-colors duration-fast',
        !connected
          ? 'cursor-not-allowed border-dashed border-border text-text-3 opacity-60'
          : checked
            ? cn('border-accent bg-accent-soft text-accent', locked && 'cursor-default')
            : 'border-border-strong text-text-2 hover:bg-surface-2',
      )}
    >
      {logoId ? (
        <ServiceLogo service={logoId} className={cn('size-4 shrink-0', connected && tagText(account.id))} />
      ) : (
        <span className={cn('size-2 shrink-0 rounded-full', tagDot(account.id))} aria-hidden="true" />
      )}
      {account.name}
      {locked && connected && <LuLock className="size-3 shrink-0" aria-hidden="true" />}
      {!connected && <span className="font-normal text-text-3">not connected</span>}
    </button>
  )
}

export default function Sync() {
  const { settings, loading, error, refresh } = useSettings()
  const { accounts } = useAccounts()
  const { status: syncStatus, refresh: refreshSyncStatus } = useSyncStatus()

  const [form, setForm] = useState<SettingsMap | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) setForm({ ...DEFAULTS, ...settings })
  }, [settings])

  function setField(key: string, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setJustSaved(false)
  }

  function discard() {
    if (settings) setForm({ ...DEFAULTS, ...settings })
    setSaveError(null)
  }

  const syncPeers = useMemo(() => (accounts ?? []).filter((a) => SYNC_PEER_IDS.includes(a.id)), [accounts])
  const connectedPeerIds = useMemo(() => syncPeers.filter((a) => a.state === 'connected').map((a) => a.id), [syncPeers])

  // PROVIDERS defaults to "every connected peer" until the user actually
  // touches a chip — at that point it becomes an explicit, saved list. This
  // is computed rather than written into `form` on load, so it can't fight
  // with the accounts list still loading (or a genuinely-empty saved choice).
  const providersCsv = form?.PROVIDERS ?? ''
  const enabledProviders = useMemo(() => {
    const explicit = parseCsv(providersCsv)
    return new Set(explicit.length > 0 ? explicit : connectedPeerIds)
  }, [providersCsv, connectedPeerIds])

  function toggleProvider(id: string) {
    if (id === 'spotify') return // the hub — never toggleable
    const next = new Set(enabledProviders)
    next.add('spotify') // materializing an explicit list must never drop the hub
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setField('PROVIDERS', [...next].join(','))
  }

  async function toggleSchedule() {
    if (!syncStatus) return
    setScheduleBusy(true)
    setScheduleError(null)
    try {
      await api.setSchedule({ action: syncStatus.scheduled ? 'pause' : 'resume' })
      await refreshSyncStatus()
    } catch (err) {
      setScheduleError(errorMessage(err))
    } finally {
      setScheduleBusy(false)
    }
  }

  const intervalValid = isValidIntervalText(form?.SYNC_INTERVAL ?? '')
  const maxAddsValid = isValidPositiveInt(form?.MAX_ADDS ?? '')
  const maxRemovalsValid = isValidNonNegativeInt(form?.MAX_REMOVALS ?? '')
  const formValid = intervalValid && maxAddsValid && maxRemovalsValid
  const dirty = Boolean(form && settings && JSON.stringify({ ...DEFAULTS, ...settings }) !== JSON.stringify(form))

  async function save() {
    if (!form || !formValid) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.saveSettings(form)
      setJustSaved(true)
      await refresh()
    } catch (err) {
      setSaveError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-text sm:text-[22px]">Sync</h1>
        <p className="mt-1 text-sm text-text-3">
          How and when your playlists sync — which services are involved, how often, and what's off-limits.
        </p>
      </div>

      {error && <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">Could not load settings: {error}</p>}

      {loading && !form ? (
        <LoadingStatus label="Loading sync settings…">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-40 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
            <Skeleton className="h-44 w-full rounded-card" />
            <Skeleton className="h-52 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        </LoadingStatus>
      ) : form ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <SettingsGroup label="DIRECTION">
              <p className="text-xs leading-relaxed text-text-3">Which way changes flow between your services.</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <RadioCard
                  name="sync-mode"
                  value="oneway"
                  checked={form.SYNC_MODE !== 'nway'}
                  onChange={() => setField('SYNC_MODE', 'oneway')}
                  title="One-way →"
                  description="Spotify is the source of truth. Apple Music and YouTube Music follow — Spotify is never modified."
                />
                <RadioCard
                  name="sync-mode"
                  value="nway"
                  checked={form.SYNC_MODE === 'nway'}
                  onChange={() => setField('SYNC_MODE', 'nway')}
                  title="Bidirectional (N-way) ⇄"
                  description="A track added or removed on any connected service propagates to all the others."
                />
              </div>
            </SettingsGroup>

            <SettingsGroup label="PROVIDERS">
              <p className="text-xs leading-relaxed text-text-3">Which services to keep in sync.</p>
              <div className="flex flex-wrap gap-2">
                {syncPeers.map((account) => (
                  <ProviderChip
                    key={account.id}
                    account={account}
                    checked={account.id === 'spotify' || enabledProviders.has(account.id)}
                    locked={account.id === 'spotify'}
                    onToggle={() => toggleProvider(account.id)}
                  />
                ))}
              </div>
            </SettingsGroup>

            <SettingsGroup label="AUTOMATIC SYNC">
              <p className="text-xs leading-relaxed text-text-3">
                Run a pass on a schedule, or only when you trigger one yourself.
              </p>
              <div className="flex items-center gap-2.5 rounded-control border border-border px-3.5 py-2.5">
                <span className="flex-1 text-[13px] font-medium text-text">
                  {syncStatus?.scheduled ? 'Running automatically' : 'Paused'}
                </span>
                <Toggle
                  checked={Boolean(syncStatus?.scheduled)}
                  onChange={() => void toggleSchedule()}
                  label={syncStatus?.scheduled ? 'Pause automatic sync' : 'Resume automatic sync'}
                  hideLabel
                  disabled={scheduleBusy || !syncStatus}
                />
              </div>
              {syncStatus && !syncStatus.scheduled && (
                <p className="text-xs leading-relaxed text-text-3">
                  Auto-sync is off — passes only run when you hit "Sync now" on the Dashboard. Applies immediately,
                  independent of the changes below.
                </p>
              )}
              {scheduleError && <p className="text-xs text-danger">{scheduleError}</p>}
              <TextField
                label="Interval"
                help={`How often to run automatically, e.g. 15m, 1h, 900${syncStatus ? ` — currently every ${formatInterval(syncStatus.interval_s)}` : ''}.`}
                value={form.SYNC_INTERVAL ?? ''}
                onChange={(e) => setField('SYNC_INTERVAL', e.target.value)}
                error={!intervalValid ? 'Use a number optionally followed by s, m, or h — e.g. 15m.' : undefined}
              />
            </SettingsGroup>

            <SettingsGroup label="PLAYLISTS">
              <p className="text-xs leading-relaxed text-text-3">
                Limit syncing to specific playlists, or leave empty to sync every same-named pair.
              </p>
              <PlaylistFilterField value={form.PLAYLISTS ?? ''} onChange={(v) => setField('PLAYLISTS', v)} />
            </SettingsGroup>

            <SettingsGroup label="SAFETY CAPS">
              <p className="text-xs leading-relaxed text-text-3">Guardrails so one pass can't make a huge, hard-to-review change.</p>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Max additions / pass"
                  type="number"
                  min={1}
                  value={form.MAX_ADDS ?? ''}
                  onChange={(e) => setField('MAX_ADDS', e.target.value)}
                  error={!maxAddsValid ? 'Enter a whole number of 1 or more.' : undefined}
                />
                <TextField
                  label="Max removals / pass"
                  type="number"
                  min={0}
                  value={form.MAX_REMOVALS ?? ''}
                  onChange={(e) => setField('MAX_REMOVALS', e.target.value)}
                  error={!maxRemovalsValid ? 'Enter a whole number of 0 or more.' : undefined}
                />
              </div>
              <div className="flex gap-2.5 rounded-control bg-warning-soft px-3.5 py-2.5">
                <span className="font-mono text-xs font-semibold text-warning" aria-hidden="true">
                  ~
                </span>
                <p className="text-[12px] leading-relaxed text-text-2">
                  A pass that would exceed a cap <span className="font-semibold text-text">holds</span> the excess
                  instead of writing it — you'll see held rows in the feed and can review before anything is lost.
                </p>
              </div>
            </SettingsGroup>

            <SettingsGroup label="LOCAL DOWNLOAD MIRROR">
              <p className="text-xs leading-relaxed text-text-3">
                Optional — also keep offline audio copies of your synced playlists, organized for media servers like
                Jellyfin.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  label="Download folder"
                  help="Leave empty to disable local downloads."
                  placeholder="e.g. /music or D:\Music"
                  value={form.DOWNLOAD_DIR ?? ''}
                  onChange={(e) => setField('DOWNLOAD_DIR', e.target.value)}
                />
                <SelectField
                  label="Audio format"
                  help="Only used when a download folder is set above."
                  options={DOWNLOAD_FORMAT_OPTIONS}
                  value={form.LOCAL_MIRROR_FORMAT ?? ''}
                  onChange={(e) => setField('LOCAL_MIRROR_FORMAT', e.target.value)}
                />
              </div>
            </SettingsGroup>
          </div>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-lg sm:p-4">
            <span
              className={cn('size-2 shrink-0 rounded-full', dirty ? 'bg-warning' : 'bg-success')}
              aria-hidden="true"
            />
            <span className="text-[13px] text-text-2">{dirty ? 'Unsaved changes' : justSaved ? 'Saved' : 'Up to date'}</span>
            {saveError && <span className="text-xs text-danger">{saveError}</span>}
            <div className="ml-auto flex gap-2">
              {dirty && (
                <Button type="button" variant="secondary" size="sm" onClick={discard} disabled={saving}>
                  Discard
                </Button>
              )}
              <Button type="submit" size="sm" loading={saving} disabled={!formValid || !dirty}>
                Save changes
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  )
}
