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
      } catch (error) {
        console.error('프린터 상태를 새로 불러오지 못했습니다.', error)
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onStatus?.('connected')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus?.('error')
      else onStatus?.('connecting')
    })
  return () => {
    void client.removeChannel(channel)
  }
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
  if (error) throw error
}

export async function submitPrintRequest(input: {
  requesterName: string
  memberNo: string
  file: File
  note: string
}) {
  if (!supabase) throw new Error('데모 모드에서는 파일과 접수 정보가 저장되지 않습니다. Supabase 연결 후 다시 제출해 주세요.')
  const extension = input.file.name.split('.').pop()?.toLowerCase()
  if (extension !== '3mf' && extension !== 'stl') throw new Error('.3mf 또는 .stl 파일만 올릴 수 있습니다.')

  const path = `${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await supabase.storage.from('print-files').upload(path, input.file, { upsert: false })
  if (uploadError) throw uploadError

  const { error: insertError } = await supabase.from('print_requests').insert({
    requester_name: input.requesterName.trim(),
    member_no: input.memberNo.trim(),
    file_path: path,
    note: input.note.trim() || null,
    status: 'pending',
  })
  if (insertError) throw insertError
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

export function getRequestFileUrl(path: string) {
  if (!supabase) return null
  return supabase.storage.from('print-files').getPublicUrl(path).data.publicUrl
}
