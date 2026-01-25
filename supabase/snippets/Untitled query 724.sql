-- Create policy allowing authenticated users to upload to route-uploads bucket
create policy "Allow authenticated uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'route-uploads'::text AND 
  auth.role() = 'authenticated'::text
);