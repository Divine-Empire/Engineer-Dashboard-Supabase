import React from 'react';
import { X } from 'lucide-react';

export default function ModalWrapper({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div className={`relative bg-white rounded-2xl shadow-xl w-full ${maxWidth} overflow-hidden border border-slate-200 z-10`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[75vh]">
          {children}
        </div>
      </div>
    </div>
  );
}
