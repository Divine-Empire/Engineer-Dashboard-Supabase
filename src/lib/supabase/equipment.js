import { supabase } from "./client";
import { fetchDropdownRows } from "./dropdown";

// TADA "Equipments Needed". sss_dropdown (category 'equipment_list') holds "<ID> - <Equipment Name>";
// sss_tada.equipments_needed stores only the IDs.
export const equipmentId = (value) => String(value ?? "").split(" - ")[0].trim();

// -> [{ id, label }] sorted by label order of the seed
export async function fetchEquipmentOptions() {
  const rows = await fetchDropdownRows(["equipment_list"]);
  return rows.map((r) => ({ id: equipmentId(r.value), label: r.value }));
}

// "DEIPL/LAB/04 - Digital Vernier Caliper; ..." for display (unknown ids are shown as they are).
export const formatEquipments = (ids, labelById) =>
  (ids || []).map((id) => labelById?.get(id) || id).join("; ");

// Items already reserved by another ticket in [from, to] (rejected TADA / past return date are free).
// -> [{ equipment, ticket_id, travel_date, return_date }]
export async function fetchEquipmentConflicts(equipmentIds, from, to, ticketUuid) {
  if (!equipmentIds?.length || !from) return [];
  const { data, error } = await supabase.rpc("sss_tada_equipment_conflicts", {
    p_equipments: equipmentIds,
    p_from: from,
    p_to: to || from,
    p_ticket_uuid: ticketUuid || null,
  });
  if (error) throw error;
  return data || [];
}
