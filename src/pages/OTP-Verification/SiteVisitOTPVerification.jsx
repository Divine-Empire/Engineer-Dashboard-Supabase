import { useState, useEffect } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
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
import { Loader2Icon, LoaderIcon, Eye } from "lucide-react";
import { Textarea } from "../../components/ui/textarea";
import { useAuthStore } from "../../store/authStore";
import { supabase } from "../../lib/supabase/client";

export default function EngineerApproval() {
    const [lastOtpGenerations, setLastOtpGenerations] = useState({});
    const [activeTab, setActiveTab] = useState("pending");
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [formData, setFormData] = useState({});
    const [searchItem, setSearchItem] = useState("");
    const [isCancelled, setIsCancelled] = useState(false);
    const { toast } = useToast();

    const [masterData, setMasterData] = useState({});

    const [pendingData, setPendingData] = useState([]);
    const [historyData, setHistoryData] = useState([]);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Files are only HELD here on selection — actual upload happens at
    // submit time in handleSubmit (all three in parallel), same pattern as
    // the main app's src/pages/SiteVisitOTPVerification.jsx.
    const [serviceReportFile, setServiceReportFile] = useState(null);
    const [quotationReceiveFile, setQuotationReceiveFile] = useState(null);
    const [videoFile, setVideoFile] = useState(null);

    // Tickets ready for OTP Verification: sss_tada.otp_verification_planned
    // set. Pending = no sss_otp_verification row yet; History = row exists.
    // Same shape as the main app's src/pages/SiteVisitOTPVerification.jsx —
    // OTP entry AND the service report/video/remarks are ONE combined
    // submission into sss_otp_verification (unique per ticket).
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

            const tadaByTicket = new Map((tadaRows || []).map((t) => [t.ticket_id, t]));

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
                const tada = tadaByTicket.get(t.ticket_id);

                const base = {
                    id: t.uuid, // ticket_uuid — see handleSubmit/ResendOTP below
                    ticketId: t.ticket_id || "",
                    clientName: t.client_name || "",
                    companyName: t.company_name || "",
                    phoneNumber: t.phone_number || "",
                    machineName: t.machine_name || "",
                    engineerAssign: t.engineer_assign || "",
                    CREName: t.cre_name || "",
                    travelDate: tada?.travel_date || "",
                    returnDate: tada?.return_date || "",
                    // Live/regeneratable OTP for this stage (tickets.site_visit_otp).
                    siteVisitOtp: t.site_visit_otp || "",
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
                        remarks: otp.remarks || "",
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

    const uploadToStorage = async (file, prefix, ticketId) => {
        const path = `otp_verification/${prefix}_${ticketId}_${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
            .from("ticket_enquiry")
            .upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("ticket_enquiry").getPublicUrl(path);
        return data.publicUrl;
    };

    useEffect(() => {
        fetchData();
    }, []);

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

    const handleServiceReportChange = (e) => {
        const file = e.target.files[0];
        if (file) setServiceReportFile(file);
    };

    const handleQuotationChange = (e) => {
        const file = e.target.files[0];
        if (file) setQuotationReceiveFile(file);
    };

    const handleVideoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const MAX_SIZE = 100 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            toast.error("Video file size exceeds the 100MB limit.");
            e.target.value = null;
            return;
        }
        setVideoFile(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.siteVisitDate) {
            toast.error("Please Select Site Visit Date");
            return;
        }

        const enteredOtp = (formData.otpVerification || "").toString().trim();
        const liveOtp = (selectedTicket?.siteVisitOtp || "").toString().trim();

        if (!enteredOtp) {
            toast.error("Please Enter the OTP");
            return;
        }
        if (!liveOtp) {
            toast.error("No OTP has been sent for this ticket yet. Please click Resend OTP first.");
            return;
        }
        if (enteredOtp !== liveOtp) {
            toast.error("Wrong OTP, Please Enter Right OTP");
            return;
        }
        if (!serviceReportFile) {
            toast.error("Please select a Service Report file first");
            return;
        }
        if (!formData.locallyPurchasedSpares) {
            toast.error("Please select Locally purchased spares option");
            return;
        }

        setIsSubmitting(true);

        try {
            const [serviceReportUrl, quotationReceiveUrl, videoUrl] = await Promise.all([
                uploadToStorage(serviceReportFile, "service_report", selectedTicket.ticketId),
                quotationReceiveFile ? uploadToStorage(quotationReceiveFile, "quotation_receive", selectedTicket.ticketId) : Promise.resolve(null),
                videoFile ? uploadToStorage(videoFile, "video", selectedTicket.ticketId) : Promise.resolve(null),
            ]);

            const { error } = await supabase.from("sss_otp_verification").insert({
                ticket_id: selectedTicket.ticketId,
                ticket_uuid: selectedTicket.id,
                site_visit_date: formData.siteVisitDate || null,
                otp_entered: enteredOtp,
                service_report_file: serviceReportUrl,
                quotation_receive_file: quotationReceiveUrl,
                video_link: videoUrl,
                locally_purchased_spares: formData.locallyPurchasedSpares || null,
                remarks: formData.remarks || null,
            });

            if (error) throw error;

            toast.success("Ticket details saved successfully");
            setShowApprovalModal(false);
            fetchData();
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
                cancelled_from_stage: "Site Visit OTP Verification",
                remarks: formData.cancelRemarks || null,
            });

            if (error) throw error;

            setPendingData((prevPending) =>
                prevPending.filter(
                    (ticket) => ticket.ticketId !== selectedTicket.ticketId
                )
            );
            toast.success("Ticket cancelled successfully");
            setShowApprovalModal(false);
            setIsCancelled(false);
        } catch (error) {
            console.error("Error submitting ticket:", error);
            toast.error(error.message || "Failed to cancel ticket");
        } finally {
            setCancelSubmit(false);
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

        // Check if OTP was already generated today for this specific ticket
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
            // Store the current timestamp as last generation time for this ticket
            setLastOtpGenerations((prev) => ({
                ...prev,
                [ticketId]: new Date().toISOString(),
            }));

            // Store in localStorage for persistence across page refreshes
            const storedGenerations = JSON.parse(
                localStorage.getItem("lastOtpVerificationGenerations") || "{}"
            );
            storedGenerations[ticketId] = new Date().toISOString();
            localStorage.setItem(
                "lastOtpVerificationGenerations",
                JSON.stringify(storedGenerations)
            );

            // selectedTicket.id is the ticket's uuid (see fetchData above) —
            // tickets.site_visit_otp is the live/regeneratable OTP column
            // for this stage.
            const { error } = await supabase
                .from("sss_tickets")
                .update({ site_visit_otp: sixDigitNumber1 })
                .eq("uuid", selectedTicket.id);

            if (error) throw error;

            setSelectedTicket((prev) => ({
                ...prev,
                siteVisitOtp: sixDigitNumber1,
            }));

            toast.success("OTP sent successfully");
        } catch (error) {
            console.error("Error submitting ticket:", error);
            toast.error("Failed to send OTP");
        } finally {
            setIsResending(false);
        }
    };

    // Load last OTP generation time from localStorage on component mount
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
    ) : role === "engineer" ? filteredPendingDataa.filter((item) => item["engineerAssign"] === userName) : filteredPendingDataa;

    const filteredHistoryData = role === "user" ? filteredHistoryDataa.filter(
        (item) => item["CREName"] === userName
    ) : role === 'engineer' ? filteredHistoryDataa.filter((item) => item["engineerAssign"] === userName) : filteredHistoryDataa;


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
                                                        Site Visit Date
                                                    </th>
                                                    <th className="text-white border-b border-blue-500 px-4 py-3 text-left w-[150px] sticky top-0">
                                                        Verification Status
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
                                                                {formatDate(ticket.sitevisitDate) || ""}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span
                                                                    className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${ticket.verificationStatus === "yes"
                                                                            ? "bg-green-100 text-green-800"
                                                                            : "bg-red-100 text-red-800"
                                                                        }`}
                                                                >
                                                                    {ticket.verificationStatus === "yes"
                                                                        ? "Verified"
                                                                        : "Pending"}
                                                                </span>
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

                                                            {/* Site Visit Date */}
                                                            <div>
                                                                <p className="text-gray-500 font-medium text-sm">
                                                                    Site Visit Date
                                                                </p>
                                                                <p className="text-blue-900">
                                                                    {formatDate(ticket.sitevisitDate) || "N/A"}
                                                                </p>
                                                            </div>

                                                            {/* Verification Status */}
                                                            <div>
                                                                <p className="text-gray-500 font-medium text-sm">
                                                                    Verification Status
                                                                </p>
                                                                <span
                                                                    className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${ticket.verificationStatus === "yes"
                                                                            ? "bg-green-100 text-green-800"
                                                                            : "bg-red-100 text-red-800"
                                                                        }`}
                                                                >
                                                                    {ticket.verificationStatus === "yes"
                                                                        ? "Verified"
                                                                        : "Pending"}
                                                                </span>
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

            {/* Engineer Approval Modal */}
            <Modal
                isOpen={showApprovalModal}
                onClose={() => setShowApprovalModal(false)}
                title="Engineer Approval"
                size="2xl"
            >
                <form
                    onSubmit={handleSubmit}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
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
                            <Label htmlFor="cancelTicket" className="text-red-600 font-medium">
                                Cancel Ticket
                            </Label>
                        </div>
                    )}

                    <div></div>

                    {/* Pre-filled fields */}
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

                    {!isCancelled && (
                        <>
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

                            <div>
                                <Label>Quotation Receive</Label>
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

                            <div>
                                <Label>Video (max 100MB)</Label>
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
                                    />
                                )}
                            </div>

                            <div>
                                <Label>Locally purchased spares *</Label>
                                <Select
                                    value={formData.locallyPurchasedSpares || ""}
                                    onValueChange={(value) => handleInputChange("locallyPurchasedSpares", value)}
                                >
                                    <SelectTrigger data-testid="select-locally-purchased-spares">
                                        <SelectValue placeholder="Select option" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white">
                                        <SelectItem value="Yes">Yes</SelectItem>
                                        <SelectItem value="No">No</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="md:col-span-2">
                                <Label>Remarks</Label>
                                <Textarea
                                    rows={2}
                                    value={formData.remarks || ""}
                                    onChange={(e) => handleInputChange("remarks", e.target.value)}
                                    placeholder="Enter remarks"
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
                                    {isSubmitting && <Loader2Icon className="animate-spin" />}
                                    Submit
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
            </Modal>
        </div>
    );
}
