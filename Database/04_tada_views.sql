-- =====================================================================
-- 04_tada_views.sql  (Engineer Dashboard — TADA)
--
-- A ticket is in TADA once its (non-rescheduled) site visit has tada_planned set.
--   * Pending = no sss_tada row yet; History = a sss_tada row exists
-- (same rule as the old page JS and the main Service-Support TADA page).
-- One row per ticket: the newest qualifying site visit (DISTINCT ON), the ticket,
-- its warranty check and quotation, and (History) the TADA row.
-- `id` = the ticket uuid (what the TADA form submits against).
-- `engineer_assign` = site visit's engineer, falling back to the ticket's — the role-scope
-- column. `created_at` = the ticket's created_at (list order, newest first).
-- Read-only, additive, safe to re-run.
-- =====================================================================
CREATE OR REPLACE VIEW public.engg_v_tada_all AS
WITH sv AS (
  SELECT DISTINCT ON (s.ticket_uuid) s.*
  FROM public.sss_site_visit s
  WHERE s.tada_planned IS NOT NULL AND s.rescheduled_at IS NULL
  ORDER BY s.ticket_uuid, s.created_at DESC
)
SELECT
  t.uuid AS id,
  t.ticket_id,
  t.created_at,
  t.source_of_enquiry,
  t.call_type,
  t.enquiry_receiver_name,
  t.client_type,
  t.company_name,
  t.client_name,
  t.phone_number,
  t.gst_address,
  t.site_address,
  t.gst_no,
  t.machine_name,
  t.category,
  t.mention_issue,
  t.service_location,
  t.cre_name,
  COALESCE(NULLIF(sv.engineer_assign, ''), t.engineer_assign) AS engineer_assign,
  sv.date_of_visit,
  sv.transportation,
  w.warranty_check,
  q.quotation_no,
  q.quotation_pdf_link,
  d.id AS tada_id,
  d.travel_date,
  d.return_date,
  d.destination,
  d.purpose_of_travel,
  d.amount,
  d.expected_completion_date,
  d.expected_completion_time,
  d.otp_verification_planned,
  d.delay_minutes,
  lower(concat_ws(' ', t.ticket_id, t.client_name, t.company_name, t.phone_number, t.machine_name)) AS search_text
FROM sv
JOIN public.sss_tickets t ON t.uuid = sv.ticket_uuid
LEFT JOIN public.sss_warranty_check w ON w.ticket_uuid = t.uuid
LEFT JOIN public.sss_quotation q ON q.ticket_uuid = t.uuid
LEFT JOIN public.sss_tada d ON d.ticket_uuid = t.uuid;

CREATE OR REPLACE VIEW public.engg_v_tada_pending AS
SELECT * FROM public.engg_v_tada_all WHERE tada_id IS NULL;

CREATE OR REPLACE VIEW public.engg_v_tada_history AS
SELECT * FROM public.engg_v_tada_all WHERE tada_id IS NOT NULL;

GRANT SELECT ON public.engg_v_tada_all, public.engg_v_tada_pending, public.engg_v_tada_history TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS sss_site_visit_tada_planned_idx ON public.sss_site_visit (ticket_uuid, created_at DESC) WHERE tada_planned IS NOT NULL;
