-- Create enum types for type-safe columns
-- Run after linking to project: supabase db push --linked

-- Image enums
CREATE TYPE image_status AS ENUM ('pending', 'approved', 'rejected', 'deleted');
CREATE TYPE image_visibility AS ENUM ('private', 'public');
CREATE TYPE image_processing_status AS ENUM ('pending', 'queued', 'processing', 'ready', 'failed');
CREATE TYPE image_moderation_status AS ENUM ('pending', 'approved', 'rejected');

-- Climb enums
CREATE TYPE climb_status AS ENUM ('pending', 'approved', 'rejected', 'active');
CREATE TYPE climb_route_type AS ENUM ('sport', 'boulder', 'trad', 'deep-water-solo');

-- Community enums
CREATE TYPE community_post_type AS ENUM ('session', 'update', 'conditions', 'question');
CREATE TYPE rsvp_status AS ENUM ('going', 'interested');

-- Moderation enums
CREATE TYPE flag_status AS ENUM ('pending', 'resolved');
CREATE TYPE flag_action AS ENUM ('keep', 'edit', 'remove');
CREATE TYPE correction_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE vote_type AS ENUM ('approve', 'reject');

-- Report enums
CREATE TYPE crag_report_status AS ENUM ('pending', 'investigating', 'resolved', 'dismissed');

-- Media enums
CREATE TYPE media_job_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');

-- Gym enums
CREATE TYPE gym_route_status AS ENUM ('active', 'retired');
CREATE TYPE gym_route_discipline AS ENUM ('boulder', 'sport', 'top_rope', 'mixed');
CREATE TYPE gym_membership_status AS ENUM ('active', 'invited', 'revoked');
CREATE TYPE gym_membership_role AS ENUM ('owner', 'manager', 'head_setter', 'setter');
CREATE TYPE gym_application_status AS ENUM ('pending', 'reviewing', 'approved', 'rejected');

-- Place enums
CREATE TYPE place_type AS ENUM ('crag', 'gym');

-- Location enums
CREATE TYPE location_tag_kind AS ENUM ('region', 'sub_area');

-- Profile enums
CREATE TYPE profile_gender AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE measurement_units AS ENUM ('metric', 'imperial');
CREATE TYPE theme_preference AS ENUM ('light', 'dark', 'system');
CREATE TYPE grade_system AS ENUM ('v_scale', 'font_scale', 'yds_equivalent', 'french_equivalent', 'british_equivalent');

-- User activity enums
CREATE TYPE user_climb_style AS ENUM ('flash', 'top', 'try', 'onsight', 'redpoint');

-- Community follow enums
CREATE TYPE notification_level AS ENUM ('all', 'daily', 'off');

-- Crag enums
CREATE TYPE crag_type AS ENUM ('crag', 'boulder', 'sport', 'trad', 'mixed');

-- Alter tables to use enum types
-- Images
DROP TRIGGER IF EXISTS trigger_crag_counts_images ON public.images;

DO $$
DECLARE
  index_record RECORD;
BEGIN
  FOR index_record IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.tablename
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
    JOIN pg_index idx ON idx.indexrelid = (
      SELECT c2.oid
      FROM pg_class c2
      JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
      WHERE n2.nspname = i.schemaname AND c2.relname = i.indexname
    )
    WHERE i.schemaname = 'public'
      AND i.tablename = 'images'
      AND NOT idx.indisprimary
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        WHERE con.conindid = idx.indexrelid
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', 'public', index_record.indexname);
  END LOOP;
END $$;

ALTER TABLE images ALTER COLUMN status DROP DEFAULT;
ALTER TABLE images ALTER COLUMN status TYPE image_status USING status::image_status;
ALTER TABLE images ALTER COLUMN status SET DEFAULT 'pending'::image_status;
ALTER TABLE images ALTER COLUMN visibility TYPE image_visibility USING visibility::image_visibility;
ALTER TABLE images ALTER COLUMN processing_status TYPE image_processing_status USING processing_status::image_processing_status;
ALTER TABLE images ALTER COLUMN moderation_status TYPE image_moderation_status USING moderation_status::image_moderation_status;

CREATE INDEX IF NOT EXISTS idx_images_parent_image_id
  ON public.images(parent_image_id);

CREATE INDEX IF NOT EXISTS idx_images_is_primary
  ON public.images(is_primary);

CREATE INDEX IF NOT EXISTS idx_images_is_anonymous_submission
  ON public.images(is_anonymous_submission);

CREATE INDEX IF NOT EXISTS idx_images_original_location
  ON public.images(original_bucket, original_key);

CREATE INDEX IF NOT EXISTS idx_images_processing_status
  ON public.images(processing_status, visibility);

CREATE INDEX IF NOT EXISTS images_submission_id_idx
  ON public.images(submission_id)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS images_submission_id_face_order_idx
  ON public.images(submission_id, face_order)
  WHERE submission_id IS NOT NULL;

CREATE TRIGGER trigger_crag_counts_images
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.images
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_crag_counts_images();

-- Climb
ALTER TABLE climbs ALTER COLUMN status TYPE climb_status USING status::climb_status;
ALTER TABLE climbs ALTER COLUMN route_type TYPE climb_route_type USING route_type::climb_route_type;

-- Community posts
ALTER TABLE community_posts ALTER COLUMN type TYPE community_post_type USING type::community_post_type;

-- Community RSVPs
ALTER TABLE community_post_rsvps ALTER COLUMN status TYPE rsvp_status USING status::rsvp_status;

-- Climb flags
ALTER TABLE climb_flags ALTER COLUMN status TYPE flag_status USING status::flag_status;
ALTER TABLE climb_flags ALTER COLUMN action_taken TYPE flag_action USING action_taken::flag_action;

-- Climb corrections
ALTER TABLE climb_corrections ALTER COLUMN status TYPE correction_status USING status::correction_status;

-- Correction votes
ALTER TABLE correction_votes ALTER COLUMN vote_type TYPE vote_type USING vote_type::vote_type;

-- Crag reports
ALTER TABLE crag_reports ALTER COLUMN status TYPE crag_report_status USING status::crag_report_status;

-- Media jobs
ALTER TABLE media_jobs ALTER COLUMN status TYPE media_job_status USING status::media_job_status;

-- Gym routes
ALTER TABLE gym_routes ALTER COLUMN status TYPE gym_route_status USING status::gym_route_status;
ALTER TABLE gym_routes ALTER COLUMN discipline TYPE gym_route_discipline USING discipline::gym_route_discipline;

-- Gym memberships
ALTER TABLE gym_memberships ALTER COLUMN status TYPE gym_membership_status USING status::gym_membership_status;
ALTER TABLE gym_memberships ALTER COLUMN role TYPE gym_membership_role USING role::gym_membership_role;

-- Gym owner applications
ALTER TABLE gym_owner_applications ALTER COLUMN status TYPE gym_application_status USING status::gym_application_status;

-- Places
ALTER TABLE places ALTER COLUMN type TYPE place_type USING type::place_type;

-- Location tags
ALTER TABLE location_tags ALTER COLUMN kind TYPE location_tag_kind USING kind::location_tag_kind;

-- Profiles
ALTER TABLE profiles ALTER COLUMN gender TYPE profile_gender USING gender::profile_gender;
ALTER TABLE profiles ALTER COLUMN units TYPE measurement_units USING units::measurement_units;
ALTER TABLE profiles ALTER COLUMN theme_preference TYPE theme_preference USING theme_preference::theme_preference;
ALTER TABLE profiles ALTER COLUMN boulder_system TYPE grade_system USING boulder_system::grade_system;
ALTER TABLE profiles ALTER COLUMN route_system TYPE grade_system USING route_system::grade_system;
ALTER TABLE profiles ALTER COLUMN trad_system TYPE grade_system USING trad_system::grade_system;
ALTER TABLE profiles ALTER COLUMN preferred_grade_system TYPE grade_system USING preferred_grade_system::grade_system;

-- User climbs
ALTER TABLE user_climbs ALTER COLUMN style TYPE user_climb_style USING style::user_climb_style;

-- Community place follows
ALTER TABLE community_place_follows ALTER COLUMN notification_level TYPE notification_level USING notification_level::notification_level;

-- Crags
ALTER TABLE crags ALTER COLUMN type TYPE crag_type USING type::crag_type;

-- Drop old CHECK constraints that were on TEXT columns
-- Images
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_status_check;
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_visibility_check;
ALTER TABLE images DROP CONSTRAINT IF EXISTS images_processing_status_check;

-- Climb
ALTER TABLE climbs DROP CONSTRAINT IF EXISTS climbs_status_check;

-- Community
ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_type_check;

-- Gym routes
ALTER TABLE gym_routes DROP CONSTRAINT IF EXISTS gym_routes_status_check;

-- Gym memberships
ALTER TABLE gym_memberships DROP CONSTRAINT IF EXISTS gym_memberships_status_check;
ALTER TABLE gym_memberships DROP CONSTRAINT IF EXISTS gym_memberships_role_check;
