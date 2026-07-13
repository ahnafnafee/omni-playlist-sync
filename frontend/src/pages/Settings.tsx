import { useEffect, useState } from 'react'

import { api, errorMessage } from '@/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { RadioCard } from '@/components/ui/RadioCard'
import { SelectField } from '@/components/ui/SelectField'
import { LoadingStatus, Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { useSettings } from '@/hooks/useSettings'
import { DOWNLOAD_FORMAT_OPTIONS } from '@/lib/constants'
import { isValidIntervalText, isValidNonNegativeInt, isValidPositiveInt } from '@/lib/format'
import type { Settings as SettingsMap } from '@/types'

// Mirrors the backend's own defaults (spotify_mirror/config.py) so a fresh,
// never-saved install still shows sensible values instead of blank fields.
const DEFAULTS: SettingsMap = {
  SYNC_MODE: 'oneway',
  SYNC_INTERVAL: '15m',
  MAX_ADDS: '200',
  MAX_REMOVALS: '25',
  PLAYLISTS: '',
  DOWNLOAD_DIR: '',
  LOCAL_MIRROR_FORMAT: '',
}

export default function Settings() {
  const { settings, loading, error, refresh } = useSettings()
  const [form, setForm] = useState<SettingsMap | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (settings) setForm({ ...DEFAULTS, ...settings })
  }, [settings])

  function setField(key: string, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setJustSaved(false)
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
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Tune how and when syncing runs. Provider credentials live on the Accounts page.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          Could not load settings: {error}
        </p>
      )}

      {loading && !form ? (
        <LoadingStatus label="Loading settings…">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-52 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
        </LoadingStatus>
      ) : form ? (
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sync direction</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RadioCard
                name="sync-mode"
                value="oneway"
                checked={form.SYNC_MODE !== 'nway'}
                onChange={() => setField('SYNC_MODE', 'oneway')}
                title="One-way"
                description="Spotify is the source of truth. Apple Music and YouTube Music follow — Spotify is never modified."
              />
              <RadioCard
                name="sync-mode"
                value="nway"
                checked={form.SYNC_MODE === 'nway'}
                onChange={() => setField('SYNC_MODE', 'nway')}
                title="Bidirectional (N-way)"
                description="A track added or removed on any connected service propagates to all the others."
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Schedule &amp; limits</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Auto-sync interval"
                help="How often to run automatically, e.g. 15m, 1h, 900."
                value={form.SYNC_INTERVAL ?? ''}
                onChange={(e) => setField('SYNC_INTERVAL', e.target.value)}
                error={!intervalValid ? 'Use a number optionally followed by s, m, or h — e.g. 15m.' : undefined}
              />
              <TextField
                label="Playlists to sync"
                help="Comma-separated playlist names. Leave empty to sync every same-named pair."
                placeholder="e.g. Discover Weekly, Roadtrip"
                value={form.PLAYLISTS ?? ''}
                onChange={(e) => setField('PLAYLISTS', e.target.value)}
              />
              <TextField
                label="Max additions per pass"
                help="Per-playlist cap. Extra tracks continue on the next pass."
                type="number"
                min={1}
                value={form.MAX_ADDS ?? ''}
                onChange={(e) => setField('MAX_ADDS', e.target.value)}
                error={!maxAddsValid ? 'Enter a whole number of 1 or more.' : undefined}
              />
              <TextField
                label="Max removals per pass"
                help="Per-playlist safety cap — more than this skips removals for that pass."
                type="number"
                min={0}
                value={form.MAX_REMOVALS ?? ''}
                onChange={(e) => setField('MAX_REMOVALS', e.target.value)}
                error={!maxRemovalsValid ? 'Enter a whole number of 0 or more.' : undefined}
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Local download mirror</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
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
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving} disabled={!formValid}>
              Save settings
            </Button>
            {dirty && !saving && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
            {!dirty && justSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
            {saveError && <span className="text-xs text-rose-600 dark:text-rose-400">{saveError}</span>}
          </div>
        </form>
      ) : null}
    </div>
  )
}
