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

async function listData(admin) {
  const [dropdowns, testings, cancelled] = await Promise.all([
    admin
      .from('pfms_dropdown')
      .select('category, value')
      .in('category', ['Engineers', 'QC-Checklist', 'Reject Type (QC)']),
    admin.from('pfms_material-testing').select(TESTING_SELECT),
    admin.from('pfms_order-cancellation').select('indentNo'),
  ]);
  if (dropdowns.error) throw dropdowns.error;
  if (testings.error) throw testings.error;
  if (cancelled.error) throw cancelled.error;
  return {
    dropdowns: dropdowns.data || [],
    testings: testings.data || [],
    cancelledNos: (cancelled.data || []).map((c) => c.indentNo),
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
  const now = new Date().toISOString();

  const { error: updateError } = await admin
    .from('pfms_material-testing')
    .update({
      timestamp: now,
      qcBy: qcBy || current.qcBy,
      qcDate: qcDate || current.qcDate,
      workingCondition: workingCondition || current.workingCondition,
      remarks: remarks || current.remarks,
      pendingQty: newPending,
      approvedQty: newApproved,
      rejectedQty: newRejected,
      checklist: Array.from(new Set([...(current.checklist || []), ...(isPassed ? toList(body.checklist) : [])])),
      serialNumbers: [...(current.serialNumbers || []), ...toList(body.serialNumbers)],
      images: [...(current.images || []), ...toList(body.images)],
      rejectType: !isPassed ? (rejectType || current.rejectType) : current.rejectType,
      partName: !isPassed ? (partName || current.partName) : current.partName,
      updatedAt: now,
    })
    .eq('liftNo', liftNo);
  if (updateError) throw updateError;

  return { ok: true, pendingQty: newPending };
}

export default async function handler(req, res) {
  try {
    const admin = getAdmin();
    const action = String(req.query?.action || '');

    if (req.method === 'GET' && !action) return res.status(200).json(await listData(admin));
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
