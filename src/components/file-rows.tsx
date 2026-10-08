import { Download, Eye, File, FileArchive, FileImage, FileSpreadsheet, FileText, Presentation } from 'lucide-react'
import { archiveDocument } from '@/app/_actions/collab'
import { deleteDocument } from '@/app/_actions/delete'
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
          <div key={d.id} className="row grid-cols-[minmax(0,1fr)_92px_84px_56px] hover:bg-head">
            <span className="flex min-w-0 flex-col py-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{d.name}</span><span className="font-mono text-xs text-muted">v{d.version}</span>
                <Status status={d.scan_status} staff={staff} />
              </span>
              <span className="truncate text-xs text-muted">{d.uploader?.full_name ? `${d.uploader.full_name} · ` : ''}{relativeTime(d.created_at)}</span>
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
          <span className="flex items-center gap-1">
            <ActionButton run={archiveDocument.bind(null, d.id, !archived)} className="h-6 px-2 text-xs"
              confirm={archived ? undefined : `Archive ${d.name}? The customer will no longer see it.`}>{archived ? 'Restore' : 'Archive'}</ActionButton>
            {archived ? <ActionButton run={deleteDocument.bind(null, d.id)} className="btn-ghost h-6 px-2 text-xs text-crit-ink"
              confirm={`Delete ${d.name} and all its versions for good? This cannot be undone.`}>Delete</ActionButton> : null}
          </span>
        </div>
      ))}
    </>
  )
}

const ICONS: [RegExp, typeof File][] = [
  [/\.(xlsx?|csv)$/i, FileSpreadsheet], [/\.(pptx?)$/i, Presentation], [/\.(png|jpe?g|gif|webp)$/i, FileImage],
  [/\.(zip)$/i, FileArchive], [/\.(pdf|docx?|txt|md)$/i, FileText],
]
const iconFor = (name: string) => ICONS.find(([re]) => re.test(name))?.[1] ?? File

/** The same files as tiles: what it is, where it sits, who added it, and open or download in one click. */
export function FileTiles({ docs, staff, customerId, folders }: { docs: (FileRow & { folder: string })[]; staff: boolean; customerId: string; folders: Record<string, string> }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5 p-3">
      {docs.map((d) => {
        const openable = !!d.storage_path && OPENABLE.has(d.scan_status)
        const previewable = openable && PREVIEWABLE.has(fileType(d.storage_path!)?.mime ?? '')
        const Icon = iconFor(d.name)
        const open = previewable ? `/api/documents/${d.id}?preview=1` : openable ? `/api/documents/${d.id}` : null
        return (
          <div key={d.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-white p-3 transition-colors hover:border-brand">
            <div className="flex items-start gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-head text-muted"><Icon className="size-[18px]" aria-hidden /></span>
              <span className="flex min-w-0 flex-col">
                {open ? <a href={open} {...(previewable ? { target: '_blank', rel: 'noopener noreferrer' } : {})} title={d.name}
                  className="line-clamp-2 text-[13px] leading-snug font-medium break-words text-ink no-underline hover:underline">{d.name}</a>
                  : <span title={d.name} className="line-clamp-2 text-[13px] leading-snug font-medium break-words">{d.name}</span>}
                <span className="truncate text-[11px] text-muted">{folders[d.folder] ?? d.folder} · v{d.version}</span>
              </span>
            </div>
            <span className="truncate text-xs text-muted">{d.uploader?.full_name ? `${d.uploader.full_name} · ` : ''}{relativeTime(d.created_at)}</span>
            <div className="mt-auto flex items-center gap-1.5 border-t border-line-soft pt-2">
              {staff ? <Visibility value={d.visibility} /> : null}
              <Status status={d.scan_status} staff={staff} />
              <span className="ml-auto flex items-center gap-2">
                {previewable ? <a href={`/api/documents/${d.id}?preview=1`} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${d.name}`} title="Preview" className="text-link"><Eye className="size-4" aria-hidden /></a> : null}
                {openable ? <a href={`/api/documents/${d.id}`} aria-label={`Download ${d.name}`} title="Download" className="text-link"><Download className="size-4" aria-hidden /></a> : null}
              </span>
            </div>
            {d.storage_path && !d.archived_at && (staff || d.visibility === 'shared') ? <NewVersionButton documentId={d.id} customerId={customerId} /> : null}
          </div>
        )
      })}
    </div>
  )
}
