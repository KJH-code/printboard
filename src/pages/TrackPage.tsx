import { type FormEvent, useState } from 'react'
import { Icon } from '../components/Icon'
import { PageTitle } from '../components/PageTitle'
import { RequestBadge } from '../components/StatusBadge'
import { getPublicRequestStatus, type PublicRequestStatus } from '../lib/data'

const statusDetails = {
  pending: '담당자가 신청을 확인하기 전입니다.',
  accepted: '담당자가 신청을 확인했습니다. 프린터 예약이나 출력 확정은 아닙니다.',
  printing: '출력이 진행 중입니다.',
  done: '신청한 출력이 완료 처리됐습니다.',
  rejected: '이번 신청은 진행하기 어렵다고 처리됐습니다. 담당자에게 문의해 주세요.',
} as const

export function TrackPage() {
  const [trackingCode, setTrackingCode] = useState('')
  const [memberNo, setMemberNo] = useState('')
  const [result, setResult] = useState<PublicRequestStatus | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)
    try {
      setResult(await getPublicRequestStatus(trackingCode, memberNo))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '조회하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page page-track">
      <PageTitle eyebrow="REQUEST TRACKING" title="접수 진행 조회" description="접수번호와 신청할 때 입력한 학번·교번으로 처리 상태를 확인하세요." />
      <div className="track-layout">
        <form className="track-form panel" onSubmit={handleSubmit}>
          <div className="panel-heading"><div><span className="section-kicker">FIND YOUR REQUEST</span><h2>신청 확인</h2></div><span className="quick-tag">신청자 본인 조회</span></div>
          <label className="field"><span>접수번호</span><input required minLength={10} maxLength={10} pattern="[0-9A-Fa-f]{10}" value={trackingCode} onChange={(event) => setTrackingCode(event.target.value.toUpperCase())} placeholder="예: 4A21F09C3B" autoComplete="off" /></label>
          <label className="field"><span>학번 또는 교번</span><input required maxLength={30} value={memberNo} onChange={(event) => setMemberNo(event.target.value)} placeholder="신청할 때 입력한 번호" autoComplete="off" /></label>
          <div className="reservation-note"><strong>접수 순서는 프린터 예약 순서가 아닙니다.</strong> 현장 대기자와 장비 상황을 확인한 뒤 담당자가 실제 배정·출력을 결정합니다.</div>
          {error && <div className="notice notice-error" role="alert"><Icon name="alert" /><span>{error}</span></div>}
          <button className="button button-green button-large full-width" type="submit" disabled={loading} aria-busy={loading}>{loading ? '확인 중…' : '진행 상태 확인'}<Icon name="arrow" /></button>
        </form>
        <aside className="track-result-area" aria-live="polite">
          {result ? (
            <div className="track-result panel">
              <span className="section-kicker">CURRENT STATUS</span>
              <h2>신청 상태</h2>
              <RequestBadge status={result.status} />
              <p>{statusDetails[result.status]}</p>
              {result.printerName && result.status !== 'rejected' && <div className="track-printer"><span>담당자가 연결한 프린터</span><strong>{result.printerName}</strong><small>현장 상황에 따라 실제 출력 장비는 달라질 수 있어요.</small></div>}
              <small className="track-date">접수 시각 · {new Date(result.createdAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
            </div>
          ) : (
            <div className="track-empty panel"><span className="empty-icon"><Icon name="request" /></span><h2>신청 상태가 여기에 표시돼요</h2><p>조회 결과에는 처리 상태와 담당자가 연결한 프린터만 표시됩니다.</p></div>
          )}
        </aside>
      </div>
    </section>
  )
}
