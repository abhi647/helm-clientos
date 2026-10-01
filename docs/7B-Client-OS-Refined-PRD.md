# 7B Client OS

## Refined product, experience, and implementation specification

Version 2.2 · 1 October 2026 · Status: target implementation contract

Owner: Seven Billion Analytics. Audience: product, design, engineering, delivery, and finance.

This document refines the supplied 78-section BRD and incorporates the requested Jira-style project module. It specifies the complete target product and staged release gates. The working application is now Helm, a Next.js browser-local build with substantially expanded delivery workflows. See `Helm-Build-Coverage.md` for implemented behavior and `Helm-Design-System.md` for the revised visual contract. The complete target remains in scope; local persistence and passing tests are not evidence of production readiness, live multi-user collaboration or full Jira parity. Section 12's original token proposal is superseded by the current design document; its usability and access requirements remain.

## 1. Product intent

Build the operating environment for Seven Billion's post-sale customer relationships. Give delivery teams configurable work management and give customers a polished, focused portal for progress, requests, decisions, approvals, and next actions. A customer workspace persists across implementations, support engagements, retainers, and renewals.

The core loop is: capture context → identify the next action → assign ownership → execute and collaborate → approve the relevant version → communicate progress → retain history → reuse the delivery pattern.

The product combines Jira's configurable work model with the customer experience patterns documented by Rocketlane. Premium quality means clear hierarchy, consistent components, accurate information, responsive interactions, and complete loading, empty, error, and permission states. Reference parity is a design target, not a claim that the complete authenticated Rocketlane application has been inspected.

## 2. Outcomes and proposed pilot measures

Measure the first four weeks of current delivery practice before the pilot. Targets below are hypotheses to validate, not historical results.

| Outcome | Pilot target | Measurement |
|---|---|---|
| Customers understand their next action | 90% of test participants find and complete a pending action without help | Moderated task test |
| PMs spend less time chasing status | 30% reduction from baseline | Weekly PM time diary |
| Requests retain their context | 95% have owner, project, next action, and current status | Database quality check |
| Approvals are traceable | 100% reference a frozen version and named approver | Approval integrity check |
| Updates are easy to prepare | Median under 10 minutes to review and publish | Product events |
| Permissions are dependable | Zero cross-customer or internal-content leaks in acceptance tests | RLS/API/storage test suite |
| Customers adopt the portal | 70% of invited pilot stakeholders complete one action within seven days | Invitation and action events |

Initial planning envelope: 20 internal users, 100 customer users, 20 customer workspaces, 50 active projects, 50,000 issues, 20 GB of files, and 3,000 transactional emails per month. These are load-test and budget assumptions; review them against actual usage before deployment.

## 3. Product structure and modularity

Use Organization → Customer → Workspace → Project as the ownership structure. Organization initially means Seven Billion. Each customer has one persistent workspace and multiple projects. A customer user may belong to multiple explicitly authorized customers.

Within a project, phases and milestones organize the delivery plan; epics, standard issues, and subtasks organize work. Requests, approvals, documents, meetings, decisions, updates, and invoices link to relevant records. Requests can exist at workspace level before project assignment. Billing is related to delivery, not a child of an individual task. Sprints cut across phases and are optional.

Modules: identity and access; customer workspaces; project management; AI project planning; requests and forms; approvals; documents; meetings and decisions; updates; notifications; templates and automations; finance context; resources and time; AI assistance.

Each module owns its schema, validation, service functions, UI routes, tests, and feature flag. Modules integrate through typed IDs and domain events. Disabling a module removes its navigation and creation commands, preserves existing data, and exposes dependency warnings to administrators. No runtime plugin execution or arbitrary uploaded code in the initial product.

## 4. Personas and home screens

| Persona | Landing experience | Primary action |
|---|---|---|
| CEO / delivery leader | Material exceptions and portfolio | Resolve or delegate an exception |
| PM / account manager | Blockers, overdue customer actions, pending approvals | Move the engagement forward |
| Consultant / developer | My Work, grouped by urgency and dependencies | Open the next executable issue |
| Finance | Billing readiness and invoice aging | Reconcile or follow up |
| Customer executive | Shared milestones, latest update, decisions | Review progress or approve |
| Customer contributor | Assigned actions, requests, shared deliverables | Respond, upload, test, or approve |
| Administrator | Access, configuration, integration health | Configure or recover |

Internal global navigation: Home, Customers, Projects, Requests, My Work; secondary group: Time, Resources, Finance, Reports; administration group: Templates, Settings. Hide unreleased modules. Project tabs: Overview, Work, Requests, Documents, Meetings, Updates, Team; restricted secondary tabs: Commercials, Activity, Settings. Work contains Board, Backlog, List, Timeline. Remember an internal user's preferred project view.

Customer navigation: Home, Projects, Requests, Documents, Meetings; Invoices only for authorized roles. Customer project tabs: Overview, Plan, Requests, Deliverables, Updates, Team. Customer labels use plain delivery language rather than internal sprint terminology.

## 5. Complete service flows

### 5.1 Closed-won to kickoff

HubSpot event or manual setup creates a draft engagement suggestion. PM verifies customer, contacts, deal, delivery owner, service, dates, and template. Preview the generated phases, issues, forms, spaces, and milestones. Creating the project pins the template version and creates records transactionally. PM reviews shared content and invitations, then explicitly publishes the portal. Invitations create limited memberships rather than global access. Replayed events return the existing engagement.

### 5.2 Request to delivery

Customer selects request type, explains need and business outcome, supplies desired date and attachments, then submits. Show the durable request ID only after commit. PM triages, assigns owner, asks clarifications, and decides whether it is existing scope, support, a defect, or a commercial change. An estimate contains effort, scope, exclusions, acceptance criteria, and proposed date. Approval references that version. Approved work creates or links issues without duplicating the request. Delivery issues can progress independently; the request enters UAT when the agreed deliverable is published. Customer signs off or requests changes. PM closes the request with release evidence and confirmation.

State machine: Submitted → Under review → Clarification needed / Estimated → Awaiting approval → Approved → Scheduled → In delivery → UAT → Delivered → Closed. Rejected and Cancelled are terminal alternatives. Resubmission is explicit. Support requests may use a configured shorter path. Changing an issue does not automatically invent customer-facing progress: public stages are controlled mappings with audit events.

### 5.3 Customer session

Invitation → verified sign-in → relevant workspace → Needs your attention → action detail → submit response or approval → persisted confirmation → next action or project update. Deep links preserve destination after authentication. The customer can finish a routine session in approximately two minutes; use this as a usability target.

### 5.4 Team execution

My Work → issue detail → requirements and acceptance criteria → linked files and decisions → start work → collaborate → submit for review → reviewer validates → publish deliverable if authorized → customer UAT → completion. Blocked work records blocker, owner, and next follow-up date. Assignment and status changes trigger relevant notifications.

### 5.5 Weekly update

PM opens a draft with completed work, milestones, blockers, requests, and customer actions for the selected reporting period. Review a customer-safe preview, edit narrative, and publish. The published version is immutable; corrections create another version. Queue email and in-app notifications after the transaction. Email failure does not erase the published update.

### 5.6 Closure and continuing relationship

Verify open work, handover files, access decisions, approval, and billing readiness. Resolve or explicitly transfer unfinished issues. Obtain closure approval, archive the project, and retain the customer workspace. An archived project is read-only until a permitted reopen action. Renewals and new engagements reuse authorized history and templates.

## 6. Jira-style project management contract

“Like Jira” means configurable behavior and familiar work patterns. The target includes the capabilities below. Marketplace compatibility, every Jira administration scheme, and a complete JQL interpreter are separate future scope.

### 6.1 Projects and issue model

Support Scrum, Kanban, implementation, support, and advisory templates. Each project has a unique stable key, name, owner, customer, members, timezone, working calendar, workflow schemes, field schemes, and enabled views.

Default hierarchy: Epic → Story / Task / Bug → Subtask. Administrators can add custom types at an existing hierarchy level, assign icons and descriptions, and configure allowed parent types. Issue numbering is transaction-safe and never reused. Changing type validates required fields and workflow mapping. Cycles and cross-customer parent relationships are prohibited.

Default issue fields: key, type, summary, rich-text description, acceptance criteria, status, resolution, assignee, reporter, priority, labels, component, epic/parent, phase, milestone, sprint, release, start/due dates, points, estimated hours, visibility, blocked reason, linked request, attachments, watchers, created/updated timestamps, and record version. Story points and hours are independent; do not convert them automatically.

Links: blocks / blocked by, relates to, duplicates / duplicated by. Dependency cycle detection applies to blocking links. Hierarchy, dependency, phase membership, and milestones are distinct relationships.

### 6.2 Custom fields and layouts

Field types: text, long text, number, date, datetime, single/multi select, checkbox, user, URL, currency with currency code. Give definitions stable IDs, project/type scope, help text, option IDs, required rules, and audience. Configure Create, Edit, and Detail layouts with ordered sections. Server validation applies to API writes and imports as well as forms.

Archive fields and options rather than deleting historical values. Changing type requires an explicit conversion preview. Customer-readable fields belong to a public projection; restricted fields are never delivered in a customer API response. Saved filters with missing fields show repairable errors.

### 6.3 Workflows

Workflow versions contain statuses, transitions, permitted roles, required fields, validators, and supported post-actions. Every status maps to To do, In progress, or Done; resolution is required for terminal completion. Different issue types can use different workflows. Start with editable transition tables; add a visual graph editor in the subsequent release.

Draft → validate → preview affected issues → publish. Removing a used status requires a migration mapping. Projects can inherit a version or fork it. Updates to a shared template never silently alter live projects. Keep version history and the ability to create a corrective version.

Board drag, issue detail, bulk update, automation, and API all invoke the same transition service. Invalid moves show the missing requirement and keep the issue in its original column. Transition, audit event, and notification outbox entry commit together. Concurrent changes use expected record version; conflicts show current data and allow retry.

### 6.4 Board

Each board has a saved issue filter, ordered columns mapped to one or more statuses, optional WIP limits, swimlanes, quick filters, visible card fields, and a saved sorting preference. Support grouping by assignee, epic, and priority. Drag within a column changes rank; dragging between columns requests a transition. If a column maps to multiple eligible statuses, ask which target status.

Cards show type, key, summary, priority, assignee, estimate, due indicator, and visibility. Card density has Comfortable and Compact settings. Clicking opens a deep-linkable drawer; Open full page supports longer work. Keyboard actions and move menus provide alternatives to dragging.

### 6.5 Backlog and sprints

Support rank ordering, epic grouping, create/edit sprints, sprint goals, dates, planned capacity, adding/removing issues, start/complete sprint, and moving incomplete work to another sprint or backlog. Initially allow one active sprint per project. Kanban projects do not require sprints.

Starting records a baseline; additions/removals remain visible as scope change. Completed-sprint history is immutable. Completing a sprint requires disposition of unfinished work. Reopening an issue from a completed sprint records the change without rewriting the original completion snapshot.

### 6.6 List, search, and bulk work

List supports selectable columns, sorting, grouping, pagination, inline edit, saved personal/shared views, and filters on type, status, assignee, priority, labels, dates, epic, sprint, and custom fields. Release one offers a filter builder. Later query syntax is a documented subset with server-side parsing and bound parameters.

Bulk assignment, priority, labels, and transition show affected count and validation preview. Return partial results by issue if validation differs. Exports include only authorized fields and rows. Import validates keys, assignments, statuses, fields, and dependencies; show errors before committing a batch.

### 6.7 Plan, timeline, releases, and reports

Plan groups work into phases and milestones, with customer-visible checkpoints. A milestone may require both completed issues and an approved deliverable. Progress is calculated from an explicit basis: issue count or weighted completed work; display the basis and sample size. Customer progress uses shared scope only. PM health remains a separate assessment with reason and timestamp.

Timeline uses actual start/due dates and dependencies. Undated work appears in Unscheduled. Drag date changes through validation; dependency violations show warnings. Early releases never imply automatic critical-path scheduling. Releases group deliverables with version, date, notes, and linked issues.

Reports: sprint burndown from daily snapshots, scope change, velocity with historical context, cycle time, aging work, and blockers. Define cycle time from first active-state entry to terminal completion; show reopened work separately. Reports never fabricate historical points from present-day statuses.

## 7. Customer portal and action engine

Customer Home order: workspace identity and contact; Needs your attention; active projects; latest update; upcoming milestones; shared resources. At zero pending actions, show “You're up to date” with the next milestone and latest update. Project cards show owner, current phase, next checkpoint, health explanation, and last update date. Stale updates are visibly marked.

Action items reference source records: approval, clarification, form, upload, assigned issue, UAT, meeting action, or authorized invoice. Persist assignment and lifecycle; source completion resolves the related action in the same transaction. Overdue is derived from due date and open status, not a separate terminal state. Deduplicate by source, recipient, and action type. Customer choice of desired date is distinct from committed delivery date.

Portal templates configure approved page sections, order, welcome copy, logo, theme tokens, FAQs, and resources. Preview as a specific customer role before publication. Theme customization retains contrast and component structure. Initial templates: Implementation, Support, Advisory, Dedicated Resource. Portal analytics measure action completion; they do not expose another customer's activity.

## 8. Approvals and UAT

Support scope, estimate, requirement, design, document, deliverable, UAT, and closure approvals. Each round freezes source version, summary, scope, attachments, requester, approver, due date, and decision criteria. Required outcomes: Approve and Request changes; changes require a reason. Authentication and current authority are verified at decision time.

Initial release uses one accountable approver per round. Later release supports all-required and ordered multi-approver policies. Submitted source changes create a new round and supersede the old pending round. Approved rounds remain immutable. Repeated decision submissions return the existing result. Approval here is an operational acknowledgment; legal e-signature requires a separate integration and requirements.

UAT packages contain versioned deliverables, test cases, acceptance criteria, customer feedback, linked defects, and sign-off. Rejected tests can create defects after PM review; they do not silently close the package. Publish the corrected version for another round.

## 9. Forms, collaboration, documents, and knowledge

Forms are versioned definitions with required fields and supported conditional sections. Initial types: text, long text, number, date, dropdown, multi-select, yes/no, and upload. Later add repeatable tables, contact fields, currency, rating, and richer conditional logic. Freeze schema per submission, allow saved drafts, and transactionally create configured requests/actions. Preserve the original response alongside any structured interpretation.

Comments attach to issues, requests, documents, approvals, meetings, and updates. Provide replies, mentions, edit history, attachments, and explicit audience. An internal comment on a shared object remains internal. Notify only users who can read the object and the comment. Mention suggestions themselves respect membership.

Documents have internal/shared spaces; folders for Commercial, Requirements, Design, Delivery, UAT, Meetings, Handover. Upload creates a new immutable file version with owner, content type, size, hash, storage key, audience, and links. Initial limit: 25 MB per file, configurable by administrators. Validate size and content type server-side; restrict executable formats, use safe previews and attachment disposition for unsupported content. Show upload progress, retry, and failure. Customers never receive internal file names or counts. Downloads require fresh authorization and short-lived signed URLs.

Meetings store agenda, participants, summary, decisions, questions, risks, and actions. Creating an issue from an action preserves the link and prevents double creation. Decisions record author, date, rationale, source, and replacement decision if superseded. Later transcript ingestion is opt-in and processed under the AI rules.

Updates are structured, versioned publications. Draft sections use authorized data; customer publications include only approved shared content. Activity has internal and shared projections. Historical snapshots and audit payloads follow the same access rules as current records.

## 10. Templates and automation

Starter project templates: BI / Power BI, Data Platform, AI Pilot, AI Application, Demand Planning, Optimization, ERP Implementation, ERP Integration, Support, Retainer, Dedicated Resource. Start with BI, ERP Integration, and Support in the pilot; add the remainder after real delivery review.

Templates pin phases, issue types, workflows, fields, layouts, milestones, forms, document structures, updates, portal configuration, and allowed automation rules. Creation previews dates relative to kickoff and configured working days. A template revision affects new projects; applying it to existing work requires an explicit diff and mapping.

Automations use WHEN event, IF permitted conditions, THEN supported actions. Initial actions: assign owner, create action/issue, request approval, queue notification, set allowed field, escalate. Persist event ID, rule version, run status, attempt count, and result. Prevent repeated side effects with idempotency keys; cap chain depth and run count to prevent loops. Rules execute with an explicit service identity and scoped permissions. The administrator can disable, inspect failures, and retry safely.

## 11. Resources, time, finance, and integrations

Time entries link to person, date, issue/project, hours, billable category, and approval state. Approved entries require reversal/correction history. Capacity uses working calendar, allocation period, leave, and skill. Display over-allocation and gaps. Retainers track purchased hours, approved consumption, carry-forward policy, adjustments, and remaining balance. Forecasts are labeled estimates with methodology.

HubSpot owns companies, contacts, deal stage/value, and sales ownership. Client OS owns delivery records and membership. Imported contacts do not automatically become authorized users. Closed-won creates a reviewable suggestion. Maintain external IDs, source timestamps, last sync, error, and reconciliation state. Deduplicate by external IDs, not just names or emails. Outbound delivery summaries are optional and scoped.

Zoho Books owns invoices, payment status, tax, balances, and accounting currency. Client OS stores a synchronized read model linked to customer/project plus billing readiness. Finance validates mismatched records. Initial integration is read-only; invoice creation and payment collection are later explicit scope. Show stale data and last successful sync. Do not sum different currencies without a stated conversion basis.

Use server-side OAuth/secrets, verify provider webhook signatures, deduplicate events, process retries, and run periodic reconciliation. Specify endpoint versions and account permissions during implementation using current vendor documentation. Prototype and pilot can use manual import with a visible “Manual / Demo” badge. Production integration acceptance requires authenticated end-to-end evidence.

## 12. Premium experience and visual design contract

### 12.1 Direction

Use a calm white canvas, pale neutral navigation, deliberate typography, restrained teal accents, readable status colors, and generous grouping. Internal work views are denser; the customer portal is more spacious. Both use the same component family. Rocketlane's published portal supports branded pages, sections, fonts, colors, and widgets; these principles inform the following proposed 7B design, rather than supplying copied proprietary assets.

### 12.2 Tokens

| Token | Proposed value / rule |
|---|---|
| Canvas / surface / navigation | #FFFFFF / #FFFFFF / #F7F9FB |
| Primary text / secondary text | #182B3A / #526474 |
| Border | #DEE5EB |
| Primary / hover / tint | #007F78 / #006861 / #E6F4F2 |
| Success / warning / danger | #176B45 / #8A5700 / #B42318 |
| Typography | Self-hosted Inter; 14px default, 16px portal body; 12px minimum metadata |
| Type scale | 12, 14, 16, 20, 24, 32px; weights 400, 500, 600 |
| Spacing | 4, 8, 12, 16, 24, 32, 48px |
| Radius | 6px controls, 8px cards, 12px dialogs |
| Control / table row heights | 36px default, 44px touch; 40px compact / 48px comfortable rows |
| Elevation | Border for ordinary surfaces; soft shadow for drawers, menus, dialogs |
| Motion | 120–180ms controls, 200–240ms drawers; respect reduced motion |

Verify final foreground/background combinations to WCAG 2.2 AA. Customer branding cannot override error/status semantics or reduce contrast. Use the verified Seven Billion logo when supplied; any temporary wordmark is explicitly a placeholder.

### 12.3 Layout and navigation

Desktop shell: 60px top bar, 224px collapsible sidebar, 32px page gutter; content responds to available width. Customer content max width 1200px; long-form reading 720px. Project header carries customer, name, health, dates, and owner, followed by context tabs. Keep a single obvious primary action per page. Secondary actions belong in a consistent toolbar or menu.

Board columns are 280–320px wide with intentional horizontal scrolling. Tables have sticky headers and saved column widths. Issue drawer occupies 640–880px depending on viewport and includes Open full page. On mobile, issue detail is full-screen; portal cards stack, actions remain reachable, and work lists replace wide tables by default. Never force a 1100px body minimum.

Navigation exposes published, permitted modules. Preserve filters, scroll, selection, and URL when a drawer closes. Deep links work after refresh. Breadcrumbs return to context. Command palette searches authorized records and available commands with keyboard navigation.

### 12.4 Screen specifications

| Screen | Main content | Primary action | Required alternate state |
|---|---|---|---|
| Customer Home | Pending actions, projects, update, next milestones | Complete next action | Up to date; invitation incomplete |
| Customer Project Overview | Phase, milestone, health reason, owner, update | Review requested action | Project awaiting kickoff |
| Team Home | Exceptions with owner and next step | Resolve exception | No exceptions |
| Customer workspace | Active/archived projects, contacts, shared history | Create engagement | First project onboarding |
| Project Overview | Delivery plan summary, blockers, upcoming checkpoint | Review plan | Unscheduled project |
| Work Board | Configurable columns, cards, filters | Create issue | No matching issues |
| Backlog | Planned sprints, ranked work, epic grouping | Plan/start sprint | Kanban project |
| Issue Detail | Description, acceptance, links, activity, properties | Valid next transition | Conflict or required fields |
| Request Detail | Public stage, discussion, estimate, approval, deliverable | Respond to current step | Cancelled/rejected request |
| Approval | Frozen source and clear decision | Approve / request changes | Superseded or already decided |
| Documents | Spaces, versions, linked records | Upload document | Upload failure or unavailable preview |
| Meeting | Agenda, summary, decisions, actions | Publish notes | Draft/private notes |
| Updates | Published history and draft composer | Publish update | No updates yet |
| My Work | Today, overdue, blocked, upcoming | Open next issue | Nothing assigned |
| Finance | Readiness, invoice balances, aging | Reconcile | Integration stale |
| Settings | Types, fields, layouts, workflows, templates | Publish configuration | Migration required |

### 12.5 Interaction quality

All interactive controls have accessible names, focus states, disabled reasons, and working outcomes. Rich text supports headings, lists, links, and safe attachments. Inline edit shows saving, saved, or failed only from actual persistence. Drag operations have keyboard/menu alternatives and server rejection recovery. Show status as text plus icon/color; labels such as Shared with customer are always visible at publication points.

Optimistic updates are permitted for low-risk edits with rollback. Approvals, invitations, publishing, billing changes, and configuration migrations wait for server confirmation. Toasts summarize results without hiding persistent errors. Deletion uses recoverable archive where practical; dangerous configuration changes preview their impact. Empty states explain the next useful action; skeletons match final layout; offline drafts show unsent state.

### 12.6 Design acceptance

Review complete journeys at 1440, 1280, 768, and 390px; test keyboard-only use and 200% zoom. No clipped controls, unreadable metadata, unexplained blank pages, placeholder metrics, decorative fake activity, or inactive controls in released routes. Design QA uses one component inventory and visual regression checks for representative states. Validate findability with five internal users and five customer users before the pilot; record task success and confusion.

## 13. Permissions and privacy model

Roles: organization admin, delivery leader, PM, contributor, finance, customer admin, customer executive, customer contributor, read-only guest. Scope roles to organization, customer, or project. Capabilities define allowed operations; UI labels are not authorization.

Access requires active membership, allowed scope, permitted action, and audience. Customer users read only authorized shared projections. A shared object does not make its internal comments, cost, effort estimates, employee rates, or restricted files readable. Finance access is separately granted; PM commercial access is configurable. Customer admin manages only permitted memberships within their customer.

RLS applies to every exposed table; private storage requires equivalent policies. Sensitive fields live in restricted tables/projections because row-level access alone does not hide columns. Foreign-key and tenant constraints prevent cross-customer linking. Search, exports, subscriptions, counts, audit records, and emails apply the same access checks. Service-role keys stay server-side; each privileged endpoint validates caller scope.

Invitations are scoped, expiring, single-use, and tied to the intended identity. Revocation removes active access; short-lived download URLs limit residual file access. Existing downloaded copies cannot be revoked. Test employee removal, customer reassignment, role downgrade, and shared-to-private changes.

## 14. Low-cost architecture

Frontend: Next.js with TypeScript on Vercel, using a shared component system and module routes. Adapt or replace the current Vite prototype intentionally; it is not already Next.js. Use a query cache for work views, URL state for filters, and server rendering where it improves first load. Self-host fonts and compress assets.

Backend: one Supabase production project for PostgreSQL, Auth, private Storage, selected Realtime subscriptions, and Edge Functions. Customer workspaces are database records, not separate Supabase instances. Use migrations, typed generated clients, RLS, indexed tenant/project keys, transaction-backed RPCs for domain writes, and bounded pagination.

Responsibilities: PostgreSQL handles transitions, approvals, membership constraints, audit events, and outbox creation. Supabase Edge Functions handle Resend, integration events, AI calls, and queue processing. Vercel handles frontend delivery and thin session-aware rendering; avoid duplicate backend services for the same job. Secrets reside only in approved server environments.

Use a PostgreSQL jobs/outbox table with a scheduled bounded worker. Workers claim jobs atomically, lease them, retry with backoff, and move exhausted work to a visible failed queue. Repeated execution must be safe. No separate Redis, message broker, search cluster, or always-on custom server for the pilot. Add infrastructure only when measured throughput or capabilities require it.

Realtime is scoped to open project views and notifications; disconnect unused channels. It invalidates cached reads rather than becoming the sole source of correctness. File uploads/downloads go directly to authorized Storage paths, avoiding Vercel proxy bandwidth. PostgreSQL full-text search serves initial search. AI retrieval can start with permission-filtered structured queries.

Development uses local Supabase and synthetic fixtures. Vercel previews never connect to production write credentials. Use an isolated hosted staging project if required for integration/restore validation and account for its compute cost. Production and test credentials remain distinct.

## 15. Resend and notification reliability

Configure a verified sending subdomain and Supabase custom SMTP for authentication mail where supported. Application email is sent from the committed outbox through Resend. Templates: invitation, assignment, clarification, approval requested/decided, weekly update, milestone warning, and authorized invoice reminder.

Deduplicate event/recipient/template version. Recheck permission before rendering or sending delayed jobs. Keep email content minimal and deep-link to authenticated detail; internal content never enters customer email. Apply preferences and digests to optional updates; required authentication and action notices remain service messages. Honor bounce/suppression signals and signed webhook verification.

Track queued, attempted, provider accepted, delivered, bounced, and failed separately. Provider acceptance is not delivery. Reserve email capacity for authentication, throttle bulk invitations, and notify administrators before quota exhaustion. Initial release has no inbound-email task creation.

## 16. Anthropic features and controls

AI project planning from an uploaded SOW is a selected product requirement. Anthropic integration stays disabled until credentials are configured and the document's permitted processing scope is established. Additional candidate features are requirement structuring, weekly update drafts, source-linked project summaries, and meeting action suggestions. Enabling one feature does not authorize transmission of every customer document.

Credentials are server-only. Limit input to relevant authorized records; do not forward secrets, entire workspace dumps, or internal context to customer-facing generation. Record feature, model, prompt version, input/output token usage, duration, and estimated cost without logging raw sensitive prompts by default. Uploaded text is data, never executable instruction.

Outputs are drafts with source record links. Validate structured output against a schema. Users review before official issue creation, publication, email, approval, or commercial action. Cap request size, daily user calls, project concurrency, retries, and monthly spend. Once budget is reached, show AI unavailable while all manual workflows remain usable. Confirm model pricing and provider retention terms when enabling the feature.

### 16.1 AI Project Planning: SOW to reviewed delivery plan

Purpose: convert a Statement of Work into a tentative, traceable project plan that developers can review and modify before the PM approves its publication. Expose Planning in internal project navigation and Create plan from SOW in draft engagement setup. This is an early-release module integrated with the Jira-style work model.

Flow: upload SOW → review extracted scope → generate tentative plan → developer review and modification → PM validation and scheduling → preview publication → publish live project plan. Existing manual project setup remains available.

**Upload and extraction.** Accept PDF and DOCX within the configured document limit. Keep the original immutable document version and content hash in private Supabase Storage. Extract deliverables, requirements, exclusions, acceptance criteria, contractual dates, customer obligations, dependencies, and commercial assumptions. Each extracted item retains a page/section or paragraph locator and source passage. If text extraction is incomplete, unreadable, or requires OCR, show the affected pages and require corrected text or a supported extraction path before claiming full coverage. DOCX references use paragraph/section locators rather than unstable page numbers.

**Planning inputs.** The reviewer confirms project template, kickoff date, working calendar, intended team/skills, known integrations, constraints, and planning assumptions. Unknown team capacity is recorded as unknown. AI uses the SOW and selected template version to propose phases, milestones, epics, stories/tasks/subtasks, dependencies, required skills, acceptance criteria, effort ranges, and suggested owners by role. Every proposed item is marked Contractual scope, Inferred delivery work, or Assumption; contractual classification requires a source reference. Exclusions remain visible and cannot silently become committed scope.

**Scheduling.** AI proposes breakdown and effort ranges. Application scheduling derives indicative dates from reviewed effort, explicit capacity, dependencies, kickoff, and working days. Effort is different from elapsed duration. When capacity or dependencies are missing, show unscheduled work or clearly labeled scenario dates. Preserve SOW commitments separately from tentative forecast dates and flag conflicts. Never replace a contractual date with an AI forecast or interpret missing information as a confirmed commitment.

**Developer review.** Assign one or more developers/technical leads. They can edit the hierarchy, split/merge/add/remove work, revise effort ranges and dependencies, specify technical approach, update acceptance criteria, and leave review comments. Preserve the original suggestion and subsequent versions. Regenerate selected sections on demand with a preview of additions, removals, and changes; never silently overwrite reviewer edits. Regeneration against a stale draft requires a conflict resolution. Developers mark their assigned scope Reviewed or Needs clarification; an unresolved critical clarification blocks publication.

**PM approval.** PM reviews deliverable-to-task coverage, explicit exclusions, technical review completion, customer dependencies, capacity assumptions, milestone/date conflicts, and scope/commercial implications. A coverage view identifies SOW deliverables with no planned work and proposed work without a source or rationale. PM must resolve blocking gaps or record an explicit authorized disposition. Internal technical review is distinct from customer contractual approval; changed scope or commitments use the existing versioned approval/change-request process.

**Publication.** Preview records to create/update, estimates, schedule basis, visibility, and customer-facing milestones. A permitted PM publishes the approved draft version through a transaction-backed, idempotent service. Create actual phases, milestones, epics, issues, and dependency links using project field/workflow validation; record draft-item-to-live-record mappings. Default generated issues to Internal, with customer sharing explicitly selected. A repeated publish returns the same records. Failure leaves a recoverable draft and never a partially published plan presented as complete.

**Revised SOW.** Upload a new source version and compare it with the previous SOW and current live plan. Show added, changed, removed, and ambiguous scope plus estimated schedule/effort impact. Propose a reviewed change set; preserve issue IDs, completed work, approved rounds, and delivery history. Do not delete completed issues when scope disappears. New scope or altered commitments may require a change request/customer approval. Publication uses current live-record versions and surfaces conflicts with work changed since drafting.

**States and ownership.** Draft lifecycle: Uploaded → Extracting → Scope review → Generating → Developer review → PM review → Approved → Published. Failed processing is a recoverable job state; Needs clarification is a review condition. Revisions create a new draft rather than reopening a frozen published version. Upload/generate permission belongs to scoped PMs and designated planners; developers edit only drafts they are assigned to review; PM publication is separately granted. Customers see only explicitly published shared output.

**Premium planning interface.** Provide a step indicator, resumable processing status, and split view with source document on the left and editable plan on the right. Use tabs for Scope, Plan, Dependencies, Schedule, and Review. Rows show source/classification, effort range, reviewer, and review state. Selecting a citation reveals its source passage. Show unresolved questions, coverage gaps, and forecast assumptions adjacent to affected work. At narrow widths, switch between Source and Plan without losing selection. Saving, failures, concurrent edits, and job cancellation have explicit states.

**Infrastructure and cost.** Supabase stores documents, extraction, drafts, review history, and job state; Anthropic generates structured proposals through server-only calls; Resend notifies assigned reviewers. Reuse the bounded jobs/outbox worker and AI usage ledger. Chunk large inputs within configured limits, cache extraction by document hash and extractor version, and cache compatible generation inputs by source/template/prompt/model version. Regeneration targets selected scope to reduce token cost. Show estimated usage before large runs, enforce configurable token/run/month budgets, and cap retry attempts. Cancellation preserves completed extraction and reviewed drafts. Provider failure or budget exhaustion leaves manual planning usable.

### 16.2 Planning acceptance gate

- A readable SOW produces a draft with source-linked scope and proposed phases/issues; nothing enters the live board before publication.
- Unsupported/unreadable input is reported, and extraction completeness is visible.
- Developers modify and selectively regenerate work without losing their edits or source history.
- Unmapped deliverables, unresolved critical questions, missing review, and date conflicts are exposed before PM approval.
- Schedules distinguish contractual dates, reviewed forecasts, and unknown capacity.
- Repeated publication creates one live plan; invalid issue/dependency data leaves the draft recoverable.
- Revised SOWs produce a reviewable diff and preserve completed work and approved history.
- Customer roles cannot read SOWs or draft estimates unless explicitly authorized; reviewer notifications recheck access.
- Anthropic outage, cancellation, and spend limits preserve manual work and show actual processing status.

## 17. Data contract

| Domain | Principal records | Critical invariant |
|---|---|---|
| Access | organizations, profiles, memberships, project_memberships, invitations | Explicit scope and active membership |
| Context | customers, workspaces, projects, phases, milestones | Cross-customer links rejected |
| Configuration | issue_types, field_definitions, field_options, layouts, workflow_versions, statuses, transitions, project_schemes | Published versions immutable |
| Work | issues, issue_private_details, issue_field_values, issue_links, sprints, sprint_events, boards, saved_views, releases | Stable key, valid hierarchy and transitions |
| Intake | requests, request_versions, forms, form_versions, submissions | Original input preserved |
| AI planning | sow_extractions, extracted_scope_items, plan_drafts, plan_draft_versions, plan_items, plan_dependencies, plan_reviews, plan_source_links, plan_publish_mappings | Source/version traceability; reviewed drafts; idempotent publication |
| Decisions | approvals, approval_rounds, approval_decisions, action_items | Frozen version, authorized decision, deduplicated actions |
| Knowledge | comments, spaces, documents, document_versions, meetings, decisions, updates | Audience independent for children |
| Operations | time_entries, time_approvals, resource_allocations, retainers, adjustments | Reversal history for approved consumption |
| Finance | commercial_private, integration_links, invoice_read_models | Restricted fields; source owns accounting |
| Execution | domain_events, audit_events, jobs, notifications, email_deliveries, integration_events, automation_runs, ai_usage | Durable transaction and idempotent execution |

Business rows include immutable ID, organization/customer/project scope as applicable, creator, timestamps, and record version. Use foreign keys and indexed scope columns; audit payloads have classified audiences. Store times in UTC and display user timezone; date-only commitments preserve project calendar semantics. Store money as fixed precision plus currency code. Soft archive is distinct from eventual deletion.

## 18. API and event requirements

Domain operations include create_project_from_template, create_issue, transition_issue, move_issue_rank, update_issue_fields, start_sprint, complete_sprint, submit_request, publish_estimate, request_approval, decide_approval, publish_update, invite_member, and archive_project. Document input schema, caller capability, record version, idempotency key, transaction boundary, emitted event, and error codes for each.

Planning operations: extract_sow, generate_plan_draft, regenerate_plan_section, update_plan_item, submit_plan_review, approve_plan_draft, publish_plan_draft, and compare_sow_revision. Emit scoped events for extraction/generation completion or failure, review assignment/completion, approval, publication, and revision proposal. Source document version, draft version, generation input version, and live record versions must be explicit.

Domain events carry event ID, scope, actor, source ID/version, audience, occurred-at, and schema version. Avoid putting confidential content in generic event payloads. Permission denial returns no sensitive existence detail to customers. Validation errors identify the actionable field; conflicts return authorized current state. Integration jobs expose progress and retry history to permitted administrators.

## 19. Cost and operational targets

Plan for paid production service tiers appropriate to business use; use free/local development where practical. Exact bills depend on developer seats, database compute, storage/egress, functions, email volume, AI, staging, and taxes. Vendor prices must be rechecked when purchasing.

Proposed operating budget: aim for USD 50–100/month for the pilot's core infrastructure, excluding AI, tax, domain, optional add-ons, and extra staging/developer costs. This is a planning envelope, not a quoted bundle or guaranteed maximum. If selected plans exceed it, present the line items before provisioning. No infrastructure subscriptions are purchased by this document.

Track weekly service usage; alert at 60%, 80%, and 95% of application budgets. Set vendor spend controls where available and enforce application-level limits; vendor controls may not cover every billable item. Use 50-row defaults, maximum 100-row reads, debounced search, indexed filters, digest email, file quotas, selective subscriptions, and bounded worker batches.

Operational targets: p75 primary navigation under 1.5s and p95 common writes under 1s within the deployment region under the planning load; run load tests to establish actual results. Use field Core Web Vitals targets LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. Proposed availability objective 99.5%; monitor and measure it rather than promising an unsupported SLA.

Recovery target: RPO 24 hours and RTO one business day for the pilot, dependent on verified backup arrangements. Database backups and file-object backups require separate coverage. Restore database, files, links, and permissions into an isolated environment before accepting production. Keep file backup costs in the budget. Log errors with request IDs and no credentials; track job failures and integration staleness. Assign a named operations owner before launch.

## 20. Release sequence and gates

| Release | Scope | Exit gate |
|---|---|---|
| A: foundation and design | Identity, customer/project membership, tokens, shells, migrations, RLS, synthetic fixtures | Two-customer isolation suite; responsive accessible shells |
| B: delivery core | Issue types, fields/layouts, transition editor, board/list, backlog/sprints, drawer/full page, audit, comments | Durable work lifecycle and conflict handling; no inactive released controls |
| C: customer pilot | Portal, requests, basic forms, versioned approvals, files, actions, updates, invitations, Resend; AI SOW planning with developer/PM review when Anthropic credentials are configured | End-to-end request → approval → work → UAT → closure with email recovery; SOW → reviewed draft → idempotent plan publication |
| D: operational breadth | Templates, meetings/decisions, timeline, release/report snapshots, basic automation, HubSpot/Zoho read models | Template isolation; reconciled integration tests; recoverable job failures |
| E: services operations | Time, resources, retainers, finance reporting, richer portal/form/workflow builders | Approved ledger and allocation reconciliation |
| F: expanded AI | Additional Anthropic tasks, source-linked summaries/update drafts, optional transcript input | Permission-safe generation and human review; budget cutoff |

The target product remains the complete BRD. The pilot launches at C, with selected D features if proven necessary. No fixed delivery duration is promised before estimation and team capacity review. Each gate requires demonstrated behavior, not screenshots alone.

AI planning at C requires basic project templates from D to be brought forward, source extraction/storage, the bounded worker, AI usage controls, and source-linked review UI. Advanced dynamic templates remain in D. Without configured Anthropic credentials, planning supports manual draft review/publication, and AI generation is explicitly reported as unverified rather than complete.

## 21. Acceptance scenarios

1. Customer A cannot read Customer B through guessed IDs, search, counts, files, realtime, export, or deep links.
2. A shared issue with an internal comment and commercial field returns neither restricted value nor metadata to a customer.
3. Issue creation survives refresh and concurrent creation produces unique keys. Failure never shows Saved.
4. Invalid board transition leaves state unchanged and identifies unmet requirements; valid transition creates one audit event and deduplicated notification work.
5. Workflow rename preserves status IDs; removing an occupied status requires a mapping and affects only selected projects.
6. Concurrent edits surface conflict without silently losing the newer change.
7. Sprint completion preserves historical scope and moves unfinished issues according to the confirmed disposition.
8. Replayed request submission or HubSpot event produces one source record and one engagement suggestion.
9. Approval decisions bind to the displayed version; editing scope cannot inherit approval of an older version.
10. Revoked users cannot submit pending approvals or access private documents; delayed email checks current authority.
11. Customer action resolves with its source and appears once despite repeated automation execution.
12. Resend outage preserves work and queues retries; delivery status remains distinct from acceptance.
13. File version replacement preserves previously approved attachments; backup restore recovers the referenced bytes.
14. Stale Zoho data is labeled and currency totals are accurate; customer viewers never see internal costs.
15. AI respects scope and budget; provider failure leaves manual actions available and never auto-publishes.
16. All released journeys pass responsive, keyboard, loading/error, empty-state, and 200% zoom review.
17. SOW planning satisfies every gate in section 16.2, including developer edits, source coverage, revised scope, and publication integrity.

## 22. Implementation handoff and unresolved choices

Engineering deliverables: schema/migrations, RLS/storage tests, domain services and API schemas, versioned configuration fixtures, component library, route/state specifications, transactional worker, email templates, integration runbooks, cost dashboard, restore evidence, and release acceptance recording.

Proceed on these defaults: single Seven Billion organization, customer-scoped workspaces, one active sprint per project, one approver per round, manual integration fallback, modest file limits, and AI disabled. Before production confirm real user volumes, operational owner, deployment region/data-location commitments, retention rules, official logo, sending domain, billing approvers, and AI task scope. These choices do not block specification or local development.

## 23. Primary references

Checked 1 October 2026. Sources support reference patterns and platform decisions; proposed 7B requirements and design tokens are authored for this product.

- [Rocketlane customer portal configuration](https://help.rocketlane.com/support/solutions/articles/67000738569-how-to-build-your-customer-portal): customizable pages, sections, branding, and customer content.
- [Rocketlane customer portal experience](https://www.rocketlane.com/customer-portal-experience): customer delivery reference.
- [Jira features](https://www.atlassian.com/software/jira/features) and [Jira introduction](https://www.atlassian.com/software/jira/guides/getting-started/basics): configurable work items, boards, fields, and workflows.
- [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing), [Resend pricing](https://resend.com/pricing): current purchase and usage references; no fixed tariff is assumed here.
- [Supabase database overview](https://supabase.com/docs/guides/database/overview): PostgreSQL, RLS, and managed platform services.
- [Supabase restore limitations](https://supabase.com/docs/guides/platform/clone-project): storage objects/settings are not copied by database restore-to-new-project.
