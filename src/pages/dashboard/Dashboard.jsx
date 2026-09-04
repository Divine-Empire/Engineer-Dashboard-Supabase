import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Phone,
  ClipboardCheck,
  Search,
  Calendar,
  ClipboardList,
  Loader2Icon,
  LoaderIcon,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import MetricCard from '../../components/MetricCard';
import TableWrapper from '../../components/TableWrapper';
import formatDate from '../../utils/formatDate';
import VisitCalendarModal from './VisitCalendarModal';
import { useAuthStore } from '../../store/authStore';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ltoSupabase } from '../../lib/supabase/ltoClient';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

const PREMIUM_COLORS = [
  { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", badge: "bg-emerald-100 text-emerald-800" },
  { bg: "bg-indigo-50 text-indigo-700 border-indigo-200", badge: "bg-indigo-100 text-indigo-800" },
  { bg: "bg-amber-50 text-amber-700 border-amber-200", badge: "bg-amber-100 text-amber-800" },
  { bg: "bg-rose-50 text-rose-700 border-rose-200", badge: "bg-rose-100 text-rose-800" },
  { bg: "bg-sky-50 text-sky-700 border-sky-200", badge: "bg-sky-100 text-sky-800" },
  { bg: "bg-violet-50 text-violet-700 border-violet-200", badge: "bg-violet-100 text-violet-800" },
  { bg: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", badge: "bg-fuchsia-100 text-fuchsia-800" },
  { bg: "bg-cyan-50 text-cyan-700 border-cyan-200", badge: "bg-cyan-100 text-cyan-800" },
  { bg: "bg-teal-50 text-teal-700 border-teal-200", badge: "bg-teal-100 text-teal-800" },
  { bg: "bg-orange-50 text-orange-700 border-orange-200", badge: "bg-orange-100 text-orange-800" },
];

const getEngineerColor = (name) => {
  if (!name) return { bg: "bg-slate-50 text-slate-700 border-slate-200", badge: "bg-slate-100 text-slate-850" };
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PREMIUM_COLORS[Math.abs(hash) % PREMIUM_COLORS.length];
};

const getValueByColIndex = (row, colIndex) => {
  if (!Array.isArray(row)) return "";
  if (row.length > 0 && Array.isArray(row[0])) {
    const cell = row.find(c => Array.isArray(c) && c[0] === colIndex);
    return cell !== undefined && cell !== null ? cell[1] : "";
  }
  return row[colIndex] !== undefined && row[colIndex] !== null ? row[colIndex] : "";
};

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

const formatMinutesToTime = (min) => {
  const totalMin = min + 9 * 60;
  let hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  const minStr = String(mins).padStart(2, "0");
  return `${hrs}:${minStr} ${ampm}`;
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

export default function Dashboard() {
  const { user } = useAuthStore();
  const [videoCallStats, setVideoCallStats] = useState({ pending: 0, solved: 0 });
  const [materialTestingStats, setMaterialTestingStats] = useState({ pending: 0, completed: 0 });

  const [allTickets, setAllTickets] = useState([]);
  const [allQcChecks, setAllQcChecks] = useState([]);

  const [vcSearchTerm, setVcSearchTerm] = useState('');
  const [vcStatusFilter, setVcStatusFilter] = useState('all');

  const [mtSearchTerm, setMtSearchTerm] = useState('');
  const [mtStatusFilter, setMtStatusFilter] = useState('all');

  const [statsLoading, setStatsLoading] = useState(false);

  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isTodayAvailabilityOpen, setIsTodayAvailabilityOpen] = useState(false);
  const [siteVisitHistory, setSiteVisitHistory] = useState([]);
  const [masterData, setMasterData] = useState([]);

  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    try {
      // Video-Call gating: same rule as Video-Call.jsx — a ticket is
      // "in Video-Call" once sss_warranty_check.video_call_planned is set;
      // pending until the latest sss_video_call attempt lands on something
      // other than 'rescheduled'.
      const { data: warrantyRows, error: warrantyError } = await supabase
        .from('sss_warranty_check')
        .select('ticket_id, video_call_planned')
        .not('video_call_planned', 'is', null);
      if (warrantyError) throw warrantyError;

      const vcTicketIds = [...new Set((warrantyRows || []).map((w) => w.ticket_id))];

      const [
        vcTicketsRes,
        vcAttemptsRes,
        siteVisitRes,
        tadaRes,
        warehouseRes,
        engineerDropdownRes,
        { data: receivingRows, error: receivingError },
        { data: qcRows, error: qcError },
      ] = await Promise.all([
        vcTicketIds.length
          ? supabase.from('sss_tickets').select('*').in('ticket_id', vcTicketIds)
          : Promise.resolve({ data: [] }),
        vcTicketIds.length
          ? supabase.from('sss_video_call').select('*').in('ticket_id', vcTicketIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        supabase.from('sss_site_visit').select('*'),
        supabase.from('sss_tada').select('*'),
        supabase.from('sss_warehouse').select('*'),
        supabase.from('sss_dropdown').select('value').eq('category', 'engineer_assign_name'),
        // Material testing data — already on the same Supabase project (ltoSupabase = supabase alias).
        ltoSupabase.from('pfms_view-receiving_accounts').select('indent_number, lift_no, item_name, received_qty, plan7, actual7'),
        ltoSupabase.from('pfms_material-testing').select('lift_no, approved_qty, rejected_qty'),
      ]);

      if (vcTicketsRes.error) throw vcTicketsRes.error;
      if (vcAttemptsRes.error) throw vcAttemptsRes.error;
      if (siteVisitRes.error) throw siteVisitRes.error;
      if (tadaRes.error) throw tadaRes.error;
      if (warehouseRes.error) throw warehouseRes.error;
      if (engineerDropdownRes.error) throw engineerDropdownRes.error;
      if (receivingError) throw receivingError;
      if (qcError) throw qcError;

      // ---- Video Call pending/solved stats ----
      const latestAttemptByTicket = new Map();
      (vcAttemptsRes.data || []).forEach((a) => {
        if (!latestAttemptByTicket.has(a.ticket_id)) latestAttemptByTicket.set(a.ticket_id, a);
      });

      let vcPending = 0;
      let vcSolved = 0;
      const vcRows = (vcTicketsRes.data || [])
        .map((t, index) => {
          const latest = latestAttemptByTicket.get(t.ticket_id);
          const isPending = !latest || latest.enquiry_solved === 'rescheduled';
          if (isPending) vcPending++;
          else vcSolved++;

          return {
            id: index + 1,
            timeStemp: t.created_at || "",
            ticketId: t.ticket_id || "",
            clientName: t.client_name || "",
            companyName: t.company_name || "",
            category: t.category || "",
            phoneNumber: t.phone_number || "",
            actual2: isPending ? "" : String(latest.created_at || "").trim(),
          };
        })
        .reverse();

      // ---- Engineer calendar: Site Visit + Video Call + Repair history ----
      const calendarTicketUuids = [
        ...new Set([
          ...(siteVisitRes.data || []).map((s) => s.ticket_uuid),
          ...(warehouseRes.data || []).map((w) => w.ticket_uuid),
        ]),
      ];

      const { data: calendarTickets, error: calendarTicketsError } = calendarTicketUuids.length
        ? await supabase.from('sss_tickets').select('*').in('uuid', calendarTicketUuids)
        : { data: [] };
      if (calendarTicketsError) throw calendarTicketsError;

      const ticketByUuid = new Map((calendarTickets || []).map((t) => [t.uuid, t]));
      const tadaByTicketUuid = new Map((tadaRes.data || []).map((x) => [x.ticket_uuid, x]));

      const siteVisitHistory = (siteVisitRes.data || []).map((sv, index) => {
        const t = ticketByUuid.get(sv.ticket_uuid) || {};
        const tada = tadaByTicketUuid.get(sv.ticket_uuid);
        return {
          id: index + 1,
          ticketId: sv.ticket_id || t.ticket_id || "",
          companyName: t.company_name || "",
          clientName: t.client_name || "",
          phoneNumber: t.phone_number || "",
          mentionIssue: t.mention_issue || "",
          engineerAssign: sv.engineer_assign || "",
          dateOfVisit: sv.date_of_visit || "",
          travelDate: tada?.travel_date || sv.date_of_visit || "",
          returnDate: tada?.return_date || "",
          expectedCompletionDate: tada?.expected_completion_date || "",
          expectedCompletionTime: tada?.expected_completion_time || "",
          CREName: t.cre_name || "",
          type: "Site Visit",
        };
      });

      const videoCallHistory = (vcTicketsRes.data || [])
        .filter((t) => t.video_call === "Yes")
        .map((t, index) => {
          const latest = latestAttemptByTicket.get(t.ticket_id);
          const startDate = latest?.rescheduled_time || t.created_at || "";
          return {
            id: index + 1,
            ticketId: t.ticket_id || "",
            companyName: t.company_name || "",
            clientName: t.client_name || "",
            phoneNumber: t.phone_number || "",
            mentionIssue: t.mention_issue || "",
            engineerAssign: latest?.alternate_engineer || t.engineer_assign || "",
            dateOfVisit: startDate,
            travelDate: startDate,
            returnDate: startDate,
            expectedCompletionDate: startDate,
            expectedCompletionTime: formatCallTime(String(t.video_call_time || "").trim()),
            CREName: t.cre_name || "",
            type: "Video Call",
          };
        });

      const repairHistory = (warehouseRes.data || []).map((w, index) => {
        const t = ticketByUuid.get(w.ticket_uuid) || {};
        const startDate = w.date_of_repair || w.created_at || "";
        return {
          id: index + 1,
          ticketId: w.ticket_id || t.ticket_id || "",
          companyName: t.company_name || "",
          clientName: t.client_name || "",
          phoneNumber: t.phone_number || "",
          mentionIssue: t.mention_issue || "",
          engineerAssign: w.assigned_engineer || "",
          dateOfVisit: startDate,
          travelDate: startDate,
          returnDate: startDate,
          expectedCompletionDate: startDate,
          expectedCompletionTime: "",
          CREName: t.cre_name || "",
          type: "Repair",
        };
      });

      const svHistory = [...siteVisitHistory, ...videoCallHistory, ...repairHistory];

      // ---- Material testing stats (already Supabase-backed, unchanged) ----
      const approvedMap = new Map();
      (qcRows || []).forEach((r) => {
        const liftNo = String(r.lift_no || '').trim().toLowerCase();
        if (!liftNo) return;
        approvedMap.set(liftNo, (approvedMap.get(liftNo) || 0) + (parseFloat(r.approved_qty || 0)));
      });

      let mtPending = 0;
      let mtCompleted = 0;
      let mtRows = [];
      (receivingRows || [])
        .filter((row) => row.indent_number && String(row.indent_number).trim() !== '')
        .forEach((row, index) => {
          const plan7Str = String(row.plan7 || '').trim();
          const actual7Str = String(row.actual7 || '').trim();
          let status = 'not_ready';
          if (plan7Str && plan7Str !== '-') {
            status = (actual7Str && actual7Str !== '-') ? 'completed' : 'pending';
          }
          const liftNo = String(row.lift_no || '').trim();
          const totalApproved = approvedMap.get(liftNo.toLowerCase()) || 0;

          if (status === 'pending' || status === 'completed') {
            mtRows.push({
              id: index + 1,
              indentNumber: String(row.indent_number || '').trim(),
              liftNo,
              itemName: String(row.item_name || '').trim(),
              receivedQty: row.received_qty || '0',
              approvedQty: totalApproved,
              status,
            });
            if (status === 'pending') mtPending++;
            else mtCompleted++;
          }
        });
      mtRows = mtRows.reverse();

      // ---- Engineer filter list for the calendar modal ----
      const engineerNames = [
        ...new Set((engineerDropdownRes.data || []).map((r) => String(r.value || "").trim()).filter(Boolean)),
      ];
      setMasterData([{ "Engineer Assign Name": engineerNames }]);

      setVideoCallStats({ pending: vcPending, solved: vcSolved });
      setMaterialTestingStats({ pending: mtPending, completed: mtCompleted });
      setAllTickets(vcRows);
      setAllQcChecks(mtRows);
      setSiteVisitHistory(svHistory);
    } catch (err) {
      console.error("Error loading dashboard stats:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const filteredTickets = useMemo(() => {
    return allTickets
      .filter(ticket => {
        if (vcStatusFilter !== 'all') {
          const isPending = ticket.actual2 === "";
          if (vcStatusFilter === 'pending' && !isPending) return false;
          if (vcStatusFilter === 'solved' && isPending) return false;
        }
        const q = vcSearchTerm.toLowerCase().trim();
        if (q) {
          const matches =
            String(ticket.ticketId || "").toLowerCase().includes(q) ||
            String(ticket.clientName || "").toLowerCase().includes(q) ||
            String(ticket.companyName || "").toLowerCase().includes(q) ||
            String(ticket.category || "").toLowerCase().includes(q) ||
            String(ticket.phoneNumber || "").includes(q);
          if (!matches) return false;
        }
        return true;
      })
      .slice(0, 8);
  }, [allTickets, vcSearchTerm, vcStatusFilter]);

  const filteredQcChecks = useMemo(() => {
    return allQcChecks
      .filter(record => {
        if (mtStatusFilter !== 'all' && record.status !== mtStatusFilter) return false;
        const q = mtSearchTerm.toLowerCase().trim();
        if (q) {
          const matches =
            String(record.indentNumber || "").toLowerCase().includes(q) ||
            String(record.liftNo || "").toLowerCase().includes(q) ||
            String(record.itemName || "").toLowerCase().includes(q);
          if (!matches) return false;
        }
        return true;
      })
      .slice(0, 8);
  }, [allQcChecks, mtSearchTerm, mtStatusFilter]);

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
      const { segments, statusText, isPendingTADA } = getTodayAvailability(eng);

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

  const [pendingData, setPendingData] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enquiryMasterData, setEnquiryMasterData] = useState([]);
  const [searchItem, setSearchItem] = useState("");

  // Filter States
  const [dateRange, setDateRange] = useState({
    start: "",
    end: "",
  });
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");

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

  const userName = localStorage.getItem("currentUsername");

  const roleStorage = localStorage.getItem("o2d-auth-storage");
  const parsedData = roleStorage ? JSON.parse(roleStorage) : null;
  const role = parsedData?.state?.user?.role;

  // ==============================
  // EFFECTS
  // ==============================

  useEffect(() => {
    fetchMasterSheet();
    fetchData();
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

  const handleEditClick = (ticket) => {
    setIsEditMode(true);

    setEditingTicket(ticket);

    setNewEnquiryData({
      clientType: ticket.clientType || "New",
      sourceOfEnquiry: ticket.sourceOfEnquiry || "",
      callType: ticket.callType || "",
      enquiryReceiverName: ticket.enquiryReceiverName || "",
      companyName: ticket.companyName || "",
      clientName: ticket.clientName || "",
      phoneNumber: ticket.phoneNumber || "",
      gstAddress: ticket.gstAddress || "",
      siteAddress: ticket.siteAddress || "",
      gstNo: ticket.gstNo || "",
      machineName: ticket.machineName || "",
      category: ticket.category || "",
      mentionIssue: ticket.mentionIssue || "",
      serviceLocation: ticket.serviceLocation || "",
      challanCopy: ticket.challanCopy || "",
      machinePhoto: ticket.machinePhoto || "",
      videoCall: ticket.videoCall || "",
      newCategory: ticket.newCategory || "",
      videoCallTime: ticket.videoCallTime || "",
      engineerAssign: ticket.engineerAssign || "",
    });

    const machines = ticket.machineName
      ? ticket.machineName
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
      : [];

    setNewFormSelectedMachines(machines);

    const categories = ticket.newCategory
      ? ticket.newCategory
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
      : [];

    setNewFormSelectedCategories(categories);

    setShowNewEnquiryForm(true);
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

  const fetchData = async () => {
    setFetchLoading(true);

    try {
      const { data, error } = await supabase
        .from("sss_tickets")
        .select("*")
        .eq("current_stage", "Warranty Check")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const allData = (data || []).map((row, index) => ({
        id: index + 1,
        uuid: row.uuid,
        timeStemp: row.created_at || "",
        ticketId: row.ticket_id || "",
        sourceOfEnquiry: row.source_of_enquiry || "",
        callType: row.call_type || "",
        enquiryReceiverName: row.enquiry_receiver_name || "",
        clientType: row.client_type || "",
        companyName: row.company_name || "",
        clientName: row.client_name || "",
        phoneNumber: row.phone_number || "",
        gstAddress: row.gst_address || "",
        siteAddress: row.site_address || "",
        gstNo: row.gst_no || "",
        machineName: row.machine_name || "",
        category: row.category || "",
        mentionIssue: row.mention_issue || "",
        serviceLocation: row.service_location || "",
        challanCopy: row.challan_copy || "",
        machinePhoto: row.machine_photo || "",
        videoCall: row.video_call || "",
        engineerAssign: row.engineer_assign || "",
        CREName: row.cre_name || "",
        otp: row.otp || "",
        newCategory: row.sub_category || "",
        videoCallTime: row.video_call_time || "",
      }));

      const uniqueTicketsMap = new Map();

      allData.forEach((ticket) => {
        if (ticket.ticketId) {
          uniqueTicketsMap.set(ticket.ticketId, ticket);
        }
      });

      setPendingData(Array.from(uniqueTicketsMap.values()));
    } catch (error) {
      console.error(error);

      toast.error("Failed to load data");
    } finally {
      setFetchLoading(false);
    }
  };

  const roleFilteredData =
    role === "user"
      ? pendingData.filter(
        (item) => item.CREName === userName
      )
      : role === "engineer"
        ? pendingData.filter(
          (item) => item.engineerAssign === userName
        )
        : pendingData;

  const filteredPendingData = roleFilteredData
    .filter((item) => {
      const q = searchItem.toLowerCase();

      const matchesSearch =
        String(item.ticketId || "")
          .toLowerCase()
          .includes(q) ||
        String(item.clientName || "")
          .toLowerCase()
          .includes(q) ||
        String(item.companyName || "")
          .toLowerCase()
          .includes(q) ||
        String(item.phoneNumber || "")
          .toLowerCase()
          .includes(q);

      if (!matchesSearch) return false;

      if (
        categoryFilter !== "all" &&
        item.category !== categoryFilter
      ) {
        return false;
      }

      if (item.timeStemp) {
        let ticketDateObj = null;

        if (
          typeof item.timeStemp === "string" &&
          item.timeStemp.includes("/")
        ) {
          const datePart = item.timeStemp.split(" ")[0];
          const parts = datePart.split("/");

          if (parts.length === 3) {
            ticketDateObj = new Date(
              parts[2],
              parts[1] - 1,
              parts[0]
            );
          }
        } else {
          ticketDateObj = new Date(item.timeStemp);
        }

        if (
          ticketDateObj &&
          !isNaN(ticketDateObj.getTime())
        ) {
          ticketDateObj.setHours(0, 0, 0, 0);

          if (dateRange.start) {
            const fromDateObj = new Date(
              dateRange.start
            );

            fromDateObj.setHours(0, 0, 0, 0);

            if (ticketDateObj < fromDateObj)
              return false;
          }

          if (dateRange.end) {
            const toDateObj = new Date(
              dateRange.end
            );

            toDateObj.setHours(
              23,
              59,
              59,
              999
            );

            if (ticketDateObj > toDateObj)
              return false;
          }
        }
      } else if (
        dateRange.start ||
        dateRange.end
      ) {
        return false;
      }

      return true;
    })
    .reverse();

  const availableCategories = [
    ...new Set(
      roleFilteredData
        .map((item) => item.category)
        .filter(Boolean)
    ),
  ];

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
    const currentDateTime = formatDateTime(new Date());

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
        fetchData();
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
          cre_name: userName || "",
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
        fetchData();
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex-shrink-0">
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
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
          >
            <Plus className="h-4 w-4" />
            New Enquiry
          </button>
          <button
            onClick={() => setIsCalendarModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
            data-testid="btn-view-visit-calendar"
          >
            <Calendar className="h-4 w-4" />
            View Visit Calendar
          </button>
          {isAdmin && (
            <button
              onClick={() => setIsTodayAvailabilityOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              data-testid="btn-view-today-availability"
            >
              <Calendar className="h-4 w-4" />
              Today's Availability
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
        <MetricCard title="Pending Video Calls" value={statsLoading ? "..." : videoCallStats.pending} icon={Phone} gradient="from-cyan-500 to-cyan-600" description="Awaiting engineer solve" />
        <MetricCard title="Solved Video Calls" value={statsLoading ? "..." : videoCallStats.solved} icon={CheckCircle2} gradient="from-teal-500 to-teal-600" description="Total resolved tickets" />
        <MetricCard title="Pending QC Checks" value={statsLoading ? "..." : materialTestingStats.pending} icon={ClipboardCheck} gradient="from-orange-500 to-orange-600" description="Awaiting QA inspection" />
        <MetricCard title="Completed QC Checks" value={statsLoading ? "..." : materialTestingStats.completed} icon={CheckCircle2} gradient="from-purple-500 to-purple-600" description="Total QC items verified" />
      </div>

      {/* 2 Tables Stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6 pb-6">
        {/* Video Call Latest Entries */}
        <div className="p-5 shadow-sm space-y-4 flex flex-col min-h-[400px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Latest Video Call Tickets</h3>
              <p className="text-[11px] text-slate-400 font-medium">Showing top 5 matching entries from all ticket logs</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={vcStatusFilter}
                onChange={(e) => setVcStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-1 text-slate-650 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer h-8"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="solved">Solved</option>
              </select>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tickets..."
                  value={vcSearchTerm}
                  onChange={(e) => setVcSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs w-44 focus:outline-none focus:ring-1 focus:ring-indigo-500 h-8"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-between">
            <div className="hidden sm:flex flex-col flex-1 min-h-0">
              <TableWrapper
                headers={['Ticket-ID', 'Date', 'Client', 'Category', 'Phone Number', 'Status']}
                data={filteredTickets}
                loading={statsLoading}
                emptyMessage="No tickets found."
                renderRow={(ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-xs font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{ticket.ticketId}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(ticket.timeStemp)}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-slate-850 truncate max-w-[150px]" title={ticket.clientName || ticket.companyName}>{ticket.clientName || ticket.companyName}</td>
                    <td className="px-5 py-3 text-xs text-slate-650 truncate max-w-[120px]" title={ticket.category}>{ticket.category}</td>
                    <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">{ticket.phoneNumber || "-"}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ticket.actual2 === ""
                        ? "bg-rose-50 text-rose-700 border-rose-100"
                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                        }`}>
                        {ticket.actual2 === "" ? "Pending" : "Solved"}
                      </span>
                    </td>
                  </tr>
                )}
              />
            </div>
            {/* Mobile View */}
            <div className="sm:hidden flex flex-col space-y-3 mt-1 overflow-y-auto max-h-[350px] pr-1">
              {statsLoading ? (
                <div className="flex justify-center py-8 text-indigo-600"><LoaderIcon className="animate-spin" /></div>
              ) : filteredTickets.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No tickets found.</div>
              ) : (
                filteredTickets.map((ticket) => (
                  <div key={ticket.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-mono font-bold bg-white px-2 py-0.5 rounded text-slate-700 border border-slate-200">{ticket.ticketId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ticket.actual2 === ""
                        ? "bg-rose-50 text-rose-700 border-rose-100"
                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                        }`}>
                        {ticket.actual2 === "" ? "Pending" : "Solved"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div>
                        <span className="text-slate-400 block">Date</span>
                        <span className="font-semibold">{formatDate(ticket.timeStemp)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Client</span>
                        <span className="font-semibold block truncate" title={ticket.clientName || ticket.companyName}>{ticket.clientName || ticket.companyName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Category</span>
                        <span className="font-semibold block truncate">{ticket.category}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Phone</span>
                        <span className="font-semibold">{ticket.phoneNumber || "-"}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Material Testing Latest Entries */}
        <div className="p-5 shadow-sm space-y-4 flex flex-col min-h-[400px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Latest QC Inspections</h3>
              <p className="text-[11px] text-slate-400 font-medium">Showing top 5 matching entries from all QC logs</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={mtStatusFilter}
                onChange={(e) => setMtStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-1 text-slate-650 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer h-8"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
              </select>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search QC..."
                  value={mtSearchTerm}
                  onChange={(e) => setMtSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs w-44 focus:outline-none focus:ring-1 focus:ring-indigo-500 h-8"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col justify-between">
            <div className="hidden sm:flex flex-col flex-1 min-h-0">
              <TableWrapper
                headers={['Indent No.', 'Unit Tracking No.', 'Item', 'Total Qty', 'Approved Qty', 'Status']}
                data={filteredQcChecks}
                loading={statsLoading}
                emptyMessage="No QC inspections found."
                renderRow={(record) => (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-bold text-xs text-slate-700">{record.indentNumber}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{record.liftNo}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-slate-850 truncate max-w-[180px]" title={record.itemName}>{record.itemName}</td>
                    <td className="px-5 py-3 text-xs font-bold text-slate-700">{record.receivedQty}</td>
                    <td className="px-5 py-3 text-xs font-bold text-emerald-600">{record.approvedQty}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${record.status === "pending"
                        ? "bg-orange-50 text-orange-700 border-orange-100"
                        : "bg-purple-50 text-purple-700 border-purple-100"
                        }`}>
                        {record.status === "pending" ? "Pending" : "Completed"}
                      </span>
                    </td>
                  </tr>
                )}
              />
            </div>
            {/* Mobile View */}
            <div className="sm:hidden flex flex-col space-y-3 mt-1 overflow-y-auto max-h-[350px] pr-1">
              {statsLoading ? (
                <div className="flex justify-center py-8 text-indigo-600"><LoaderIcon className="animate-spin" /></div>
              ) : filteredQcChecks.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No QC inspections found.</div>
              ) : (
                filteredQcChecks.map((record) => (
                  <div key={record.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">{record.indentNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${record.status === "pending"
                        ? "bg-orange-50 text-orange-700 border-orange-100"
                        : "bg-purple-50 text-purple-700 border-purple-100"
                        }`}>
                        {record.status === "pending" ? "Pending" : "Completed"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div>
                        <span className="text-slate-400 block">Unit Tracking No.</span>
                        <span className="font-semibold">{record.liftNo}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Item</span>
                        <span className="font-semibold block truncate" title={record.itemName}>{record.itemName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Total Qty</span>
                        <span className="font-semibold">{record.receivedQty}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Approved Qty</span>
                        <span className="font-semibold text-emerald-600">{record.approvedQty}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Visit Calendar Modal */}
      <VisitCalendarModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        allData={user?.role === "ENGINEER" ? siteVisitHistory.filter((item) => String(item.engineerAssign).trim().toLowerCase() === String(user.name).trim().toLowerCase()) : siteVisitHistory}
        masterData={masterData}
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
