import { supabase } from "../supabase/client";

// Sends the Site Visit verification OTP to the client over WhatsApp. Same Edge Function as the main
// Service-Support-Supabase app (sss-send-site-visit-otp-notification) — this dashboard is just another
// client of the same Supabase project. Never throws: resolves { success, error? } so a WhatsApp failure
// never undoes the OTP that was already saved.
export async function sendSiteVisitOtpNotification({ clientPhoneNumber, clientName, otp }) {
  try {
    const { data, error } = await supabase.functions.invoke("sss-send-site-visit-otp-notification", {
      body: { clientPhoneNumber, clientName, otp },
    });

    if (error) {
      console.error("Site-visit OTP WhatsApp notification failed:", error);
      return { success: false, error: error.message || "Failed to send site-visit OTP WhatsApp notification" };
    }
    if (!data?.success) {
      console.error("Site-visit OTP WhatsApp notification failed:", data?.error);
      return { success: false, error: data?.error || "Failed to send site-visit OTP WhatsApp notification" };
    }
    return { success: true };
  } catch (error) {
    console.error("Site-visit OTP WhatsApp notification failed:", error);
    return { success: false, error: error.message || "Failed to send site-visit OTP WhatsApp notification" };
  }
}

// Re-sends the "video_call_has_been_scheduled" template to the client with a freshly regenerated Video Call OTP.
// Same Edge Function as the Service Support app (sss-send-video-call-otp-resend-notification). Never throws:
// resolves { success, error? } so a WhatsApp failure never undoes the OTP that was already saved.
export async function sendVideoCallOtpResendNotification({
  clientPhoneNumber,
  clientName,
  ticketId,
  issue,
  engineerName,
  dateStr,
  timeStr,
  otp,
}) {
  try {
    const { data, error } = await supabase.functions.invoke("sss-send-video-call-otp-resend-notification", {
      body: { clientPhoneNumber, clientName, ticketId, issue, engineerName, dateStr, timeStr, otp },
    });

    if (error) {
      console.error("Video-call OTP resend WhatsApp notification failed:", error);
      return { success: false, error: error.message || "Failed to send video-call OTP resend WhatsApp notification" };
    }
    if (!data?.success) {
      console.error("Video-call OTP resend WhatsApp notification failed:", data?.error);
      return { success: false, error: data?.error || "Failed to send video-call OTP resend WhatsApp notification" };
    }
    return { success: true };
  } catch (error) {
    console.error("Video-call OTP resend WhatsApp notification failed:", error);
    return { success: false, error: error.message || "Failed to send video-call OTP resend WhatsApp notification" };
  }
}
