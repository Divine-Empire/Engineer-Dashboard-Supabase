import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, X } from "lucide-react";

const fmt = (d) => {
  const [y, m, day] = String(d || "").split("-");
  return y ? `${day}-${m}-${y}` : "";
};

// Searchable checkbox dropdown (multi-select). `options` = [{ id, label }], `value` = selected ids.
// `conflicts` = [{ equipment, ticket_id, travel_date, return_date }]: shown as warnings, never blocks selection.
export default function EquipmentSelect({ options = [], value = [], onChange, conflicts = [], disabled = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const q = search.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const labelOf = (id) => options.find((o) => o.id === id)?.label || id;
  const reservedBy = (id) => conflicts.filter((c) => c.equipment === id);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-white px-3 py-2 text-left text-sm disabled:opacity-60"
        data-testid="select-equipments"
      >
        <span className={value.length ? "" : "text-gray-400"}>
          {value.length ? `${value.length} selected` : "Select equipments"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or name..."
            className="mb-1 h-9 w-full rounded border border-gray-200 px-2 text-sm outline-none focus:border-blue-400"
          />
          <div className="max-h-60 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-gray-400">No equipment found</div>
            ) : (
              shown.map((o) => (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-blue-50">
                  <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
                  <span className="truncate">{o.label}</span>
                  {reservedBy(o.id).length > 0 && <AlertTriangle className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Already reserved" />}
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-900">
              <span className="truncate">{labelOf(id)}</span>
              {!disabled && (
                <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${id}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {conflicts.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="alert">
          {[...new Set(conflicts.map((c) => c.equipment))].filter((id) => value.includes(id)).map((id) => (
            <li key={id} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>{labelOf(id)}</strong> is already reserved for{" "}
                {reservedBy(id).map((c) => `ticket ${c.ticket_id} (${fmt(c.travel_date)} to ${fmt(c.return_date)})`).join(", ")}{" "}
                by another engineer.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
