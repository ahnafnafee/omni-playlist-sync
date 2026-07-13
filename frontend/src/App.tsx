import { Link, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/layout/AppShell'
import { BUTTON_BASE_CLASSES, BUTTON_SIZE_CLASSES, BUTTON_VARIANT_CLASSES } from './components/ui/buttonStyles'
import Accounts from './pages/Accounts'
import Dashboard from './pages/Dashboard'
import Playlists from './pages/Playlists'
import Settings from './pages/Settings'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Page not found</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">That page doesn't exist in Omni Playlist Sync.</p>
      <Link to="/" className={`${BUTTON_BASE_CLASSES} ${BUTTON_SIZE_CLASSES.md} ${BUTTON_VARIANT_CLASSES.primary}`}>
        Back to Dashboard
      </Link>
    </div>
  )
}
