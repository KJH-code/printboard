import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Icon } from './Icon'
import { demoMode } from '../lib/config'
import { Tour } from './Tour'

const links = [
  { to: '/', label: '상태 보드', icon: 'home' as const, end: true },
  { to: '/request', label: '출력 접수', icon: 'request' as const },
  { to: '/track', label: '접수 조회', icon: 'clock' as const },
  { to: '/admin', label: '관리자', icon: 'admin' as const },
  { to: '/qr', label: 'QR 시트', icon: 'qr' as const },
]

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="PrintBoard 홈">
          <span className="brand-mark"><Icon name="printer" /></span>
          <span><strong>PrintBoard</strong><small>메이커실 · P1S</small></span>
        </NavLink>
        <nav className="main-nav" aria-label="주요 메뉴">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} data-tour={`nav-${link.to.slice(1) || 'home'}`} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon name={link.icon} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          {demoMode && <span className="connection-pill demo"><span className="connection-dot" />데모 모드</span>}
        </div>
      </header>
      {demoMode && (
        <div className="demo-banner" role="status">
          <span>데모 화면</span>
          <span>Supabase 키가 연결되지 않아 샘플 데이터만 표시합니다. 실제 접수·변경 내용은 저장되지 않습니다.</span>
        </div>
      )}
      <main className="workspace">{children}</main>
      <Tour />
      <footer className="site-footer"><span>PrintBoard · 학교 메이커실</span><span>프린터 상태는 현장 사용자가 직접 갱신합니다.</span></footer>
    </div>
  )
}
