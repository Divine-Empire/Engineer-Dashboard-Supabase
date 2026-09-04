import { useState, useEffect } from "react";
import {
    Card,
    CardContent,
    CardHeader,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../../components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select";
import { Modal } from "../../components/ui/modal";
import { useToast } from "../../hooks/use-toast";
import { Loader2Icon, LoaderIcon } from "lucide-react";
import { Textarea } from "../../components/ui/textarea";
import { useAuthStore } from "../../store/authStore";
import { supabase } from "../../lib/supabase/client";

export default function SiteVisitDetail() {
    const [activeTab, setActiveTab] = useState("pending");
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [formData, setFormData] = useState({});
    const [searchItem, setSearchItem] = useState("");
    const [isCancelled, setIsCancelled] = useState(false);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const { toast } = useToast();

    const [masterData, setMasterData] = useState({});

    const [pendingData, setPendingData] = useState([]);
    const [historyData, setHistoryData] = useState([]);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // READ-ONLY view of the same public.sss_otp_verification data
    // src/pages/OTP-Verification/SiteVisitOTPVerification.jsx submits to —
    // in the new schema, "OTP Verification" and "Site Visit Detail" are ONE
    // combined stage (one row per ticket), so this page no longer has its
    // own submission; process everything from the OTP Verification page
    // instead. See migration notes in that file.
    const fetchData = async () => {
        setFetchLoading(true);
        try {
            const { data: tadaRows, error: tadaError } = await supabase
                .from("sss_tada")
                .select("ticket_id, ticket_uuid, travel_date, return_date, otp_verification_planned")
                .not("otp_verification_planned", "is", null)
                .order("created_at", { ascending: false });

            if (tadaError) throw tadaError;

            const ticketIds = [...new Set((tadaRows || []).map((t) => t.ticket_id))];

            if (ticketIds.length === 0) {
                setPendingData([]);
                setHistoryData([]);
                return;
            }

            const [ticketsRes, otpRes] = await Promise.all([
                supabase.from("sss_tickets").select("*").in("ticket_id", ticketIds).order("created_at", { ascending: true }),
                supabase.from("sss_otp_verification").select("*").in("ticket_id", ticketIds),
            ]);

            if (ticketsRes.error) throw ticketsRes.error;
            if (otpRes.error) throw otpRes.error;

            const otpByTicket = new Map((otpRes.data || []).map((o) => [o.ticket_id, o]));

            const pending = [];
            const history = [];

            (ticketsRes.data || []).forEach((t) => {
                const base = {
                    id: t.uuid,
                    ticketId: t.ticket_id || "",
                    clientName: t.client_name || "",
                    companyName: t.company_name || "",
                    phoneNumber: t.phone_number || "",
                    machineName: t.machine_name || "",
                    engineerAssign: t.engineer_assign || "",
                    CREName: t.cre_name || "",
                };

                const otp = otpByTicket.get(t.ticket_id);
                if (otp) {
                    history.push({
                        ...base,
                        sitevisitDate: otp.site_visit_date || "",
                        otpVerification: otp.otp_entered || "",
                        serviceReportFile: otp.service_report_file || "",
                        quatationReceive: otp.quotation_receive_file || "",
                        video: otp.video_link || "",
                        locallyPurchasedSpares: otp.locally_purchased_spares || "",
                        remarksEnginner: otp.remarks || "",
                        delayMinutes: otp.delay_minutes,
                    });
                } else {
                    pending.push(base);
                }
            });

            setPendingData(pending);
            setHistoryData(history);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Failed to load data");
        } finally {
            setFetchLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // READ-ONLY page (see fetchData's comment above) — clicking a row just
    // opens the same details, pre-filled, with nothing editable and no
    // submit. Pending rows have no details yet (process them from the OTP
    // Verification page instead).
    const handleApprovalClick = (ticket) => {
        if (!ticket.otpVerification && activeTab === "pending") {
            toast.error('Process this from the "Site Visit OTP Verification" page — both pages share one combined stage now.');
            return;
        }
        setSelectedTicket(ticket);
        setFormData({
            ticketId: ticket.ticketId,
            clientName: ticket.clientName,
            phoneNumber: ticket.phoneNumber,
            machineName: ticket.machineName || "",
            serviceReportFileUrl: ticket.serviceReportFile || "",
            quatationReceiveUrl: ticket.quatationReceive || "",
            video: ticket.video || "",
            locallyPurchasedSpares: ticket.locallyPurchasedSpares || "",
            remarks: ticket.remarksEnginner || "",
        });
        setShowApprovalModal(true);
    };

    const handleInputChange = () => {}; // read-only — inputs below are disabled

    const formatDate = (dateString) => {
        if (!dateString) return "";

        const dateStr = String(dateString).trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            return dateStr;
        }

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateStr;

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    };

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

    const filteredPendingDataa = pendingData
        .filter((item) => {
            const matchesSearch =
                String(item.ticketId || "").toLowerCase().includes(searchItem.toLowerCase()) ||
                String(item.clientName || "").toLowerCase().includes(searchItem.toLowerCase()) ||
                String(item.companyName || "").toLowerCase().includes(searchItem.toLowerCase()) ||
                String(item.phoneNumber || "").toLowerCase().includes(searchItem.toLowerCase());
            // const matchesParty =
            //   filterParty === "all" || item.partyName === filterParty;
            // return matchesSearch && matchesParty;
            return matchesSearch;
        })
        .reverse();

    const filteredHistoryDataa = historyData
        .filter((item) => {
            const matchesSearch =
                String(item.ticketId || "").toLowerCase().includes(searchItem.toLowerCase()) ||
                String(item.clientName || "").toLowerCase().includes(searchItem.toLowerCase()) ||
                String(item.companyName || "").toLowerCase().includes(searchItem.toLowerCase()) ||
                String(item.phoneNumber || "").toLowerCase().includes(searchItem.toLowerCase());
            // const matchesParty =
            //   filterParty === "all" || item.partyName === filterParty;
            // return matchesSearch && matchesParty;
            return matchesSearch;
        })
        .reverse();

    const { user } = useAuthStore();
    const userName = user?.name || "";
    const role = user?.role?.toLowerCase() || "";

    const filteredPendingData = role === "user" ? filteredPendingDataa.filter(
        (item) => item["CREName"] === userName
    ) : role === "engineer" ? filteredPendingDataa.filter((item) =>
        item["engineerAssign"] === userName) : filteredPendingDataa;


    const filteredHistoryData = role === "user" ? filteredHistoryDataa.filter(
        (item) => item["CREName"] === userName
    ) : role === "engineer" ? filteredHistoryDataa.filter((item) => item["engineerAssign"] === userName) : filteredHistoryDataa;

    // console.log("filteredPendingDataa", filteredPendingDataa);
    // console.log("filteredHistoryDataa", filteredHistoryDataa);

    return (
        <div className="space-y-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                    <CardHeader className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 rounded-t-lg border-b border-blue-100 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
                        {/* Left Side: Tabs triggers */}
                        <div className="flex flex-wrap items-center gap-4">
                            <TabsList className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                                <TabsTrigger
                                    value="pending"
                                    data-testid="tab-pending"
                                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                                >
                                    Pending ({filteredPendingData.length})
                                </TabsTrigger>
                                <TabsTrigger
                                    value="history"
                                    data-testid="tab-history"
                                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                                >
                                    History ({filteredHistoryData.length})
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Right Side: Search Input */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-1 md:justify-end w-full md:w-auto">
                            <div className="relative flex-1 max-w-md w-full">
                                <Input
                                    id="searchFilter"
                                    placeholder="Search by ticket ID, client, company or phone..."
                                    className="pl-10 py-2 w-full rounded-md border-blue-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white"
                                    data-testid="input-search-filter"
                                    onChange={(e) => setSearchItem(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent>
                        <div className="mt-2">
                            <TabsContent value="pending" className="mt-0">
                                <div className="relative overflow-x-auto">
                                    <div className="max-h-[calc(103vh-200px)] overflow-y-auto">
                                        <table className="hidden sm:block w-full">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-gradient-to-r from-blue-600 to-indigo-600">
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[120px] sticky top-0">
                                                        Action
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Date
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[120px] sticky top-0">
                                                        Ticket ID
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Source of enquiry
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Call type
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[180px] sticky top-0">
                                                        Enquiry Receiver Name
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Client Type
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[200px] sticky top-0">
                                                        Company Name
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Client Name
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Phone Number
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[200px] sticky top-0">
                                                        Billing Address
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[200px] sticky top-0">
                                                        Site Address
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        GST No.
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Machine Name
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Category
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[200px] sticky top-0">
                                                        Mention Issue
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Service Location
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Warranty Check
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Engineer Assign
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[120px] sticky top-0">
                                                        Travel Date
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[120px] sticky top-0">
                                                        Return Date
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-blue-100">
                                                {filteredPendingData.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={21}
                                                            className="text-center py-8 bg-white"
                                                            data-testid="text-no-pending"
                                                        >
                                                            {fetchLoading ? (
                                                                <div className="flex justify-center items-center text-blue-700">
                                                                    <LoaderIcon className="animate-spin w-8 h-8" />
                                                                </div>
                                                            ) : (
                                                                <h1 className="text-blue-700">
                                                                    No pending engineer approvals found.
                                                                </h1>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredPendingData.map((ticket, ind) => (
                                                        <tr
                                                            key={ind}
                                                            className={
                                                                ind % 2 === 0 ? "bg-blue-50/50" : "bg-white"
                                                            }
                                                        >
                                                            <td className="px-4 py-3">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleApprovalClick(ticket)}
                                                                    variant="outline"
                                                                    className="bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 hover:from-blue-100 hover:to-indigo-100 hover:text-blue-700 transition-all duration-300 border border-blue-200 hover:border-blue-300 rounded-lg px-3 py-1.5 shadow-sm hover:shadow-md group"
                                                                    data-testid={`button-approval-${ticket.ticketId}`}
                                                                >
                                                                    <span className="font-medium">Approval</span>
                                                                </Button>
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {formatDate(ticket.timeStemp)}
                                                            </td>
                                                            <td className="px-4 py-3 font-medium text-blue-800">
                                                                {ticket.ticketId}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.sourceOfEnquiry || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.callType || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.enquiryReceiverName || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.clientType || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.companyName || "-"}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.clientName}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.phoneNumber}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.gstAddress || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.siteAddress || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.gstNo || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.machineName || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.category || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.mentionIssue || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.serviceLocation || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.warrantyCheck || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.engineerAssign || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {formatDate(ticket.travelDate) || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {formatDate(ticket.returnDate) || ""}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>

                                        {/* Mobile Card View */}
                                        <div className="sm:hidden space-y-4">
                                            {filteredPendingData.length === 0 ? (
                                                <div
                                                    className="text-center py-8 bg-white"
                                                    data-testid="text-no-pending"
                                                >
                                                    {fetchLoading ? (
                                                        <div className="flex justify-center items-center text-blue-700">
                                                            <LoaderIcon className="animate-spin w-8 h-8" />
                                                        </div>
                                                    ) : (
                                                        <h1 className="text-blue-700">
                                                            No pending engineer approvals found.
                                                        </h1>
                                                    )}
                                                </div>
                                            ) : (
                                                filteredPendingData.map((ticket, ind) => (
                                                    <Card
                                                        key={ind}
                                                        className={`${ind % 2 === 0 ? "bg-blue-50/50" : "bg-white"
                                                            } border-l-4 border-l-blue-500`}
                                                    >
                                                        <CardContent className="p-4 space-y-3">
                                                            {/* Header with Ticket ID and Action */}
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h3 className="font-bold text-blue-800 text-lg">
                                                                        {ticket.ticketId}
                                                                    </h3>
                                                                    <p className="text-sm text-gray-600">
                                                                        {ticket.clientName}
                                                                    </p>
                                                                    <p className="text-sm text-gray-600 font-medium">
                                                                        Company: {ticket.companyName || "N/A"}
                                                                    </p>
                                                                </div>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleApprovalClick(ticket)}
                                                                    variant="outline"
                                                                    className="bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 hover:from-blue-100 hover:to-indigo-100 border border-blue-200"
                                                                >
                                                                    Approval
                                                                </Button>
                                                            </div>

                                                            {/* Contact & Receiver Info */}
                                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Phone
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {ticket.phoneNumber}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Enquiry Receiver
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {ticket.enquiryReceiverName || "N/A"}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Technical Details */}
                                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Warranty
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {ticket.warrantyCheck}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Machine
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {ticket.machineName || "N/A"}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Engineer & Enquiry Type */}
                                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Engineer
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {ticket.engineerAssign || "N/A"}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Call Type
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {ticket.callType || "N/A"}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Travel Dates */}
                                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Travel Date
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {formatDate(ticket.travelDate) || "N/A"}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Return Date
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {formatDate(ticket.returnDate) || "N/A"}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="history" className="mt-0">
                                <div className="relative overflow-x-auto">
                                    <div className="max-h-[calc(103vh-200px)] overflow-y-auto">
                                        <table className="hidden sm:block w-full">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-gradient-to-r from-blue-600 to-indigo-600">
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Date
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[120px] sticky top-0">
                                                        Ticket ID
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Source of enquiry
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Call type
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[180px] sticky top-0">
                                                        Enquiry Receiver Name
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Client Type
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[200px] sticky top-0">
                                                        Company Name
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Client Name
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Phone Number
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[200px] sticky top-0">
                                                        Billing Address
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[200px] sticky top-0">
                                                        Site Address
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        GST No.
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Machine Name
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Category
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[200px] sticky top-0">
                                                        Mention Issue
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Service Location
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Warranty Check
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Engineer Assign
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[120px] sticky top-0">
                                                        Travel Date
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[120px] sticky top-0">
                                                        Return Date
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Remarks
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Service Report
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-blue-100">
                                                {filteredHistoryData.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={22}
                                                            className="text-center py-8 bg-white"
                                                            data-testid="text-no-history"
                                                        >
                                                            {fetchLoading ? (
                                                                <div className="flex justify-center items-center text-blue-700">
                                                                    <LoaderIcon className="animate-spin w-8 h-8" />
                                                                </div>
                                                            ) : (
                                                                <h1 className="text-blue-700">
                                                                    No engineer approval history found.
                                                                </h1>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredHistoryData.map((ticket, ind) => (
                                                        <tr
                                                            key={ind}
                                                            className={
                                                                ind % 2 === 0 ? "bg-blue-50/50" : "bg-white"
                                                            }
                                                        >
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {formatDate(ticket.timeStemp)}
                                                            </td>
                                                            <td className="px-4 py-3 font-medium text-blue-800">
                                                                {ticket.ticketId}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.sourceOfEnquiry || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.callType || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.enquiryReceiverName || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.clientType || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.companyName || "-"}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.clientName}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.phoneNumber}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.gstAddress || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.siteAddress || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.gstNo || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.machineName || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.category || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.mentionIssue || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.serviceLocation || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.warrantyCheck || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.engineerAssign || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {formatDate(ticket.travelDate) || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {formatDate(ticket.returnDate) || ""}
                                                            </td>
                                                            <td className="px-4 py-3 text-blue-900">
                                                                {ticket.remarksEnginner || ""}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                {ticket.serviceReportFile ? (
                                                                    <a
                                                                        href={ticket.serviceReportFile}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-blue-600 hover:text-blue-800 text-xs font-semibold"
                                                                    >
                                                                        View PDF
                                                                    </a>
                                                                ) : (
                                                                    ""
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>

                                        {/* Mobile Card View */}
                                        <div className="sm:hidden space-y-4">
                                            {filteredHistoryData.length === 0 ? (
                                                <div
                                                    className="text-center py-8 bg-white"
                                                    data-testid="text-no-history"
                                                >
                                                    {fetchLoading ? (
                                                        <div className="flex justify-center items-center text-blue-700">
                                                            <LoaderIcon className="animate-spin w-8 h-8" />
                                                        </div>
                                                    ) : (
                                                        <h1 className="text-blue-700">
                                                            No engineer approval history found.
                                                        </h1>
                                                    )}
                                                </div>
                                            ) : (
                                                filteredHistoryData.map((ticket, ind) => (
                                                    <Card
                                                        key={ind}
                                                        className={`${ind % 2 === 0 ? "bg-blue-50/50" : "bg-white"
                                                            } border-l-4 border-l-blue-500`}
                                                    >
                                                        <CardContent className="p-4 space-y-3">
                                                            {/* Header */}
                                                            <div>
                                                                <h3 className="font-bold text-blue-800 text-lg">
                                                                    {ticket.ticketId}
                                                                </h3>
                                                                <p className="text-sm text-gray-600">
                                                                    {ticket.clientName}
                                                                </p>
                                                                <p className="text-sm text-gray-600 font-medium">
                                                                    Company: {ticket.companyName || "N/A"}
                                                                </p>
                                                            </div>

                                                            {/* Contact & Machine Info */}
                                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Phone
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {ticket.phoneNumber}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Machine
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {ticket.machineName || "N/A"}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Travel Dates */}
                                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Travel Date
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {formatDate(ticket.travelDate) || "N/A"}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500 font-medium">
                                                                        Return Date
                                                                    </p>
                                                                    <p className="text-blue-900">
                                                                        {formatDate(ticket.returnDate) || "N/A"}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Remarks */}
                                                            <div>
                                                                <p className="text-gray-500 font-medium text-sm">
                                                                    Remarks
                                                                </p>
                                                                <p className="text-blue-900 line-clamp-3">
                                                                    {ticket.remarksEnginner || "No remarks"}
                                                                </p>
                                                            </div>

                                                            {/* Service Report */}
                                                            <div>
                                                                <p className="text-gray-500 font-medium text-sm">
                                                                    Service Report
                                                                </p>
                                                                {ticket.serviceReportFile ? (
                                                                    <a
                                                                        href={ticket.serviceReportFile}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-semibold"
                                                                    >
                                                                        <svg
                                                                            xmlns="http://www.w3.org/2000/svg"
                                                                            className="h-4 w-4 mr-1"
                                                                            viewBox="0 0 20 20"
                                                                            fill="currentColor"
                                                                        >
                                                                            <path
                                                                                fillRule="evenodd"
                                                                                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                                                                                clipRule="evenodd"
                                                                            />
                                                                        </svg>
                                                                        View Service Report PDF
                                                                    </a>
                                                                ) : (
                                                                    <p className="text-blue-900 text-sm">
                                                                        No service report available
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                    </CardContent>
                </Card>
            </Tabs>

            {/* Read-only Detail Modal — see fetchData's comment above: this
                page no longer submits anything, it just views the same
                sss_otp_verification row src/pages/OTP-Verification/
                SiteVisitOTPVerification.jsx owns. */}
            <Modal
                isOpen={showApprovalModal}
                onClose={() => setShowApprovalModal(false)}
                title="Site Visit Detail (Read-only)"
                size="2xl"
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label>Ticket ID</Label>
                        <Input value={selectedTicket?.ticketId || ""} disabled className="bg-slate-50" />
                    </div>
                    <div>
                        <Label>Client Name</Label>
                        <Input value={selectedTicket?.clientName || ""} disabled className="bg-slate-50" />
                    </div>
                    <div>
                        <Label>Phone Number</Label>
                        <Input value={selectedTicket?.phoneNumber || ""} disabled className="bg-slate-50" />
                    </div>
                    <div>
                        <Label>Machine Name</Label>
                        <Input value={selectedTicket?.machineName || ""} disabled className="bg-slate-50" />
                    </div>

                    <div>
                        <Label>Service Report</Label>
                        {formData.serviceReportFileUrl ? (
                            <a href={formData.serviceReportFileUrl} target="_blank" rel="noopener noreferrer" className="block w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-blue-600 hover:bg-blue-100 truncate">
                                View Service Report
                            </a>
                        ) : (
                            <Input value="Not uploaded" disabled className="bg-slate-50" />
                        )}
                    </div>

                    <div>
                        <Label>Quotation Receive</Label>
                        {formData.quatationReceiveUrl ? (
                            <a href={formData.quatationReceiveUrl} target="_blank" rel="noopener noreferrer" className="block w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-blue-600 hover:bg-blue-100 truncate">
                                View Quotation
                            </a>
                        ) : (
                            <Input value="Not uploaded" disabled className="bg-slate-50" />
                        )}
                    </div>

                    <div>
                        <Label>Video</Label>
                        {formData.video ? (
                            <a href={formData.video} target="_blank" rel="noopener noreferrer" className="block w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-blue-600 hover:bg-blue-100 truncate">
                                View Video
                            </a>
                        ) : (
                            <Input value="Not uploaded" disabled className="bg-slate-50" />
                        )}
                    </div>

                    <div>
                        <Label>Locally purchased spares</Label>
                        <Input value={formData.locallyPurchasedSpares || "N/A"} disabled className="bg-slate-50" />
                    </div>

                    <div className="md:col-span-2">
                        <Label>Remarks</Label>
                        <Textarea rows={2} value={formData.remarks || ""} disabled className="bg-slate-50" />
                    </div>

                    <div className="md:col-span-2 flex justify-end pt-4">
                        <Button type="button" variant="outline" onClick={() => setShowApprovalModal(false)}>
                            Close
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
