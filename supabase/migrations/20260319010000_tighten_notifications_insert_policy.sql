DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Authenticated create notifications'
  ) THEN
    DROP POLICY "Authenticated create notifications" ON public.notifications;
  END IF;
END $$;

CREATE POLICY "Authenticated create notifications" ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
