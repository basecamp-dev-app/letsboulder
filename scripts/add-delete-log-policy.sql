-- Enable RLS on logs table (if not already enabled)
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- Create policy allowing users to delete their own logs
CREATE POLICY "Users can delete their own logs" ON public.logs
FOR DELETE
TO authenticated
USING ((auth.uid()) = user_id);
