-- =====================================================================
-- 03_video_call_views.sql  (Engineer Dashboard — Video Call)
--
-- A ticket is in Video Call once sss_warranty_check.video_call_planned is set.
--   * Pending = no attempt yet, OR the latest attempt is 'rescheduled'
--   * History = the latest attempt exists and is not 'rescheduled'
-- (the same rule as the main Service-Support app and the old page JS).
-- "Latest attempt" = newest sss_video_call row for the ticket (DISTINCT ON).
-- Columns: the ticket fields the page shows/uses, the latest attempt's fields
-- (enquiry_solved, service_type, regeneration_status, audio_link, remarks,
-- item_qty, attempt_created_at), flat filter/scope columns (category,
-- service_location, engineer_assign, cre_name) and a lower-cased search_text.
-- `id` = the ticket uuid (what the Solution form submits against).
-- Read-only, additive, safe to re-run.
-- =====================================================================
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
  lower(concat_ws(' ', t.ticket_id, t.enquiry_receiver_name, t.company_name, t.client_name, t.phone_number, t.machine_name, l.remarks)) AS search_text
FROM public.sss_warranty_check w
JOIN public.sss_tickets t ON t.ticket_id = w.ticket_id
LEFT JOIN latest l ON l.ticket_id = t.ticket_id
WHERE w.video_call_planned IS NOT NULL;

CREATE OR REPLACE VIEW public.engg_v_video_call_pending AS
SELECT a.*, a.ticket_created_at AS created_at FROM public.engg_v_video_call_all a WHERE a.is_pending;

CREATE OR REPLACE VIEW public.engg_v_video_call_history AS
SELECT a.*, a.attempt_created_at AS created_at FROM public.engg_v_video_call_all a WHERE NOT a.is_pending;

GRANT SELECT ON public.engg_v_video_call_all, public.engg_v_video_call_pending, public.engg_v_video_call_history TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS sss_video_call_ticket_created_idx ON public.sss_video_call (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sss_warranty_check_video_planned_idx ON public.sss_warranty_check (video_call_planned) WHERE video_call_planned IS NOT NULL;
