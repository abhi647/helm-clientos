# Helm verification

Verified locally on 1 October 2026. This is an interactive implementation, not evidence of a deployed production service.

## Automated checks

- 19 domain tests: planning publication, milestone gates, acceptance and defect deduplication, immutable sign-off and approved time, template creation, approval revisions, request conversion, local automation, dependency cycles, required fields, handoff replay and sprint snapshots.
- Next.js production build.

## Browser checks

- Closed-won handoff creates an engagement and template work; replay opens the existing engagement.
- Template creation preserves the entered kickoff date.
- Meeting actions create source-linked work.
- Failed acceptance creates a defect; incomplete acceptance blocks sign-off.
- Submitted time can be approved and becomes immutable.
- Request estimation freezes an approval version; conversion is blocked before approval and creates one linked work item afterward.
- Sprint start and completion preserve a completion snapshot and return unfinished work to the backlog.
- Global search navigates to an engagement.
- Custom fields render in work details. Internal fields and internal work references are excluded from customer preview.
- Control room, customer workspace, capacity and commercials inspected at 390 × 844. No page-level horizontal overflow; wide tables scroll within their containers.
- Desktop control room, engagement and customer compositions visually inspected.

## Not verified or connected

Supabase migrations, production authentication and authorization, multi-user realtime collaboration, HubSpot webhooks, Resend delivery, Anthropic-backed generation and external billing integrations have not been exercised against live services. Customer preview is a local demonstration, not an authenticated security boundary. Browser data persists on this device only.
