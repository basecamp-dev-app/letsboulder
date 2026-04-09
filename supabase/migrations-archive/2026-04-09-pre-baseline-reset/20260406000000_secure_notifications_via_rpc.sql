-- M8: Secure notification creation via RPC
-- Gate notification creation through an RPC function that validates the sender has a legitimate reason
-- Only admins can create notifications for other users (system notifications)

-- Function to create notifications (admin-only)
CREATE OR REPLACE FUNCTION create_notification(
    p_target_user_id UUID,
    p_type VARCHAR(50),
    p_title TEXT,
    p_message TEXT DEFAULT NULL,
    p_link TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_notification_id UUID;
    v_caller_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    -- Get the calling user
    v_caller_id := auth.uid();
    
    -- Require authentication
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    -- Check admin status
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller_id AND is_admin = true) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Admin access required to create notifications';
    END IF;
    
    -- Validate target user exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
        RAISE EXCEPTION 'Target user does not exist';
    END IF;
    
    -- Insert the notification
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (p_target_user_id, p_type, p_title, p_message, p_link)
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$;

-- Drop the INSERT policy (we're moving to RPC-based creation)
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

-- Revoke direct INSERT from authenticated role
-- They can still SELECT (read own) and UPDATE (mark read) via existing policies
REVOKE INSERT ON notifications FROM authenticated;
REVOKE INSERT ON notifications FROM anon;

-- Grant execute on the function to authenticated users (though only admins can actually create)
GRANT EXECUTE ON FUNCTION create_notification TO authenticated;
