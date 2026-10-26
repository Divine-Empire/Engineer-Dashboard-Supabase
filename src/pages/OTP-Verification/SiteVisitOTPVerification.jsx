import { useState, useEffect, useMemo } from "react";
import { Button } from "../../components/ui/button";
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
import { useToast } from "../../hooks/use-toast";
import { Loader2Icon, LoaderIcon, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase/client";
import { StatusTabs, FilterSearch, FilterChips, ColumnSelector, DataTable, StatusBadge, filterControlClass } from "../../components/shared";
import formatDisplayDate from "../../utils/formatDate";
import { useAuthStore } from "../../store/authStore";
import { useStageList, PAGE_SIZES } from "../../hooks/use-stage-list";
import { scopeBy } from "../../lib/pagedView";

// Pending / History come from flat SQL views (Database/05_otp_verification_views.sql):
// search, filters, engineer scope and counts run in SQL, one page per request.
//   Pending = no sss_otp_verification row yet; History = a row exists.
const VIEWS = { pending: "engg_v_otp_verification_pending", history: "engg_v_otp_verification_history" };
const ORDER = {
  pending: [{ column: "created_at", ascending: false }],
  history: [{ column: "created_at", ascending: false }],
};
const ALL_COLUMNS = [
  { key: "timeStemp", label: "Date" },
  { key: "ticketId", label: "Ticket ID" },
  { key: "clientName", label: "Client Name" },
  { key: "companyName", label: "Company Name", tabs: ["pending"] },
  { key: "phoneNumber", label: "Phone Number" },
  { key: "machineName", label: "Machine Name", tabs: ["pending"] },
  { key: "engineerAssign", label: "Engineer Assign", tabs: ["pending"] },
  { key: "travelDate", label: "Travel Date", tabs: ["pending"] },
  { key: "returnDate", label: "Return Date", tabs: ["pending"] },
  { key: "siteVisitDate", label: "Site Visit Date", tabs: ["history"] },
  { key: "status", label: "Verification Status", tabs: ["history"] },
  { key: "serviceReportFile", label: "Service Report", tabs: ["history"] },
  { key: "remarks", label: "Remarks", tabs: ["history"] },
  { key: "quatationReceive", label: "Quotation Receive", tabs: ["history"] },
  { key: "video", label: "Video", tabs: ["history"] },
  { key: "locallyPurchasedSpares", label: "Locally Purchased Spares", tabs: ["history"] },
  { key: "delay", label: "Delay", tabs: ["history"] },
];
const DATE_KEYS = ["timeStemp", "travelDate", "returnDate", "siteVisitDate"];
const LINK_KEYS = ["serviceReportFile", "quatationReceive", "video"];

// View row -> the shape the row renderers and the verification form already use.
// `ticketUuid` = the ticket uuid (the form submits against it).
const mapRow = (r) => ({
  ticketId: r.ticket_id,
  ticketUuid: r.id,
  timeStemp: r.created_at || "",
  clientName: r.client_name || "",
  companyName: r.company_name || "",
  phoneNumber: r.phone_number || "",
  machineName: r.machine_name || "",
  engineerAssign: r.engineer_assign || "",
  CREName: r.cre_name || "",
  travelDate: r.travel_date || "",
  returnDate: r.return_date || "",
  siteVisitOtp: r.site_visit_otp || "",
  siteVisitDate: r.site_visit_date || "",
  otpVerification: r.otp_entered || "",
  serviceReportFile: r.service_report_file || "",
  quatationReceive: r.quotation_receive_file || "",
  video: r.video_link || "",
  locallyPurchasedSpares: r.locally_purchased_spares || "",
  remarks: r.remarks || "",
  delayMinutes: r.delay_minutes,
});

// Minutes late, always >= 0 (or "-" when no delay was computed).
const delayText = (m) => (m === null || m === undefined ? "-" : `${m} min`);

function cellText(key, t) {
  if (DATE_KEYS.includes(key)) return t[key] ? formatDisplayDate(t[key]) : "";
  if (key === "delay") return delayText(t.delayMinutes);
  return t[key] || "";
}

function renderCell(key, t) {
  if (key === "ticketId") {
    return (
      <td key={key} className="px-3.5 py-2 whitespace-nowrap align-middle">
        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">{t.ticketId}</span>
      </td>
    );
  }
  if (key === "status") {
    return <td key={key} className="px-3.5 py-2 align-middle"><StatusBadge tone="success">Verified</StatusBadge></td>;
  }
  if (key === "delay") {
    return (
      <td key={key} className="px-3.5 py-2 align-middle">
        <StatusBadge tone={t.delayMinutes > 0 ? "danger" : "success"}>{delayText(t.delayMinutes)}</StatusBadge>
      </td>
    );
  }
  if (LINK_KEYS.includes(key)) {
    return (
      <td key={key} className="px-3.5 py-2 text-xs align-middle">
        {t[key] ? (
          <a href={t[key]} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline hover:text-brand-800">View</a>
        ) : (
          "-"
        )}
      </td>
    );
  }
  const text = cellText(key, t) || "-";
  return (
    <td key={key} className={`px-3.5 py-2 text-xs text-foreground align-middle ${key === "clientName" ? "font-semibold" : ""}`}>
      <div className="max-w-[240px] truncate" title={text}>{text}</div>
    </td>
  );
}

export default function SiteVisitOTPVerification() {
  const [lastOtpGenerations, setLastOtpGenerations] = useState({});
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [formData, setFormData] = useState({});
  // Files are only HELD here on selection — actual upload happens at submit
  // time in handleSubmit (all three in parallel), so cancelling the form or
  // switching tickets never leaves an orphaned upload behind, and nothing
  // hits Storage until Submit is actually clicked.
  const [serviceReportFile, setServiceReportFile] = useState(null);
  const [quotationReceiveFile, setQuotationReceiveFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user } = useAuthStore();

  // Engineers only see tickets assigned to them; admins see everything (and get an Engineer filter).
  const isEngineer = user?.role === "ENGINEER";
  const isAdmin = user?.role === "ADMIN";
  const scope = useMemo(
    () => (isEngineer ? scopeBy(["engineer_assign"], [user?.name, user?.id]) : null),
    [isEngineer, user?.name, user?.id]
  );
  const filters = useMemo(
    () => (isAdmin ? [{ key: "engineer", column: "engineer_assign", label: "Engineer", allLabel: "All Engineers" }] : []),
    [isAdmin]
  );
  const list = useStageList({
    key: "otp-verification",
    views: VIEWS,
    scope,
    scopeKey: isEngineer ? `eng:${user?.id}` : "all",
    filters,
    columns: ALL_COLUMNS,
    order: ORDER,
  });

  const handleApprovalClick = (ticket) => {
    setSelectedTicket(ticket);
    setFormData({
      ticketId: ticket.ticketId,
      clientName: ticket.clientName,
      phoneNumber: ticket.phoneNumber,
      machineName: ticket.machineName || "",
      travelDate: formatDate(ticket.travelDate) || "",
      returnDate: formatDate(ticket.returnDate) || "",
      siteVisitDate: "",
      otpVerification: "",
      locallyPurchasedSpares: "",
      remarks: "",
    });
    setServiceReportFile(null);
    setQuotationReceiveFile(null);
    setVideoFile(null);
    setShowApprovalModal(true);
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const uploadToStorage = async (file, prefix) => {
    const path = `otp_verification/${prefix}_${selectedTicket?.ticketId}_${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("ticket_enquiry")
      .upload(path, file, { contentType: file.type });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("ticket_enquiry").getPublicUrl(path);
    return data.publicUrl;
  };

  // These three just HOLD the picked file — no upload happens here. Actual
  // upload happens in handleSubmit, all three in parallel, only once Submit
  // is clicked.
  const handleServiceReportChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setServiceReportFile(file);
  };

  const handleQuotationChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setQuotationReceiveFile(file);
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_SIZE) {
      alert("Video file size exceeds the 100MB limit.");
      e.target.value = null;
      return;
    }

    setVideoFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.siteVisitDate) {
      alert("Please Select Site Visit Date");
      return;
    }

    const enteredOtp = (formData.otpVerification || "").toString().trim();
    const liveOtp = (selectedTicket?.siteVisitOtp || "").toString().trim();

    if (!enteredOtp) {
      alert("Please Enter the OTP");
      return;
    }

    // Nothing to check the entered OTP against — no OTP has ever been sent
    // for this ticket yet. Without this guard, an empty enteredOtp would
    // never reach here (caught above), but a never-resent liveOtp being ""
    // could otherwise match an accidentally-empty comparison; this makes
    // "no OTP sent yet" its own explicit, unambiguous error instead.
    if (!liveOtp) {
      alert("No OTP has been sent for this ticket yet. Please click Resend OTP first.");
      return;
    }

    if (enteredOtp !== liveOtp) {
      alert("Wrong OTP, Please Enter Right OTP");
      return;
    }

    if (!serviceReportFile) {
      alert("Please select a Service Report file first");
      return;
    }

    if (!formData.locallyPurchasedSpares) {
      alert("Please select Locally purchased spares option");
      return;
    }

    setIsSubmitting(true);

    try {
      // Uploads happen here, in parallel, only now that every
      // validation has passed.
      const [serviceReportUrl, quotationReceiveUrl, videoUrl] = await Promise.all([
        uploadToStorage(serviceReportFile, "service_report"),
        quotationReceiveFile ? uploadToStorage(quotationReceiveFile, "quotation_receive") : Promise.resolve(null),
        videoFile ? uploadToStorage(videoFile, "video") : Promise.resolve(null),
      ]);

      const { error } = await supabase.from("sss_otp_verification").insert({
        ticket_id: selectedTicket.ticketId,
        ticket_uuid: selectedTicket.ticketUuid,
        site_visit_date: formData.siteVisitDate || null,
        otp_entered: enteredOtp,
        service_report_file: serviceReportUrl,
        quotation_receive_file: quotationReceiveUrl,
        video_link: videoUrl,
        locally_purchased_spares: formData.locallyPurchasedSpares || null,
        remarks: formData.remarks || null,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Ticket details saved successfully",
      });

      setShowApprovalModal(false);
      list.reload();
    } catch (error) {
      console.error("Error submitting ticket:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save ticket details",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  function generateSixDigitNumber() {
    let result = "";
    for (let i = 0; i < 6; i++) {
      const digit = Math.floor(Math.random() * 10).toString();
      result += digit.toString();
    }
    return result;
  }

  const [isResending, setIsResending] = useState(false);

  const canGenerateOtp = (ticketId) => {
    if (!lastOtpGenerations[ticketId]) return true;

    const lastGenDate = new Date(lastOtpGenerations[ticketId]);
    const today = new Date();

    return (
      lastGenDate.getDate() !== today.getDate() ||
      lastGenDate.getMonth() !== today.getMonth() ||
      lastGenDate.getFullYear() !== today.getFullYear()
    );
  };

  const ResendOTP = async () => {
    const ticketId = selectedTicket?.ticketId;

    if (!canGenerateOtp(ticketId)) {
      toast({
        title: "Error",
        description: "You can only generate one OTP per day for this ticket",
        variant: "destructive",
      });
      return;
    }

    setIsResending(true);
    const sixDigitNumber1 = generateSixDigitNumber();

    try {
      const { error } = await supabase
        .from("sss_tickets")
        .update({ site_visit_otp: sixDigitNumber1 })
        .eq("uuid", selectedTicket.ticketUuid);

      if (error) throw error;

      setLastOtpGenerations((prev) => ({
        ...prev,
        [ticketId]: new Date().toISOString(),
      }));

      const storedGenerations = JSON.parse(
        localStorage.getItem("lastOtpVerificationGenerations") || "{}"
      );
      storedGenerations[ticketId] = new Date().toISOString();
      localStorage.setItem(
        "lastOtpVerificationGenerations",
        JSON.stringify(storedGenerations)
      );

      setSelectedTicket((prev) => ({
        ...prev,
        siteVisitOtp: sixDigitNumber1,
      }));

      toast({
        title: "Success",
        description: "OTP sent successfully",
      });
    } catch (error) {
      console.error("Error generating OTP:", error);
      toast({
        title: "Error",
        description: "Failed to send OTP",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  useEffect(() => {
    const storedGenerations = localStorage.getItem(
      "lastOtpVerificationGenerations"
    );
    if (storedGenerations) {
      setLastOtpGenerations(JSON.parse(storedGenerations));
    }
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return "";

    const dateStr = String(dateString).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      return dateStr;
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateStr;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  };

  const isPending = list.tab === "pending";
  const rows = useMemo(() => list.rows.map(mapRow), [list.rows]);
  const headers = [...(isPending ? [{ label: "Action", className: "w-24" }] : []), ...list.activeColumns.map((c) => c.label)];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* One toolbar row */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs tabs={list.tabs} activeTab={list.tab} onChange={list.setTab} label="OTP verification views" />
        <FilterSearch
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search ticket, client, company, phone..."
          className="min-w-[220px] flex-1"
        />
        {filters.map((f) => (
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${list.fetching ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
        <ColumnSelector {...list.columnPanel} />
      </div>
      <FilterChips chips={list.chips} onClearAll={list.clearAll} />

      <div className="min-h-0 flex-1">
        <DataTable
          ariaLabel={isPending ? "Pending OTP verifications" : "OTP verification history"}
          headers={headers}
          data={rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle={list.chips.length ? "No tickets match these filters" : isPending ? "No pending site visit verifications" : "No verification history yet"}
          currentPage={list.page}
          totalPages={list.totalPages}
          itemsPerPage={list.pageSize}
          totalResults={list.total}
          onPageChange={list.setPage}
          onItemsPerPageChange={list.setPageSize}
          itemsPerPageOptions={PAGE_SIZES}
          minWidth="min-w-[800px]"
          renderRow={(ticket) => (
            <tr key={ticket.ticketUuid}>
              {isPending && (
                <td className="px-3.5 py-2 align-middle">
                  <button
                    type="button"
                    onClick={() => handleApprovalClick(ticket)}
                    data-testid={`button-approval-${ticket.ticketId}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <ShieldCheck size={13} aria-hidden="true" />
                    Verify
                  </button>
                </td>
              )}
              {list.activeColumns.map((c) => renderCell(c.key, ticket))}
            </tr>
          )}
          renderCard={(ticket) => (
            <div key={ticket.ticketUuid} className="space-y-2 rounded-lg border bg-card p-3 text-xs shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono font-semibold">{ticket.ticketId}</span>
                  <p className="mt-1 text-muted-foreground">{formatDisplayDate(ticket.timeStemp)}</p>
                </div>
                {isPending && (
                  <button
                    type="button"
                    onClick={() => handleApprovalClick(ticket)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-semibold text-primary-foreground"
                  >
                    <ShieldCheck size={13} aria-hidden="true" />
                    Verify
                  </button>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2">
                {list.activeColumns
                  .filter((c) => !["ticketId", "timeStemp"].includes(c.key) && cellText(c.key, ticket))
                  .map((c) => (
                    <div key={c.key} className={["remarks", "locallyPurchasedSpares"].includes(c.key) ? "col-span-2" : ""}>
                      <dt className="text-muted-foreground">{c.label}</dt>
                      <dd className="break-words font-medium">
                        {LINK_KEYS.includes(c.key) ? (
                          <a href={ticket[c.key]} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">View</a>
                        ) : (
                          cellText(c.key, ticket)
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
        />
      </div>

      {/* Site Visit Verification Modal */}
      <Modal
        isOpen={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        title="Site Visit (Verification OTP)"
        size="2xl"
      >
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <Label>Ticket ID</Label>
            <Input
              value={formData.ticketId || ""}
              disabled
              className="bg-slate-50"
            />
          </div>
          <div>
            <Label>Client Name</Label>
            <Input
              value={formData.clientName || ""}
              disabled
              className="bg-slate-50"
            />
          </div>
          <div>
            <Label>Phone Number</Label>
            <Input
              value={formData.phoneNumber || ""}
              disabled
              className="bg-slate-50"
            />
          </div>
          <div>
            <Label>Machine Name</Label>
            <Input
              value={formData.machineName || ""}
              disabled
              className="bg-slate-50"
            />
          </div>

          <div>
            <Label>Travel Date</Label>
            <Input
              value={formData.travelDate || ""}
              disabled
              className="bg-slate-50"
            />
          </div>
          <div>
            <Label>Return Date</Label>
            <Input
              value={formData.returnDate || ""}
              disabled
              className="bg-slate-50"
            />
          </div>

          {/* Editable fields */}
          <div>
            <Label>Site Visit Date *</Label>
            <Input
              type="date"
              value={formData.siteVisitDate || ""}
              onChange={(e) =>
                handleInputChange("siteVisitDate", e.target.value)
              }
              data-testid="input-site-visit-date"
            />
          </div>
          <div>
            <Label>OTP Verification *</Label>
            <Input
              required
              maxLength={6}
              placeholder="Enter 6-digit OTP"
              value={formData.otpVerification || ""}
              onChange={(e) =>
                handleInputChange("otpVerification", e.target.value)
              }
              data-testid="input-otp"
            />

            <div className="w-full flex justify-center items-center flex-col">
              <div
                onClick={
                  canGenerateOtp(selectedTicket?.ticketId)
                    ? ResendOTP
                    : null
                }
                data-testid="button-resend-otp"
                className={`px-2 py-1 ${canGenerateOtp(selectedTicket?.ticketId)
                  ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 cursor-pointer"
                  : "bg-gray-400 cursor-not-allowed"
                  } text-white rounded-lg transition-all duration-300 shadow-lg text-center w-full flex justify-center items-center`}
              >
                {isResending ? (
                  <span className="flex items-center">
                    <LoaderIcon className="animate-spin mr-2" />
                    Resend OTPing...
                  </span>
                ) : (
                  "Resend OTP"
                )}
              </div>

              {!canGenerateOtp(selectedTicket?.ticketId) && (
                <p className="text-xs text-gray-500 mt-1">
                  Next OTP available tomorrow
                </p>
              )}
            </div>
          </div>

          <div>
            <Label>Service Report (upload file) *</Label>
            <Input
              type="file"
              onChange={handleServiceReportChange}
              disabled={isSubmitting}
              data-testid="input-serviceReport-file"
            />
            {serviceReportFile && (
              <p className="text-xs text-emerald-700 mt-1 truncate">Selected: {serviceReportFile.name}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-gray-600 font-medium">Quatation Receive</Label>
            <Input
              type="file"
              onChange={handleQuotationChange}
              disabled={isSubmitting}
              data-testid="input-quatation-receive"
            />
            {quotationReceiveFile && (
              <p className="text-xs text-emerald-700 mt-1 truncate">Selected: {quotationReceiveFile.name}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-gray-600 font-medium font-sans">
              Video (max 100MB)
            </Label>
            {videoFile ? (
              <div className="flex items-center justify-between border border-blue-200 rounded-md p-2 bg-blue-50 text-blue-800 text-sm h-10">
                <span className="font-semibold truncate max-w-[200px]">{videoFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setVideoFile(null)}
                  disabled={isSubmitting}
                  className="text-red-500 hover:text-red-700 h-8 px-2 py-1 text-xs font-semibold hover:bg-red-50"
                >
                  Remove
                </Button>
              </div>
            ) : (
              <Input
                type="file"
                accept="video/*"
                onChange={handleVideoChange}
                disabled={isSubmitting}
                className="border-gray-300 rounded-lg"
              />
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-gray-600 font-medium font-sans">
              Locally purchased spares *
            </Label>
            <Select
              value={formData.locallyPurchasedSpares || ""}
              onValueChange={(value) => handleInputChange("locallyPurchasedSpares", value)}
            >
              <SelectTrigger className="border-gray-300 rounded-lg">
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent className="bg-white rounded-lg border-gray-200 shadow-lg">
                <SelectItem value="Yes" className="hover:bg-gray-50">Yes</SelectItem>
                <SelectItem value="No" className="hover:bg-gray-50">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Remarks</Label>
            <Input
              type="text"
              placeholder="Enter Remarks"
              value={formData.remarks || ""}
              onChange={(e) => handleInputChange("remarks", e.target.value)}
              data-testid="input-remarks"
            />
          </div>

          <div className="md:col-span-2 flex space-x-4 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="button-submit-approval"
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-70 disabled:transform-none"
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <Loader2Icon className="animate-spin mr-2 w-4 h-4" />
                  Uploading & Submitting...
                </span>
              ) : (
                "Submit"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowApprovalModal(false)}
              data-testid="button-cancel-approval"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
