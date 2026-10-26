import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Phone,
  ClipboardCheck,
  Calendar,
  ClipboardList,
  Loader2Icon,
  Plus,
} from 'lucide-react';
import MetricCard from '../../components/MetricCard';
import { DataTable, StatusBadge, FilterSearch } from '../../components/shared';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchViewPage, countView, scopeBy } from '../../lib/pagedView';
import { fetchAllRows } from '../../utils/fetchAllRows';
import { useDebounced } from '../../hooks/use-stage-list';
import VisitCalendarModal from './VisitCalendarModal';
import { useAuthStore } from '../../store/authStore';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { supabase } from '../../lib/supabase/client';
import { computeStagePlanned } from '../../lib/supabase/stagePlanning';

//------------------------------------------------
//*ADDITIONAL IMPORTS NEEDED FOR NEW ENQUIRY MODAL
//------------------------------------------------
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card"
import { Button } from '../../components/ui/button';
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Modal } from "../../components/ui/modal";
import toast from 'react-hot-toast';
import { Textarea } from "../../components/ui/textarea";

const IST_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const getISTComponents = (date) => {
  const parts = {};
  IST_FORMATTER.formatToParts(date).forEach((p) => {
    if (p.type !== "literal") parts[p.type] = parseInt(p.value, 10);
  });
  return { year: parts.year, month: parts.month - 1, day: parts.day };
};

const parseIST = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") return null;

  if (dateStr.includes("T") || dateStr.endsWith("Z")) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return getISTComponents(d);
    return null;
  }

  if (dateStr.includes("/")) {
    const datePart = dateStr.split(" ")[0];
    const parts = datePart.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) return { day, month, year };
    }
  }

  if (dateStr.includes("-")) {
    const datePart = dateStr.split(" ")[0];
    const parts = datePart.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) return { day, month, year };
    }
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) return { day, month, year };
    }
  }

  return null;
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

// ── Data (all server-side: counts, the "latest" list and the calendar window come from SQL) ──
// Video Call numbers use the same views as the Video Call page (Database/03), so a card always
// equals that page's tab count. Engineers see their own tickets, admins everything.
const VC_VIEWS = { pending: 'engg_v_video_call_pending', history: 'engg_v_video_call_history', all: 'engg_v_video_call_all' };

const mapVcRow = (r) => ({
  id: r.id,
  timeStemp: r.ticket_created_at || '',
  ticketId: r.ticket_id || '',
  clientName: r.client_name || '',
  companyName: r.company_name || '',
  category: r.category || '',
  phoneNumber: r.phone_number || '',
  actual2: r.is_pending ? '' : String(r.attempt_created_at || '').trim(),
});

// Material Testing comes from the PFMS project through the server-side proxy, one small
// page per call. Pending/Completed counts ride along on every response (same rule as the
// Material Testing page: a lift's own pendingQty > 0 is Pending; cancelled indents excluded).
async function fetchQc({ tab, search }) {
  const qs = new URLSearchParams({ action: 'list', tab, page: 1, pageSize: 8, search, newestFirst: '1' });
  const res = await fetch(`/api/material-testing?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const mapQcRow = (r) => ({
  id: r.id,
  indentNumber: String(r.data.indentNumber || '').trim(),
  liftNo: String(r.data.liftNo || '').trim(),
  itemName: String(r.data.itemName || '').trim(),
  receivedQty: r.data.receivedQty || '0',
  approvedQty: r.data.approvedQty || 0,
  status: r.status,
});

async function loadEngineerNames() {
  const { data, error } = await supabase.from('sss_dropdown').select('value').eq('category', 'engineer_assign_name');
  if (error) throw error;
  return [...new Set((data || []).map((r) => String(r.value || '').trim()).filter(Boolean))];
}

// Calendar events overlapping [start, end] (YYYY-MM-DD) from engg_v_calendar_events (Database/06).
async function fetchCalendarEvents({ start, end }, scope) {
  const { data, error } = await fetchAllRows(() => {
    let q = supabase.from('engg_v_calendar_events').select('*').lte('start_on', end).gte('end_on', start).order('ev_id');
    if (scope) q = scope(q);
    return q;
  });
  if (error) throw error;
  return (data || []).map((r, index) => ({
    id: index + 1,
    ticketId: r.ticket_id || '',
    companyName: r.company_name || '',
    clientName: r.client_name || '',
    phoneNumber: r.phone_number || '',
    mentionIssue: r.mention_issue || '',
    engineerAssign: r.engineer_assign || '',
    dateOfVisit: r.date_of_visit || '',
    travelDate: r.travel_date || '',
    returnDate: r.return_date || '',
    expectedCompletionDate: r.expected_completion_date || '',
    expectedCompletionTime: r.type === 'Video Call' ? formatCallTime(String(r.video_call_time || '').trim()) : r.expected_completion_time || '',
    CREName: r.cre_name || '',
    type: r.type,
  }));
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Dashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [vcSearchTerm, setVcSearchTerm] = useState('');
  const [vcStatusFilter, setVcStatusFilter] = useState('all');

  const [mtSearchTerm, setMtSearchTerm] = useState('');
  const [mtStatusFilter, setMtStatusFilter] = useState('all');

  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isTodayAvailabilityOpen, setIsTodayAvailabilityOpen] = useState(false);
  const [calRange, setCalRange] = useState(null); // visible calendar window { start, end }

  const isEngineer = user?.role === 'ENGINEER';
  const scope = useMemo(
    () => (isEngineer ? scopeBy(['engineer_assign'], [user?.name, user?.id]) : null),
    [isEngineer, user?.name, user?.id]
  );
  const scopeKey = isEngineer ? `eng:${user?.id}` : 'all';
  const debouncedVcSearch = useDebounced(vcSearchTerm, 350);

  const vcPendingQ = useQuery({ queryKey: ['dash', 'vc-count', 'pending', scopeKey], queryFn: () => countView(VC_VIEWS.pending, { scope }) });
  const vcSolvedQ = useQuery({ queryKey: ['dash', 'vc-count', 'solved', scopeKey], queryFn: () => countView(VC_VIEWS.history, { scope }) });
  const vcView = vcStatusFilter === 'pending' ? VC_VIEWS.pending : vcStatusFilter === 'solved' ? VC_VIEWS.history : VC_VIEWS.all;
  const vcListQ = useQuery({
    queryKey: ['dash', 'vc-list', vcView, scopeKey, debouncedVcSearch],
    queryFn: () => fetchViewPage(vcView, { page: 1, pageSize: 8, search: debouncedVcSearch, scope, order: [{ column: 'ticket_created_at', ascending: false }] }),
    placeholderData: keepPreviousData,
  });
  const debouncedMtSearch = useDebounced(mtSearchTerm, 350);
  const mtTab = mtStatusFilter === 'pending' ? 'pending' : mtStatusFilter === 'completed' ? 'history' : 'all';
  const qcQ = useQuery({
    queryKey: ['dash', 'qc', mtTab, debouncedMtSearch],
    queryFn: () => fetchQc({ tab: mtTab, search: debouncedMtSearch }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const engineersQ = useQuery({ queryKey: ['dash', 'engineers'], queryFn: loadEngineerNames, staleTime: 10 * 60_000 });
  const calQ = useQuery({
    queryKey: ['dash', 'cal', calRange?.start, calRange?.end, scopeKey],
    enabled: isCalendarModalOpen && !!calRange,
    queryFn: () => fetchCalendarEvents(calRange, scope),
    placeholderData: keepPreviousData,
  });
  const todayStr = ymd(new Date());
  const todayQ = useQuery({
    queryKey: ['dash', 'cal', todayStr, todayStr, 'all'],
    enabled: isTodayAvailabilityOpen,
    queryFn: () => fetchCalendarEvents({ start: todayStr, end: todayStr }, null),
  });

  const statsLoading = vcPendingQ.isPending || vcSolvedQ.isPending || qcQ.isPending;
  const videoCallStats = { pending: vcPendingQ.data ?? 0, solved: vcSolvedQ.data ?? 0 };
  const materialTestingStats = { pending: qcQ.data?.counts?.pending ?? 0, completed: qcQ.data?.counts?.completed ?? 0 };
  const masterData = useMemo(() => [{ "Engineer Assign Name": engineersQ.data || [] }], [engineersQ.data]);
  // Today's events for every engineer — what Today's Availability works from.
  const siteVisitHistory = useMemo(() => todayQ.data || [], [todayQ.data]);
  const calendarEvents = useMemo(() => calQ.data || [], [calQ.data]);
  const filteredTickets = useMemo(() => (vcListQ.data?.rows || []).map(mapVcRow), [vcListQ.data]);

  const filteredQcChecks = useMemo(() => (qcQ.data?.rows || []).map(mapQcRow), [qcQ.data]);

  const engineersList = useMemo(() => {
    const masterEngs = masterData[0]?.["Engineer Assign Name"] || [];
    if (masterEngs.length > 0) return [...new Set(masterEngs)].sort();
    return [...new Set(siteVisitHistory.map((t) => t.engineerAssign).filter(Boolean))].sort();
  }, [masterData, siteVisitHistory]);

  const getTodayAvailability = (engineer) => {
    const today = new Date();
    const cellDate = {
      day: today.getDate(),
      month: today.getMonth(),
      year: today.getFullYear(),
    };

    const busyMinutes = new Array(600).fill(false);
    let statusText = "Available all day (9 AM - 7 PM)";
    let isPendingTADA = false;

    // Filter tickets assigned to this engineer
    const engVisits = siteVisitHistory.filter(ticket =>
      ticket.engineerAssign &&
      String(ticket.engineerAssign).toLowerCase() === String(engineer).toLowerCase()
    );

    const cellVal = cellDate.year * 10000 + (cellDate.month + 1) * 100 + cellDate.day;

    for (const ticket of engVisits) {
      if (!ticket.dateOfVisit) continue;
      const parsedVisit = parseIST(ticket.dateOfVisit);
      if (!parsedVisit) continue;

      const parsedTravel = ticket.travelDate ? parseIST(ticket.travelDate) : null;
      const visitVal = parsedTravel ? (parsedTravel.year * 10000 + (parsedTravel.month + 1) * 100 + parsedTravel.day) : (parsedVisit.year * 10000 + (parsedVisit.month + 1) * 100 + parsedVisit.day);

      const rawCompDate = ticket.expectedCompletionDate || ticket.returnDate;
      const rawCompTime = ticket.expectedCompletionTime;

      let compVal = visitVal;

      if (rawCompDate) {
        const parsedComp = parseIST(rawCompDate);
        if (parsedComp) {
          compVal = parsedComp.year * 10000 + (parsedComp.month + 1) * 100 + parsedComp.day;
        }
      }

      // If selected date (today) is outside of [visitVal, compVal], ignore this ticket
      if (cellVal < visitVal || cellVal > compVal) {
        continue;
      }

      const formatDateLabel = (dateStr) => {
        if (!dateStr) return "";
        const parsed = parseIST(dateStr);
        if (!parsed) return dateStr;
        const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${parsed.day} ${monthsShort[parsed.month]}`;
      };

      const formatTime12h = (timeStr) => {
        if (!timeStr) return "";
        const parts = timeStr.split(":");
        if (parts.length < 2) return timeStr;
        let hrs = parseInt(parts[0], 10);
        const mins = parseInt(parts[1], 10);
        if (isNaN(hrs) || isNaN(mins)) return timeStr;
        const ampm = hrs >= 12 ? "PM" : "AM";
        hrs = hrs % 12;
        if (hrs === 0) hrs = 12;
        const minsStr = String(mins).padStart(2, "0");
        return `${hrs}:${minsStr} ${ampm}`;
      };

      const getRelativeMinutes = (timeStr) => {
        if (!timeStr) return 600;
        const parts = timeStr.split(":");
        if (parts.length < 2) return 600;
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        if (isNaN(hours) || isNaN(minutes)) return 600;
        const totalMinutes = hours * 60 + minutes;
        const nineAM = 9 * 60; // 540
        return Math.max(0, Math.min(600, totalMinutes - nineAM));
      };

      if (ticket.type === "Video Call") {
        const timeStr = rawCompTime || "10:00";
        const startMin = getRelativeMinutes(timeStr);
        const endMin = startMin + 30; // 30 mins slot
        for (let m = startMin; m < Math.min(600, endMin); m++) busyMinutes[m] = true;
        statusText = `Video Call at ${formatTime12h(timeStr)}`;
        continue;
      }

      if (ticket.type === "Repair") {
        const startMin = 120; // 11:00 AM
        const endMin = 360;   // 3:00 PM
        for (let m = startMin; m < endMin; m++) busyMinutes[m] = true;
        statusText = "Repair Stage";
        continue;
      }

      if (cellVal > visitVal && cellVal < compVal) {
        for (let m = 0; m < 600; m++) busyMinutes[m] = true;
        statusText = `Busy: expected completion on ${formatDateLabel(rawCompDate)}`;
      } else if (cellVal === visitVal && cellVal === compVal) {
        if (rawCompTime) {
          const relMins = getRelativeMinutes(rawCompTime);
          for (let m = 0; m < relMins; m++) busyMinutes[m] = true;
          statusText = `Busy until ${formatTime12h(rawCompTime)}`;
        } else {
          for (let m = 0; m < 600; m++) busyMinutes[m] = true;
          isPendingTADA = true;
          statusText = "Busy (Times Pending)";
        }
      } else if (cellVal === visitVal && cellVal < compVal) {
        for (let m = 0; m < 600; m++) busyMinutes[m] = true;
        statusText = `Busy: starts today, expected completion ${formatDateLabel(rawCompDate)}`;
      } else if (cellVal === compVal && cellVal > visitVal) {
        if (rawCompTime) {
          const relMins = getRelativeMinutes(rawCompTime);
          for (let m = 0; m < relMins; m++) busyMinutes[m] = true;
          statusText = `Busy until ${formatTime12h(rawCompTime)}`;
        } else {
          for (let m = 0; m < 600; m++) busyMinutes[m] = true;
          isPendingTADA = true;
          statusText = "Busy (Times Pending)";
        }
      }
    }

    const segments = [];
    let currentType = busyMinutes[0];
    let start = 0;
    for (let i = 1; i <= 600; i++) {
      if (i === 600 || busyMinutes[i] !== currentType) {
        segments.push({
          type: currentType ? "busy" : "free",
          start,
          end: i,
          widthPercent: ((i - start) / 600) * 100,
        });
        if (i < 600) {
          currentType = busyMinutes[i];
          start = i;
        }
      }
    }

    return { segments, statusText, isPendingTADA };
  };

  const chartData = useMemo(() => {
    return engineersList.map((eng) => {
      const { segments, isPendingTADA } = getTodayAvailability(eng);

      let busyHours = 0;
      let pendingHours = 0;
      let freeHours = 0;

      if (isPendingTADA) {
        pendingHours = 10;
      } else {
        segments.forEach((seg) => {
          const durationHrs = (seg.end - seg.start) / 60;
          if (seg.type === "busy") {
            busyHours += durationHrs;
          } else {
            freeHours += durationHrs;
          }
        });
      }

      return {
        name: eng,
        "Busy/Work Hours": parseFloat(busyHours.toFixed(1)),
        "Times Pending Hours": parseFloat(pendingHours.toFixed(1)),
        "Available Hours": parseFloat(freeHours.toFixed(1)),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTodayAvailability only reads siteVisitHistory
  }, [engineersList, siteVisitHistory]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-100 rounded-lg shadow-lg text-xs space-y-1">
          <p className="font-bold text-slate-800">{label}</p>
          {payload.map((p, idx) => (
            <p key={idx} style={{ color: p.color }} className="font-medium">
              {p.name}: {p.value} hrs
            </p>
          ))}
          <p className="text-[10px] text-slate-400 mt-1 border-t pt-1">
            Total Shift: 10 hrs (9 AM - 7 PM)
          </p>
        </div>
      );
    }
    return null;
  };

  const isAdmin = user?.role === "ADMIN";

  //---------------------------------------------------------
  //* DEPENDENCIES NEEDED FOR THE NEW ENQUIRY FORM
  //---------------------------------------------------------

  // ==============================
  // CONSTANTS
  // ==============================

  // ==============================
  // STATES
  // ==============================

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enquiryMasterData, setEnquiryMasterData] = useState([]);

  // New Enquiry States
  const [showNewEnquiryForm, setShowNewEnquiryForm] = useState(false);

  const [newEnquiryData, setNewEnquiryData] = useState({
    clientType: "New",
    sourceOfEnquiry: "",
    callType: "",
    enquiryReceiverName: "",
    companyName: "",
    clientName: "",
    phoneNumber: "",
    gstAddress: "",
    siteAddress: "",
    gstNo: "",
    machineName: "",
    category: "",
    mentionIssue: "",
    serviceLocation: "",
    challanCopy: "",
    machinePhoto: "",
    videoCall: "",
    newCategory: "",
    videoCallTime: "",
    engineerAssign: "",
  });

  const [newFormSelectedMachines, setNewFormSelectedMachines] = useState([]);

  const [showMachineDropdown, setShowMachineDropdown] = useState(false);

  const [machineSearchQuery, setMachineSearchQuery] = useState("");

  const [newFormSelectedCategories, setNewFormSelectedCategories] = useState([]);

  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const [categorySearchQuery, setCategorySearchQuery] = useState("");

  const [isEditMode, setIsEditMode] = useState(false);

  const [editingTicket, setEditingTicket] = useState(null);

  const [uploadingFiles, setUploadingFiles] = useState({
    challanCopy: false,
    machinePhoto: false,
  });

  // ==============================
  // LOCAL STORAGE
  // ==============================


  // ==============================
  // EFFECTS
  // ==============================

  useEffect(() => {
    fetchMasterSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load the dropdown master once on mount
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".dropdown-container")) {
        setShowMachineDropdown(false);
        setShowCategoryDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // ==============================
  // FORMAT DATE
  // ==============================

  const formatDate = (dateString) => {
    if (!dateString) return "";

    const date = new Date(dateString);

    if (isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  };

  // ==============================
  // FORMAT DATE TIME
  // ==============================

  // ==============================
  // OTP GENERATOR
  // ==============================

  const generateSixDigitOTP = () => {
    let result = "";

    for (let i = 0; i < 6; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }

    return result;
  };

  const uploadFileToDrive = async (file, field) => {
    setUploadingFiles((prev) => ({
      ...prev,
      [field]: true,
    }));

    try {
      const filePath = `${field}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("sss-tickets")
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("sss-tickets")
        .getPublicUrl(filePath);

      setNewEnquiryData((prev) => ({
        ...prev,
        [field]: publicUrlData.publicUrl,
      }));

      toast.success(
        field === "challanCopy"
          ? "Challan Copy uploaded successfully."
          : "Machine Photo uploaded successfully."
      );
    } catch (error) {
      console.error(error);

      toast.error(error.message || "Failed to upload file.");
    } finally {
      setUploadingFiles((prev) => ({
        ...prev,
        [field]: false,
      }));
    }
  };

  // Maps sss_dropdown.category values to the UI's dropdown group names
  // (kept the same names the form/render code already expects).
  const DROPDOWN_CATEGORY_KEY_MAP = {
    call_type: "Call type",
    category: "Category",
    sub_category: "Requirement Service Category",
    enquiry_receiver_name: "Enquiry Receiver Name",
    machine_name: "Machine Name",
    service_location: "Service Location",
    source_of_enquiry: "Source of enquiry",
    engineer_assign_name: "Engineer Assign Name",
  };

  const fetchMasterSheet = async () => {
    try {
      const [{ data: dropdownRows, error: dropdownError }, { data: clients, error: clientsError }] =
        await Promise.all([
          supabase
            .from("sss_dropdown")
            .select("category, value")
            .in("category", Object.keys(DROPDOWN_CATEGORY_KEY_MAP)),
          supabase
            .from("lto_client_master")
            .select("company_name, billing_address, gst_number"),
        ]);

      if (dropdownError) throw dropdownError;
      if (clientsError) throw clientsError;

      const structuredData = {};

      Object.values(DROPDOWN_CATEGORY_KEY_MAP).forEach((key) => {
        structuredData[key] = [];
      });

      (dropdownRows || []).forEach((row) => {
        const key = DROPDOWN_CATEGORY_KEY_MAP[row.category];
        const stringValue =
          row.value !== null && row.value !== undefined ? String(row.value).trim() : "";

        if (key && stringValue) {
          structuredData[key].push(stringValue);
        }
      });

      if (structuredData["Call type"].length === 0) {
        structuredData["Call type"] = ["Incoming", "Outgoing"];
      }

      // Existing-client autofill (Company Name -> Billing Address / GST No.)
      // relies on these three arrays staying index-aligned with each other.
      structuredData["Company Name"] = (clients || []).map((c) => c.company_name || "");
      structuredData["Billing Address"] = (clients || []).map((c) => c.billing_address || "");
      structuredData["GST No."] = (clients || []).map((c) => c.gst_number || "");

      setEnquiryMasterData([structuredData]);
    } catch (error) {
      console.error(error);

      toast.error("Failed to load master data");
    }
  };

  const handleNewEnquiryCompanyChange = (value) => {
    setNewEnquiryData((prev) => {
      const updated = {
        ...prev,
        companyName: value,
      };

      if (prev.clientType === "Existing" && enquiryMasterData[0]) {
        const companyNames =
          enquiryMasterData[0]["Company Name"] || [];

        const gstAddresses =
          enquiryMasterData[0]["Billing Address"] || [];

        const gstNos =
          enquiryMasterData[0]["GST No."] || [];

        const index = companyNames.findIndex(
          (name) =>
            name &&
            name.toLowerCase() === value.toLowerCase()
        );

        if (index !== -1) {
          updated.gstAddress =
            gstAddresses[index] || "";

          updated.gstNo =
            gstNos[index] || "";
        }
      }

      return updated;
    });
  };

  const handleNewEnquirySubmit = async (e) => {
    e.preventDefault();

    if (!newEnquiryData.clientName) {
      alert("Error: Client Name is required");
      return;
    }
    if (!newEnquiryData.phoneNumber) {
      alert("Error: Phone Number is required");
      return;
    }
    if (!newEnquiryData.category) {
      alert("Error: Enquiry-Type is required");
      return;
    }
    if (newFormSelectedCategories.length === 0) {
      alert("Error: Category is required");
      return;
    }
    if (newEnquiryData.videoCall === "Yes") {
      if (!newEnquiryData.videoCallTime) {
        alert("Error: Video-Call Time is required");
        return;
      }
      if (!newEnquiryData.engineerAssign) {
        alert("Error: Engineer-Assigned is required");
        return;
      }
    }
    if (!newEnquiryData.callType) {
      alert("Error: Call Type is required");
      return;
    }
    if (!newEnquiryData.sourceOfEnquiry) {
      alert("Error: Source of Enquiry is required");
      return;
    }
    if (!newEnquiryData.enquiryReceiverName) {
      alert("Error: Enquiry Receiver Name is required");
      return;
    }
    if (!newEnquiryData.serviceLocation) {
      alert("Error: Service Location is required");
      return;
    }
    if (newEnquiryData.clientType === "Existing" && !newEnquiryData.companyName) {
      alert("Error: Company Name is required for existing clients");
      return;
    }
    if (newFormSelectedMachines.length === 0) {
      alert("Error: Machine Name is required");
      return;
    }
    if (!newEnquiryData.mentionIssue || !newEnquiryData.mentionIssue.trim()) {
      alert("Error: Mention Issue is required");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditMode && editingTicket) {
        const isLocWarehouse = newEnquiryData.serviceLocation?.trim() === "Warehouse";
        const updatePayload = {
          source_of_enquiry: newEnquiryData.sourceOfEnquiry || "",
          call_type: newEnquiryData.callType || "",
          enquiry_receiver_name: newEnquiryData.enquiryReceiverName || "",
          client_type: newEnquiryData.clientType || "",
          company_name: newEnquiryData.companyName || "",
          client_name: newEnquiryData.clientName || "",
          phone_number: newEnquiryData.phoneNumber || "",
          gst_address: newEnquiryData.gstAddress || "",
          site_address: newEnquiryData.siteAddress || "",
          gst_no: newEnquiryData.gstNo || "",
          machine_name: newFormSelectedMachines.join(", "),
          category: newEnquiryData.category || "",
          mention_issue: newEnquiryData.mentionIssue || "",
          service_location: newEnquiryData.serviceLocation || "",
          challan_copy: isLocWarehouse ? (newEnquiryData.challanCopy || "") : "",
          machine_photo: isLocWarehouse ? (newEnquiryData.machinePhoto || "") : "",
          video_call: newEnquiryData.videoCall || "",
          sub_category: newFormSelectedCategories.join(", "),
          video_call_time: newEnquiryData.videoCallTime || "",
          engineer_assign: newEnquiryData.engineerAssign || "",
        };

        const { error } = await supabase
          .from("sss_tickets")
          .update(updatePayload)
          .eq("uuid", editingTicket.uuid);

        if (error) throw error;

        toast.success(`Enquiry updated successfully for Ticket ID: ${editingTicket.ticketId}`);
        setShowNewEnquiryForm(false);
        setNewEnquiryData({
          clientType: "New",
          sourceOfEnquiry: "",
          callType: "",
          enquiryReceiverName: "",
          companyName: "",
          clientName: "",
          phoneNumber: "",
          gstAddress: "",
          siteAddress: "",
          gstNo: "",
          machineName: "",
          category: "",
          mentionIssue: "",
          serviceLocation: "",
          challanCopy: "",
          machinePhoto: "",
          videoCall: "",
          newCategory: "",
          videoCallTime: "",
          engineerAssign: ""
        });
        setNewFormSelectedMachines([]);
        setNewFormSelectedCategories([]);
        setIsEditMode(false);
        setEditingTicket(null);
        queryClient.invalidateQueries({ queryKey: ['dash'] });
      } else {
        const isLocWarehouse = newEnquiryData.serviceLocation?.trim() === "Warehouse";
        const ticketSubmittedAt = new Date();

        const insertPayload = {
          source_of_enquiry: newEnquiryData.sourceOfEnquiry || "",
          call_type: newEnquiryData.callType || "",
          enquiry_receiver_name: newEnquiryData.enquiryReceiverName || "",
          client_type: newEnquiryData.clientType || "",
          company_name: newEnquiryData.companyName || "",
          client_name: newEnquiryData.clientName || "",
          phone_number: newEnquiryData.phoneNumber || "",
          gst_address: newEnquiryData.gstAddress || "",
          site_address: newEnquiryData.siteAddress || "",
          gst_no: newEnquiryData.gstNo || "",
          machine_name: newFormSelectedMachines.join(", "),
          category: newEnquiryData.category || "",
          mention_issue: newEnquiryData.mentionIssue || "",
          service_location: newEnquiryData.serviceLocation || "",
          challan_copy: isLocWarehouse ? (newEnquiryData.challanCopy || "") : "",
          machine_photo: isLocWarehouse ? (newEnquiryData.machinePhoto || "") : "",
          video_call: newEnquiryData.videoCall || "",
          sub_category: newFormSelectedCategories.join(", "),
          video_call_time: newEnquiryData.videoCallTime || "",
          engineer_assign: newEnquiryData.engineerAssign || "",
          // OTP only when Video-Call is "Yes", same as the old sheet logic.
          otp: newEnquiryData.videoCall === "Yes" ? generateSixDigitOTP() : "",
          cre_name: user?.name || "",
        };

        // Gate "Warranty Check" (the next stage) with a planned-by timestamp,
        // same pattern every other already-migrated page uses for its own
        // next-stage transition (see stagePlanning.js).
        try {
          insertPayload.warranty_check_planned = await computeStagePlanned("warrantyCheck", {
            ticketSubmittedAt,
          });
        } catch (planningError) {
          console.error("Failed to compute warranty_check_planned:", planningError);
        }

        const { data: insertedRows, error } = await supabase
          .from("sss_tickets")
          .insert(insertPayload)
          .select("ticket_id");

        if (error) throw error;

        toast.success(`Enquiry created successfully with Ticket ID: ${insertedRows?.[0]?.ticket_id}`);
        setShowNewEnquiryForm(false);
        setNewEnquiryData({
          clientType: "New",
          sourceOfEnquiry: "",
          callType: "",
          enquiryReceiverName: "",
          companyName: "",
          clientName: "",
          phoneNumber: "",
          gstAddress: "",
          siteAddress: "",
          gstNo: "",
          machineName: "",
          category: "",
          mentionIssue: "",
          serviceLocation: "",
          challanCopy: "",
          machinePhoto: "",
          videoCall: "",
          newCategory: "",
          videoCallTime: "",
          engineerAssign: ""
        });
        setNewFormSelectedMachines([]);
        setNewFormSelectedCategories([]);
        queryClient.invalidateQueries({ queryKey: ['dash'] });
      }
    } catch (error) {
      console.error("Error saving enquiry:", error);
      toast.error(error.message || "Failed to save enquiry");
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
      {/* Dashboard Header with CTA Buttons */}
      <div className="flex flex-shrink-0 flex-col items-start justify-between gap-4 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Engineer Dashboard</h2>
          <p className="text-xs text-slate-500 mt-1">Welcome back, {user?.name || "User"}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setIsEditMode(false);
              setEditingTicket(null);
              setNewEnquiryData({
                clientType: "New",
                sourceOfEnquiry: "",
                callType: "",
                enquiryReceiverName: "",
                companyName: "",
                clientName: "",
                phoneNumber: "",
                gstAddress: "",
                siteAddress: "",
                gstNo: "",
                machineName: "",
                category: "",
                mentionIssue: "",
                serviceLocation: "",
                challanCopy: "",
                machinePhoto: "",
                videoCall: "",
                newCategory: "",
                videoCallTime: "",
                engineerAssign: "",
                serialNumOfMachines: ""
              });
              setNewFormSelectedMachines([]);
              setNewFormSelectedCategories([]);
              setShowNewEnquiryForm(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Enquiry
          </button>
          <button
            onClick={() => setIsCalendarModalOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            data-testid="btn-view-visit-calendar"
          >
            <Calendar className="h-4 w-4" />
            View Visit Calendar
          </button>
          {isAdmin && (
            <button
              onClick={() => setIsTodayAvailabilityOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              data-testid="btn-view-today-availability"
            >
              <Calendar className="h-4 w-4" />
              Today's Availability
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid flex-shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Pending Video Calls" value={statsLoading ? "…" : videoCallStats.pending} icon={Phone} tone="warning" description="Awaiting engineer solve" />
        <MetricCard title="Solved Video Calls" value={statsLoading ? "…" : videoCallStats.solved} icon={CheckCircle2} tone="success" description="Total resolved tickets" />
        <MetricCard title="Pending QC Checks" value={statsLoading ? "…" : materialTestingStats.pending} icon={ClipboardCheck} tone="warning" description="Awaiting QA inspection" />
        <MetricCard title="Completed QC Checks" value={statsLoading ? "…" : materialTestingStats.completed} icon={CheckCircle2} tone="info" description="Total QC items verified" />
      </div>

      {/* Latest lists */}
      <div className="grid grid-cols-1 gap-6 pb-6 2xl:grid-cols-2">
        {/* Video Call latest entries */}
        <section className="flex flex-col gap-3" aria-labelledby="dash-vc-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="dash-vc-title" className="text-sm font-semibold text-foreground">Latest Video Call Tickets</h3>
              <p className="text-xs text-muted-foreground">Newest 8 matching tickets</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Video call status"
                value={vcStatusFilter}
                onChange={(e) => setVcStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="solved">Solved</option>
              </select>
              <FilterSearch value={vcSearchTerm} onChange={setVcSearchTerm} placeholder="Search tickets..." className="!min-w-[160px] w-44 flex-none" />
            </div>
          </div>
          <div className="h-[420px]">
            <DataTable
              ariaLabel="Latest video call tickets"
              headers={['Ticket-ID', 'Date', 'Client', 'Category', 'Phone Number', 'Status']}
              data={filteredTickets}
              loading={vcListQ.isPending}
              error={vcListQ.error ? vcListQ.error.message : null}
              emptyTitle="No tickets found"
              showFooter={false}
              minWidth="min-w-[520px]"
              renderRow={(ticket) => (
                <tr key={ticket.id}>
                  <td className="px-3.5 py-2 whitespace-nowrap align-middle"><span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">{ticket.ticketId}</span></td>
                  <td className="px-3.5 py-2 text-xs text-muted-foreground whitespace-nowrap align-middle">{formatDate(ticket.timeStemp)}</td>
                  <td className="px-3.5 py-2 text-xs font-semibold text-foreground align-middle"><div className="max-w-[160px] truncate" title={ticket.clientName || ticket.companyName}>{ticket.clientName || ticket.companyName}</div></td>
                  <td className="px-3.5 py-2 text-xs text-foreground align-middle"><div className="max-w-[120px] truncate" title={ticket.category}>{ticket.category || '-'}</div></td>
                  <td className="px-3.5 py-2 text-xs text-foreground whitespace-nowrap align-middle">{ticket.phoneNumber || "-"}</td>
                  <td className="px-3.5 py-2 align-middle"><StatusBadge tone={ticket.actual2 === "" ? "warning" : "success"}>{ticket.actual2 === "" ? "Pending" : "Solved"}</StatusBadge></td>
                </tr>
              )}
              renderCard={(ticket) => (
                <div key={ticket.id} className="space-y-2 rounded-lg border bg-card p-3 text-xs shadow-sm">
                  <div className="flex items-start justify-between">
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono font-semibold">{ticket.ticketId}</span>
                    <StatusBadge tone={ticket.actual2 === "" ? "warning" : "success"}>{ticket.actual2 === "" ? "Pending" : "Solved"}</StatusBadge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <div><dt className="text-muted-foreground">Date</dt><dd className="font-semibold">{formatDate(ticket.timeStemp)}</dd></div>
                    <div><dt className="text-muted-foreground">Client</dt><dd className="truncate font-semibold" title={ticket.clientName || ticket.companyName}>{ticket.clientName || ticket.companyName}</dd></div>
                    <div><dt className="text-muted-foreground">Category</dt><dd className="truncate font-semibold">{ticket.category || '-'}</dd></div>
                    <div><dt className="text-muted-foreground">Phone</dt><dd className="font-semibold">{ticket.phoneNumber || "-"}</dd></div>
                  </dl>
                </div>
              )}
            />
          </div>
        </section>

        {/* Material Testing latest entries */}
        <section className="flex flex-col gap-3" aria-labelledby="dash-qc-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="dash-qc-title" className="text-sm font-semibold text-foreground">Latest QC Inspections</h3>
              <p className="text-xs text-muted-foreground">Newest 8 matching inspections</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="QC status"
                value={mtStatusFilter}
                onChange={(e) => setMtStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
              </select>
              <FilterSearch value={mtSearchTerm} onChange={setMtSearchTerm} placeholder="Search QC..." className="!min-w-[160px] w-44 flex-none" />
            </div>
          </div>
          <div className="h-[420px]">
            <DataTable
              ariaLabel="Latest QC inspections"
              headers={['Indent No.', 'Unit Tracking No.', 'Item', 'Total Qty', 'Approved Qty', 'Status']}
              data={filteredQcChecks}
              loading={qcQ.isPending}
              error={qcQ.error ? qcQ.error.message : null}
              emptyTitle="No QC inspections found"
              showFooter={false}
              minWidth="min-w-[560px]"
              renderRow={(record) => (
                <tr key={record.id}>
                  <td className="px-3.5 py-2 text-xs font-semibold text-foreground align-middle">{record.indentNumber}</td>
                  <td className="px-3.5 py-2 text-xs text-foreground align-middle">{record.liftNo}</td>
                  <td className="px-3.5 py-2 text-xs font-semibold text-foreground align-middle"><div className="max-w-[180px] truncate" title={record.itemName}>{record.itemName}</div></td>
                  <td className="px-3.5 py-2 text-xs font-semibold text-foreground align-middle">{record.receivedQty}</td>
                  <td className="px-3.5 py-2 text-xs font-semibold text-success align-middle">{record.approvedQty}</td>
                  <td className="px-3.5 py-2 align-middle"><StatusBadge tone={record.status === "pending" ? "warning" : "info"}>{record.status === "pending" ? "Pending" : "Completed"}</StatusBadge></td>
                </tr>
              )}
              renderCard={(record) => (
                <div key={record.id} className="space-y-2 rounded-lg border bg-card p-3 text-xs shadow-sm">
                  <div className="flex items-start justify-between">
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold">{record.indentNumber}</span>
                    <StatusBadge tone={record.status === "pending" ? "warning" : "info"}>{record.status === "pending" ? "Pending" : "Completed"}</StatusBadge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2">
                    <div><dt className="text-muted-foreground">Unit Tracking No.</dt><dd className="font-semibold">{record.liftNo}</dd></div>
                    <div><dt className="text-muted-foreground">Item</dt><dd className="truncate font-semibold" title={record.itemName}>{record.itemName}</dd></div>
                    <div><dt className="text-muted-foreground">Total Qty</dt><dd className="font-semibold">{record.receivedQty}</dd></div>
                    <div><dt className="text-muted-foreground">Approved Qty</dt><dd className="font-semibold text-success">{record.approvedQty}</dd></div>
                  </dl>
                </div>
              )}
            />
          </div>
        </section>
      </div>

      {/* Visit Calendar Modal */}
      <VisitCalendarModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        allData={calendarEvents}
        masterData={masterData}
        onRangeChange={setCalRange}
        loading={calQ.isFetching}
      />

      {/* Today's Availability Dialog Modal */}
      {isAdmin && (
        <Modal
          isOpen={isTodayAvailabilityOpen}
          onClose={() => setIsTodayAvailabilityOpen(false)}
          title="Today's Engineer Availability (9 AM - 7 PM)"
          size="3xl"
        >
          <div className="bg-white rounded-lg p-6 max-h-[80vh] overflow-y-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="text-sm text-slate-500">
                Availability view for today: <strong>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Available</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span> Busy</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span> Times Pending</span>
              </div>
            </div>

            {/* Availability Stacked Bar Chart */}
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 shadow-sm">
              <h4 className="text-xs font-bold text-slate-700 mb-2 px-1">Availability Breakdown (Hours)</h4>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#64748b', fontSize: 9, fontWeight: 600 }}
                      interval={0}
                      angle={-12}
                      textAnchor="end"
                      stroke="#cbd5e1"
                    />
                    <YAxis
                      domain={[0, 10]}
                      ticks={[0, 2, 4, 6, 8, 10]}
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      stroke="#cbd5e1"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Busy/Work Hours" stackId="availability" fill="#f43f5e" name="Busy/Work" />
                    <Bar dataKey="Times Pending Hours" stackId="availability" fill="#f59e0b" name="Times Pending" />
                    <Bar dataKey="Available Hours" stackId="availability" fill="#10b981" name="Available" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {/* New Enquiry Modal */}
      <Modal
        isOpen={showNewEnquiryForm}
        onClose={() => setShowNewEnquiryForm(false)}
        title={
          <div className="flex items-center space-x-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            <span>{isEditMode ? `Edit Enquiry: ${editingTicket?.ticketId}` : "New Enquiry"}</span>
          </div>
        }
        size="4xl"
        className="rounded-lg max-h-[90vh] overflow-y-auto"
      >
        <form
          onSubmit={handleNewEnquirySubmit}
          className="space-y-6 max-h-[70vh] overflow-y-auto p-2"
        >
          <Card className="border-0 shadow-sm">
            <CardHeader className="bg-gray-50 px-4 py-3">
              <CardTitle className="text-sm font-medium flex items-center bg-transparent border-0 shadow-none text-gray-800">
                Client Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">Client Type *</Label>
                <Select
                  onValueChange={(value) => {
                    setNewEnquiryData(prev => ({
                      ...prev,
                      clientType: value,
                      companyName: value === "New" ? "" : prev.companyName,
                      gstAddress: value === "New" ? "" : prev.gstAddress,
                      gstNo: value === "New" ? "" : prev.gstNo
                    }));
                  }}
                  value={newEnquiryData.clientType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Client Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-300 rounded-md shadow-lg">
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Existing">Existing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-sm">Company Name *</Label>
                {newEnquiryData.clientType === "Existing" ? (
                  <div className="relative">
                    <Input
                      value={newEnquiryData.companyName || ""}
                      onChange={(e) => handleNewEnquiryCompanyChange(e.target.value)}
                      placeholder="Type to search or select company name"
                      list="new-company-suggestions"
                    />
                    <datalist id="new-company-suggestions">
                      {(enquiryMasterData[0]?.["Company Name"] || [])
                        .filter((name, index, self) => name && self.indexOf(name) === index)
                        .map((name, index) => (
                          <option key={index} value={name} />
                        ))}
                    </datalist>
                  </div>
                ) : (
                  <Input
                    value={newEnquiryData.companyName || ""}
                    onChange={(e) => setNewEnquiryData(prev => ({ ...prev, companyName: e.target.value }))}
                    placeholder="Enter company name"
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-sm">Client Name *</Label>
                <Input
                  value={newEnquiryData.clientName || ""}
                  onChange={(e) => setNewEnquiryData(prev => ({ ...prev, clientName: e.target.value }))}
                  placeholder="Enter client name"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">Phone Number *</Label>
                <Input
                  value={newEnquiryData.phoneNumber || ""}
                  onChange={(e) => setNewEnquiryData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="Enter phone number"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="bg-gray-50 px-4 py-3">
              <CardTitle className="text-sm font-medium flex items-center bg-transparent border-0 shadow-none text-gray-800">
                Enquiry Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">Call Type *</Label>
                <Select
                  onValueChange={(value) => setNewEnquiryData(prev => ({ ...prev, callType: value }))}
                  value={newEnquiryData.callType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Call Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-300 rounded-md shadow-lg">
                    {(enquiryMasterData[0]?.["Call type"] || [])
                      .filter(Boolean)
                      .map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-sm">Source of Enquiry *</Label>
                <div className="relative">
                  <Input
                    value={newEnquiryData.sourceOfEnquiry || ""}
                    onChange={(e) => setNewEnquiryData(prev => ({ ...prev, sourceOfEnquiry: e.target.value }))}
                    placeholder="Search or enter source"
                    list="new-source-suggestions"
                  />
                  <datalist id="new-source-suggestions">
                    {(enquiryMasterData[0]?.["Source of enquiry"] || [])
                      .filter((name, index, self) => name && self.indexOf(name) === index)
                      .map((name, index) => (
                        <option key={index} value={name} />
                      ))}
                  </datalist>
                </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm">Enquiry Receiver Name *</Label>
                  <div className="relative">
                    <Input
                      value={newEnquiryData.enquiryReceiverName || ""}
                      onChange={(e) => setNewEnquiryData(prev => ({ ...prev, enquiryReceiverName: e.target.value }))}
                      placeholder="Search or enter receiver name"
                      list="new-receiver-suggestions"
                    />
                    <datalist id="new-receiver-suggestions">
                      {(enquiryMasterData[0]?.["Enquiry Receiver Name"] || [])
                        .filter((name, index, self) => name && self.indexOf(name) === index)
                        .map((name, index) => (
                          <option key={index} value={name} />
                        ))}
                    </datalist>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm">Enquiry-Type *</Label>
                  <Select
                    onValueChange={(value) => setNewEnquiryData(prev => ({ ...prev, category: value }))}
                    value={newEnquiryData.category}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Enquiry-Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-gray-300 rounded-md shadow-lg">
                      {[...new Set(enquiryMasterData[0]?.["Requirement Service Category"] || [])]
                        .filter(Boolean)
                        .map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 relative dropdown-container">
                  <Label className="text-sm">Category *</Label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCategoryDropdown(!showCategoryDropdown);
                        setShowMachineDropdown(false);
                      }}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-gray-500">Select category(ies)</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 opacity-50"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>

                    {showCategoryDropdown && (
                      <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                        <div className="px-2 py-1 sticky top-0 bg-white z-10">
                          <Input
                            placeholder="Search category..."
                            value={categorySearchQuery}
                            onChange={(e) => setCategorySearchQuery(e.target.value)}
                            className="h-8 text-xs border-gray-200"
                          />
                        </div>
                        <div className="mt-1">
                          {[...new Set(enquiryMasterData[0]?.["Category"] || [])]
                            .filter(Boolean)
                            .filter(option =>
                              option.toLowerCase().includes(categorySearchQuery.toLowerCase())
                            )
                            .map((option) => (
                              <button
                                key={option}
                                type="button"
                                disabled={newFormSelectedCategories.includes(option)}
                                onClick={() => {
                                  if (!newFormSelectedCategories.includes(option)) {
                                    setNewFormSelectedCategories(prev => [...prev, option]);
                                  }
                                  setCategorySearchQuery("");
                                  setShowCategoryDropdown(false);
                                }}
                                className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                              >
                                {option}
                              </button>
                            ))}
                          {[...new Set(enquiryMasterData[0]?.["Category"] || [])]
                            .filter(Boolean)
                            .filter(option =>
                              option.toLowerCase().includes(categorySearchQuery.toLowerCase())
                            ).length === 0 && (
                            <p className="text-xs text-gray-500 text-center py-2">No category found</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {newFormSelectedCategories.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {newFormSelectedCategories.map((cat) => (
                        <div
                          key={cat}
                          className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded flex items-center"
                        >
                          {cat}
                          <button
                            type="button"
                            onClick={() => {
                              setNewFormSelectedCategories(prev => prev.filter(c => c !== cat));
                            }}
                            className="ml-1 text-blue-600 hover:text-blue-800 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={`md:col-span-2 grid grid-cols-1 ${newEnquiryData.videoCall === "Yes" ? "md:grid-cols-3" : "md:grid-cols-2"} gap-4`}>
                <div className="space-y-1">
                  <Label className="text-sm">Video-Call</Label>
                  <Select
                    onValueChange={(value) => setNewEnquiryData(prev => ({ ...prev, videoCall: value }))}
                    value={newEnquiryData.videoCall || ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Yes/No" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-gray-300 rounded-md shadow-lg">
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newEnquiryData.videoCall === "Yes" && (
                  <>
                    <div className="space-y-1 animate-in fade-in duration-300">
                      <Label className="text-sm">Video-Call Time *</Label>
                      <Input
                        type="time"
                        value={newEnquiryData.videoCallTime || ""}
                        onChange={(e) => setNewEnquiryData(prev => ({ ...prev, videoCallTime: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-1 animate-in fade-in duration-300">
                      <Label className="text-sm">Engineer-Assigned *</Label>
                      <Select
                        onValueChange={(value) => setNewEnquiryData(prev => ({ ...prev, engineerAssign: value }))}
                        value={newEnquiryData.engineerAssign || ""}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Engineer" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {(enquiryMasterData[0]?.["Engineer Assign Name"] || [])
                            .filter(Boolean)
                            .map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-sm">Billing Address</Label>
                <Input
                  value={newEnquiryData.gstAddress || ""}
                  onChange={(e) => setNewEnquiryData(prev => ({ ...prev, gstAddress: e.target.value }))}
                  placeholder="Enter Billing Address"
                  disabled={newEnquiryData.clientType === "Existing" && newEnquiryData.companyName !== ""}
                  className={newEnquiryData.clientType === "Existing" && newEnquiryData.companyName !== "" ? "bg-gray-100" : ""}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">GST No.</Label>
                <Input
                  value={newEnquiryData.gstNo || ""}
                  onChange={(e) => setNewEnquiryData(prev => ({ ...prev, gstNo: e.target.value }))}
                  placeholder="Enter GST No."
                  disabled={newEnquiryData.clientType === "Existing" && newEnquiryData.companyName !== ""}
                  className={newEnquiryData.clientType === "Existing" && newEnquiryData.companyName !== "" ? "bg-gray-100" : ""}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">Site Address</Label>
                <Input
                  value={newEnquiryData.siteAddress || ""}
                  onChange={(e) => setNewEnquiryData(prev => ({ ...prev, siteAddress: e.target.value }))}
                  placeholder="Enter Site Address"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">Service Location *</Label>
                <Select
                  onValueChange={(value) => setNewEnquiryData(prev => ({ ...prev, serviceLocation: value }))}
                  value={newEnquiryData.serviceLocation}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Service Location" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-300 rounded-md shadow-lg">
                    {[...new Set(enquiryMasterData[0]?.["Service Location"] || [])]
                      .filter(Boolean)
                      .map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>



              {newEnquiryData.serviceLocation?.trim() === "Warehouse" && (
                <div className="md:col-span-2 border border-blue-100 rounded-lg p-4 bg-blue-50/20 space-y-4">
                  <h4 className="text-sm font-semibold text-blue-800 border-b border-blue-100 pb-2">
                    Warehouse Service Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Challan Copy File Input */}
                    <div className="space-y-1">
                      <Label className="text-sm">Challan Copy</Label>
                      {newEnquiryData.challanCopy ? (
                        <div className="flex items-center justify-between border border-emerald-200 rounded-md p-2 bg-emerald-50 text-emerald-800 text-sm">
                          <a href={newEnquiryData.challanCopy} target="_blank" rel="noopener noreferrer" className="font-semibold underline truncate max-w-[200px]">
                            View Challan Copy
                          </a>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setNewEnquiryData(prev => ({ ...prev, challanCopy: "" }))}
                            className="text-red-500 hover:text-red-700 h-8 px-2 py-1 text-xs font-semibold hover:bg-red-50"
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            type="file"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                uploadFileToDrive(e.target.files[0], "challanCopy");
                              }
                            }}
                            disabled={uploadingFiles.challanCopy}
                          />
                          {uploadingFiles.challanCopy && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-blue-600 text-xs">
                              <Loader2Icon className="animate-spin w-4 h-4 mr-1" />
                              Uploading...
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Machine Photo File Input */}
                    <div className="space-y-1">
                      <Label className="text-sm">Machine Photo</Label>
                      {newEnquiryData.machinePhoto ? (
                        <div className="flex items-center justify-between border border-emerald-200 rounded-md p-2 bg-emerald-50 text-emerald-800 text-sm">
                          <a href={newEnquiryData.machinePhoto} target="_blank" rel="noopener noreferrer" className="font-semibold underline truncate max-w-[200px]">
                            View Machine Photo
                          </a>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setNewEnquiryData(prev => ({ ...prev, machinePhoto: "" }))}
                            className="text-red-500 hover:text-red-700 h-8 px-2 py-1 text-xs font-semibold hover:bg-red-50"
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            type="file"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                uploadFileToDrive(e.target.files[0], "machinePhoto");
                              }
                            }}
                            disabled={uploadingFiles.machinePhoto}
                          />
                          {uploadingFiles.machinePhoto && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-blue-600 text-xs">
                              <Loader2Icon className="animate-spin w-4 h-4 mr-1" />
                              Uploading...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}


              <div className="space-y-1 md:col-span-2 relative">
                <Label className="text-sm">Machine Name *</Label>
                <div className="relative dropdown-container">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMachineDropdown(!showMachineDropdown);
                      setShowCategoryDropdown(false);
                    }}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-gray-500">Select machine(s)</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 opacity-50"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {showMachineDropdown && (
                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                      <div className="px-2 py-1 sticky top-0 bg-white z-10">
                        <Input
                          placeholder="Search machine..."
                          value={machineSearchQuery}
                          onChange={(e) => setMachineSearchQuery(e.target.value)}
                          className="h-8 text-xs border-gray-200"
                        />
                      </div>
                      <div className="mt-1">
                        {[...new Set(enquiryMasterData[0]?.["Machine Name"] || [])]
                          .filter(Boolean)
                          .filter(option =>
                            option.toLowerCase().includes(machineSearchQuery.toLowerCase())
                          )
                          .map((option) => (
                            <button
                              key={option}
                              type="button"
                              disabled={newFormSelectedMachines.includes(option)}
                              onClick={() => {
                                if (!newFormSelectedMachines.includes(option)) {
                                  setNewFormSelectedMachines(prev => [...prev, option]);
                                }
                                setMachineSearchQuery("");
                                setShowMachineDropdown(false);
                              }}
                              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                            >
                              {option}
                            </button>
                          ))}
                        {[...new Set(enquiryMasterData[0]?.["Machine Name"] || [])]
                          .filter(Boolean)
                          .filter(option =>
                            option.toLowerCase().includes(machineSearchQuery.toLowerCase())
                          ).length === 0 && (
                            <p className="text-xs text-gray-500 text-center py-2">No machine found</p>
                          )}
                      </div>
                    </div>
                  )}
                </div>
                {newFormSelectedMachines.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {newFormSelectedMachines.map((machine) => (
                      <div
                        key={machine}
                        className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded flex items-center"
                      >
                        {machine}
                        <button
                          type="button"
                          onClick={() => {
                            setNewFormSelectedMachines(prev => prev.filter(m => m !== machine));
                          }}
                          className="ml-1 text-blue-600 hover:text-blue-800 font-bold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label className="text-sm">Mention Issue *</Label>
                <Textarea
                  value={newEnquiryData.mentionIssue || ""}
                  onChange={(e) => setNewEnquiryData(prev => ({ ...prev, mentionIssue: e.target.value }))}
                  placeholder="Describe the issue"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end space-x-4 pt-6">
            <Button
              type="button"
              onClick={() => setShowNewEnquiryForm(false)}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-md transition-all duration-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md transition-all duration-300"
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2Icon className="animate-spin w-4 h-4 mr-2" />
              )}
              {isEditMode ? "Save Changes" : "Create Enquiry"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
