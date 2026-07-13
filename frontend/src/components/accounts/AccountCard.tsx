import { useState } from 'react'

import { api, errorMessage } from '@/api'
import type { Account } from '@/types'

import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { StatusPill } from '../ui/StatusPill'
import { ConnectWizardModal } from './ConnectWizardModal'

const SERVICE_BLURBS: Record<string, string> = {
  spotify: 'The source of truth — every other service mirrors what you curate here.',
  apple: 'Paste a couple of tokens from the Apple Music web player. No developer account needed.',
  ytmusic: 'Sign in with a Google account using a short code — approve it from your phone or another tab.',
  jellyfin: 'Optional — pushes real playlist cover art to your Jellyfin server.',
}

export function AccountCard({ account, onChanged }: { account: Account; onChanged: () => void }) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConnected = account.state === 'connected' || account.state === 'expired'

  async function disconnect() {
    setDisconnecting(true)
    setError(null)
    try {
      await api.disconnectAccount(account.id)
      setConfirmingDisconnect(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{account.name}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{SERVICE_BLURBS[account.id] ?? ''}</p>
        </div>
        <StatusPill state={account.state} />
      </div>

      {account.detail && account.state !== 'connected' && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{account.detail}</p>
      )}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant={isConnected ? 'secondary' : 'primary'} onClick={() => setWizardOpen(true)}>
          {isConnected ? 'Reconnect' : 'Connect'}
        </Button>
        {isConnected && (
          <Button variant="ghost" onClick={() => setConfirmingDisconnect(true)}>
            Disconnect
          </Button>
        )}
      </div>

      <ConnectWizardModal
        account={account}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onConnected={() => {
          setWizardOpen(false)
          onChanged()
        }}
      />

      <ConfirmDialog
        open={confirmingDisconnect}
        title={`Disconnect ${account.name}?`}
        description="You can reconnect at any time. Existing playlists on this service won't be deleted."
        confirmLabel="Disconnect"
        danger
        loading={disconnecting}
        onConfirm={() => void disconnect()}
        onCancel={() => setConfirmingDisconnect(false)}
      />
    </Card>
  )
}
