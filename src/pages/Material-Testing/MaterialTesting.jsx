import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  FileText,
  RefreshCw,
  Eye,
  ClipboardCheck
} from 'lucide-react';
import TableWrapper from '../../components/TableWrapper';
import ModalWrapper from '../../components/ModalWrapper';
import formatDate from '../../utils/formatDate';
import toast from 'react-hot-toast';
import { pfmsSupabase } from '../../lib/supabase/pfmsClient';

// Storage: pfms-purchase-fms bucket lives in the PFMS production project
// (zpkikvgmmbtekbcuqahf), not the LTO project.
const PFMS_STORAGE_BUCKET = 'pfms-purchase-fms';
const PFMS_STORAGE_FOLDER = 'general';

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

export default function MaterialTesting() {
  const [activeTab, setActiveTab] = useState('pending');
  const [sheetRecords, setSheetRecords] = useState([]);
  const [partialQCRecords, setPartialQCRecords] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [qcEngineerList, setQcEngineerList] = useState([]);
  const [checklistList, setChecklistList] = useState([]);
  const [rejectTypeList, setRejectTypeList] = useState([]);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState(null);

  // Real schema (verified live against the PFMS production project,
  // 2026-09-02 — see [[material-testing-migration]] memory):
  //   - pfms_dropdown is a WIDE table (named columns, not category/value) —
  //     "Checked By" / "QC-Checklist" / "Reject Type (QC)", values scattered
  //     across many rows.
  //   - pfms_material-testing uses camelCase columns; checklist/serialNumbers
  //     /images are real Postgres arrays (text[]), not comma-joined strings.
  //     `id` has no DB default — the client must generate one.
  //   - pfms_view-receiving_accounts (a big multi-table join) exposes
  //     `indent_no` (not indent_number). Its planned_stage11/actual_stage11
  //     columns come from pfms_material-received.plannedMaterialTesting and
  //     the LATEST pfms_material-testing row's timestamp — NOT stage8 (that
  //     pair is Tally Entry, a different stage). actual_stage11 flips the
  //     moment ANY testing row exists for a lift, even a partial one, so
  //     completion here is computed from cumulative qty instead
  //     (pendingQty <= 0), matching the "partial QC across multiple
  //     submissions" workflow.
  //   - Damage qty/reason/image live on pfms_material-received (camelCase:
  //     damagedQty/damageReason/damageImage), not on the view.
  //   - pfms_serial-number's columns are `liftNo`/`serialNo` (camelCase).
  const loadSales = async () => {
    setFetchLoading(true);
    try {
      const { data: dropRows, error: dropError } = await pfmsSupabase
        .from('pfms_dropdown')
        .select('"Checked By","QC-Checklist","Reject Type (QC)"');
      if (dropError) throw dropError;
      if (dropRows) {
        setQcEngineerList([...new Set(dropRows.map((r) => r['Checked By']).filter(Boolean))]);
        setChecklistList([...new Set(dropRows.map((r) => r['QC-Checklist']).filter(Boolean))]);
        setRejectTypeList([...new Set(dropRows.map((r) => r['Reject Type (QC)']).filter(Boolean))]);
      }

      const { data: qcRows, error: qcError } = await pfmsSupabase
        .from('pfms_material-testing')
        .select('*')
        .order('createdAt', { ascending: false });
      if (qcError) throw qcError;

      const approvedMap = new Map();
      const rejectedMap = new Map();
      if (qcRows) {
        setPartialQCRecords(qcRows);
        qcRows.forEach((r) => {
          const liftNo = String(r.liftNo || '').trim().toLowerCase();
          if (!liftNo) return;
          approvedMap.set(liftNo, (approvedMap.get(liftNo) || 0) + (parseFloat(r.approvedQty || 0)));
          rejectedMap.set(liftNo, (rejectedMap.get(liftNo) || 0) + (parseFloat(r.rejectedQty || 0)));
        });
      }

      const { data: receivedRows, error: receivedError } = await pfmsSupabase
        .from('pfms_material-received')
        .select('"liftNo","damagedQty","damageReason","damageImage"');
      if (receivedError) throw receivedError;

      const receivedByLift = new Map(
        (receivedRows || []).map((r) => [String(r.liftNo || '').trim().toLowerCase(), r])
      );

      const { data: receivingRows, error: receivingError } = await pfmsSupabase
        .from('pfms_view-receiving_accounts')
        .select('indent_no, lift_no, item_name, vendor_name, po_number, invoice_number, received_qty, planned_stage11');
      if (receivingError) throw receivingError;

      if (receivingRows) {
        const rows = receivingRows
          .filter((row) => row.indent_no && String(row.indent_no).trim() !== '')
          .map((row) => {
            const liftNo = String(row.lift_no || '').trim().toLowerCase();
            const receivedQty = parseFloat(row.received_qty || 0);
            const totalApproved = approvedMap.get(liftNo) || 0;
            const totalRejected = rejectedMap.get(liftNo) || 0;
            const pendingQty = Math.max(0, receivedQty - (totalApproved + totalRejected));
            const received = receivedByLift.get(liftNo);
            let status = 'not_ready';
            if (row.planned_stage11) {
              status = pendingQty > 0 ? 'pending' : 'completed';
            }
            return {
              id: `${row.indent_no}_${row.lift_no || ''}`,
              liftNo: row.lift_no || '',
              status,
              data: {
                indentNumber: String(row.indent_no || '').trim(),
                liftNo: String(row.lift_no || ''),
                vendorName: String(row.vendor_name || ''),
                poNumber: String(row.po_number || ''),
                itemName: String(row.item_name || ''),
                invoiceNumber: String(row.invoice_number || '-'),
                receivedQty,
                plan7: row.planned_stage11 || '',
                totalApproved,
                totalRejected,
                pendingQty,
                damageQty: received?.damagedQty || '0',
                damageReason: received?.damageReason || '-',
                damageImage: received?.damageImage || '',
              },
            };
          });
        setSheetRecords(rows);
      }
    } catch (error) {
      console.error('Error loading Material Testing data:', error);
      toast.error('Failed to load live data');
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
    const handleRefresh = () => loadSales();
    window.addEventListener('refresh_sales', handleRefresh);
    return () => window.removeEventListener('refresh_sales', handleRefresh);
  }, []);

  const pending = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return sheetRecords.filter((r) => {
      if (r.status !== 'pending') return false;
      if (!searchLower) return true;
      return (
        r.data.indentNumber?.toLowerCase().includes(searchLower) ||
        r.data.liftNo?.toLowerCase().includes(searchLower) ||
        r.data.itemName?.toLowerCase().includes(searchLower) ||
        r.data.vendorName?.toLowerCase().includes(searchLower) ||
        String(r.data.poNumber || '').toLowerCase().includes(searchLower) ||
        String(r.data.invoiceNumber || '').toLowerCase().includes(searchLower)
      );
    });
  }, [sheetRecords, searchTerm]);

  const history = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return partialQCRecords
      .filter((pRow) => pRow.liftNo && String(pRow.liftNo).trim() !== '')
      .map((pRow, idx) => {
        const liftNo = String(pRow.liftNo || '').trim().toLowerCase();
        const parentRecord = sheetRecords.find((r) => String(r.data.liftNo || '').trim().toLowerCase() === liftNo);
        const parentData = parentRecord?.data ?? {};
        const parentStatus = parentRecord?.status ?? 'not_ready';
        const checklistArr = Array.isArray(pRow.checklist) ? pRow.checklist : [];
        const serialArr = Array.isArray(pRow.serialNumbers) ? pRow.serialNumbers : [];
        const imageArr = Array.isArray(pRow.images) ? pRow.images : [];
        return {
          id: `partial-${pRow.id}-${idx}`,
          parentStatus,
          data: {
            indentNumber: parentData.indentNumber || '-',
            vendorName: parentData.vendorName || '-',
            invoiceNumber: parentData.invoiceNumber || '-',
            itemName: parentData.itemName || '-',
            plan7: parentData.plan7 || '-',
            actual7: pRow.createdAt || '-',
            qcDate: pRow.qcDate || '-',
            qcBy: pRow.qcBy || '-',
            approvedQty: pRow.approvedQty || '0',
            rejectedQty: pRow.rejectedQty || '0',
            workingCondition: pRow.workingCondition || '-',
            remarks: pRow.remarks || '-',
            damageQty: parentData.damageQty || '-',
            damageReason: parentData.damageReason || '-',
            damageImage: parentData.damageImage || '',
            liftNo: pRow.liftNo || '-',
            checklist: checklistArr.length > 0 ? checklistArr.join(', ') : '-',
            serialNo: serialArr.length > 0 ? serialArr.join(', ') : '-',
            image: imageArr.length > 0 ? imageArr.join(' , ') : '-',
            rejectType: pRow.rejectType || '-',
            partName: pRow.partName || '-',
          },
        };
      })
      .filter((rec) => {
        if (rec.parentStatus !== 'completed') return false;
        if (!searchLower) return true;
        return (
          rec.data.indentNumber?.toLowerCase().includes(searchLower) ||
          rec.data.liftNo?.toLowerCase().includes(searchLower) ||
          rec.data.vendorName?.toLowerCase().includes(searchLower) ||
          rec.data.itemName?.toLowerCase().includes(searchLower)
        );
      })
      .reverse();
  }, [partialQCRecords, sheetRecords, searchTerm]);

  const activeRecords = activeTab === 'pending' ? pending : history;

  return (
    <div className="space-y-5 flex-1 flex flex-col min-h-0 overflow-hidden pr-1">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
        <div className="flex border border-slate-250 bg-slate-50/50 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'pending' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
          >
            History ({history.length})
          </button>
        </div>
        <div className="flex items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input type="text" placeholder="Search records..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-10 pr-3 py-1.5 text-xs bg-slate-50/50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all" />
          </div>
          <button onClick={loadSales} disabled={fetchLoading} className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors">
            <RefreshCw className={`h-4 w-4 ${fetchLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-between gap-4">
        <TableWrapper
          headers={activeTab === 'pending' ? ['Action', 'Indent No.', 'Unit Tracking No.', 'Planned', 'Item', 'Received Qty', 'Approved', 'Rejected', 'Pending Qty', 'Damage Qty', 'Reason', 'Image'] : ['Indent No.', 'Lift No.', 'QC-Date', 'Working Condition', 'Checked By', 'Approved Qty', 'Checklist', 'Serial-No', 'Image', 'Reject Type', 'Part-Name', 'Reject Qty', 'Remarks']}
          data={activeRecords}
          emptyMessage={fetchLoading ? (
            <div className="flex items-center justify-center flex-col py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
              <p className="mt-2 text-xs text-slate-500 font-medium">Loading records...</p>
            </div>
          ) : 'No entries found.'}
          renderCard={(record) => {
            if (activeTab === 'pending') {
              return (
                <div key={record.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 relative border-l-4 border-l-blue-500">
                  <div className="absolute top-4 right-4">
                    <button onClick={() => setSelectedSale(record)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">Perform QC</button>
                  </div>
                  <div className="pr-24">
                    <h3 className="font-bold text-slate-800 text-sm">Indent: {record.data.indentNumber}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Lift No: {record.data.liftNo || 'N/A'}</p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="text-xs"><p className="text-slate-500 font-medium">Item Name</p><p className="text-slate-800 font-semibold">{record.data.itemName}</p></div>
                    <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                      <div><p className="text-slate-500 font-medium">Planned Date</p><p className="text-slate-800">{formatDate(record.data.plan7) || 'N/A'}</p></div>
                      <div><p className="text-slate-500 font-medium">Received Qty</p><p className="text-slate-800 font-semibold">{record.data.receivedQty}</p></div>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={record.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 relative border-l-4 border-l-emerald-500">
                <div className="pr-4"><h3 className="font-bold text-slate-800 text-sm">Indent: {record.data.indentNumber}</h3><p className="text-xs text-slate-500 mt-0.5">Lift No: {record.data.liftNo || 'N/A'}</p></div>
                <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-slate-500 font-medium">QC Date</p><p className="text-slate-800">{formatDate(record.data.qcDate) || 'N/A'}</p></div>
                  <div><p className="text-slate-500 font-medium">Condition</p><span className="inline-block px-2 py-0.5 rounded-full font-semibold border text-xs bg-slate-50 text-slate-700 border-slate-200">{record.data.workingCondition}</span></div>
                </div>
              </div>
            );
          }}
          renderRow={(record) => {
            if (activeTab === 'pending') {
              return (
                <tr key={record.id} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-5 py-3.5"><button onClick={() => setSelectedSale(record)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">Perform QC</button></td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{record.data.indentNumber}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{record.data.liftNo}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{formatDate(record.data.plan7)}</td>
                  <td className="px-5 py-3.5 text-xs font-bold text-slate-700 min-w-[500px]">{record.data.itemName}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 font-semibold">{record.data.receivedQty}</td>
                  <td className="px-5 py-3.5 text-xs text-emerald-600 font-bold">{record.data.totalApproved}</td>
                  <td className="px-5 py-3.5 text-xs text-rose-600 font-bold">{record.data.totalRejected}</td>
                  <td className="px-5 py-3.5 text-xs font-bold text-slate-800">{record.data.pendingQty}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">{record.data.damageQty}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">{record.data.damageReason}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">{record.data.damageImage && record.data.damageImage !== '-' && record.data.damageImage !== '' ? (<a href={record.data.damageImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1"><FileText size={12} /> View</a>) : '-'}</td>
                </tr>
              );
            }
            return (
              <tr key={record.id} className="hover:bg-indigo-50/30 transition-colors">
                <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{record.data.indentNumber}</td>
                <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{record.data.liftNo}</td>
                <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{formatDate(record.data.qcDate)}</td>
                <td className="px-5 py-3.5 text-xs"><span className="px-2 py-0.5 rounded-full font-semibold border bg-slate-50 text-slate-700 border-slate-200">{record.data.workingCondition}</span></td>
                <td className="px-5 py-3.5 text-xs text-slate-600">{record.data.qcBy}</td>
                <td className="px-5 py-3.5 text-xs font-semibold text-slate-700">{record.data.approvedQty}</td>
                <td className="px-5 py-3.5 text-center">{record.data.checklist && record.data.checklist !== '-' ? (<button onClick={() => { setSelectedHistoryRecord(record); setHistoryDialogOpen(true); }} className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-slate-100"><Eye size={15} /></button>) : '-'}</td>
                <td className="px-5 py-3.5 text-center">{record.data.serialNo && record.data.serialNo !== '-' ? (<button onClick={() => { setSelectedHistoryRecord(record); setHistoryDialogOpen(true); }} className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-slate-100"><Eye size={15} /></button>) : '-'}</td>
                <td className="px-5 py-3.5 text-center">{record.data.image && record.data.image !== '-' ? (<button onClick={() => { setSelectedHistoryRecord(record); setHistoryDialogOpen(true); }} className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-slate-100"><Eye size={15} /></button>) : '-'}</td>
                <td className="px-5 py-3.5 text-xs text-slate-600">{record.data.rejectType || '-'}</td>
                <td className="px-5 py-3.5 text-xs text-slate-600">{record.data.partName || '-'}</td>
                <td className="px-5 py-3.5 text-xs font-semibold text-rose-600">{record.data.rejectedQty || '0'}</td>
                <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[150px] truncate" title={record.data.remarks}>{record.data.remarks || '-'}</td>
              </tr>
            );
          }}
        />
      </div>

      {selectedSale && (
        <QCFormModal isOpen={!!selectedSale} onClose={() => setSelectedSale(null)} record={selectedSale} onSave={loadSales} qcEngineerList={qcEngineerList} checklistList={checklistList} rejectTypeList={rejectTypeList} />
      )}

      {historyDialogOpen && selectedHistoryRecord && (
        <ModalWrapper isOpen={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} title="Inspection Details" maxWidth="max-w-md">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Indent No</span><span className="text-xs font-bold text-slate-800">{selectedHistoryRecord.data.indentNumber}</span></div>
              <div><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Lift No</span><span className="text-xs font-bold text-slate-800">{selectedHistoryRecord.data.liftNo}</span></div>
              <div><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">QC Date</span><span className="text-xs font-medium text-slate-850">{formatDate(selectedHistoryRecord.data.qcDate)}</span></div>
              <div><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Checked By</span><span className="text-xs font-medium text-slate-850">{selectedHistoryRecord.data.qcBy}</span></div>
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">QC Checklist</h4>
              {selectedHistoryRecord.data.checklist && selectedHistoryRecord.data.checklist !== '-' ? (
                <div className="flex flex-wrap gap-1.5">{selectedHistoryRecord.data.checklist.split(',').map((item, i) => (<span key={i} className="text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full">✓ {item.trim()}</span>))}</div>
              ) : (<span className="text-xs text-slate-400 italic">No checklist recorded</span>)}
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Serial Numbers & Photos</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {selectedHistoryRecord.data.serialNo && selectedHistoryRecord.data.serialNo !== '-' ? (
                  (() => {
                    const serials = String(selectedHistoryRecord.data.serialNo).split(',').map((s) => s.trim()).filter(Boolean);
                    const images = selectedHistoryRecord?.data?.image && selectedHistoryRecord.data.image !== '-' ? String(selectedHistoryRecord.data.image).split(',').map((i) => i.trim()).filter(Boolean) : [];
                    return serials.map((serial, idx) => {
                      const imageUrl = images[idx] || '';
                      return (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                          <span className="text-xs font-semibold text-slate-400">#{idx + 1}</span>
                          {imageUrl ? (<a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-slate-200 shadow-sm transition-all hover:bg-slate-50"><FileText size={12} className="text-blue-500" />{serial}</a>) : (<span className="text-xs text-slate-600 font-medium bg-white px-2.5 py-1 rounded border border-slate-200">{serial}</span>)}
                        </div>
                      );
                    });
                  })()
                ) : (<span className="text-xs text-slate-400 italic">No serial numbers recorded</span>)}
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-4 border-t border-slate-100 mt-5">
            <button onClick={() => setHistoryDialogOpen(false)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all">Close</button>
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
      pfmsSupabase
        .from('pfms_serial-number')
        .select('"serialNo"')
        .eq('liftNo', cleanLift)
        .then(({ data, error }) => {
          if (!error && data) {
            setSerialNoList(data.map((r) => String(r.serialNo || '').trim()).filter(Boolean));
          }
          setSerialsLoading(false);
        })
        .catch((err) => { console.error('Error loading serials:', err); setSerialsLoading(false); });
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

  const uploadImage = async (file, prefix) => {
    const ext = file.name.split('.').pop();
    const path = `${PFMS_STORAGE_FOLDER}/${prefix}_${Date.now()}.${ext}`;
    const { error } = await pfmsSupabase.storage.from(PFMS_STORAGE_BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    const { data: urlData } = pfmsSupabase.storage.from(PFMS_STORAGE_BUCKET).getPublicUrl(path);
    return urlData.publicUrl || '';
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

      // pfms_material-testing.id has no DB default — this app has to
      // generate one itself.
      const newId = (crypto.randomUUID && crypto.randomUUID()) || `mt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const { error: insertError } = await pfmsSupabase.from('pfms_material-testing').insert({
        id: newId,
        liftNo: record.data.liftNo || '',
        qcDate,
        workingCondition,
        qcBy: qcBy || null,
        approvedQty: isPassed ? (parseFloat(approvedQty) || 0) : 0,
        checklist: isPassed ? checklistSelected : [],
        serialNumbers: serialNosArr,
        images: imageUrlsArr,
        rejectType: workingCondition === 'Rejected' ? rejectType : null,
        partName: workingCondition === 'Rejected' ? partName : null,
        rejectedQty: workingCondition === 'Rejected' ? (parseFloat(rejectQty) || 0) : 0,
        remarks: remarks || null,
      });
      if (insertError) throw insertError;

      const receivedQty = parseFloat(record.data.receivedQty || 0);
      const currentResolved = (record.data.totalApproved || 0) + (record.data.totalRejected || 0);
      const changeQty = isPassed ? parseFloat(approvedQty || 0) : parseFloat(rejectQty || 0);
      if (currentResolved + changeQty >= receivedQty) {
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
  const labelCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block';

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={`QC inspection: Indent ${record.data.indentNumber}`} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-[10px] font-semibold text-slate-400 block">Item</span><span className="font-bold text-slate-700 truncate block">{record.data.itemName}</span></div>
          <div><span className="text-[10px] font-semibold text-slate-400 block">Vendor</span><span className="font-bold text-slate-700 truncate block">{record.data.vendorName}</span></div>
          <div><span className="text-[10px] font-semibold text-slate-400 block">Tracking No.</span><span className="font-semibold text-slate-600 truncate block">{record.data.liftNo}</span></div>
          <div><span className="text-[10px] font-semibold text-slate-400 block">Pending Qty</span><span className="font-bold text-indigo-600">{record.data.pendingQty} of {record.data.receivedQty}</span></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>QC-Date *</label>
            <input type="date" value={qcDate} onChange={(e) => setQcDate(e.target.value)} required className={`${inputCls} cursor-pointer`} />
          </div>
          <div>
            <label className={labelCls}>Checked By *</label>
            <select value={qcBy} onChange={(e) => setQcBy(e.target.value)} required={workingCondition !== 'Rejected'} className={inputCls}>
              <option value="">Select Inspector</option>
              {qcEngineerList.map((name, idx) => (<option key={idx} value={name}>{name}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Working Condition *</label>
            <select value={workingCondition} onChange={(e) => setWorkingCondition(e.target.value)} required className={inputCls}>
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
                <label className={labelCls}>Approved Qty *</label>
                <input
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
                <span className="text-xs font-bold text-slate-700">Approved Item Serial Numbers & Photos {serialsLoading && <span className="text-slate-400 font-normal">(loading serials...)</span>}</span>
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {srnEntries.map((entry, idx) => (
                    <div key={entry.serialNo} className="grid grid-cols-12 gap-3 items-center bg-white p-2.5 rounded-xl border border-slate-100">
                      <div className="col-span-1 text-xs font-bold text-slate-400">#{entry.serialNo}</div>
                      <div className="col-span-5 relative"><SearchableSrnDropdown value={entry.srn} onChange={(val) => { const u = [...srnEntries]; u[idx] = { ...u[idx], srn: val }; setSrnEntries(u); }} options={serialNoList} placeholder="Search/Select SRN" /></div>
                      <div className="col-span-6 flex items-center gap-2">
                        <div className="flex-1">
                          <input type="file" accept="image/*" id={`srn-image-${idx}`} className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; const u = [...srnEntries]; u[idx] = { ...u[idx], image: f }; setSrnEntries(u); }} />
                          <label htmlFor={`srn-image-${idx}`} className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-xl cursor-pointer transition-all h-9 text-xs font-semibold ${entry.image ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><FileText size={12} /><span className="truncate max-w-[120px]">{entry.image ? entry.image.name : 'Photo'}</span></label>
                        </div>
                        {entry.image && (<button type="button" onClick={() => { const u = [...srnEntries]; u[idx] = { ...u[idx], image: null }; setSrnEntries(u); }} className="text-slate-400 hover:text-rose-500 font-bold p-1">✕</button>)}
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
                <label className={labelCls}>Reject Type *</label>
                <select value={rejectType} onChange={(e) => setRejectType(e.target.value)} required className={inputCls}>
                  <option value="">Select type</option>
                  {rejectTypeList.map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
              </div>
              <div><label className={labelCls}>Part-Name *</label><input type="text" placeholder="Enter part name" value={partName} onChange={(e) => setPartName(e.target.value)} required className={inputCls} /></div>
              <div>
                <label className={labelCls}>Reject Qty *</label>
                <input
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
                      <div className="col-span-1 text-xs font-bold text-slate-400">#{entry.serialNo}</div>
                      <div className="col-span-5 relative"><SearchableSrnDropdown value={entry.srn} onChange={(val) => { const u = [...rejectSrnEntries]; u[idx] = { ...u[idx], srn: val }; setRejectSrnEntries(u); }} options={serialNoList} placeholder="Search/Select SRN" /></div>
                      <div className="col-span-6 flex items-center gap-2">
                        <div className="flex-1">
                          <input type="file" accept="image/*" id={`reject-srn-image-${idx}`} className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; const u = [...rejectSrnEntries]; u[idx] = { ...u[idx], image: f }; setRejectSrnEntries(u); }} />
                          <label htmlFor={`reject-srn-image-${idx}`} className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-xl cursor-pointer transition-all h-9 text-xs font-semibold ${entry.image ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><FileText size={12} /><span className="truncate max-w-[120px]">{entry.image ? entry.image.name : 'Photo'}</span></label>
                        </div>
                        {entry.image && (<button type="button" onClick={() => { const u = [...rejectSrnEntries]; u[idx] = { ...u[idx], image: null }; setRejectSrnEntries(u); }} className="text-slate-400 hover:text-rose-500 font-bold p-1">✕</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelCls}>{workingCondition === 'Passed but Quality Concern' ? 'Concern Issue' : 'Remarks'}</label>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={workingCondition === 'Passed but Quality Concern' ? 'Explain concern details...' : 'Enter remarks...'} rows={3} className={`${inputCls} resize-none`} />
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
