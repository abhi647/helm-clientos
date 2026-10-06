import { NextResponse, type NextRequest } from 'next/server'
import { PREVIEWABLE, fileType } from '@/lib/files'
import { createClient } from '@/lib/supabase/server'

const page = (status: number, title: string, body: string) =>
  new NextResponse(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:14px system-ui;margin:48px;color:#0F2A30"><h1 style="font-size:18px">${title}</h1><p>${body}</p><p><a href="javascript:history.back()">Go back</a></p>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } })

/**
 * Short-lived signed link for the current file, or an earlier version with ?v=N. ?preview=1 opens PDFs and images
 * in the browser (served from the storage domain, never the app's). Both the row and the storage object are
 * checked under the user's RLS, and nothing is served until the security check has passed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const v = Number(request.nextUrl.searchParams.get('v'))
  const preview = request.nextUrl.searchParams.get('preview') === '1'
  const supabase = await createClient()
  const { data: doc } = Number.isInteger(v) && v > 0
    ? await supabase.from('document_versions').select('storage_path, name, scan_status').eq('document_id', id).eq('version', v).maybeSingle()
    : await supabase.from('documents').select('storage_path, name, scan_status').eq('id', id).maybeSingle()
  if (!doc?.storage_path) return page(404, 'File not found', 'It may have been archived, or you do not have access.')
  if (doc.scan_status === 'pending') return page(409, 'Still checking this file', 'Every file is security-checked before it can be opened. Try again in a minute.')
  if (doc.scan_status === 'infected' || doc.scan_status === 'rejected') return page(410, 'This file was blocked', 'It failed the security check and was deleted.')
  const inline = preview && PREVIEWABLE.has(fileType(doc.storage_path)?.mime ?? '')
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60, inline ? undefined : { download: doc.name })
  if (error || !data) return page(404, 'File not found', 'It may have been archived, or you do not have access.')
  return NextResponse.redirect(data.signedUrl)
}
