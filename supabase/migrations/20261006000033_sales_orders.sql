-- Sales orders: an approved statement goes to Zoho as a sales order first (what the customer agreed to), and finance
-- converts it to the invoice in Zoho once the customer has confirmed it, for example a proposed exchange rate when the
-- rates are in another currency than the one Zoho bills the customer in.
alter table public.billing_statements
  add column if not exists zoho_salesorder_id text,
  add column if not exists zoho_salesorder_number text,
  add column if not exists salesorder_at timestamptz,
  add column if not exists exchange_rate numeric(14, 6) check (exchange_rate is null or exchange_rate > 0);

create index if not exists billing_statements_zoho_salesorder_idx on public.billing_statements (zoho_salesorder_id) where zoho_salesorder_id is not null;

notify pgrst, 'reload schema';
