import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPrinters, subscribePrinters } from '../lib/data'
import type { Printer } from '../types'
import { Icon } from '../components/Icon'
import { PageTitle } from '../components/PageTitle'
import { PrinterBadge } from '../components/StatusBadge'

function duration(minutes: number) {
  if (minutes < 60) return `약 ${minutes}분`
  const rest = minutes % 60
  if (rest === 0) return `약 ${Math.floor(minutes / 60)}시간`
  return `약 ${Math.floor(minutes / 60)}시간 ${rest}분`
}

function minutesLeft(endsAt: string | null, now: number) {
  if (!endsAt) return null
  return Math.ceil((new Date(endsAt).getTime() - now) / 60_000)
}

// 출력 중인데 예정 시각이 지났으면 실제로는 끝났을 가능성이 높다
function isOverdue(printer: Printer, now: number) {
  const left = minutesLeft(printer.ends_at, now)
  return printer.status === 'printing' && left !== null && left <= 0
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function shortName(printer: Printer) {
  return printer.name.replace('프린터', '').trim() || String(printer.id)
}

function NextUp({ printers, now }: { printers: Printer[]; now: number }) {
  if (printers.length === 0) return null
  const idle = printers.filter((printer) => printer.status === 'idle')
  const overdue = printers.filter((printer) => isOverdue(printer, now))
  const upcoming = printers
    .filter((printer) => printer.status === 'printing' && !isOverdue(printer, now) && printer.ends_at)
    .sort((a, b) => new Date(a.ends_at ?? 0).getTime() - new Date(b.ends_at ?? 0).getTime())
  const soonest = upcoming[0]

  let tone = 'next-wait'
  let label = '지금 쓸 수 있는 프린터가 없어요'
  let detail = '점검이 끝나거나 출력이 끝나면 여기에 표시돼요.'
  if (idle.length > 0) {
    tone = 'next-ready'
    label = `지금 바로 쓸 수 있어요 · ${idle.length}대`
    detail = `프린터 ${idle.map(shortName).join(', ')}`
  } else if (soonest) {
    const left = minutesLeft(soonest.ends_at, now) ?? 0
    tone = 'next-soon'
    label = `다음으로 비는 프린터 · ${soonest.name}`
    detail = `${duration(left)} 뒤 (${clockTime(soonest.ends_at ?? '')} 예정, 입력된 시간 기준)`
  } else if (overdue.length > 0) {
    tone = 'next-soon'
    label = '끝났을 수 있는 프린터가 있어요'
    detail = '아래 주황색 카드는 예정 시간이 지났어요. 가서 확인해 보세요.'
  }

  return (
    <div className={`next-up ${tone}`} role="status">
      <span className="next-up-icon"><Icon name={tone === 'next-ready' ? 'check' : 'clock'} /></span>
      <div><b>{label}</b><span>{detail}</span></div>
      {overdue.length > 0 && (idle.length > 0 || soonest) && (
        <small className="next-up-extra"><Icon name="alert" />{overdue.map((printer) => printer.name).join(', ')} · 예정 시간이 지나 끝났을 수 있어요</small>
      )}
    </div>
  )
}

export function BoardPage() {
  const [printers, setPrinters] = useState<Printer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [realtimeState, setRealtimeState] = useState<'demo' | 'connecting' | 'connected' | 'error'>('connecting')
  const [refreshKey, setRefreshKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [flashing, setFlashing] = useState<number[]>([])
  const seen = useRef<Map<number, string> | null>(null)

  // 실시간으로 바뀐 프린터 카드를 잠깐 강조해서 어디가 바뀌었는지 보이게 한다
  useEffect(() => {
    if (printers.length === 0) return
    const next = new Map(printers.map((printer) => [printer.id, `${printer.status}|${printer.updated_at}`]))
    const before = seen.current
    seen.current = next
    if (!before) return
    const changed = printers.filter((printer) => before.has(printer.id) && before.get(printer.id) !== next.get(printer.id)).map((printer) => printer.id)
    if (changed.length === 0) return
    setFlashing((current) => [...current, ...changed])
    const timer = window.setTimeout(() => setFlashing((current) => current.filter((id) => !changed.includes(id))), 1800)
    return () => window.clearTimeout(timer)
  }, [printers])

  // 남은 시간과 '시간 지남' 표시가 저절로 갱신되도록 30초마다 다시 계산한다
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

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

      <div className="summary-strip" data-tour="summary" aria-label="프린터 상태 요약">
        <div className="summary-label"><span className="summary-icon"><Icon name="printer" /></span><span><b>전체 장비</b><small>MAKERSPACE · P1S</small></span></div>
        <div className="summary-stats">
          <div className="summary-stat"><strong>{printers.length}</strong><span>전체</span></div>
          <div className="summary-stat stat-idle"><strong>{counts.idle}</strong><span>비어 있음</span></div>
          <div className="summary-stat stat-printing"><strong>{counts.printing}</strong><span>출력 중</span></div>
          <div className="summary-stat stat-broken"><strong>{counts.broken}</strong><span>점검 필요</span></div>
        </div>
      </div>

      {!loading && !error && <NextUp printers={printers} now={now} />}

      {error && <div className="notice notice-error" role="alert"><Icon name="alert" /><span>{error}</span><button className="button button-outline notice-action" type="button" onClick={() => setRefreshKey((key) => key + 1)}>다시 시도</button></div>}
      {loading ? <div className="loading-panel"><span className="spinner" />장비 상태를 불러오는 중…</div> : (
        <div className="section-block">
          <div className="section-heading">
            <div><span className="section-kicker">DEVICE OVERVIEW</span><h2>프린터 8대</h2></div>
            <span data-tour="realtime" className={`updated-indicator realtime-${realtimeState}`} role="status"><span className="pulse-dot" />{realtimeState === 'demo' ? '브라우저 내 샘플 상태' : realtimeState === 'connected' ? '실시간 구독 중' : realtimeState === 'error' ? '실시간 연결 끊김' : '실시간 연결 중'}</span>
          </div>
          {realtimeState === 'error' && <div className="notice notice-warning" role="status"><Icon name="alert" /><span>현재 표시된 정보가 최신이 아닐 수 있어요. 보드 데이터를 다시 불러오려면 눌러 주세요.</span><button className="button button-outline notice-action" type="button" onClick={() => setRefreshKey((key) => key + 1)}>새로고침</button></div>}
          <div className="printer-grid">
            {printers.map((printer, index) => {
              const overdue = isOverdue(printer, now)
              const left = minutesLeft(printer.ends_at, now)
              return (
              <Link className={`printer-card card-${printer.status}${overdue ? ' card-overdue' : ''}${flashing.includes(printer.id) ? ' card-flash' : ''}`} to={`/p/${printer.id}`} key={printer.id} data-tour={index === 0 ? 'printer-card' : undefined}>
                <div className="printer-card-top">
                  <span className="printer-illustration"><Icon name="printer" /></span>
                  {overdue ? <span className="status-badge printer-overdue"><span className="badge-dot" />확인 필요</span> : <PrinterBadge status={printer.status} />}
                </div>
                <div className="printer-card-title"><span className="device-number">DEVICE {String(printer.id).padStart(2, '0')}</span><h3>{printer.name}</h3></div>
                <div className="printer-card-detail">
                  {printer.status === 'printing' && overdue ? <><span className="overdue-note"><Icon name="alert" />{clockTime(printer.ends_at ?? '')} 완료 예정 · 끝났을 수 있어요</span><small>현장에서 확인 후 QR로 비워 주세요</small></> : null}
                  {printer.status === 'printing' && !overdue ? <><span><Icon name="clock" />{left === null ? '종료 시간 미입력' : `${duration(left)} 남음`}</span><small>출력자 · {printer.user_name || '이름 미입력'}</small></> : null}
                  {printer.status === 'broken' ? <span className="broken-note"><Icon name="alert" />{printer.note || '점검 메모가 없습니다.'}</span> : null}
                  {printer.status === 'idle' ? <span className="idle-note"><Icon name="check" />바로 사용 가능</span> : null}
                </div>
                <span className="card-link">상태 확인 <Icon name="arrow" /></span>
              </Link>
              )
            })}
          </div>
        </div>
      )}
      <div className="board-footnote"><Icon name="clock" />표시되는 정보는 사용자가 마지막으로 갱신한 상태입니다. 현장에서 프린터를 확인해 주세요.</div>
    </section>
  )
}
