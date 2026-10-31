import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PageTitle } from '../components/PageTitle'
import { submitPrintRequest } from '../lib/data'

export function RequestPage() {
  const [name, setName] = useState('')
  const [memberNo, setMemberNo] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [trackingCode, setTrackingCode] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setTrackingCode('')
    if (!file) {
      setError('출력 파일을 선택해 주세요.')
      return
    }
    setSaving(true)
    try {
      const code = await submitPrintRequest({ requesterName: name, memberNo, file, note })
      setTrackingCode(code)
      setName('')
      setMemberNo('')
      setNote('')
      setFile(null)
      const input = document.getElementById('print-file') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '접수하지 못했습니다. 입력 내용을 확인해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page page-request">
      <PageTitle eyebrow="PRINT REQUEST" title="출력 접수" description="파일과 신청 정보를 남기면 담당자가 확인 후 순서를 안내합니다." />
      <div className="request-layout">
        <form className="request-form panel" onSubmit={handleSubmit}>
          <div className="panel-heading"><div><span className="section-kicker">NEW REQUEST</span><h2>신청 정보</h2></div><span className="required-note">* 필수 입력</span></div>
          <div className="form-grid two-col">
            <label className="field"><span>이름 <i>*</i></span><input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="신청자 이름" autoComplete="name" /></label>
            <label className="field"><span>학번 또는 교번 <i>*</i></span><input required maxLength={30} value={memberNo} onChange={(event) => setMemberNo(event.target.value)} placeholder="예: 20301" autoComplete="off" /></label>
          </div>
          <label className="field"><span>출력 파일 <i>*</i></span>
            <div className={`file-dropzone${file ? ' has-file' : ''}`}>
              <input id="print-file" type="file" accept=".3mf,.stl,model/stl,application/vnd.ms-package.3dmanufacturing-3dmodel+xml" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <span className="upload-icon"><Icon name={file ? 'file' : 'upload'} /></span>
              <strong>{file ? file.name : '파일을 선택하거나 여기에 놓으세요'}</strong>
              <small>{file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB · ${file.name.split('.').pop()?.toUpperCase()} 파일` : '.3mf 또는 .stl 파일'}</small>
              {!file && <span className="button button-outline">파일 선택</span>}
            </div>
          </label>
          <label className="field"><span>요청 메모 <small>(선택)</small></span><textarea maxLength={300} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="재료, 일정 등 담당자에게 남길 내용" /></label>
          <div className="privacy-note"><Icon name="admin" /><p><strong>개인정보 안내</strong><br />이름과 학번·교번은 접수 처리에 사용됩니다. 첨부 파일은 관리자용 링크로 제공되며, 링크가 공유되면 열릴 수 있습니다.</p></div>
          <div className="reservation-note"><strong>접수는 프린터 예약이 아니에요.</strong> 현장 대기 순서와 장비 상황을 확인한 뒤 담당자가 배정합니다.</div>
          {error && <div className="notice notice-error" role="alert"><Icon name="alert" /><span>{error}</span></div>}
          {trackingCode && <div className="notice notice-success tracking-success" role="status"><Icon name="check" /><div><strong>신청이 접수됐어요. 아래 접수번호를 저장해 주세요.</strong><code>{trackingCode}</code><span>접수는 예약이나 출력 확정이 아니며, 현장 확인 후 담당자가 처리합니다.</span><Link to="/track">접수 진행 상태 조회하기 <Icon name="arrow" /></Link></div></div>}
          <div className="form-actions"><span className="form-hint">파일을 올린 뒤에도 출력 가능 여부는 현장 상황에 따라 달라질 수 있어요.</span><button className="button button-green button-large" type="submit" disabled={saving} aria-busy={saving}>{saving ? <><span className="spinner button-spinner" />접수 중…</> : <>출력 접수하기<Icon name="arrow" /></>}</button></div>
        </form>
        <aside className="request-aside">
          <div className="aside-card panel"><span className="aside-number">01</span><h3>파일을 준비해요</h3><p>슬라이싱한 .3mf 또는 .stl 파일을 올려 주세요.</p></div>
          <div className="aside-card panel"><span className="aside-number">02</span><h3>담당자가 확인해요</h3><p>접수한 요청은 관리자 화면에서 순서대로 확인합니다.</p></div>
          <div className="aside-callout"><Icon name="printer" /><div><b>먼저 장비 상태를 확인해 보세요</b><p>바로 사용할 수 있는 프린터를 찾을 수 있습니다.</p><Link to="/">프린터 현황 보기 <Icon name="arrow" /></Link></div></div>
        </aside>
      </div>
    </section>
  )
}
