import { redirect } from 'next/navigation'

/** Commercials moved into Billing (contract value, PO and notes sit with the billing set-up); old links land there. */
export default async function Commercials({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/billing`)
}
