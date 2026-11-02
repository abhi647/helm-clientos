-- New billing vocabulary (enum values must be committed before they are used, so they get their own migration):
--   billing_model 'dedicated'  a person reserved for the customer, billed per month or per working day whatever they log
--   billing_kind  'resource'   that person's line on the rate card
--   billing_kind  'overage'    retainer hours beyond the monthly allowance, at an hourly rate
alter type public.billing_model add value if not exists 'dedicated';
alter type public.billing_kind add value if not exists 'resource';
alter type public.billing_kind add value if not exists 'overage';
