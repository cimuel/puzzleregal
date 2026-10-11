-- Puzzleregal – Migration 0002: Foto-Speicher
-- Öffentlich lesbarer Bucket mit zufälligen Dateinamen. Schreiben nur für freigegebene
-- Mitglieder im eigenen Ordner (Pfad: <benutzer-id>/<datei>.webp).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('puzzle-images', 'puzzle-images', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy puzzle_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'puzzle-images' and public.is_approved()
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy puzzle_images_update on storage.objects for update to authenticated
  using (bucket_id = 'puzzle-images' and public.is_approved()
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy puzzle_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'puzzle-images' and public.is_approved()
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
