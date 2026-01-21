-- Removed: drop statements for logs table (doesn't exist locally)
-- Removed: drop extension pg_net

  create table if not exists "public"."deletion_requests" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "scheduled_at" timestamp with time zone not null,
    "cancelled_at" timestamp with time zone,
    "delete_route_uploads" boolean not null default false,
    "primary_reason" text,
    "deleted_at" timestamp with time zone
      );



  create table if not exists "public"."product_clicks" (
    "product_id" text not null,
    "click_count" bigint default 0,
    "updated_at" timestamp with time zone default now()
      );


create table if not exists "public"."profiles" (
  "id" uuid not null references auth.users on delete cascade,
  "updated_at" timestamp with time zone,
  "username" text unique,
  "avatar_url" text,
  "website" text
    );

  alter table "public"."profiles" add column if not exists "default_location" text;

  alter table "public"."profiles" add column if not exists "default_location_lat" numeric(10,8);

  alter table "public"."profiles" add column if not exists "default_location_lng" numeric(11,8);

  alter table "public"."profiles" add column if not exists "default_location_name" text;

  alter table "public"."profiles" add column if not exists "default_location_zoom" integer;

  alter table "public"."profiles" add column if not exists "grade_system" character varying(10) default 'font'::character varying;

  alter table "public"."profiles" add column if not exists "is_public" boolean default true;

  alter table "public"."profiles" add column if not exists "name" text;

  alter table "public"."profiles" add column if not exists "theme_preference" character varying(20) default 'system'::character varying;

  alter table "public"."profiles" add column if not exists "units" character varying(10) default 'metric'::character varying;

CREATE UNIQUE INDEX if not exists deletion_requests_pkey ON public.deletion_requests USING btree (id);

CREATE INDEX if not exists idx_deletion_requests_scheduled ON public.deletion_requests USING btree (scheduled_at) WHERE ((cancelled_at IS NULL) AND (deleted_at IS NULL));

CREATE INDEX if not exists idx_product_clicks_count ON public.product_clicks USING btree (click_count DESC);

CREATE INDEX if not exists idx_profiles_is_public ON public.profiles USING btree (is_public);

CREATE UNIQUE INDEX if not exists product_clicks_pkey ON public.product_clicks USING btree (product_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'deletion_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'deletion_requests' AND constraint_name = 'deletion_requests_pkey') THEN
      alter table "public"."deletion_requests" add constraint "deletion_requests_pkey" PRIMARY KEY using index "deletion_requests_pkey";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'product_clicks') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'product_clicks' AND constraint_name = 'product_clicks_pkey') THEN
      alter table "public"."product_clicks" add constraint "product_clicks_pkey" PRIMARY KEY using index "product_clicks_pkey";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'deletion_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'deletion_requests' AND constraint_name = 'deletion_requests_user_id_fkey') THEN
      alter table "public"."deletion_requests" add constraint "deletion_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'deletion_requests' AND constraint_name = 'deletion_requests_user_id_fkey') THEN
      alter table "public"."deletion_requests" validate constraint "deletion_requests_user_id_fkey";
    END IF;
  END IF;
END $$;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_user_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM auth.users;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_crag_report_count(target_crag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE crags SET report_count = report_count + 1 WHERE id = target_crag_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_gear_click(product_id_input text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO product_clicks (product_id, click_count, updated_at)
  VALUES (product_id_input, 1, NOW())
  ON CONFLICT (product_id)
  DO UPDATE SET
    click_count = product_clicks.click_count + 1,
    updated_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_profile_public(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN (
        SELECT COALESCE(is_public, true)
        FROM profiles
        WHERE id = user_id
    );
END;
$function$
;

grant delete on table "public"."deletion_requests" to "anon";

grant insert on table "public"."deletion_requests" to "anon";

grant references on table "public"."deletion_requests" to "anon";

grant select on table "public"."deletion_requests" to "anon";

grant trigger on table "public"."deletion_requests" to "anon";

grant truncate on table "public"."deletion_requests" to "anon";

grant update on table "public"."deletion_requests" to "anon";

grant delete on table "public"."deletion_requests" to "authenticated";

grant insert on table "public"."deletion_requests" to "authenticated";

grant references on table "public"."deletion_requests" to "authenticated";

grant select on table "public"."deletion_requests" to "authenticated";

grant trigger on table "public"."deletion_requests" to "authenticated";

grant truncate on table "public"."deletion_requests" to "authenticated";

grant update on table "public"."deletion_requests" to "authenticated";

grant delete on table "public"."deletion_requests" to "service_role";

grant insert on table "public"."deletion_requests" to "service_role";

grant references on table "public"."deletion_requests" to "service_role";

grant select on table "public"."deletion_requests" to "service_role";

grant trigger on table "public"."deletion_requests" to "service_role";

grant truncate on table "public"."deletion_requests" to "service_role";

grant update on table "public"."deletion_requests" to "service_role";

grant delete on table "public"."product_clicks" to "anon";

grant insert on table "public"."product_clicks" to "anon";

grant references on table "public"."product_clicks" to "anon";

grant select on table "public"."product_clicks" to "anon";

grant trigger on table "public"."product_clicks" to "anon";

grant truncate on table "public"."product_clicks" to "anon";

grant update on table "public"."product_clicks" to "anon";

grant delete on table "public"."product_clicks" to "authenticated";

grant insert on table "public"."product_clicks" to "authenticated";

grant references on table "public"."product_clicks" to "authenticated";

grant select on table "public"."product_clicks" to "authenticated";

grant trigger on table "public"."product_clicks" to "authenticated";

grant truncate on table "public"."product_clicks" to "authenticated";

grant update on table "public"."product_clicks" to "authenticated";

grant delete on table "public"."product_clicks" to "service_role";

grant insert on table "public"."product_clicks" to "service_role";

grant references on table "public"."product_clicks" to "service_role";

grant select on table "public"."product_clicks" to "service_role";

grant trigger on table "public"."product_clicks" to "service_role";

grant truncate on table "public"."product_clicks" to "service_role";

grant update on table "public"."product_clicks" to "service_role";


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read user_climbs for public profiles' AND tablename = 'user_climbs') THEN
    create policy "Public read user_climbs for public profiles"
    on "public"."user_climbs"
    as permissive
    for select
    to public
    using ((EXISTS ( SELECT 1
       FROM public.profiles
      WHERE ((profiles.id = user_climbs.user_id) AND (profiles.is_public = true)))));
  END IF;
END $$;



DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload' AND tablename = 'objects') THEN
    create policy "Authenticated users can upload"
    on "storage"."objects"
    as permissive
    for insert
    to public
    with check (((bucket_id = 'route-uploads'::text) AND (auth.role() = 'authenticated'::text)));
  END IF;
END $$;



