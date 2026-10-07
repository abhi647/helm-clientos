import { NextResponse, type NextRequest } from 'next/server'
import { exportCustomer } from '@/lib/customer-data'
import { getAal, getProfile } from '@/lib/session'
import { logError } from '@/lib/system-log'

/** Admin or CEO: download everything Helm holds about one customer, as JSON. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile()
  if (!me || me.kind !== 'internal' || !['admin', 'ceo'].includes(me.internal_role ?? '') || (await getAal()) !== 'aal2') {
    return NextResponse.json({ error: 'Only an admin or the CEO can export customer data.' }, { status: 403 })
  }
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'Unknown customer.' }, { status: 404 })
  try {
    const data = await exportCustomer(id)
    const slug = String(data.customer.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    await logError('data-export', `${me.full_name} exported the data of ${data.customer.name}`, { customer: id }, 'info')
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="helm-${slug}-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Export failed' }, { status: 404 })
  }
}
