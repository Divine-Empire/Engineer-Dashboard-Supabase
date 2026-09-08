import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import TableWrapper from '../../components/TableWrapper';
import ModalWrapper from '../../components/ModalWrapper';
import formatDate from '../../utils/formatDate';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase/client';
import { fetchDropdownRows } from '../../lib/supabase/dropdown';

const INITIAL_COLUMNS = [
  'Ticket-ID',
  'Company Name',
  'Client Name',
  'Phone Number',
  'Machine Name',
  'Mention Issue',
  'Call Time',
];

const ALL_COLUMNS = [
  'Ticket-ID',
  'Company Name',
  'Client Name',
  'Phone Number',
  'Machine Name',
  'Mention Issue',
  'Call Time',
  'Date',
  'Source of enquiry',
  'Call type',
  'Enquiry Receiver Name',
  'Client Type',
  'GST Address',
  'Site Address',
  'GST No.',
  'Category',
  'Service Location',
];

const formatDateTime = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

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

export default function VideoCall() {
  const [sales, setSales] = useState([]); // using 'sales' to keep naming consistent with pagination state
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedSale, setSelectedSale] = useState(null); // the selected ticket for the modal
  const [fetchLoading, setFetchLoading] = useState(false);
  const [masterData, setMasterData] = useState({});
  const [selectedColumns, setSelectedColumns] = useState(INITIAL_COLUMNS);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleColumnToggle = (colName) => {
    setSelectedColumns((prev) => {
      if (prev.includes(colName)) {
        return prev.filter((col) => col !== colName);
      } else {
        return [...prev, colName];
      }
    });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isDropdownOpen && !event.target.closest('.columns-dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const activeColumns = useMemo(() => {
    return ALL_COLUMNS.filter(col => selectedColumns.includes(col));
  }, [selectedColumns]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');



  // Tickets ready for Video-Call: sss_warranty_check.video_call_planned set.
  // Pending = no attempt yet, or the latest attempt is 'rescheduled' (a
  // ticket only leaves Video-Call once an attempt lands on 'yes'/'no') —
  // same logic as the main app's src/pages/VideoCallSolution.jsx.
  const loadSales = async () => {
    setFetchLoading(true);
    try {
      const { data: warrantyRows, error: warrantyError } = await supabase
        .from('sss_warranty_check')
        .select('ticket_id, video_call_planned')
        .not('video_call_planned', 'is', null);

      if (warrantyError) throw warrantyError;

      const ticketIds = [...new Set((warrantyRows || []).map((w) => w.ticket_id))];

      if (ticketIds.length === 0) {
        setSales([]);
        return;
      }

      const [ticketsRes, attemptsRes] = await Promise.all([
        supabase.from('sss_tickets').select('*').in('ticket_id', ticketIds),
        supabase.from('sss_video_call').select('*').in('ticket_id', ticketIds).order('created_at', { ascending: false }),
      ]);

      if (ticketsRes.error) throw ticketsRes.error;
      if (attemptsRes.error) throw attemptsRes.error;

      const latestAttemptByTicket = new Map();
      (attemptsRes.data || []).forEach((a) => {
        if (!latestAttemptByTicket.has(a.ticket_id)) latestAttemptByTicket.set(a.ticket_id, a);
      });

      const allData = (ticketsRes.data || []).map((t) => {
        const latest = latestAttemptByTicket.get(t.ticket_id);
        const isPending = !latest || latest.enquiry_solved === 'rescheduled';

        return {
          id: t.uuid, // ticket_uuid — used for updates/uploads, not a sheet row index anymore
          timeStemp: String(t.created_at || "").trim(),
          ticketId: String(t.ticket_id || "").trim(),
          clientName: String(t.client_name || "").trim(),
          phoneNumber: String(t.phone_number || "").trim(),
          category: String(t.category || "").trim(),
          callType: String(t.call_type || "").trim(),
          requirementServiceCategory: String(t.category || "").trim(),
          videoCall: String(t.video_call || "").trim(),
          sourceOfEnquiry: String(t.source_of_enquiry || "").trim(),
          enquiryReceiverName: String(t.enquiry_receiver_name || "").trim(),
          clientType: String(t.client_type || "").trim(),
          gstNo: String(t.gst_no || "").trim(),
          mentionIssue: String(t.mention_issue || "").trim(),
          machineName: String(t.machine_name || "").trim(),
          enquiryType: String(t.enquiry_type || "").trim(),
          siteName: String(t.site_address || "").trim(),
          companyName: String(t.company_name || "").trim(),
          gstAddress: String(t.gst_address || "").trim(),
          siteAddress: String(t.site_address || "").trim(),
          // Both "primary" and "final assign" collapse to the one
          // sss_tickets.engineer_assign column in the new schema.
          engineerAssign: String(t.engineer_assign || "").trim(),
          engineerAssignFA: String(t.engineer_assign || "").trim(),
          serviceLocation: String(t.service_location || "").trim(),
          otp: String(t.otp || "").trim(),
          afterVideoCallGenerateOTP: String(t.otp || "").trim(),
          planned2: String(t.warranty_check_planned || "planned").trim(), // presence only — gating already done above
          actual2: isPending ? "" : String(latest.created_at || "").trim(),
          videoCallServicesSolve: latest ? String(latest.enquiry_solved || "").trim() : "",
          serviceType: latest ? String(latest.service_type || "").trim() : "",
          otpVarificationStatus: latest ? String(latest.regeneration_status || "").trim() : "",
          audioUrl: latest ? String(latest.audio_link || "").trim() : "",
          CREName: String(t.cre_name || "").trim(),
          remarks: latest ? String(latest.remarks || "").trim() : "",
          itemQty: latest && latest.item_qty ? JSON.stringify(latest.item_qty) : "",
          videoCallTime: formatCallTime(String(t.video_call_time || "").trim()),
        };
      });

      setSales(allData);
    } catch (error) {
      console.error("Error fetching video call data:", error);
      toast.error("Failed to load live data");
    } finally {
      setFetchLoading(false);
    }
  };

  const DROPDOWN_CATEGORY_TO_KEY = {
    service_location: 'Service Location',
    engineer_assign_name: 'Engineer Assign Name',
    item_name: 'Item-Name',
  };

  const fetchMasterSheet = async () => {
    try {
      // Paginated fetch — a plain unpaginated .select() silently truncates
      // at Supabase's default 1000-row cap, which item_name alone blows
      // past on its own (~1400 rows), dropping other categories' values.
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

      setMasterData(structuredData);
    } catch (error) {
      console.error("Error fetching master data:", error);
    }
  };

  useEffect(() => {
    loadSales();
    fetchMasterSheet();
    const handleRefresh = () => loadSales();
    window.addEventListener('refresh_sales', handleRefresh);
    return () => window.removeEventListener('refresh_sales', handleRefresh);
  }, []);

  const userName = localStorage.getItem("currentUsername");
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

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(sales.map(s => s.category).filter(Boolean))).sort();
  }, [sales]);

  const uniqueLocations = useMemo(() => {
    return Array.from(new Set(sales.map(s => s.serviceLocation).filter(Boolean))).sort();
  }, [sales]);

  const filteredSales = sales
    .filter((ticket) => {
      // Tab filtering
      if (activeTab === 'pending') {
        if (ticket.actual2 !== "") return false;
      } else if (activeTab === 'history') {
        if (ticket.actual2 === "") return false;
      }

      // Role-based filtering
      if (role === "user" && ticket.CREName !== userName) return false;
      if (role === "engineer" && ticket.engineerAssignFA !== userName) return false;

      // Category filter
      if (selectedCategory !== 'all' && ticket.category !== selectedCategory) return false;

      // Location filter
      if (selectedLocation !== 'all' && ticket.serviceLocation !== selectedLocation) return false;

      // Search filter
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        String(ticket.ticketId || "").toLowerCase().includes(q) ||
        String(ticket.enquiryReceiverName || "").toLowerCase().includes(q) ||
        String(ticket.companyName || "").toLowerCase().includes(q) ||
        String(ticket.clientName || "").toLowerCase().includes(q) ||
        String(ticket.phoneNumber || "").includes(q);
      return matchesSearch;
    });

  return (
    <div className="space-y-5 flex-1 flex flex-col min-h-0 overflow-hidden pr-1">
      {/* Filter Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
        {/* Tab Selection */}
        <div className="flex border border-slate-250 bg-slate-50/50 p-1 rounded-xl gap-1">
          <button
            onClick={() => { setActiveTab('pending'); }}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'pending'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
          >
            Pending ({sales.filter(t => t.actual2 === "" && (role !== "user" || t.CREName === userName) && (role !== "engineer" || t.engineerAssignFA === userName)).length})
          </button>
          <button
            onClick={() => { setActiveTab('history'); }}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'history'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
          >
            History ({sales.filter(t => t.actual2 !== "" && (role !== "user" || t.CREName === userName) && (role !== "engineer" || t.engineerAssignFA === userName)).length})
          </button>
        </div>

        {/* Filters and Search Bar */}
        <div className="grid grid-cols-2 md:flex md:items-center gap-3 w-full md:w-auto">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="block text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer h-9 w-full md:w-auto"
          >
            <option value="all">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Service Location Filter */}
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="block text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer h-9 w-full md:w-auto"
          >
            <option value="all">All Locations</option>
            {uniqueLocations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>

          {/* Search Bar */}
          <div className="relative w-full md:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); }}
              className="block w-full pl-8.5 pr-3 py-1.5 text-xs bg-slate-50/50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all pl-10"
            />
          </div>

          {/* Columns Dropdown */}
          <div className="relative columns-dropdown-container w-full md:w-auto">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-slate-50/50 hover:bg-slate-100/75 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all font-bold h-9 cursor-pointer shadow-sm select-none w-full md:w-auto"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              <span>Columns</span>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-100 mb-1">
                  Visible Columns
                </div>
                {ALL_COLUMNS.map((col) => {
                  const isChecked = selectedColumns.includes(col);
                  return (
                    <label
                      key={col}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-all text-slate-600 hover:text-slate-950 hover:bg-indigo-50/40 select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleColumnToggle(col)}
                        className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer transition-colors"
                      />
                      <span>{col}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 flex flex-col justify-between gap-4">
        <TableWrapper
          headers={['Action', ...activeColumns]}
          data={filteredSales}
          emptyMessage={fetchLoading ? <>
            {/* spinner */}
            <div className="flex items-center justify-center flex-col ">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
              <p>Loading...</p>
            </div>
          </> : "No entries found in this folder."}
          renderCard={(ticket) => {
            const isPending = activeTab === 'pending';
            const statusBorder = isPending ? "border-l-blue-500" : "border-l-emerald-500";
            return (
              <div key={ticket.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 relative border-l-4 ${statusBorder}`}>
                {/* Top Right Action Button or Status */}
                <div className="absolute top-4 right-4">
                  {isPending ? (
                    <button
                      onClick={() => setSelectedSale(ticket)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      Solution
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 border border-emerald-250 py-1 px-2.5 rounded-lg">
                      Solved
                    </span>
                  )}
                </div>

                {/* Header / Info */}
                <div className="pr-24">
                  {activeColumns.includes('Ticket-ID') && (
                    <span className="text-[10px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {ticket.ticketId}
                    </span>
                  )}
                  {activeColumns.includes('Date') && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      {formatDate(ticket.timeStemp)}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    {activeColumns.includes('Client Name') && (
                      <div>
                        <p className="text-slate-500 font-medium">Client Name</p>
                        <p className="text-slate-800 font-semibold">{ticket.clientName || "N/A"}</p>
                      </div>
                    )}
                    {activeColumns.includes('Company Name') && (
                      <div>
                        <p className="text-slate-500 font-medium">Company Name</p>
                        <p className="text-slate-800 font-semibold">{ticket.companyName || "N/A"}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {activeColumns.includes('Phone Number') && (
                      <div>
                        <p className="text-slate-500 font-medium">Phone Number</p>
                        <p className="text-slate-800">{ticket.phoneNumber || "N/A"}</p>
                      </div>
                    )}
                    {activeColumns.includes('Machine Name') && (
                      <div>
                        <p className="text-slate-500 font-medium">Machine Name</p>
                        <p className="text-slate-800">{ticket.machineName || "N/A"}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {activeColumns.includes('Call Time') && (
                      <div>
                        <p className="text-slate-500 font-medium">Call Time</p>
                        <p className="text-slate-800">{ticket.videoCallTime || "N/A"}</p>
                      </div>
                    )}
                    {activeColumns.includes('Service Location') && (
                      <div>
                        <p className="text-slate-500 font-medium">Service Location</p>
                        <p className="text-slate-800">{ticket.serviceLocation || "N/A"}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {activeColumns.includes('Category') && (
                      <div>
                        <p className="text-slate-500 font-medium">Category</p>
                        <p className="text-slate-800">{ticket.category || "N/A"}</p>
                      </div>
                    )}
                    {activeColumns.includes('Client Type') && (
                      <div>
                        <p className="text-slate-500 font-medium">Client Type</p>
                        <p className="text-slate-800">{ticket.clientType || "N/A"}</p>
                      </div>
                    )}
                  </div>

                  {activeColumns.includes('Mention Issue') && ticket.mentionIssue && (
                    <div className="pt-1">
                      <p className="text-slate-500 font-medium">Mention Issue</p>
                      <p className="text-slate-700">{ticket.mentionIssue}</p>
                    </div>
                  )}

                  {activeColumns.includes('GST Address') && ticket.gstAddress && (
                    <div className="pt-1 bg-slate-50 p-2 rounded-lg">
                      <p className="text-slate-500 font-medium text-[10px]">GST Address</p>
                      <p className="text-[11px] text-slate-700">{ticket.gstAddress}</p>
                    </div>
                  )}

                  {activeColumns.includes('Site Address') && ticket.siteAddress && (
                    <div className="pt-1 bg-slate-50 p-2 rounded-lg">
                      <p className="text-slate-500 font-medium text-[10px]">Site Address</p>
                      <p className="text-[11px] text-slate-700">{ticket.siteAddress}</p>
                    </div>
                  )}

                  {activeColumns.includes('GST No.') && ticket.gstNo && (
                    <div className="pt-1">
                      <p className="text-slate-500 font-medium">GST No.</p>
                      <p className="text-slate-800 font-mono">{ticket.gstNo}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          }}
          renderRow={(ticket) => (
            <tr key={ticket.id} className="hover:bg-indigo-50/30 transition-colors">
              <td className="px-5 py-3.5">
                {activeTab === 'pending' ? (
                  <button
                    onClick={() => setSelectedSale(ticket)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Solution
                  </button>
                ) : (
                  <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 border border-emerald-250 py-1 px-2.5 rounded-lg">
                    Solved
                  </span>
                )}
              </td>
              {activeColumns.map((colName) => {
                switch (colName) {
                  case 'Date':
                    return (
                      <td key="Date" className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-600">
                        {formatDate(ticket.timeStemp)}
                      </td>
                    );
                  case 'Ticket-ID':
                    return (
                      <td key="Ticket-ID" className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-xs font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{ticket.ticketId}</span>
                      </td>
                    );
                  case 'Source of enquiry':
                    return (
                      <td key="Source of enquiry" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.sourceOfEnquiry}
                      </td>
                    );
                  case 'Call type':
                    return (
                      <td key="Call type" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.callType}
                      </td>
                    );
                  case 'Enquiry Receiver Name':
                    return (
                      <td key="Enquiry Receiver Name" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.enquiryReceiverName}
                      </td>
                    );
                  case 'Client Type':
                    return (
                      <td key="Client Type" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.clientType}
                      </td>
                    );
                  case 'Company Name':
                    return (
                      <td key="Company Name" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.companyName}
                      </td>
                    );
                  case 'Client Name':
                    return (
                      <td key="Client Name" className="px-5 py-3.5 text-xs font-bold text-slate-800">
                        {ticket.clientName}
                      </td>
                    );
                  case 'Phone Number':
                    return (
                      <td key="Phone Number" className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                        {ticket.phoneNumber}
                      </td>
                    );
                  case 'GST Address':
                    return (
                      <td key="GST Address" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.gstAddress}
                      </td>
                    );
                  case 'Site Address':
                    return (
                      <td key="Site Address" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.siteAddress}
                      </td>
                    );
                  case 'GST No.':
                    return (
                      <td key="GST No." className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.gstNo}
                      </td>
                    );
                  case 'Machine Name':
                    return (
                      <td key="Machine Name" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.machineName}
                      </td>
                    );
                  case 'Category':
                    return (
                      <td key="Category" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.category}
                      </td>
                    );
                  case 'Mention Issue':
                    return (
                      <td key="Mention Issue" className="px-5 py-3.5 text-xs text-slate-600 max-w-[200px] truncate" title={ticket.mentionIssue}>
                        {ticket.mentionIssue}
                      </td>
                    );
                  case 'Call Time':
                    return (
                      <td key="Call Time" className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                        {ticket.videoCallTime || "N/A"}
                      </td>
                    );
                  case 'Service Location':
                    return (
                      <td key="Service Location" className="px-5 py-3.5 text-xs text-slate-600">
                        {ticket.serviceLocation}
                      </td>
                    );
                  default:
                    return null;
                }
              })}
            </tr>
          )}
        />

      </div>

      {/* Workflow Modal */}
      {selectedSale && (
        <SolutionModal
          isOpen={!!selectedSale}
          onClose={() => setSelectedSale(null)}
          sale={selectedSale}
          onSave={loadSales}
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
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

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
    setIsUploadingAudio(true);
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
    } finally {
      setIsUploadingAudio(false);
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
