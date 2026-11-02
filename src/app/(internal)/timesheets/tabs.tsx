import { Tabs } from '@/components/shell/nav'

/** My week for everyone; Approve for the people who approve time (a project's PM, admins, the CEO). */
export function TimesheetTabs({ approver }: { approver: boolean }) {
  return (
    <div className="border-b border-border px-4">
      <Tabs items={[{ href: '/timesheets', label: 'My week', exact: true }, ...(approver ? [{ href: '/timesheets/approve', label: 'Approve' }] : [])]} />
    </div>
  )
}
