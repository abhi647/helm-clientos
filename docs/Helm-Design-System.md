# Helm design system

Helm: one syllable, a place to steer client delivery. Working product name; brand/domain availability has not been assessed.

The design takes its cues from Rocketlane's customer-delivery structure and branded portal model. It is an original implementation for Seven Billion, not a verified pixel-for-pixel reproduction of the authenticated Rocketlane product.

## Foundations

Revision 2 responds to the rejected thin dashboard. Canonical implementation: `src/helm.css` for shared primitives, `src/delivery.css` for the delivery workbench. Manrope is self-hosted through `@fontsource/manrope`. The white work canvas, warm neutral navigation and olive actions establish an original Seven Billion product identity. Product depth carries the interface: portfolio, handoff, delivery plan, decisions, acceptance, capacity and commercial context are connected, not independent mockups.

| Token | Value |
|---|---|
| Primary / hover | #536447 / #3E5034 |
| Navigation | #F7F8F4 |
| Canvas / surface | #FFFFFF / #FFFFFF |
| Main text / secondary | #202A25 / #69716B |
| Border / accent surface | #E4E7E0 / #F0F3E9 |
| Spacing | 4, 8, 12, 16, 20, 24, 32, 40px |
| Radius | 5–6px control, 7–8px panel, 12px dialog |
| Typography | Manrope 400, 500, 600, 700; 39px control room heading, 31px module heading, 17px section heading, 13px base, 11px compact metadata |
| Motion | Under 200ms; opacity/transform for dialogs; instant navigation; reduced-motion support |

## Components and usage

Button: primary for one next action; secondary for alternatives; ghost for contextual navigation. Badge: text and semantic color, never color alone. Avatar: initial-based demo identity with optional name. Panel: consistent title and content grouping. Modal: accessible dialog with Escape, focus restoration and tab containment. Field: visible label and native control. Progress: explicit basis in surrounding text. Empty: next-step guidance. Local toast: accurate persistence or publication result.

The design-engineering skill influenced short, purpose-driven motion, keyboard access, self-hosted typography, restrained press feedback, and consistent component defaults. Navigations are instant; only occasional overlays animate. Work screens are dense; customer pages use more spacious contextual sections. Mobile layouts reflow rather than imposing desktop minimum widths. Data tables can scroll within their containers.

Composition rules: use a heading plus one primary action, then real operational context. Use metrics as a quiet divided band, not four interchangeable icon cards. Portfolio rows include customer identity, assessed health, phase, completion basis, checkpoint and lead. A complementary delivery brief gives upcoming checkpoints and a clear route into planning. In the engagement, summary, milestones, risk mitigation, next commitment and team ownership form the decision surface. Do not add invented predictive scores or decorative history charts. Show the real sample size and known limitations.

Operational patterns: risk register, meeting/decision record, acceptance row, completion gate, capacity card, time ledger, currency-specific invoice context, template record, handoff record, configuration table and command search. Each pattern has a working domain behavior, an empty state and a truthful explanation of what is local versus connected. Customer actions use a clear source and outcome, not an internal workstream dump.

## Screens delivered in this build

Control room; sales handoffs; portfolio; customers; My Work; engagement overview; board/list/backlog with sprint lifecycle; SOW planning/review; timeline and completion gates; risks; meetings and decisions; UAT and defect conversion; requests with frozen estimates and approval-to-work conversion; documents; updates; customer preview; capacity allocation; time review; commercial context; current-state reports; starter templates; local assignment automation; custom work fields; workflow settings; integration status; command search; component gallery.

## Reference and limits

[Rocketlane's platform](https://www.rocketlane.com/) and [professional services automation](https://www.rocketlane.com/professional-services-automation-software) reinforce the breadth reference: project delivery is connected to capacity, time, finance and customer collaboration. No authenticated Rocketlane screens or proprietary assets have been copied. The local build uses illustrative data. Customer preview is not authorization or tenant isolation. Production RLS, server-side projections, versioned configuration, live subscriptions and provider acceptance remain required by the PRD. Taste and reference parity require user review; a passing build does not establish them.
