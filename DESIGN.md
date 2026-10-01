# Helm: delivery workbench

Read `docs/Helm-Design-System.md` before visual work. This is an operational client-delivery platform, not a generic task dashboard or marketing site.

The current design uses self-hosted Manrope, a white work canvas, warm pale navigation, dark green-black text and restrained olive actions. Shared primitives live in `src/helm.css`; the delivery composition and patterns live in `src/delivery.css`. Keep font and color changes centralized. No purple gradients, interchangeable metric icon cards, decorative history charts or unsupported AI forecasts.

Use actual domain data with its scope, basis, owner and next action. Every screen must have a working behavior or explicitly state its unavailable dependency. Customer projections must not reveal internal issue names, fields, comments, defect IDs, finances or raw audit events. Preview filtering is not production security.

Keyboard focus, Escape and dialog containment, labelled controls, clear errors, reduced motion, mobile reflow and explicit persistence limits are part of the system. Common navigation and keyboard actions should be immediate. See `docs/Helm-Build-Coverage.md` for actual implementation boundaries.
