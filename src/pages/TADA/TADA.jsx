import { useState, useEffect, useMemo } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Modal } from "../../components/ui/modal";
import toast from "react-hot-toast";
import { Car, Loader2Icon, RefreshCw } from "lucide-react";
import { Textarea } from "../../components/ui/textarea";
import { supabase } from "../../lib/supabase/client";
import { sendTadaApprovalEmail } from "../../lib/notifications/email";
import { StatusTabs, FilterSearch, FilterChips, ColumnSelector, DataTable, filterControlClass } from "../../components/shared";
import formatDisplayDate from "../../utils/formatDate";
import { useAuthStore } from "../../store/authStore";
import { useStageList, PAGE_SIZES } from "../../hooks/use-stage-list";
import { scopeBy } from "../../lib/pagedView";

// Pending / History come from flat SQL views (Database/04_tada_views.sql):
// search, filters, engineer scope and counts run in SQL, one page per request.
//   Pending = no sss_tada row yet; History = a sss_tada row exists.
const VIEWS = { pending: "engg_v_tada_pending", history: "engg_v_tada_history" };
const FILTERS = [
  { key: "serviceLocation", column: "service_location", label: "Location", allLabel: "All Locations" },
  { key: "category", column: "category", label: "Category", allLabel: "All Categories" },
];
const ORDER = {
  pending: [{ column: "created_at", ascending: false }],
  history: [{ column: "created_at", ascending: false }],
};
const COLUMNS = [
  { key: "timeStemp", label: "Date", defaultVisible: true },
  { key: "ticketId", label: "Ticket ID", defaultVisible: true },
  { key: "sourceOfEnquiry", label: "Source of enquiry", defaultVisible: false },
  { key: "callType", label: "Call type", defaultVisible: false },
  { key: "enquiryReceiverName", label: "Enquiry Receiver Name", defaultVisible: false },
  { key: "clientType", label: "Client Type", defaultVisible: false },
  { key: "companyName", label: "Company Name", defaultVisible: true },
  { key: "clientName", label: "Client Name", defaultVisible: true },
  { key: "phoneNumber", label: "Phone Number", defaultVisible: true },
  { key: "gstAddress", label: "Billing Address", defaultVisible: false },
  { key: "siteAddress", label: "Site Address", defaultVisible: false },
  { key: "gstNo", label: "GST No.", defaultVisible: false },
  { key: "machineName", label: "Machine Name", defaultVisible: true },
  { key: "category", label: "Category", defaultVisible: false },
  { key: "mentionIssue", label: "Mention Issue", defaultVisible: true },
  { key: "serviceLocation", label: "Service Location", defaultVisible: true },
  { key: "quotationNo", label: "Quotation No.", defaultVisible: true },
  { key: "warrantyCheck", label: "Warranty Check", defaultVisible: true, tabs: ["pending"] },
  { key: "engineerAssign", label: "Engineer Assign", defaultVisible: true },
  { key: "dateOfVisit", label: "Date of Visit", defaultVisible: true, tabs: ["pending"] },
  { key: "transportation", label: "Transportation", defaultVisible: true, tabs: ["pending"] },
  { key: "travelDate", label: "Travel Date", defaultVisible: true, tabs: ["history"] },
  { key: "returnDate", label: "Return Date", defaultVisible: true, tabs: ["history"] },
  { key: "destinationInput", label: "Destination", defaultVisible: true, tabs: ["history"] },
  { key: "purposeOfTravel", label: "Purpose", defaultVisible: true, tabs: ["history"] },
  { key: "amount", label: "Amount", defaultVisible: true, tabs: ["history"] },
  { key: "quotationPdfLink", label: "Quotation PDF", defaultVisible: true },
];
const DATE_KEYS = ["timeStemp", "dateOfVisit", "travelDate", "returnDate"];
const WIDE_KEYS = ["mentionIssue", "gstAddress", "siteAddress", "purposeOfTravel", "destinationInput", "companyName"];

const cleanQuotationNo = (q) => (q ? String(q).replace(/^(Quotation|Quo|QUO|Quo\.)[:\-\s.]*/i, "").trim() : "");

// View row -> the shape the row renderers and the TADA form already use.
// `id` = the ticket uuid (the TADA form submits against it).
const mapRow = (r) => ({
  id: r.id,
  timeStemp: r.created_at || "",
  ticketId: r.ticket_id || "",
  sourceOfEnquiry: r.source_of_enquiry || "",
  callType: r.call_type || "",
  enquiryReceiverName: r.enquiry_receiver_name || "",
  clientType: r.client_type || "",
  companyName: r.company_name || "",
  clientName: r.client_name || "",
  phoneNumber: r.phone_number || "",
  gstAddress: r.gst_address || "",
  siteAddress: r.site_address || "",
  gstNo: r.gst_no || "",
  machineName: r.machine_name || "",
  category: r.category || "",
  mentionIssue: r.mention_issue || "",
  serviceLocation: r.service_location || "",
  engineerAssign: r.engineer_assign || "",
  warrantyCheck: r.warranty_check || "",
  siteName: r.site_address || "",
  quotationNo: r.quotation_no || "",
  quotationPdfLink: r.quotation_pdf_link || "",
  dateOfVisit: r.date_of_visit || "",
  transportation: r.transportation || "",
  CREName: r.cre_name || "",
  travelDate: r.travel_date || "",
  returnDate: r.return_date || "",
  destinationInput: r.destination || "",
  purposeOfTravel: r.purpose_of_travel || "",
  amount: r.amount || "",
  expectedCompletionDate: r.expected_completion_date || "",
  expectedCompletionTime: r.expected_completion_time || "",
  otpVerificationPlanned: r.otp_verification_planned || "",
  delayMinutes: r.delay_minutes,
});

function cellText(key, t) {
  if (DATE_KEYS.includes(key)) return t[key] ? formatDisplayDate(t[key]) : "";
  if (key === "quotationNo") return cleanQuotationNo(t.quotationNo);
  if (key === "amount") return `₹${t.amount || "0"}`;
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
  if (key === "quotationPdfLink") {
    return (
      <td key={key} className="px-3.5 py-2 text-xs align-middle">
        {t.quotationPdfLink ? (
          <a href={t.quotationPdfLink} target="_blank" rel="noreferrer" className="font-semibold text-primary underline hover:text-brand-800">
            View
          </a>
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

const formatInputDate = (dateStr) => {
  if (!dateStr) return "";
  const str = String(dateStr).trim().split(" ")[0];
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  const match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    let year = match[3];
    if (year.length === 2) {
      year = "20" + year;
    }
    return `${year}-${month}-${day}`;
  }

  const matchY = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (matchY) {
    const year = matchY[1];
    const month = matchY[2].padStart(2, "0");
    const day = matchY[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch { /* unparseable date: fall through to "" */ }
  
  return "";
};

export default function TADA() {
  const [showTADAModal, setShowTADAModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [formData, setFormData] = useState({});
  const [isCancelled, setIsCancelled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuthStore();

  // Engineers only see tickets assigned to them; admins see everything and may cancel a ticket.
  const isEngineer = user?.role === "ENGINEER";
  const role = user?.role === "ADMIN" ? "admin" : "engineer";
  const scope = useMemo(
    () => (isEngineer ? scopeBy(["engineer_assign"], [user?.name, user?.id]) : null),
    [isEngineer, user?.name, user?.id]
  );
  const list = useStageList({
    key: "tada",
    views: VIEWS,
    scope,
    scopeKey: isEngineer ? `eng:${user?.id}` : "all",
    filters: FILTERS,
    columns: COLUMNS,
    order: ORDER,
  });

  // Deep-link: /tada?ticketId=XXX opens that ticket's form. The ticket is looked up directly
  // (it may not be on the first page of the list).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("ticketId");
    if (!raw) return;
    window.history.replaceState({}, "", window.location.pathname); // clean the query param
    supabase
      .from(VIEWS.pending)
      .select("*")
      .eq("ticket_id", decodeURIComponent(raw))
      .maybeSingle()
      .then(({ data }) => {
        if (data) handleTADAClick(mapRow(data));
      });
  }, []);

  const handleTADAClick = (ticket) => {
    setSelectedTicket(ticket);
    setFormData({
      ticketId: ticket.ticketId,
      clientName: ticket.clientName,
      phoneNumber: ticket.phoneNumber,
      enquiryReceiverName: ticket.enquiryReceiverName || "",
      warrantyCheck: ticket.warrantyCheck || "",
      machineName: ticket.machineName || "",
      enquiryType: ticket.enquiryType || "",
      engineerAssign: ticket.engineerAssign || "",
      siteName: ticket.siteAddress || ticket.siteName || "",
      status: ticket.status || "",
      dateOfVisit: ticket.dateOfVisit || "",
      transportation: ticket.transportation || "",
      travelDate: formatInputDate(ticket.dateOfVisit),
      returnDate: "",
      destination: "",
      purposeOfTravel: "",
      amount: "",
      expectedCompletionDate: "",
      expectedCompletionTime: "",
      // Accounts/approval-email fields — see handleSubmit below.
      previousAdvanceDate: "",
      previousAdvanceSettlementDate: "",
      previousAdvanceBalance: "",
      balanceAmount: "",
    });
    setShowTADAModal(true);
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !formData.previousAdvanceDate ||
      !formData.previousAdvanceSettlementDate ||
      formData.previousAdvanceBalance === "" ||
      formData.previousAdvanceBalance === undefined ||
      formData.previousAdvanceBalance === null ||
      formData.balanceAmount === "" ||
      formData.balanceAmount === undefined ||
      formData.balanceAmount === null
    ) {
      toast.error("Please fill in all Previous Advance Details fields");
      return;
    }

    setIsSubmitting(true);

    try {
      // otp_verification_planned is NOT set here anymore — a Senior
      // Approval stage now sits between TADA and Site Visit (Verification
      // OTP), same as the main Service-Support-Supabase app's
      // src/pages/TADA.jsx. It only gets set once a senior approves this
      // ticket's TADA/advance request on the public /tada-decision page
      // (main app); rejecting leaves it null forever, parking the ticket in
      // TADA Approval's History with no path forward.
      const { error } = await supabase.from("sss_tada").insert({
        ticket_id: selectedTicket.ticketId,
        ticket_uuid: selectedTicket.id,
        travel_date: formData.travelDate || null,
        return_date: formData.returnDate || null,
        destination: formData.destination || null,
        purpose_of_travel: formData.purposeOfTravel || null,
        amount: formData.amount || null,
        expected_completion_date: formData.expectedCompletionDate || null,
        expected_completion_time: formData.expectedCompletionTime || null,
        previous_advance_date: formData.previousAdvanceDate || null,
        previous_advance_settlement_date: formData.previousAdvanceSettlementDate || null,
        previous_advance_balance: formData.previousAdvanceBalance || null,
        balance_amount: formData.balanceAmount || null,
      });

      if (error) throw error;

      // Create the Senior Approval tracking row + fire its email. Neither
      // failing should undo the TADA submission above — worst case, the
      // ticket just sits in the main app's TADA Approval Pending tab until
      // someone uses its "Resend Email" button.
      const token = crypto.randomUUID();
      const { error: approvalError } = await supabase.from("sss_senior_approval").insert({
        ticket_id: selectedTicket.ticketId,
        ticket_uuid: selectedTicket.id,
        token,
      });

      if (approvalError) {
        console.error("Error creating senior approval record:", approvalError);
        toast.error("TADA saved, but the approval request record could not be created.");
      } else {
        sendTadaApprovalEmail({
          token,
          ticketId: selectedTicket.ticketId,
          companyName: selectedTicket.companyName,
          siteAddress: formData.siteName || selectedTicket.siteAddress,
          machineName: formData.machineName,
          travelDate: formData.travelDate,
          returnDate: formData.returnDate,
          amount: formData.amount,
          purposeOfTravel: formData.purposeOfTravel,
          previousAdvanceDate: formData.previousAdvanceDate,
          previousAdvanceSettlementDate: formData.previousAdvanceSettlementDate,
          previousAdvanceBalance: formData.previousAdvanceBalance,
          balanceAmount: formData.balanceAmount,
          engineerName: formData.engineerAssign || selectedTicket.engineerAssign,
        }).then(({ success, error: emailError }) => {
          if (!success) {
            toast.error(
              emailError ||
                "TADA saved, but the approval email could not be sent. Use 'Resend Email' from the main app's TADA Approval page."
            );
          }
        });
      }

      toast.success("Ticket details saved — sent for Senior Approval.");
      setShowTADAModal(false);
      list.reload();
    } catch (error) {
      console.error("Error submitting ticket:", error);
      toast.error(error.message || "Failed to save ticket details");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [cancelSubmit, setCancelSubmit] = useState(false);

  const handleSubmitCancel = async (e) => {
    e.preventDefault();

    setCancelSubmit(true);

    try {
      const { error } = await supabase.from("sss_cancelled_tickets").insert({
        ticket_id: selectedTicket.ticketId,
        ticket_uuid: selectedTicket.id,
        cancelled_from_stage: "TADA",
        remarks: formData.cancelRemarks || null,
      });

      if (error) throw error;

      list.reload(); // the cancelled ticket leaves Pending
      toast.success("Ticket details cancelled successfully");
      setShowTADAModal(false);
      setIsCancelled(false);
    } catch (error) {
      console.error("Error submitting ticket:", error);
      toast.error(error.message || "Failed to cancel ticket");
    } finally {
      setCancelSubmit(false);
    }
  };

  const isPending = list.tab === "pending";
  const rows = useMemo(() => list.rows.map(mapRow), [list.rows]);
  const headers = [...(isPending ? [{ label: "Action", className: "w-24" }] : []), ...list.activeColumns.map((c) => c.label)];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* One toolbar row */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusTabs tabs={list.tabs} activeTab={list.tab} onChange={list.setTab} label="TADA views" />
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${list.fetching ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
        <ColumnSelector {...list.columnPanel} />
      </div>
      <FilterChips chips={list.chips} onClearAll={list.clearAll} />

      <div className="min-h-0 flex-1">
        <DataTable
          ariaLabel={isPending ? "Pending TADA" : "TADA history"}
          headers={headers}
          data={rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle={list.chips.length ? "No tickets match these filters" : isPending ? "No pending TADA" : "No TADA history yet"}
          currentPage={list.page}
          totalPages={list.totalPages}
          itemsPerPage={list.pageSize}
          totalResults={list.total}
          onPageChange={list.setPage}
          onItemsPerPageChange={list.setPageSize}
          itemsPerPageOptions={PAGE_SIZES}
          minWidth="min-w-[900px]"
          renderRow={(ticket) => (
            <tr key={ticket.id}>
              {isPending && (
                <td className="px-3.5 py-2 align-middle">
                  <button
                    type="button"
                    onClick={() => handleTADAClick(ticket)}
                    data-testid={`button-tada-${ticket.ticketId}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Car size={13} aria-hidden="true" />
                    TADA
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
                  <p className="mt-1 text-muted-foreground">{formatDisplayDate(ticket.timeStemp)}</p>
                </div>
                {isPending && (
                  <button
                    type="button"
                    onClick={() => handleTADAClick(ticket)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-semibold text-primary-foreground"
                  >
                    <Car size={13} aria-hidden="true" />
                    TADA
                  </button>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2">
                {list.activeColumns
                  .filter((c) => !["ticketId", "timeStemp"].includes(c.key) && cellText(c.key, ticket))
                  .map((c) => (
                    <div key={c.key} className={WIDE_KEYS.includes(c.key) ? "col-span-2" : ""}>
                      <dt className="text-muted-foreground">{c.label}</dt>
                      <dd className="break-words font-medium">
                        {c.key === "quotationPdfLink" ? (
                          <a href={ticket.quotationPdfLink} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">View</a>
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

      {/* TADA Modal */}
      <Modal
        isOpen={showTADAModal}
        onClose={() => setShowTADAModal(false)}
        title="TADA (Travel and Daily Allowance)"
        size="2xl"
      >
        <div className="bg-white rounded-lg max-h-[70vh] overflow-y-auto">
          <div className="p-6">
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 md:grid-cols-2 gap-6  "
            >
              {role === "admin" && (
                <div className="flex items-center space-x-2 mb-10">
                  <input
                    type="checkbox"
                    id="cancelTicket"
                    checked={isCancelled}
                    onChange={(e) => setIsCancelled(e.target.checked)}
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <Label
                    htmlFor="cancelTicket"
                    className="text-red-600 font-medium"
                  >
                    Cancel Ticket
                  </Label>
                </div>
              )}

              <div></div>

              {/* Pre-filled fields */}
              <div className="space-y-1">
                <Label className="text-gray-600 font-medium">Ticket ID</Label>
                <Input
                  value={formData.ticketId || ""}
                  disabled
                  className="bg-gray-50 border border-gray-200 text-gray-700 rounded-lg py-2 px-3 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-600 font-medium">Client Name</Label>
                <Input
                  value={formData.clientName || ""}
                  disabled
                  className="bg-gray-50 border border-gray-200 text-gray-700 rounded-lg py-2 px-3 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-600 font-medium">
                  Phone Number
                </Label>
                <Input
                  value={formData.phoneNumber || ""}
                  disabled
                  className="bg-gray-50 border border-gray-200 text-gray-700 rounded-lg py-2 px-3 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-600 font-medium">
                  Machine Name
                </Label>
                <Input
                  value={formData.machineName || ""}
                  disabled
                  className="bg-gray-50 border border-gray-200 text-gray-700 rounded-lg py-2 px-3 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-600 font-medium">
                  Engineer Assign
                </Label>
                <Input
                  value={formData.engineerAssign || ""}
                  disabled
                  className="bg-gray-50 border border-gray-200 text-gray-700 rounded-lg py-2 px-3 focus:outline-none"
                />
              </div>

              {!isCancelled && (
                <>
                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Site Name
                    </Label>
                    <Input
                      value={formData.siteName || ""}
                      disabled
                      className="bg-gray-50 border border-gray-200 text-gray-700 rounded-lg py-2 px-3 focus:outline-none"
                    />
                  </div>

                  {/* Editable fields */}
                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Travel Date *
                    </Label>
                    <Input
                      type="date"
                      value={formData.travelDate || ""}
                      data-testid="input-travel-date"
                      className="bg-gray-50 border border-gray-200 text-gray-500 rounded-lg py-2 px-3 focus:outline-none cursor-not-allowed"
                      disabled
                      readOnly
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Return Date *
                    </Label>
                    <Input
                      type="date"
                      value={formData.returnDate || ""}
                      onChange={(e) =>
                        handleInputChange("returnDate", e.target.value)
                      }
                      data-testid="input-return-date"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Destination *
                    </Label>
                    <Input
                      placeholder="Enter destination"
                      value={formData.destination || ""}
                      onChange={(e) =>
                        handleInputChange("destination", e.target.value)
                      }
                      data-testid="input-destination"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Purpose of Travel *
                    </Label>
                    <Input
                      placeholder="Enter purpose"
                      value={formData.purposeOfTravel || ""}
                      onChange={(e) =>
                        handleInputChange("purposeOfTravel", e.target.value)
                      }
                      data-testid="input-purpose"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Expected Completion Date *
                    </Label>
                    <Input
                      type="date"
                      value={formData.expectedCompletionDate || ""}
                      onChange={(e) =>
                        handleInputChange("expectedCompletionDate", e.target.value)
                      }
                      required
                      data-testid="input-expected-completion-date"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Expected Completion Time *
                    </Label>
                    <Input
                      type="time"
                      value={formData.expectedCompletionTime || ""}
                      onChange={(e) =>
                        handleInputChange("expectedCompletionTime", e.target.value)
                      }
                      required
                      data-testid="input-expected-completion-time"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Amount *
                    </Label>
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      value={formData.amount || ""}
                      onChange={(e) =>
                        handleInputChange("amount", e.target.value)
                      }
                      data-testid="input-amount"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700">
                      Previous Advance Details (for Accounts Approval Email)
                    </h4>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Previous Advance Date *
                    </Label>
                    <Input
                      type="date"
                      value={formData.previousAdvanceDate || ""}
                      onChange={(e) =>
                        handleInputChange("previousAdvanceDate", e.target.value)
                      }
                      data-testid="input-previous-advance-date"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Previous Advance Settlement Date *
                    </Label>
                    <Input
                      type="date"
                      value={formData.previousAdvanceSettlementDate || ""}
                      onChange={(e) =>
                        handleInputChange("previousAdvanceSettlementDate", e.target.value)
                      }
                      data-testid="input-previous-advance-settlement-date"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Previous Advance Balance (₹) *
                    </Label>
                    <Input
                      type="number"
                      placeholder="Amount left over from the previous advance"
                      value={formData.previousAdvanceBalance || ""}
                      onChange={(e) =>
                        handleInputChange("previousAdvanceBalance", e.target.value)
                      }
                      data-testid="input-previous-advance-balance"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-gray-600 font-medium">
                      Balance Amount (₹) *
                    </Label>
                    <Input
                      type="number"
                      placeholder="Net amount receivable/payable this time"
                      value={formData.balanceAmount || ""}
                      onChange={(e) =>
                        handleInputChange("balanceAmount", e.target.value)
                      }
                      data-testid="input-balance-amount"
                      className="border-gray-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end space-x-4 pt-6 border-t border-gray-200">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowTADAModal(false)}
                      data-testid="button-cancel-tada"
                      className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      data-testid="button-submit-tada"
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center">
                          <Loader2Icon className="animate-spin mr-2" />
                          Processing...
                        </span>
                      ) : (
                        "Submit"
                      )}
                    </Button>
                  </div>
                </>
              )}

              {isCancelled && (
                <>
                  <div>
                    <Label>Remarks</Label>
                    <Textarea
                      rows={3}
                      value={formData.cancelRemarks || ""}
                      onChange={(e) =>
                        handleInputChange("cancelRemarks", e.target.value)
                      }
                      data-testid="textarea-remark"
                    />
                  </div>

                  <div className="flex justify-center py-6">
                    <Button
                      type="button"
                      onClick={handleSubmitCancel}
                      className="bg-red-600 hover:bg-red-700 text-white px-8 py-3"
                    >
                      {cancelSubmit && (
                        <Loader2Icon className="animate-spin w-4 h-4 mr-2" />
                      )}
                      Confirm Cancellation
                    </Button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}
