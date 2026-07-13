import type { ReactNode } from 'react'

import { Card } from './Card'

/** A settings section card — small mono eyebrow label above its own
 * content, per the design spec. Shared by the Settings and Sync pages so
 * both sets of grouped fields read as one consistent system. */
export function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3.5 p-4 sm:p-5">
      <span className="font-mono text-[10.5px] font-semibold tracking-[0.1em] text-text-3">{label}</span>
      {children}
    </Card>
  )
}
