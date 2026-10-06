# Rocketlane reference walkthrough

Inspected in the user's authenticated Safari workspace on 1 October 2026. This is a read-only reference review, not functional QA of all Rocketlane features. No integrations were connected and no settings were saved.

## Directly inspected

| Area | Observed structure and behavior |
| --- | --- |
| Personal home | Incomplete-task view, grouping, approvals inbox, personal tasks |
| Project portfolio | Search, filters, grouping, status, current phases, progress, due dates and inferred progress |
| Project overview | Phase progress, business goals, overdue/at-risk/blocked work, late completions, key events and intervals, project fields, team and portal selection |
| Project plan | Horizontal phase columns with dates and progress; tasks, approval items, forms and sheets coexist in the plan; internal work distinguished from shared work |
| Task details | Assignment, start/end dates, status, description, private notes, attachments, subtasks, dependencies, conversations and additional fields |
| Effort planning | Total effort with equal or custom effort split across multiple assignees |
| List | Native task table, bulk selection, expandable subtasks, phase, priority, dates, effort and allocated hours; personal and shared saved views |
| Board | Status columns, configurable rows and columns, filter and task counts |
| Resources | Weekly allocation timeline, project/member hierarchy, separate utilization pane, utilization bands, placeholders and soft-allocation legends |
| Resource policies | Hours/day or hours/week, task/phase effort planning, automatic allocation description, soft allocation and allocation object controls |
| Time policies | Weekly due time, before/after reminders, project-owner versus team approver, billable treatment, rejected-hour exclusion, budget caps, task/phase/project/activity tracking, categories and locks |
| Financial policies | Budget and hour alerts, separate scopes of budget, fixed-fee recognition options including milestones/EAC/manual, time-and-material and subscription recognition options |
| Templates | Project, portal, document, update, form and sheet categories; folders and template metadata |
| Spaces | Private/shared space hierarchy, searchable documents, shared meeting notes and discovery content, contextual conversations |
| Chat | General/private project conversations plus conversations linked to tasks |
| Project updates | All/sent/draft states; sample update contains completed milestones/tasks, blockers and upcoming work plus conversations |
| Forms | Sales handoff, kickoff and go-live forms; response columns include commercial context, pain points, integrations and intended go-live |
| Files | Source-linked task/conversation/form attachments, shared files and private files, folders and search |
| Account | Customer fields, owner, notes, engagements, project updates, activity and project summaries |
| Customer preview | Separately composed Home/Plan/Files/Updates navigation, welcome content, team, resources, key information, phase work and customer task actions |
| Portal themes | Primary/secondary/background/grey/black/white palette roles, three button variants and heading/body hierarchy |
| Task fields | Native effort/progress/priority/status fields, section organisation and private custom-field controls; new-field dialog inspected without saving |
| Permissions | Separate account, project and customer permission configuration |
| Sprint policies | Epics, sprints, backlogs, points and linear/Fibonacci/exponential/effort-multiple choices; default board statuses |
| Automations | Account-wide task/phase/project/form automations, logs, workflow-management navigation, escalation/billing/customer-activation playbooks |
| Integrations | HubSpot, Jira, Salesforce, Slack, Zapier and Workato listed. HubSpot connection and field-mapping flow inspected; not connected |

## Visual findings

The internal application uses white and pale-grey surfaces, blue active navigation and links, black primary actions, green progress indicators, thin dividers and compact icon navigation. Internal/private content uses a pale yellow treatment in inspected plan/files screens. Functional screens favor dense tables and timelines, with task drawers and contextual side panels.

The customer portal is independently themed and composed. Its theme editor exposes a bright blue primary swatch, lighter blue secondary swatch, dark navy background role, grey, black and white. These visual observations are not exact extracted hex values or confirmed font names. Do not label guessed tokens as exact Rocketlane tokens.

## Limits and unexpected behavior

- Time tracking, financial management, epics and sprints are disabled in this trial. Configuration was inspected, but their operational flows were not enabled or tested.
- HubSpot is disconnected; field mapping is disabled until connection. No OAuth authorization was started.
- Portfolio analytics/report dashboards and operational timesheet/finance screens were not inspected. Unlabelled sidebar navigation could not be reliably operated through Safari's available controls; coordinate attempts returned unavailable-window errors. This remains a gap, not evidence of an absent feature.
- Sheet navigation was observed, but the full sheet editor was not inspected.
- No form submissions, task transitions, time entries, invoices, automation saves or invitations were deliberately executed.
- Opening the built-in customer preview appears to have generated a synthetic CUSTOMER-VIEW member and an invitation activity entry in the sample project. No manual invitation was sent. No cleanup was attempted because deletion requires user approval. Whether the generated entry produced an external notification was not verified.

## Implications for Helm

Use a coherent dense application shell, not a marketing-style dashboard. Connect phase work, source documents, forms, approvals and conversations. Keep customer presentation separate from internal operations. Model effort, allocated capacity, tracked time, approved time and billable time as distinct quantities. Connect budget scopes and change requests to invoicing readiness. Make permissions, fields, templates and workflow configuration first-class modules, with integration sync logs and recoverable failures.
