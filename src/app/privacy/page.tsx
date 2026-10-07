import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = { title: 'Privacy' }

// A plain statement of what Helm does with personal data. Have it reviewed against your contracts before relying on it.
export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="7 October 2026">
      <p>Helm is the workspace Seven Billion Analytics uses to run projects with its customers. This page explains what
        Helm keeps about you, why, who helps us run it, and what you can ask for. Where your company has a contract with
        Seven Billion, that contract (including any data processing terms) takes precedence over this page.</p>

      <h2>What Helm keeps</h2>
      <ul>
        <li><b>Your account:</b> your name, work email, your company and your role in Helm.</li>
        <li><b>Your work with us:</b> requests, comments, approvals, files you upload, forms, ratings and feedback, and a history of who did what and when.</li>
        <li><b>Billing records:</b> agreed rates, statements and invoice details, for the people your company allows to see them.</li>
        <li><b>Sign-in:</b> a sign-in cookie that keeps you signed in for up to 30 days, and the time of your last sign-in. Seven Billion staff also use an authenticator app.</li>
      </ul>
      <p>Helm has no advertising and no analytics trackers.</p>

      <h2>Why</h2>
      <p>To deliver the work your company has agreed with Seven Billion: to plan it, show progress, record decisions and
        approvals, bill for it, and keep you informed by email.</p>

      <h2>Who can see it</h2>
      <p>The Seven Billion team working with your company, and the people at your company who have access to Helm.
        Internal notes, estimates and commercial terms are visible only to Seven Billion. Each customer sees only their
        own company&apos;s work.</p>

      <h2>Services that help us run Helm</h2>
      <ul>
        <li><b>Vercel</b>: hosts the application.</li>
        <li><b>Supabase</b>: stores the data and files, and handles sign-in.</li>
        <li><b>Resend</b>: sends Helm&apos;s emails.</li>
        <li><b>Zoho Books</b>: Seven Billion&apos;s invoicing; invoice details are exchanged with it.</li>
        <li><b>HubSpot</b>: Seven Billion&apos;s CRM; company and contact details may come from it.</li>
      </ul>
      <p>Uploaded files are checked for viruses before anyone can open them.</p>

      <h2>How long</h2>
      <p>While your company works with Seven Billion, and afterwards for as long as your contract or the law requires.
        Encrypted backups are kept for 30 days and system logs for 90 days.</p>

      <h2>What you can ask for</h2>
      <p>You can ask for a copy of the data Helm holds about you or your company, for corrections, or for it to be
        deleted when it is no longer needed. Contact the Seven Billion team you work with, or the contact named in your
        contract. Seven Billion can export a full copy of a customer&apos;s data and delete it completely.</p>

      <h2>Security</h2>
      <p>Data is encrypted in transit, access is limited by role and checked by the database itself, staff sign in with
        two steps, and access can be removed instantly.</p>
    </LegalPage>
  )
}
