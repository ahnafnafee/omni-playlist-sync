import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LuArrowRight } from 'react-icons/lu'

import { api, errorMessage } from '@/api'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { LoadingStatus, Skeleton } from '@/components/ui/Skeleton'
import { SettingsGroup } from '@/components/ui/SettingsGroup'
import { TextField } from '@/components/ui/TextField'
import { useSettings } from '@/hooks/useSettings'
import { cn } from '@/lib/cn'
import type { Settings as SettingsMap } from '@/types'

// Settings only owns identity + local display preference now — sync
// behavior, providers, scheduling, playlists, caps, and the download mirror
// all live on the Sync tab. Kept as its own small default map (rather than
// the full backend contract) so saving here only ever touches DISPLAY_NAME —
// the settings store merges by key, so this can't clobber the Sync tab's
// fields even if they haven't loaded in this session.
const DEFAULTS: SettingsMap = {
  DISPLAY_NAME: '',
}

export default function Settings() {
  const { settings, loading, error, refresh } = useSettings()
  const [form, setForm] = useState<SettingsMap | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (settings) setForm({ ...DEFAULTS, DISPLAY_NAME: settings.DISPLAY_NAME ?? DEFAULTS.DISPLAY_NAME })
  }, [settings])

  function setField(key: string, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setJustSaved(false)
  }

  function discard() {
    if (settings) setForm({ ...DEFAULTS, DISPLAY_NAME: settings.DISPLAY_NAME ?? DEFAULTS.DISPLAY_NAME })
    setSaveError(null)
  }

  const dirty = Boolean(form && settings && (settings.DISPLAY_NAME ?? DEFAULTS.DISPLAY_NAME) !== form.DISPLAY_NAME)

  async function save() {
    if (!form) return
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
        <h1 className="text-xl font-bold tracking-tight text-text sm:text-[22px]">Settings</h1>
        <p className="mt-1 text-sm text-text-3">
          Profile & appearance. Provider credentials live on the Accounts page.
        </p>
        <Link
          to="/sync"
          className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:text-accent-hover"
        >
          Tune syncing on the Sync tab
          <LuArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {error && <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">Could not load settings: {error}</p>}

      <SettingsGroup label="APPEARANCE">
        <ThemeToggle />
        <p className="text-xs leading-relaxed text-text-3">
          Applies instantly and is remembered on this device — separate from your account settings.
        </p>
      </SettingsGroup>

      {loading && !form ? (
        <LoadingStatus label="Loading settings…">
          <Skeleton className="h-32 w-full max-w-md rounded-card" />
        </LoadingStatus>
      ) : form ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="max-w-md">
            <SettingsGroup label="PROFILE">
              <TextField
                label="Display name"
                help="Optional — used only for the dashboard's greeting."
                placeholder="e.g. Maya"
                value={form.DISPLAY_NAME ?? ''}
                onChange={(e) => setField('DISPLAY_NAME', e.target.value)}
              />
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
              <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  )
}
