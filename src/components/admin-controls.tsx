'use client'

import { useState, useTransition } from 'react'
import { setAccountOwner, setAutomation, setStaffRole } from '@/app/_actions/admin'
import { StatusSelect } from '@/components/forms'
import { cn } from '@/components/ui'

type Role = 'admin' | 'ceo' | 'pm' | 'consultant' | 'finance' | 'remove'

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  return (
    <StatusSelect label="Role" value={role} onChange={(v) => setStaffRole(userId, v)} options={[
      { value: 'pm', label: 'PM' }, { value: 'consultant', label: 'Consultant' }, { value: 'finance', label: 'Finance' },
      { value: 'ceo', label: 'CEO' }, { value: 'admin', label: 'Admin' }, { value: 'remove', label: 'Access removed' },
    ]} />
  )
}

export function AccountOwnerSelect({ customerId, value, people }: { customerId: string; value: string; people: { id: string; name: string }[] }) {
  return <StatusSelect label="Account owner" value={value} onChange={(v) => setAccountOwner(customerId, v)}
    options={[{ value: '', label: 'No owner' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
}

/** On/off switch for one playbook rule. */
export function AutomationToggle({ ruleKey, enabled }: { ruleKey: Parameters<typeof setAutomation>[0]; enabled: boolean }) {
  const [on, setOn] = useState(enabled)
  const [pending, start] = useTransition()
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={on ? 'Rule is on' : 'Rule is off'} disabled={pending}
      onClick={() => start(async () => { const res = await setAutomation(ruleKey, !on); if (res.ok) setOn(!on) })}
      className="ml-auto inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-xs font-semibold">
      <span className={cn('relative h-[18px] w-8 rounded-full transition-colors', on ? 'bg-good' : 'bg-[#c4cdd0]')}>
        <span className={cn('absolute top-[2px] size-[14px] rounded-full bg-white transition-all', on ? 'left-4' : 'left-[2px]')} />
      </span>
      <span className={on ? 'text-good-ink' : 'text-muted'}>{on ? 'On' : 'Off'}</span>
    </button>
  )
}
