drop policy if exists "Authenticated create grade vote" on "public"."grade_votes";

alter table "public"."climbs" add column if not exists "consensus_grade" character varying(10);

alter table "public"."climbs" add column if not exists "grade_tied" boolean default false;

alter table "public"."climbs" add column if not exists "total_votes" integer default 0;

alter table "public"."images" add column if not exists "has_humans" boolean;

alter table "public"."images" add column if not exists "moderated_at" timestamp with time zone;

alter table "public"."images" add column if not exists "moderation_labels" jsonb;

alter table "public"."images" add column if not exists "moderation_status" text default 'pending'::text;

alter table "public"."images" add column if not exists "status" character varying(20) not null default 'pending'::character varying;

CREATE INDEX IF NOT EXISTS idx_climbs_consensus_grade ON public.climbs USING btree (consensus_grade) WHERE (consensus_grade IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_images_moderation_status ON public.images USING btree (moderation_status);

CREATE INDEX IF NOT EXISTS idx_images_status ON public.images USING btree (status) WHERE ((status)::text = 'pending'::text);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'images_status_check'
      and conrelid = 'public.images'::regclass
  ) then
    alter table "public"."images" add constraint "images_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[]))) not valid;
    alter table "public"."images" validate constraint "images_status_check";
  end if;
end $$;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_climbs_with_consensus(p_climb_ids uuid[])
 RETURNS TABLE(climb_id uuid, consensus_grade character varying, total_votes integer, grade_tied boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id UUID;
  v_total_votes INTEGER;
  v_avg_points NUMERIC;
  v_nearest_grade VARCHAR(10);
BEGIN
  FOR i IN 1..array_length(p_climb_ids, 1) LOOP
    v_id := p_climb_ids[i];

    SELECT INTO v_total_votes COUNT(*) FROM grade_votes WHERE grade_votes.climb_id = v_id;

    IF v_total_votes = 0 THEN
      consensus_grade := NULL;
      total_votes := 0;
      grade_tied := FALSE;
    ELSE
      SELECT INTO v_avg_points AVG(g.points)
      FROM grade_votes gv
      JOIN grades g ON gv.grade = g.grade
      WHERE gv.climb_id = v_id;

      SELECT INTO v_nearest_grade grade
      FROM grades
      ORDER BY ABS(points - v_avg_points)
      LIMIT 1;

      consensus_grade := v_nearest_grade;
      total_votes := v_total_votes;
      grade_tied := FALSE;
    END IF;

    climb_id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_climb_consensus()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_climb_id UUID;
  v_consensus_grade VARCHAR(10);
  v_total_votes INTEGER;
  v_max_votes INTEGER;
  v_tied_grades INTEGER;
BEGIN
  FOR v_climb_id IN SELECT id FROM climbs LOOP
    SELECT INTO v_max_votes MAX(vote_count)
    FROM (
      SELECT grade, COUNT(*) as vote_count
      FROM grade_votes
      WHERE climb_id = v_climb_id
      GROUP BY grade
    ) sub;

    SELECT INTO v_tied_grades COUNT(*)
    FROM (
      SELECT grade, COUNT(*) as vote_count
      FROM grade_votes
      WHERE climb_id = v_climb_id
      GROUP BY grade
    ) sub
    WHERE vote_count = v_max_votes;

    SELECT INTO v_consensus_grade MIN(grade)
    FROM (
      SELECT grade, COUNT(*) as vote_count
      FROM grade_votes
      WHERE climb_id = v_climb_id
      GROUP BY grade
    ) sub
    WHERE vote_count = v_max_votes;

    SELECT INTO v_total_votes COUNT(*)
    FROM grade_votes
    WHERE climb_id = v_climb_id;

    UPDATE climbs
    SET
      consensus_grade = v_consensus_grade,
      total_votes = COALESCE(v_total_votes, 0),
      grade_tied = v_tied_grades > 1,
      updated_at = NOW()
    WHERE id = v_climb_id;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_climb_grade_vote(p_climb_id uuid, p_user_id uuid, p_grade character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count INTEGER;
  v_consensus_grade VARCHAR(10);
  v_tied_grades INTEGER;
BEGIN
  INSERT INTO grade_votes (climb_id, user_id, grade)
  VALUES (p_climb_id, p_user_id, p_grade)
  ON CONFLICT (climb_id, user_id) 
  DO UPDATE SET grade = EXCLUDED.grade, created_at = NOW();

  -- Update the climbs consensus columns directly
  SELECT INTO v_count COUNT(*) FROM grade_votes WHERE climb_id = p_climb_id;
  
  IF v_count = 0 THEN
    UPDATE climbs SET consensus_grade = NULL, total_votes = 0, grade_tied = FALSE WHERE id = p_climb_id;
  ELSE
    SELECT INTO v_tied_grades COUNT(*) FROM (
      SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE climb_id = p_climb_id GROUP BY grade
    ) sub WHERE cnt = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM grade_votes WHERE climb_id = p_climb_id GROUP BY grade) sub2);
    
    SELECT INTO v_consensus_grade MIN(grade) FROM (
      SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE climb_id = p_climb_id GROUP BY grade
    ) sub WHERE cnt = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM grade_votes WHERE climb_id = p_climb_id GROUP BY grade) sub2);
    
    UPDATE climbs SET 
      consensus_grade = v_consensus_grade, 
      total_votes = v_count, 
      grade_tied = v_tied_grades > 1 
    WHERE id = p_climb_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.insert_grade_vote(climb_id uuid, vote_grade character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO grade_votes (climb_id, user_id, grade)
  VALUES (climb_id, auth.uid(), vote_grade)
  ON CONFLICT (climb_id, user_id) 
  DO UPDATE SET grade = EXCLUDED.grade, created_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_climb_consensus()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_climb_id UUID;
  v_consensus_grade VARCHAR(10);
  v_total_votes INTEGER;
  v_max_votes INTEGER;
  v_tied_grades INTEGER;
BEGIN
  v_climb_id := COALESCE(NEW.climb_id, OLD.climb_id);

  IF v_climb_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT INTO v_max_votes MAX(vote_count)
  FROM (
    SELECT grade, COUNT(*) as vote_count
    FROM grade_votes
    WHERE climb_id = v_climb_id
    GROUP BY grade
  ) sub;

  SELECT INTO v_tied_grades COUNT(*)
  FROM (
    SELECT grade, COUNT(*) as vote_count
    FROM grade_votes
    WHERE climb_id = v_climb_id
    GROUP BY grade
  ) sub
  WHERE vote_count = v_max_votes;

  SELECT INTO v_consensus_grade MIN(grade)
  FROM (
    SELECT grade, COUNT(*) as vote_count
    FROM grade_votes
    WHERE climb_id = v_climb_id
    GROUP BY grade
  ) sub
  WHERE vote_count = v_max_votes;

  SELECT INTO v_total_votes COUNT(*)
  FROM grade_votes
  WHERE climb_id = v_climb_id;

  UPDATE climbs
  SET
    consensus_grade = v_consensus_grade,
    total_votes = COALESCE(v_total_votes, 0),
    grade_tied = v_tied_grades > 1,
    updated_at = NOW()
  WHERE id = v_climb_id;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_climb_consensus_safe()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_climb_id UUID;
  v_total_votes INTEGER;
  v_consensus_grade VARCHAR(10);
  v_tied_grades INTEGER;
BEGIN
  v_climb_id := COALESCE(NEW.climb_id, OLD.climb_id);
  
  IF v_climb_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT INTO v_total_votes COUNT(*) FROM grade_votes WHERE climb_id = v_climb_id;
  
  IF v_total_votes = 0 THEN
    UPDATE climbs SET consensus_grade = NULL, total_votes = 0, grade_tied = FALSE WHERE id = v_climb_id;
  ELSE
    SELECT INTO v_tied_grades COUNT(*) FROM (
      SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE climb_id = v_climb_id GROUP BY grade
    ) sub WHERE cnt = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM grade_votes WHERE climb_id = v_climb_id GROUP BY grade) sub2);
    
    SELECT INTO v_consensus_grade MIN(grade) FROM (
      SELECT grade, COUNT(*) as cnt FROM grade_votes WHERE climb_id = v_climb_id GROUP BY grade
    ) sub WHERE cnt = (SELECT MAX(cnt) FROM (SELECT COUNT(*) as cnt FROM grade_votes WHERE climb_id = v_climb_id GROUP BY grade) sub2);
    
    UPDATE climbs SET 
      consensus_grade = v_consensus_grade, 
      total_votes = v_total_votes, 
      grade_tied = v_tied_grades > 1 
    WHERE id = v_climb_id;
  END IF;
  
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.images_recompute_crag_location_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_crag_location(NEW.crag_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.crag_id IS DISTINCT FROM OLD.crag_id THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
      PERFORM public.recompute_crag_location(NEW.crag_id);
      RETURN NEW;
    END IF;

    IF NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
      PERFORM public.recompute_crag_location(NEW.crag_id);
      RETURN NEW;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Only recompute if the crag still exists (handles cascade delete from crag)
    IF EXISTS (SELECT 1 FROM public.crags WHERE id = OLD.crag_id) THEN
      PERFORM public.recompute_crag_location(OLD.crag_id);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$
;


do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'grade_votes'
      and policyname = 'Authenticated create grade vote'
  ) then
    create policy "Authenticated create grade vote"
    on "public"."grade_votes"
    as permissive
    for insert
    to public
    with check ((auth.uid() = user_id));
  end if;
end $$;


do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_update_climb_consensus_on_vote'
  ) then
    CREATE TRIGGER trg_update_climb_consensus_on_vote AFTER INSERT OR DELETE OR UPDATE ON public.grade_votes FOR EACH ROW EXECUTE FUNCTION public.update_climb_consensus_safe();
  end if;
end $$;
