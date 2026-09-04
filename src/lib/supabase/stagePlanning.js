/**
 * Centralized "planned_at" calculation rules, one entry per stage transition.
 *
 * Every stage table has a `<next_stage>_planned` column (see schemaMapping.js)
 * that gates the NEXT stage's pending/history split. How that timestamp gets
 * computed differs per transition — sometimes it's just "now", sometimes it's
 * conditional on a ticket field, sometimes it's a previous stage's completion
 * time plus a configurable TAT (src/pages/Master/tat-config.jsx). Rather than
 * re-deriving that logic inside each stage page's handleSubmit, it's defined
 * once here and each page calls computeStagePlanned(key, ctx).
 *
 * Add a new stage's rule here as each page migrates off the sheet.
 */

import { supabase } from "./client";

/** Duration_minutes for a tat_config row, or `fallbackMinutes` if that stage isn't configured yet. */
export async function getStageTatMinutes(stageName, fallbackMinutes = 60) {
  const { data, error } = await supabase
    .from("sss_tat_config")
    .select("duration_minutes")
    .eq("stage_name", stageName)
    .maybeSingle();

  if (error) throw error;
  return data?.duration_minutes ?? fallbackMinutes;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Office-hours config (singleton row) + one-off holiday dates, fetched
 * together so computeStagePlanned() can confine every `<next_stage>_planned`
 * timestamp to actual working time — see addBusinessMinutes() below.
 * Falls back to sensible defaults (10:00-18:00, Sunday off, no holidays) if
 * office_hours somehow has no row yet (it's seeded by migration 0047, so
 * this is just defense-in-depth).
 */
export async function getOfficeHours() {
  const { data, error } = await supabase
    .from("sss_office_hours")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data || { start_time: "10:00:00", end_time: "18:00:00", weekly_off_days: [0] };
}

export async function getHolidayDates() {
  const { data, error } = await supabase.from("sss_holidays").select("holiday_date");
  if (error) throw error;
  return new Set((data || []).map((h) => h.holiday_date));
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWorkingDay(date, weeklyOffDays, holidayDates) {
  if (weeklyOffDays.includes(date.getDay())) return false;
  if (holidayDates.has(dateKey(date))) return false;
  return true;
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(":").map(Number);
  return h * 60 + (m || 0);
}

function atMinuteOfDay(date, minuteOfDay) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  return d;
}

function nextDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/**
 * Adds `minutes` of BUSINESS time to `startDate`, confined to
 * [officeHours.start_time, officeHours.end_time) on working days only
 * (officeHours.weekly_off_days + holidayDates), carrying any leftover TAT
 * minutes over to the next working day's opening time. E.g. office hours
 * 10:00-18:00, submitted at 17:30 with a 60-minute TAT: 30 minutes fit
 * before close today, the remaining 30 roll over to 10:00 the next working
 * day -> planned = 10:30 that day.
 *
 * Falls back to a plain calendar-time addMinutes() if office_hours is
 * misconfigured (end_time <= start_time) rather than looping forever.
 */
export function addBusinessMinutes(startDate, minutes, officeHours, holidayDates) {
  const startMin = parseTimeToMinutes(officeHours.start_time);
  const endMin = parseTimeToMinutes(officeHours.end_time);
  const weeklyOff = officeHours.weekly_off_days || [];

  if (endMin <= startMin) {
    return addMinutes(startDate, minutes);
  }

  let cursor = new Date(startDate);

  // Clamp the starting point into the working window: skip forward past
  // off-days, and past today's close (or up to today's open) as needed.
  while (true) {
    if (!isWorkingDay(cursor, weeklyOff, holidayDates)) {
      cursor = atMinuteOfDay(nextDay(cursor), startMin);
      continue;
    }
    const curMin = cursor.getHours() * 60 + cursor.getMinutes();
    if (curMin < startMin) {
      cursor = atMinuteOfDay(cursor, startMin);
      break;
    }
    if (curMin >= endMin) {
      cursor = atMinuteOfDay(nextDay(cursor), startMin);
      continue;
    }
    break;
  }

  let remaining = minutes;
  while (remaining > 0) {
    const curMin = cursor.getHours() * 60 + cursor.getMinutes();
    const availableToday = endMin - curMin;
    if (remaining <= availableToday) {
      cursor = new Date(cursor.getTime() + remaining * 60000);
      remaining = 0;
    } else {
      remaining -= availableToday;
      cursor = atMinuteOfDay(nextDay(cursor), startMin);
      while (!isWorkingDay(cursor, weeklyOff, holidayDates)) {
        cursor = atMinuteOfDay(nextDay(cursor), startMin);
      }
    }
  }

  return cursor;
}

/**
 * @typedef {Object} StagePlanningRule
 * @property {string} tatStageName - Key into tat_config.stage_name for this transition's TAT.
 * @property {(ctx: Object) => boolean} shouldPlan - Whether this ticket even moves to the next stage.
 *   Returning false means the next stage's page should never see this ticket (planned stays null).
 * @property {(ctx: Object) => Date} baseTime - The timestamp the TAT gets added to.
 */

/** @type {Record<string, StagePlanningRule>} */
export const STAGE_PLANNING_RULES = {
  // Ticket creation -> Warranty-Check. Every ticket moves on to
  // Warranty-Check (no branching); base time is the ticket's own submit-time
  // timestamp (the frontend doesn't have tickets.created_at until after the
  // insert completes, same approximation used everywhere else).
  warrantyCheck: {
    tatStageName: "Warranty-Check",
    shouldPlan: () => true,
    baseTime: (ctx) => ctx.ticketSubmittedAt,
  },

  // Warranty-Check branches into exactly one of three outcomes, checked in
  // this order (mutually exclusive — see warehouse/videoCall/quotationDirect
  // below): service_location='Warehouse' wins first, then video_call='Yes',
  // then a direct-to-Quotation fallback when neither applies. Base time for
  // all three is when Warranty-Check was submitted (approximated with the
  // client's own submit-time timestamp — the frontend doesn't have the
  // server-assigned warranty_check.created_at until after the insert
  // completes, same approximation used everywhere else in this app).

  // Warranty-Check -> Warehouse.
  warehouse: {
    tatStageName: "Warehouse",
    shouldPlan: (ctx) => ctx.ticket?.serviceLocation === "Warehouse",
    baseTime: (ctx) => ctx.warrantyCheckSubmittedAt,
  },

  // Warranty-Check -> Video-Call. Only when service_location isn't
  // 'Warehouse' (that branch takes priority) and the ticket requested a
  // video call.
  videoCall: {
    tatStageName: "Video-Call",
    shouldPlan: (ctx) => ctx.ticket?.serviceLocation !== "Warehouse" && ctx.ticket?.videoCall === "Yes",
    baseTime: (ctx) => ctx.warrantyCheckSubmittedAt,
  },

  // Warranty-Check -> Quotation directly. Fallback for when the ticket
  // matches neither the Warehouse nor Video-Call branch above — same
  // centralized warranty_check.quotation_planned column that
  // video_call_apply_quotation_planned()/warehouse_apply_quotation_planned()
  // also write to once those stages complete.
  quotationDirect: {
    tatStageName: "Quotation",
    shouldPlan: (ctx) => ctx.ticket?.serviceLocation !== "Warehouse" && ctx.ticket?.videoCall !== "Yes",
    baseTime: (ctx) => ctx.warrantyCheckSubmittedAt,
  },

  // TADA -> OTP Verification. Every TADA submission moves on to OTP
  // Verification (no branching); base time is TADA's own submit-time
  // timestamp, same "client's own submit-time timestamp" approximation used
  // by videoCall above.
  otpVerification: {
    tatStageName: "OTP Verification",
    shouldPlan: () => true,
    baseTime: (ctx) => ctx.tadaSubmittedAt,
  },

  // Order Received -> Invoice. Every Order Received submission moves on to
  // Invoice (no branching); base time is Order Received's own submit-time
  // timestamp.
  invoice: {
    tatStageName: "Invoice",
    shouldPlan: () => true,
    baseTime: (ctx) => ctx.orderReceivedSubmittedAt,
  },

  // Invoice -> Calibration. Only when tickets.enquiry_type = 'NABL' — every
  // other enquiry_type skips Calibration entirely (planned stays null).
  // Base time is Invoice's own submit-time timestamp.
  calibration: {
    tatStageName: "Calibration",
    shouldPlan: (ctx) => ctx.ticket?.enquiryType === "NABL",
    baseTime: (ctx) => ctx.invoiceSubmittedAt,
  },

  // Invoice -> Spare Dispatch Details. Only when tickets.enquiry_type =
  // 'SPARE' — mutually exclusive with 'calibration' above in practice
  // (enquiry_type is single-select), but not enforced here; both rules are
  // independent and simply check their own condition. Base time is
  // Invoice's own submit-time timestamp.
  sparedispatch: {
    tatStageName: "Spare Dispatch",
    shouldPlan: (ctx) => ctx.ticket?.enquiryType === "SPARE",
    baseTime: (ctx) => ctx.invoiceSubmittedAt,
  },

  // Calibration -> Calibration Certificate. Every Calibration submission
  // moves on to Calibration Certificate (no branching); base time is
  // Calibration's own submit-time timestamp.
  calibrationCertificate: {
    tatStageName: "Calibration Certificate",
    shouldPlan: () => true,
    baseTime: (ctx) => ctx.calibrationSubmittedAt,
  },

  // sss_service_installation (installation_follow_up = 'Yes') -> the
  // Engineer-Dashboard's own "Service Installation" stage
  // (Engineer-Dashboard/src/pages/service-installation/service-installation.jsx,
  // engg_dsb_service_installation table). Every completed installation
  // follow-up moves on (no branching); base time is
  // ServiceInstallation.jsx's own submit-time timestamp. See migration 0055.
  enggDsbServiceInstallation: {
    tatStageName: "Engg Dashboard Service Installation",
    shouldPlan: () => true,
    baseTime: (ctx) => ctx.installationSubmittedAt,
  },

  // sss_warehouse row created -> the Engineer-Dashboard's own "Repair
  // Status" stage (Engineer-Dashboard/src/pages/Repair-Status/repair-status.jsx,
  // engg_dsb_repair_status table). sss_warehouse has no separate
  // actual/completion column — the insert itself is Warehouse.jsx's
  // completion event, so every warehouse submission moves on (no
  // branching); base time is that same submission's own timestamp. See
  // migration 0055.
  enggDsbRepairStatus: {
    tatStageName: "Engg Dashboard Repair Status",
    shouldPlan: () => true,
    baseTime: (ctx) => ctx.warehouseSubmittedAt,
  },
};

/**
 * Computes the `<next_stage>_planned` value for a stage transition, or null
 * if this ticket doesn't move to that stage at all.
 * @param {keyof typeof STAGE_PLANNING_RULES} stageKey
 * @param {Object} ctx - Whatever the rule's shouldPlan/baseTime need (see each rule above).
 * @returns {Promise<string|null>} ISO timestamp, or null.
 */
export async function computeStagePlanned(stageKey, ctx) {
  const rule = STAGE_PLANNING_RULES[stageKey];
  if (!rule) throw new Error(`No planning rule defined for stage "${stageKey}"`);

  if (!rule.shouldPlan(ctx)) return null;

  const [tatMinutes, officeHours, holidayDates] = await Promise.all([
    getStageTatMinutes(rule.tatStageName),
    getOfficeHours(),
    getHolidayDates(),
  ]);
  return addBusinessMinutes(rule.baseTime(ctx), tatMinutes, officeHours, holidayDates).toISOString();
}
