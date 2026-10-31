export type PrinterStatus = 'idle' | 'printing' | 'broken'

export type RequestStatus = 'pending' | 'accepted' | 'printing' | 'done' | 'rejected'

export type Printer = {
  id: number
  name: string
  status: PrinterStatus
  user_name: string | null
  ends_at: string | null
  note: string | null
  updated_at: string
}

export type PrintRequest = {
  id: string
  requester_name: string
  member_no: string
  file_path: string
  note: string | null
  status: RequestStatus
  printer_id: number | null
  created_at: string
}
