// Copies every uploaded file (Supabase Storage) into a folder, for the nightly backup. Read only.
//   node --env-file=.env.production.local scripts/backup-files.mjs --out ./files
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. Restore by uploading the folder back to the same buckets.
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { out: { type: 'string', default: './files' } } })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.')
  process.exit(1)
}
// Node 20 has no WebSocket; realtime is not needed here
const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: class NoRealtime {} } })

async function* walk(bucket, prefix = '') {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) yield* walk(bucket, path)        // a folder
      else yield path
    }
    if (data.length < 1000) break
  }
}

const { data: buckets, error } = await db.storage.listBuckets()
if (error) throw error
let files = 0, bytes = 0
for (const b of buckets) {
  for await (const path of walk(b.name)) {
    const { data, error: e } = await db.storage.from(b.name).download(path)
    if (e) throw new Error(`${b.name}/${path}: ${e.message}`)
    const target = join(values.out, b.name, path)
    await mkdir(dirname(target), { recursive: true })
    const buf = Buffer.from(await data.arrayBuffer())
    await writeFile(target, buf)
    files++
    bytes += buf.length
  }
}
console.log(`Copied ${files} files (${(bytes / 1048576).toFixed(1)} MB) from ${buckets.length} buckets to ${values.out}`)
