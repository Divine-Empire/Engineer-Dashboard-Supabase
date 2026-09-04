export default function statusColor(status) {
  const mapping = {
    // Payment statuses
    pending:          'bg-rose-50 text-rose-700 border-rose-200',
    partial:          'bg-amber-50 text-amber-700 border-amber-200',
    received:         'bg-emerald-50 text-emerald-700 border-emerald-200',

    // Compare statuses
    matched:          'bg-emerald-50 text-emerald-700 border-emerald-200',
    unmatched:        'bg-rose-50 text-rose-700 border-rose-200',
    missing_in_tally: 'bg-blue-50 text-blue-700 border-blue-200',
    missing_in_sales: 'bg-purple-50 text-purple-700 border-purple-200',

    // Campaign statuses
    active:  'bg-teal-50 text-teal-700 border-teal-200',
    sent:    'bg-emerald-50 text-emerald-700 border-emerald-200',
    paused:  'bg-amber-50 text-amber-700 border-amber-200',
    draft:   'bg-slate-100 text-slate-600 border-slate-200',
  };

  return mapping[String(status).toLowerCase()] || 'bg-slate-100 text-slate-600 border-slate-200';
}
