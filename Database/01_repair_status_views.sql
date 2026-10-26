-- =====================================================================
-- 01_repair_status_views.sql  (Engineer Dashboard — Repair Status)
--
-- Flat, server-pageable Pending / History views so the page asks for ONE
-- page per request (PostgREST .range + count) instead of loading every
-- sss_warehouse row and joining in the browser:
--   * Pending = planned set AND no engg_dsb_repair_status row yet
--   * History = a completion row exists
-- Each exposes: the warehouse row's own columns (id = warehouse id, the
-- same id the page submits against), the ticket fields the page shows, a
-- lower-cased `search_text`, and the flat role / filter columns
-- (assigned_engineer, category, service_location).
-- Anti-join (NOT EXISTS), never NOT IN. Read-only, additive, safe to re-run.
-- Views run with the owner's rights; anon is granted SELECT explicitly,
-- matching the existing "anon can read" policies on the underlying tables.
-- =====================================================================
CREATE OR REPLACE VIEW public.engg_v_repair_status_pending AS
SELECT
  w.id,
  w.ticket_id,
  w.created_at,
  w.assigned_engineer,
  w.engg_dsb_repair_status_planned AS planned,
  t.created_at AS ticket_created_at,
  t.client_name,
  t.phone_number,
  t.company_name,
  t.machine_name,
  t.mention_issue,
  t.category,
  t.service_location,
  lower(concat_ws(' ', w.ticket_id, t.client_name, t.company_name, t.phone_number, t.machine_name, t.mention_issue)) AS search_text
FROM public.sss_warehouse w
LEFT JOIN public.sss_tickets t ON t.ticket_id = w.ticket_id
WHERE w.engg_dsb_repair_status_planned IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.engg_dsb_repair_status c WHERE c.warehouse_id = w.id);

CREATE OR REPLACE VIEW public.engg_v_repair_status_history AS
SELECT
  w.id,
  w.ticket_id,
  c.created_at,
  w.assigned_engineer,
  w.engg_dsb_repair_status_planned AS planned,
  t.created_at AS ticket_created_at,
  t.client_name,
  t.phone_number,
  t.company_name,
  t.machine_name,
  t.mention_issue,
  t.category,
  t.service_location,
  c.repair_status,
  c.engineer_name,
  c.remarks,
  c.items,
  c.qty,
  c.image,
  lower(concat_ws(' ', w.ticket_id, t.client_name, t.company_name, t.phone_number, t.machine_name, t.mention_issue, c.remarks, c.engineer_name)) AS search_text
FROM public.sss_warehouse w
JOIN public.engg_dsb_repair_status c ON c.warehouse_id = w.id
LEFT JOIN public.sss_tickets t ON t.ticket_id = w.ticket_id
WHERE w.engg_dsb_repair_status_planned IS NOT NULL;

GRANT SELECT ON public.engg_v_repair_status_pending, public.engg_v_repair_status_history TO anon, authenticated, service_role;

-- anti-join / join keys
CREATE INDEX IF NOT EXISTS engg_dsb_repair_status_warehouse_idx ON public.engg_dsb_repair_status (warehouse_id);
CREATE INDEX IF NOT EXISTS sss_warehouse_repair_planned_idx ON public.sss_warehouse (engg_dsb_repair_status_planned) WHERE engg_dsb_repair_status_planned IS NOT NULL;
