drop extension if exists "pg_net";

drop policy "Owner create logs" on "public"."logs";

drop policy "Owner update logs" on "public"."logs";

drop policy "Public read logs" on "public"."logs";

revoke delete on table "public"."logs" from "anon";

revoke insert on table "public"."logs" from "anon";

revoke references on table "public"."logs" from "anon";

revoke select on table "public"."logs" from "anon";

revoke trigger on table "public"."logs" from "anon";

revoke truncate on table "public"."logs" from "anon";

revoke update on table "public"."logs" from "anon";

revoke delete on table "public"."logs" from "authenticated";

revoke insert on table "public"."logs" from "authenticated";

revoke references on table "public"."logs" from "authenticated";

revoke select on table "public"."logs" from "authenticated";

revoke trigger on table "public"."logs" from "authenticated";

revoke truncate on table "public"."logs" from "authenticated";

revoke update on table "public"."logs" from "authenticated";

revoke delete on table "public"."logs" from "service_role";

revoke insert on table "public"."logs" from "service_role";

revoke references on table "public"."logs" from "service_role";

revoke select on table "public"."logs" from "service_role";

revoke trigger on table "public"."logs" from "service_role";

revoke truncate on table "public"."logs" from "service_role";

revoke update on table "public"."logs" from "service_role";

alter table "public"."logs" drop constraint "logs_climb_id_fkey";

alter table "public"."logs" drop constraint "logs_user_id_fkey";

drop function if exists "public"."handle_new_user"();

drop function if exists "public"."handle_user_metadata_update"();

alter table "public"."logs" drop constraint "logs_pkey";

drop index if exists "public"."idx_logs_climb";

drop index if exists "public"."idx_logs_date";

drop index if exists "public"."idx_logs_user";

drop index if exists "public"."logs_pkey";

drop table "public"."logs";

alter table "public"."deletion_requests" enable row level security;

alter table "public"."profiles" drop column "website";

alter table "public"."profiles" add column "bio" text;

alter table "public"."profiles" add column "country" character varying(100);

alter table "public"."profiles" add column "country_code" character varying(2);

alter table "public"."profiles" add column "created_at" timestamp with time zone default now();

alter table "public"."profiles" add column "display_name" text;

alter table "public"."profiles" add column "gender" text;

alter table "public"."profiles" add column "highest_grade" text;

alter table "public"."profiles" add column "preferred_grade_system" character varying(10) default 'french'::character varying;

alter table "public"."profiles" add column "preferred_style" character varying(20) default 'sport'::character varying;

alter table "public"."profiles" add column "total_climbs" integer default 0;

alter table "public"."profiles" add column "total_points" integer default 0;

alter table "public"."profiles" alter column "updated_at" set default now();

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."profiles" add constraint "profiles_gender_check" CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_gender_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_correction_type_value(new_value text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'climb_corrections_correction_type_check'
    AND check_definition LIKE '%' || new_value || '%'
  ) THEN
    ALTER TABLE climb_corrections DROP CONSTRAINT climb_corrections_correction_type_check;
    ALTER TABLE climb_corrections ADD CONSTRAINT climb_corrections_correction_type_check
      CHECK (correction_type IN ('location', 'name', 'line', 'grade', 'removal'));
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'auth'
AS $function$
  SELECT COUNT(*) FROM users;
$function$
;


  create policy "Users can create deletion requests for themselves"
  on "public"."deletion_requests"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "Users can update their own deletion requests"
  on "public"."deletion_requests"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Users can view their own deletion requests"
  on "public"."deletion_requests"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));


drop trigger if exists "on_auth_user_created" on "auth"."users";

drop trigger if exists "on_auth_user_updated" on "auth"."users";


