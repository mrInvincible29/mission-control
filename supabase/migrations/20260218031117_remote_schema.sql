


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."activity_stats"("p_since" timestamp with time zone DEFAULT ("now"() - '24:00:00'::interval)) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result JSON;
BEGIN
  WITH recent AS (
    SELECT * FROM activities WHERE timestamp >= p_since
  ),
  by_category AS (
    SELECT COALESCE(category, 'unknown') AS cat, COUNT(*) AS cnt
    FROM recent GROUP BY cat
  ),
  by_status AS (
    SELECT status, COUNT(*) AS cnt
    FROM recent GROUP BY status
  ),
  totals AS (
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM((metadata->>'tokens')::BIGINT), 0) AS total_tokens,
      COALESCE(SUM((metadata->>'cost')::NUMERIC), 0) AS total_cost
    FROM recent
  )
  SELECT json_build_object(
    'total', (SELECT total FROM totals),
    'byCategory', (SELECT COALESCE(json_object_agg(cat, cnt), '{}'::json) FROM by_category),
    'byStatus', (SELECT COALESCE(json_object_agg(status, cnt), '{}'::json) FROM by_status),
    'totalTokens', (SELECT total_tokens FROM totals),
    'totalCost', (SELECT total_cost FROM totals)
  ) INTO result;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."activity_stats"("p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_summary"("p_days" integer DEFAULT 14) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  since_ts TIMESTAMPTZ := now() - (p_days || ' days')::INTERVAL;
  result JSON;
BEGIN
  WITH activities_window AS (
    SELECT * FROM activities WHERE timestamp >= since_ts
  ),
  daily_agg AS (
    SELECT
      to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      COALESCE(SUM((metadata->>'tokens')::BIGINT), 0) AS tokens,
      COALESCE(SUM(
        CASE
          WHEN (metadata->>'cost')::NUMERIC > 0 THEN (metadata->>'cost')::NUMERIC
          WHEN (metadata->>'tokens')::BIGINT > 0 THEN
            (metadata->>'tokens')::BIGINT *
            CASE
              WHEN LOWER(metadata->>'model') LIKE '%haiku%' THEN 2.4 / 1000000.0
              WHEN LOWER(metadata->>'model') LIKE '%opus%' THEN 45.0 / 1000000.0
              ELSE 9.0 / 1000000.0
            END
          ELSE 0
        END
      ), 0) AS cost,
      COUNT(*) AS count,
      COUNT(*) FILTER (WHERE status = 'error') AS errors
    FROM activities_window
    GROUP BY day
  ),
  -- Fill missing days
  day_series AS (
    SELECT to_char(d::DATE, 'YYYY-MM-DD') AS day
    FROM generate_series(
      (now() - (p_days || ' days')::INTERVAL)::DATE,
      now()::DATE,
      '1 day'::INTERVAL
    ) d
  ),
  daily_filled AS (
    SELECT
      ds.day,
      COALESCE(da.tokens, 0) AS tokens,
      COALESCE(da.cost, 0) AS cost,
      COALESCE(da.count, 0) AS count,
      COALESCE(da.errors, 0) AS errors
    FROM day_series ds
    LEFT JOIN daily_agg da ON ds.day = da.day
    ORDER BY ds.day
  ),
  hourly_agg AS (
    SELECT
      EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::INT AS hour,
      COALESCE(SUM((metadata->>'tokens')::BIGINT), 0) AS tokens,
      COALESCE(SUM(
        CASE
          WHEN (metadata->>'cost')::NUMERIC > 0 THEN (metadata->>'cost')::NUMERIC
          WHEN (metadata->>'tokens')::BIGINT > 0 THEN
            (metadata->>'tokens')::BIGINT *
            CASE
              WHEN LOWER(metadata->>'model') LIKE '%haiku%' THEN 2.4 / 1000000.0
              WHEN LOWER(metadata->>'model') LIKE '%opus%' THEN 45.0 / 1000000.0
              ELSE 9.0 / 1000000.0
            END
          ELSE 0
        END
      ), 0) AS cost,
      COUNT(*) AS count
    FROM activities_window
    GROUP BY hour
  ),
  hour_series AS (
    SELECT h AS hour FROM generate_series(0, 23) h
  ),
  hourly_filled AS (
    SELECT
      hs.hour,
      COALESCE(ha.tokens, 0) AS tokens,
      COALESCE(ha.cost, 0) AS cost,
      COALESCE(ha.count, 0) AS count
    FROM hour_series hs
    LEFT JOIN hourly_agg ha ON hs.hour = ha.hour
    ORDER BY hs.hour
  ),
  model_agg AS (
    SELECT
      COALESCE(metadata->>'model', 'unknown') AS model,
      COALESCE(SUM((metadata->>'tokens')::BIGINT), 0) AS tokens,
      COALESCE(SUM(
        CASE
          WHEN (metadata->>'cost')::NUMERIC > 0 THEN (metadata->>'cost')::NUMERIC
          WHEN (metadata->>'tokens')::BIGINT > 0 THEN
            (metadata->>'tokens')::BIGINT *
            CASE
              WHEN LOWER(metadata->>'model') LIKE '%haiku%' THEN 2.4 / 1000000.0
              WHEN LOWER(metadata->>'model') LIKE '%opus%' THEN 45.0 / 1000000.0
              ELSE 9.0 / 1000000.0
            END
          ELSE 0
        END
      ), 0) AS cost,
      COUNT(*) AS count
    FROM activities_window
    WHERE (metadata->>'tokens')::BIGINT > 0 OR (metadata->>'cost')::NUMERIC > 0
    GROUP BY model
    ORDER BY cost DESC
  ),
  category_agg AS (
    SELECT
      COALESCE(category, 'system') AS category,
      COALESCE(SUM((metadata->>'tokens')::BIGINT), 0) AS tokens,
      COALESCE(SUM(
        CASE
          WHEN (metadata->>'cost')::NUMERIC > 0 THEN (metadata->>'cost')::NUMERIC
          WHEN (metadata->>'tokens')::BIGINT > 0 THEN
            (metadata->>'tokens')::BIGINT *
            CASE
              WHEN LOWER(metadata->>'model') LIKE '%haiku%' THEN 2.4 / 1000000.0
              WHEN LOWER(metadata->>'model') LIKE '%opus%' THEN 45.0 / 1000000.0
              ELSE 9.0 / 1000000.0
            END
          ELSE 0
        END
      ), 0) AS cost,
      COUNT(*) AS count
    FROM activities_window
    GROUP BY category
    ORDER BY count DESC
  ),
  totals AS (
    SELECT
      COUNT(*) AS total_activities,
      COALESCE(SUM((metadata->>'tokens')::BIGINT), 0) AS total_tokens,
      COALESCE(SUM(
        CASE
          WHEN (metadata->>'cost')::NUMERIC > 0 THEN (metadata->>'cost')::NUMERIC
          WHEN (metadata->>'tokens')::BIGINT > 0 THEN
            (metadata->>'tokens')::BIGINT *
            CASE
              WHEN LOWER(metadata->>'model') LIKE '%haiku%' THEN 2.4 / 1000000.0
              WHEN LOWER(metadata->>'model') LIKE '%opus%' THEN 45.0 / 1000000.0
              ELSE 9.0 / 1000000.0
            END
          ELSE 0
        END
      ), 0) AS total_cost,
      COUNT(*) FILTER (WHERE status = 'error') AS total_errors
    FROM activities_window
  )
  SELECT json_build_object(
    'daily', (SELECT json_agg(row_to_json(d)) FROM daily_filled d),
    'hourly', (SELECT json_agg(row_to_json(h)) FROM hourly_filled h),
    'models', (SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json) FROM model_agg m),
    'categories', (SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) FROM category_agg c),
    'totalActivities', (SELECT total_activities FROM totals),
    'totalTokens', (SELECT total_tokens FROM totals),
    'totalCost', (SELECT total_cost FROM totals),
    'totalErrors', (SELECT total_errors FROM totals),
    'days', p_days
  ) INTO result;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."analytics_summary"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_activities"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM activities
  WHERE timestamp < now() - INTERVAL '14 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_activities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_documents"("p_query" "text", "p_limit" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "file_path" "text", "file_name" "text", "snippet" "text", "last_indexed" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.file_path,
    d.file_name,
    ts_headline('english', d.content, plainto_tsquery('english', p_query),
      'StartSel=<<, StopSel=>>, MaxWords=35, MinWords=15, MaxFragments=2, FragmentDelimiter= ... ') AS snippet,
    d.last_indexed
  FROM indexed_documents d
  WHERE d.content_tsv @@ plainto_tsquery('english', p_query)
     OR d.file_name ILIKE '%' || p_query || '%'
  ORDER BY
    -- Filename matches first
    CASE WHEN d.file_name ILIKE '%' || p_query || '%' THEN 0 ELSE 1 END,
    ts_rank(d.content_tsv, plainto_tsquery('english', p_query)) DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."search_documents"("p_query" "text", "p_limit" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action_type" "text" NOT NULL,
    "category" "text",
    "description" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "activities_category_check" CHECK (("category" = ANY (ARRAY['important'::"text", 'model'::"text", 'message'::"text", 'system'::"text", 'noise'::"text"]))),
    CONSTRAINT "activities_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cron_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "schedule" "text" NOT NULL,
    "command" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "last_run" timestamp with time zone,
    "next_run" timestamp with time zone,
    "model" "text"
);


ALTER TABLE "public"."cron_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."indexed_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "last_indexed" timestamp with time zone DEFAULT "now"() NOT NULL,
    "size" integer NOT NULL,
    "content_tsv" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "content")) STORED
);


ALTER TABLE "public"."indexed_documents" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_jobs"
    ADD CONSTRAINT "cron_jobs_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."cron_jobs"
    ADD CONSTRAINT "cron_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."indexed_documents"
    ADD CONSTRAINT "indexed_documents_file_path_key" UNIQUE ("file_path");



ALTER TABLE ONLY "public"."indexed_documents"
    ADD CONSTRAINT "indexed_documents_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_activities_action_type" ON "public"."activities" USING "btree" ("action_type");



CREATE INDEX "idx_activities_cat_ts" ON "public"."activities" USING "btree" ("category", "timestamp" DESC);



CREATE INDEX "idx_activities_category" ON "public"."activities" USING "btree" ("category");



CREATE INDEX "idx_activities_metadata" ON "public"."activities" USING "gin" ("metadata" "jsonb_path_ops");



CREATE INDEX "idx_activities_timestamp" ON "public"."activities" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_cron_jobs_name" ON "public"."cron_jobs" USING "btree" ("name");



CREATE INDEX "idx_cron_jobs_next_run" ON "public"."cron_jobs" USING "btree" ("next_run");



CREATE INDEX "idx_documents_file_path" ON "public"."indexed_documents" USING "btree" ("file_path");



CREATE INDEX "idx_documents_fts" ON "public"."indexed_documents" USING "gin" ("content_tsv");





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."activity_stats"("p_since" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."activity_stats"("p_since" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."activity_stats"("p_since" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_summary"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_summary"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_summary"("p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_activities"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_activities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_activities"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_documents"("p_query" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_documents"("p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_documents"("p_query" "text", "p_limit" integer) TO "service_role";


















GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."cron_jobs" TO "anon";
GRANT ALL ON TABLE "public"."cron_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."indexed_documents" TO "anon";
GRANT ALL ON TABLE "public"."indexed_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."indexed_documents" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


