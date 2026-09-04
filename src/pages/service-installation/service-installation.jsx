import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Loader2
} from 'lucide-react';
import TableWrapper from '../../components/TableWrapper';
import ModalWrapper from '../../components/ModalWrapper';
import formatDate from '../../utils/formatDate';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';

export default function ServiceInstallation() {
  const [activeTab, setActiveTab] = useState('pending');
  const [items, setItems] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuthStore();

  // Tickets ready for the Engineer-Dashboard's own "Service Installation"
  // stage: sss_service_installation.engg_dsb_service_installation_planned
  // set by the main app's ServiceInstallation.jsx once installation_follow_up
  // = 'Yes' there. Pending = no matching engg_dsb_service_installation row
  // yet; History = a row exists. See migration 0055.
  const loadItems = async () => {
    setFetchLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('sss_service_installation')
        .select('*')
        .not('engg_dsb_service_installation_planned', 'is', null)
        .order('engg_dsb_service_installation_planned', { ascending: false });

      if (error) throw error;

      const ids = (rows || []).map((r) => r.id);
      let completionByInstallation = new Map();
      if (ids.length > 0) {
        const { data: completions, error: completionsError } = await supabase
          .from('engg_dsb_service_installation')
          .select('*')
          .in('service_installation_id', ids);

        if (completionsError) throw completionsError;
        completionByInstallation = new Map(
          (completions || []).map((c) => [c.service_installation_id, c])
        );
      }

      const allItems = (rows || []).map((row) => {
        const completion = completionByInstallation.get(row.id);
        return {
          id: row.id,
          companyName: String(row.company_name || "").trim(),
          contactPerson: String(row.contact_person_name || "").trim(),
          contactNo: String(row.contact_person_no || "").trim(),
          itemName: String(row.item_name || "").trim(),
          qty: String(row.qty ?? "").trim(),
          serial: String(row.serial || "").trim(),
          siNo: String(row.si_no || "").trim(),
          invoiceNo: String(row.invoice_no || "").trim(),
          assignedEngineer: String(row.engineer_name || "").trim(),
          planned: String(row.engg_dsb_service_installation_planned || "").trim(),
          actual: completion ? String(completion.created_at || "").trim() : "",
          remarks: completion ? String(completion.remarks || "").trim() : "",
        };
      }).filter(item => item.siNo !== "");

      // Apply RBAC: if engineer, only see their assigned records
      const filteredByRole = user?.role === 'ENGINEER'
        ? allItems.filter(item =>
            item.assignedEngineer.toLowerCase() === user.name.toLowerCase() ||
            item.assignedEngineer.toLowerCase() === user.id.toLowerCase()
          )
        : allItems;

      setItems(filteredByRole);
    } catch (error) {
      console.error("Error loading Service-Installation data:", error);
      toast.error("Failed to load live data");
    } finally {
      setFetchLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    const handleRefresh = () => loadItems();
    window.addEventListener('refresh_sales', handleRefresh);
    return () => window.removeEventListener('refresh_sales', handleRefresh);
  }, []);

  // Clear selections when switching tabs
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  const pendingItems = useMemo(() => {
    return items.filter(item => item.planned !== "" && item.actual === "");
  }, [items]);

  const historyItems = useMemo(() => {
    return items.filter(item => item.planned !== "" && item.actual !== "");
  }, [items]);

  const filteredItems = useMemo(() => {
    const activeList = activeTab === 'pending' ? pendingItems : historyItems;
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return activeList;

    return activeList.filter(item => 
      item.siNo.toLowerCase().includes(searchLower) ||
      item.companyName.toLowerCase().includes(searchLower) ||
      item.contactPerson.toLowerCase().includes(searchLower) ||
      item.remarks.toLowerCase().includes(searchLower) ||
      item.invoiceNo.toLowerCase().includes(searchLower) ||
      item.itemName.toLowerCase().includes(searchLower)
    );
  }, [activeTab, pendingItems, historyItems, searchTerm]);

  const allSelected = useMemo(() => {
    return filteredItems.length > 0 && filteredItems.every(item => selectedIds.has(item.id));
  }, [filteredItems, selectedIds]);

  const someSelected = useMemo(() => {
    return filteredItems.some(item => selectedIds.has(item.id)) && !allSelected;
  }, [filteredItems, selectedIds, allSelected]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const newSelects = new Set(selectedIds);
      filteredItems.forEach(item => newSelects.add(item.id));
      setSelectedIds(newSelects);
    } else {
      const newSelects = new Set(selectedIds);
      filteredItems.forEach(item => newSelects.delete(item.id));
      setSelectedIds(newSelects);
    }
  };

  const handleSelectRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-5 flex-1 flex flex-col min-h-0 overflow-hidden pr-1">
      {/* Header and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
        {/* Tab Selector */}
        <div className="flex border border-slate-250 bg-slate-50/50 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'pending'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            Pending ({pendingItems.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            History ({historyItems.length})
          </button>
        </div>

        {/* Search, Action and Refresh */}
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && activeTab === 'pending' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              Completed ({selectedIds.size})
            </button>
          )}
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by SI NO, Company, Item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50/50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all"
            />
          </div>
          <button
            onClick={loadItems}
            disabled={fetchLoading}
            className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${fetchLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="flex-1 min-h-0 flex flex-col justify-between gap-4">
        <TableWrapper
          headers={
            activeTab === 'pending'
              ? [
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = someSelected;
                      }
                    }}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                  />,
                  'SI NO',
                  'Planned Date',
                  'Company Name',
                  'Contact Person',
                  'Contact No.',
                  'Invoice No',
                  'Item Name',
                  'Qty',
                  'Serial',
                  'Remarks'
                ]
              : [
                  'SI NO',
                  'Planned Date',
                  'Actual Date',
                  'Company Name',
                  'Contact Person',
                  'Contact No.',
                  'Invoice No',
                  'Item Name',
                  'Qty',
                  'Serial',
                  'Remarks'
                ]
          }
          data={filteredItems}
          emptyMessage={
            fetchLoading ? (
              <div className="flex items-center justify-center flex-col py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                <p className="mt-2 text-xs text-slate-500 font-medium">Loading records...</p>
              </div>
            ) : "No entries found."
          }
          renderCard={(item) => {
            const isSelected = selectedIds.has(item.id);
            if (activeTab === 'pending') {
              return (
                <div key={item.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 relative border-l-4 border-l-blue-500 transition-all ${isSelected ? 'bg-indigo-50/10' : ''}`}>
                  {/* Top Left Header with Checkbox and SI No */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(item.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {item.siNo}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                    <div>
                      <p className="text-slate-500 font-medium">Company Name</p>
                      <p className="text-slate-800 font-semibold">{item.companyName || "N/A"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-slate-500 font-medium">Contact Person</p>
                        <p className="text-slate-800">{item.contactPerson || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Contact No.</p>
                        <p className="text-slate-800 font-mono">{item.contactNo || "N/A"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-slate-500 font-medium">Planned Date</p>
                        <p className="text-slate-800">{formatDate(item.planned) || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Invoice No</p>
                        <p className="text-slate-800">{item.invoiceNo || "N/A"}</p>
                      </div>
                    </div>

                    <div className="pt-1 bg-slate-50 p-2 rounded-lg space-y-1">
                      <div>
                        <p className="text-slate-500 font-medium text-[10px]">Item Name</p>
                        <p className="text-[11px] text-slate-850 font-semibold">{item.itemName || "N/A"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <p className="text-slate-500 font-medium text-[10px]">Qty</p>
                          <p className="text-slate-700">{item.qty || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 font-medium text-[10px]">Serial</p>
                          <p className="text-slate-700 font-mono">{item.serial || "N/A"}</p>
                        </div>
                      </div>
                    </div>

                    {item.remarks && (
                      <div className="text-[11px] text-slate-500 italic pt-1">
                        <p className="text-slate-400 font-medium text-[10px]">Remarks</p>
                        <p>{item.remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            } else {
              return (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 relative border-l-4 border-l-emerald-500">
                  {/* Top Left Header with SI No */}
                  <div>
                    <span className="text-[10px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {item.siNo}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                    <div>
                      <p className="text-slate-500 font-medium">Company Name</p>
                      <p className="text-slate-800 font-semibold">{item.companyName || "N/A"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-slate-500 font-medium">Contact Person</p>
                        <p className="text-slate-800">{item.contactPerson || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Contact No.</p>
                        <p className="text-slate-800 font-mono">{item.contactNo || "N/A"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-slate-500 font-medium">Planned Date</p>
                        <p className="text-slate-800">{formatDate(item.planned) || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Actual Date</p>
                        <p className="text-slate-800">{formatDate(item.actual) || "N/A"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-slate-500 font-medium">Invoice No</p>
                        <p className="text-slate-800">{item.invoiceNo || "N/A"}</p>
                      </div>
                    </div>

                    <div className="pt-1 bg-slate-50 p-2 rounded-lg space-y-1">
                      <div>
                        <p className="text-slate-500 font-medium text-[10px]">Item Name</p>
                        <p className="text-[11px] text-slate-850 font-semibold">{item.itemName || "N/A"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <p className="text-slate-500 font-medium text-[10px]">Qty</p>
                          <p className="text-slate-700">{item.qty || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 font-medium text-[10px]">Serial</p>
                          <p className="text-slate-700 font-mono">{item.serial || "N/A"}</p>
                        </div>
                      </div>
                    </div>

                    {item.remarks && (
                      <div className="text-[11px] text-slate-500 italic pt-1">
                        <p className="text-slate-400 font-medium text-[10px]">Remarks</p>
                        <p>{item.remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
          }}
          renderRow={(item) => {
            const isSelected = selectedIds.has(item.id);
            if (activeTab === 'pending') {
              return (
                <tr key={item.id} className={`hover:bg-indigo-50/30 transition-colors ${isSelected ? 'bg-indigo-50/20' : ''}`}>
                  <td className="px-5 py-3.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(item.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="text-xs font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {item.siNo}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-600">
                    {formatDate(item.planned)}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-bold text-slate-800">
                    {item.companyName}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {item.contactPerson}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                    {item.contactNo}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                    {item.invoiceNo || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {item.itemName || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {item.qty || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {item.serial || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[180px] truncate" title={item.remarks}>
                    {item.remarks || "-"}
                  </td>
                </tr>
              );
            } else {
              return (
                <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="text-xs font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {item.siNo}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-600">
                    {formatDate(item.planned)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-600">
                    {formatDate(item.actual)}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-bold text-slate-800">
                    {item.companyName}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {item.contactPerson}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                    {item.contactNo}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                    {item.invoiceNo || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {item.itemName || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {item.qty || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {item.serial || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[180px] truncate" title={item.remarks}>
                    {item.remarks || "-"}
                  </td>
                </tr>
              );
            }
          }}
        />
      </div>

      {/* Completed Remarks Dialog Modal */}
      {isModalOpen && (
        <CompletedModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedCount={selectedIds.size}
          selectedItems={pendingItems.filter(item => selectedIds.has(item.id))}
          onSave={async () => {
            setSelectedIds(new Set());
            await loadItems();
          }}
        />
      )}
    </div>
  );
}

function CompletedModal({ isOpen, onClose, selectedCount, selectedItems, onSave }) {
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inputCls = "block w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all";
  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const rows = selectedItems.map(item => ({
        service_installation_id: item.id,
        remarks: remarks || null,
      }));

      const { error } = await supabase.from('engg_dsb_service_installation').insert(rows);

      if (error) throw error;

      toast.success("Successfully completed installations!");
      await onSave();
      window.dispatchEvent(new Event('refresh_sales'));
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to submit status details");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Complete Service Installation" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl text-xs">
          <span className="text-[10px] font-semibold text-slate-400 block uppercase mb-2">Selected Installations ({selectedCount})</span>
          <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
            {selectedItems.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-slate-700 py-0.5 border-b border-slate-100/50 last:border-0">
                <span className="font-mono font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded text-[10px]">{item.siNo}</span>
                <span className="truncate max-w-[200px] text-right font-medium">{item.companyName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Remarks textarea */}
        <div>
          <label className={labelCls}>Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Enter optional remarks..."
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Submitting ({selectedCount})...</span>
              </>
            ) : 'Completed'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}
