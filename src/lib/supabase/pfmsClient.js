import { createClient } from "@supabase/supabase-js";

// Supabase client for the real Purchase/FMS production project
// (zpkikvgmmbtekbcuqahf) — NOT the same project as ltoClient.js (that one
// is Lead-To-Order, nfwtbrmqvsejwwvraanf; it has no pfms_* tables at all).
// Used ONLY for Storage uploads (uploadToSignedUrl in MaterialTesting.jsx). The
// pfms_* tables have RLS with no anon policy, so all table reads/writes go
// through /api/material-testing (service_role, server-side) instead.
const pfmsSupabaseUrl = import.meta.env.VITE_PFMS_SUPABASE_URL;
const pfmsSupabaseAnonKey = import.meta.env.VITE_PFMS_SUPABASE_ANON_KEY;

export const pfmsSupabase = createClient(pfmsSupabaseUrl, pfmsSupabaseAnonKey);
