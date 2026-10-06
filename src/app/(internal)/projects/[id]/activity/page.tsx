import { ActivityList } from '@/components/project-parts'
import { Card } from '@/components/ui'
import { requireStaff } from '@/lib/session'

export default async function Activity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireStaff()
  return <div className="p-4"><Card flush title="Activity" extra="Every important action, in order"><ActivityList projectId={id} /></Card></div>
}
