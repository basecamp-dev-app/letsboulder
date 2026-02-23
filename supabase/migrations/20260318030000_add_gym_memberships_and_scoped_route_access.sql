CREATE TABLE IF NOT EXISTS public.gym_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'head_setter', 'setter')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_memberships_user_gym
  ON public.gym_memberships(user_id, gym_place_id);

CREATE INDEX IF NOT EXISTS idx_gym_memberships_gym_status
  ON public.gym_memberships(gym_place_id, status);

CREATE INDEX IF NOT EXISTS idx_gym_memberships_user_status
  ON public.gym_memberships(user_id, status);

DO $$
BEGIN
  ALTER TABLE public.gym_memberships ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_memberships' AND policyname = 'Users read own gym memberships'
  ) THEN
    CREATE POLICY "Users read own gym memberships"
      ON public.gym_memberships
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_memberships' AND policyname = 'Admins manage gym memberships'
  ) THEN
    CREATE POLICY "Admins manage gym memberships"
      ON public.gym_memberships
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_routes' AND policyname = 'Gym members write gym routes'
  ) THEN
    CREATE POLICY "Gym members write gym routes"
      ON public.gym_routes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.gym_memberships gm
          WHERE gm.user_id = auth.uid()
            AND gm.gym_place_id = gym_routes.gym_place_id
            AND gm.status = 'active'
            AND gm.role IN ('owner', 'manager', 'head_setter', 'setter')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.gym_memberships gm
          WHERE gm.user_id = auth.uid()
            AND gm.gym_place_id = gym_routes.gym_place_id
            AND gm.status = 'active'
            AND gm.role IN ('owner', 'manager', 'head_setter', 'setter')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_route_markers' AND policyname = 'Gym members write gym route markers'
  ) THEN
    CREATE POLICY "Gym members write gym route markers"
      ON public.gym_route_markers
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.gym_routes gr
          JOIN public.gym_memberships gm ON gm.gym_place_id = gr.gym_place_id
          WHERE gr.id = gym_route_markers.route_id
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
            AND gm.role IN ('owner', 'manager', 'head_setter', 'setter')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.gym_routes gr
          JOIN public.gym_memberships gm ON gm.gym_place_id = gr.gym_place_id
          WHERE gr.id = gym_route_markers.route_id
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
            AND gm.role IN ('owner', 'manager', 'head_setter', 'setter')
        )
      );
  END IF;
END $$;
