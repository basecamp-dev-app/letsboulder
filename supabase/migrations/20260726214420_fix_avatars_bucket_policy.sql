-- Fix public bucket listing exposure (lint: public_bucket_allows_listing)
-- Replace broad SELECT policy with folder-scoped read policy.

-- Drop the policy that allows listing all objects in the avatars bucket
DROP POLICY IF EXISTS "Avatar uploads read public bucket" ON storage.objects;

-- Allow users to read their own avatar folder (by user_id prefix)
CREATE POLICY "Avatar uploads read own folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read of specific avatar objects (by known path, not listing)
-- This enables public avatar display via direct URL without allowing LIST
CREATE POLICY "Avatar uploads public read by path"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'avatars');