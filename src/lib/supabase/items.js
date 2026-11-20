import { supabase } from "./client";

const PAGE_SIZE = 1000;

// Single source of truth for the item catalog (same as the Service Support app): `lto_items`.
// The old 'item_name' dropdown category in sss_dropdown is retired and now empty.
// Paginated past Supabase's default 1000-row cap (the catalog is ~5,000 rows).
export async function fetchItemNames() {
  let names = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("lto_items")
      .select("item_name")
      .order("item_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    names = names.concat((data || []).map((r) => r.item_name).filter(Boolean));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return [...new Set(names)];
}
