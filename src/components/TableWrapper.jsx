import React from 'react';

export default function TableWrapper({ headers, data, renderRow, renderCard, loading, emptyMessage }) {
  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
      {/* Desktop/Tablet view */}
      <div className={renderCard ? "hidden sm:block overflow-auto flex-1" : "overflow-auto flex-1"}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200">
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, rIdx) => (
                <tr key={rIdx} className="animate-pulse">
                  {headers.map((_, hIdx) => (
                    <td key={hIdx} className="px-5 py-4">
                      <div className="h-4 bg-slate-100 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data && data.length > 0 ? (
              data.map((item, idx) => renderRow(item, idx))
            ) : (
              <tr>
                <td colSpan={headers.length} className="px-5 py-14 text-center">
                  <div className="text-slate-400 font-medium text-sm">
                    {emptyMessage || 'No records found'}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card view */}
      {renderCard && (
        <div className="sm:hidden block overflow-auto flex-1 p-4 space-y-4 max-h-[calc(100dvh-340px)] pb-12">
          {loading ? (
            Array.from({ length: 4 }).map((_, rIdx) => (
              <div key={rIdx} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-1/3" />
                <div className="h-4 bg-slate-100 rounded w-2/3" />
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))
          ) : data && data.length > 0 ? (
            data.map((item, idx) => renderCard(item, idx))
          ) : (
            <div className="text-center py-14">
              <div className="text-slate-400 font-medium text-sm">
                {emptyMessage || 'No records found'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
