import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueries, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchViewPage, countView, distinctValues } from '../lib/pagedView';

// One hook per Pending / History list page (same role as OTP_Supabase's useStageList).
// It owns the UI state — tab, search, filters, page, page size, visible columns — and
// turns it into one server request per change. Nothing is fetched client-side in bulk.
//
//   const list = useStageList({
//     key: 'repair-status',
//     views: { pending: 'engg_v_repair_status_pending', history: 'engg_v_repair_status_history' },
//     scope,                                  // from scopeBy(); null for admins
//     filters: [{ key: 'category', column: 'category', allLabel: 'All Categories' }],
//     columns: [{ key: 'ticketId', label: 'Ticket ID', defaultVisible: true }],
//     order: { pending: [...], history: [...] },   // optional, see fetchViewPage
//   })
//
// - Search is debounced (350 ms); changing search / filter / tab resets to page 1.
// - Stale responses are dropped and the previous page stays on screen while the next loads.
// - Tab counts are exact view counts (cheap HEAD requests), so both badges are always right.
// - Filter dropdown options come from the whole view, not the loaded page.
export const PAGE_SIZES = [10, 20, 50, 100];

export function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function loadColumns(storageKey, columns) {
  const defaults = Object.fromEntries(columns.map((c) => [c.key, c.defaultVisible !== false]));
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object') {
      return Object.fromEntries(columns.map((c) => [c.key, c.key in saved ? !!saved[c.key] : defaults[c.key]]));
    }
  } catch {
    /* ignore corrupt saved value */
  }
  return defaults;
}

export function useStageList({
  key,
  views,
  scope = null,
  scopeKey = '',
  filters: filterSpec = [],
  columns = [],
  order,
  defaultPageSize = 20,
  initialTab = 'pending',
}) {
  const queryClient = useQueryClient();
  const [tab, setTabState] = useState(initialTab);
  const [search, setSearchState] = useState('');
  const [filterValues, setFilterValues] = useState(() => Object.fromEntries(filterSpec.map((f) => [f.key, 'all'])));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const debouncedSearch = useDebounced(search, 350);

  const resetPage = () => setPage(1);
  const setTab = (t) => { setTabState(t); resetPage(); };
  const setSearch = (v) => { setSearchState(v); resetPage(); };
  const setFilter = (k, v) => { setFilterValues((p) => ({ ...p, [k]: v })); resetPage(); };
  const setPageSize = (n) => { setPageSizeState(n); resetPage(); };
  const clearAll = () => {
    setSearchState('');
    setFilterValues(Object.fromEntries(filterSpec.map((f) => [f.key, 'all'])));
    resetPage();
  };

  // ── data ────────────────────────────────────────────────────────────────
  const dbFilters = useMemo(
    () => Object.fromEntries(filterSpec.map((f) => [f.column, filterValues[f.key]])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterValues]
  );
  const view = views[tab];
  const pageQuery = useQuery({
    queryKey: ['list', key, tab, scopeKey, page, pageSize, debouncedSearch, dbFilters],
    queryFn: () =>
      fetchViewPage(view, { page, pageSize, search: debouncedSearch, filters: dbFilters, scope, order: order?.[tab] }),
    placeholderData: keepPreviousData,
  });

  const [pendingCount, historyCount] = useQueries({
    queries: ['pending', 'history'].map((t) => ({
      queryKey: ['count', key, t, scopeKey],
      queryFn: () => countView(views[t], { scope }),
    })),
  });
  const facetQueries = useQueries({
    queries: filterSpec.map((f) => ({
      queryKey: ['facet', key, f.column, scopeKey],
      queryFn: async () => {
        const [h, p] = await Promise.all([
          distinctValues(views.history, f.column, { scope }),
          distinctValues(views.pending, f.column, { scope }),
        ]);
        return Array.from(new Set([...h, ...p])).sort();
      },
      staleTime: 5 * 60_000,
    })),
  });
  const filterOptions = Object.fromEntries(filterSpec.map((f, i) => [f.key, facetQueries[i].data || []]));

  // ── columns ─────────────────────────────────────────────────────────────
  const storageKey = `engg-columns:${key}`;
  const [visible, setVisible] = useState(() => loadColumns(storageKey, columns));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const persist = (next) => {
    setVisible(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const toggleColumn = (k) => persist({ ...visible, [k]: !visible[k] });
  const selectAllColumns = () => {
    const all = tabColumns.every((c) => visible[c.key]);
    persist({ ...visible, ...Object.fromEntries(tabColumns.map((c) => [c.key, !all])) });
  };
  useEffect(() => {
    if (!columnsOpen) return undefined;
    const close = (e) => { if (!e.target.closest('.dropdown-container')) setColumnsOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [columnsOpen]);
  // Columns may be limited to a tab (`tabs: ['history']`); the panel lists only this tab's.
  const tabColumns = columns.filter((c) => !c.tabs || c.tabs.includes(tab));
  const tabVisible = Object.fromEntries(tabColumns.map((c) => [c.key, visible[c.key]]));
  const activeColumns = tabColumns.filter((c) => visible[c.key]);

  // ── derived ─────────────────────────────────────────────────────────────
  const total = pageQuery.data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  // Keep the page in range if the data shrank underneath us (e.g. after a submit).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const chips = [
    ...(debouncedSearch ? [{ key: 'search', label: `Search: ${debouncedSearch}`, onRemove: () => setSearch('') }] : []),
    ...filterSpec
      .filter((f) => filterValues[f.key] && filterValues[f.key] !== 'all')
      .map((f) => ({ key: f.key, label: `${f.label}: ${filterValues[f.key]}`, onRemove: () => setFilter(f.key, 'all') })),
  ];

  const tabs = [
    { id: 'pending', label: 'Pending', count: pendingCount.data },
    { id: 'history', label: 'History', count: historyCount.data },
  ];

  // After a submit: refresh the page, both counts and the filter options.
  const reload = useCallback(
    () => queryClient.invalidateQueries({ predicate: (q) => ['list', 'count', 'facet'].includes(q.queryKey[0]) && q.queryKey[1] === key }),
    [queryClient, key]
  );

  return {
    tab, setTab, tabs,
    search, setSearch,
    filterValues, setFilter, filterOptions, chips, clearAll,
    page, setPage, pageSize, setPageSize, totalPages, total,
    rows: pageQuery.data?.rows ?? [],
    loading: pageQuery.isPending,
    fetching: pageQuery.isFetching,
    error: pageQuery.error ? pageQuery.error.message || 'Failed to load' : null,
    reload,
    columnPanel: {
      options: tabColumns, visible: tabVisible, onToggle: toggleColumn, onSelectAll: selectAllColumns,
      open: columnsOpen, onOpenChange: setColumnsOpen, idPrefix: `col-${key}`,
    },
    activeColumns,
  };
}
