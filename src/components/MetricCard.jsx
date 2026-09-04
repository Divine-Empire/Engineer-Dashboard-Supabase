import React from 'react';

export default function MetricCard({ title, value, icon: Icon, description, trend, trendType, gradient }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 p-5 bg-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group cursor-default">
      {/* Gradient top bar */}
      <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${gradient || 'from-indigo-500 to-sky-500'}`} />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1 tracking-tight">
            {value}
          </h3>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl text-indigo-600 group-hover:scale-110 transition-transform border border-slate-100">
          {Icon && <Icon size={22} />}
        </div>
      </div>

      {(description || trend) && (
        <div className="flex items-center gap-1.5 mt-3 text-xs">
          {trend && (
            <span className={`font-bold ${trendType === 'up' ? 'text-emerald-600' : trendType === 'down' ? 'text-rose-600' : 'text-slate-500'}`}>
              {trend}
            </span>
          )}
          {description && <span className="text-slate-400">{description}</span>}
        </div>
      )}
    </div>
  );
}
