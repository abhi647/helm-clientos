import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; compare in constant time. */
export function isCronRequest(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`)
  const got = Buffer.from(header ?? '')
  return got.length === expected.length && timingSafeEqual(got, expected)
}
