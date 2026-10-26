import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, RefreshCw, Eye, ClipboardCheck } from 'lucide-react';
import ModalWrapper from '../../components/ModalWrapper';
import { StatusTabs, FilterSearch, FilterChips, DataTable, StatusBadge } from '../../components/shared';
import formatDate from '../../utils/formatDate';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { pfmsSupabase } from '../../lib/supabase/pfmsClient';
import { useDebounced, PAGE_SIZES } from '../../hooks/use-stage-list';

// Storage: pfms-purchase-fms bucket lives in the PFMS production project
// (zpkikvgmmbtekbcuqahf), not the LTO project. Uploads use one-time signed
// URLs minted by /api/material-testing (the anon key can't write to it).

// Shrinks phone photos before upload (they go straight to Storage via a signed
// URL, so this is about storage/bandwidth, not the Vercel body limit). Resizes
// to max 1600px on the long side and re-encodes as JPEG. Falls back to the
// original file if anything fails or the result isn't smaller.
const MAX_IMAGE_DIM = 1600;
const JPEG_QUALITY = 0.8;
async function compressImage(file) {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

async function apiRequest(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function SearchableSrnDropdown({ value, onChange, options, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = React.useRef(null);

  useEffect(() => { setSearch(value); }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return options;
    return options.filter((opt) => opt.toLowerCase().includes(term));
  }, [options, search]);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        placeholder={placeholder}
        className="block w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all h-9"
        value={search}
        onChange={(e) => { setSearch(e.target.value); onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        required
      />
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
          {filteredOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors focus:bg-slate-50 focus:outline-none block text-slate-700"
              onClick={() => { onChange(opt); setSearch(opt); setIsOpen(false); }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Pending / History are served page-by-page by /api/material-testing?action=list
// (the PFMS tables are RLS-locked, so a service-role proxy is the only way in). Search,
// the Pending/Completed split (cancelled indents excluded from Pending) and paging run
// there; the browser only ever holds one page.
//
// Row shape reminders (verified against the PFMS production project):
//   - pfms_material-testing is ONE row per lift, created upstream by Purchase-FMS-Supabase
//     only when the lift's qcRequirement = 'yes'. Every QC submission UPDATEs that row in
//     place (pendingQty/approvedQty/rejectedQty accumulate), so this page never inserts.
//   - The row's own pendingQty > 0 is Pending, 0 is Completed.
//   - Damage qty/reason/image and receivedQty come from pfms_material-received via the lift.
export default function MaterialTesting() {
  const queryClient = useQueryClient();
  const [tab, setTabState] = useState('pending');
  const [search, setSearchState] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState(null);
  const debouncedSearch = useDebounced(search, 350);

  const setTab = (t) => { setTabState(t); setPage(1); };
  const setSearch = (v) => { setSearchState(v); setPage(1); };
  const setPageSize = (n) => { setPageSizeState(n); setPage(1); };

  const listQ = useQuery({
    queryKey: ['mt', 'list', tab, page, pageSize, debouncedSearch],
    queryFn: () => apiRequest(`/api/material-testing?${new URLSearchParams({ action: 'list', tab, page, pageSize, search: debouncedSearch })}`),
    placeholderData: keepPreviousData,
  });
  // Dropdown lists are only needed once a QC form opens.
  const dropdownsQ = useQuery({
    queryKey: ['mt', 'dropdowns'],
    queryFn: () => apiRequest('/api/material-testing?action=dropdowns'),
    enabled: !!selectedSale,
    staleTime: 5 * 60_000,
  });

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const counts = listQ.data?.counts;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const reload = useCallback(() => queryClient.invalidateQueries({ queryKey: ['mt'] }), [queryClient]);
  useEffect(() => {
    window.addEventListener('refresh_sales', reload);
    return () => window.removeEventListener('refresh_sales', reload);
  }, [reload]);

  const tabs = [
    { id: 'pending', label: 'Pending', count: counts?.pending },
    { id: 'history', label: 'History', count: counts?.completed },
  ];
  const isPending = tab === 'pending';
  const chips = debouncedSearch ? [{ key: 'search', label: `Search: ${debouncedSearch}`, onRemove: () => setSearch('') }] : [];

  const headers = isPending
    ? [{ label: 'Action', className: 'w-28' }, 'Indent No.', 'Unit Tracking No.', 'Planned', 'Item', 'Received Qty', 'Approved', 'Rejected', 'Pending Qty', 'Damage Qty', 'Reason', 'Image']
    : ['Indent No.', 'Lift No.', 'QC-Date', 'Working Condition', 'Checked By', 'Approved Qty', 'Checklist', 'Serial-No', 'Image', 'Reject Type', 'Part-Name', 'Reject Qty', 'Remarks'];
  const hasValue = (v) => v && v !== '-';
  const detailsBtn = (record, label) => (
    <button
      type="button"
      onClick={() => setSelectedHistoryRecord(record)}
      aria-label={`${label} for indent ${record.data.indentNumber}`}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Eye size={15} aria-hidden="true" />
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs tabs={tabs} activeTab={tab} onChange={setTab} label="Material testing views" />
        <FilterSearch value={search} onChange={setSearch} placeholder="Search indent, lift, item, vendor, PO, invoice..." className="min-w-[220px] flex-1" />
        <button
          type="button"
          onClick={reload}
          disabled={listQ.isFetching}
          aria-label="Refresh"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <FilterChips chips={chips} onClearAll={() => setSearch('')} />

      <div className="min-h-0 flex-1">
        <DataTable
          ariaLabel={isPending ? 'Pending material testing' : 'Material testing history'}
          headers={headers}
          data={rows}
          loading={listQ.isPending}
          error={listQ.error ? listQ.error.message || 'Failed to load' : null}
          onRetry={reload}
          emptyTitle={chips.length ? 'No records match this search' : isPending ? 'No pending QC inspections' : 'No QC history yet'}
          currentPage={page}
          totalPages={totalPages}
          itemsPerPage={pageSize}
          totalResults={total}
          onPageChange={setPage}
          onItemsPerPageChange={setPageSize}
          itemsPerPageOptions={PAGE_SIZES}
          minWidth={isPending ? 'min-w-[1100px]' : 'min-w-[1200px]'}
          renderCard={(record) => (
            <div key={record.id} className="space-y-2 rounded-lg border bg-card p-3 text-xs shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Indent: {record.data.indentNumber}</p>
                  <p className="text-muted-foreground">Lift No: {record.data.liftNo || 'N/A'}</p>
                </div>
                {isPending ? (
                  <button type="button" onClick={() => setSelectedSale(record)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-semibold text-primary-foreground">
                    <ClipboardCheck size={13} aria-hidden="true" />
                    Perform QC
                  </button>
                ) : (
                  <StatusBadge tone={record.data.workingCondition === 'Rejected' ? 'danger' : 'success'}>{record.data.workingCondition}</StatusBadge>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2">
                {isPending ? (
                  <>
                    <div className="col-span-2"><dt className="text-muted-foreground">Item</dt><dd className="font-semibold">{record.data.itemName}</dd></div>
                    <div><dt className="text-muted-foreground">Planned Date</dt><dd className="font-medium">{formatDate(record.data.plan7) || 'N/A'}</dd></div>
                    <div><dt className="text-muted-foreground">Received Qty</dt><dd className="font-semibold">{record.data.receivedQty}</dd></div>
                    <div><dt className="text-muted-foreground">Pending Qty</dt><dd className="font-semibold">{record.data.pendingQty}</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt className="text-muted-foreground">QC Date</dt><dd className="font-medium">{formatDate(record.data.qcDate) || 'N/A'}</dd></div>
                    <div><dt className="text-muted-foreground">Checked By</dt><dd className="font-medium">{record.data.qcBy}</dd></div>
                    <div><dt className="text-muted-foreground">Approved Qty</dt><dd className="font-semibold">{record.data.approvedQty}</dd></div>
                    <div><dt className="text-muted-foreground">Reject Qty</dt><dd className="font-semibold">{record.data.rejectedQty || '0'}</dd></div>
                  </>
                )}
              </dl>
              {!isPending && (hasValue(record.data.checklist) || hasValue(record.data.serialNo)) && (
                <button type="button" onClick={() => setSelectedHistoryRecord(record)} className="text-xs font-semibold text-primary underline">View inspection details</button>
              )}
            </div>
          )}
          renderRow={(record) => (isPending ? (
            <tr key={record.id}>
              <td className="px-3.5 py-2 align-middle">
                <button
                  type="button"
                  onClick={() => setSelectedSale(record)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <ClipboardCheck size={13} aria-hidden="true" />
                  Perform QC
                </button>
              </td>
              <td className="px-3.5 py-2 text-xs text-foreground whitespace-nowrap align-middle">{record.data.indentNumber}</td>
              <td className="px-3.5 py-2 text-xs text-foreground whitespace-nowrap align-middle">{record.data.liftNo}</td>
              <td className="px-3.5 py-2 text-xs text-foreground whitespace-nowrap align-middle">{formatDate(record.data.plan7)}</td>
              <td className="px-3.5 py-2 text-xs font-semibold text-foreground align-middle"><div className="max-w-[360px] truncate" title={record.data.itemName}>{record.data.itemName}</div></td>
              <td className="px-3.5 py-2 text-xs font-semibold text-foreground align-middle">{record.data.receivedQty}</td>
              <td className="px-3.5 py-2 text-xs font-semibold text-success align-middle">{record.data.totalApproved}</td>
              <td className="px-3.5 py-2 text-xs font-semibold text-destructive align-middle">{record.data.totalRejected}</td>
              <td className="px-3.5 py-2 text-xs font-semibold text-foreground align-middle">{record.data.pendingQty}</td>
              <td className="px-3.5 py-2 text-xs text-foreground align-middle">{record.data.damageQty}</td>
              <td className="px-3.5 py-2 text-xs text-foreground align-middle">{record.data.damageReason}</td>
              <td className="px-3.5 py-2 text-xs align-middle">
                {hasValue(record.data.damageImage) ? (
                  <a href={record.data.damageImage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary underline">
                    <FileText size={12} aria-hidden="true" /> View
                  </a>
                ) : '-'}
              </td>
            </tr>
          ) : (
            <tr key={record.id}>
              <td className="px-3.5 py-2 text-xs text-foreground whitespace-nowrap align-middle">{record.data.indentNumber}</td>
              <td className="px-3.5 py-2 text-xs text-foreground whitespace-nowrap align-middle">{record.data.liftNo}</td>
              <td className="px-3.5 py-2 text-xs text-foreground whitespace-nowrap align-middle">{formatDate(record.data.qcDate)}</td>
              <td className="px-3.5 py-2 align-middle"><StatusBadge tone={record.data.workingCondition === 'Rejected' ? 'danger' : 'success'}>{record.data.workingCondition}</StatusBadge></td>
              <td className="px-3.5 py-2 text-xs text-foreground align-middle">{record.data.qcBy}</td>
              <td className="px-3.5 py-2 text-xs font-semibold text-foreground align-middle">{record.data.approvedQty}</td>
              <td className="px-3.5 py-2 text-center align-middle">{hasValue(record.data.checklist) ? detailsBtn(record, 'View checklist') : '-'}</td>
              <td className="px-3.5 py-2 text-center align-middle">{hasValue(record.data.serialNo) ? detailsBtn(record, 'View serial numbers') : '-'}</td>
              <td className="px-3.5 py-2 text-center align-middle">{hasValue(record.data.image) ? detailsBtn(record, 'View photos') : '-'}</td>
              <td className="px-3.5 py-2 text-xs text-foreground align-middle">{record.data.rejectType || '-'}</td>
              <td className="px-3.5 py-2 text-xs text-foreground align-middle">{record.data.partName || '-'}</td>
              <td className="px-3.5 py-2 text-xs font-semibold text-destructive align-middle">{record.data.rejectedQty || '0'}</td>
              <td className="px-3.5 py-2 text-xs text-muted-foreground align-middle"><div className="max-w-[150px] truncate" title={record.data.remarks}>{record.data.remarks || '-'}</div></td>
            </tr>
          ))}
        />
      </div>

      {selectedSale && (
        <QCFormModal
          isOpen
          onClose={() => setSelectedSale(null)}
          record={selectedSale}
          onSave={reload}
          qcEngineerList={dropdownsQ.data?.engineers || []}
          checklistList={dropdownsQ.data?.checklist || []}
          rejectTypeList={dropdownsQ.data?.rejectTypes || []}
        />
      )}

      {selectedHistoryRecord && (
        <ModalWrapper isOpen onClose={() => setSelectedHistoryRecord(null)} title="Inspection Details" maxWidth="max-w-md">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Indent No</span><span className="text-xs font-bold text-slate-800">{selectedHistoryRecord.data.indentNumber}</span></div>
              <div><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Lift No</span><span className="text-xs font-bold text-slate-800">{selectedHistoryRecord.data.liftNo}</span></div>
              <div><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">QC Date</span><span className="text-xs font-medium text-slate-800">{formatDate(selectedHistoryRecord.data.qcDate)}</span></div>
              <div><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Checked By</span><span className="text-xs font-medium text-slate-800">{selectedHistoryRecord.data.qcBy}</span></div>
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">QC Checklist</h4>
              {hasValue(selectedHistoryRecord.data.checklist) ? (
                <div className="flex flex-wrap gap-1.5">{selectedHistoryRecord.data.checklist.split(',').map((item, i) => (<span key={i} className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">✓ {item.trim()}</span>))}</div>
              ) : (<span className="text-xs italic text-slate-500">No checklist recorded</span>)}
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Serial Numbers & Photos</h4>
              <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                {hasValue(selectedHistoryRecord.data.serialNo) ? (
                  (() => {
                    const serials = String(selectedHistoryRecord.data.serialNo).split(',').map((s) => s.trim()).filter(Boolean);
                    const images = hasValue(selectedHistoryRecord.data.image) ? String(selectedHistoryRecord.data.image).split(',').map((i) => i.trim()).filter(Boolean) : [];
                    return serials.map((serial, idx) => {
                      const imageUrl = images[idx] || '';
                      return (
                        <div key={idx} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                          <span className="text-xs font-semibold text-slate-500">#{idx + 1}</span>
                          {imageUrl ? (<a href={imageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-sm transition-all hover:bg-slate-50 hover:underline"><FileText size={12} aria-hidden="true" />{serial}</a>) : (<span className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{serial}</span>)}
                        </div>
                      );
                    });
                  })()
                ) : (<span className="text-xs italic text-slate-500">No serial numbers recorded</span>)}
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setSelectedHistoryRecord(null)} className="rounded-xl bg-slate-100 px-5 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200">Close</button>
          </div>
        </ModalWrapper>
      )}
    </div>
  );
}

function QCFormModal({ isOpen, onClose, record, onSave, qcEngineerList, checklistList, rejectTypeList }) {
  const [qcBy, setQcBy] = useState('');
  const [qcDate, setQcDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [workingCondition, setWorkingCondition] = useState('');
  const [approvedQty, setApprovedQty] = useState('');
  const [checklistSelected, setChecklistSelected] = useState([]);
  const [rejectType, setRejectType] = useState('');
  const [partName, setPartName] = useState('');
  const [rejectQty, setRejectQty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [srnEntries, setSrnEntries] = useState([]);
  const [rejectSrnEntries, setRejectSrnEntries] = useState([]);
  const [serialNoList, setSerialNoList] = useState([]);
  const [serialsLoading, setSerialsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (record) {
      setSerialsLoading(true);
      const cleanLift = String(record.data.liftNo || '').trim();
      apiRequest(`/api/material-testing?action=serials&liftNo=${encodeURIComponent(cleanLift)}`)
        .then(({ serials }) => setSerialNoList(serials || []))
        .catch((err) => console.error('Error loading serials:', err))
        .finally(() => setSerialsLoading(false));
      setQcBy(''); setWorkingCondition(''); setApprovedQty('');
      setChecklistSelected([]); setRejectType(''); setPartName('');
      setRejectQty(''); setRemarks(''); setSrnEntries([]); setRejectSrnEntries([]);
    }
  }, [record]);

  if (!record) return null;

  const isFormValid = (() => {
    if (!qcDate || !workingCondition) return false;
    const isPassed = workingCondition === 'Passed' || workingCondition === 'Passed but Quality Concern';
    if (isPassed) return !!(qcBy && approvedQty && parseInt(approvedQty) > 0 && checklistSelected.length > 0 && srnEntries.length > 0 && srnEntries.every((e) => e.srn.trim() !== ''));
    if (workingCondition === 'Rejected') return !!(rejectType && partName && rejectQty && parseInt(rejectQty) > 0 && rejectSrnEntries.length > 0 && rejectSrnEntries.every((e) => e.srn.trim() !== ''));
    return false;
  })();

  const uploadImage = async (originalFile, prefix) => {
    const file = await compressImage(originalFile);
    const { bucket, path, token, publicUrl } = await apiRequest('/api/material-testing?action=upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, fileName: file.name }),
    });
    const { error } = await pfmsSupabase.storage.from(bucket).uploadToSignedUrl(path, token, file);
    if (error) throw error;
    return publicUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const isPassed = workingCondition === 'Passed' || workingCondition === 'Passed but Quality Concern';
      let serialNosArr = [];
      let imageUrlsArr = [];
      const entries = isPassed ? srnEntries : (workingCondition === 'Rejected' ? rejectSrnEntries : []);
      const prefix = isPassed ? 'SRN' : 'REJECT';
      if (entries.length > 0) {
        const srnData = await Promise.all(entries.map(async (entry) => {
          let imageUrl = '';
          if (entry.image instanceof File) imageUrl = await uploadImage(entry.image, `${prefix}_${entry.serialNo}`);
          return { srn: entry.srn, image: imageUrl };
        }));
        serialNosArr = srnData.map((d) => d.srn).filter(Boolean);
        imageUrlsArr = srnData.map((d) => d.image).filter(Boolean);
      }

      // The server UPDATEs the lift's single pfms_material-testing row in place
      // (accumulating qty/arrays) — see api/material-testing.js submitQc().
      const { pendingQty: newPending } = await apiRequest('/api/material-testing?action=submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liftNo: record.data.liftNo,
          qcBy,
          qcDate,
          workingCondition,
          remarks,
          approvedQty: isPassed ? approvedQty : 0,
          rejectQty: isPassed ? 0 : rejectQty,
          checklist: isPassed ? checklistSelected : [],
          serialNumbers: serialNosArr,
          images: imageUrlsArr,
          rejectType,
          partName,
        }),
      });

      if (newPending <= 0) {
        toast.success('QC Inspection Complete — all quantity resolved!');
      } else {
        toast.success('QC Entry saved successfully.');
      }
      onSave(); onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'block w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all';
  const labelCls = 'text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1 block';

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={`QC inspection: Indent ${record.data.indentNumber}`} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-[10px] font-semibold text-slate-600 block">Item</span><span className="font-bold text-slate-700 truncate block">{record.data.itemName}</span></div>
          <div><span className="text-[10px] font-semibold text-slate-600 block">Vendor</span><span className="font-bold text-slate-700 truncate block">{record.data.vendorName}</span></div>
          <div><span className="text-[10px] font-semibold text-slate-600 block">Tracking No.</span><span className="font-semibold text-slate-600 truncate block">{record.data.liftNo}</span></div>
          <div><span className="text-[10px] font-semibold text-slate-600 block">Pending Qty</span><span className="font-bold text-indigo-600">{record.data.pendingQty} of {record.data.receivedQty}</span></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="qc-date" className={labelCls}>QC-Date *</label>
            <input id="qc-date" type="date" value={qcDate} onChange={(e) => setQcDate(e.target.value)} required className={`${inputCls} cursor-pointer`} />
          </div>
          <div>
            <label htmlFor="qc-by" className={labelCls}>Checked By *</label>
            <select id="qc-by" value={qcBy} onChange={(e) => setQcBy(e.target.value)} required={workingCondition !== 'Rejected'} className={inputCls}>
              <option value="">Select Inspector</option>
              {qcEngineerList.map((name, idx) => (<option key={idx} value={name}>{name}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="qc-condition" className={labelCls}>Working Condition *</label>
            <select id="qc-condition" value={workingCondition} onChange={(e) => setWorkingCondition(e.target.value)} required className={inputCls}>
              <option value="">Select Condition</option>
              <option value="Passed">Passed</option>
              <option value="Passed but Quality Concern">Passed but Quality Concern</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        {(workingCondition === 'Passed' || workingCondition === 'Passed but Quality Concern') && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="qc-approved-qty" className={labelCls}>Approved Qty *</label>
                <input
                  id="qc-approved-qty"
                  type="number"
                  min="1"
                  max={record.data.pendingQty}
                  required
                  placeholder={`Pending: ${record.data.pendingQty}`}
                  value={approvedQty}
                  onChange={(e) => {
                    const validQty = Math.min(Math.max(0, parseInt(e.target.value) || 0), record.data.pendingQty);
                    setApprovedQty(validQty ? String(validQty) : '');
                    setSrnEntries(Array.from({ length: validQty }, (_, i) => ({ serialNo: i + 1, srn: srnEntries[i]?.srn || '', image: srnEntries[i]?.image || null })));
                  }}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Checklist *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 border border-slate-200 p-3.5 rounded-xl max-h-[140px] overflow-y-auto">
                {checklistList.map((item) => (
                  <div key={item} className="flex items-start gap-2.5 py-0.5">
                    <input type="checkbox" id={`checklist-${item}`} checked={checklistSelected.includes(item)} onChange={() => setChecklistSelected((prev) => prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item])} className="mt-0.5 h-3.5 w-3.5 text-indigo-600 border-slate-350 rounded cursor-pointer" />
                    <label htmlFor={`checklist-${item}`} className="text-xs text-slate-600 cursor-pointer select-none leading-tight">{item}</label>
                  </div>
                ))}
              </div>
            </div>
            {srnEntries.length > 0 && (
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-3">
                <span className="text-xs font-bold text-slate-700">Approved Item Serial Numbers & Photos {serialsLoading && <span className="text-slate-600 font-normal">(loading serials...)</span>}</span>
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {srnEntries.map((entry, idx) => (
                    <div key={entry.serialNo} className="grid grid-cols-12 gap-3 items-center bg-white p-2.5 rounded-xl border border-slate-100">
                      <div className="col-span-1 text-xs font-bold text-slate-600">#{entry.serialNo}</div>
                      <div className="col-span-5 relative"><SearchableSrnDropdown value={entry.srn} onChange={(val) => { const u = [...srnEntries]; u[idx] = { ...u[idx], srn: val }; setSrnEntries(u); }} options={serialNoList} placeholder="Search/Select SRN" /></div>
                      <div className="col-span-6 flex items-center gap-2">
                        <div className="flex-1">
                          <input type="file" accept="image/*" id={`srn-image-${idx}`} className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; const u = [...srnEntries]; u[idx] = { ...u[idx], image: f }; setSrnEntries(u); }} />
                          <label htmlFor={`srn-image-${idx}`} className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-xl cursor-pointer transition-all h-9 text-xs font-semibold ${entry.image ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><FileText size={12} /><span className="truncate max-w-[120px]">{entry.image ? entry.image.name : 'Photo'}</span></label>
                        </div>
                        {entry.image && (<button type="button" onClick={() => { const u = [...srnEntries]; u[idx] = { ...u[idx], image: null }; setSrnEntries(u); }} className="text-slate-600 hover:text-rose-500 font-bold p-1">✕</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {workingCondition === 'Rejected' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="qc-reject-type" className={labelCls}>Reject Type *</label>
                <select id="qc-reject-type" value={rejectType} onChange={(e) => setRejectType(e.target.value)} required className={inputCls}>
                  <option value="">Select type</option>
                  {rejectTypeList.map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
              </div>
              <div><label htmlFor="qc-part-name" className={labelCls}>Part-Name *</label><input id="qc-part-name" type="text" placeholder="Enter part name" value={partName} onChange={(e) => setPartName(e.target.value)} required className={inputCls} /></div>
              <div>
                <label htmlFor="qc-reject-qty" className={labelCls}>Reject Qty *</label>
                <input
                  id="qc-reject-qty"
                  type="number"
                  min="1"
                  max={record.data.pendingQty}
                  required
                  placeholder={`Pending: ${record.data.pendingQty}`}
                  value={rejectQty}
                  onChange={(e) => {
                    const validQty = Math.min(Math.max(0, parseInt(e.target.value) || 0), record.data.pendingQty);
                    setRejectQty(validQty ? String(validQty) : '');
                    setRejectSrnEntries(Array.from({ length: validQty }, (_, i) => ({ serialNo: i + 1, srn: rejectSrnEntries[i]?.srn || '', image: rejectSrnEntries[i]?.image || null })));
                  }}
                  className={inputCls}
                />
              </div>
            </div>
            {rejectSrnEntries.length > 0 && (
              <div className="bg-rose-50/20 border border-rose-150 p-4 rounded-xl space-y-3">
                <span className="text-xs font-bold text-rose-800">Rejected Item Serial Numbers & Photos {serialsLoading && <span className="text-rose-400 font-normal">(loading serials...)</span>}</span>
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {rejectSrnEntries.map((entry, idx) => (
                    <div key={entry.serialNo} className="grid grid-cols-12 gap-3 items-center bg-white p-2.5 rounded-xl border border-slate-100">
                      <div className="col-span-1 text-xs font-bold text-slate-600">#{entry.serialNo}</div>
                      <div className="col-span-5 relative"><SearchableSrnDropdown value={entry.srn} onChange={(val) => { const u = [...rejectSrnEntries]; u[idx] = { ...u[idx], srn: val }; setRejectSrnEntries(u); }} options={serialNoList} placeholder="Search/Select SRN" /></div>
                      <div className="col-span-6 flex items-center gap-2">
                        <div className="flex-1">
                          <input type="file" accept="image/*" id={`reject-srn-image-${idx}`} className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; const u = [...rejectSrnEntries]; u[idx] = { ...u[idx], image: f }; setRejectSrnEntries(u); }} />
                          <label htmlFor={`reject-srn-image-${idx}`} className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-xl cursor-pointer transition-all h-9 text-xs font-semibold ${entry.image ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><FileText size={12} /><span className="truncate max-w-[120px]">{entry.image ? entry.image.name : 'Photo'}</span></label>
                        </div>
                        {entry.image && (<button type="button" onClick={() => { const u = [...rejectSrnEntries]; u[idx] = { ...u[idx], image: null }; setRejectSrnEntries(u); }} className="text-slate-600 hover:text-rose-500 font-bold p-1">✕</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="qc-remarks" className={labelCls}>{workingCondition === 'Passed but Quality Concern' ? 'Concern Issue' : 'Remarks'}</label>
          <textarea id="qc-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={workingCondition === 'Passed but Quality Concern' ? 'Explain concern details...' : 'Enter remarks...'} rows={3} className={`${inputCls} resize-none`} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
          <button type="submit" disabled={submitting || !isFormValid} className="px-6 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-all shadow-sm flex items-center gap-2">
            {submitting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Finalize Quality Report'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}
