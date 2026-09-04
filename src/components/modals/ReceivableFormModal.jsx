import React, { useState } from 'react';
import toast from 'react-hot-toast';
import ModalWrapper from '../ModalWrapper';
import { salesService } from '../../services/sales.service';

export default function ReceivableFormModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    customerName: "",
    phone: "",
    invoiceDate: "",
    invoiceNo: "",
    billCopy: "",
    actionType: "follow_up",

    note: "",
    nextCallingDate: "",

    amount: "",
    paymentMode: "online",
    proof: "",
    remarks: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validations
    if (!formData.customerName.trim()) { toast.error("Customer Name is required"); return; }
    if (formData.phone.length !== 10) { toast.error("Phone No must be 10 digits"); return; }
    if (!formData.invoiceDate) { toast.error("Invoice Date is required"); return; }
    if (!formData.invoiceNo.trim()) { toast.error("Invoice No is required"); return; }

    if (formData.actionType === "follow_up") {
      if (!formData.note.trim()) { toast.error("Follow-up note is required"); return; }
      if (!formData.nextCallingDate) { toast.error("Next calling date is required"); return; }
      
      // Prevent past dates
      const today = new Date().toISOString().split('T')[0];
      if (formData.nextCallingDate < today) { toast.error("Next calling date cannot be in the past"); return; }
    } else if (formData.actionType === "payment") {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) { toast.error("Amount must be greater than 0"); return; }
      if (!formData.paymentMode) { toast.error("Payment Mode is required"); return; }
    }

    setSubmitting(true);
    try {
      const payload = {
        type: formData.actionType,
        customerName: formData.customerName.trim(),
        phone: formData.phone.trim(),
        invoiceDate: formData.invoiceDate,
        invoiceNo: formData.invoiceNo.trim(),
        billCopy: formData.billCopy,
        createdAt: new Date().toISOString().split('T')[0]
      };

      if (formData.actionType === "follow_up") {
        payload.note = formData.note.trim();
        payload.nextCallingDate = formData.nextCallingDate;
      } else if (formData.actionType === "payment") {
        payload.amount = formData.amount;
        payload.paymentMode = formData.paymentMode;
        payload.proof = formData.proof;
        payload.remarks = formData.remarks.trim();
      }

      salesService.addUnifiedEntry(payload);
      toast.success("Entry added successfully");
      window.dispatchEvent(new Event('refresh_sales'));
      
      // Reset form
      setFormData({
        customerName: "", phone: "", invoiceDate: "", invoiceNo: "", billCopy: "", actionType: "follow_up",
        note: "", nextCallingDate: "", amount: "", paymentMode: "online", proof: "", remarks: "",
      });
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error saving entry");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "block w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all";
  const labelCls = "text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block";

  const renderConditionalFields = () => {
    switch (formData.actionType) {
      case 'follow_up':
        return (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>What did customer say</label>
              <textarea 
                name="note" 
                value={formData.note} 
                onChange={handleChange} 
                required 
                placeholder="Customer asked for 5 more days..." 
                rows={3}
                className={`${inputCls} resize-none`} 
              />
            </div>
            <div>
              <label className={labelCls}>Next Calling Date</label>
              <input 
                type="date" 
                name="nextCallingDate" 
                value={formData.nextCallingDate} 
                onChange={handleChange} 
                required 
                min={new Date().toISOString().split('T')[0]}
                className={`${inputCls} cursor-pointer`} 
              />
            </div>
          </div>
        );
      case 'payment':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input 
                    type="number" 
                    name="amount" 
                    value={formData.amount} 
                    onChange={handleChange} 
                    required 
                    min={0.01}
                    step="any"
                    className={`${inputCls} pl-8 font-bold`} 
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Payment Mode</label>
                <select 
                  name="paymentMode" 
                  value={formData.paymentMode} 
                  onChange={handleChange} 
                  className={`${inputCls} cursor-pointer`}
                >
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Proof URL (Optional)</label>
              <input 
                type="text" 
                name="proof" 
                value={formData.proof} 
                onChange={handleChange} 
                placeholder="e.g. /receipt.jpg"
                className={inputCls} 
              />
              <p className="text-[10px] text-slate-400 mt-1">Accepts .pdf, .jpg, .png, .jpeg</p>
            </div>
            <div>
              <label className={labelCls}>Remarks</label>
              <textarea 
                name="remarks" 
                value={formData.remarks} 
                onChange={handleChange} 
                placeholder="Payment received through NEFT"
                rows={2}
                className={`${inputCls} resize-none`} 
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Add Follow Up Entry" maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1 - Common Invoice Details */}
        <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl space-y-4">
          <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Common Invoice Details</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Customer Name</label>
              <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} required placeholder="Enter customer name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone No.</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required pattern="\d{10}" maxLength={10} placeholder="10-digit mobile number" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Invoice Date</label>
              <input type="date" name="invoiceDate" value={formData.invoiceDate} onChange={handleChange} required className={`${inputCls} cursor-pointer`} />
            </div>
            <div>
              <label className={labelCls}>Invoice No.</label>
              <input type="text" name="invoiceNo" value={formData.invoiceNo} onChange={handleChange} required placeholder="e.g. INV-001" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Bill Copy URL (Optional)</label>
              <input type="text" name="billCopy" value={formData.billCopy} onChange={handleChange} placeholder="Link to invoice PDF" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Action Type Selector */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm space-y-5">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800">Action Details</h4>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Action Type:</label>
              <select 
                name="actionType" 
                value={formData.actionType} 
                onChange={handleChange} 
                className="text-sm font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="follow_up">Follow-up</option>
                <option value="payment">Received</option>
              </select>
            </div>
          </div>
          
          {/* SECTION 2 - Conditional Fields */}
          {renderConditionalFields()}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="px-5 py-2.5 text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70 rounded-xl transition-colors shadow-sm">
            {submitting ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}
