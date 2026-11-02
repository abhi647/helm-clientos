-- One place for a project's money: the contract value moves onto the rate card (Billing), next to the model, PO and
-- notes, and the separate Commercials record is folded in. project_commercials is kept (nothing is deleted) but the
-- app no longer reads it.

alter table public.rate_cards add column contract_value numeric(14, 2) check (contract_value >= 0);

-- carry existing Commercials onto the project's latest card, filling only what is empty
update public.rate_cards c set
  contract_value = coalesce(c.contract_value, pc.contract_value),
  po_number = coalesce(nullif(c.po_number, ''), pc.po_number),
  notes = case when coalesce(c.notes, '') = '' then coalesce(pc.notes, '') else c.notes end
from public.project_commercials pc
where pc.project_id = c.project_id
  and c.id = (select x.id from public.rate_cards x where x.project_id = c.project_id order by (x.status = 'approved') desc, x.version desc limit 1);

-- the agreed total of the contract (finance, admins, the CEO); it describes the deal, so it can be set on the live
-- card as well as on a draft
create or replace function public.set_contract_value(p_project uuid, p_value numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_card uuid; v_customer uuid;
begin
  select customer_id into v_customer from public.projects where id = p_project;
  if v_customer is null or not private.can_price(v_customer) then raise exception 'not allowed'; end if;
  if p_value is not null and p_value < 0 then raise exception 'the contract value cannot be negative'; end if;
  select id into v_card from public.rate_cards where project_id = p_project and status in ('draft', 'changes_requested', 'pending', 'approved')
  order by (status in ('draft', 'changes_requested')) desc, version desc limit 1;
  if v_card is null then raise exception 'set up billing first'; end if;
  update public.rate_cards set contract_value = p_value where id = v_card;
end $$;
revoke execute on function public.set_contract_value from public, anon;
grant execute on function public.set_contract_value to authenticated;

-- a new version of the card keeps the contract value
create or replace function private.keep_contract_value() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.contract_value is null then
    select contract_value into new.contract_value from public.rate_cards
    where project_id = new.project_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000') order by version desc limit 1;
  end if;
  return new;
end $$;
create trigger keep_contract_value before insert on public.rate_cards for each row execute function private.keep_contract_value();
