import Link from 'next/link'

/** A plain reading page for the privacy notice and the terms of use. Public: no sign-in needed. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-[720px] px-4 py-10">
        <Link href="/login" className="mb-8 flex items-center gap-2 text-ink no-underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-64.png" width={24} height={24} alt="" /> <span className="font-semibold">Helm</span> <span className="text-xs text-muted">by Seven Billion</span>
        </Link>
        <h1 className="m-0 text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-xs text-muted">Last updated {updated}</p>
        <div className="legal mt-6 text-[14px] leading-relaxed text-[#2b3d42] [&_h2]:mt-7 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mb-1 [&_p]:my-2 [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-10 border-t border-line-soft pt-4 text-xs text-muted">
          <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms of use</Link> · <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
