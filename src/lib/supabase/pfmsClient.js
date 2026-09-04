import { createClient } from "@supabase/supabase-js";

// Supabase client for the real Purchase/FMS production project
// (zpkikvgmmbtekbcuqahf) — NOT the same project as ltoClient.js (that one
// is Lead-To-Order, nfwtbrmqvsejwwvraanf; it has no pfms_* tables at all).
// Used by MaterialTesting.jsx to read/write pfms_dropdown, pfms_lift,
// pfms_material-testing, pfms_material-received, pfms_serial-number, and
// the pfms_view-receiving_accounts view, plus uploads to the
// pfms-purchase-fms storage bucket (all live in this project).
const pfmsSupabaseUrl = import.meta.env.VITE_PFMS_SUPABASE_URL;
const pfmsSupabaseAnonKey = import.meta.env.VITE_PFMS_SUPABASE_ANON_KEY;

export const pfmsSupabase = createClient(pfmsSupabaseUrl, pfmsSupabaseAnonKey);
