import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import ModalWrapper from '../../components/ModalWrapper';
import { StatusTabs, FilterSearch, FilterChips, ColumnSelector, DataTable } from '../../components/shared';
import formatDate from '../../utils/formatDate';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';
import { useStageList, PAGE_SIZES } from '../../hooks/use-stage-list';
import { scopeBy } from '../../lib/pagedView';

// Pending / History come from flat SQL views (Database/02_service_installation_views.sql):
// search, engineer scope and counts run in SQL, one page per request.
const VIEWS = { pending: 'engg_v_service_installation_pending', history: 'engg_v_service_installation_history' };
const COLUMNS = [
  { key: 'siNo', label: 'SI NO' },
  { key: 'planned', label: 'Planned Date' },
  { key: 'actual', label: 'Actual Date', tabs: ['history'] },
  { key: 'companyName', label: 'Company Name' },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'contactNo', label: 'Contact No.' },
  { key: 'invoiceNo', label: 'Invoice No' },
  { key: 'itemName', label: 'Item Name' },
  { key: 'qty', label: 'Qty' },
  { key: 'serial', label: 'Serial' },
  { key: 'remarks', label: 'Remarks' },
];
const ORDER = {
  pending: [{ column: 'planned_at', ascending: false }],
  history: [{ column: 'planned_at', ascending: false }],
};

const mapRow = (r) => ({
  id: r.id,
  siNo: r.si_no || '',
  companyName: r.company_name || '',
  contactPerson: r.contact_person_name || '',
  contactNo: r.contact_person_no || '',
  itemName: r.item_name || '',
  qty: String(r.qty ?? ''),
  serial: r.serial || '',
  invoiceNo: r.invoice_no || '',
  assignedEngineer: r.engineer_name || '',
  planned: r.planned_at || '',
  actual: r.actual_at || '',
  remarks: r.remarks || '',
});

const Cell = ({ children, title, className = '' }) => (
  <td className={`px-3.5 py-2 text-xs text-foreground align-middle ${className}`}>
    <div className="max-w-[260px] truncate" title={title ?? (typeof children === 'string' ? children : undefined)}>
      {children}
    </div>
  </td>
);

function renderCell(key, item) {
  switch (key) {
    case 'siNo':
      return <td key={key} className="px-3.5 py-2 whitespace-nowrap align-middle"><span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">{item.siNo}</span></td>;
    case 'planned':
    case 'actual':
      return <Cell key={key}>{item[key] ? formatDate(item[key]) : '-'}</Cell>;
    case 'companyName':
      return <Cell key={key} className="font-semibold">{item.companyName || '-'}</Cell>;
    default:
      return <Cell key={key}>{item[key] || '-'}</Cell>;
  }
}

export default function ServiceInstallation() {
  // Selected rows are kept as objects (id -> row) so a selection survives page changes and
  // the Completed dialog can still list them.
  const [selected, setSelected] = useState(() => new Map());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuthStore();

  const isEngineer = user?.role === 'ENGINEER';
  const scope = useMemo(
    () => (isEngineer ? scopeBy(['engineer_name'], [user?.name, user?.id]) : null),
    [isEngineer, user?.name, user?.id]
  );
  const list = useStageList({
    key: 'service-installation',
    views: VIEWS,
    scope,
    scopeKey: isEngineer ? `eng:${user?.id}` : 'all',
    columns: COLUMNS,
    order: ORDER,
  });

  const { reload } = list;
  useEffect(() => {
    const handleRefresh = () => reload();
    window.addEventListener('refresh_sales', handleRefresh);
    return () => window.removeEventListener('refresh_sales', handleRefresh);
  }, [reload]);

  const isPending = list.tab === 'pending';
  const rows = useMemo(() => list.rows.map(mapRow), [list.rows]);

  const changeTab = (t) => {
    setSelected(new Map()); // selection only makes sense on Pending
    list.setTab(t);
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id)) && !allSelected;
  const toggleRow = (item) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  const toggleAll = (checked) =>
    setSelected((prev) => {
      const next = new Map(prev);
      rows.forEach((r) => (checked ? next.set(r.id, r) : next.delete(r.id)));
      return next;
    });

  const checkbox = (checked, onChange, label, indeterminate = false) => (
    <input
      type="checkbox"
      ref={(el) => { if (el) el.indeterminate = indeterminate; }}
      aria-label={label}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
    />
  );

  const headers = [
    ...(isPending
      ? [
          { label: checkbox(allSelected, (e) => toggleAll(e.target.checked), 'Select all rows on this page', someSelected), className: 'w-10' },
        ]
      : []),
    ...list.activeColumns.map((c) => c.label),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs tabs={list.tabs} activeTab={list.tab} onChange={changeTab} label="Service installation views" />
        <FilterSearch
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search SI no, company, contact, invoice, item..."
          className="min-w-[220px] flex-1"
        />
        {isPending && selected.size > 0 && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Completed ({selected.size})
          </button>
        )}
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
          ariaLabel={isPending ? 'Pending installations' : 'Installation history'}
          headers={headers}
          data={rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle={list.chips.length ? 'No installations match this search' : isPending ? 'No pending installations' : 'No installation history yet'}
          currentPage={list.page}
          totalPages={list.totalPages}
          itemsPerPage={list.pageSize}
          totalResults={list.total}
          onPageChange={list.setPage}
          onItemsPerPageChange={list.setPageSize}
          itemsPerPageOptions={PAGE_SIZES}
          renderRow={(item) => {
            const isSelected = selected.has(item.id);
            return (
              <tr key={item.id} className={isSelected ? 'bg-accent/40' : ''}>
                {isPending && (
                  <td className="px-3.5 py-2 align-middle">
                    {checkbox(isSelected, () => toggleRow(item), `Select ${item.siNo}`)}
                  </td>
                )}
                {list.activeColumns.map((c) => renderCell(c.key, item))}
              </tr>
            );
          }}
          renderCard={(item) => {
            const isSelected = selected.has(item.id);
            return (
              <div key={item.id} className={`space-y-2 rounded-lg border bg-card p-3 text-xs shadow-sm ${isSelected ? 'ring-2 ring-ring/40' : ''}`}>
                <div className="flex items-center gap-3">
                  {isPending && checkbox(isSelected, () => toggleRow(item), `Select ${item.siNo}`)}
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono font-semibold">{item.siNo}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2">
                  <div className="col-span-2"><dt className="text-muted-foreground">Company</dt><dd className="font-semibold">{item.companyName || 'N/A'}</dd></div>
                  <div><dt className="text-muted-foreground">Contact person</dt><dd>{item.contactPerson || 'N/A'}</dd></div>
                  <div><dt className="text-muted-foreground">Contact no.</dt><dd className="font-mono">{item.contactNo || 'N/A'}</dd></div>
                  <div><dt className="text-muted-foreground">Planned</dt><dd>{item.planned ? formatDate(item.planned) : 'N/A'}</dd></div>
                  {!isPending && <div><dt className="text-muted-foreground">Actual</dt><dd>{item.actual ? formatDate(item.actual) : 'N/A'}</dd></div>}
                  <div><dt className="text-muted-foreground">Invoice</dt><dd>{item.invoiceNo || 'N/A'}</dd></div>
                  <div className="col-span-2 rounded bg-secondary p-2">
                    <dt className="text-muted-foreground">Item</dt>
                    <dd className="font-semibold">{item.itemName || 'N/A'}</dd>
                    <dd className="mt-1 grid grid-cols-2 gap-2"><span>Qty: {item.qty || 'N/A'}</span><span className="font-mono">Serial: {item.serial || 'N/A'}</span></dd>
                  </div>
                  {item.remarks && <div className="col-span-2"><dt className="text-muted-foreground">Remarks</dt><dd className="italic">{item.remarks}</dd></div>}
                </dl>
              </div>
            );
          }}
        />
      </div>

      {/* Completed Remarks Dialog Modal */}
      {isModalOpen && (
        <CompletedModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedCount={selected.size}
          selectedItems={Array.from(selected.values())}
          onSave={async () => {
            setSelected(new Map());
            await list.reload();
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
