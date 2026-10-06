import { RequestList, parseFilter } from '@/components/request-list'
import { requireStaff } from '@/lib/session'

export default async function ProjectRequests({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filter?: string }> }) {
  const me = await requireStaff()
  const [{ id }, { filter }] = await Promise.all([params, searchParams])
  return <div className="p-4"><RequestList me={me} projectId={id} filter={parseFilter(filter)} basePath={`/projects/${id}/requests`} /></div>
}
