CREATE TABLE IF NOT EXISTS public.gym_floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  image_url TEXT NOT NULL,
  image_width INTEGER NOT NULL CHECK (image_width > 0),
  image_height INTEGER NOT NULL CHECK (image_height > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_floor_plans_one_active_per_gym
  ON public.gym_floor_plans(gym_place_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gym_floor_plans_gym ON public.gym_floor_plans(gym_place_id);

CREATE TABLE IF NOT EXISTS public.gym_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  floor_plan_id UUID NOT NULL REFERENCES public.gym_floor_plans(id) ON DELETE CASCADE,
  name TEXT,
  grade TEXT NOT NULL CHECK (char_length(grade) BETWEEN 1 AND 24),
  discipline TEXT NOT NULL CHECK (discipline IN ('boulder', 'sport', 'top_rope', 'mixed')),
  color TEXT,
  setter_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gym_routes_gym ON public.gym_routes(gym_place_id);
CREATE INDEX IF NOT EXISTS idx_gym_routes_floor_plan ON public.gym_routes(floor_plan_id);
CREATE INDEX IF NOT EXISTS idx_gym_routes_status ON public.gym_routes(status);

CREATE TABLE IF NOT EXISTS public.gym_route_markers (
  route_id UUID PRIMARY KEY REFERENCES public.gym_routes(id) ON DELETE CASCADE,
  x_norm NUMERIC(8,6) NOT NULL CHECK (x_norm >= 0 AND x_norm <= 1),
  y_norm NUMERIC(8,6) NOT NULL CHECK (y_norm >= 0 AND y_norm <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE public.gym_floor_plans ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.gym_routes ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.gym_route_markers ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_floor_plans' AND policyname = 'Public read gym_floor_plans'
  ) THEN
    CREATE POLICY "Public read gym_floor_plans"
      ON public.gym_floor_plans
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_routes' AND policyname = 'Public read gym_routes'
  ) THEN
    CREATE POLICY "Public read gym_routes"
      ON public.gym_routes
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_route_markers' AND policyname = 'Public read gym_route_markers'
  ) THEN
    CREATE POLICY "Public read gym_route_markers"
      ON public.gym_route_markers
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_floor_plans' AND policyname = 'Admin write gym_floor_plans'
  ) THEN
    CREATE POLICY "Admin write gym_floor_plans"
      ON public.gym_floor_plans
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_routes' AND policyname = 'Admin write gym_routes'
  ) THEN
    CREATE POLICY "Admin write gym_routes"
      ON public.gym_routes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gym_route_markers' AND policyname = 'Admin write gym_route_markers'
  ) THEN
    CREATE POLICY "Admin write gym_route_markers"
      ON public.gym_route_markers
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      );
  END IF;
END $$;
