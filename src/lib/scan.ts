import 'server-only'
import net from 'node:net'
import { env } from '@/lib/env'
import { fileType } from '@/lib/files'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * File checks, run on the server right after upload (and by the daily cron for anything left pending):
 *  1. The content must match the extension (a renamed .exe is rejected).
 *  2. A ClamAV scan (clamd INSTREAM over TCP) when CLAMAV_HOST is set.
 * Until a file passes, it cannot be downloaded or previewed. A failed file is deleted from storage.
 */

const startsWith = (b: Buffer, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

export function contentMatches(ext: string, b: Buffer): boolean {
  switch (ext) {
    case 'pdf': return startsWith(b, ascii('%PDF-'))
    case 'png': return startsWith(b, [0x89, 0x50, 0x4e, 0x47])
    case 'jpg': case 'jpeg': return startsWith(b, [0xff, 0xd8, 0xff])
    case 'gif': return startsWith(b, ascii('GIF8'))
    case 'webp': return startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8)
    case 'docx': case 'xlsx': case 'pptx': case 'zip': return startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])
    case 'doc': case 'xls': case 'ppt': return startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    case 'csv': case 'txt': return !b.subarray(0, 8192).includes(0)
    default: return false
  }
}

/** Streams the bytes to clamd. Resolves 'clean' or 'infected'; rejects if the scanner cannot be reached. */
export function clamScan(b: Buffer): Promise<'clean' | 'infected'> {
  const { CLAMAV_HOST, CLAMAV_PORT } = env()
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMAV_HOST, port: CLAMAV_PORT }, () => {
      socket.write('zINSTREAM\0')
      for (let i = 0; i < b.length; i += 64 * 1024) {
        const chunk = b.subarray(i, i + 64 * 1024)
        const len = Buffer.alloc(4)
        len.writeUInt32BE(chunk.length)
        socket.write(len)
        socket.write(chunk)
      }
      socket.write(Buffer.alloc(4))
    })
    let reply = ''
    socket.setTimeout(30_000, () => socket.destroy(new Error('clamd timeout')))
    socket.on('data', (d) => (reply += d.toString()))
    socket.on('error', reject)
    socket.on('end', () => {
      if (/FOUND/.test(reply)) resolve('infected')
      else if (/: OK/.test(reply)) resolve('clean')
      else reject(new Error(`clamd: ${reply.replace(/\0/g, '').trim() || 'no reply'}`))
    })
  })
}

type Result = 'clean' | 'not_scanned' | 'infected' | 'rejected' | 'pending'

export async function scanDocument(id: string): Promise<Result> {
  const db = createAdminClient()
  const { data: d } = await db.from('documents').select('id, name, storage_path, customer_id, project_id, uploaded_by, scan_status').eq('id', id).maybeSingle()
  if (!d?.storage_path || d.scan_status !== 'pending') return (d?.scan_status as Result) ?? 'pending'
  const path = d.storage_path
  const { data: blob, error } = await db.storage.from('documents').download(path)
  if (error || !blob) return 'pending'                       // retried by the cron
  const bytes = Buffer.from(await blob.arrayBuffer())
  const type = fileType(path)

  let status: Result
  if (!type || !contentMatches(type.ext, bytes)) status = 'rejected'
  else if (env().CLAMAV_HOST) {
    try {
      status = await clamScan(bytes)
    } catch (e) {
      console.error('[scan] scanner unavailable', e)
      return 'pending'                                       // never mark clean without a scan
    }
  } else status = env().REQUIRE_VIRUS_SCAN ? 'pending' : 'not_scanned'

  // only commit if the file was not replaced while we scanned
  await db.from('documents').update({ scan_status: status, scanned_at: new Date().toISOString(), mime_type: type?.mime ?? null, size_bytes: bytes.length })
    .eq('id', d.id).eq('storage_path', path)
  if (status === 'infected' || status === 'rejected') {
    await db.storage.from('documents').remove([path])
    await db.from('activity').insert({ customer_id: d.customer_id, project_id: d.project_id, summary: `Security · ${d.name} was blocked (${status === 'infected' ? 'malware found' : 'content does not match its file type'}) and deleted`, entity_type: 'document', entity_id: d.id, visibility: 'internal' })
    if (d.uploaded_by) {
      await db.from('notifications').insert({ user_id: d.uploaded_by, kind: 'file.blocked', title: `${d.name} was blocked`,
        body: status === 'infected' ? 'Our virus scan found a threat, so the file was deleted. Please check your computer and upload a clean copy.' : 'The file content does not match its type, so it was deleted. Please upload the original file.',
        needs_action: true })
    }
  }
  return status
}

/** Safety net for the daily cron: anything still pending after a few minutes. */
export async function scanPending(limit = 25): Promise<number> {
  const db = createAdminClient()
  const { data } = await db.from('documents').select('id').eq('scan_status', 'pending').not('storage_path', 'is', null)
    .lt('created_at', new Date(Date.now() - 2 * 60_000).toISOString()).limit(limit)
  for (const d of data ?? []) await scanDocument(d.id)
  return data?.length ?? 0
}
