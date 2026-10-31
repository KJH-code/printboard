import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPrinters, subscribePrinters } from '../lib/data'
import type { Printer } from '../types'
import { Icon } from '../components/Icon'
import { PageTitle } from '../components/PageTitle'
import { PrinterBadge } from '../components/StatusBadge'

function remaining(endsAt: string | null) {
  if (!endsAt) return null
  const minutes = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 60_000)
  if (minutes <= 0) return '완료 예정 시간이 지났어요'
  if (minutes < 60) return `약 ${minutes}분 남음`
  return `약 ${Math.floor(minutes / 60)}시간 ${minutes % 60}분 남음`
}

export function BoardPage() {
  const [printers, setPrinters] = useState<Printer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [realtimeState, setRealtimeState] = useState<'demo' | 'connecting' | 'connected' | 'error'>('connecting')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getPrinters()
      .then((items) => { if (active) setPrinters(items) })
      .catch(() => { if (active) setError('프린터 정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.') })
      .finally(() => { if (active) setLoading(false) })
    const unsubscribe = subscribePrinters(setPrinters, setRealtimeState)
    return () => { active = false; unsubscribe() }
  }, [refreshKey])

  const counts = useMemo(() => printers.reduce((acc, printer) => {
    acc[printer.status] += 1
    return acc
  }, { idle: 0, printing: 0, broken: 0 }), [printers])

  return (
    <section className="page page-board">
      <PageTitle
        eyebrow="메이커실 · PRINTER STATUS"
        title="프린터 현황"
        description="가동 상태를 확인하고, 필요한 경우 프린터 앞 QR로 정보를 갱신하세요."
        action={<Link className="button button-green" to="/qr"><Icon name="qr" /> QR 시트 보기</Link>}
      />

      <div className="summary-strip" aria-label="프린터 상태 요약">
        <div className="summary-label"><span className="summary-icon"><Icon name="printer" /></span><span><b>전체 장비</b><small>MAKERSPACE · P1S</small></span></div>
        <div className="summary-stats">
          <div className="summary-stat"><strong>{printers.length}</strong><span>전체</span></div>
          <div className="summary-stat stat-idle"><strong>{counts.idle}</strong><span>비어 있음</span></div>
          <div className="summary-stat stat-printing"><strong>{counts.printing}</strong><span>출력 중</span></div>
          <div className="summary-stat stat-broken"><strong>{counts.broken}</strong><span>점검 필요</span></div>
        </div>
      </div>

      {error && <div className="notice notice-error" role="alert"><Icon name="alert" /><span>{error}</span><button className="button button-outline notice-action" type="button" onClick={() => setRefreshKey((key) => key + 1)}>다시 시도</button></div>}
      {loading ? <div className="loading-panel"><span className="spinner" />장비 상태를 불러오는 중…</div> : (
        <div className="section-block">
          <div className="section-heading">
            <div><span className="section-kicker">DEVICE OVERVIEW</span><h2>프린터 8대</h2></div>
            <span className={`updated-indicator realtime-${realtimeState}`} role="status"><span className="pulse-dot" />{realtimeState === 'demo' ? '브라우저 내 샘플 상태' : realtimeState === 'connected' ? '실시간 구독 중' : realtimeState === 'error' ? '실시간 연결 끊김' : '실시간 연결 중'}</span>
          </div>
          {realtimeState === 'error' && <div className="notice notice-warning" role="status"><Icon name="alert" /><span>현재 표시된 정보가 최신이 아닐 수 있어요. 보드 데이터를 다시 불러오려면 눌러 주세요.</span><button className="button button-outline notice-action" type="button" onClick={() => setRefreshKey((key) => key + 1)}>새로고침</button></div>}
          <div className="printer-grid">
            {printers.map((printer) => (
              <Link className={`printer-card card-${printer.status}`} to={`/p/${printer.id}`} key={printer.id}>
                <div className="printer-card-top">
                  <span className="printer-illustration"><Icon name="printer" /></span>
                  <PrinterBadge status={printer.status} />
                </div>
                <div className="printer-card-title"><span className="device-number">DEVICE {String(printer.id).padStart(2, '0')}</span><h3>{printer.name}</h3></div>
                <div className="printer-card-detail">
                  {printer.status === 'printing' ? <><span><Icon name="clock" />{remaining(printer.ends_at)}</span><small>출력자 · {printer.user_name || '이름 미입력'}</small></> : null}
                  {printer.status === 'broken' ? <span className="broken-note"><Icon name="alert" />{printer.note || '점검 메모가 없습니다.'}</span> : null}
                  {printer.status === 'idle' ? <span className="idle-note"><Icon name="check" />바로 사용 가능</span> : null}
                </div>
                <span className="card-link">상태 확인 <Icon name="arrow" /></span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="board-footnote"><Icon name="clock" />표시되는 정보는 사용자가 마지막으로 갱신한 상태입니다. 현장에서 프린터를 확인해 주세요.</div>
    </section>
  )
}
