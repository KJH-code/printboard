import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'

const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))
const BoardPage = lazy(() => import('./pages/BoardPage').then((module) => ({ default: module.BoardPage })))
const PrinterPage = lazy(() => import('./pages/PrinterPage').then((module) => ({ default: module.PrinterPage })))
const QrPage = lazy(() => import('./pages/QrPage').then((module) => ({ default: module.QrPage })))
const RequestPage = lazy(() => import('./pages/RequestPage').then((module) => ({ default: module.RequestPage })))
const TrackPage = lazy(() => import('./pages/TrackPage').then((module) => ({ default: module.TrackPage })))

export function App() {
  return (
    <HashRouter>
      <Shell>
        <Suspense fallback={<div className="loading-panel"><span className="spinner" />화면을 여는 중…</div>}>
          <Routes>
            <Route path="/" element={<BoardPage />} />
            <Route path="/p/:id" element={<PrinterPage />} />
            <Route path="/request" element={<RequestPage />} />
            <Route path="/track" element={<TrackPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/qr" element={<QrPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </HashRouter>
  )
}
