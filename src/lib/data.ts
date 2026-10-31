import type { RealtimeChannel } from '@supabase/supabase-js'
import type { PrintRequest, Printer, PrinterStatus, RequestStatus } from '../types'
import { supabaseConfigured } from './config'
import { supabase } from './supabase'

const demoPrinters: Printer[] = [
  { id: 1, name: '프린터 01', status: 'idle', user_name: null, ends_at: null, note: null, updated_at: new Date().toISOString() },
  { id: 2, name: '프린터 02', status: 'printing', user_name: '김민준', ends_at: new Date(Date.now() + 48 * 60_000).toISOString(), note: null, updated_at: new Date().toISOString() },
  { id: 3, name: '프린터 03', status: 'idle', user_name: null, ends_at: null, note: null, updated_at: new Date().toISOString() },
  { id: 4, name: '프린터 04', status: 'broken', user_name: null, ends_at: null, note: '베드 온도 확인 필요', updated_at: new Date().toISOString() },
  { id: 5, name: '프린터 05', status: 'printing', user_name: '이서연', ends_at: new Date(Date.now() + 92 * 60_000).toISOString(), note: null, updated_at: new Date().toISOString() },
  { id: 6, name: '프린터 06', status: 'idle', user_name: null, ends_at: null, note: null, updated_at: new Date().toISOString() },
  { id: 7, name: '프린터 07', status: 'idle', user_name: null, ends_at: null, note: null, updated_at: new Date().toISOString() },
  { id: 8, name: '프린터 08', status: 'idle', user_name: null, ends_at: null, note: null, updated_at: new Date().toISOString() },
]

const demoListeners = new Set<(printers: Printer[]) => void>()
const publishDemoChange = () => demoListeners.forEach((listener) => listener([...demoPrinters]))

export function isDemoMode() {
  return !supabaseConfigured
}

export async function getPrinters(): Promise<Printer[]> {
  if (!supabase) return [...demoPrinters]
  const { data, error } = await supabase.from('printers').select('id,name,status,user_name,ends_at,note,updated_at').order('id')
  if (error) throw error
  return (data ?? []) as Printer[]
}

export function subscribePrinters(
  onChange: (printers: Printer[]) => void,
  onStatus?: (status: 'demo' | 'connecting' | 'connected' | 'error') => void,
): () => void {
  const client = supabase
  if (!client) {
    onStatus?.('demo')
    demoListeners.add(onChange)
    return () => demoListeners.delete(onChange)
  }

  onStatus?.('connecting')
  const channel: RealtimeChannel = client
    .channel('printers-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'printers' }, async () => {
      try {
        onChange(await getPrinters())
        onStatus?.('connected')
      } catch (error) {
        console.error('프린터 상태를 새로 불러오지 못했습니다.', error)
        onStatus?.('error')
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onStatus?.('connected')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus?.('error')
      else onStatus?.('connecting')
    })
  return () => {
    void client.removeChannel(channel)
  }
}

export type StatusLog = {
  id: number
  status: PrinterStatus
  note: string | null
  created_at: string
}

export async function getStatusLogs(printerId: number, limit = 5): Promise<StatusLog[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('status_logs')
    .select('id,status,note,created_at')
    .eq('printer_id', printerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as StatusLog[]
}

const edgeErrorMessages: Record<string, string> = {
  only_3mf_and_stl: '.3mf 또는 .stl 파일만 올릴 수 있습니다.',
  too_many_uploads: '파일 업로드 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.',
  too_many_requests: '접수 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.',
  uploaded_file_not_found: '업로드한 파일을 확인하지 못했습니다. 다시 제출해 주세요.',
  uploaded_file_invalid: '파일 정보를 확인하지 못했습니다. 파일을 다시 선택해 주세요.',
  invalid_request: '입력 내용을 확인해 주세요.',
  unauthorized: '관리자 비밀번호를 확인해 주세요.',
  too_many_attempts: '관리자 확인 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.',
  not_found: '접수번호와 학번을 확인해 주세요. 일치하는 신청을 찾지 못했습니다.',
  too_many_lookups: '조회 요청이 많습니다. 10분 뒤 다시 시도해 주세요.',
}

async function invokePrintboardFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase 연결이 필요합니다.')
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: string }
        if (payload.error && edgeErrorMessages[payload.error]) throw new Error(edgeErrorMessages[payload.error])
      } catch (reason) {
        if (reason instanceof Error && reason.message !== 'Unexpected end of JSON input') throw reason
      }
    }
    throw new Error('요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }
  if (data === null) throw new Error('서버에서 응답을 받지 못했습니다.')
  return data as T
}

export async function updatePrinterStatus(input: {
  printerId: number
  status: PrinterStatus
  userName: string | null
  endsAt: string | null
  note: string | null
}) {
  if (!supabase) {
    const printer = demoPrinters.find((item) => item.id === input.printerId)
    if (!printer) throw new Error('프린터를 찾을 수 없습니다.')
    Object.assign(printer, {
      status: input.status,
      user_name: input.userName,
      ends_at: input.endsAt,
      note: input.note,
      updated_at: new Date().toISOString(),
    })
    publishDemoChange()
    return
  }

  const { error } = await supabase.rpc('update_printer_status', {
    p_printer_id: input.printerId,
    p_status: input.status,
    p_user_name: input.userName,
    p_ends_at: input.endsAt,
    p_note: input.note,
  })
  if (error?.code === 'P0001' && error.message.includes('15초')) {
    throw new Error('상태가 최근에 변경되어 저장하지 못했습니다. 15초 뒤 다시 시도해 주세요.')
  }
  if (error) throw error
}

export async function submitPrintRequest(input: {
  requesterName: string
  memberNo: string
  file: File
  note: string
}): Promise<string> {
  if (!supabase) throw new Error('데모 모드에서는 파일과 접수 정보가 저장되지 않습니다. Supabase 연결 후 다시 제출해 주세요.')
  const extension = input.file.name.split('.').pop()?.toLowerCase()
  if (extension !== '3mf' && extension !== 'stl') throw new Error('.3mf 또는 .stl 파일만 올릴 수 있습니다.')

  const upload = await invokePrintboardFunction<{ path: string; token: string; mimeType: string }>('request-upload', {
    fileName: input.file.name,
    fileSize: input.file.size,
  })
  // File's original MIME can be application/octet-stream for 3MF/STL.
  // Supabase's multipart upload uses the Blob/File part's type, so wrap it
  // with the server-approved type instead of relying on FileOptions.contentType.
  const uploadFile = new File([input.file], input.file.name, { type: upload.mimeType })
  const { error: uploadError } = await supabase.storage.from('print-files').uploadToSignedUrl(
    upload.path,
    upload.token,
    uploadFile,
    { contentType: upload.mimeType, upsert: false },
  )
  if (uploadError) throw uploadError
  try {
    const result = await invokePrintboardFunction<{ trackingCode: string }>('request-submit', {
      requesterName: input.requesterName.trim(),
      memberNo: input.memberNo.trim(),
      path: upload.path,
      fileSize: input.file.size,
      note: input.note.trim(),
    })
    return result.trackingCode
  } catch (error) {
    await invokePrintboardFunction('request-submit', { action: 'cleanup', path: upload.path }).catch(() => undefined)
    throw error
  }
}

export type PublicRequestStatus = {
  status: RequestStatus
  printerName: string | null
  createdAt: string
}

export async function getPublicRequestStatus(trackingCode: string, memberNo: string): Promise<PublicRequestStatus> {
  const result = await invokePrintboardFunction<PublicRequestStatus>('request-status', { trackingCode, memberNo })
  return result
}

export async function listAdminRequests(password: string): Promise<PrintRequest[]> {
  if (!supabase) throw new Error('데모 모드에서는 관리자 접수함에 접근할 수 없습니다.')
  const { data, error } = await supabase.rpc('admin_list_requests', { pw: password })
  if (error) throw error
  return (data ?? []) as PrintRequest[]
}

export async function updateAdminRequest(input: {
  password: string
  requestId: string
  status: RequestStatus
  printerId: number | null
}) {
  if (!supabase) throw new Error('데모 모드에서는 접수 상태를 변경할 수 없습니다.')
  const { error } = await supabase.rpc('admin_update_request', {
    pw: input.password,
    req_id: input.requestId,
    new_status: input.status,
    printer_id: input.printerId,
  })
  if (error) throw error
}

export async function getRequestFileUrl(path: string, password: string): Promise<string> {
  const result = await invokePrintboardFunction<{ signedUrl: string }>('admin-file-link', { path, password })
  return result.signedUrl
}
