import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Server-side proxy for the Material Testing page.
//
// The PFMS production project (zpkikvgmmbtekbcuqahf) has RLS enabled on every
// pfms_* table with no policy for the anon role, so the browser's anon key
// reads ZERO rows (no error — the page just shows "No entries found").
// Purchase-FMS-Supabase works because its Next.js API routes use the
// service_role key server-side. This function does the same for this app, so
// the service_role key never reaches the browser bundle.
//
// Required env (Vercel project settings):
//   VITE_PFMS_SUPABASE_URL           (shared with the browser client, same value)
//   PFMS_SUPABASE_SERVICE_ROLE_KEY   (server-only — never give this a VITE_ prefix)
//
// Deliberately narrow: only the fixed Material Testing operations below —
// no generic "run any query" passthrough.

const STORAGE_BUCKET = 'pfms-purchase-fms';
const STORAGE_FOLDER = 'general';
const WORKING_CONDITIONS = ['Passed', 'Passed but Quality Concern', 'Rejected'];

const getAdmin = () => {
  const url = process.env.VITE_PFMS_SUPABASE_URL;
  const key = process.env.PFMS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(500, 'Server is missing VITE_PFMS_SUPABASE_URL / PFMS_SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Same nested embed Purchase-FMS-Supabase's own GET route uses.
const TESTING_SELECT = `
  *,
  lift:pfms_lift!inner (
    liftNo,
    indent:pfms_indent_generation!inner (
      indentNo,
      itemName,
      category,
      warehouseLocation,
      negotiation:pfms_negotiation (
        selectedVendorName
      ),
      poEntry:"pfms_po-entry" (
        poNumber,
        basicValue,
        totalWithTax
      )
    ),
    materialReceived:"pfms_material-received" (
      invoiceNumber,
      invoiceDate,
      receivedQty,
      damagedQty,
      damageReason,
      damageImage,
      plannedMaterialTesting,
      timestamp
    )
  )
`;

// PostgREST caps a response at 1000 rows, so page through with .range().
async function fetchAll(build) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const first = (v) => (Array.isArray(v) ? v[0] || {} : v || {});

// One pfms_material-testing row -> the flat record shape the pages render.
function mapTesting(testing) {
  const lift = testing.lift || {};
  const indent = lift.indent || {};
  const negotiation = first(indent.negotiation);
  const poEntry = first(indent.poEntry);
  const matRecd = first(lift.materialReceived);

  const receivedQty = parseFloat(matRecd.receivedQty || 0);
  const pendingQty = testing.pendingQty !== null && testing.pendingQty !== undefined ? testing.pendingQty : receivedQty;
  const checklistArr = Array.isArray(testing.checklist) ? testing.checklist : [];
  const serialArr = Array.isArray(testing.serialNumbers) ? testing.serialNumbers : [];
  const imageArr = Array.isArray(testing.images) ? testing.images : [];

  return {
    id: testing.id,
    liftNo: lift.liftNo || '',
    indentNumber: indent.indentNo || '',
    status: pendingQty > 0 ? 'pending' : 'completed',
    data: {
      indentNumber: indent.indentNo || '',
      liftNo: lift.liftNo || '',
      vendorName: negotiation.selectedVendorName || '-',
      poNumber: poEntry.poNumber || '-',
      itemName: indent.itemName || '-',
      invoiceNumber: matRecd.invoiceNumber || '-',
      receivedQty,
      plan7: matRecd.plannedMaterialTesting || '',
      qcDate: testing.qcDate || testing.timestamp || '',
      qcBy: testing.qcBy || '-',
      approvedQty: testing.approvedQty || 0,
      rejectedQty: testing.rejectedQty || 0,
      totalApproved: testing.approvedQty || 0,
      totalRejected: testing.rejectedQty || 0,
      pendingQty,
      damageQty: matRecd.damagedQty || '0',
      damageReason: matRecd.damageReason || '-',
      damageImage: matRecd.damageImage || '',
      workingCondition: testing.workingCondition || '-',
      checklist: checklistArr.length > 0 ? checklistArr.join(', ') : '-',
      serialNo: serialArr.length > 0 ? serialArr.join(', ') : '-',
      image: imageArr.length > 0 ? imageArr.join(' , ') : '-',
      rejectType: testing.rejectType || '-',
      partName: testing.partName || '-',
      remarks: testing.remarks || '-',
    },
  };
}

const MAX_PAGE_SIZE = 100;

// Paged list. tab: 'pending' | 'history' | 'all'. Returns the page plus the
// Pending/Completed counts (cancelled indents are not Pending) so the page tabs
// and the Dashboard cards come from one call. The payload per request is one
// page, not the whole table.
async function listRows(admin, q) {
  const tab = ['pending', 'history', 'all'].includes(q.tab) ? q.tab : 'pending';
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(q.pageSize, 10) || 20));
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const search = String(q.search || '').trim().toLowerCase();

  const [testings, cancelled] = await Promise.all([
    fetchAll(() => admin.from('pfms_material-testing').select(TESTING_SELECT).order('id', { ascending: true })),
    fetchAll(() => admin.from('pfms_order-cancellation').select('indentNo').order('indentNo')),
  ]);
  const cancelledNos = new Set(cancelled.map((c) => c.indentNo));

  const rows = testings
    .map(mapTesting)
    .filter((r) => r.status !== 'pending' || !cancelledNos.has(r.indentNumber));

  const counts = { pending: 0, completed: 0 };
  rows.forEach((r) => { counts[r.status] += 1; });

  const matches = (r) => {
    if (!search) return true;
    const d = r.data;
    return [d.indentNumber, d.liftNo, d.itemName, d.vendorName, d.poNumber, d.invoiceNumber]
      .some((v) => String(v || '').toLowerCase().includes(search));
  };
  let filtered = rows.filter((r) => (tab === 'all' || (tab === 'pending' ? r.status === 'pending' : r.status === 'completed')) && matches(r));
  // Newest first, except the pending work queue which keeps DB order unless asked (Dashboard).
  if (tab !== 'pending' || q.newestFirst === '1') filtered = filtered.reverse();

  const start = (page - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    counts,
  };
}

async function listDropdowns(admin) {
  const { data, error } = await admin
    .from('pfms_dropdown')
    .select('category, value')
    .in('category', ['Engineers', 'QC-Checklist', 'Reject Type (QC)']);
  if (error) throw error;
  const byCategory = (cat) => [...new Set((data || []).filter((r) => r.category === cat).map((r) => r.value).filter(Boolean))];
  return {
    engineers: byCategory('Engineers'),
    checklist: byCategory('QC-Checklist'),
    rejectTypes: byCategory('Reject Type (QC)'),
  };
}

async function listSerials(admin, liftNo) {
  if (!liftNo) throw new HttpError(400, 'liftNo is required');
  const { data, error } = await admin
    .from('pfms_serial-number')
    .select('"serialNo"')
    .eq('liftNo', liftNo);
  if (error) throw error;
  return { serials: (data || []).map((r) => String(r.serialNo || '').trim()).filter(Boolean) };
}

// Browser uploads the file straight to Storage with this one-time token, so the
// image never goes through the function (Vercel's ~4.5MB body limit).
async function createUploadUrl(admin, { prefix, fileName }) {
  const ext = String(fileName || '').split('.').pop().replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  const safePrefix = String(prefix || 'IMG').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const path = `${STORAGE_FOLDER}/${safePrefix}_${Date.now()}.${ext}`;
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  const { data: urlData } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { bucket: STORAGE_BUCKET, path: data.path || path, token: data.token, publicUrl: urlData.publicUrl || '' };
}

const toList = (v) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
const toQty = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// ── Planned-time helpers ────────────────────────────────────────────────────
// Verbatim port of Purchase-FMS-Supabase app/api/helper/plannedCalculator.ts
// (calculatePlannedTime / getLocalTimestamp), so a QC done from this app stamps the same
// plannedPurchaseReturns the Purchase system would. Keep the two in sync.
const OFFICE_HOURS = { startHour: 9, startMinute: 30, endHour: 18, endMinute: 30 };

function getLocalTimestamp(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().replace('Z', '');
}

const normalizeStageKey = (name) =>
  String(name).trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');

function isNonWorkingDay(date, holidaySet) {
  if (date.getDay() === 0) return true;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return holidaySet.has(`${y}-${m}-${d}`);
}

function advanceToNextWorkingDayStart(date, holidaySet) {
  date.setDate(date.getDate() + 1);
  date.setHours(OFFICE_HOURS.startHour, OFFICE_HOURS.startMinute, 0, 0);
  while (isNonWorkingDay(date, holidaySet)) date.setDate(date.getDate() + 1);
}

function snapToWorkingShiftWindow(date, holidaySet) {
  if (isNonWorkingDay(date, holidaySet)) {
    advanceToNextWorkingDayStart(date, holidaySet);
    return;
  }
  const minutesOfDay = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const shiftStart = OFFICE_HOURS.startHour * 60 + OFFICE_HOURS.startMinute;
  const shiftEnd = OFFICE_HOURS.endHour * 60 + OFFICE_HOURS.endMinute;
  if (minutesOfDay < shiftStart) date.setHours(OFFICE_HOURS.startHour, OFFICE_HOURS.startMinute, 0, 0);
  else if (minutesOfDay >= shiftEnd) advanceToNextWorkingDayStart(date, holidaySet);
}

// TAT minutes from pfms_tat, walked through office hours, skipping Sundays and pfms_holidays.
async function calculatePlannedTime(admin, stageName) {
  const normKey = normalizeStageKey(stageName);
  let tatMinutes = 0;
  try {
    const { data } = await admin.from('pfms_tat').select('stage_name, duration_in_minutes');
    const match = (data || []).find((row) => normalizeStageKey(row.stage_name || '') === normKey);
    if (match && typeof match.duration_in_minutes === 'number') tatMinutes = match.duration_in_minutes;
  } catch (err) {
    console.error('Error fetching TAT in calculatePlannedTime:', err);
  }
  if (!tatMinutes || tatMinutes <= 0) tatMinutes = 24 * 60;

  const holidaySet = new Set();
  try {
    const { data } = await admin.from('pfms_holidays').select('holiday_date');
    (data || []).forEach((row) => {
      const d = row.holiday_date ? String(row.holiday_date).split('T')[0].trim() : '';
      if (d) holidaySet.add(d);
    });
  } catch (err) {
    console.error('Error fetching holidays in calculatePlannedTime:', err);
  }

  const curr = new Date();
  snapToWorkingShiftWindow(curr, holidaySet);
  const shiftEnd = OFFICE_HOURS.endHour * 60 + OFFICE_HOURS.endMinute;
  let remaining = Math.round(tatMinutes);
  while (remaining > 0) {
    const nowMin = curr.getHours() * 60 + curr.getMinutes() + curr.getSeconds() / 60;
    const availableToday = Math.max(0, shiftEnd - nowMin);
    if (remaining <= availableToday) {
      curr.setMinutes(curr.getMinutes() + remaining);
      remaining = 0;
    } else {
      remaining -= availableToday;
      advanceToNextWorkingDayStart(curr, holidaySet);
    }
  }
  return getLocalTimestamp(curr);
}

// pfms_material-testing is ONE row per lift (created upstream by
// Purchase-FMS-Supabase's material-received stage) — UPDATE it in place, never
// insert a second row. Mirrors Purchase-FMS-Supabase app/api/material-testing POST.
async function submitQc(admin, body) {
  const {
    liftNo, qcBy, qcDate, workingCondition, remarks, rejectType, partName,
  } = body;
  if (!liftNo) throw new HttpError(400, 'liftNo is required');
  if (!WORKING_CONDITIONS.includes(workingCondition)) throw new HttpError(400, 'Invalid workingCondition');

  const isPassed = workingCondition !== 'Rejected';
  const addApproved = isPassed ? toQty(body.approvedQty) : 0;
  const addRejected = isPassed ? 0 : toQty(body.rejectQty);
  if (addApproved + addRejected <= 0) throw new HttpError(400, 'Quantity must be greater than 0');

  const { data: current, error: fetchError } = await admin
    .from('pfms_material-testing')
    .select('*')
    .eq('liftNo', liftNo)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!current) throw new HttpError(404, `Testing record not found for lift ${liftNo}`);

  // Received qty comes from the DB, not the client.
  const { data: lift, error: liftError } = await admin
    .from('pfms_lift')
    .select('liftNo, materialReceived:"pfms_material-received" (receivedQty)')
    .eq('liftNo', liftNo)
    .maybeSingle();
  if (liftError) throw liftError;
  const mr = Array.isArray(lift?.materialReceived) ? lift.materialReceived[0] : lift?.materialReceived;
  const receivedQty = parseFloat(mr?.receivedQty || 0);

  const oldApproved = current.approvedQty || 0;
  const oldRejected = current.rejectedQty || 0;
  const oldPending = current.pendingQty ?? Math.max(0, receivedQty - oldApproved - oldRejected);
  if (addApproved + addRejected > oldPending) {
    throw new HttpError(400, `Quantity exceeds pending qty (${oldPending})`);
  }

  const newApproved = oldApproved + addApproved;
  const newRejected = oldRejected + addRejected;
  const newPending = Math.max(0, receivedQty - (newApproved + newRejected));
  const now = getLocalTimestamp();

  // Split this round's rejects by type so a lift rejected across rounds with different
  // types still tracks each bucket: "Repair" goes to Repair Process, everything else
  // (Exchange / Return) to Purchase Return. Same rule as Purchase-FMS-Supabase.
  const isRepairReject = addRejected > 0 && String(rejectType || '').trim() === 'Repair';
  const newRejectedRepairQty = (current.rejectedRepairQty || 0) + (isRepairReject ? addRejected : 0);
  const newRejectedReturnQty = (current.rejectedReturnQty || 0) + (!isRepairReject ? addRejected : 0);

  // Purchase Return is only planned for the Return bucket, once testing is fully resolved.
  let plannedPurchaseReturns = current.plannedPurchaseReturns;
  if (newPending === 0 && newRejectedReturnQty > 0) {
    plannedPurchaseReturns = await calculatePlannedTime(admin, 'purchase-return');
  }

  const { error: updateError } = await admin
    .from('pfms_material-testing')
    .update({
      timestamp: now,
      qcBy: qcBy || current.qcBy,
      qcDate: qcDate ? getLocalTimestamp(qcDate) : (current.qcDate || now),
      workingCondition: workingCondition || current.workingCondition,
      remarks: remarks || current.remarks,
      pendingQty: newPending,
      approvedQty: newApproved,
      rejectedQty: newRejected,
      rejectedRepairQty: newRejectedRepairQty,
      rejectedReturnQty: newRejectedReturnQty,
      checklist: Array.from(new Set([...(current.checklist || []), ...(isPassed ? toList(body.checklist) : [])])),
      serialNumbers: [...(current.serialNumbers || []), ...toList(body.serialNumbers)],
      images: [...(current.images || []), ...toList(body.images)],
      rejectType: !isPassed ? (rejectType || current.rejectType) : current.rejectType,
      partName: !isPassed ? (partName || current.partName) : current.partName,
      plannedPurchaseReturns,
      updatedAt: now,
    })
    .eq('liftNo', liftNo);
  if (updateError) throw updateError;

  // Qty-resolution ledger (only exists for lifts where QC was required). Serial Generation
  // and Receipt in Tally read it to decide when a lift is fully resolved and can be released.
  const { data: ledgerRow, error: ledgerFetchError } = await admin
    .from('pfms_lift_qc_resolution')
    .select('*')
    .eq('liftNo', liftNo)
    .maybeSingle();
  if (ledgerFetchError) throw ledgerFetchError;

  if (ledgerRow) {
    const ledgerUpdate = { pendingQcQty: newPending, passedQty: newApproved, updatedAt: now };

    if (newPending === 0) {
      // Testing is done: hand off whatever repair-bound qty is still unresolved.
      const outstandingRepairQty = Math.max(
        0,
        newRejectedRepairQty - (ledgerRow.repairedQty || 0) - (ledgerRow.repairFailedQty || 0)
      );
      ledgerUpdate.repairPendingQty = outstandingRepairQty;
      const fullyResolved = outstandingRepairQty === 0;
      ledgerUpdate.isFullyResolved = fullyResolved;
      if (fullyResolved && !ledgerRow.releasedAt) ledgerUpdate.releasedAt = now;

      // Create the Repair Process record once (later rounds don't re-create it).
      if (outstandingRepairQty > 0) {
        const { data: existingRepair } = await admin
          .from('pfms_repair_process')
          .select('id')
          .eq('liftNo', liftNo)
          .maybeSingle();
        if (!existingRepair) {
          const { error: repairInsertError } = await admin.from('pfms_repair_process').insert({
            id: randomUUID(),
            timestamp: now,
            liftNo,
            repairedQty: 0,
            failedQty: 0,
            createdAt: now,
            updatedAt: now,
          });
          if (repairInsertError) throw repairInsertError;
        }
      }
    }

    const { error: ledgerUpdateError } = await admin
      .from('pfms_lift_qc_resolution')
      .update(ledgerUpdate)
      .eq('liftNo', liftNo);
    if (ledgerUpdateError) throw ledgerUpdateError;
  }

  return { ok: true, pendingQty: newPending };
}

export default async function handler(req, res) {
  try {
    const admin = getAdmin();
    const action = String(req.query?.action || '');

    if (req.method === 'GET' && action === 'list') return res.status(200).json(await listRows(admin, req.query || {}));
    if (req.method === 'GET' && action === 'dropdowns') return res.status(200).json(await listDropdowns(admin));
    if (req.method === 'GET' && action === 'serials') {
      return res.status(200).json(await listSerials(admin, String(req.query.liftNo || '')));
    }
    if (req.method === 'POST' && action === 'upload-url') {
      return res.status(200).json(await createUploadUrl(admin, req.body || {}));
    }
    if (req.method === 'POST' && action === 'submit') {
      return res.status(200).json(await submitQc(admin, req.body || {}));
    }
    throw new HttpError(404, 'Not found');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error('material-testing api error:', err);
    return res.status(status).json({ error: err.message || 'Internal error' });
  }
}
