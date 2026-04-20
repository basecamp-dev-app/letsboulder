CREATE POLICY "Avatar uploads insert own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Avatar uploads delete own folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Avatar uploads read public bucket"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');
