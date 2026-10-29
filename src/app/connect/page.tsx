import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Use Helm from Claude and other AI tools',
  description: 'Connect Helm to Claude, ChatGPT, Cursor or any MCP client: setup, what the AI can do, and how your data is handled.',
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://helm.sevenbillion.co'
const SUPPORT = 'abhijit@sevenbillion.co'

// keep in step with src/lib/mcp/tools.ts
const READS: [string, string][] = [
  ['whoami', 'Your name, side (Seven Billion team or customer) and role'],
  ['search', 'Find projects, tasks and requests by name'],
  ['list_projects / get_project', 'Projects, phases, progress, overdue work, open requests and the latest weekly update'],
  ['list_tasks / my_work / get_task', 'Tasks by project, owner, status or due date; your own work grouped by when it is due; one task with its discussion'],
  ['list_requests / get_request', 'Customer requests and where they stand, with their discussion'],
  ['list_approvals', 'Estimates and sign-offs waiting or decided'],
  ['list_updates', 'Published weekly status updates'],
  ['list_people', 'People you can assign or mention'],
]
const WRITES: [string, string, string][] = [
  ['create_task / update_task', 'Add a task or subtask; change its title, description, status, owner or dates', 'Seven Billion team'],
  ['log_time', 'Log your hours on a task (your PM still approves them)', 'Seven Billion team'],
  ['set_request_stage', 'Move a request along its stages', 'Seven Billion team'],
  ['add_comment', 'Comment on a task or request, as you', 'Everyone'],
  ['create_request', 'Raise a requirement, change, bug, data or access request', 'Everyone'],
]

/** Public documentation for the Helm MCP connector (linked from the Claude Connectors Directory listing). */
export default function Connect() {
  return (
    <LegalPage title="Use Helm from Claude and other AI tools" updated="29 October 2026">
      <p>Helm works with Claude, ChatGPT, Cursor and any other AI tool that supports the Model Context Protocol (MCP).
        Ask about your projects, tasks, requests and approvals in plain words, and have the AI update tasks, log time,
        comment or raise requests for you.</p>
      <p>You need a Helm account: Seven Billion invites its team and the people at its customers.</p>

      <h2>Connect</h2>
      <p>The connector address is <code>{SITE}/api/mcp</code>.</p>
      <ul>
        <li><b>Claude</b> (web, desktop and mobile): Settings → Connectors → find <b>Helm</b>, or Add custom connector with the address above.</li>
        <li><b>Claude Code</b>: <code>claude mcp add --transport http helm {SITE}/api/mcp</code></li>
        <li><b>ChatGPT</b>: Settings → Connectors → Add, with the address above.</li>
        <li><b>Cursor and other MCP clients</b>: add a remote (Streamable HTTP) MCP server with the address above.</li>
      </ul>
      <p>The AI tool sends you to Helm to sign in. Helm then asks whether to allow the tool to act as you; choose
        <b> Allow</b>. You can remove access at any time from the AI tool&apos;s connector settings.</p>

      <h2>What the AI can do</h2>
      <p>The AI acts as you, and Helm checks every request in its database exactly as it does in the app: it can only
        see and change what you can. Customers see only their own company&apos;s work, and never Seven Billion&apos;s
        internal notes, estimates or rates.</p>
      <p><b>Read</b> (everyone, limited to what you can see):</p>
      <ul>{READS.map(([n, d]) => <li key={n}><code>{n}</code>: {d}</li>)}</ul>
      <p><b>Change</b>:</p>
      <ul>{WRITES.map(([n, d, who]) => <li key={n}><code>{n}</code>: {d} <span className="text-muted">({who})</span></li>)}</ul>
      <p>The connector cannot delete anything, decide approvals, create statements or invoices, or change settings.
        Do those in Helm itself.</p>

      <h2>Things to ask</h2>
      <ul>
        <li>&ldquo;What&apos;s overdue on my plate this week, and what is waiting on the customer?&rdquo;</li>
        <li>&ldquo;Give me a status summary of the Acme data platform project: progress by phase, risks and open requests.&rdquo;</li>
        <li>&ldquo;Create tasks in the Delivery phase for the three action items from these meeting notes, assigned to Priya, due Friday.&rdquo;</li>
        <li>&ldquo;Log 2.5 hours today on the dashboard redesign task.&rdquo;</li>
        <li>&ldquo;Raise a change request to add a region filter to the sales report.&rdquo;</li>
      </ul>

      <h2>Your data</h2>
      <p>The connector reads and writes Helm data only when you ask your AI tool to, using your own sign-in. Helm does
        not send your data to the AI provider by itself and keeps no copy of your conversations; what the AI tool does
        with the answers it receives is covered by that tool&apos;s own terms and privacy policy. See Helm&apos;s
        <a href="/privacy"> privacy policy</a>.</p>

      <h2>Help</h2>
      <p>Write to <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>, or ask the Seven Billion team you work with.</p>
    </LegalPage>
  )
}
