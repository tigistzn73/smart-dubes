import React, { useRef } from 'react';
import { X, CheckCircle2, Download, Printer } from 'lucide-react';

export const ReceiptModal = ({ isOpen, onClose, receipt }) => {
  if (!isOpen || !receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="my-auto glass-panel w-full max-w-sm rounded-2xl border border-slate-700/60 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Actions Header - Hidden when printing */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 print:hidden shrink-0">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            Digital Receipt
          </h3>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800" title="Print Receipt">
              <Printer className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* flex-1 min-h-0: the panel is a capped flex column with overflow-hidden,
            so the body has to take the leftover height and be the thing that
            scrolls. Without this the panel clips the receipt instead. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 bg-slate-900/40 print:bg-white print:text-black" id="printable-receipt">
          
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-ethiopia-green via-ethiopia-yellow to-ethiopia-red p-0.5 mx-auto mb-3 shadow-lg flex items-center justify-center print:hidden">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center text-xl">
                🇪🇹
              </div>
            </div>
            <h2 className="text-xl font-extrabold text-emerald-400 tracking-tight print:text-black">Smart Dube</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold print:text-gray-500">Official Payment Receipt</p>
          </div>

          <div className="flex justify-center">
            <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 print:border-black print:text-black print:bg-transparent">
              <CheckCircle2 className="w-3.5 h-3.5" />
              PAYMENT SUCCESSFUL
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1 pb-4 border-b border-slate-800 border-dashed print:border-gray-300">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider print:text-gray-500">Receipt No.</p>
              <p className="text-sm font-mono font-bold text-slate-200 print:text-black">{receipt.repayment_ref || receipt.repaymentRef}</p>
            </div>

            <div className="space-y-1 pb-4 border-b border-slate-800 border-dashed print:border-gray-300">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider print:text-gray-500">Merchant</p>
              <p className="text-sm font-bold text-slate-200 print:text-black">{receipt.store_name || receipt.storeName || 'Merchant'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-800 border-dashed print:border-gray-300">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider print:text-gray-500">Date Paid</p>
                <p className="text-xs font-mono text-slate-300 print:text-black">
                  {receipt.created_at ? new Date(receipt.created_at).toLocaleDateString() : new Date().toLocaleDateString()}
                </p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider print:text-gray-500">Gateway</p>
                <p className="text-xs font-bold text-slate-300 print:text-black">{receipt.payment_gateway || receipt.gateway}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-800 border-dashed print:border-gray-300">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider print:text-gray-500">Reference</p>
                <p className="text-xs font-mono text-yellow-400 print:text-black">{receipt.reference_code || receipt.refCode || 'N/A'}</p>
              </div>
            </div>

            {/* If there's an uploaded receipt image attached */}
            {receipt.receipt_url && (
              <div className="space-y-2 pb-4 border-b border-slate-800 border-dashed print:border-gray-300">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider print:text-gray-500">Attached Proof of Payment</p>
                <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-900 flex justify-center">
                  <img src={receipt.receipt_url} alt="Proof of Payment" className="max-w-full h-auto max-h-40 object-contain" />
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-between items-end">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold print:text-gray-500">Amount Paid</p>
              <p className="text-2xl font-extrabold text-sky-400 print:text-black">{receipt.amount.toFixed(2)} ETB</p>
            </div>

          </div>
          
          <div className="pt-6 text-center text-[9px] text-slate-500 font-mono print:text-gray-400">
            Powered by Smart Dube Digital Ledger
          </div>
        </div>

      </div>
    </div>
  );
};
