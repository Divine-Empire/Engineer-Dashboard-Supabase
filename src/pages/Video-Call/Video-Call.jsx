import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';
import ModalWrapper from '../../components/ModalWrapper';
import { StatusTabs, FilterSearch, FilterChips, ColumnSelector, DataTable, StatusBadge, filterControlClass } from '../../components/shared';
import formatDate from '../../utils/formatDate';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase/client';
import { fetchDropdownRows } from '../../lib/supabase/dropdown';
import { useAuthStore } from '../../store/authStore';
import { useStageList, PAGE_SIZES } from '../../hooks/use-stage-list';
import { scopeBy } from '../../lib/pagedView';

// Pending / History come from flat SQL views (Database/03_video_call_views.sql):
// search, filters, engineer scope and counts run in SQL, one page per request.
//   Pending = no attempt yet, or the latest attempt is 'rescheduled'; History = any other latest attempt.
const VIEWS = { pending: 'engg_v_video_call_pending', history: 'engg_v_video_call_history' };
const FILTERS = [
  { key: 'category', column: 'category', label: 'Category', allLabel: 'All Categories' },
  { key: 'serviceLocation', column: 'service_location', label: 'Location', allLabel: 'All Locations' },
];
const ORDER = {
  pending: [{ column: 'created_at', ascending: true }],
  history: [{ column: 'created_at', ascending: false }],
};

// Columns the user may toggle. `defaultVisible` = the original default set.
// Remarks (the attempt's own) exist only on History; Engineer Assign is admin-only.
const ALL_COLUMNS = [
  { key: 'ticketId', label: 'Ticket-ID', defaultVisible: true },
  { key: 'companyName', label: 'Company Name', defaultVisible: true },
  { key: 'clientName', label: 'Client Name', defaultVisible: true },
  { key: 'phoneNumber', label: 'Phone Number', defaultVisible: true },
  { key: 'machineName', label: 'Machine Name', defaultVisible: true },
  { key: 'mentionIssue', label: 'Mention Issue', defaultVisible: true },
  { key: 'remarks', label: 'Video Call Remarks', defaultVisible: true, tabs: ['history'] },
  { key: 'engineerAssign', label: 'Engineer Assign', defaultVisible: true, adminOnly: true },
  { key: 'enquiryItemList', label: 'Enquiry Item List', defaultVisible: true },
  { key: 'videoCallTime', label: 'Call Time', defaultVisible: true },
  { key: 'timeStemp', label: 'Date', defaultVisible: true },
  { key: 'sourceOfEnquiry', label: 'Source of enquiry', defaultVisible: false },
  { key: 'callType', label: 'Call type', defaultVisible: false },
  { key: 'enquiryReceiverName', label: 'Enquiry Receiver Name', defaultVisible: false },
  { key: 'clientType', label: 'Client Type', defaultVisible: false },
  { key: 'gstAddress', label: 'GST Address', defaultVisible: false },
  { key: 'siteAddress', label: 'Site Address', defaultVisible: false },
  { key: 'gstNo', label: 'GST No.', defaultVisible: false },
  { key: 'category', label: 'Category', defaultVisible: false },
  { key: 'serviceLocation', label: 'Service Location', defaultVisible: false },
];

const formatCallTime = (timeStr) => {
  if (!timeStr) return "";
  const str = String(timeStr).trim();

  // If it's a full ISO format, e.g. "1899-12-30T14:30:00.000Z"
  if (str.includes("T")) {
    const timePart = str.split("T")[1];
    const parts = timePart.split(":");
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    }
  }

  // If it's in format "HH:MM:SS"
  const parts = str.split(":");
  if (parts.length >= 2) {
    const hh = parts[0].trim().padStart(2, "0");
    const mm = parts[1].trim().padStart(2, "0");
    if (!isNaN(hh) && !isNaN(mm)) {
      return `${hh}:${mm}`;
    }
  }

  // Regex match for HH:MM with optional AM/PM
  const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3];
    if (ampm) {
      if (ampm.toUpperCase() === "PM" && hours < 12) {
        hours += 12;
      } else if (ampm.toUpperCase() === "AM" && hours === 12) {
        hours = 0;
      }
    }
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }

  return str;
};

// View row -> the shape the row renderers and SolutionModal already use.
// `id` = the ticket uuid (used for updates / uploads).
const mapRow = (r) => {
  const isPending = r.is_pending === true;
  const s = (v) => String(v ?? '').trim();
  return {
    id: r.id,
    timeStemp: s(r.ticket_created_at),
    ticketId: s(r.ticket_id),
    clientName: s(r.client_name),
    phoneNumber: s(r.phone_number),
    category: s(r.category),
    callType: s(r.call_type),
    requirementServiceCategory: s(r.category),
    videoCall: s(r.video_call),
    sourceOfEnquiry: s(r.source_of_enquiry),
    enquiryReceiverName: s(r.enquiry_receiver_name),
    clientType: s(r.client_type),
    gstNo: s(r.gst_no),
    mentionIssue: s(r.mention_issue),
    enquiryItemList: s(r.enquiry_item_list),
    machineName: s(r.machine_name),
    enquiryType: s(r.enquiry_type),
    siteName: s(r.site_address),
    companyName: s(r.company_name),
    gstAddress: s(r.gst_address),
    siteAddress: s(r.site_address),
    // "primary" and "final assign" collapse to the one sss_tickets.engineer_assign column.
    engineerAssign: s(r.engineer_assign),
    engineerAssignFA: s(r.engineer_assign),
    serviceLocation: s(r.service_location),
    otp: s(r.otp),
    afterVideoCallGenerateOTP: s(r.otp),
    planned2: 'planned',
    actual2: isPending ? '' : s(r.attempt_created_at),
    videoCallServicesSolve: s(r.enquiry_solved),
    serviceType: s(r.service_type),
    otpVarificationStatus: s(r.regeneration_status),
    audioUrl: s(r.audio_link),
    CREName: s(r.cre_name),
    remarks: s(r.remarks),
    itemQty: r.item_qty ? JSON.stringify(r.item_qty) : '',
    videoCallTime: formatCallTime(s(r.video_call_time)),
  };
};

const DROPDOWN_CATEGORY_TO_KEY = {
  service_location: 'Service Location',
  engineer_assign_name: 'Engineer Assign Name',
  item_name: 'Item-Name',
};

// Paginated fetch — a plain unpaginated .select() silently truncates at Supabase's default
// 1000-row cap, which item_name alone blows past on its own (~1400 rows), dropping other
// categories' values.
async function loadMasterData() {
  const data = await fetchDropdownRows(Object.keys(DROPDOWN_CATEGORY_TO_KEY));
  const structuredData = {};
  (data || []).forEach(({ category, value }) => {
    const key = DROPDOWN_CATEGORY_TO_KEY[category];
    if (!key) return;
    if (!structuredData[key]) structuredData[key] = [];
    structuredData[key].push(value);
  });
  Object.keys(structuredData).forEach((key) => {
    structuredData[key] = [...new Set(structuredData[key])];
  });
  return structuredData;
}

const Cell = ({ children, title, className = '' }) => (
  <td className={`px-3.5 py-2 text-xs text-foreground align-middle ${className}`}>
    <div className="max-w-[240px] truncate" title={title ?? (typeof children === 'string' ? children : undefined)}>
      {children}
    </div>
  </td>
);

function renderCell(key, t) {
  switch (key) {
    case 'timeStemp':
      return <Cell key={key}>{formatDate(t.timeStemp)}</Cell>;
    case 'ticketId':
      return <td key={key} className="px-3.5 py-2 whitespace-nowrap align-middle"><span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">{t.ticketId}</span></td>;
    case 'clientName':
      return <Cell key={key} className="font-semibold">{t.clientName || '-'}</Cell>;
    case 'enquiryItemList':
      return (
        <td key={key} className="px-3.5 py-2 text-xs align-middle">
          {t.enquiryItemList ? (
            <a href={t.enquiryItemList} target="_blank" rel="noreferrer" className="font-semibold text-primary underline hover:text-brand-800">View</a>
          ) : (
            '-'
          )}
        </td>
      );
    case 'videoCallTime':
      return <Cell key={key}>{t.videoCallTime || 'N/A'}</Cell>;
    default:
      return <Cell key={key}>{t[key] || '-'}</Cell>;
  }
}

export default function VideoCall() {
  const [selectedSale, setSelectedSale] = useState(null); // the selected ticket for the modal
  const [masterData, setMasterData] = useState({});
  const { user } = useAuthStore();

  // Engineers only see tickets assigned to them; admins see everything.
  const isEngineer = user?.role === 'ENGINEER';
  const isAdmin = user?.role === 'ADMIN';
  const scope = useMemo(
    () => (isEngineer ? scopeBy(['engineer_assign'], [user?.name, user?.id]) : null),
    [isEngineer, user?.name, user?.id]
  );
  const columns = useMemo(() => ALL_COLUMNS.filter((c) => !c.adminOnly || isAdmin), [isAdmin]);
  const list = useStageList({
    key: 'video-call',
    views: VIEWS,
    scope,
    scopeKey: isEngineer ? `eng:${user?.id}` : 'all',
    filters: FILTERS,
    columns,
    order: ORDER,
  });

  const { reload } = list;
  useEffect(() => {
    loadMasterData().then(setMasterData).catch((error) => console.error("Error fetching master data:", error));
    const handleRefresh = () => reload();
    window.addEventListener('refresh_sales', handleRefresh);
    return () => window.removeEventListener('refresh_sales', handleRefresh);
  }, [reload]);

  const isPending = list.tab === 'pending';
  const rows = useMemo(() => list.rows.map(mapRow), [list.rows]);
  const headers = [{ label: 'Action', className: 'w-24' }, ...list.activeColumns.map((c) => c.label)];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* One toolbar row */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs tabs={list.tabs} activeTab={list.tab} onChange={list.setTab} label="Video call views" />
        <FilterSearch
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search ticket, client, company, phone..."
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
          ariaLabel={isPending ? 'Pending video calls' : 'Video call history'}
          headers={headers}
          data={rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle={list.chips.length ? 'No tickets match these filters' : isPending ? 'No pending video calls' : 'No video call history yet'}
          currentPage={list.page}
          totalPages={list.totalPages}
          itemsPerPage={list.pageSize}
          totalResults={list.total}
          onPageChange={list.setPage}
          onItemsPerPageChange={list.setPageSize}
          itemsPerPageOptions={PAGE_SIZES}
          renderRow={(ticket) => (
            <tr key={ticket.id}>
              <td className="px-3.5 py-2 align-middle">
                {isPending ? (
                  <button
                    type="button"
                    onClick={() => setSelectedSale(ticket)}
                    className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Solution
                  </button>
                ) : (
                  <StatusBadge tone="success">Solved</StatusBadge>
                )}
              </td>
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
                    onClick={() => setSelectedSale(ticket)}
                    className="inline-flex h-8 items-center rounded-md bg-primary px-3 font-semibold text-primary-foreground"
                  >
                    Solution
                  </button>
                ) : (
                  <StatusBadge tone="success">Solved</StatusBadge>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2">
                {list.activeColumns
                  .filter((c) => !['ticketId', 'timeStemp'].includes(c.key) && ticket[c.key])
                  .map((c) => (
                    <div key={c.key} className={['mentionIssue', 'remarks', 'gstAddress', 'siteAddress', 'companyName'].includes(c.key) ? 'col-span-2' : ''}>
                      <dt className="text-muted-foreground">{c.label}</dt>
                      <dd className="break-words font-medium">
                        {c.key === 'enquiryItemList' ? (
                          <a href={ticket.enquiryItemList} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">View</a>
                        ) : (
                          ticket[c.key]
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
        />
      </div>

      {/* Workflow Modal */}
      {selectedSale && (
        <SolutionModal
          isOpen={!!selectedSale}
          onClose={() => setSelectedSale(null)}
          sale={selectedSale}
          onSave={list.reload}
          masterData={masterData}
        />
      )}
    </div>
  );
}

// Subcomponent: Solution Modal
function SolutionModal({ isOpen, onClose, sale, onSave, masterData }) {
  const roleStorage = localStorage.getItem("o2d-auth-storage");
  let role = "admin";
  if (roleStorage) {
    try {
      const parsedData = JSON.parse(roleStorage);
      role = parsedData.state.user.role;
    } catch (e) {
      console.error(e);
    }
  }
  const [isCancelled, setIsCancelled] = useState(false);
  const [cancelRemarks, setCancelRemarks] = useState('');

  // Editable fields
  const [videoCallServicesSolve, setVideoCallServicesSolve] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [otpVerification, setOtpVerification] = useState('');
  const [remarks, setRemarks] = useState('');

  // Spare item rows
  const [itemRows, setItemRows] = useState([{ item: "", qty: "" }]);

  const [lastOtpGenerations, setLastOtpGenerations] = useState({});
  const [isResending, setIsResending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Audio recording upload — picked file only, actual upload happens at
  // submit time in handleSubmit (same as the main app's own VideoCallSolution.jsx).
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');

  useEffect(() => {
    if (sale) {
      setIsCancelled(false);
      setCancelRemarks('');
      setVideoCallServicesSolve('');
      setServiceType(sale.serviceType || '');
      setOtpVerification('');
      setRemarks('');
      setItemRows([{ item: "", qty: "" }]);
      setAudioFile(null);
      setAudioUrl(sale.audioUrl || '');
    }
  }, [sale]);

  const handleAudioFileSelect = (file) => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      toast.error("Audio file size exceeds the 10MB limit.");
      return;
    }
    setAudioFile(file);
  };

  const removeAudioFile = () => {
    setAudioFile(null);
    setAudioUrl('');
  };

  const uploadAudioToDrive = async (file) => {
    try {
      const path = `video_call/${sale.ticketId}_${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("ticket_enquiry")
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("ticket_enquiry").getPublicUrl(path);

      return { success: true, fileUrl: data.publicUrl };
    } catch (error) {
      console.error("Error uploading audio:", error);
      toast.error(error.message || "Failed to upload audio");
      return { success: false, error: error.message };
    }
  };

  useEffect(() => {
    const storedGenerations = localStorage.getItem("lastOtpGenerations");
    if (storedGenerations) {
      setLastOtpGenerations(JSON.parse(storedGenerations));
    }
  }, []);

  if (!sale) return null;

  const canGenerateOtp = (tId) => {
    if (!tId) return false;
    if (!lastOtpGenerations[tId]) return true;

    const lastGenDate = new Date(lastOtpGenerations[tId]);
    const today = new Date();

    return (
      lastGenDate.getDate() !== today.getDate() ||
      lastGenDate.getMonth() !== today.getMonth() ||
      lastGenDate.getFullYear() !== today.getFullYear()
    );
  };

  const handleResendOTP = async () => {
    const tId = sale.ticketId;
    if (!canGenerateOtp(tId)) {
      toast.error("You can only generate one OTP per day for this ticket");
      return;
    }

    setIsResending(true);
    const sixDigitNumber = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      // sale.id is the ticket's uuid (see loadSales above) — tickets.otp is
      // the live/regeneratable OTP column, same as the main app's own
      // "Resend OTP".
      const { error } = await supabase
        .from('sss_tickets')
        .update({ otp: sixDigitNumber })
        .eq('uuid', sale.id);

      if (error) throw error;

      const newGenerations = { ...lastOtpGenerations, [tId]: new Date().toISOString() };
      setLastOtpGenerations(newGenerations);
      localStorage.setItem("lastOtpGenerations", JSON.stringify(newGenerations));

      sale.afterVideoCallGenerateOTP = sixDigitNumber;
      sale.otp = sixDigitNumber;
      toast.success("OTP sent successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to send OTP");
    } finally {
      setIsResending(false);
    }
  };

  const handleAddItemRow = () => {
    if (itemRows.length < 15) {
      setItemRows([...itemRows, { item: "", qty: "" }]);
    }
  };

  const handleItemRowChange = (index, field, value) => {
    const newRows = [...itemRows];
    newRows[index][field] = value;
    setItemRows(newRows);
  };

  const handleDeleteItemRow = (index) => {
    if (itemRows.length > 1) {
      setItemRows(itemRows.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isCancelled) {
      if (!cancelRemarks.trim()) {
        toast.error("Please enter cancellation remarks");
        return;
      }

      setSubmitting(true);

      try {
        const { error } = await supabase.from('sss_cancelled_tickets').insert({
          ticket_id: sale.ticketId,
          ticket_uuid: sale.id,
          cancelled_from_stage: 'Video Call Solution',
          remarks: cancelRemarks.trim(),
        });

        if (error) throw error;

        toast.success("Ticket cancelled successfully");
        onSave();
        onClose();
      } catch (error) {
        console.error(error);
        toast.error("Failed to cancel ticket");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!videoCallServicesSolve) {
      toast.error("Please Select Video Call Services");
      return;
    }

    if (videoCallServicesSolve === "no" && !serviceType) {
      toast.error("Please Select Service Type");
      return;
    }

    if (videoCallServicesSolve === "yes") {
      if (!otpVerification || otpVerification.toString().trim() !== sale.afterVideoCallGenerateOTP.toString().trim()) {
        toast.error("Wrong OTP, Please Enter Right OTP");
        return;
      }
    } else if (videoCallServicesSolve === "no") {
      const validRows = itemRows.filter(row => row.item.trim() !== "" && row.qty.toString().trim() !== "");
      if (validRows.length === 0) {
        toast.error("Please add at least one item and quantity.");
        return;
      }

      const hasEmptyField = itemRows.some(row => {
        return (row.item.trim() !== "" && !row.qty) || (row.item.trim() === "" && row.qty);
      });
      if (hasEmptyField) {
        toast.error("Please complete both Item Name and Quantity for all rows.");
        return;
      }
    }

    setSubmitting(true);

    try {
      // Every submission is its own attempt row (see loadSales above) —
      // same shape as the main app's own src/pages/VideoCallSolution.jsx insert.
      const insertPayload = {
        ticket_id: sale.ticketId,
        ticket_uuid: sale.id,
        enquiry_solved: videoCallServicesSolve,
        regeneration_status: videoCallServicesSolve === "yes" ? "Verified" : "Skipped",
        remarks: remarks || "",
      };

      if (videoCallServicesSolve === "yes") {
        insertPayload.otp_generation = sale.otp || "";
      }

      if (videoCallServicesSolve === "no") {
        insertPayload.item_qty = itemRows
          .filter((row) => row.item.trim() !== "")
          .map((row) => ({ item: row.item.trim(), qty: row.qty }));
        insertPayload.service_type = serviceType || "";

        // Audio only uploads now, at submit time — not when the file was picked.
        if (audioFile) {
          const uploadResult = await uploadAudioToDrive(audioFile);
          if (!uploadResult.success) {
            throw new Error(uploadResult.error || "Failed to upload audio");
          }
          insertPayload.audio_link = uploadResult.fileUrl;
        } else {
          insertPayload.audio_link = audioUrl || "";
        }
      }

      const { error } = await supabase.from('sss_video_call').insert(insertPayload);
      if (error) throw error;

      toast.success("Submitted successfully");
      onSave();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Failed to save solution details");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "block w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all";
  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block";

  const locations = masterData["Service Location"] || [];
  const itemNames = masterData["Item-Name"] || [];

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={`Solution for Ticket: ${sale.ticketId}`} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Ticket Info Bar */}
        <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block">Client Name</span>
            <span className="font-bold text-slate-700">{sale.clientName}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block">Phone Number</span>
            <span className="font-semibold text-slate-600">{sale.phoneNumber}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block">Machine Name</span>
            <span className="font-bold text-slate-700">{sale.machineName || "N/A"}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-slate-400 block">Date Logged</span>
            <span className="font-semibold text-slate-600">{formatDate(sale.timeStemp)}</span>
          </div>
        </div>

        {/* Cancel Ticket Checkbox */}
        {role === "admin" && (
          <div className="flex items-center space-x-2 border-y border-slate-100 py-3">
            <input
              type="checkbox"
              id="cancelTicket"
              checked={isCancelled}
              onChange={(e) => setIsCancelled(e.target.checked)}
              className="h-4 w-4 text-red-600 focus:ring-red-500 border-slate-350 rounded cursor-pointer"
            />
            <label htmlFor="cancelTicket" className="text-xs font-bold text-rose-600 cursor-pointer select-none">
              Cancel Ticket
            </label>
          </div>
        )}

        {!isCancelled ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Video Call Services Solve *</label>
                <select
                  value={videoCallServicesSolve}
                  onChange={(e) => setVideoCallServicesSolve(e.target.value)}
                  required
                  className={inputCls}
                >
                  <option value="">Select option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>

            {videoCallServicesSolve === "no" && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Service Type *</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    required
                    className={inputCls}
                  >
                    <option value="">Select Service Type</option>
                    {locations.map((name, idx) => (
                      <option key={idx} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Audio Recording Upload */}
                <div>
                  <label className={labelCls}>Audio Recording (max 10MB)</label>
                  {audioFile ? (
                    <div className="flex items-center justify-between border border-indigo-200 rounded-xl p-2.5 bg-indigo-50 text-indigo-800 text-xs">
                      <span className="truncate max-w-[70%]" title={audioFile.name}>
                        {audioFile.name}
                      </span>
                      <button
                        type="button"
                        onClick={removeAudioFile}
                        className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ) : audioUrl ? (
                    <div className="flex items-center justify-between border border-emerald-200 rounded-xl p-2.5 bg-emerald-50 text-emerald-800 text-xs">
                      <a href={audioUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline truncate max-w-[70%]">
                        View Uploaded Audio
                      </a>
                      <button
                        type="button"
                        onClick={removeAudioFile}
                        className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleAudioFileSelect(e.target.files[0]);
                        }
                      }}
                      className={inputCls}
                    />
                  )}
                </div>

                {/* Spare Item Quantity Table */}
                {/* No overflow-hidden here — it would clip the Item Name
                    combobox's dropdown list, which pops below each row. */}
                <div className="border border-slate-150 rounded-xl bg-white">
                  <div className="flex justify-between items-center p-3 bg-slate-50 border-b border-slate-150 rounded-t-xl">
                    <span className="text-xs font-bold text-slate-700">Spare Item & Qty Details</span>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      disabled={itemRows.length >= 15}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      + Add Row ({itemRows.length}/15)
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left border-b border-slate-150">
                        <th className="p-3">Item Name *</th>
                        <th className="p-3 w-32">Qty *</th>
                        <th className="p-3 w-16 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itemRows.map((row, index) => (
                        <tr key={index}>
                          <td className="p-2.5">
                            <ItemNameCombo
                              value={row.item}
                              onChange={(value) => handleItemRowChange(index, "item", value)}
                              options={itemNames}
                              required={index === 0}
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="number"
                              min="1"
                              required={index === 0}
                              placeholder="Qty"
                              value={row.qty}
                              onChange={(e) => handleItemRowChange(index, "qty", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:bg-white text-xs"
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteItemRow(index)}
                              disabled={itemRows.length <= 1}
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded disabled:opacity-40 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {videoCallServicesSolve === "yes" && (
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className={labelCls}>OTP Verification *</label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="Enter 6-digit OTP"
                      value={otpVerification}
                      onChange={(e) => setOtpVerification(e.target.value)}
                      required
                      className={`${inputCls} text-center font-bold text-sm tracking-wider`}
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={canGenerateOtp(sale.ticketId) ? handleResendOTP : null}
                      disabled={!canGenerateOtp(sale.ticketId) || isResending}
                      className={`w-full py-2.5 px-4 text-xs font-bold text-white rounded-xl shadow-sm transition-all ${canGenerateOtp(sale.ticketId)
                        ? "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
                        : "bg-slate-350 cursor-not-allowed"
                        }`}
                    >
                      {isResending ? "Sending OTP..." : "Send OTP"}
                    </button>
                    {!canGenerateOtp(sale.ticketId) && (
                      <p className="text-[10px] text-slate-400 mt-1 text-center font-semibold">
                        Next OTP available tomorrow
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(videoCallServicesSolve === "yes" || videoCallServicesSolve === "no") && (
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
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Cancellation Remarks *</label>
              <textarea
                value={cancelRemarks}
                onChange={(e) => setCancelRemarks(e.target.value)}
                required
                placeholder="Enter reasons for cancellation..."
                rows={4}
                className={`${inputCls} border-rose-200 focus:ring-rose-500`}
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
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
            className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl transition-all shadow-sm ${isCancelled
              ? "bg-rose-600 hover:bg-rose-700 disabled:bg-rose-450"
              : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-450"
              }`}
          >
            {submitting ? <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </> : isCancelled ? 'Confirm Cancellation' : 'Submit Solution'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

// Subcomponent: searchable Item Name dropdown (typing filters the same
// master "Item-Name" list the plain <select> options used to come from).
function ItemNameCombo({ value, onChange, options, required }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes((value || '').toLowerCase())
  );

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        required={required}
        placeholder="Search item..."
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:bg-white text-xs"
      />
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {filteredOptions.map((opt) => (
            <div
              key={opt}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
              className="px-2.5 py-1.5 text-xs text-slate-600 hover:bg-indigo-50 cursor-pointer select-none"
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
