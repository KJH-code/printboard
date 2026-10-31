import type { PrinterStatus, RequestStatus } from '../types'

const printerLabels: Record<PrinterStatus, string> = { idle: '비어 있음', printing: '출력 중', broken: '점검 필요' }
const requestLabels: Record<RequestStatus, string> = { pending: '대기', accepted: '접수됨', printing: '출력 중', done: '완료', rejected: '반려' }

export function PrinterBadge({ status }: { status: PrinterStatus }) {
  return <span className={`status-badge printer-${status}`}><span className="badge-dot" />{printerLabels[status]}</span>
}

export function RequestBadge({ status }: { status: RequestStatus }) {
  return <span className={`status-badge request-${status}`}><span className="badge-dot" />{requestLabels[status]}</span>
}
