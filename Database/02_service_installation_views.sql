-- =====================================================================
-- 02_service_installation_views.sql  (Engineer Dashboard — Service Installation)
--
-- Server-pageable Pending / History views (see 01_repair_status_views.sql for
-- the rationale). Same rules as the page had in JS:
--   * only rows with engg_dsb_service_installation_planned set AND a non-empty si_no
--   * Pending = no engg_dsb_service_installation row yet; History = a row exists
-- `engineer_name` is the role-scope column; `remarks` is the completion remark
-- (History only); `planned_at` / `actual_at` are the dates the page shows.
-- Anti-join (NOT EXISTS). Read-only, additive, safe to re-run.
-- =====================================================================
CREATE OR REPLACE VIEW public.engg_v_service_installation_pending AS
SELECT
  s.id,
  s.si_no,
  s.engg_dsb_service_installation_planned AS planned_at,
  s.engg_dsb_service_installation_planned AS created_at,
  s.company_name,
  s.contact_person_name,
  s.contact_person_no,
  s.invoice_no,
  s.item_name,
  s.qty,
  s.serial,
  s.engineer_name,
  lower(concat_ws(' ', s.si_no, s.company_name, s.contact_person_name, s.contact_person_no, s.invoice_no, s.item_name, s.serial)) AS search_text
FROM public.sss_service_installation s
WHERE s.engg_dsb_service_installation_planned IS NOT NULL
  AND btrim(coalesce(s.si_no, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.engg_dsb_service_installation c WHERE c.service_installation_id = s.id);

CREATE OR REPLACE VIEW public.engg_v_service_installation_history AS
SELECT
  s.id,
  s.si_no,
  s.engg_dsb_service_installation_planned AS planned_at,
  c.created_at AS actual_at,
  c.created_at,
  s.company_name,
  s.contact_person_name,
  s.contact_person_no,
  s.invoice_no,
  s.item_name,
  s.qty,
  s.serial,
  s.engineer_name,
  c.remarks,
  lower(concat_ws(' ', s.si_no, s.company_name, s.contact_person_name, s.contact_person_no, s.invoice_no, s.item_name, s.serial, c.remarks)) AS search_text
FROM public.sss_service_installation s
JOIN public.engg_dsb_service_installation c ON c.service_installation_id = s.id
WHERE s.engg_dsb_service_installation_planned IS NOT NULL
  AND btrim(coalesce(s.si_no, '')) <> '';

GRANT SELECT ON public.engg_v_service_installation_pending, public.engg_v_service_installation_history TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS engg_dsb_service_installation_si_idx ON public.engg_dsb_service_installation (service_installation_id);
CREATE INDEX IF NOT EXISTS sss_service_installation_engg_planned_idx ON public.sss_service_installation (engg_dsb_service_installation_planned) WHERE engg_dsb_service_installation_planned IS NOT NULL;
