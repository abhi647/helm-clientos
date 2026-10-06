-- Helm: money is for admin, CEO and finance only.
-- PMs no longer see or prepare billing (rate cards, statements), Zoho invoices or payments. They keep the delivery view:
-- tasks, deliverables and hours logged. Finance prepares statements, helped by the hours logged in the period.

-- statements: the same people who set the rates (the PM rule is removed)
create or replace function private.can_bill(cid uuid, pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_price(cid)
$$;

drop policy invoices_read on public.invoices;
create policy invoices_read on public.invoices for select to authenticated using (
  (private.is_staff_of(customer_id) and private.staff_role() in ('admin', 'ceo', 'finance'))
  or (customer_id = private.my_customer() and coalesce((select can_view_invoices from private.my_profile()), false))
);

drop policy payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated using (
  (private.is_staff_of(customer_id) and private.staff_role() in ('admin', 'ceo', 'finance'))
  or (customer_id = private.my_customer() and coalesce((select can_view_invoices from private.my_profile()), false))
);

-- billing notifications go to finance and admins, no longer to the project's PM
create or replace function private.notify_billing_staff(p_project uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select p.id from public.profiles p
           join public.projects pr on pr.id = p_project
           join public.customers c on c.id = pr.customer_id
           where p.kind = 'internal' and p.access_revoked_at is null and p.org_id = c.org_id
             and p.internal_role in ('finance', 'admin')
  loop
    perform private.notify(r.id, 'billing', p_title, p_body, '/projects/' || p_project || '/billing', false);
  end loop;
end $$;
