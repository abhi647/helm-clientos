import 'server-only'
import { z } from 'zod'

// Validated once on the server. Missing optional integrations simply switch that integration off.
const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Seven Billion <updates@example.com>'),
  CRON_SECRET: z.string().min(16),
  HUBSPOT_WEBHOOK_SECRET: z.string().optional().default(''),
  HUBSPOT_ACCESS_TOKEN: z.string().optional().default(''),
  ZOHO_CLIENT_ID: z.string().optional().default(''),
  ZOHO_CLIENT_SECRET: z.string().optional().default(''),
  ZOHO_REFRESH_TOKEN: z.string().optional().default(''),
  ZOHO_ORGANIZATION_ID: z.string().optional().default(''),
  ZOHO_DOMAIN: z.string().optional().default('zoho.in'),
  CLAMAV_HOST: z.string().optional().default(''),
  CLAMAV_PORT: z.coerce.number().int().optional().default(3310),
  REQUIRE_VIRUS_SCAN: z.preprocess((v) => v === 'true', z.boolean()).default(false),
})

export type Env = z.infer<typeof schema>

let cached: Env | null = null
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
      throw new Error(`Invalid or missing environment variables: ${missing}`)
    }
    cached = parsed.data
  }
  return cached
}
