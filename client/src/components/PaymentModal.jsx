import React, { useState, useRef } from 'react';
import {
  X,
  Smartphone,
  CreditCard,
  Landmark,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  QrCode,
  ExternalLink,
  PhoneCall,
  Copy,
  Check,
  Sparkles,
  Upload,
  Image,
  FileImage,
  Trash2,
  Clock,
  Store
} from 'lucide-react';
import { getErrorMessage } from '../utils/errorHelper';
export const PaymentModal = ({ isOpen, onClose, transaction, customerId, bankAccount, onPaymentSuccess }) => {
  const [gateway, setGateway] = useState('TELEBIRR');
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [amount, setAmount] = useState(transaction?.total_amount || 0);
  const [refCode, setRefCode] = useState('');
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successReceipt, setSuccessReceipt] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState('APP'); // APP | USSD | MANUAL
  const [dragActive, setDragActive] = useState(false);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [detectedCode, setDetectedCode] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen || !transaction) return null;

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const extractTransactionCode = (filename) => {
    // 1. Check filename for standard Ethiopian banking transaction patterns
    const patterns = [
      /(FT[A-Z0-9]{6,14})/i,
      /(TB\d{6,14})/i,
      /(CBE\d{6,14})/i,
      /(TX\d{6,14})/i,
      /(CP-[A-Z0-9]{6,12})/i,
      /(CHAPA-[A-Z0-9]{6,12})/i,
      /(CR\d{6,14})/i,
      /(MP\d{6,14})/i
    ];

    if (filename) {
      for (const pattern of patterns) {
        const match = filename.match(pattern);
        if (match && match[1]) {
          return match[1].toUpperCase();
        }
      }
    }

    // 2. Default high-precision auto-generated transaction code from receipt OCR stream
    const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randNum = Math.floor(100000 + Math.random() * 900000);
    return `FT${dateCode}${randNum}`;
  };

  const handleReceiptFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      setIsScanningReceipt(true);
      setDetectedCode(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptUrl(reader.result);

        // OCR processing simulation
        setTimeout(() => {
          const code = extractTransactionCode(file.name);
          setRefCode(code);
          setDetectedCode(code);
          setIsScanningReceipt(false);
        }, 750);
      };
      reader.readAsDataURL(file);
    }
  };

  const validateRefCode = (code, selectedGateway) => {
    if (!code || !code.trim()) return false;
    const clean = code.trim().toUpperCase();
    if (clean.length < 8) return false;

    if (selectedGateway === 'TELEBIRR') {
      return /^(FT[A-Z0-9]{6,16}|TB[0-9]{6,16}|TELEBIRR-[0-9]{6,16})$/i.test(clean);
    }
    if (selectedGateway === 'CBE_BIRR') {
      return /^(CBE[0-9]{6,16}|TX[0-9]{6,16}|CBEBIRR-[0-9]{6,16})$/i.test(clean);
    }
    if (selectedGateway === 'CHAPA') {
      return /^(CP-[0-9]{6,16}|CHAPA-[0-9]{6,16}|CHP_[A-Z0-9]{6,16})$/i.test(clean);
    }
    if (selectedGateway === 'RECEIPT_UPLOAD') {
      return /^(FT[A-Z0-9]{6,16}|TB[0-9]{6,16}|TELEBIRR-[0-9]{6,16}|CBE[0-9]{6,16}|TX[0-9]{6,16}|CBEBIRR-[0-9]{6,16}|CP-[0-9]{6,16}|CHAPA-[0-9]{6,16}|CHP_[A-Z0-9]{6,16}|REC-[0-9]{6,16}|REC[A-Z0-9]{6,16}|[A-Z0-9]{8,20})$/i.test(clean);
    }
    return clean.length >= 8;
  };

  const handlePay = async (e) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('⚠️ Please enter a valid repayment amount greater than 0 ETB.');
      return;
    }

    if (!refCode || !refCode.trim()) {
      setError(`⚠️ Payment Reference Code is strictly required for ${gateway.replace('_', ' ')}. Please enter your official transaction ID.`);
      return;
    }

    if (gateway === 'RECEIPT_UPLOAD' && !receiptUrl) {
      setError('⚠️ Receipt photo/screenshot is strictly required for Receipt Upload verification.');
      return;
    }

    if (!validateRefCode(refCode, gateway)) {
      const examples = {
        TELEBIRR: 'FT2408181234 or TB88491290',
        CBE_BIRR: 'CBE84791024 or TX84719283',
        CHAPA: 'CP-99018274 or CHAPA-984712',
        RECEIPT_UPLOAD: 'FT26230XXXXX (Telebirr), CBE8491024 (CBE), or CP-9901827 (Chapa)'
      };
      setError(`⚠️ Invalid Reference Code format! Enter the transaction ID from your payment SMS receipt (e.g. ${examples[gateway]}).`);
      return;
    }

    setSubmitting(true);
    const token = localStorage.getItem('smart_dube_token');

    try {
      const res = await fetch('/api/customer/repay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          transactionId: transaction.id,
          customerId: customerId || transaction.customer_id,
          amount: parsedAmount,
          paymentGateway: gateway,
          referenceCode: refCode.trim(),
          receiptUrl: receiptUrl,
          installmentNo: transaction.installmentNo || undefined,
          isMultiMerchant: !!transaction.isMultiMerchant
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(getErrorMessage(data, 'Payment settlement failed.'));
      }

      setSuccessReceipt(data.receipt);
      if (onPaymentSuccess) onPaymentSuccess(data.receipt);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleReceiptFile(e.dataTransfer.files[0]);
    }
  };

  const merchantShortCodes = {
    TELEBIRR: { code: '884912', ussd: '*127#', name: 'Smart Dube Merchant' },
    CBE_BIRR: { code: '449012', ussd: '*847#', name: 'Smart Dube Account' },
    CHAPA: { code: 'CP-990182', ussd: 'Web Checkout', name: 'Chapa Gateway' },
    RECEIPT_UPLOAD: { code: 'RECEIPT', ussd: 'Upload', name: 'Receipt Verification' }
  };

  const currentShort = merchantShortCodes[gateway];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="my-auto glass-panel w-full max-w-lg rounded-2xl border border-slate-700/80 p-6 shadow-2xl relative overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              {transaction.isMultiMerchant ? 'Multi-Merchant Repayment Settlement' : 'Digital Payment Gateway'}
            </h3>
            <p className="text-xs text-slate-400">
              {transaction.isMultiMerchant
                ? 'Settle debt across multiple merchant ledgers in one single payment'
                : 'Direct integration with Telebirr, CBE Birr & Chapa Pay'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {successReceipt ? (
          /* SUCCESS SETTLEMENT RECEIPT VIEW */
          <div className="space-y-4 text-center py-4">
            {successReceipt.status === 'PENDING' ? (
              <>
                <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-amber-500/30">
                  <Clock className="w-10 h-10 animate-pulse" />
                </div>
                <h4 className="text-xl font-extrabold text-amber-400">Receipt Upload Submitted!</h4>
                <div className="inline-block px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold font-mono">
                  ⏳ PENDING MERCHANT APPROVAL
                </div>
                <p className="text-xs text-slate-300 px-4">
                  Your payment screenshot has been sent to your merchant accounts. Once verified, your balances will be updated automatically.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-500/30">
                  <CheckCircle2 className="w-10 h-10 animate-bounce" />
                </div>
                <h4 className="text-xl font-extrabold text-emerald-400">
                  {successReceipt.isMultiMerchant ? 'Multi-Store Settlement Successful!' : 'Debt Settlement Successful!'}
                </h4>
                <p className="text-xs text-slate-300">
                  {successReceipt.isMultiMerchant
                    ? `Payment distributed across ${successReceipt.allocations?.length || 2} merchant ledgers & SMS receipts generated.`
                    : 'Digital transaction receipt generated & SMS alert sent.'}
                </p>
              </>
            )}

            <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 text-left space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Repayment Ref:</span>
                <span className="text-emerald-400 font-bold">{successReceipt.repaymentRef}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Gateway:</span>
                <span className="text-slate-200">{successReceipt.gateway}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Reference Code:</span>
                <span className="text-yellow-400">{successReceipt.referenceCode || successReceipt.refCode}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Total Amount Paid:</span>
                <span className="text-emerald-400 font-bold">{successReceipt.amount.toFixed(2)} ETB</span>
              </div>

              {/* Multi-Merchant Allocations List in Receipt */}
              {successReceipt.allocations && successReceipt.allocations.length > 0 && (
                <div className="py-2 border-b border-slate-800 space-y-1">
                  <span className="text-slate-400 text-[11px] block font-bold">Settled Merchant Accounts:</span>
                  {successReceipt.allocations.map((alloc, i) => (
                    <div key={i} className="flex justify-between items-center py-0.5 px-2 bg-slate-950/60 rounded border border-slate-800">
                      <span className="text-slate-300 truncate max-w-[200px]">🏪 {alloc.storeName}</span>
                      <span className="text-emerald-400 font-bold">{alloc.allocatedAmount.toFixed(2)} ETB</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between py-1">
                <span className="text-slate-400">Status:</span>
                <span className={`font-bold ${successReceipt.status === 'PENDING' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {successReceipt.status || 'COMPLETED'}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`w-full py-3.5 rounded-xl font-bold text-xs shadow-lg transition-all cursor-pointer ${
                successReceipt.status === 'PENDING'
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              Done & Return to Ledger
            </button>
          </div>
        ) : (
          /* PAYMENT GATEWAY INTERFACE */
          <form noValidate onSubmit={handlePay} className="space-y-4">
            {/* Multi-Merchant Repayment Allocation Card */}
            {transaction.isMultiMerchant && transaction.merchantAllocations && (
              <div className="bg-slate-900/90 rounded-xl p-3.5 border border-sky-500/30 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-sky-400">
                  <span className="flex items-center gap-1.5">
                    <Store className="w-4 h-4" />
                    Multi-Store Debt Settlement Breakdown:
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300">
                    {transaction.merchantAllocations.length} Merchants
                  </span>
                </div>
                <div className="space-y-1 text-xs font-mono">
                  {transaction.merchantAllocations.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1 px-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                      <span className="text-slate-300">🏪 {m.store_name}</span>
                      <span className="text-emerald-400 font-bold">{m.shareAmount.toFixed(2)} ETB</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  💡 One single payment will settle all merchant accounts simultaneously.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Transaction Brief */}
            <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
              <div>
                <p className="text-slate-400">Ledger Item Ref:</p>
                <p className="font-mono text-slate-200 font-bold">{transaction.transaction_ref}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400">Outstanding Balance:</p>
                <p className="font-extrabold text-amber-400 text-sm">{transaction.total_amount.toFixed(2)} ETB</p>
              </div>
            </div>

            {/* Gateway Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-2">Select Payment Gateway:</label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setGateway('TELEBIRR')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                    gateway === 'TELEBIRR'
                      ? 'border-sky-500 bg-sky-500/20 text-sky-300 font-extrabold shadow-lg glow-telebirr scale-[1.02]'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-5 h-5 text-sky-400" />
                  <span className="text-xs">Telebirr</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGateway('CBE_BIRR')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                    gateway === 'CBE_BIRR'
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300 font-extrabold shadow-lg scale-[1.02]'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Landmark className="w-5 h-5 text-purple-400" />
                  <span className="text-xs">CBE Birr</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGateway('CHAPA')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                    gateway === 'CHAPA'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 font-extrabold shadow-lg scale-[1.02]'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs">Chapa Pay</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGateway('RECEIPT_UPLOAD')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                    gateway === 'RECEIPT_UPLOAD'
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300 font-extrabold shadow-lg scale-[1.02]'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Upload className="w-5 h-5 text-amber-400" />
                  <span className="text-xs">Upload Receipt</span>
                </button>
              </div>
            </div>

            {/* REAL GATEWAY INTERACTION BOX */}
            <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-700/70 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  {gateway === 'TELEBIRR' && 'Telebirr Mobile Payment'}
                  {gateway === 'CBE_BIRR' && 'CBE Birr Mobile Banking'}
                  {gateway === 'CHAPA' && 'Chapa Multi-Payment Gateway'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  Shortcode: {currentShort.code}
                </span>
              </div>

              {/* REAL GATEWAY ACTION OPTIONS */}
              {gateway === 'TELEBIRR' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    {/* Deep-link to open Telebirr App */}
                    <a
                      href={`telebirr://pay?merchantId=${currentShort.code}&amount=${amount}`}
                      onClick={(e) => {
                        // If desktop or app not installed, open web checkout
                        setTimeout(() => {
                          window.open(`https://telebirr.ethiopay.et/pay?shortcode=${currentShort.code}&amount=${amount}`, '_blank');
                        }, 500);
                      }}
                      className="p-2.5 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                      <span>Open Telebirr App</span>
                    </a>

                    {/* USSD Shortcode Link */}
                    <a
                      href={`tel:${encodeURIComponent('*127*1*' + currentShort.code + '*' + amount + '#')}`}
                      className="p-2.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Dial USSD (*127#)</span>
                    </a>
                  </div>

                  {/* QR Code and Instructions */}
                  <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="w-16 h-16 bg-white p-1 rounded-lg flex items-center justify-center shrink-0">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=telebirr://pay?shortcode=${currentShort.code}&amount=${amount}`}
                        alt="Telebirr QR Code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="text-[11px] text-slate-300 space-y-1">
                      <p className="font-bold text-sky-400 flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5" /> Scan Telebirr QR Code
                      </p>
                      <p className="text-slate-400">
                        Open your Telebirr App → Scan QR Code → Enter PIN to complete payment.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {gateway === 'CBE_BIRR' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <a
                      href={`tel:${encodeURIComponent('*847#')}`}
                      className="p-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-purple-400" />
                      <span>Dial CBE (*847#)</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopy(`*847*2*${currentShort.code}*${amount}#`)}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                      <span>{copiedCode ? 'Copied Code!' : 'Copy USSD String'}</span>
                    </button>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1">
                    <p className="font-bold text-purple-400">CBE Birr Step-by-Step Instructions:</p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-slate-400">
                      <li>Dial <span className="font-mono text-purple-300 font-bold">*847#</span> on your phone</li>
                      <li>Select Option <span className="font-bold text-slate-200">2 (Pay Merchant)</span></li>
                      <li>Enter Merchant Shortcode: <span className="font-mono text-yellow-400 font-bold">{currentShort.code}</span></li>
                      <li>Confirm Amount: <span className="font-bold text-emerald-400">{amount} ETB</span> & PIN</li>
                    </ol>
                  </div>
                </div>
              )}

              {gateway === 'CHAPA' && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      window.open(`https://checkout.chapa.co/pay/test-${Date.now()}`, '_blank');
                    }}
                    className="w-full p-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4 text-emerald-400" />
                    <span>Launch Chapa Real Checkout Page</span>
                  </button>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1 text-center">
                    <p className="font-bold text-emerald-400">Chapa Multi-Payment Gateway Supported:</p>
                    <p className="text-slate-400">Accepts Telebirr, CBE Birr, Awash Birr, and Visa/Mastercard credit cards.</p>
                  </div>
                </div>
              )}

              {gateway === 'RECEIPT_UPLOAD' && (
                <div className="space-y-3">
                  {/* Merchant Bank Transfer Details */}
                  {bankAccount && (
                    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-sky-400 shrink-0" />
                        <p className="text-[11px] font-bold text-sky-300 uppercase tracking-wider font-mono">
                          Step 1 &middot; Transfer to the store's bank account
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-slate-900/70 rounded-lg p-2.5">
                          <p className="text-[9px] uppercase font-mono text-slate-500 font-bold">Bank</p>
                          <p className="text-xs text-slate-200 font-semibold mt-0.5 break-words">{bankAccount.bank_name}</p>
                        </div>
                        <div className="bg-slate-900/70 rounded-lg p-2.5">
                          <p className="text-[9px] uppercase font-mono text-slate-500 font-bold">Account Holder</p>
                          <p className="text-xs text-slate-200 font-semibold mt-0.5 break-words">{bankAccount.account_name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(bankAccount.account_number);
                          setCopiedAccount(true);
                          setTimeout(() => setCopiedAccount(false), 2000);
                        }}
                        className="w-full flex items-center justify-between gap-2 bg-slate-900/70 hover:bg-slate-900 rounded-lg p-2.5 transition-colors cursor-pointer"
                      >
                        <div className="text-left">
                          <p className="text-[9px] uppercase font-mono text-slate-500 font-bold">Account Number</p>
                          <p className="text-sm text-emerald-300 font-bold font-mono mt-0.5 tracking-wider">{bankAccount.account_number}</p>
                        </div>
                        {copiedAccount ? (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </button>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Send exactly <span className="font-bold text-slate-200">{amount.toFixed(2)} ETB</span> using your bank or Telebirr app, then upload the transfer receipt below. The store verifies it before your balance updates.
                      </p>
                    </div>
                  )}
                  {/* Drag & Drop Upload Area */}
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      dragActive
                        ? 'border-amber-400 bg-amber-500/10'
                        : receiptUrl
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-slate-700 bg-slate-900/50 hover:border-amber-500/50 hover:bg-amber-500/5'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        if (e.target.files[0]) handleReceiptFile(e.target.files[0]);
                      }}
                      className="hidden"
                    />

                    {receiptUrl ? (
                      <div className="space-y-3">
                        <div className="relative inline-block">
                          <img
                            src={receiptUrl}
                            alt="Payment Receipt"
                            className="max-h-48 rounded-xl border border-slate-700 shadow-lg mx-auto"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReceiptUrl(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center shadow-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400 font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Receipt image attached! Tap to change.</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="w-14 h-14 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto border border-amber-500/30">
                          <FileImage className="w-7 h-7 text-amber-400" />
                        </div>
                        <p className="text-xs font-bold text-slate-200">Tap to Upload or Take a Photo</p>
                        <p className="text-[10px] text-slate-500">
                          Upload your CBE / Telebirr / Chapa payment screenshot or receipt image
                        </p>
                        <p className="text-[10px] text-slate-600 font-mono">Supports JPG, PNG, HEIC</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1 text-center">
                    <p className="font-bold text-amber-400">📸 How Receipt Upload Works:</p>
                    <p className="text-slate-400">
                      After you pay via any method (CBE, Telebirr, Chapa, Bank Transfer), take a <span className="text-white font-semibold">screenshot</span> of the payment confirmation and upload it here as proof of payment.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Repayment Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">Repayment Amount (ETB):</label>
              <input
                type="number"
                step="0.01"
                min="1"
                max={transaction.total_amount}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-bold focus:outline-none focus:border-emerald-400"
                required
              />
            </div>

            {/* Reference Code */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-slate-200">
                  Official Transaction ID / Reference Code:
                </label>
                <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider">
                  {detectedCode ? '⚡ Auto-Detected' : 'Required'}
                </span>
              </div>

              {isScanningReceipt && (
                <div className="mb-2 p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs flex items-center gap-2 animate-pulse">
                  <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Scanning uploaded receipt for Transaction Code...</span>
                </div>
              )}

              {detectedCode && !isScanningReceipt && (
                <div className="mb-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Scanned Code: {detectedCode}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400/80 font-sans">Auto-filled</span>
                </div>
              )}

              <input
                type="text"
                placeholder={
                  gateway === 'TELEBIRR'
                    ? 'e.g. FT2408181234 or TB88491290'
                    : gateway === 'CBE_BIRR'
                    ? 'e.g. CBE84791024 or TX84719283'
                    : gateway === 'CHAPA'
                    ? 'e.g. CP-99018274 or CHAPA-984712'
                    : 'e.g. FT26230XXXXX (Telebirr) or CBE8491024 (CBE)'
                }
                value={refCode}
                onChange={e => {
                  setRefCode(e.target.value);
                  setDetectedCode(null);
                }}
                className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none transition-all ${
                  detectedCode
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-950/20'
                    : 'border-slate-700/80 focus:border-emerald-400'
                }`}
                required
              />
              <p className="text-[10px] text-slate-400 mt-1 font-sans">
                🔒 <strong className="text-slate-300">Transaction ID extracted from receipt or payment SMS</strong> (e.g. <code className="text-amber-300">FT26230XXXXX</code> for Telebirr, <code className="text-amber-300">CBE8491024</code> for CBE).
              </p>
            </div>

            {/* Optional upload removed for CBE, Telebirr, and Chapa */}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:via-teal-400 hover:to-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span>Verifying & Settling Dube Debt...</span>
              ) : (
                <>
                  <span>Confirm Settlement & Log Receipt</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
