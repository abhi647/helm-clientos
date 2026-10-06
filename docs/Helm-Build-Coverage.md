# Helm: implemented breadth and remaining gates

1 October 2026. This is a substantially expanded browser-local implementation, not a completed production service. Existing local records are preserved during additive schema upgrades. No infrastructure subscription, invitation, email, CRM change or accounting transaction has been performed.

## Connected local modules

| Area | Working behavior | Boundary |
|---|---|---|
| Control room | Search/filter engagements, actual current-state counts, next checkpoints, critical decisions, links to operational modules | Synthetic baseline; no predictive scores |
| Sales handoff | Review closed-won context, create a templated engagement with uniquely keyed internal work and undated milestones; replay opens the same project | Manual scenario records; HubSpot not connected |
| Delivery core | Board/list/backlog, assignee/search filters, issue status/owner/visibility/priority/dates/phase, hierarchy, blocking dependencies, independent comment audience | One local workflow; not full Jira parity |
| Sprints | Start with frozen work baseline, enforce one active sprint, complete with snapshot and return unfinished work to backlog | Local records; no historical burndown |
| SOW planning | Real text extraction, manual draft edits, developer review, PM approval and idempotent publication | Live AI requires authenticated Supabase project and credentials; revised-SOW diff not implemented |
| Timeline | Actual checkpoint dates, unscheduled items, linked issues and approval completion gates | No automatic critical-path scheduling |
| Risks | Create/edit, impact, owner, follow-up date, mitigation, resolve/reopen, explicit visibility | Health remains a PM assessment, not an inferred risk score |
| Meetings | Notes, decisions, action owner, one linked work item per action | No calendar invitations, recording or transcript service |
| UAT | Acceptance cases, results, one linked internal defect per failed test, gated local sign-off and frozen snapshot | Local review; not an authenticated customer signature; revisions require new production packages |
| Requests | Original context, explicit stage, frozen estimate versions, superseded pending rounds, current approval required before work creation | Existing linked work requires a new change request for revised scope |
| Approvals | Approve/request changes with required reason, frozen decision round, version matching and source-linked request stage | No legal e-signature or live role authority |
| Customer experience | Shared checkpoints, customer actions, acceptance, requests, documents, meetings and published updates | Browser-local preview; not tenant isolation |
| Documents | Actual upload/download bytes in IndexedDB, internal/shared metadata | Private cloud storage, file versions and object backups remain |
| Resources | Person/project/week allocation, stated 40h capacity, gaps and over-allocation, add/edit allocation | Scenario week; leave and individual calendars not modelled |
| Time | Log draft, submit, return, approve; approved records cannot be silently edited | Production corrections need a reversal workflow |
| Finance | Separate-currency invoice totals, manual invoice references, fees/budget/approved effort and checkpoint readiness | No live ledger sync, invoice generation, tax or payments |
| Reports | Actual present-state statuses, completion/sample sizes, open risks and local events | No fabricated velocity, cycle time or historical series |
| Templates | Four v1 patterns create actual internal work/milestones in a new project | Starter definitions, not a dynamic template editor |
| Automation | Enable/disable local request-created rule; assign the linked project's lead and record event | No recurring worker or external side effect |
| Administration | Custom text/number/date work fields, audience, required-before-Done validation; add workflow statuses; explicit integration state | Workspace-wide local configuration; no versioned project schemes |
| Activity & navigation | Timestamped local domain events, project activity view, workspace/project command search and keyboard shortcut | Local audit is not tamper-proof |

## Production gates remain

Supabase Auth and memberships; durable transactional domain services; RLS/storage/realtime isolation tests; conflict handling and record versions; full configuration schemes and migration previews; Resend outbox/retry; verified HubSpot/Zoho integrations; authenticated source-linked Anthropic runs; revised-SOW comparisons; richer forms and portal customization; retainers and approved time reversals; backups, restore testing and operational monitoring.

The design has been rebuilt and the local product breadth expanded. This document does not equate local workflow tests with production security, live collaboration or complete reference-product parity.
