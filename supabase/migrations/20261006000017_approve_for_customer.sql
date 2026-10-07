-- Seven Billion can approve on the customer's behalf (rates agreed in the contract or on a call), so the portal stays
-- for requests, progress and financials. The customer is told, the record says it was approved for them and by whom,
-- and only the people who could prepare the item can do it: admin, CEO or finance for billing; the PM, CEO or an
-- admin for an estimate.

alter table public.rate_cards add column approved_for_customer boolean not null default false;
alter table public.billing_statements add column approved_for_customer boolean not null default false;

-- ---------------------------------------------------------------- rates
create or replace function public.approve_rate_card_for_customer(p_card uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_card public.rate_cards; v_project text; v_note text;
begin
  select * into v_card from public.rate_cards where id = p_card for update;
  if v_card.id is null or not private.can_price(v_card.customer_id) then raise exception 'not allowed'; end if;
  if v_card.status not in ('draft', 'pending', 'changes_requested') then raise exception 'this rate card is already decided'; end if;
  if not exists (select 1 from public.rate_card_lines where rate_card_id = p_card) then raise exception 'add at least one line first'; end if;
  v_note := 'Approved by ' || private.actor_name() || ' for the customer' || coalesce(': ' || nullif(trim(p_note), ''), '');

  update public.rate_cards set status = 'superseded' where project_id = v_card.project_id and status = 'approved';
  update public.rate_cards
  set status = 'approved', approved_for_customer = true,
      submitted_at = coalesce(submitted_at, now()), submitted_by = coalesce(submitted_by, (select auth.uid())),
      decided_at = now(), decided_by = (select auth.uid()), decision_note = v_note
  where id = p_card;

  select name into v_project from public.projects where id = v_card.project_id;
  -- for their records, not a task
  perform private.notify(r.id, 'billing', 'Rates confirmed: ' || v_project,
      private.actor_name() || ' confirmed the rates for ' || v_project || ' (v' || v_card.version || ') as agreed. You can see them under Billing.'
      || coalesce(' Note: ' || nullif(trim(p_note), ''), ''), '/billing', false)
  from public.profiles r
  where r.kind = 'customer' and r.customer_id = v_card.customer_id and r.access_revoked_at is null
    and (r.customer_role = 'customer_exec' or r.can_view_invoices);
  perform private.log(v_card.customer_id, v_card.project_id, 'confirmed the rate card (v' || v_card.version || ') for the customer', 'rate_card', p_card, 'shared');
end $$;

-- ---------------------------------------------------------------- statements (the app then creates the Zoho draft)
create or replace function public.approve_statement_for_customer(p_statement uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_st public.billing_statements; v_project text;
begin
  select * into v_st from public.billing_statements where id = p_statement for update;
  if v_st.id is null or not private.can_price(v_st.customer_id) then raise exception 'not allowed'; end if;
  if v_st.status not in ('draft', 'pending', 'changes_requested') then raise exception 'this statement is already decided'; end if;
  if not exists (select 1 from public.statement_lines where statement_id = p_statement and quantity > 0) then
    raise exception 'enter at least one quantity first';
  end if;
  update public.billing_statements
  set status = 'approved', approved_for_customer = true,
      submitted_at = coalesce(submitted_at, now()), submitted_by = coalesce(submitted_by, (select auth.uid())),
      decided_at = now(), decided_by = (select auth.uid()),
      decision_note = 'Approved by ' || private.actor_name() || ' for the customer' || coalesce(': ' || nullif(trim(p_note), ''), '')
  where id = p_statement;

  select name into v_project from public.projects where id = v_st.project_id;
  perform private.notify(r.id, 'billing', 'Statement confirmed: ' || v_project,
      private.actor_name() || ' confirmed the statement for ' || to_char(v_st.period_start, 'DD Mon') || ' – ' || to_char(v_st.period_end, 'DD Mon YYYY')
      || '. The invoice follows from Zoho Books.' || coalesce(' Note: ' || nullif(trim(p_note), ''), ''), '/billing', false)
  from public.profiles r
  where r.kind = 'customer' and r.customer_id = v_st.customer_id and r.access_revoked_at is null
    and (r.customer_role = 'customer_exec' or r.can_view_invoices);
  perform private.log(v_st.customer_id, v_st.project_id, 'confirmed a billing statement for the customer', 'statement', p_statement, 'shared');
end $$;

-- ---------------------------------------------------------------- estimates and other approvals
create or replace function public.approve_for_customer(p_approval uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.approvals; v_for text; v_comment text;
begin
  select * into a from public.approvals where id = p_approval for update;
  if not found or not private.can_manage(a.customer_id) then raise exception 'not allowed'; end if;
  if a.status <> 'pending' then raise exception 'this approval is no longer pending'; end if;
  v_for := coalesce((select full_name from public.profiles where id = a.approver_id), 'the customer');
  v_comment := 'Approved by ' || private.actor_name() || ' on behalf of ' || v_for || coalesce(': ' || nullif(trim(p_note), ''), '');

  update public.approvals set status = 'approved' where id = a.id;
  insert into public.approval_events (approval_id, customer_id, action, version, comment, actor_id)
  values (a.id, a.customer_id, 'approved', a.version, v_comment, (select auth.uid()));
  update public.action_items set status = 'completed', completed_at = now() where approval_id = a.id and status = 'open';
  if a.request_id is not null then
    perform set_config('app.status_note', 'Estimate v' || a.version || ' approved for the customer', true);
    update public.requests set status = 'approved' where id = a.request_id and status in ('submitted', 'under_review', 'clarification', 'estimated');
  end if;
  perform private.log(a.customer_id, a.project_id, v_comment || ' · ' || a.title, 'approval', a.id, 'shared');
  -- the customer hears it was taken care of; it is no longer on their list
  if a.approver_id is not null then
    perform private.notify(a.approver_id, 'approval.approved', 'Approved for you: ' || a.title, v_comment,
      case when a.request_id is not null then '/requests/' || a.request_id else '/' end, false, true);
  end if;
end $$;

revoke execute on function public.approve_rate_card_for_customer, public.approve_statement_for_customer, public.approve_for_customer from public, anon;
grant execute on function public.approve_rate_card_for_customer, public.approve_statement_for_customer, public.approve_for_customer to authenticated;
