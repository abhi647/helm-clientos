import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Short-lived signed download link. Both the documents row and the storage object are checked under the user's RLS. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: doc } = await supabase.from('documents').select('storage_path, name').eq('id', id).maybeSingle()
  if (!doc?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 60, { download: doc.name })
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
