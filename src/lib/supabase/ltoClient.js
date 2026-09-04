import { supabase } from "./client";

// Client for the Lead-To-Order (lto_*) tables — client master, dropdowns,
// etc. Historically pointed at a separate Supabase project via its own
// VITE_LTO_SUPABASE_URL/VITE_LTO_SUPABASE_ANON_KEY and a second
// createClient() call. Since the schema migration into the Divine
// production project (2026-09-04), this app's own sss_/engg_dsb_ schema
// and the lto_* schema live in the SAME Supabase project as the main
// client (./client.js) — so `ltoSupabase` is now just an alias for it.
// NOT the same project as pfmsClient.js's real Purchase/FMS project
// (zpkikvgmmbtekbcuqahf) — that one stays separate, see pfmsClient.js.
export const ltoSupabase = supabase;
