import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PageTitle } from '../components/PageTitle'

const printers = Array.from({ length: 8 }, (_, index) => index + 1)

function getUrl(id: number) {
  return `${window.location.origin}${window.location.pathname}#/p/${id}`
}

export function QrPage() {
  return (
    <section className="page page-qr">
      <PageTitle eyebrow="PRINTER QR LABELS" title="프린터 QR 시트" description="각 프린터에 붙일 QR을 인쇄해 현장에서 상태를 바로 갱신하세요." action={<button className="button button-green" type="button" onClick={() => window.print()}><Icon name="file" /> 인쇄하기</button>} />
      <div className="qr-instructions"><span className="qr-instructions-icon"><Icon name="qr" /></span><div><strong>프린터 번호와 QR이 맞는지 확인해 주세요</strong><p>QR을 스캔하면 해당 프린터의 상태 변경 화면이 열립니다.</p></div></div>
      <div className="qr-grid">
        {printers.map((id) => (
          <article className="qr-card panel" key={id}>
            <div className="qr-card-heading"><span className="device-number">DEVICE {String(id).padStart(2, '0')}</span><span className="qr-card-id">#{String(id).padStart(2, '0')}</span></div>
            <Link className="qr-image" to={`/p/${id}`} aria-label={`프린터 ${id} QR 열기`}><QRCodeSVG value={getUrl(id)} size={160} level="M" includeMargin bgColor="#ffffff" fgColor="#253033" /></Link>
            <h2>프린터 {String(id).padStart(2, '0')}</h2>
            <code>{`/#/p/${id}`}</code>
          </article>
        ))}
      </div>
      <div className="qr-print-footer"><span>PrintBoard · 메이커실</span><span>QR을 프린터 번호에 맞춰 부착하세요.</span></div>
    </section>
  )
}
