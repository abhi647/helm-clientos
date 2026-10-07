// The request form fields, shared by the customer portal and by staff logging a request on a customer's behalf.
export const REQUEST_TYPES: [string, string][] = [['requirement', 'Requirement'], ['enhancement', 'Enhancement'], ['change_request', 'Change request'], ['bug', 'Something is not working'], ['new_report', 'New report'], ['data_request', 'Data request'], ['access_request', 'Access request'], ['support', 'Support'], ['other', 'Other']]

// The three request forms share one lifecycle; they differ in the questions asked.
export const REQUEST_KINDS = {
  request: { tab: 'New request', type: 'requirement', what: 'What do you need?', why: 'Why is it needed?', title: 'e.g. Add regional sales forecast' },
  change: { tab: 'Change request', type: 'change_request', what: 'What should change, and how does it work today?', why: 'What happens if we do not change it?', title: 'e.g. Show margin after rebates' },
  access: { tab: 'Access request', type: 'access_request', what: 'Who needs access, to what, and with which role?', why: 'Why do they need it?', title: 'e.g. Dashboard access for 3 regional managers' },
} as const
export type RequestKind = keyof typeof REQUEST_KINDS
export const requestKind = (k?: string): RequestKind => (k === 'change' || k === 'access' ? k : 'request')

export function RequestFields({ kind, projects }: { kind: RequestKind; projects: { id: string; name: string }[] }) {
  const K = REQUEST_KINDS[kind]
  return (
    <>
      <label className="flex flex-col gap-1"><span className="label">Title</span><input name="title" required minLength={3} maxLength={200} placeholder={K.title} className="input h-9 text-sm" /></label>
      <label className="flex flex-col gap-1"><span className="label">{K.what}</span><textarea name="what" required rows={4} className="textarea text-sm" /></label>
      <label className="flex flex-col gap-1"><span className="label">{K.why}</span><textarea name="why" rows={3} className="textarea text-sm" placeholder="Helps us prioritise and get it right" /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1"><span className="label">Type</span><select name="type" key={kind} defaultValue={K.type} className="input h-9">{REQUEST_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="label">Project</span><select name="project_id" className="input h-9"><option value="">Not sure / general</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="label">Priority</span><select name="priority" defaultValue="normal" className="input h-9"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical (business stopped)</option></select></label>
        <label className="flex flex-col gap-1"><span className="label">Wanted by</span><input type="date" name="desired_date" className="input h-9" /></label>
      </div>
    </>
  )
}
