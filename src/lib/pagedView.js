import { supabase } from './supabase/client';
import { fetchAllRows } from '../utils/fetchAllRows';

// Server half of every list page: one page of a flat SQL view per request.
// The views (Database/ engg_v_* migrations) expose the row's columns plus a lower-cased
// `search_text` and the flat filter / role columns, so search, filters and RBAC all run in
// SQL and `count: 'exact'` is the true total (no 1000-row cap, no giant `.in(...)` URLs).

// % and _ are LIKE wildcards; escape them so "5%" searches the literal text.
const likeTerm = (s) => s.toLowerCase().replace(/\\/g, '').replace(/[%_]/g, (m) => `\\${m}`);

// Values inside or=(...) are double-quoted so commas / parentheses cannot break out.
const quote = (v) => `"${String(v).replace(/[\\"]/g, '')}"`;

/**
 * Role scope: a case-insensitive match of any of `columns` against any of `values`
 * (e.g. an engineer sees rows whose assigned engineer equals their name or id).
 * Returns a query modifier. With no usable value it matches nothing (fail closed).
 */
export function scopeBy(columns, values) {
  const vals = values.filter(Boolean);
  if (!vals.length) return (q) => q.or('id.is.null'); // id is never null: matches nothing
  const expr = columns.flatMap((c) => vals.map((v) => `${c}.ilike.${quote(v.replace(/[%_]/g, ''))}`)).join(',');
  return (q) => q.or(expr);
}

/**
 * One page of `view`.
 *  filters:  { column: value }  equality filters; '' / 'all' = none
 *  scope:    modifier from scopeBy(), applied to every query
 *  order:    [{ column, ascending }]
 */
export async function fetchViewPage(
  view,
  { page, pageSize, search = '', filters = {}, scope, order = [{ column: 'created_at', ascending: false }] }
) {
  let q = supabase.from(view).select('*', { count: 'exact' });
  if (scope) q = scope(q);
  for (const [col, val] of Object.entries(filters)) if (val && val !== 'all') q = q.eq(col, val);
  if (search.trim()) q = q.ilike('search_text', `%${likeTerm(search.trim())}%`);
  for (const o of order) q = q.order(o.column, { ascending: o.ascending ?? true });
  q = q.order('id');
  const from = (page - 1) * pageSize;
  const { data, error, count } = await q.range(from, from + pageSize - 1);
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

/** Exact row count of a view (tab badges). */
export async function countView(view, { scope } = {}) {
  let q = supabase.from(view).select('id', { count: 'exact', head: true });
  if (scope) q = scope(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Distinct non-empty values of one column across the WHOLE view (filter dropdown options). */
export async function distinctValues(view, column, { scope } = {}) {
  const { data: rows, error } = await fetchAllRows(() => {
    let q = supabase.from(view).select(column).not(column, 'is', null).order(column).order('id');
    if (scope) q = scope(q);
    return q;
  });
  if (error) throw error;
  return Array.from(new Set(rows.map((r) => r[column]).filter((v) => v !== '' && v != null))).sort();
}
