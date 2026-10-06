import { Download, Eye } from 'lucide-react'
import { archiveDocument } from '@/app/_actions/collab'
import { ActionButton } from '@/components/forms'
import { NewVersionButton } from '@/components/upload'
import { Chip, Visibility } from '@/components/ui'
import { PREVIEWABLE, fileType } from '@/lib/files'
import { relativeTime } from '@/lib/format'

export type FileRow = {
  id: string; name: string; version: number; visibility: 'internal' | 'shared'; created_at: string; storage_path: string | null
  scan_status: string; archived_at: string | null; uploader?: { full_name: string } | null
}
export type VersionRow = { document_id: string; version: number; name: string; created_at: string; scan_status: string }

const OPENABLE = new Set(['clean', 'not_scanned'])

function Status({ status, staff }: { status: string; staff: boolean }) {
  if (status === 'pending') return <Chip tone="info" title="Every file is security-checked before it can be opened">Checking</Chip>
  if (status === 'infected' || status === 'rejected') return <Chip tone="crit" title={status === 'infected' ? 'Malware found; the file was deleted' : 'Content did not match its type; the file was deleted'}>Blocked</Chip>
  if (status === 'not_scanned' && staff) return <Chip title="No virus scanner is configured (set CLAMAV_HOST)">Not scanned</Chip>
  return null
}

/** One row per file: status, version history, preview, download, new version, and archive for staff. */
export function FileRows({ docs, versions, staff, customerId }: { docs: FileRow[]; versions: VersionRow[]; staff: boolean; customerId: string }) {
  return (
    <>
      {docs.map((d) => {
        const openable = !!d.storage_path && OPENABLE.has(d.scan_status)
        const previewable = openable && PREVIEWABLE.has(fileType(d.storage_path!)?.mime ?? '')
        const history = versions.filter((v) => v.document_id === d.id)
        return (
          <div key={d.id} className="row grid-cols-[minmax(0,1fr)_92px_100px_76px_84px_64px] hover:bg-head">
            <span className="flex min-w-0 flex-col py-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{d.name}</span><span className="font-mono text-xs text-muted">v{d.version}</span>
                <Status status={d.scan_status} staff={staff} />
              </span>
              {history.length ? (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">Earlier versions</summary>
                  {history.map((v) => OPENABLE.has(v.scan_status)
                    ? <a key={v.version} href={`/api/documents/${d.id}?v=${v.version}`} className="block py-0.5">v{v.version} · {v.name} · {relativeTime(v.created_at)}</a>
                    : <span key={v.version} className="block py-0.5">v{v.version} · {v.name} · blocked</span>)}
                </details>
              ) : null}
            </span>
            <span>{d.storage_path && !d.archived_at && (staff || d.visibility === 'shared') ? <NewVersionButton documentId={d.id} customerId={customerId} /> : null}</span>
            <span className="truncate text-xs text-muted">{d.uploader?.full_name}</span>
            <span className="text-xs text-muted">{relativeTime(d.created_at)}</span>
            <span>{staff ? <Visibility value={d.visibility} /> : null}</span>
            <span className="flex items-center justify-end gap-2">
              {previewable ? <a href={`/api/documents/${d.id}?preview=1`} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${d.name}`} title="Preview" className="text-link"><Eye className="size-4" aria-hidden /></a> : null}
              {openable ? <a href={`/api/documents/${d.id}`} aria-label={`Download ${d.name}`} title="Download" className="text-link"><Download className="size-4" aria-hidden /></a>
                : !d.storage_path ? <span className="text-xs text-muted" title="Placeholder without a file">–</span> : null}
            </span>
          </div>
        )
      })}
    </>
  )
}

/** Staff-only: archive / restore control placed under a file list. */
export function ArchiveControls({ docs, archived }: { docs: FileRow[]; archived: boolean }) {
  return (
    <>
      {docs.map((d) => (
        <div key={d.id} className="row grid-cols-[minmax(0,1fr)_auto] text-xs">
          <span className="truncate text-muted">{d.name}{archived && d.archived_at ? ` · archived ${relativeTime(d.archived_at)}` : ''}</span>
          <ActionButton run={archiveDocument.bind(null, d.id, !archived)} className="h-6 px-2 text-xs"
            confirm={archived ? undefined : `Archive ${d.name}? The customer will no longer see it.`}>{archived ? 'Restore' : 'Archive'}</ActionButton>
        </div>
      ))}
    </>
  )
}
