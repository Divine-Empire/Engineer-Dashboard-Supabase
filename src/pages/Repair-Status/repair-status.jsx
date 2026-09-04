import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Wrench,
  Loader2,
  FileText,
  Plus,
  Trash2
} from 'lucide-react';
import TableWrapper from '../../components/TableWrapper';
import ModalWrapper from '../../components/ModalWrapper';
import formatDate from '../../utils/formatDate';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase/client';

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

export default function RepairStatus() {
  const [activeTab, setActiveTab] = useState('pending');
  const [tickets, setTickets] = useState([]);
  const [engineerList, setEngineerList] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const { user } = useAuthStore();

  // Tickets ready for the Engineer-Dashboard's own "Repair Status" stage:
  // sss_warehouse.engg_dsb_repair_status_planned set by the main app's
  // Warehouse.jsx at insert time. Pending = no matching
  // engg_dsb_repair_status row yet; History = a row exists. See migration
  // 0055.
  const loadTickets = async () => {
    setFetchLoading(true);
    try {
      const { data: warehouseRows, error: warehouseError } = await supabase
        .from('sss_warehouse')
        .select('*')
        .not('engg_dsb_repair_status_planned', 'is', null)
        .order('created_at', { ascending: true });

      if (warehouseError) throw warehouseError;

      const ticketIds = [...new Set((warehouseRows || []).map((w) => w.ticket_id))];
      const warehouseIds = (warehouseRows || []).map((w) => w.id);

      if (warehouseIds.length === 0) {
        setTickets([]);
        return;
      }

      const [ticketsRes, completionsRes] = await Promise.all([
        supabase.from('sss_tickets').select('*').in('ticket_id', ticketIds),
        supabase.from('engg_dsb_repair_status').select('*').in('warehouse_id', warehouseIds),
      ]);

      if (ticketsRes.error) throw ticketsRes.error;
      if (completionsRes.error) throw completionsRes.error;

      const ticketByTicketId = new Map((ticketsRes.data || []).map((t) => [t.ticket_id, t]));
      const completionByWarehouse = new Map(
        (completionsRes.data || []).map((c) => [c.warehouse_id, c])
      );

      const allTickets = (warehouseRows || []).map((w) => {
        const t = ticketByTicketId.get(w.ticket_id) || {};
        const completion = completionByWarehouse.get(w.id);
        return {
          id: w.id, // this stage's own row id (sss_warehouse.id), not the ticket
          timeStemp: String(t.created_at || "").trim(),
          ticketId: String(w.ticket_id || "").trim(),
          clientName: String(t.client_name || "").trim(),
          phoneNumber: String(t.phone_number || "").trim(),
          companyName: String(t.company_name || "").trim(),
          machineName: String(t.machine_name || "").trim(),
          mentionIssue: String(t.mention_issue || "").trim(),
          category: String(t.category || "").trim(),
          serviceLocation: String(t.service_location || "").trim(),
          planned: String(w.engg_dsb_repair_status_planned || "").trim(),
          actual: completion ? String(completion.created_at || "").trim() : "",
          repairStatus: completion ? String(completion.repair_status || "").trim() : "",
          engineerName: completion ? String(completion.engineer_name || "").trim() : "",
          remarks: completion ? String(completion.remarks || "").trim() : "",
          assignedEngineer: String(w.assigned_engineer || "").trim(),
        };
      });

      // Apply RBAC: if engineer, only see their assigned tickets
      const filteredByRole = user?.role === 'ENGINEER'
        ? allTickets.filter(t =>
            t.assignedEngineer.toLowerCase() === user.name.toLowerCase() ||
            t.assignedEngineer.toLowerCase() === user.id.toLowerCase()
          )
        : allTickets;

      setTickets(filteredByRole);
    } catch (error) {
      console.error("Error loading Repair Status data:", error);
      toast.error("Failed to load live data");
    } finally {
      setFetchLoading(false);
    }
  };

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

  useEffect(() => {
    loadTickets();
    fetchDropdownData();
    const handleRefresh = () => loadTickets();
    window.addEventListener('refresh_sales', handleRefresh);
    return () => window.removeEventListener('refresh_sales', handleRefresh);
  }, []);

  const pendingTickets = useMemo(() => {
    return tickets.filter(t => t.planned !== "" && t.actual === "");
  }, [tickets]);

  const historyTickets = useMemo(() => {
    return tickets.filter(t => t.planned !== "" && t.actual !== "");
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const activeList = activeTab === 'pending' ? pendingTickets : historyTickets;
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return activeList;

    return activeList.filter(t => 
      t.ticketId.toLowerCase().includes(searchLower) ||
      t.clientName.toLowerCase().includes(searchLower) ||
      t.companyName.toLowerCase().includes(searchLower) ||
      t.remarks.toLowerCase().includes(searchLower)
    );
  }, [activeTab, pendingTickets, historyTickets, searchTerm]);

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
            Pending ({pendingTickets.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            History ({historyTickets.length})
          </button>
        </div>

        {/* Search and Refresh */}
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID, Client, Company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50/50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all"
            />
          </div>
          <button
            onClick={loadTickets}
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
                  'Action',
                  'Ticket ID',
                  'Date',
                  'Client Name',
                  'Company Name',
                  'Machine Name',
                  'Mention Issue',
                  'Service Location',
                  'Remarks'
                ]
              : [
                  'Ticket ID',
                  'Date',
                  'Client Name',
                  'Company Name',
                  'Machine Name',
                  'Mention Issue',
                  'Service Location',
                  'Repair Status',
                  'Engineer Name',
                  'Remarks'
                ]
          }
          data={filteredTickets}
          emptyMessage={
            fetchLoading ? (
              <div className="flex items-center justify-center flex-col py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                <p className="mt-2 text-xs text-slate-500 font-medium">Loading records...</p>
              </div>
            ) : "No entries found."
          }
          renderCard={(ticket) => {
            if (activeTab === 'pending') {
              return (
                <div key={ticket.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 relative border-l-4 border-l-blue-500">
                  {/* Top Right Action Button */}
                  <div className="absolute top-4 right-4">
                    <button
                      onClick={() => setSelectedTicket(ticket)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1"
                    >
                      <Wrench size={12} />
                      Process
                    </button>
                  </div>

                  {/* Header / Info */}
                  <div className="pr-24">
                    <span className="text-[10px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {ticket.ticketId}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formatDate(ticket.timeStemp)}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-slate-500 font-medium">Client Name</p>
                        <p className="text-slate-800 font-semibold">{ticket.clientName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Company Name</p>
                        <p className="text-slate-800 font-semibold">{ticket.companyName || "N/A"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-slate-500 font-medium">Machine Name</p>
                        <p className="text-slate-800">{ticket.machineName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Service Location</p>
                        <p className="text-slate-800">{ticket.serviceLocation || "N/A"}</p>
                      </div>
                    </div>

                    <div className="pt-1">
                      <p className="text-slate-500 font-medium">Mention Issue</p>
                      <p className="text-slate-700">{ticket.mentionIssue || "N/A"}</p>
                    </div>

                    {ticket.remarks && (
                      <div className="bg-slate-50 p-2 rounded-lg text-slate-600 mt-1">
                        <p className="text-slate-500 font-medium text-[10px]">Remarks</p>
                        <p className="text-[11px] italic">{ticket.remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            } else {
              const statusBorder = ticket.repairStatus === "Yes" ? "border-l-emerald-500" : "border-l-rose-500";
              return (
                <div key={ticket.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 relative border-l-4 ${statusBorder}`}>
                  {/* Header / Info */}
                  <div>
                    <span className="text-[10px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {ticket.ticketId}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formatDate(ticket.timeStemp)}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-slate-500 font-medium">Client Name</p>
                        <p className="text-slate-800 font-semibold">{ticket.clientName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Company Name</p>
                        <p className="text-slate-800 font-semibold">{ticket.companyName || "N/A"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-slate-500 font-medium">Machine Name</p>
                        <p className="text-slate-800">{ticket.machineName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Service Location</p>
                        <p className="text-slate-800">{ticket.serviceLocation || "N/A"}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <p className="text-slate-500 font-medium">Engineer Name</p>
                        <p className="text-slate-800 font-semibold">{ticket.engineerName || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 font-medium">Repair Status</p>
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-semibold border text-[10px] ${
                          ticket.repairStatus === "Yes"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-rose-50 text-rose-700 border-rose-100"
                        }`}>
                          {ticket.repairStatus === "Yes" ? "Repaired" : "Pending"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <p className="text-slate-500 font-medium">Mention Issue</p>
                      <p className="text-slate-700">{ticket.mentionIssue || "N/A"}</p>
                    </div>

                    {ticket.remarks && (
                      <div className="bg-slate-50 p-2 rounded-lg text-slate-600 mt-1">
                        <p className="text-slate-500 font-medium text-[10px]">Remarks</p>
                        <p className="text-[11px] italic">{ticket.remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
          }}
          renderRow={(ticket) => {
            if (activeTab === 'pending') {
              return (
                <tr key={ticket.id} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setSelectedTicket(ticket)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <Wrench size={13} />
                      Process
                    </button>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="text-xs font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {ticket.ticketId}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-600">
                    {formatDate(ticket.timeStemp)}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-bold text-slate-800">
                    {ticket.clientName}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {ticket.companyName}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {ticket.machineName || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {ticket.mentionIssue || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {ticket.serviceLocation}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[180px] truncate" title={ticket.remarks}>
                    {ticket.remarks || "-"}
                  </td>
                </tr>
              );
            } else {
              return (
                <tr key={ticket.id} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="text-xs font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {ticket.ticketId}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-600">
                    {formatDate(ticket.timeStemp)}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-bold text-slate-800">
                    {ticket.clientName}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {ticket.companyName}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {ticket.machineName || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {ticket.mentionIssue || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">
                    {ticket.serviceLocation}
                  </td>
                  <td className="px-5 py-3.5 text-xs">
                    <span className={`px-2.5 py-0.5 rounded-full font-semibold border text-[11px] ${
                      ticket.repairStatus === "Yes"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : "bg-rose-50 text-rose-700 border-rose-100"
                    }`}>
                      {ticket.repairStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-medium text-slate-700">
                    {ticket.engineerName || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[180px] truncate" title={ticket.remarks}>
                    {ticket.remarks || "-"}
                  </td>
                </tr>
              );
            }
          }}
        />
      </div>

      {/* Process Dialog Modal */}
      {selectedTicket && (
        <ProcessModal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          ticket={selectedTicket}
          onSave={loadTickets}
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
