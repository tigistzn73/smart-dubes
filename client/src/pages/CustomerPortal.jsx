import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { PaymentModal } from '../components/PaymentModal';
import { ReceiptModal } from '../components/ReceiptModal';
import {
  Wallet,
  CreditCard,
  Calendar,
  Store,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Receipt,
  X,
  Loader2,
  Bell,
  AlertCircle,
  Menu
} from 'lucide-react';
import { getErrorMessage } from '../utils/errorHelper';

export const CustomerPortal = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(null);
  const { lang } = useTheme();
  const t = (en, am) => (lang === 'EN' ? en : am);
  const [selectedTxForPayment, setSelectedTxForPayment] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Installment Scheduler State
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [frequency, setFrequency] = useState('WEEKLY');
  const [numInstallments, setNumInstallments] = useState(2);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [selectedScheduleMerchant, setSelectedScheduleMerchant] = useState('ALL');
  const [selectedMerchantFilter, setSelectedMerchantFilter] = useState('ALL');
  const [selectedScheduleTx, setSelectedScheduleTx] = useState(null); // receipt that opened the builder
  const [selectedTxIds, setSelectedTxIds] = useState([]); // multi-select for bulk scheduling
  const [scheduleError, setScheduleError] = useState('');
  const [applyingSchedule, setApplyingSchedule] = useState(false);

  // Alerts Popover Modal State
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [readAlertIds, setReadAlertIds] = useState([]);

  // Court letter issued by a merchant for an overdue Dube. null = reader closed.
  const [openCourtLetter, setOpenCourtLetter] = useState(null);
  // The letter modal defaults to the formal image and offers the plain text as
  // an alternative. Text-only mode is also the automatic fallback when the image
  // is unavailable or fails to load, so the notice is never blocked on an image.
  const [letterView, setLetterView] = useState('image');
  const [letterImageFailed, setLetterImageFailed] = useState(false);
  const [letterImageLoading, setLetterImageLoading] = useState(false);
  // Customer formally accepting the letter without paying, e.g. "I have read
  // the notice but cannot repay right now".
  const [acknowledgingLetterId, setAcknowledgingLetterId] = useState(null);
  const [ackLetterError, setAckLetterError] = useState('');

  const openLetter = (notice) => {
    setOpenCourtLetter(notice);
    setLetterView(notice?.image_available ? 'image' : 'text');
    setLetterImageFailed(false);
    setLetterImageLoading(false);
  };

  // Listen for mobile sidebar toggle and direct tab switch from Navbar
  useEffect(() => {
    const handleToggle = () => setMobileSidebarOpen(prev => !prev);
    const handleSwitch = (e) => {
      if (e.detail?.tab) setActiveTab(e.detail.tab);
    };
    window.addEventListener('toggle-mobile-sidebar', handleToggle);
    window.addEventListener('switch-tab', handleSwitch);
    return () => {
      window.removeEventListener('toggle-mobile-sidebar', handleToggle);
      window.removeEventListener('switch-tab', handleSwitch);
    };
  }, []);

  const token = localStorage.getItem('smart_dube_token');

  useEffect(() => {
    fetchCustomerDashboard();
  }, []);

  const fetchCustomerDashboard = async () => {
    setLoading(true);
    try {
      // Transient DB drops return a 500 body like { error: '...' }. Never let
      // that replace already-loaded data — it used to blank every list on the
      // page (receipts vanished right after scheduling). Retry once, then keep
      // the last good payload and surface a banner instead.
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await fetch('/api/customer/dashboard', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const resData = await res.json();
          if (resData?.error) throw new Error(resData.error);
          setData(resData);
          setDashboardError(null);
          return;
        } catch (err) {
          lastErr = err;
          if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 700));
        }
      }
      console.error('Customer dashboard error:', lastErr);
      setDashboardError(lastErr);
    } finally {
      setLoading(false);
    }
  };

  // Accept the court letter without paying. Accepting only records that the
  // notice was read; the debt stays outstanding, so the letter remains active.
  const handleAcknowledgeCourtLetter = async (notice) => {
    if (!notice || acknowledgingLetterId) return;
    setAcknowledgingLetterId(notice.id);
    setAckLetterError('');
    try {
      const res = await fetch('/api/customer/court-letter/acknowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ caseId: notice.id })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(payload, 'Failed to accept the court letter.'));
      // Reflect the acknowledgement locally without a full refetch, so the open
      // reader does not flash away behind a loading spinner.
      setData(prev => ({
        ...prev,
        notices: (prev?.notices || []).map(n => n.id === notice.id
          ? { ...n, is_acknowledged: true, acknowledged_at: payload.acknowledged_at, status: 'RESPONDED' }
          : n)
      }));
      setOpenCourtLetter(prev => prev
        ? { ...prev, is_acknowledged: true, acknowledged_at: payload.acknowledged_at, status: 'RESPONDED' }
        : prev);
    } catch (err) {
      setAckLetterError(getErrorMessage(err));
    } finally {
      setAcknowledgingLetterId(null);
    }
  };

  const handleGenerateSchedule = async () => {
    // Fall back to the store/overall balance only when no specific receipt is targeted
    const targetIds = scheduleTargetTxIds;
    const targetTxs = targetIds.length > 0
      ? transactions.filter(tx => targetIds.some(id => Number(id) === Number(tx.id)))
      : [];
    const singleTargetTx = targetTxs.length === 1 ? targetTxs[0] : null;

    let targetBalance = data?.summary?.totalBalance || 0;
    let merchantIdForSchedule = selectedScheduleMerchant !== 'ALL' ? Number(selectedScheduleMerchant) : null;
    if (targetTxs.length > 0) {
      targetBalance = targetTxs.reduce((sum, tx) => sum + (Number(tx.total_amount) || 0), 0);
      if (targetTxs.every(tx => String(tx.merchant_id) === String(targetTxs[0].merchant_id))) {
        merchantIdForSchedule = targetTxs[0].merchant_id;
      }
    } else if (selectedScheduleMerchant !== 'ALL') {
      const p = profiles.find(pr => String(pr.merchant_id) === String(selectedScheduleMerchant));
      if (p) targetBalance = p.current_balance;
    }
    if (!targetBalance || targetBalance <= 0) {
      setScheduleError(t('Target balance must be greater than 0 to generate a repayment schedule.', 'የክፍያ ሰሌዳ ለማዘጋጀት ቀሪው ዕዳ ከ0 በላይ መሆን አለበት።'));
      return;
    }
    setScheduleError('');
    try {
      const res = await fetch('/api/customer/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          totalAmount: targetBalance,
          frequency,
          numInstallments,
          merchantId: merchantIdForSchedule,
          ...(singleTargetTx ? { txId: singleTargetTx.id } : {}),
          ...(targetIds.length > 1 ? { txIds: targetIds } : {})
        })
      });
      const sData = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(sData, 'Failed to calculate schedule.'));
      setScheduleResult(sData);
    } catch (err) {
      setScheduleError(getErrorMessage(err));
    }
  };

  const handleApplySchedule = async () => {
    const targetIds = scheduleTargetTxIds;
    const targetTxs = targetIds.length > 0
      ? transactions.filter(tx => targetIds.some(id => Number(id) === Number(tx.id)))
      : [];
    const singleTargetTx = targetTxs.length === 1 ? targetTxs[0] : null;

    let targetBalance = data?.summary?.totalBalance || 0;
    let merchantIdForSchedule = selectedScheduleMerchant !== 'ALL' ? Number(selectedScheduleMerchant) : null;
    if (targetTxs.length > 0) {
      targetBalance = targetTxs.reduce((sum, tx) => sum + (Number(tx.total_amount) || 0), 0);
      if (targetTxs.every(tx => String(tx.merchant_id) === String(targetTxs[0].merchant_id))) {
        merchantIdForSchedule = targetTxs[0].merchant_id;
      }
    } else if (selectedScheduleMerchant !== 'ALL') {
      const p = profiles.find(pr => String(pr.merchant_id) === String(selectedScheduleMerchant));
      if (p) targetBalance = p.current_balance;
    }
    if (!targetBalance || targetBalance <= 0) {
      setScheduleError(t('Target balance must be greater than 0.', 'ቀሪው ዕዳ ከ0 በላይ መሆን አለበት።'));
      return;
    }
    setScheduleError('');
    try {
      setApplyingSchedule(true);
      const res = await fetch('/api/customer/schedule/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          totalAmount: targetBalance,
          frequency,
          numInstallments,
          merchantId: merchantIdForSchedule,
          ...(singleTargetTx ? { txId: singleTargetTx.id } : {}),
          ...(targetIds.length > 1 ? { txIds: targetIds } : {})
        })
      });
      const sData = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(sData, 'Failed to apply schedule.'));
      setScheduleModalOpen(false);
      setScheduleResult(null);
      setSelectedTxIds([]);
      fetchCustomerDashboard();
    } catch (err) {
      setScheduleError(getErrorMessage(err));
    } finally {
      setApplyingSchedule(false);
    }
  };

  const toggleTxSelection = (id) => {
    setSelectedTxIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleSelectAllVisible = () => {
    // Receipts with an uploaded payment still under merchant review are not
    // selectable; they cannot be scheduled again until the merchant approves.
    const lockedIds = new Set(
      (data?.repayments || [])
        .filter(r => r.status === 'PENDING' && r.transaction_id)
        .map(r => Number(r.transaction_id))
    );
    const visibleIds = filteredPendingTransactions.filter(tx => !lockedIds.has(Number(tx.id))).map(tx => tx.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTxIds.includes(id));
    setSelectedTxIds(prev => (allSelected
      ? prev.filter(id => !visibleIds.includes(id))
      : [...new Set([...prev, ...visibleIds])]));
  };

  // Callers pass either a merchant id (the hub's "Choose Schedule" button) or a
  // pending receipt (its per-row button), so normalise both shapes here
  const openScheduleModal = (target = null) => {
    if (target && typeof target === 'object') {
      setSelectedScheduleTx(target);
    } else {
      setSelectedScheduleTx(null);
      if (target) setSelectedScheduleMerchant(String(target));
    }
    setFrequency('WEEKLY');
    setNumInstallments(2);
    setScheduleResult(null);
    // The builder targets selectedScheduleTx (a row) or the store aggregate, so
    // any leftover checkbox selection is irrelevant here
    setSelectedTxIds([]);
    setScheduleModalOpen(true);
  };

  // Open the builder for every currently checked pending receipt
  const openBulkScheduleModal = () => {
    if (selectedTxIds.length === 0) return;
    setSelectedScheduleTx(null);
    setSelectedScheduleMerchant('ALL');
    setFrequency('WEEKLY');
    setNumInstallments(2);
    setScheduleResult(null);
    setScheduleModalOpen(true);
  };

  // The breakdown is generated on demand from the "Calculate Schedule" button, so
  // clear any previous preview whenever the plan options change. Otherwise a stale
  // breakdown could be applied while the form shows different options.
  useEffect(() => {
    if (scheduleModalOpen) setScheduleResult(null);
  }, [frequency, numInstallments, selectedScheduleMerchant, selectedScheduleTx, selectedTxIds]);

  const notifications = data?.notifications || [];
  const visibleNotifications = notifications.filter(n => !dismissedAlertIds.includes(n.id));
  const unreadCount = visibleNotifications.filter(n => !readAlertIds.includes(n.id)).length;

  // Court letters still standing, i.e. the debt behind them is unpaid. These
  // drive the red banner and the reader modal.
  const courtLetters = data?.notices || [];
  const activeCourtLetters = courtLetters.filter(n => !n.is_settled);
  const settledCourtLetters = courtLetters.filter(n => n.is_settled);
  // Each letter grants a fresh grace period counted from the day it reached the
  // customer's page, which is the day it was issued. Counting from the SMS instead
  // would silently extend the period by however long the merchant left it.
  const courtLetterDeadline = (n) => {
    const issued = new Date(n.court_letter_issued_at || n.court_letter_sent_at);
    if (Number.isNaN(issued.getTime())) return null;
    issued.setDate(issued.getDate() + (n.grace_days || 7));
    return issued;
  };

  // A debt becomes "referred to the court organization" the moment the court
  // letter has actually been sent to the customer (after their 7-day warning).
  // Until that send, online repayment stays open; after it the customer may only
  // accept the letter. There is no separate grace deadline anymore.
  const expiredCourtLetters = activeCourtLetters.filter(n => n.notified_by_sms);
  const courtLetterTxIds = new Set(
    expiredCourtLetters.map(n => Number(n.transaction_id)).filter(Boolean)
  );
  const courtLetterMerchantIds = new Set(
    expiredCourtLetters.map(n => Number(n.merchant_id)).filter(Boolean)
  );
  const isReferredToCourt = (tx) => {
    if (tx?.id && courtLetterTxIds.has(Number(tx.id))) return true;
    if (tx?.merchant_id && courtLetterMerchantIds.has(Number(tx.merchant_id))) return true;
    return false;
  };

  const dismissAlert = (id) => setDismissedAlertIds(prev => [...prev, id]);

  const openAlerts = () => {
    setAlertsOpen(true);
    // Mark all currently visible notifications as read
    setReadAlertIds(prev => {
      const newIds = visibleNotifications.map(n => n.id).filter(id => !prev.includes(id));
      return [...prev, ...newIds];
    });
  };

  // Sync unread alerts count to Navbar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('update-unread-alerts', { detail: { count: unreadCount } }));
  }, [unreadCount]);

  // Listen for open event from Navbar
  useEffect(() => {
    const handleOpen = () => openAlerts();
    window.addEventListener('open-inbox-alerts', handleOpen);
    return () => window.removeEventListener('open-inbox-alerts', handleOpen);
  }, [visibleNotifications]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const summary = data?.summary || { totalBalance: 0, totalCreditLimit: 0, availableCredit: 0 };
  const transactions = data?.transactions || [];
  const pendingTransactions = transactions.filter(tx => tx.status !== 'SETTLED');
  const repayments = data?.repayments || [];
  const profiles = data?.profiles || [];

  const allActiveSchedules = data?.activeSchedules || (data?.activeSchedule ? [data.activeSchedule] : []);
  // Uploaded payment receipts still awaiting merchant review/approval. Until the
  // merchant checks and approves (or rejects) the uploaded receipt, the covered
  // Dube receipt must stay visible here as a red "PENDING REVIEW" row instead of
  // being hidden, so the customer knows their payment is being confirmed.
  const pendingReviewTxIds = new Set(
    (repayments || [])
      .filter(r => r.status === 'PENDING' && r.transaction_id)
      .map(r => Number(r.transaction_id))
  );
  // Installments whose uploaded receipt is still awaiting merchant approval. Keyed
  // by store (merchant_id) + installment number so the Active Schedule card can
  // flip that one installment to "Pending Review" until it is approved (PAID) or
  // rejected (back to payable).
  const pendingReviewInstallmentKeys = new Set(
    (repayments || [])
      .filter(r => r.status === 'PENDING' && r.installment_no)
      .map(r => `${r.merchant_id}:${r.installment_no}`)
  );
  // Receipts covered by an ACTIVE repayment schedule are paid through that plan,
  // so they are hidden from the itemized pending list and only shown on the Active
  // Repayment Schedule cards above (with their PAID / Pending Review / payable
  // installment status). A per-receipt plan (transaction_id set) covers that exact
  // receipt; a store-level/aggregate plan (transaction_id null) covers every
  // pending receipt of that customer profile at that store.
  const scheduledTransactionIds = new Set();
  allActiveSchedules.forEach(s => {
    if (s.transaction_id) {
      scheduledTransactionIds.add(Number(s.transaction_id));
    } else if (s.customer_id) {
      pendingTransactions.forEach(tx => {
        if (Number(tx.customer_id) === Number(s.customer_id)) {
          scheduledTransactionIds.add(Number(tx.id));
        }
      });
    }
  });
  const unscheduledPendingTransactions = pendingTransactions.filter(tx =>
    !scheduledTransactionIds.has(Number(tx.id)) && !pendingReviewTxIds.has(Number(tx.id))
  );

  // The real Birr actually owed on a receipt. The dashboard reports
  // remaining_amount (total minus completed repayments), so that is read first
  // and total_amount is only a fallback for rows where it is missing.
  const realDubeAmount = (tx) => {
    const rem = Number(tx?.remaining_amount);
    if (!Number.isNaN(rem) && rem > 0) return rem;
    return Number(tx?.total_amount) || 0;
  };

  // Receipts still awaiting a schedule/payment, and the subset the current store
  // filter shows. Scheduled receipts are excluded so the itemized panel only ever
  // lists receipts the customer still needs to schedule or pay directly.
  const filteredPendingTransactions = (() => {
    if (selectedMerchantFilter === 'ALL') return unscheduledPendingTransactions;
    const selectedProf = profiles.find(p => String(p.merchant_id) === String(selectedMerchantFilter));
    return unscheduledPendingTransactions.filter(tx =>
      (tx.merchant_id && String(tx.merchant_id) === String(selectedMerchantFilter)) ||
      (selectedProf && tx.customer_id === selectedProf.id) ||
      (selectedProf && tx.store_name === selectedProf.store_name)
    );
  })();

  // What the builder is scoped to: the checked receipts, the clicked receipt, or the store
  const scheduleTargetTxIds = selectedTxIds.length > 0
    ? selectedTxIds
    : (selectedScheduleTx ? [selectedScheduleTx.id] : []);

  const chartWidth = 500;
  const chartHeight = 150;

  const getLast7DaysDube = () => {
    const days = [];
    const salesByDay = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      days.push(dateStr);
      salesByDay[dateStr] = 0;
    }

    const txs = transactions || [];
    txs.forEach(tx => {
      const txDateStr = new Date(tx.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (salesByDay[txDateStr] !== undefined) {
        salesByDay[txDateStr] += parseFloat(tx.total_amount || 0);
      }
    });

    return days.map(day => ({
      day,
      sales: salesByDay[day]
    }));
  };

  const points = getLast7DaysDube();
  const maxSale = Math.max(...points.map(p => p.sales), 1);

  const getCoordinates = () => {
    const paddingX = 40;
    const paddingY = 20;
    const width = chartWidth - paddingX * 2;
    const height = chartHeight - paddingY * 2;

    return points.map((p, index) => {
      const x = paddingX + (index / (points.length - 1)) * width;
      const y = paddingY + height - (p.sales / maxSale) * height;
      return { x, y, day: p.day, sales: p.sales };
    });
  };

  const chartPoints = getCoordinates();

  const pathD = chartPoints.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = pathD ? `${pathD} L ${chartPoints[chartPoints.length - 1].x} ${chartHeight - 20} L ${chartPoints[0].x} ${chartHeight - 20} Z` : '';

  return (
    <div className="flex flex-col">
      {dashboardError && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold px-4 py-3 rounded-xl">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {data
              ? t("Couldn't refresh your dashboard — showing the last loaded data.", 'የዳሽቦርድዎን አድቷውት አልተሳካም — የመጨረሻውን የተጫነ መረጃ እየተመለከተ ነው።')
              : t("Couldn't load your dashboard. Your data is safe — please retry.", 'ዳሽቦርድዎን መጫን አልተሳካም። መረጃዎ ደህንነቱ የተጠበቀ ነው — እባክዎ እንደገና ይሞክሩ።')}
          </span>
          <button
            onClick={fetchCustomerDashboard}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-extrabold transition-colors cursor-pointer"
          >
            {t('Retry', 'እንደገና ይሞክሩ')}
          </button>
        </div>
      )}
      <div className={`flex flex-row gap-1.5 md:gap-3 items-start transition-all duration-300 ${sidebarCollapsed ? 'md:pl-[68px]' : 'md:pl-[240px]'}`}>
        {/* MOBILE SIDEBAR DRAWER (FOR PHONES) */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <aside className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-start h-full z-50 shadow-2xl overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span className="font-extrabold text-sm text-slate-100">{t('Customer Menu', 'የደንበኛ ምናሌ')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setMobileSidebarOpen(false)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <nav className="flex flex-col gap-2">
                  {[
                    { id: 'DASHBOARD', name: t('Dashboard Home', 'ዳሽቦርድ መነሻ'), icon: Wallet },
                    { id: 'MERCHANTS', name: t('Linked Merchants', 'የተገናኙ ነጋዴዎች'), icon: Store, count: profiles.length },
                    { id: 'TRANSACTIONS', name: t('Pending Dube Receipts', 'ያልተከፈሉ ደረሰኞች'), icon: Receipt, count: pendingTransactions.length },
                    { id: 'REPAYMENTS', name: t('Settlement History', 'የክፍያ ታሪክ'), icon: CheckCircle2 }
                  ].map(item => {
                    const isActive = activeTab === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setMobileSidebarOpen(false);
                        }}
                        className={`w-full p-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                          isActive
                            ? 'bg-slate-800 text-emerald-400 border-slate-700 shadow-md'
                            : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4" />
                          <span>{item.name}</span>
                        </div>
                        {item.count !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-950 text-slate-400'
                          }`}>
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-800 text-[10px] text-slate-500 text-center">
                Smart Dube Mobile • Ethiopian BNPL
              </div>
            </aside>
          </div>
        )}

        {/* LEFT SIDEBAR NAVIGATION (DESKTOP ONLY) */}
        <aside className={`hidden md:flex ${sidebarCollapsed ? 'w-[68px]' : 'w-60'} flex-shrink-0 glass-panel rounded-2xl p-2 md:p-3 flex-col justify-start border border-slate-800 md:fixed md:left-0 md:top-[var(--nav-h,52px)] md:bottom-0 md:h-[calc(100vh-var(--nav-h,52px))] md:z-30 overflow-y-auto transition-all duration-300`}>
          <div className="space-y-3 md:space-y-4 w-full min-h-0">
            {/* Header Toggle */}
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} pb-2 border-b border-slate-850`}>
              <span className={`hidden ${sidebarCollapsed ? '' : 'md:inline'} text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono`}>Nav</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  title={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
                >
                  <Menu className="w-4 h-4" />
                </button>
              </div>
            </div>

            <nav className="flex flex-col gap-2 md:gap-1.5 w-full">
              {[
                { id: 'DASHBOARD', name: t('Dashboard Home', 'ዳሽቦርድ መነሻ'), icon: Wallet },
                { id: 'MERCHANTS', name: t('Linked Merchants', 'የተገናኙ ነጋዴዎች'), icon: Store, count: profiles.length },
                { id: 'TRANSACTIONS', name: t('Pending Dube Receipts', 'ያልተከፈሉ ደረሰኞች'), icon: Receipt, count: pendingTransactions.length },
                { id: 'REPAYMENTS', name: t('Settlement History', 'የክፍያ ታሪክ'), icon: CheckCircle2 }
              ].map(item => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full p-2 md:px-3 md:py-2.5 ${sidebarCollapsed ? 'md:justify-center' : 'justify-center md:justify-between'} rounded-xl text-xs font-bold transition-all flex items-center border cursor-pointer ${
                      isActive
                        ? 'bg-slate-800/80 text-emerald-400 border-slate-700/60 shadow-md'
                        : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-900/40'
                    }`}
                    title={item.name}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className={`hidden ${sidebarCollapsed ? '' : 'md:inline'} whitespace-nowrap`}>{item.name}</span>
                    </div>
                    {!sidebarCollapsed && item.count !== undefined && (
                      <span className={`hidden md:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-950/60 text-slate-500'
                      }`}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

      {/* RIGHT MAIN CONTENT AREA */}
      {/* No height cap and no inner scrollbar here on purpose: this pane grows
          with its content and the document does the scrolling, so every tab is
          reachable with the normal window scrollbar. */}
      <div className="flex-1 w-full space-y-6 pr-2 pb-20">
          {/* TAB 1: DASHBOARD HOME */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              {/* Court Letter Warning — only rendered while the debt is unpaid */}
              {activeCourtLetters.map(n => {
                const referred = !!n.notified_by_sms;
                return (
                  <div
                    key={n.id}
                    className="rounded-2xl border border-red-500/50 bg-red-950/40 p-4 md:p-5 shadow-lg shadow-red-950/20 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 shrink-0">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <h3 className="text-sm md:text-base font-black text-red-300 uppercase tracking-wide">
                          {t('Final Court Letter Issued', 'ፍጹም የዳኝነት ደብዳቤ ተላክልቷል')}
                        </h3>
                        <p className="text-xs text-red-200/90 leading-relaxed">
                          {t(
                            `${n.store_name} has issued a formal court letter (Ref: ${n.court_letter_ref}) for your overdue Dube of ${n.amount.toFixed(2)} ETB, which passed its due date on ${n.due_date}.`,
                            `${n.store_name} በ${n.amount.toFixed(2)} ETB የደነበረውን የዱቤ ብድር ስለ ${n.due_date} ያለፈበት ጊዜ ፍጹም የዳኝነት ደብዳቤ (ማጣቀሻ: ${n.court_letter_ref}) አስደምጥሷል።`
                          )}
                        </p>
                        <p className="text-xs text-red-300/80">
                          {referred
                            ? t(
                                'Online repayment for this debt is closed. The court letter has been sent and the case referred to the court organization — please accept the court letter to confirm you received it. Settlement is handled by the court.',
                                'የዚህ ዕዳ የመስመር ላይ ክፍያ ተዘግቷል። የዳኝነት ደብዳቤው ተልኳል ጉዳዩም ወደ ፍርድ ቤት ተመርቷል — መድረሱን ለማረጋገጥ እባክዎ ደብዳቤውን ይቀበሉ። ክፍያው በፍርድ ቤት ይከናወናል።'
                              )
                            : t(
                                'You have been sent a 7-day warning to settle this debt. You can still pay it in full now — once the warning ends the court letter is sent and online repayment closes.',
                                'የዚህ ዕዳ ለመክፈል የ7 ቀን ማስጠንቀቂያ ተልክሎልዎታል። አሁኑኑ ሙሉ በሙሉ መክፈል ይችላሉ — ማስጠንቀቂያው ካለቀ በኋላ ደብዳቤው ይላካል እና የመስመር ላይ ክፍያው ይዘጋል።'
                              )}
                        </p>
                        {!referred && (
                          <p className="text-[11px] text-red-200/70">
                            {t(
                              'The letter is on your page now. The shop will only send it to you by SMS after the 7-day warning ends.',
                              'ደብዳቤው በገጽዎ ላይ ተቀምጧል። ሱቁ የ7 ቀን ማስጠንቀቂያ ካለቀ በኋላ ብቻ በኤስኤምኤስ ይልከዋል።'
                            )}
                          </p>
                        )}
                        {n.is_acknowledged && (
                          <p className="text-[11px] text-sky-200/80 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            {t(
                              `You accepted this letter on ${new Date(n.acknowledged_at || n.court_letter_sent_at).toLocaleDateString()}. Accepting does not clear the debt — it only confirms you received the notice.`,
                              `ይህን ደብዳቤ በ${new Date(n.acknowledged_at || n.court_letter_sent_at).toLocaleDateString()} ተቀብለዋል። መቀበል ዕዳውን አያስቀርም — ደብዳቤው መድረሱን የሚያረጋግጥ እውቅና ብቻ ነው።`
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openLetter(n)}
                        className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold transition-colors cursor-pointer"
                      >
                        {t('Read The Court Letter', 'ደብዳቤውን አንብብ')}
                      </button>
                      {!referred && n.transaction_id && (
                        <button
                          onClick={() => {
                            const tx = transactions.find(t => t.id === n.transaction_id);
                            if (tx) {
                              setSelectedTxForPayment(tx);
                            } else {
                              setActiveTab('TRANSACTIONS');
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 text-red-200 text-xs font-extrabold border border-red-500/30 transition-colors cursor-pointer"
                        >
                          {t('Pay This Debt Now', 'አሁኑ ይክፈሉ')}
                        </button>
                      )}
                      {referred && !n.is_acknowledged && (
                        <button
                          onClick={() => handleAcknowledgeCourtLetter(n)}
                          disabled={acknowledgingLetterId === n.id}
                          className="px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 text-red-200 text-xs font-extrabold border border-red-500/30 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {acknowledgingLetterId === n.id
                            ? t('Accepting...', 'በመቀበል ላይ...')
                            : t('Accept Court Letter', 'ደብዳቤውን ተቀበል')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Balance Summary Header */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Card 1: Outstanding Debt */}
                <div className="glass-panel p-3.5 md:p-4 rounded-xl border border-slate-800/80 relative overflow-hidden shadow-sm">
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('Total Dube Debt Balance', 'አጠቃላይ የዱቤ ብድር ቀሪ ሂሳብ')}</p>
                      <h2 className="text-xl md:text-2xl font-black text-amber-400 mt-0.5">{summary.totalBalance.toFixed(2)} ETB</h2>
                    </div>
                    <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 shrink-0">
                      <Wallet className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">{t(`Across ${summary.activeAccountsCount || 0} neighborhood merchant accounts`, `በ${summary.activeAccountsCount || 0} የነጋዴ አካውንቶች ውስጥ`)}</p>
                </div>

                {/* Card 2: Total Credit Limit */}
                <div className="glass-panel p-3.5 md:p-4 rounded-xl border border-slate-800/80 relative overflow-hidden shadow-sm">
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t('Approved Credit Limit', 'የተፈቀደ የዱቤ መጠን')}</p>
                      <h2 className="text-xl md:text-2xl font-black text-emerald-400 mt-0.5">{summary.totalCreditLimit.toFixed(2)} ETB</h2>
                    </div>
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">{t(`Available: ${summary.availableCredit.toFixed(2)} ETB remaining`, `የቀረ ነጻ ዱቤ፡ ${summary.availableCredit.toFixed(2)} ETB`)}</p>
                </div>
              </div>

              {/* Weekly Dube Credit Utilization Trend Graph */}
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                    {t('Your Weekly Dube Credit Purchase Trend', 'የእርስዎ ሳምንታዊ የዱቤ አጠቃቀም እንቅስቃሴ')}
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    {t('Last 7 Days', 'ያለፉት 7 ቀናት')}
                  </span>
                </div>
                <div className="relative pt-4">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32 overflow-visible">
                    <defs>
                      <linearGradient id="chart-gradient-cust" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.25"/>
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0"/>
                      </linearGradient>
                    </defs>

                    {/* Horizontal Gridlines */}
                    {[0.25, 0.5, 0.75].map((ratio, idx) => {
                      const y = 20 + ratio * (chartHeight - 40);
                      return (
                        <line
                          key={idx}
                          x1="0"
                          y1={y}
                          x2={chartWidth}
                          y2={y}
                          stroke="#334155"
                          strokeDasharray="4 4"
                          strokeWidth="0.5"
                        />
                      );
                    })}

                    {/* Area path */}
                    {areaD && <path d={areaD} fill="url(#chart-gradient-cust)" />}

                    {/* Line path */}
                    {pathD && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]"
                      />
                    )}

                    {/* Chart Points & Labels */}
                    {chartPoints.map((p, idx) => (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="4"
                          className="fill-emerald-400 stroke-slate-900 stroke-2 hover:r-5 transition-all"
                        />
                        {p.sales > 0 && (
                          <text
                            x={p.x}
                            y={p.y - 10}
                            textAnchor="middle"
                            className="text-[9px] fill-emerald-300 font-mono font-bold"
                          >
                            {p.sales.toFixed(0)}
                          </text>
                        )}
                        <text
                          x={p.x}
                          y={chartHeight - 2}
                          textAnchor="middle"
                          className="text-[9px] fill-slate-500 font-mono font-semibold"
                        >
                          {p.day}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              {/* Quick Summary text info panel */}
              <div className="glass-panel p-3.5 md:p-4 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1.5">
                <p className="font-bold text-slate-200">{t('Welcome to your Smart Dube Customer Portal!', 'እንኳን ወደ ስማርት ዱቤ ደንበኛ ገጽ በደህና መጡ!')}</p>
                <p>
                  {t('Use the left sidebar navigation to view details of your neighborhood merchant ledger accounts, pay off pending credit receipts, and inspect your past payments.', 'የግራ የጎን ምናሌን በመጠቀም የነጋዴዎችዎን አካውንት መረጃ ማየት፣ ያልተከፈሉ ደረሰኞች መክፈል፣ እና ያለፉ ክፍያዎችን መከታተል ይችላሉ።')}
                </p>
              </div>
            </div>
          )}          {/* TAB 2: NEIGHBORHOOD MERCHANTS */}
          {activeTab === 'MERCHANTS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                  {t('Your Linked Dube Merchant Ledgers', 'á‹¨á‰°áŒˆáŠ“áŠ™ á‹¨áŠáŒ‹á‹´ á‹±á‰¤ áŠ áŠ«á‹áŠ•á‰¶á‰½')}
                </h3>
                <span className="text-xs font-semibold text-slate-400 font-mono">
                  {profiles.length} {t('Active Ledgers', 'áŒˆá‰£áˆª áŠ áŠ«á‹áŠ•á‰¶á‰½')}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profiles.map(p => {
                  const creditLimit = parseFloat(p.credit_limit || 0);
                  const currentBalance = parseFloat(p.current_balance || 0);
                  const availableLimit = Math.max(0, creditLimit - currentBalance);
                  const utilization = creditLimit > 0 ? Math.min(100, Math.round((currentBalance / creditLimit) * 100)) : 0;
                  const allActiveSched = data?.activeSchedules || (data?.activeSchedule ? [data.activeSchedule] : []);
                  const matchSched = allActiveSched.find(s =>
                    (s.merchant_id && String(s.merchant_id) === String(p.merchant_id)) ||
                    (s.customer_id && s.customer_id === p.id) ||
                    (s.store_name && p.store_name && s.store_name.toLowerCase() === p.store_name.toLowerCase())
                  );
                  const hasUnpaidInsts = matchSched && matchSched.installments?.some(i => i.status !== 'PAID');

                  return (
                    <div key={p.id} className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3.5 hover:border-slate-700 transition-all shadow-md">
                      {/* Top Row: Store Name & Address */}
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold shrink-0">
                            <Store className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-slate-100">{p.store_name}</h4>
                            <p className="text-xs text-slate-400 mt-0.5">{p.store_address}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          {hasUnpaidInsts && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" />
                              {t('Scheduled', 'áˆ°áˆŒá‹³ á‰°á‹­á‹Ÿáˆ')}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                            p.status === 'ACTIVE'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                            {p.status || 'ACTIVE'}
                          </span>
                        </div>
                      </div>

                      {/* Stats Grid: Approved Limit | Dube Debt | Available */}
                      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold">{t('Approved Limit:', 'á‹¨á‰°áˆá‰€á‹° áŒˆá‹°á‰¥á¦')}</p>
                          <p className="font-extrabold text-sky-400 text-xs sm:text-sm font-mono mt-0.5">
                            {creditLimit.toFixed(2)} <span className="text-[9px] font-sans">ETB</span>
                          </p>
                        </div>
                        <div className="text-center border-x border-slate-800/80 px-1">
                          <p className="text-[10px] text-slate-400 font-semibold">{t('Dube Debt:', 'á‹¨á‹±á‰¤ áŠ¥á‹³á¦')}</p>
                          <p className="font-extrabold text-amber-400 text-xs sm:text-sm font-mono mt-0.5">
                            {currentBalance.toFixed(2)} <span className="text-[9px] font-sans">ETB</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-semibold">{t('Available:', 'á‰€áˆª áŒˆá‹°á‰¥á¦')}</p>
                          <p className={`font-extrabold text-xs sm:text-sm font-mono mt-0.5 ${availableLimit === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {availableLimit.toFixed(2)} <span className="text-[9px] font-sans">ETB</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: PENDING RECEIPTS */}
          {activeTab === 'TRANSACTIONS' && (
            <div className="space-y-6">
              {/* SECTION: MERCHANT SELECTOR & REPAYMENT / SCHEDULE HUB */}
              <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-4">
                {/* Header & Store Selector */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-100 flex items-center gap-2">
                        <Store className="w-4 h-4 text-emerald-400" />
                        {t('Select Merchant & Repayment Method', 'ነጋዴ እና የመክፈያ ዘዴ ይምረጡ')}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t('Choose a merchant to schedule salary installments or pay Dube debt directly', 'የደመወዝ ክፍያ የጊዜ ሰሌዳ ለመምረጥ ወይም ቀጥታ ለመክፈል ከታች ነጋዴ ይምረጡ')}
                      </p>
                    </div>

                    {summary.totalBalance > 0 && (
                      <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 font-mono text-xs">
                        <span className="text-slate-400">{t('Total Debt:', 'ጠቅላላ እዳ፦')}</span>
                        <span className="font-extrabold text-amber-400">{summary.totalBalance.toFixed(2)} ETB</span>
                      </div>
                    )}
                  </div>

                  {/* Store Selector Pills */}
                  {profiles.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-3.5 scrollbar-thin">
                      <button
                        onClick={() => setSelectedMerchantFilter('ALL')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                          selectedMerchantFilter === 'ALL'
                            ? 'bg-slate-700 text-white shadow-md border border-slate-600 ring-1 ring-slate-400'
                            : 'bg-slate-900/90 text-slate-400 hover:text-white hover:bg-slate-850 border border-slate-800'
                        }`}
                      >
                        <span>🌐 {t('All Stores', 'ሁሉም ሱቆች')}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 font-mono text-slate-300">
                          {pendingTransactions.length}
                        </span>
                      </button>

                      {profiles.map(p => {
                        const isSelected = String(selectedMerchantFilter) === String(p.merchant_id);
                        const allActiveSchedules = data?.activeSchedules || (data?.activeSchedule ? [data.activeSchedule] : []);
                        const matchingSchedule = allActiveSchedules.find(s =>
                          (s.merchant_id && String(s.merchant_id) === String(p.merchant_id)) ||
                          (s.customer_id && s.customer_id === p.id) ||
                          (s.store_name && p.store_name && s.store_name.toLowerCase() === p.store_name.toLowerCase())
                        );
                        const hasPlan = matchingSchedule && matchingSchedule.installments?.some(i => i.status !== 'PAID');

                        return (
                          <button
                            key={p.id}
                            onClick={() => {
                              setSelectedMerchantFilter(String(p.merchant_id));
                              setSelectedScheduleMerchant(String(p.merchant_id));
                            }}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                              isSelected
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400 border border-emerald-500'
                                : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-850 border border-slate-800'
                            }`}
                          >
                            <Store className="w-3.5 h-3.5" />
                            <span>{p.store_name}</span>
                            {p.current_balance > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 font-mono text-amber-300">
                                {p.current_balance.toFixed(0)} ETB
                              </span>
                            )}
                            {hasPlan && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-sans font-semibold">
                                {t('Scheduled', 'ሰሌዳ ተይዟል')}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* DYNAMIC CARD: Repayment Method Selection OR Active Schedule View */}
                {(() => {
                  const allActiveSchedules = data?.activeSchedules || (data?.activeSchedule ? [data.activeSchedule] : []);

                  // When 'ALL' is chosen, show a helpful selector prompt or quick cards
                  if (selectedMerchantFilter === 'ALL') {
                    return (
                      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-200">
                            {t('Select a merchant above to manage repayment or view your schedule:', 'የክፍያ ሰሌዳ ለማየት ወይም ለመክፈል ከላይ ከነጋዴዎች አንዱን ይምረጡ፦')}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {t('Choose between flexible installment scheduling and instant direct payment per store.', 'ለእያንዳንዱ ሱቅ በክፍልፋይ ወይም በቀጥታ ሙሉ ክፍያ መምረጥ ይችላሉ።')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {profiles.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setSelectedMerchantFilter(String(p.merchant_id));
                                setSelectedScheduleMerchant(String(p.merchant_id));
                              }}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700 cursor-pointer active:scale-95"
                            >
                              {p.store_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // Active profile for the selected store
                  const activeProfile = profiles.find(p => String(p.merchant_id) === String(selectedMerchantFilter)) || profiles[0];
                  if (!activeProfile) return null;

                  // A store can hold several concurrent plans (one per receipt) after
                  // multi-select scheduling, so render every plan that still owes money.
                  const storeSchedules = allActiveSchedules.filter(s =>
                    (s.merchant_id && String(s.merchant_id) === String(activeProfile.merchant_id)) ||
                    (s.customer_id && s.customer_id === activeProfile.id) ||
                    (s.store_name && activeProfile.store_name && s.store_name.toLowerCase() === activeProfile.store_name.toLowerCase())
                  );
                  const activePlans = storeSchedules.filter(s => s.installments?.some(i => i.status !== 'PAID'));

                  // CASE 1: ALREADY SCHEDULED -> "THEN SCHEDULED THEN VIEW THE SCHEDULE THEN PAY"
                  if (activePlans.length > 0) {
                    return (
                      <div className="space-y-4">
                        {activePlans.map(matchingSchedule => {
                          const paidCount = matchingSchedule.installments.filter(i => i.status === 'PAID').length;
                          const totalCount = matchingSchedule.installments.length;
                          const nextUnpaidInst = matchingSchedule.installments.find(i => i.status !== 'PAID');
                          // Paid installments are hidden from the card once the merchant
                          // approves the uploaded receipt; only the installments that
                          // still need action (SCHEDULED / Pending Review) stay listed.
                          const payableInstallments = matchingSchedule.installments.filter(i => i.status !== 'PAID');
                          // The receipt this plan belongs to (null for legacy store-wide plans)
                          const linkedTx = matchingSchedule.transaction_id
                            ? transactions.find(t => Number(t.id) === Number(matchingSchedule.transaction_id))
                            : null;
                          const planTxForPayment = linkedTx
                            || pendingTransactions.find(t => (activeProfile && t.customer_id === activeProfile.id) || (activeProfile && t.merchant_id === activeProfile.merchant_id))
                            || pendingTransactions[0];
                          // A court letter on this receipt or store closes online
                          // repayment: the debt is referred to the court organization.
                          const scheduleReferred = isReferredToCourt(
                            linkedTx || { merchant_id: activeProfile?.merchant_id }
                          );

                          return (
                      <div key={matchingSchedule.id || matchingSchedule.transaction_id || 'plan'} className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 space-y-4 shadow-sm">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-sky-700 font-mono tracking-wide uppercase">
                                {t('Active Repayment Schedule', 'ገባሪ የክፍያ የጊዜ ሰሌዳ')}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-sky-100 text-sky-700 border border-sky-200">
                                {matchingSchedule.frequency || 'WEEKLY'}
                              </span>
                            </div>
                            <h5 className="text-sm font-extrabold text-slate-800 mt-0.5 flex items-center gap-1.5">
                              <Store className="w-4 h-4 text-emerald-600" />
                              <span>{activeProfile.store_name}</span>
                              {linkedTx && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold font-mono bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  {linkedTx.transaction_ref}
                                </span>
                              )}
                            </h5>
                          </div>

                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-500 font-mono">
                              {t('Total Dube:', 'ጠቅላላ ዱቤ፦')} <span className="text-amber-600 font-extrabold">{matchingSchedule.installments.reduce((s, i) => s + parseFloat(i.amount || 0), 0).toFixed(2)} ETB</span>
                            </span>
                            <br className="hidden sm:block" />
                            <span className="text-[10px] text-slate-500 font-mono">
                              {t('Progress:', 'ሂደት፦')} <span className="text-emerald-600 font-bold">{paidCount} / {totalCount}</span> {t('Paid', 'ተከፍሏል')}
                            </span>
                            <div className="w-36 h-2 bg-slate-200 rounded-full mt-1 overflow-hidden border border-slate-300">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                                style={{ width: `${(paidCount / totalCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Installments Breakdown */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 font-mono px-1">
                            <span>{t('Installment Details', 'የክፍልፋይ ዝርዝር')}</span>
                            <span>{t('Status / Action', 'ሁኔታ / ተግባር')}</span>
                          </div>

                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {payableInstallments.length === 0 ? (
                              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 text-center">
                                {t('All installments paid — schedule complete', 'ሁሉም ክፍልፋዮች ተከፍለዋል — የጊዜ ሰሌዳ ተጠናቋል')}
                              </div>
                            ) : (
                            payableInstallments.map(inst => {
                              const isPaid = inst.status === 'PAID';
                              const isNextToPay = nextUnpaidInst && nextUnpaidInst.installmentNo === inst.installmentNo;
                              // Uploaded receipt not yet approved/rejected by the merchant:
                              // the installment is neither payable again nor paid yet.
                              const isPendingReview = inst.status !== 'PAID' &&
                                pendingReviewInstallmentKeys.has(`${activeProfile.merchant_id}:${inst.installmentNo}`);

                              return (
                                <div
                                  key={inst.installmentNo}
                                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                                    isPaid
                                      ? 'bg-slate-100 border-slate-200'
                                      : isNextToPay
                                      ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-200 shadow-sm'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 font-mono">
                                    <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                                      isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                                    }`}>
                                      #{inst.installmentNo}
                                    </span>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-800">
                                          {t('Installment', 'ክፍል')} #{inst.installmentNo}
                                        </span>
                                        <span className="text-slate-400">•</span>
                                        <span className="text-[11px] text-slate-500">
                                          {t('Due Date:', 'ቀን፦')} <strong className="text-slate-700">{inst.dueDate}</strong>
                                        </span>
                                      </div>
                                      <p className="text-xs font-extrabold text-amber-600 mt-0.5">
                                        {inst.amount.toFixed(2)} ETB
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 self-end sm:self-auto">
                                    {isPaid ? (
                                      <span className="px-3 py-1.5 rounded-lg text-xs bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 flex items-center gap-1 font-mono">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>{t('PAID', 'ተከፍሏል')}</span>
                                      </span>
                                    ) : isPendingReview ? (
                                      <span className="px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-700 font-bold border border-red-300 flex items-center gap-1.5 font-mono">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>{t('Pending Review', 'በግምገማ ላይ')}</span>
                                      </span>
                                    ) : scheduleReferred ? (
                                      <span className="px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-700 font-bold border border-red-300 flex items-center gap-1.5 font-mono">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        <span>{t('Referred to court', 'ወደ ፍርድ ቤት ተመርቷል')}</span>
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          const targetTx = planTxForPayment;
                                          if (targetTx) {
                                            setSelectedTxForPayment({
                                              ...targetTx,
                                              store_name: activeProfile.store_name || targetTx.store_name,
                                              merchant_id: activeProfile.merchant_id || targetTx.merchant_id,
                                              customer_id: activeProfile.id || targetTx.customer_id,
                                              total_amount: inst.amount,
                                              installmentNo: inst.installmentNo
                                            });
                                          }
                                        }}
                                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/25 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                                      >
                                        <CreditCard className="w-3.5 h-3.5" />
                                        <span>{t('Pay Installment', 'ክፍልፋይ ክፈል')} #{inst.installmentNo}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                            )}
                          </div>
                        </div>

                        {/* Schedule Footer Actions */}
                        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-center gap-3">
                          <button
                            onClick={() => {
                              setSelectedScheduleMerchant(String(activeProfile.merchant_id || ''));
                              setSelectedTxIds([]);
                              openScheduleModal(linkedTx || activeProfile.merchant_id);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-200"
                          >
                            <Clock className="w-3.5 h-3.5 text-sky-600" />
                            <span>{t('Modify / Recalculate Schedule', 'የጊዜ ሰሌዳውን ቀይር / አስተካክል')}</span>
                          </button>

                          {activeProfile.current_balance > 0 && (
                            scheduleReferred ? (
                              <span className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold flex items-center gap-1.5 border border-red-200">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {t('Referred to court — online payment closed', 'ወደ ፍርድ ቤት ተመርቷል — የመስመር ላይ ክፍያ ተዘግቷል')}
                              </span>
                            ) : (
                            <button
                              onClick={() => {
                                const targetTx = planTxForPayment;
                                if (targetTx) {
                                  setSelectedTxForPayment({
                                    ...targetTx,
                                    store_name: activeProfile.store_name || targetTx.store_name,
                                    merchant_id: activeProfile.merchant_id || targetTx.merchant_id,
                                    customer_id: activeProfile.id || targetTx.customer_id,
                                    total_amount: activeProfile.current_balance
                                  });
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border border-amber-200"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>{t('Pay Remaining Debt at Once', 'ቀሪውን ሙሉ እዳ በአንድ ጊዜ ክፈል')} ({activeProfile.current_balance.toFixed(2)} ETB)</span>
                            </button>
                            )
                          )}
                        </div>
                      </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // Case 2: Not scheduled yet - do not display the dual-card repayment way interface
                  return null;
                })()}
              </div>

              {/* Itemized Dube Receipts (Filtered or All) — scheduled receipts are
                  hidden here; they are shown and paid through the Active Schedule
                  cards above, so the panel only lists unscheduled receipts. */}
              {(() => {
                const displayedPendingTransactions = selectedMerchantFilter === 'ALL'
                  ? unscheduledPendingTransactions
                  : unscheduledPendingTransactions.filter(tx => {
                      const selectedProf = profiles.find(p => String(p.merchant_id) === String(selectedMerchantFilter));
                      return (tx.merchant_id && String(tx.merchant_id) === String(selectedMerchantFilter)) ||
                        (selectedProf && tx.customer_id === selectedProf.id) ||
                        (selectedProf && tx.store_name === selectedProf.store_name);
                    });

                const activeFilterProfile = selectedMerchantFilter !== 'ALL'
                  ? profiles.find(p => String(p.merchant_id) === String(selectedMerchantFilter))
                  : null;

                return (
                  <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                    <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                          <Receipt className="w-5 h-5 text-emerald-400" />
                          {t('Itemized Pending Dube Receipts', 'ያልተከፈሉ የዱቤ ደረሰኞች ዝርዝር')}
                        </h3>
                        <p className="text-xs text-slate-400">{t('Pay back instantly via Telebirr, Chapa, or CBE Birr', 'በቴሌብር፣ ቻፓ ወይም ሲቢኢ ብር በፍጥነት ይክፈሉ')}</p>
                      </div>

                      {activeFilterProfile && (
                        <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
                          <span className="text-xs text-slate-400 font-mono">
                            {t('Filter:', 'ማጣሪያ፦')} <strong className="text-emerald-400">{activeFilterProfile.store_name}</strong>
                          </span>
                          <button
                            onClick={() => setSelectedMerchantFilter('ALL')}
                            className="text-[11px] text-sky-400 hover:underline cursor-pointer font-bold ml-1"
                          >
                            ({t('Show all', 'ሁሉንም አሳይ')})
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Bulk scheduling toolbar */}
                    {displayedPendingTransactions.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={toggleSelectAllVisible}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            {selectedTxIds.length > 0
                              && filteredPendingTransactions.every(tx => selectedTxIds.includes(tx.id))
                              ? t('Clear all', 'ሁሉንም አጽዳ')
                              : t('Select all', 'ሁሉንም ምረጥ')}
                          </button>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {t('Selected:', 'የተመረጡ:')} {selectedTxIds.length} / {filteredPendingTransactions.length}
                          </span>
                          {selectedTxIds.length > 0 && (
                            <span className="text-[11px] text-amber-400 font-mono">
                              {filteredPendingTransactions
                                .filter(tx => selectedTxIds.includes(tx.id))
                                .reduce((sum, tx) => sum + realDubeAmount(tx), 0)
                                .toFixed(2)} ETB
                            </span>
                          )}
                        </div>
                        <button
                          onClick={openBulkScheduleModal}
                          disabled={selectedTxIds.length === 0}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          {t('Schedule Selected', 'የተመረጡን አስቀመጥ')}
                        </button>
                      </div>
                    )}

                    {displayedPendingTransactions.length === 0 ? (
                      pendingTransactions.length > 0 && unscheduledPendingTransactions.length === 0 ? (
                        <div className="text-center py-8 space-y-2">
                          <p className="text-slate-500 text-xs">
                            {t('All of your pending Dube receipts are covered by an active repayment schedule.', 'ሁሉም ያልተከፈሉ የዱቤ ደረሰኞችዎ ገባሪ የክፍያ መርሐ-ግብር አላቸው።')}
                          </p>
                          <p className="text-slate-400 text-xs font-mono">
                            {t('View your active schedule above and pay the installments there.', 'ከላይ ያለዎትን ገባሪ የጊዜ ሰሌዳ ተመልክተው ክፍልፋዮቹን እዚያ ይክፈሉ።')}
                          </p>
                        </div>
                      ) : unscheduledPendingTransactions.length > 0 && selectedMerchantFilter !== 'ALL' ? (
                        <div className="text-center py-8 space-y-2">
                          <p className="text-slate-500 text-xs">
                            {t('No pending receipts under this store filter.', 'በይሄ የስሟት ማጣሪያ ምንም ያልተከፈለ ደረሰኞ አልተገኘም።')}
                          </p>
                          <p className="text-slate-400 text-xs font-mono">
                            {t(`${unscheduledPendingTransactions.length} receipt(s) at other stores are hidden.`, `${unscheduledPendingTransactions.length} በሌሎች ሱቆች ያሉ ደረሰኞች ተደብቀዋል።`)}
                          </p>
                          <button
                            onClick={() => setSelectedMerchantFilter('ALL')}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            {t('Show all receipts', 'ሁሉንም ደረሰኞች አሳይ')}
                          </button>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-500 text-xs">
                          {t('No pending credit ledger items found.', 'ምንም ያልተከፈለ የዱቤ ቀሪ ሂሳብ አልተገኘም።')}
                        </div>
                      )
                    ) : (
                      <div className="space-y-3">
                        {displayedPendingTransactions.map(tx => {
                          const allActiveSchedules = data?.activeSchedules || (data?.activeSchedule ? [data.activeSchedule] : []);
                          // Only a plan dedicated to THIS receipt counts as
                          // scheduled here. Store-level/aggregate plans do not
                          // mark every receipt at that store; those receipts stay
                          // visible as normal payable rows unless they have their
                          // own plan.
                          const linkedSchedule = allActiveSchedules.find(s =>
                            s.transaction_id && Number(s.transaction_id) === Number(tx.id)
                          );
                          const isScheduled = linkedSchedule && linkedSchedule.installments?.some(i => i.status !== 'PAID');
                          const isPendingReview = pendingReviewTxIds.has(Number(tx.id));
                          const isSelected = selectedTxIds.includes(tx.id);

                          return (
                            <div
                              key={tx.id}
                              className={`bg-slate-900/70 p-4 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors ${
                                isPendingReview
                                  ? 'border-red-500/50 bg-red-500/5'
                                  : isSelected ? 'border-emerald-500/50 bg-slate-900' : 'border-slate-800'
                              }`}
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isPendingReview}
                                  onChange={() => toggleTxSelection(tx.id)}
                                  className="mt-1 w-4 h-4 shrink-0 accent-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                                />
                                <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold text-emerald-400">{tx.transaction_ref}</span>
                                  <span className="text-slate-400 text-xs">•</span>
                                  <span className="font-semibold text-slate-200 text-xs">{tx.store_name}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                      tx.status === 'SETTLED'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : isPendingReview
                                        ? 'bg-red-500/25 text-red-300 ring-1 ring-red-500/40'
                                        : tx.status === 'OVERDUE'
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'bg-amber-500/20 text-amber-400'
                                    }`}
                                  >
                                    {tx.status === 'SETTLED' ? t('SETTLED', 'የተከፈለ') : isPendingReview ? t('PENDING REVIEW', 'በግምገማ ላይ') : tx.status === 'OVERDUE' ? t('OVERDUE', 'ቀን ያለፈበት') : t('PENDING', 'ያልተከፈለ')}
                                  </span>
                                  {isScheduled && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                      {t('ON SCHEDULE', 'በጊዜ ሰሌዳ ላይ')}
                                    </span>
                                  )}
                                </div>

                                {/* Line items preview */}
                                <div className="text-xs text-slate-400 flex flex-wrap gap-2 pt-1">
                                  {tx.items && tx.items.map((item, i) => (
                                    <span key={i} className="bg-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300">
                                      {item.quantity}x {item.name} ({item.total ? item.total.toFixed(2) : ''} ETB)
                                    </span>
                                  ))}
                                </div>
                                {isPendingReview && (
                                  <p className="text-[11px] font-bold text-red-400 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {t('Payment receipt uploaded — awaiting merchant review', 'የክፍያ ደረሰኝ ተጭኗል — በባለሱቅ ግምገማ ላይ')}
                                  </p>
                                )}
                                </div>
                              </div>

                              <div className="flex items-center gap-4 self-end md:self-auto">
                                <div className="text-right">
                                  <p className="text-xs text-slate-500">
                                    {t('Due Date:', 'የመክፈያ ቀን፦')} {tx.due_date ? String(tx.due_date).split('T')[0] : 'N/A'}
                                  </p>
                                  <p className={`font-extrabold text-base ${isPendingReview ? 'text-red-400' : 'text-amber-400'}`}>
                                    {realDubeAmount(tx).toFixed(2)} ETB
                                  </p>
                                </div>

                                {tx.status !== 'SETTLED' && (
                                  isReferredToCourt(tx) ? (
                                    <span className="px-4 py-2 rounded-xl bg-red-500/15 text-red-300 border border-red-500/40 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap">
                                      <AlertCircle className="w-3.5 h-3.5" />
                                      {t('Referred to court', 'ወደ ፍርድ ቤት ተመርቷል')}
                                    </span>
                                  ) : isPendingReview ? (
                                    <span className="px-4 py-2 rounded-xl bg-red-500/15 text-red-300 border border-red-500/40 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap">
                                      <Clock className="w-3.5 h-3.5" />
                                      {t('Pending Review', 'በግምገማ ላይ')}
                                    </span>
                                  ) : (
                                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                    {/* Schedule Button side by side with the Pay button */}
                                    <button
                                      onClick={() => {
                                        setSelectedScheduleMerchant(String(tx.merchant_id || ''));
                                        setSelectedTxIds([]);
                                        openScheduleModal(tx);
                                      }}
                                      className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                                    >
                                      <Calendar className="w-3.5 h-3.5" />
                                      <span>{isScheduled ? t('Modify Schedule', 'የጊዜ ሰሌዳ ቀይር') : t('Choose Schedule', 'የጊዜ ሰሌዳ ምረጥ')}</span>
                                    </button>

                                    {/* Always pay the full outstanding Dube from the itemized
                                        panel. Installment amounts belong on the Active Schedule
                                        cards above, never here — showing 250 for a 1000 ETB
                                        receipt is the exact bug a scheduled row used to cause. */}
                                    <button
                                      onClick={() => setSelectedTxForPayment({
                                        ...tx,
                                        total_amount: realDubeAmount(tx)
                                      })}
                                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" />
                                      <span>{t('Pay Debt', 'ዕዳ ክፈል')}</span>
                                    </button>
                                  </div>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 4: SETTLEMENT HISTORY */}
          {activeTab === 'REPAYMENTS' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-800">
              <h3 className="text-base font-extrabold text-slate-100 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-sky-400" />
                {t('Digital Repayment Settlement History', 'የዲጂታል ክፍያ ማካካሻ ታሪክ')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono">
                      <th className="pb-2">{t('Repayment Ref', 'የክፍያ ማጣቀሻ')}</th>
                      <th className="pb-2">{t('Merchant', 'ነጋዴ')}</th>
                      <th className="pb-2">{t('Gateway', 'ክፍያ መተላለፊያ')}</th>
                      <th className="pb-2">{t('Reference Code', 'ማመሳከሪያ ኮድ')}</th>
                      <th className="pb-2">{t('Amount Paid', 'የተከፈለ መጠን')}</th>
                      <th className="pb-2">{t('Status', 'ሁኔታ')}</th>
                      <th className="pb-2">{t('Timestamp', 'ጊዜ ማህተም')}</th>
                      <th className="pb-2 text-right">{t('Receipt', 'ደረሰኝ')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {repayments.map(r => (
                      <tr key={r.id}>
                        <td className="py-2.5 font-mono text-sky-400 font-bold">{r.repayment_ref}</td>
                        <td className="py-2.5">{r.store_name}</td>
                        <td className="py-2.5 font-semibold text-emerald-400">{r.payment_gateway}</td>
                        <td className="py-2.5 font-mono text-yellow-400">{r.reference_code}</td>
                        <td className="py-2.5 font-bold text-slate-100">{r.amount.toFixed(2)} ETB</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            r.status === 'COMPLETED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : r.status === 'REJECTED'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {r.status === 'PENDING' ? t('⏳ PENDING REVIEW', '⏳ ማረጋገጫ በመጠባበቅ ላይ') : r.status === 'REJECTED' ? t('REJECTED', 'ውድቅ የተደረገ') : t('COMPLETED', 'ተጠናቋል')}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500 font-mono">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => setSelectedReceipt(r)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-[10px] font-bold transition-colors flex items-center gap-1 inline-flex cursor-pointer"
                          >
                            <Receipt className="w-3 h-3" />
                            <span>{t('View', 'እይ')}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Repayment Modal */}
      {selectedTxForPayment && (
        <PaymentModal
          isOpen={!!selectedTxForPayment}
          onClose={() => setSelectedTxForPayment(null)}
          transaction={selectedTxForPayment}
          customerId={selectedTxForPayment.customer_id}
          bankAccount={(() => {
            const p = profiles.find(pr => String(pr.merchant_id) === String(selectedTxForPayment.merchant_id))
              || profiles.find(pr => String(pr.id) === String(selectedTxForPayment.customer_id));
            if (!p || !p.bank_name || !p.account_name || !p.account_number) return null;
            return {
              bank_name: p.bank_name,
              account_name: p.account_name,
              account_number: p.account_number,
              store_name: p.store_name
            };
          })()}
          onPaymentSuccess={() => {
            fetchCustomerDashboard();
          }}
        />
      )}

      {/* Digital Receipt Modal */}
      {selectedReceipt && (
        <ReceiptModal
          isOpen={!!selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
          receipt={selectedReceipt}
        />
      )}


      {/* Salary Installment Schedule Modal */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="my-auto glass-panel w-full max-w-lg p-6 rounded-2xl border border-slate-800 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-sky-400" />
                  {t('Repayment Installment Schedule Builder', 'የደመወዝ ክፍያ የጊዜ ሰሌዳ ማዘጋጃ')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('Structure your Dube debt payoff before the repayment deadline', 'የዱቤ እዳዎን ወደ አመቺ ክፍሎች ከፋፍለው የክፍያ ሰሌዳ ያዘጋጁ')}
                </p>
              </div>
              <button
                onClick={() => {
                  setScheduleModalOpen(false);
                  setScheduleResult(null);
                }}
                className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {scheduleError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{scheduleError}</span>
                </div>
              )}

              {/* Selected Target Account Banner */}
              {(() => {
                const selectedP = selectedScheduleMerchant !== 'ALL'
                  ? profiles.find(pr => String(pr.merchant_id) === String(selectedScheduleMerchant))
                  : null;

                return (
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 font-semibold">{t('Target Account:', 'የተመረጠ አካውንት፦')}</span>
                    <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5 font-mono">
                      {selectedP ? (
                        <>
                          <Store className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{selectedP.store_name}</span>
                        </>
                      ) : (
                        <span>🌐 {t('All Stores Combined', 'የሁሉም ሱቆች በጋራ')}</span>
                      )}
                    </span>
                  </div>
                );
              })()}

              {/* 1. Current Dube Balance */}
              {(() => {
                // Mirror exactly what handleGenerateSchedule/handleApplySchedule post to
                // the server, so the balance and deadline shown here are the ones the
                // schedule is actually built from: the checked receipt(s) first, else the
                // clicked receipt, else the store aggregate.
                const targetTxs = scheduleTargetTxIds.length > 0
                  ? transactions.filter(tx => scheduleTargetTxIds.some(id => Number(id) === Number(tx.id)))
                  : [];
                const earliestByDue = list => list.slice().sort((a, b) => {
                  const av = a?.due_date ? String(a.due_date).split('T')[0] : null;
                  const bv = b?.due_date ? String(b.due_date).split('T')[0] : null;
                  if (av === bv) return 0;
                  if (!av) return 1;
                  if (!bv) return -1;
                  return av < bv ? -1 : 1;
                })[0];

                let displayBalance = summary.totalBalance;
                let storeLabel = `Total across all ${summary.activeAccountsCount || 1} stores`;
                let deadlineTx = earliestByDue(transactions);

                if (targetTxs.length === 1) {
                  displayBalance = Number(targetTxs[0].total_amount) || 0;
                  storeLabel = targetTxs[0].store_name;
                  deadlineTx = targetTxs[0];
                } else if (targetTxs.length > 1) {
                  displayBalance = targetTxs.reduce((sum, tx) => sum + (Number(tx.total_amount) || 0), 0);
                  storeLabel = `${targetTxs.length} ${t('Dube receipts', 'ደረሰኞች')}`;
                  deadlineTx = earliestByDue(targetTxs);
                } else if (selectedScheduleMerchant !== 'ALL') {
                  const selectedP = profiles.find(pr => String(pr.merchant_id) === String(selectedScheduleMerchant));
                  if (selectedP) {
                    displayBalance = selectedP.current_balance;
                    storeLabel = selectedP.store_name;
                    deadlineTx = earliestByDue(
                      transactions.filter(tx => String(tx.merchant_id) === String(selectedP.merchant_id))
                    ) || deadlineTx;
                  }
                }
                return (
                  <>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-slate-300">{t('Current Dube Balance:', 'የአሁኑ የዱቤ ቀሪ ሂሳብ፦')}</label>
                        <span className="text-[10px] text-slate-400 font-sans">({storeLabel})</span>
                      </div>
                      <div className="bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-800 text-sm font-extrabold text-amber-400 font-mono">
                        {displayBalance.toFixed(2)} ETB
                      </div>
                    </div>

                    {/* Current Dube Repayment Deadline */}
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">{t('Current Dube Repayment Deadline:', 'የዱቤ መክፈያ የጊዜ ገደብ፦')}</label>
                      <div className="bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-800 text-sm font-extrabold text-emerald-400 font-mono">
                        {deadlineTx?.due_date ? String(deadlineTx.due_date).split('T')[0] : 'N/A'}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* 2. Repayment Frequency */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">{t('Repayment Frequency:', 'የክፍያ ድግግሞሽ፦')}</label>
                <select
                  value={frequency}
                  onChange={e => {
                    setFrequency(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-semibold focus:border-sky-500 outline-none"
                >
                  <option value="WEEKLY">{t('Weekly Installments', 'ሳምንታዊ ክፍያዎች')}</option>
                  <option value="MONTHLY">{t('Monthly Installments', 'ወርሃዊ ክፍያዎች')}</option>
                </select>
              </div>

              {/* 3. Number of Installments */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">{t('Number of Installments:', 'የክፍሎች ብዛት፦')}</label>
                <select
                  value={numInstallments}
                  onChange={e => {
                    setNumInstallments(parseInt(e.target.value));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-semibold focus:border-sky-500 outline-none"
                >
                  <option value={2}>2 {t('Installments', 'ክፍሎች')}</option>
                  <option value={3}>3 {t('Installments', 'ክፍሎች')}</option>
                  <option value={4}>4 {t('Installments', 'ክፍሎች')}</option>
                  <option value={6}>6 {t('Installments', 'ክፍሎች')}</option>
                  <option value={12}>12 {t('Installments', 'ክፍሎች')}</option>
                </select>
              </div>

              {/* 6. Calculate Schedule Button */}
              <button
                onClick={handleGenerateSchedule}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <Clock className="w-4 h-4" />
                <span>{t('Calculate Schedule', 'ሰሌዳውን አስላ')}</span>
              </button>

              {/* 7. Show Installment Breakdown */}
              {scheduleResult && (
                <div className="space-y-3 pt-2">
                  {/* When several receipts are scheduled at once, show what each one gets */}
                  {Array.isArray(scheduleResult.results) && scheduleResult.results.length > 1 && (
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                      <h4 className="text-xs font-bold text-sky-400">
                        {t('Per-receipt split:', 'በየደረሰኝ ክፍፍል፦')}
                      </h4>
                      {scheduleResult.results.map(r => (
                        <div key={r.transactionId} className="flex justify-between items-center text-[11px] font-mono py-1 px-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
                          <span className="text-slate-300 truncate">
                            {r.transactionRef} {r.storeName ? `— ${r.storeName}` : ''}
                          </span>
                          <span className="text-amber-400 font-bold shrink-0 ml-2">
                            {r.installments.length}× · {Number(r.totalAmount || 0).toFixed(2)} ETB
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2.5 max-h-60 overflow-y-auto">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <h4 className="text-xs font-bold text-emerald-400">{t('Installment Breakdown:', 'የክፍያ ክፍፍል ዝርዝር፦')}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {scheduleResult.installments.length} {t('Installments', 'ክፍሎች')}
                      </span>
                    </div>
                    {scheduleResult.installments.map(inst => (
                      <div key={inst.installmentNo} className="flex justify-between items-center text-xs py-1.5 px-2 bg-slate-950/60 rounded-lg border border-slate-800/80 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-bold flex items-center justify-center">
                            #{inst.installmentNo}
                          </span>
                          <span className="text-slate-200">{t('Due Date:', 'ቀን፦')} {inst.dueDate}</span>
                        </div>
                        <span className="text-amber-400 font-bold">{inst.amount.toFixed(2)} ETB</span>
                      </div>
                    ))}
                  </div>

                  {/* 8. Customer Confirm */}
                  <button
                    onClick={handleApplySchedule}
                    disabled={applyingSchedule}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{applyingSchedule ? t('Confirming...', 'በማጽደቅ ላይ...') : t('Customer Confirm & Apply Schedule', 'የጊዜ ሰሌዳውን አጽድቅና ተግብር')}</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  setScheduleModalOpen(false);
                  setScheduleResult(null);
                }}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                {t('Cancel', 'ተመለስ')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Court Letter Reader */}
      {openCourtLetter && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="my-auto glass-panel w-full max-w-2xl rounded-2xl border border-red-500/30 shadow-2xl shadow-red-950/30 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-red-500/20 px-5 py-4 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-red-300 uppercase tracking-wide truncate">
                    {t('Court Letter', 'የዳኝነት ደብዳቤ')}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500 truncate">
                    {t('Ref', 'ማጣቀሻ')}: {openCourtLetter.court_letter_ref}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpenCourtLetter(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 overflow-y-auto flex-1">
              {openCourtLetter.is_settled && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-300 font-semibold">
                    {t(
                      'This debt has been settled. This notice is kept on your record for reference only and no legal action will be taken.',
                      'ይህ ዕዳር ተከፍሏል። ይህ ሰነድ ለመታሪያ ብቻ በመዝገብዎ ላይ ቀር ቷል።'
                    )}
                  </p>
                </div>
              )}

              {!openCourtLetter.is_settled && openCourtLetter.is_acknowledged && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
                  <p className="text-xs text-sky-300 font-semibold">
                    {t(
                      `You accepted this court letter on ${new Date(openCourtLetter.acknowledged_at || openCourtLetter.court_letter_sent_at).toLocaleDateString()}. Accepting does not clear the debt — it only confirms you received the notice.`,
                      `ይህን የዳኝነት ደብዳቤ በ${new Date(openCourtLetter.acknowledged_at || openCourtLetter.court_letter_sent_at).toLocaleDateString()} ተቀብለዋል። መቀበል ዕዳውን አያስቀርም — ደብዳቤው መድረሱን የሚያረጋግጥ እውቅና ብቻ ነው።`
                    )}
                  </p>
                </div>
              )}

              {/* View switch. Only shown when the image exists; otherwise the text
                  below is the whole notice. */}
              {openCourtLetter.image_available && !letterImageFailed && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex rounded-lg overflow-hidden border border-slate-800">
                    <button
                      onClick={() => setLetterView('image')}
                      aria-pressed={letterView === 'image'}
                      className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                        letterView === 'image'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('Document', 'ሰነድ')}
                    </button>
                    <button
                      onClick={() => setLetterView('text')}
                      aria-pressed={letterView === 'text'}
                      className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border-l border-slate-800 transition-colors cursor-pointer ${
                        letterView === 'text'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('Plain text', 'ጽሑፍ')}
                    </button>
                  </div>
                  {letterView === 'image' && openCourtLetter.image_url && (
                    <a
                      href={openCourtLetter.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-slate-500 hover:text-slate-300 underline underline-offset-2"
                    >
                      {t('Open full size', 'በሙሉ መጠን ክፈት')}
                    </a>
                  )}
                </div>
              )}

              {/* The formal letter, rendered as a PNG. Fails soft: if the image
                  cannot be produced or loaded, the text version is shown instead
                  so the customer is never left without their notice. */}
              {openCourtLetter.image_available && letterView === 'image' && !letterImageFailed ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2">
                  {letterImageLoading && (
                    <div className="flex items-center justify-center gap-2 py-16 text-[11px] font-mono text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('Rendering document...', 'ሰነዱ በመስራት ላይ...')}
                    </div>
                  )}
                  <img
                    src={openCourtLetter.image_url}
                    alt={t(
                      `Court letter ${openCourtLetter.court_letter_ref} issued by ${openCourtLetter.store_name}`,
                      `የዳኝነት ደብዳቤ ${openCourtLetter.court_letter_ref}`
                    )}
                    className={`w-full h-auto rounded-lg bg-white ${letterImageLoading ? 'hidden' : ''}`}
                    loading="lazy"
                    onLoad={() => { setLetterImageLoading(false); setLetterImageFailed(false); }}
                    onError={() => { setLetterImageLoading(false); setLetterImageFailed(true); }}
                  />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs leading-relaxed text-slate-300 bg-slate-950/50 border border-slate-800 rounded-xl p-4">
                  {openCourtLetter.court_letter_body}
                </pre>
              )}

              <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>
                  {t('Issued', 'የተሰጠ')}:{' '}
                  {new Date(openCourtLetter.court_letter_issued_at || openCourtLetter.court_letter_sent_at).toLocaleString()}
                </span>
                <span>
                  {openCourtLetter.notified_by_sms
                    ? t('Notified by SMS', 'በኤስኤምኤስ ተሳውቷል')
                    : t('Not sent by SMS yet', 'እስካሁን በኤስኤምኤስ አልተላከም')}
                </span>
                <span>
                  {t('Final settlement deadline', 'የመጨረሻ ክፍያ ቀን')}:{' '}
                  {(() => {
                    const d = courtLetterDeadline(openCourtLetter);
                    return d ? d.toLocaleDateString() : 'N/A';
                  })()}
                </span>
              </div>

              {ackLetterError && (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-300">
                  {ackLetterError}
                </div>
              )}

              {/* History of letters the customer has already dealt with */}
              {settledCourtLetters.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-800 space-y-2">
                  <p className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-slate-500">
                    {t('Previously Settled Notices', 'የተከፈሉ ቀድሞ ሰነዶች')}
                  </p>
                  {settledCourtLetters.map(n => (
                    <button
                      key={n.id}
                      onClick={() => openLetter(n)}
                      className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
                    >
                      <span className="text-[11px] text-slate-400 truncate">
                        {n.store_name} &middot; {n.court_letter_ref}
                      </span>
                      <span className="text-[10px] font-bold uppercase text-emerald-400 shrink-0">
                        {t('Settled', 'ተከፍሏል')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-800 flex flex-col sm:flex-row gap-2 shrink-0">
              {openCourtLetter.is_settled ? (
                <button
                  onClick={() => setOpenCourtLetter(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                >
                  {t('Close', 'ዝጋ')}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      const tx = transactions.find(t => t.id === openCourtLetter.transaction_id);
                      setOpenCourtLetter(null);
                      if (tx) {
                        setSelectedTxForPayment(tx);
                      } else {
                        setActiveTab('TRANSACTIONS');
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-colors cursor-pointer"
                  >
                    {t('Pay This Debt Now', 'አሁኑ ይክፈሉ')}
                  </button>
                  {!openCourtLetter.is_acknowledged && (
                    <button
                      onClick={() => handleAcknowledgeCourtLetter(openCourtLetter)}
                      disabled={acknowledgingLetterId === openCourtLetter.id}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t(
                        'Accepts this letter as received. The debt is still not paid and remains payable.',
                        'ደብዳቤው መድረሱን ብቻ ያረጋግጣል። ዕዳው አሁንም ይከፈላል።'
                      )}
                    >
                      {acknowledgingLetterId === openCourtLetter.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      <span>{acknowledgingLetterId === openCourtLetter.id
                        ? t('Accepting...', 'በመቀበል ላይ...')
                        : t('Accept Court Letter', 'ደብዳቤውን ተቀበል')}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setOpenCourtLetter(null)}
                    className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {t('Close', 'ዝጋ')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alerts Warnings Modal */}
      {alertsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="my-auto glass-panel w-full max-w-lg rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                Merchant Warning Alerts & Notices ({visibleNotifications.length})
              </h3>
              <button
                onClick={() => setAlertsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {visibleNotifications.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs bg-slate-900/30 rounded-xl border border-slate-900 p-4">
                  📭 You have no warning alerts or SMS notifications from your merchants yet.
                </div>
              ) : (
                visibleNotifications.map(n => {
                  const isCourtLetter = n.type === 'COURT_LETTER';
                  const isOverdue = n.type === 'OVERDUE_ALERT';
                  const isReminder = n.type === 'REMINDER';
                  const isCritical = isCourtLetter || isOverdue;
                  return (
                    <div
                      key={n.id}
                      className={`p-3.5 rounded-xl border flex gap-3 items-start transition-all ${
                        isCourtLetter
                          ? 'bg-red-500/15 border-red-500/40 text-red-100'
                          : isOverdue
                          ? 'bg-red-500/10 border-red-500/20 text-red-200'
                          : isReminder
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isCritical ? (
                          <AlertCircle className="w-4 h-4 text-red-400 animate-pulse" />
                        ) : (
                          <Bell className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider font-extrabold">
                          <span className={isCritical ? 'text-red-400' : isReminder ? 'text-amber-400' : 'text-slate-400'}>
                            {n.type === 'COURT_LETTER' && '⚖️ Court Letter Notice'}
                            {n.type === 'OVERDUE_ALERT' && '⚠️ Critical Overdue Warning'}
                            {n.type === 'REMINDER' && '📅 Repayment Reminder'}
                            {n.type === 'CREDIT_ISSUED' && '💳 New Credit Logged'}
                            {n.type === 'PAYMENT_RECEIPT' && '🧾 Payment Receipt Confirmed'}
                            {!['COURT_LETTER', 'OVERDUE_ALERT', 'REMINDER', 'CREDIT_ISSUED', 'PAYMENT_RECEIPT'].includes(n.type) && '💬 Store Alert'}
                          </span>
                          <span className="text-slate-500 font-normal normal-case">
                            {new Date(n.sent_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed font-sans">{n.message}</p>
                        {isCourtLetter && activeCourtLetters.length > 0 && (
                          <button
                            onClick={() => {
                              setAlertsOpen(false);
                              openLetter(activeCourtLetters[0]);
                            }}
                            className="mt-1 px-2.5 py-1 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-[10px] font-extrabold uppercase tracking-wide transition-colors cursor-pointer"
                          >
                            {t('Read Full Court Letter', 'ሙሉ ደብዳቤ አንብብ')}
                          </button>
                        )}
                        <div className="flex justify-between items-center pt-1 border-t border-slate-800/40 text-[9px] font-mono text-slate-500">
                          <span>Phone: {n.phone}</span>
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                              n.status === 'DELIVERED' || n.status === 'Success'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              Status: {n.status}
                            </span>
                            <button
                              onClick={() => dismissAlert(n.id)}
                              title="Remove notification"
                              className="ml-1 text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setAlertsOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs font-bold transition-all cursor-pointer"
            >
              Close Alerts Feed
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

