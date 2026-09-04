import { createClient } from "@supabase/supabase-js";

// Same Supabase project as the main Service-Support-Supabase app — the
// Engineer Dashboard is a read/write client for the same sss_ tables,
// filtered by engineer_assign at query time (see each page's RBAC filter).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
