import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Wrench, Plus, Trash2, Loader2 } from 'lucide-react';
import ModalWrapper from '../../components/ModalWrapper';
import { StatusTabs, FilterSearch, FilterChips, ColumnSelector, DataTable, StatusBadge, filterControlClass } from '../../components/shared';
import formatDate from '../../utils/formatDate';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';
import { useStageList, PAGE_SIZES } from '../../hooks/use-stage-list';
import { scopeBy } from '../../lib/pagedView';

// Pending / History come from flat SQL views (Database/01_repair_status_views.sql):
// search, filters, engineer scope and counts all run in SQL, one page per request.
const VIEWS = { pending: 'engg_v_repair_status_pending', history: 'engg_v_repair_status_history' };
const FILTERS = [
  { key: 'serviceLocation', column: 'service_location', label: 'Location', allLabel: 'All Locations' },
  { key: 'category', column: 'category', label: 'Category', allLabel: 'All Categories' },
];
const COLUMNS = [
  { key: 'ticketId', label: 'Ticket ID' },
  { key: 'date', label: 'Date' },
  { key: 'clientName', label: 'Client Name' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'machineName', label: 'Machine Name' },
  { key: 'mentionIssue', label: 'Mention Issue' },
  { key: 'serviceLocation', label: 'Service Location' },
  { key: 'repairStatus', label: 'Repair Status', tabs: ['history'] },
  { key: 'engineerName', label: 'Engineer Name', tabs: ['history'] },
  { key: 'remarks', label: 'Remarks' },
];
const ORDER = {
  pending: [{ column: 'created_at', ascending: true }],
  history: [{ column: 'created_at', ascending: false }],
};

// View row -> the shape the row renderers and ProcessModal already use.
// `id` stays the sss_warehouse row id (the FK target for engg_dsb_repair_status).
const mapRow = (r) => ({
  id: r.id,
  timeStemp: r.ticket_created_at || '',
  ticketId: r.ticket_id || '',
  clientName: r.client_name || '',
  phoneNumber: r.phone_number || '',
  companyName: r.company_name || '',
  machineName: r.machine_name || '',
  mentionIssue: r.mention_issue || '',
  category: r.category || '',
  serviceLocation: r.service_location || '',
  repairStatus: r.repair_status || '',
  engineerName: r.engineer_name || '',
  remarks: r.remarks || '',
  assignedEngineer: r.assigned_engineer || '',
});

const Cell = ({ children, title, className = '' }) => (
  <td className={`px-3.5 py-2 text-xs text-foreground align-middle ${className}`}>
    <div className="max-w-[260px] truncate" title={title ?? (typeof children === 'string' ? children : undefined)}>
      {children}
    </div>
  </td>
);

function renderCell(key, t) {
  switch (key) {
    case 'ticketId':
      return <td key={key} className="px-3.5 py-2 whitespace-nowrap align-middle"><span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">{t.ticketId}</span></td>;
    case 'date':
      return <Cell key={key}>{formatDate(t.timeStemp)}</Cell>;
    case 'clientName':
      return <Cell key={key} className="font-semibold">{t.clientName || '-'}</Cell>;
    case 'repairStatus':
      return (
        <td key={key} className="px-3.5 py-2 align-middle">
          <StatusBadge tone={t.repairStatus === 'Yes' ? 'success' : 'danger'}>{t.repairStatus === 'Yes' ? 'Repaired' : 'Not repaired'}</StatusBadge>
        </td>
      );
    default:
      return <Cell key={key}>{t[key] || '-'}</Cell>;
  }
}

export default function RepairStatus() {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [engineerList, setEngineerList] = useState([]);
  const { user } = useAuthStore();

  // Engineers only see tickets assigned to them (name or id); admins see all.
  const isEngineer = user?.role === 'ENGINEER';
  const scope = useMemo(
    () => (isEngineer ? scopeBy(['assigned_engineer'], [user?.name, user?.id]) : null),
    [isEngineer, user?.name, user?.id]
  );
  const list = useStageList({
    key: 'repair-status',
    views: VIEWS,
    scope,
    scopeKey: isEngineer ? `eng:${user?.id}` : 'all',
    filters: FILTERS,
    columns: COLUMNS,
    order: ORDER,
  });

  const fetchDropdownData = async () => {
    try {
      const { data, error } = await supabase
        .from('sss_dropdown')
        .select('value')
        .eq('category', 'engineer_assign_name');

      if (error) throw error;

      const engineers = (data || [])
        .map((row) => String(row.value || "").trim())
        .filter(Boolean);
      setEngineerList([...new Set(engineers)]);
    } catch (error) {
      console.error("Error fetching engineer dropdown:", error);
    }
  };

  const { reload } = list;
  useEffect(() => {
    fetchDropdownData();
    const handleRefresh = () => reload();
    window.addEventListener('refresh_sales', handleRefresh);
    return () => window.removeEventListener('refresh_sales', handleRefresh);
  }, [reload]);

  const isPending = list.tab === 'pending';
  const rows = useMemo(() => list.rows.map(mapRow), [list.rows]);
  const headers = [...(isPending ? ['Action'] : []), ...list.activeColumns.map((c) => c.label)];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* One toolbar row */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs tabs={list.tabs} activeTab={list.tab} onChange={list.setTab} label="Repair status views" />
        <FilterSearch
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search ticket, client, company, machine..."
          className="min-w-[220px] flex-1"
        />
        {FILTERS.map((f) => (
          <select
            key={f.key}
            aria-label={f.label}
            value={list.filterValues[f.key]}
            onChange={(e) => list.setFilter(f.key, e.target.value)}
            className={`${filterControlClass} !w-auto min-w-[140px] max-w-[200px]`}
          >
            <option value="all">{f.allLabel}</option>
            {list.filterOptions[f.key].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ))}
        <button
          type="button"
          onClick={list.reload}
          disabled={list.fetching}
          aria-label="Refresh"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-card w-9 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${list.fetching ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
        <ColumnSelector {...list.columnPanel} />
      </div>
      <FilterChips chips={list.chips} onClearAll={list.clearAll} />

      <div className="min-h-0 flex-1">
        <DataTable
          ariaLabel={isPending ? 'Pending repairs' : 'Repair history'}
          headers={headers}
          data={rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle={list.chips.length ? 'No repairs match these filters' : isPending ? 'No pending repairs' : 'No repair history yet'}
          currentPage={list.page}
          totalPages={list.totalPages}
          itemsPerPage={list.pageSize}
          totalResults={list.total}
          onPageChange={list.setPage}
          onItemsPerPageChange={list.setPageSize}
          itemsPerPageOptions={PAGE_SIZES}
          renderRow={(ticket) => (
            <tr key={ticket.id} className="transition-colors">
              {isPending && (
                <td className="px-3.5 py-2 align-middle">
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Wrench size={13} aria-hidden="true" />
                    Process
                  </button>
                </td>
              )}
              {list.activeColumns.map((c) => renderCell(c.key, ticket))}
            </tr>
          )}
          renderCard={(ticket) => (
            <div key={ticket.id} className="space-y-2 rounded-lg border bg-card p-3 text-xs shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono font-semibold">{ticket.ticketId}</span>
                  <p className="mt-1 text-muted-foreground">{formatDate(ticket.timeStemp)}</p>
                </div>
                {isPending ? (
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-semibold text-primary-foreground"
                  >
                    <Wrench size={13} aria-hidden="true" />
                    Process
                  </button>
                ) : (
                  <StatusBadge tone={ticket.repairStatus === 'Yes' ? 'success' : 'danger'}>{ticket.repairStatus === 'Yes' ? 'Repaired' : 'Not repaired'}</StatusBadge>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2">
                <div><dt className="text-muted-foreground">Client</dt><dd className="font-semibold">{ticket.clientName || 'N/A'}</dd></div>
                <div><dt className="text-muted-foreground">Company</dt><dd className="font-semibold">{ticket.companyName || 'N/A'}</dd></div>
                <div><dt className="text-muted-foreground">Machine</dt><dd>{ticket.machineName || 'N/A'}</dd></div>
                <div><dt className="text-muted-foreground">Location</dt><dd>{ticket.serviceLocation || 'N/A'}</dd></div>
                <div className="col-span-2"><dt className="text-muted-foreground">Issue</dt><dd>{ticket.mentionIssue || 'N/A'}</dd></div>
                {!isPending && <div><dt className="text-muted-foreground">Engineer</dt><dd className="font-semibold">{ticket.engineerName || 'N/A'}</dd></div>}
                {ticket.remarks && <div className="col-span-2 rounded bg-secondary p-2"><dt className="text-muted-foreground">Remarks</dt><dd className="italic">{ticket.remarks}</dd></div>}
              </dl>
            </div>
          )}
        />
      </div>

      {/* Process Dialog Modal */}
      {selectedTicket && (
        <ProcessModal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          ticket={selectedTicket}
          onSave={list.reload}
          engineerList={engineerList}
        />
      )}
    </div>
  );
}

function ProcessModal({ isOpen, onClose, ticket, onSave, engineerList }) {
  const [repairStatus, setRepairStatus] = useState('');
  const [engineerName, setEngineerName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [itemsList, setItemsList] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleAddItem = () => {
    if (itemsList.length < 10) {
      setItemsList([...itemsList, { item: "", qty: "" }]);
    }
  };

  const handleRemoveItem = (index) => {
    setItemsList(itemsList.filter((_, idx) => idx !== index));
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = itemsList.map((item, idx) => {
      if (idx === index) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setItemsList(updated);
  };

  const inputCls = "block w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all";
  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block";

  const isFormValid = useMemo(() => {
    if (!repairStatus) return false;
    if (repairStatus === "Yes") {
      if (!engineerName) return false;
      const hasInvalidItem = itemsList.some(item => !item.item.trim() || !item.qty || parseInt(item.qty) <= 0);
      if (hasInvalidItem) return false;
    }
    return true;
  }, [repairStatus, engineerName, itemsList]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    let imageUrl = "";
    if (repairStatus === "Yes" && imageFile) {
      try {
        setUploadingImage(true);
        const path = `repair_status/${ticket.ticketId}_${Date.now()}_${imageFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("ticket_enquiry")
          .upload(path, imageFile, { contentType: imageFile.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("ticket_enquiry").getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      } catch (error) {
        console.error(error);
        toast.error(`Image upload failed: ${error.message || "Unknown error"}`);
        setSubmitting(false);
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    try {
      // ticket.id here is the sss_warehouse row id (see loadTickets above),
      // the FK target for engg_dsb_repair_status.
      const { error } = await supabase.from('engg_dsb_repair_status').insert({
        warehouse_id: ticket.id,
        repair_status: repairStatus,
        engineer_name: repairStatus === "Yes" ? engineerName : null,
        remarks: remarks || null,
        items: repairStatus === "Yes" && itemsList.length > 0 ? itemsList.map(i => i.item.trim()).join(", ") : null,
        qty: repairStatus === "Yes" && itemsList.length > 0 ? itemsList.map(i => i.qty.toString().trim()).join(", ") : null,
        image: repairStatus === "Yes" ? (imageUrl || null) : null,
      });

      if (error) throw error;

      toast.success("Repair status updated successfully!");
      await onSave();
      window.dispatchEvent(new Event('refresh_sales'));
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to save repair status details");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={`Process Repair: ${ticket.ticketId}`} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Ticket Info Summary */}
        <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block uppercase">Client Name</span>
            <span className="font-bold text-slate-700 block truncate">{ticket.clientName}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block uppercase">Company Name</span>
            <span className="font-bold text-slate-700 block truncate">{ticket.companyName || "N/A"}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block uppercase">Planned Date</span>
            <span className="font-medium text-slate-600 block">{formatDate(ticket.planned)}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block uppercase">Logged Date</span>
            <span className="font-medium text-slate-600 block">{formatDate(ticket.timeStemp)}</span>
          </div>
        </div>

        {/* Repair Status selection */}
        <div>
          <label className={labelCls}>Repair Status *</label>
          <select
            value={repairStatus}
            onChange={(e) => {
              setRepairStatus(e.target.value);
              if (e.target.value !== "Yes") {
                setEngineerName('');
              }
            }}
            required
            className={inputCls}
          >
            <option value="">Select Option</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>

        {/* Dynamic Engineer Selection (When status is Yes) */}
        {repairStatus === "Yes" && (
          <div>
            <label className={labelCls}>Engineer Name *</label>
            <select
              value={engineerName}
              onChange={(e) => setEngineerName(e.target.value)}
              required
              className={inputCls}
            >
              <option value="">Select Engineer</option>
              {engineerList.map((name, idx) => (
                <option key={idx} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Dynamic Items Table (Repair Status Yes) */}
        {repairStatus === "Yes" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Repair Parts/Items</label>
              {itemsList.length < 10 && (
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors border border-indigo-100"
                >
                  <Plus size={13} /> Add Row
                </button>
              )}
            </div>

            {itemsList.length > 0 ? (
              <div className="space-y-2 border border-slate-150 p-3 rounded-xl bg-slate-50/50 max-h-56 overflow-y-auto pr-1">
                {itemsList.map((itemRow, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Item name..."
                        value={itemRow.item}
                        onChange={(e) => handleUpdateItem(idx, "item", e.target.value)}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        placeholder="Qty"
                        min="1"
                        value={itemRow.qty}
                        onChange={(e) => handleUpdateItem(idx, "qty", e.target.value)}
                        className={inputCls}
                        required
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
                <span className="text-[11px] text-slate-400">No parts or items added yet (optional)</span>
              </div>
            )}
          </div>
        )}

        {/* Single Image Upload Field (Repair Status Yes) */}
        {repairStatus === "Yes" && (
          <div>
            <label className={labelCls}>Repair Proof Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setImageFile(e.target.files[0]);
                }
              }}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-slate-200 rounded-xl bg-slate-50/50 p-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
            />
            {imageFile && (
              <p className="mt-1 text-[10px] text-slate-500 font-medium truncate">
                Selected: {imageFile.name} ({(imageFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
        )}

        {/* Remarks textarea */}
        <div>
          <label className={labelCls}>Remarks</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Enter remarks..."
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
            disabled={submitting || uploadingImage || !isFormValid}
            className="px-6 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            {uploadingImage ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading Image...</span>
              </>
            ) : submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : 'Submit Report'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}
