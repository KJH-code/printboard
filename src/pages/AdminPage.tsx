import { type FormEvent, useCallback, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { PageTitle } from '../components/PageTitle'
import { RequestBadge } from '../components/StatusBadge'
import { getPrinters, getRequestFileUrl, isDemoMode, listAdminRequests, updateAdminRequest } from '../lib/data'
import type { PrintRequest, Printer, RequestStatus } from '../types'

const statuses: { value: RequestStatus; label: string }[] = [
  { value: 'accepted', label: '접수' },
  { value: 'printing', label: '출력 중' },
  { value: 'done', label: '완료' },
  { value: 'rejected', label: '반려' },
]

type Filter = 'active' | 'all' | RequestStatus

const filters: { value: Filter; label: string }[] = [
  { value: 'active', label: '처리할 것' },
  { value: 'pending', label: '대기' },
  { value: 'accepted', label: '접수됨' },
  { value: 'printing', label: '출력 중' },
  { value: 'done', label: '완료' },
  { value: 'rejected', label: '반려' },
  { value: 'all', label: '전체' },
]

const activeStatuses: RequestStatus[] = ['pending', 'accepted', 'printing']
const printerStatusLabels = { idle: '비어 있음', printing: '출력 중', broken: '점검 필요' } as const

function matches(filter: Filter, status: RequestStatus) {
  if (filter === 'all') return true
  if (filter === 'active') return activeStatuses.includes(status)
  return filter === status
}

function age(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return '방금 접수'
  if (minutes < 60) return `${minutes}분 전 접수`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전 접수`
  return `${Math.floor(hours / 24)}일 전 접수`
}

function fileLabel(path: string) {
  const extension = path.split('.').pop()?.toUpperCase() ?? '파일'
  return `${extension} 파일 받기`
}

function isInvalidPasswordError(reason: unknown) {
  return typeof reason === 'object' && reason !== null && 'code' in reason && reason.code === '28000'
}

export function AdminPage() {
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [requests, setRequests] = useState<PrintRequest[]>([])
  const [printers, setPrinters] = useState<Printer[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [openingFile, setOpeningFile] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<Filter>('active')

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { active: 0, all: 0, pending: 0, accepted: 0, printing: 0, done: 0, rejected: 0 }
    for (const request of requests) {
      result.all += 1
      result[request.status] += 1
      if (activeStatuses.includes(request.status)) result.active += 1
    }
    return result
  }, [requests])

  const visible = useMemo(() => requests.filter((request) => matches(filter, request.status)), [requests, filter])

  const loadRequests = useCallback(async (pw: string) => {
    setLoading(true)
    setError('')
    try {
      const [items, printerItems] = await Promise.all([listAdminRequests(pw), getPrinters()])
      setRequests(items)
      setPrinters(printerItems)
      setAuthenticated(true)
    } catch (reason) {
      setAuthenticated(false)
      setRequests([])
      setError(isInvalidPasswordError(reason) ? '비밀번호가 맞지 않습니다.' : '요청 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    if (isDemoMode()) {
      setError('데모 모드에서는 관리자 접속을 확인할 수 없습니다. Supabase를 연결해 주세요.')
      return
    }
    await loadRequests(password)
  }

  async function handleUpdate(request: PrintRequest, status: RequestStatus, printerId: number | null = request.printer_id) {
    setError('')
    setNotice('')
    setUpdatingId(request.id)
    try {
      await updateAdminRequest({ password, requestId: request.id, status, printerId })
      await loadRequests(password)
      setNotice(`${request.requester_name}님의 접수 상태를 변경했습니다.`)
    } catch (reason) {
      setError(isInvalidPasswordError(reason) ? '비밀번호 확인이 만료됐습니다. 다시 접속해 주세요.' : '상태를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleOpenFile(path: string) {
    setError('')
    setOpeningFile(path)
    try {
      const signedUrl = await getRequestFileUrl(path, password)
      window.location.assign(signedUrl)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '파일 링크를 만들지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setOpeningFile(null)
    }
  }

  function logout() {
    setAuthenticated(false)
    setRequests([])
    setPassword('')
    setError('')
    setNotice('')
  }

  return (
    <section className="page page-admin">
      <PageTitle eyebrow="ADMIN CONSOLE" title="출력 접수 관리" description="관리자 비밀번호로 접수 목록을 확인하고 처리 상태를 갱신합니다." action={authenticated ? <button className="button button-outline" type="button" onClick={logout}>나가기</button> : undefined} />

      {!authenticated ? (
        <div className="admin-login-wrap">
          <div className="admin-login panel">
            <div className="login-icon"><Icon name="admin" /></div>
            <span className="section-kicker">AUTHORIZED ACCESS</span>
            <h2>관리자 확인</h2>
            <p>접수자의 정보는 관리자만 볼 수 있습니다.</p>
            <form onSubmit={handleLogin}>
              <label className="field"><span>관리자 비밀번호</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호 입력" /></label>
              {error && <div className="notice notice-error" role="alert"><Icon name="alert" />{error}</div>}
              <button className="button button-green button-large full-width" type="submit" disabled={loading}>{loading ? '확인 중…' : '접속하기'}<Icon name="arrow" /></button>
            </form>
            {isDemoMode() && <p className="demo-helper">데모 모드에서는 실제 관리자 인증을 할 수 없습니다.</p>}
          </div>
        </div>
      ) : (
        <div className="admin-content">
          <div className="admin-toolbar panel">
            <div><span className="section-kicker">REQUEST QUEUE</span><h2>접수 목록 <span className="count-chip">{requests.length}</span></h2></div>
            <button className="button button-outline" type="button" onClick={() => void loadRequests(password)} disabled={loading}><Icon name="refresh" />새로고침</button>
          </div>
          <div className="admin-filters" role="tablist" aria-label="접수 상태로 거르기">
            {filters.map((item) => (
              <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} className={`filter-chip${filter === item.value ? ' active' : ''}${item.value === 'pending' && counts.pending > 0 ? ' attention' : ''}`} onClick={() => setFilter(item.value)}>
                {item.label}<span>{counts[item.value]}</span>
              </button>
            ))}
          </div>
          {error && <div className="notice notice-error" role="alert"><Icon name="alert" />{error}</div>}
          {notice && <div className="notice notice-success" role="status"><Icon name="check" />{notice}</div>}
          {!loading && requests.length > 0 && visible.length === 0 && (
            <div className="empty-panel panel"><span className="empty-icon"><Icon name="check" /></span><h3>{filter === 'active' ? '처리할 접수가 없어요' : '이 상태의 접수가 없어요'}</h3><p>다른 탭에서 지난 접수를 볼 수 있어요.</p></div>
          )}
          {loading && requests.length === 0 ? <div className="loading-panel"><span className="spinner" />접수 목록을 불러오는 중…</div> : requests.length === 0 ? (
            <div className="empty-panel panel"><span className="empty-icon"><Icon name="request" /></span><h3>접수된 요청이 없습니다</h3><p>새 접수가 들어오면 이곳에 표시됩니다.</p></div>
          ) : (
            <div className="request-list">
              {visible.map((request) => {
                return (
                  <article className="request-row panel" key={request.id}>
                    <div className="request-row-main">
                      <div className="request-row-heading"><span className="request-date">{new Date(request.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span className={`request-age${request.status === 'pending' ? ' waiting' : ''}`}>{age(request.created_at)}</span><RequestBadge status={request.status} /></div>
                      <div className="request-person"><strong>{request.requester_name}</strong><span>학번·교번 {request.member_no}</span></div>
                      <a className="file-link" href="#" aria-busy={openingFile === request.file_path} onClick={(event) => { event.preventDefault(); void handleOpenFile(request.file_path) }}><Icon name="file" />{openingFile === request.file_path ? '임시 링크 만드는 중…' : fileLabel(request.file_path)}<Icon name="external" /></a>
                      {request.note && <p className="request-note">{request.note}</p>}
                    </div>
                    <div className="request-row-actions">
                      <label className="field printer-select"><span>배정 프린터</span><select value={request.printer_id ?? ''} onChange={(event) => void handleUpdate(request, request.status, event.target.value ? Number(event.target.value) : null)} disabled={updatingId === request.id}><option value="">미배정</option>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printerStatusLabels[printer.status]}</option>)}</select></label>
                      <div className="status-action-group" aria-label="접수 상태 변경">{statuses.map((status) => <button key={status.value} type="button" className={`mini-status${request.status === status.value ? ' chosen' : ''}`} disabled={updatingId === request.id || request.status === status.value} onClick={() => void handleUpdate(request, status.value)}>{status.label}</button>)}</div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
