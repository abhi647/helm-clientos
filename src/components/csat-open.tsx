import { CsatPrompt } from '@/components/csat-prompt'
import { Card } from '@/components/ui'
import { isoDaysAgo } from '@/lib/format'
import type { Profile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/** Open CSAT questions for the signed-in customer (all of them, or the one for a request). Renders nothing if none. */
export async function OpenSurveys({ me, requestId }: { me: Profile; requestId?: string }) {
  if (me.kind !== 'customer') return null
  const supabase = await createClient()
  let q = supabase.from('csat_surveys').select('id, kind, requests(number, title)')
    .eq('recipient_id', me.id).is('answered_at', null).gt('expires_at', isoDaysAgo(0)).order('sent_at', { ascending: false }).limit(2)
  if (requestId) q = q.eq('request_id', requestId)
  const { data } = await q
  if (!data?.length) return null
  return (
    <Card title={requestId ? 'How did we do?' : 'Quick check-in'} extra="Takes ten seconds">
      <div className="flex flex-col gap-4">
        {data.map((s) => (
          <CsatPrompt key={s.id} surveyId={s.id} compact={!!requestId}
            question={s.kind === 'request' && s.requests ? `How satisfied are you with how we delivered ${s.requests.number}: ${s.requests.title}?` : 'How satisfied are you with Seven Billion this month?'} />
        ))}
      </div>
    </Card>
  )
}
