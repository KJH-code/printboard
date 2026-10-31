import { type FormEvent, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PageTitle } from '../components/PageTitle'
import { getQrTokens, isDemoMode } from '../lib/data'

const printers = Array.from({ length: 8 }, (_, index) => index + 1)

function isInvalidPasswordError(reason: unknown) {
  return typeof reason === 'object' && reason !== null && 'code' in reason && reason.code === '28000'
}

function routeFor(id: number, token: string | undefined) {
  if (!token) return `/p/${id}`
  return `/p/${id}?k=${token}`
}

function urlFor(id: number, token: string | undefined) {
  return `${window.location.origin}${window.location.pathname}#${routeFor(id, token)}`
}

export function QrPage() {
  const [password, setPassword] = useState('')
  const [tokens, setTokens] = useState<Record<number, string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      setTokens(await getQrTokens(password))
    } catch (reason) {
      setTokens(null)
      setError(isInvalidPasswordError(reason) ? '비밀번호가 맞지 않습니다.' : 'QR 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  function lock() {
    setTokens(null)
    setPassword('')
  }

  if (!tokens) {
    return (
      <section className="page page-qr">
        <PageTitle eyebrow="PRINTER QR LABELS" title="프린터 QR 시트" description="프린터에 붙일 QR은 관리자만 볼 수 있어요." />
        <div className="admin-login-wrap">
          <div className="admin-login panel">
            <div className="login-icon"><Icon name="qr" /></div>
            <span className="section-kicker">AUTHORIZED ACCESS</span>
            <h2>관리자 확인</h2>
            <p>QR에는 현장에서만 상태를 바꿀 수 있게 하는 프린터별 비밀 값이 들어 있어요. 그래서 이 시트는 관리자만 열 수 있어요.</p>
            <form onSubmit={handleLogin}>
              <label className="field"><span>관리자 비밀번호</span><input type="password" autoComplete="current-password" required={!isDemoMode()} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호 입력" /></label>
              {error && <div className="notice notice-error" role="alert"><Icon name="alert" />{error}</div>}
              <button className="button button-green button-large full-width" type="submit" disabled={loading}>{loading ? '확인 중…' : 'QR 시트 열기'}<Icon name="arrow" /></button>
            </form>
            {isDemoMode() && <p className="demo-helper">데모 모드에서는 비밀 값 없이 주소만 담긴 QR을 보여 줘요.</p>}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="page page-qr">
      <PageTitle
        eyebrow="PRINTER QR LABELS"
        title="프린터 QR 시트"
        description="각 프린터에 붙일 QR을 인쇄하세요. 이 QR을 찍어야만 상태를 바꿀 수 있어요."
        action={<div className="qr-actions"><button className="button button-outline" type="button" onClick={lock}>닫기</button><button className="button button-green" type="button" onClick={() => window.print()}><Icon name="file" /> 인쇄하기</button></div>}
      />
      <div className="qr-instructions"><span className="qr-instructions-icon"><Icon name="qr" /></span><div><strong>프린터 번호와 QR이 맞는지 확인해 주세요</strong><p>QR 사진이 밖으로 퍼지면 그 프린터의 비밀 값을 바꾸고 다시 인쇄하면 돼요. 카드의 QR을 누르면 이 기기에서 바로 열려요.</p></div></div>
      <div className="qr-grid">
        {printers.map((id) => (
          <article className="qr-card panel" key={id}>
            <div className="qr-card-heading"><span className="device-number">DEVICE {String(id).padStart(2, '0')}</span><span className="qr-card-id">#{String(id).padStart(2, '0')}</span></div>
            <Link className="qr-image" to={routeFor(id, tokens[id])} aria-label={`프린터 ${id} 상태 변경 화면 열기`}><QRCodeSVG value={urlFor(id, tokens[id])} size={160} level="M" includeMargin bgColor="#ffffff" fgColor="#253033" /></Link>
            <h2>프린터 {String(id).padStart(2, '0')}</h2>
            <code>{`/#/p/${id}`}{tokens[id] ? ' · 현장 전용' : ''}</code>
          </article>
        ))}
      </div>
      <div className="qr-print-footer"><span>PrintBoard · 메이커실</span><span>QR을 찍어 상태를 바꿔 주세요.</span></div>
    </section>
  )
}
