import React from 'react';

// Stat tile. `tone` picks the accent (same semantic tokens as StatusBadge):
// info (default) | success | warning | neutral. The number and label always carry the
// meaning; the colour is only an accent.
const TONES = {
  info: 'border-l-info text-info',
  success: 'border-l-success text-success',
  warning: 'border-l-warning text-warning-foreground',
  neutral: 'border-l-muted-foreground text-muted-foreground',
};

export default function MetricCard({ title, value, icon: Icon, description, tone = 'info' }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div className={`rounded-lg border border-l-4 bg-card p-4 shadow-sm ${t.split(' ')[0]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        </div>
        {Icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary ${t.split(' ')[1]}`}>
            <Icon size={20} aria-hidden="true" />
          </div>
        )}
      </div>
      {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
