# Helm

Client delivery, together. A Next.js application and design system for Seven Billion's Client OS.

## Run

`npm install` then `npm run dev`. Open the localhost URL printed by Next.js. `npm test` checks plan publication invariants; `npm run build` builds the production bundle. Vercel can deploy this as a Next.js project; no deployment has been performed.

## Current delivery

The expanded application includes a delivery control room, sales handoffs, richer engagement overview, SOW planning, board/list/backlog with sprint snapshots, issue hierarchy/dependencies/custom fields, timeline completion gates, risk register, meetings-to-work, UAT-to-defect and local sign-off, versioned request estimates and approvals-to-work, documents, updates, customer workspace, resource allocation, time approval, commercial context, current-state reports, templates, local assignment automation and command search. See `docs/Helm-Build-Coverage.md` for precise behavior and limits.

Demo state persists in localStorage; documents persist in IndexedDB on this browser. Do not use this mode for confidential production data. The scenario customers/people and all sample progress are illustrative. No real client events, emails, provider connections, or AI outputs are fabricated.

## Cloud foundation

Copy `.env.example` to `.env.local` and configure server-side secrets when enabling services. Supabase migration under `supabase/migrations` provides an initial read/permission foundation and bounded AI-run reservation, not the full PRD schema. Apply/review in isolated staging first. The UI has no Supabase sign-in or database adapter yet. Cloud AI requires a valid Supabase JWT, actual authorized project UUID, configured key/model, and installed quota RPCs; therefore it remains unavailable from the browser-local demo. The API validates source citations and schema, bounds output and timeout, and never exposes the API key.

Next engineering steps: complete Supabase Auth and transactional persistence adapter, test RLS/storage/realtime isolation, move local versioning into durable services with role separation, configure Resend outbox delivery, connect HubSpot/Zoho, and enable Anthropic against real authorized projects. Realtime coediting, revised-SOW diff, automatic dependency scheduling, versioned project schemes and full Jira parity are not implemented yet.

## Documents

- `docs/Helm-Design-System.md`: design contract and reference basis.
- `docs/7B-Client-OS-Refined-PRD.md`: complete target product and release gates.
- `docs/Helm-Build-Coverage.md`: module-by-module working behavior and production boundaries.
- `DESIGN.md`: concise entry point for future visual work.

The old Vite screen remains in `src/main.jsx` and `src/styles.css` as reference only; Next.js uses `src/Helm.jsx` and `src/helm.css`.

## Verification, 1 October 2026

The original planning journey was checked in the browser. The expanded domain suite covers milestone gates, UAT and defect deduplication, frozen sign-off, meeting actions, immutable time approval, template creation, approval versions, request conversion, local rules, hierarchy/dependency cycles, custom completion requirements, handoff replay and sprint snapshots. Browser checks additionally confirmed handoff creation, meeting-to-work, failed acceptance and blocked sign-off, time approval and request → frozen estimate → customer-preview decision → linked work. Supabase migrations and live provider integrations have not been run or verified. See [the verification record](docs/Helm-Verification.md) for responsive and build evidence.
