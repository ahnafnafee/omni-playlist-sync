import { AccountCard } from '@/components/accounts/AccountCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingStatus, Skeleton } from '@/components/ui/Skeleton'
import { useAccounts } from '@/hooks/useAccounts'

export default function Accounts() {
  const { accounts, loading, error, refresh } = useAccounts()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
          Accounts
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Connect each service once — Omni Playlist Sync keeps them mirrored from there.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          Could not load accounts: {error}
        </p>
      )}

      {loading && !accounts ? (
        <LoadingStatus label="Loading accounts…">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        </LoadingStatus>
      ) : accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} onChanged={() => void refresh()} />
          ))}
        </div>
      ) : (
        <EmptyState title="No connectors available" description="This installation has no configured services." />
      )}
    </div>
  )
}
