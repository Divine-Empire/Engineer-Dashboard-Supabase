-- =====================================================================
-- 06_dashboard_views.sql  (Engineer Dashboard)
--
-- 1. engg_v_calendar_events — every event the Visit Calendar / Today's
--    Availability shows, one flat row each, with start_on / end_on (dates, IST)
--    so the page can ask for just the visible window instead of loading
--    every site visit, TADA and warehouse row into the browser:
--      * Site Visit  — every sss_site_visit row (dates from its TADA row when there is one)
--      * Video Call  — tickets in Video Call (warranty video_call_planned set) with video_call = 'Yes';
--                      start = latest attempt's rescheduled_time, else the ticket's created_at
--      * Repair      — every sss_warehouse row; start = date_of_repair, else created_at
--    The five date fields are text exactly as the calendar's own parser expects
--    ('YYYY-MM-DD' for dates, ISO-8601 'Z' for timestamps). `engineer_assign` is
--    the role-scope column. ev_id is a stable unique key (for paging).
-- 2. engg_v_video_call_all: search_text also covers `category` (the Dashboard's
--    ticket search always matched it). Same columns, only the search expression changes.
-- Read-only, additive, safe to re-run.
-- =====================================================================
CREATE OR REPLACE VIEW public.engg_v_calendar_events AS
SELECT
  'sv:' || sv.id::text AS ev_id,
  'Site Visit'::text AS type,
  COALESCE(sv.ticket_id, t.ticket_id) AS ticket_id,
  t.company_name, t.client_name, t.phone_number, t.mention_issue,
  sv.engineer_assign,
  t.cre_name,
  sv.date_of_visit::text AS date_of_visit,
  COALESCE(d.travel_date, sv.date_of_visit)::text AS travel_date,
  d.return_date::text AS return_date,
  d.expected_completion_date::text AS expected_completion_date,
  d.expected_completion_time::text AS expected_completion_time,
  NULL::text AS video_call_time,
  COALESCE(d.travel_date, sv.date_of_visit)::date AS start_on,
  GREATEST(COALESCE(d.travel_date, sv.date_of_visit), d.return_date, d.expected_completion_date)::date AS end_on
FROM public.sss_site_visit sv
LEFT JOIN public.sss_tickets t ON t.uuid = sv.ticket_uuid
LEFT JOIN public.sss_tada d ON d.ticket_uuid = sv.ticket_uuid

UNION ALL

SELECT
  'vc:' || t.uuid::text,
  'Video Call',
  t.ticket_id,
  t.company_name, t.client_name, t.phone_number, t.mention_issue,
  COALESCE(NULLIF(l.alternate_engineer, ''), t.engineer_assign),
  t.cre_name,
  s.iso, s.iso, s.iso, s.iso,
  NULL::text,
  t.video_call_time,
  s.ist_day,
  s.ist_day
FROM public.sss_warranty_check w
JOIN public.sss_tickets t ON t.ticket_id = w.ticket_id AND t.video_call = 'Yes'
LEFT JOIN LATERAL (
  SELECT v.alternate_engineer, v.rescheduled_time
  FROM public.sss_video_call v
  WHERE v.ticket_id = t.ticket_id
  ORDER BY v.created_at DESC
  LIMIT 1
) l ON true
CROSS JOIN LATERAL (
  SELECT
    to_char(COALESCE(l.rescheduled_time, t.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS iso,
    (COALESCE(l.rescheduled_time, t.created_at) AT TIME ZONE 'Asia/Kolkata')::date AS ist_day
) s
WHERE w.video_call_planned IS NOT NULL

UNION ALL

SELECT
  'rp:' || w.id::text,
  'Repair',
  COALESCE(w.ticket_id, t.ticket_id),
  t.company_name, t.client_name, t.phone_number, t.mention_issue,
  w.assigned_engineer,
  t.cre_name,
  s.d, s.d, s.d, s.d,
  NULL::text,
  NULL::text,
  s.day,
  s.day
FROM public.sss_warehouse w
LEFT JOIN public.sss_tickets t ON t.uuid = w.ticket_uuid
CROSS JOIN LATERAL (
  SELECT
    COALESCE(w.date_of_repair::text, to_char(w.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) AS d,
    COALESCE(w.date_of_repair, (w.created_at AT TIME ZONE 'Asia/Kolkata')::date) AS day
) s;

GRANT SELECT ON public.engg_v_calendar_events TO anon, authenticated, service_role;

-- (2) search_text now includes category
CREATE OR REPLACE VIEW public.engg_v_video_call_all AS
WITH latest AS (
  SELECT DISTINCT ON (v.ticket_id) v.*
  FROM public.sss_video_call v
  ORDER BY v.ticket_id, v.created_at DESC
)
SELECT
  t.uuid AS id,
  t.ticket_id,
  t.created_at AS ticket_created_at,
  t.client_name,
  t.phone_number,
  t.category,
  t.call_type,
  t.video_call,
  t.source_of_enquiry,
  t.enquiry_receiver_name,
  t.client_type,
  t.gst_no,
  t.mention_issue,
  t.enquiry_item_list,
  t.machine_name,
  t.enquiry_type,
  t.site_address,
  t.company_name,
  t.gst_address,
  t.engineer_assign,
  t.service_location,
  t.otp,
  t.cre_name,
  t.video_call_time,
  l.created_at AS attempt_created_at,
  l.enquiry_solved,
  l.service_type,
  l.regeneration_status,
  l.audio_link,
  l.remarks,
  l.item_qty,
  (l.id IS NULL OR l.enquiry_solved = 'rescheduled') AS is_pending,
  lower(concat_ws(' ', t.ticket_id, t.enquiry_receiver_name, t.company_name, t.client_name, t.phone_number, t.machine_name, t.category, l.remarks)) AS search_text
FROM public.sss_warranty_check w
JOIN public.sss_tickets t ON t.ticket_id = w.ticket_id
LEFT JOIN latest l ON l.ticket_id = t.ticket_id
WHERE w.video_call_planned IS NOT NULL;
