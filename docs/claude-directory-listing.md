# Helm: Claude Connectors Directory listing

What to enter at [claude.ai/directory/manage](https://claude.ai/directory/manage) → **Submit new** → **MCP connector**. Field limits are from Anthropic's [submission guide](https://claude.com/docs/connectors/building/submission).

## 1. Connection

- **Server URL**: `https://helm.sevenbillion.co/api/mcp`
- **Users connect to different URLs**: no (one URL for everyone)

## 2. Tools

These sync from the server. All 18 have a `title` and `readOnlyHint` / `destructiveHint` annotations (`src/lib/mcp/tools.ts`):

- **12 read tools**: whoami, search, list_projects, get_project, list_tasks, my_work, get_task, list_requests, get_request, list_approvals, list_updates, list_people
- **6 write tools**: create_task, update_task, log_time, set_request_stage, add_comment, create_request
- **None are destructive**

## 3. Listing

- **Name** (≤100): `Helm by Seven Billion`
- **One-liner** (≤200): `See and move your Seven Billion projects from Claude: plans, tasks, requests, approvals and weekly updates, with the same access you have in Helm.`
- **Description** (≤2,000):

  > Helm is the client delivery workspace Seven Billion Analytics runs its data and analytics projects in, together with its customers. The Helm connector brings that workspace into Claude.
  >
  > Ask in plain words what is overdue, what is waiting on the customer, or how a project is going by phase, and get answers from live Helm data. Turn meeting notes into tasks with owners and due dates. Update a task's status or owner, log your hours, comment on a task or request, raise a change request, or move a request to its next stage, without leaving the conversation.
  >
  > You sign in with your own Helm account. Claude then acts as you, and Helm's database checks every request exactly as in the app: you only see and change what you could in Helm. Customers see only their own company's work, never Seven Billion's internal notes, estimates or rates. The connector cannot delete anything, decide approvals, bill or change settings.
  >
  > Helm is for Seven Billion's team and the people at its customers. Accounts are by invitation.

- **Categories** (1–5): Project management · Productivity · Business operations. Pick the closest the portal offers.
- **Documentation URL**: `https://helm.sevenbillion.co/connect`
- **Privacy policy URL**: `https://helm.sevenbillion.co/privacy`
- **Support contact**: `abhijit@sevenbillion.co`
- **Icon**: `public/brand/icon-512.png` (512×512). The square mark is `public/brand/mark-512.png`.
- **Slug** (permanent once published): `helm-seven-billion`

## 4. Use cases

- **Primary use cases**:
  - status questions across projects
  - a personal "what's on my plate" view
  - turning notes into planned tasks
  - logging time
  - raising and progressing customer requests
- **What users need**: an invitation to Helm from Seven Billion (team member or customer). No plan or setup in Claude beyond adding the connector.
- **Reads or writes**: both.
- **Example prompts** (at least 3):
  1. "What's overdue on my plate this week, and what is waiting on the customer?"
  2. "Give me a status summary of the [project] project: progress by phase, overdue tasks and open requests."
  3. "Create tasks in the Delivery phase for the action items in these meeting notes, assign them to [person] and make them due Friday."
  4. "Log 2.5 hours today on the dashboard redesign task."
  5. "Raise a change request to add a region filter to the sales report."

## 5. Company

- **Company**: Seven Billion Analytics
- **Website**: https://sevenbillion.co
- **Primary contact**: Abhijit, abhijit@sevenbillion.co

## 6. Authentication

- **Requirement**: required
- **Method**: OAuth 2.0, dynamic client registration
  - Authorization server: `https://ewouwiotzaxynlmnysyx.supabase.co/auth/v1` (Supabase Auth OAuth 2.1 server, PKCE S256)
  - Advertised by the server at `/.well-known/oauth-protected-resource/api/mcp`
  - Claude registers itself, so there are no client credentials to hold

## 7. Data handling

- **API**: Seven Billion's own (Helm)
- **Personal health data**: no
- **Sponsored content**: no

## 8. Test & launch

1. Create two reviewer accounts in Helm with realistic dummy data, under a demo customer such as "Northwind Demo":
   - a **team** account (PM role)
   - a **customer** account at the demo customer
2. Fill the demo customer with:
   - two or three projects, each with phases and tasks (some overdue, some waiting on the customer, some done)
   - open requests, a pending approval and a published weekly update
3. Give both accounts a password: Helm supports email and password sign-in.
4. Enter the credentials in the portal. Only reviewers see them.
5. **Reviewer steps**:
   - Add the connector.
   - Sign in at the Helm screen with the test email and password.
   - Choose **Allow**.
   - Try the example prompts, then repeat as the customer account to see the narrower access.
6. Before submitting, run every tool once yourself in Claude: add Helm as a custom connector.

## 9–10. Compliance and submit

Read and accept the seven acknowledgments, then submit. Status and feedback appear in the portal. Escalations go to mcp-review@anthropic.com.
