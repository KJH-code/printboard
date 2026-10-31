import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PageTitle } from '../components/PageTitle'
import { PrinterBadge } from '../components/StatusBadge'
import { getPrinters, isDemoMode, updatePrinterStatus } from '../lib/data'
import type { Printer, PrinterStatus } from '../types'

const choices: { value: PrinterStatus; label: string; detail: string }[] = [
  { value: 'idle', label: '비어 있음', detail: '출력할 수 있어요' },
  { value: 'printing', label: '출력 시작', detail: '예상 시간을 남겨요' },
  { value: 'broken', label: '고장 신고', detail: '다음 사용자를 위해 알려요' },
]

export function PrinterPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const printerId = Number(id)
  const [printer, setPrinter] = useState<Printer | null>(null)
  const [selected, setSelected] = useState<PrinterStatus>('idle')
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('60')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    if (!Number.isInteger(printerId) || printerId < 1 || printerId > 8) {
      setLoading(false)
      return
    }
    getPrinters()
      .then((items) => {
        const current = items.find((item) => item.id === printerId)
        if (active) {
          setPrinter(current ?? null)
          setSelected(current?.status ?? 'idle')
        }
      })
      .catch(() => { if (active) setError('프린터 상태를 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [printerId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!printer) return
    setError('')
    setSaved(false)
    setSaving(true)
    const endsAt = selected === 'printing' ? new Date(Date.now() + Number(minutes) * 60_000).toISOString() : null
    try {
      await updatePrinterStatus({
        printerId,
        status: selected,
        userName: selected === 'printing' ? name.trim() : null,
        endsAt,
        note: selected === 'broken' ? note.trim() : null,
      })
      const updated = (await getPrinters()).find((item) => item.id === printerId)
      if (updated) setPrinter(updated)
      setSaved(true)
      window.setTimeout(() => navigate('/'), 1500)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '상태를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <section className="page"><div className="loading-panel"><span className="spinner" />프린터 정보를 불러오는 중…</div></section>
  if (!printer) return <section className="page"><div className="empty-panel"><Icon name="alert" /><h1>프린터를 찾을 수 없어요</h1><p>QR 주소가 맞는지 확인해 주세요.</p><Link className="button button-dark" to="/">상태 보드로 돌아가기</Link></div></section>

  return (
    <section className="page page-printer">
      <div className="back-row"><Link to="/" className="back-link">← 상태 보드</Link><span className="route-label">DEVICE / {String(printer.id).padStart(2, '0')}</span></div>
      <PageTitle eyebrow="QUICK STATUS UPDATE" title={printer.name} description="현장 상태를 선택하고 저장하면 보드에 바로 반영됩니다." />
      <div className="printer-detail-layout">
        <aside className="device-panel panel">
          <div className={`device-hero device-${printer.status}`}><div className="device-glow" /><Icon name="printer" /><span>P1S</span></div>
          <div className="device-panel-body">
            <span className="section-kicker">CURRENT STATUS</span>
            <div className="current-status"><PrinterBadge status={printer.status} /></div>
            {printer.status === 'printing' && <p className="device-meta">출력자 <strong>{printer.user_name || '이름 미입력'}</strong><br />예상 완료 <strong>{printer.ends_at ? new Date(printer.ends_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '시간 미정'}</strong></p>}
            {printer.status === 'broken' && <p className="device-meta">점검 메모<br /><strong>{printer.note || '등록된 메모가 없습니다.'}</strong></p>}
            <div className="device-panel-divider" />
            <p className="device-meta">최근 갱신<br /><strong>{new Date(printer.updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></p>
          </div>
        </aside>

        <form className="status-form panel" onSubmit={handleSubmit}>
          <div className="panel-heading"><div><span className="section-kicker">UPDATE DEVICE</span><h2>상태 변경</h2></div><span className="quick-tag">현장 QR</span></div>
          <div className="status-choice-grid" role="radiogroup" aria-label="새 프린터 상태">
            {choices.map((choice) => (
              <button key={choice.value} type="button" role="radio" aria-checked={selected === choice.value} className={`status-choice choice-${choice.value}${selected === choice.value ? ' selected' : ''}`} onClick={() => { setSelected(choice.value); setSaved(false) }}>
                <span className="choice-mark">{selected === choice.value && <Icon name="check" />}</span>
                <strong>{choice.label}</strong><small>{choice.detail}</small>
              </button>
            ))}
          </div>

          {selected === 'printing' && (
            <div className="form-grid two-col">
              <label className="field"><span>출력자 이름</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="이름을 입력하세요" autoComplete="name" /></label>
              <label className="field"><span>예상 남은 시간</span><div className="input-with-unit"><input required type="number" min="1" max="1440" value={minutes} onChange={(event) => setMinutes(event.target.value)} /><span>분</span></div></label>
            </div>
          )}
          {selected === 'broken' && <label className="field"><span>점검 메모</span><textarea required maxLength={180} value={note} onChange={(event) => setNote(event.target.value)} placeholder="어떤 문제가 있는지 한 줄로 알려주세요." rows={3} /></label>}

          {error && <div className="notice notice-error" role="alert"><Icon name="alert" />{error}</div>}
          {saved && <div className="notice notice-success" role="status"><Icon name="check" />{isDemoMode() ? '데모 화면에서만 변경했습니다. Supabase에는 저장되지 않았습니다.' : '저장했어요. 상태 보드로 이동합니다.'}</div>}
          <div className="form-actions"><span className="form-hint">상태 변경은 기록으로 남습니다.</span><button className="button button-green button-large" type="submit" disabled={saving}>{saving ? '저장 중…' : '상태 저장'}<Icon name="arrow" /></button></div>
        </form>
      </div>
    </section>
  )
}
