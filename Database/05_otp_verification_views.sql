-- =====================================================================
-- 05_otp_verification_views.sql  (Engineer Dashboard — OTP Verification)
--
-- A ticket is in OTP Verification once its TADA row has otp_verification_planned set.
--   * Pending = no sss_otp_verification row yet; History = a row exists
-- `id` = the ticket uuid. `engineer_assign` = the ticket's engineer (role-scope column).
-- `created_at` = the ticket's created_at (list order, newest first).
-- Read-only, additive, safe to re-run.
-- =====================================================================
CREATE OR REPLACE VIEW public.engg_v_otp_verification_all AS
SELECT
  t.uuid AS id,
  t.ticket_id,
  t.created_at,
  t.client_name,
  t.company_name,
  t.phone_number,
  t.machine_name,
  t.engineer_assign,
  t.cre_name,
  t.site_visit_otp,
  d.travel_date,
  d.return_date,
  o.id AS otp_id,
  o.site_visit_date,
  o.otp_entered,
  o.service_report_file,
  o.quotation_receive_file,
  o.video_link,
  o.locally_purchased_spares,
  o.remarks,
  o.delay_minutes,
  lower(concat_ws(' ', t.ticket_id, t.client_name, t.company_name, t.phone_number, t.machine_name, o.remarks)) AS search_text
FROM public.sss_tada d
JOIN public.sss_tickets t ON t.uuid = d.ticket_uuid
LEFT JOIN public.sss_otp_verification o ON o.ticket_uuid = t.uuid
WHERE d.otp_verification_planned IS NOT NULL;

CREATE OR REPLACE VIEW public.engg_v_otp_verification_pending AS
SELECT * FROM public.engg_v_otp_verification_all WHERE otp_id IS NULL;

CREATE OR REPLACE VIEW public.engg_v_otp_verification_history AS
SELECT * FROM public.engg_v_otp_verification_all WHERE otp_id IS NOT NULL;

GRANT SELECT ON public.engg_v_otp_verification_all, public.engg_v_otp_verification_pending, public.engg_v_otp_verification_history TO anon, authenticated, service_role;
