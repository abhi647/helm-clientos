'use client'

import { useState, useTransition } from 'react'
import { recordDocument } from '@/app/_actions/collab'
import { createClient } from '@/lib/supabase/client'

const MAX = 50 * 1024 * 1024

/** Uploads straight from the browser to private storage, then records the document on the server. */
export function UploadForm({ customerId, projectId, projects, folders, staff }: {
  customerId: string; projectId?: string; projects?: { id: string; name: string }[]; folders: Record<string, string>; staff: boolean
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
      start(async () => {
        const id = crypto.randomUUID()
        const name = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
        const path = `${customerId}/${id}/${name}`
        const supabase = createClient()
        const up = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (up.error) return setMsg({ ok: false, text: 'Upload failed. Please try again.' })
        const res = await recordDocument({
          id, customer_id: customerId, project_id: (projectId ?? (data.get('project_id') as string)) || null,
          folder: data.get('folder') as never, visibility: (staff ? data.get('visibility') : 'shared') as never, name, path,
        })
        setMsg(res.ok ? { ok: true, text: 'Uploaded.' } : { ok: false, text: res.error })
        if (res.ok) form.reset()
      })
    }}>
      {projectId ? null : (
        <select name="project_id" aria-label="Project" className="input"><option value="">No project</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      )}
      <input type="file" name="file" required aria-label="File" className="text-xs" />
      <select name="folder" defaultValue="02-requirements" aria-label="Folder" className="input">{Object.entries(folders).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {staff ? (
        <select name="visibility" defaultValue="internal" aria-label="Visibility" className="input"><option value="internal">Internal (Seven Billion only)</option><option value="shared">Shared with customer</option></select>
      ) : <p className="m-0 text-xs text-muted">Files you upload are shared with your Seven Billion team.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? 'Uploading…' : 'Upload'}</button>
        {msg ? <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-xs font-medium text-good-ink' : 'text-xs text-crit-ink'}>{msg.text}</span> : null}
      </div>
    </form>
  )
}
