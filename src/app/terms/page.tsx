import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = { title: 'Terms of use' }

// Plain terms for using the workspace. The customer contract governs the commercial relationship.
export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="7 October 2026">
      <p>Helm is provided by Seven Billion Analytics to its customers and team to run their projects together. By signing
        in you agree to these terms. Your company&apos;s contract with Seven Billion governs the work, fees and
        confidentiality, and takes precedence over these terms.</p>

      <h2>Your account</h2>
      <ul>
        <li>Your account is for you only. Do not share your sign-in link, code or session.</li>
        <li>Tell Seven Billion straight away if you think someone else has used your account. Access can be removed instantly.</li>
        <li>Your company decides who at your company has access and who can approve and see invoices.</li>
      </ul>

      <h2>Using Helm</h2>
      <ul>
        <li>Use Helm only for work with Seven Billion. Do not upload anything unlawful, harmful or that you have no right to share.</li>
        <li>Uploaded files are checked for viruses and may be blocked.</li>
        <li>Do not try to reach data that is not yours, or to disrupt the service.</li>
      </ul>

      <h2>Approvals and records</h2>
      <p>Approvals, decisions and comments in Helm are kept as a record of the work, with who made them and when. Where
        something was already agreed outside Helm (for example in the contract, by email or on a call), Seven Billion
        may record that approval in Helm on your company&apos;s behalf; Helm shows that it was recorded by Seven
        Billion, and the people concerned are told by email.</p>

      <h2>Availability</h2>
      <p>We aim to keep Helm available and your data safe, with monitoring and nightly encrypted backups. Helm may change
        as we improve it, and there may be short interruptions for maintenance.</p>

      <h2>Your data</h2>
      <p>The work and files you put into Helm remain yours and your company&apos;s. How we handle personal data is
        described on the <a href="/privacy">Privacy</a> page.</p>

      <h2>Questions</h2>
      <p>Contact the Seven Billion team you work with, or the contact named in your contract.</p>
    </LegalPage>
  )
}
