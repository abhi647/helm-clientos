-- 7B Client OS: private document storage.
-- Object path: <customer_id>/<document_id>/<file name>. An object is readable only when the matching
-- documents row is readable under that table's RLS (so Internal files stay internal).

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

create policy documents_objects_read on storage.objects for select to authenticated using (
  bucket_id = 'documents' and exists (select 1 from public.documents d where d.storage_path = storage.objects.name)
);

create policy documents_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and (
    private.is_staff_of(((storage.foldername(name))[1])::uuid)
    or ((storage.foldername(name))[1])::uuid = private.my_customer()
  )
);

create policy documents_objects_delete on storage.objects for delete to authenticated using (
  bucket_id = 'documents' and private.is_staff_of(((storage.foldername(name))[1])::uuid)
);
