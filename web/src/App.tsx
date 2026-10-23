import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { MapPinned } from 'lucide-react'
import { useAuthStore } from './stores/auth'
import { Spinner } from './components/ui/spinner'
import { Toaster } from './components/ui/toast'
import LoginPage from './features/auth/login-page'
import RegisterPage from './features/auth/register-page'
import TripsPage from './features/trips/trips-page'
import TripEditorPage from './features/trip/trip-editor-page'
import TripPrintPage from './features/trip/trip-print-page'
import SharePage from './features/share/share-page'

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()
  if (status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-600 text-white">
        <MapPinned className="size-6" />
      </span>
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner />
        旅图加载中…
      </p>
    </div>
  )
}

export default function App() {
  const status = useAuthStore((s) => s.status)
  const restoreSession = useAuthStore((s) => s.restoreSession)

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  if (status === 'idle') return <BootSplash />

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        {/* 免登录分享只读页 */}
        <Route path="/share/:id" element={<SharePage />} />
        <Route
          path="/trips"
          element={
            <RequireAuth>
              <TripsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/trips/:id"
          element={
            <RequireAuth>
              <TripEditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/trips/:id/print"
          element={
            <RequireAuth>
              <TripPrintPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/trips" replace />} />
        <Route path="*" element={<Navigate to="/trips" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
