import React from 'react';
import statusColor from '../utils/statusColor';

export default function StatusTag({ status }) {
  if (!status) return null;
  const formattedStatus = String(status).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${statusColor(status)}`}>
      {formattedStatus}
    </span>
  );
}
