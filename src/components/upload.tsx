'use client'

import { useState, useTransition } from 'react'
import { addDocumentVersion, recordDocument } from '@/app/_actions/collab'
import { ACCEPT, ALLOWED_LABEL, MAX_FILE_BYTES as MAX, fileType } from '@/lib/files'
import { createClient } from '@/lib/supabase/client'

/** Uploads straight from the browser to private storage, then records the document on the server. */
export function UploadForm({ customerId, projectId, requestId, projects, folders, staff, defaultShared }: {
  customerId: string; projectId?: string; requestId?: string; projects?: { id: string; name: string }[]; folders: Record<string, string>; staff: boolean; defaultShared?: boolean
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => {
      e.preventDefault()
      const form = e.currentTarget
      const data = new FormData(form)
      const file = data.get('file')
      if (!(file instanceof File) || !file.size) return setMsg({ ok: false, text: 'Choose a file to upload.' })
      if (file.size > MAX) return setMsg({ ok: false, text: 'Files can be up to 50 MB.' })
      const type = fileType(file.name)
      if (!type) return setMsg({ ok: false, text: `That file type is not accepted. Use ${ALLOWED_LABEL}.` })
      start(async () => {
        const id = crypto.randomUUID()
        const name = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
        const path = `${customerId}/${id}/${name}`
        const supabase = createClient()
        const up = await supabase.storage.from('documents').upload(path, file, { contentType: type.mime })
        if (up.error) return setMsg({ ok: false, text: 'Upload failed. Please try again.' })
        const res = await recordDocument({
          id, customer_id: customerId, project_id: (projectId ?? (data.get('project_id') as string)) || null, request_id: requestId ?? null,
          folder: data.get('folder') as never, visibility: (staff ? data.get('visibility') : 'shared') as never, name, path,
        })
        setMsg(res.ok ? { ok: !/^Blocked/.test(res.message ?? ''), text: res.message ?? 'Uploaded.' } : { ok: false, text: res.error })
        if (res.ok) form.reset()
      })
    }}>
      {projectId ? null : (
        <select name="project_id" aria-label="Project" className="input"><option value="">No project</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      )}
      <input type="file" name="file" required aria-label="File" accept={ACCEPT} className="text-xs" />
      <span className="text-[11px] text-muted">{ALLOWED_LABEL}, up to 50 MB. Every file is security-checked before anyone can open it.</span>
      <select name="folder" defaultValue="02-requirements" aria-label="Folder" className="input">{Object.entries(folders).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {staff ? (
        <select name="visibility" defaultValue={defaultShared ? 'shared' : 'internal'} aria-label="Visibility" className="input"><option value="internal">Internal (Seven Billion only)</option><option value="shared">Shared with customer</option></select>
      ) : <p className="m-0 text-xs text-muted">Files you upload are shared with your Seven Billion team.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Uploading…' : 'Upload'}</button>
        {msg ? <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-xs font-medium text-good-ink' : 'text-xs text-crit-ink'}>{msg.text}</span> : null}
      </div>
    </form>
  )
}

/** "New version" for an existing document: uploads next to the current file and moves the old one into history. */
export function NewVersionButton({ documentId, customerId }: { documentId: string; customerId: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const inputId = `v-${documentId}`
  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={inputId} className="cursor-pointer text-xs font-medium text-link">{pending ? 'Uploading…' : 'New version'}</label>
      <input id={inputId} type="file" accept={ACCEPT} className="sr-only" aria-label="Upload a new version" disabled={pending} onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        if (file.size > MAX) return setMsg({ ok: false, text: 'Up to 50 MB.' })
        const type = fileType(file.name)
        if (!type) return setMsg({ ok: false, text: 'File type not accepted.' })
        start(async () => {
          const name = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
          const path = `${customerId}/${documentId}/${Date.now()}-${name}`
          const up = await createClient().storage.from('documents').upload(path, file, { contentType: type.mime })
          if (up.error) return setMsg({ ok: false, text: 'Upload failed.' })
          const res = await addDocumentVersion(documentId, path, name)
          setMsg(res.ok ? { ok: !/^Blocked/.test(res.message ?? ''), text: res.message ?? 'Uploaded.' } : { ok: false, text: res.error })
        })
      }} />
      {msg ? <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-xs text-good-ink' : 'text-xs text-crit-ink'}>{msg.text}</span> : null}
    </span>
  )
}
