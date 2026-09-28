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
  Bell,
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Menu
} from 'lucide-react';

export const CustomerPortal = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const [selectedScheduleViewMerchant, setSelectedScheduleViewMerchant] = useState('ALL');
  const [selectedScheduleTx, setSelectedScheduleTx] = useState(null); // specific tx that triggered modal
  const [selectedTxIds, setSelectedTxIds] = useState([]); // multi-select for bulk scheduling

  // Alerts Popover Modal State
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [readAlertIds, setReadAlertIds] = useState([]);

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
      const res = await fetch('/api/customer/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const resData = await res.json();
      setData(resData);
    } catch (err) {
      console.error('Customer dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const [applyingSchedule, setApplyingSchedule] = useState(false);

  // The Dube receipts this modal is scheduling. A single receipt when opened from a
  // row, or every checked receipt when opened from the multi-select toolbar. Empty
  // means the legacy whole-balance / single-store aggregate path.
  const scheduleTargetTxIds = selectedScheduleTx
    ? [selectedScheduleTx.id]
    : [...selectedTxIds];
  const isBulkSchedule = scheduleTargetTxIds.length > 1;

  const buildSchedulePayload = () => {
    let targetBalance = 0;
    if (scheduleTargetTxIds.length > 0) {
      const targetTxs = transactions.filter(tx => scheduleTargetTxIds.includes(tx.id));
      targetBalance = targetTxs.reduce((sum, tx) => sum + parseFloat(tx.total_amount || 0), 0);
    } else if (selectedScheduleMerchant !== 'ALL') {
      const p = profiles.find(pr => String(pr.merchant_id) === String(selectedScheduleMerchant));
      targetBalance = p ? p.current_balance : (data?.summary?.totalBalance || 0);
    } else {
      targetBalance = data?.summary?.totalBalance || 0;
    }

    const deadlineTx = selectedScheduleTx
      || transactions.find(tx => scheduleTargetTxIds.includes(tx.id))
      || transactions.find(tx => selectedScheduleMerchant !== 'ALL' && String(tx.merchant_id) === String(selectedScheduleMerchant))
      || transactions[0];

    return {
      totalAmount: targetBalance,
      frequency,
      numInstallments,
      merchantId: scheduleTargetTxIds.length > 0
        ? null
        : (selectedScheduleMerchant !== 'ALL' ? Number(selectedScheduleMerchant) : null),
      txIds: scheduleTargetTxIds,
      deadlineDate: deadlineTx?.due_date ? String(deadlineTx.due_date).split('T')[0] : null
    };
  };

  const handleGenerateSchedule = async () => {
    const payload = buildSchedulePayload();
    if (!payload.totalAmount) return;

    try {
      const res = await fetch('/api/customer/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const sData = await res.json();
      if (!res.ok) throw new Error(sData.error || 'Failed to calculate schedule.');
      setScheduleResult(sData);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApplySchedule = async () => {
    const payload = buildSchedulePayload();
    if (!payload.totalAmount) return;

    try {
      setApplyingSchedule(true);
      const res = await fetch('/api/customer/schedule/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const sData = await res.json();
      if (!res.ok) throw new Error(sData.error || 'Failed to apply schedule.');
      alert(isBulkSchedule
        ? `✓ Repayment schedule applied to ${payload.txIds.length} Dube receipts!`
        : '✓ Flexible Repayment Schedule applied successfully!');
      setScheduleModalOpen(false);
      setScheduleResult(null);
      setSelectedScheduleTx(null);
      setSelectedTxIds([]);
      fetchCustomerDashboard();
    } catch (err) {
      alert(err.message);
    } finally {
      setApplyingSchedule(false);
    }
  };

  const openScheduleModal = (tx = null) => {
    setNumInstallments(2);
    setScheduleResult(null);
    setSelectedScheduleTx(tx || null);
    // The builder's target is decided by selectedScheduleTx (a row) or the
    // store-level aggregate, so any leftover checkbox selection is irrelevant
    setSelectedTxIds([]);
    setScheduleModalOpen(true);
  };

  // Open the builder for every currently checked pending receipt
  const openBulkScheduleModal = () => {
    if (selectedTxIds.length === 0) return;
    setSelectedScheduleTx(null);
    setSelectedScheduleMerchant('ALL');
    setNumInstallments(2);
    setScheduleResult(null);
    setScheduleModalOpen(true);
  };

  const toggleTxSelection = (id) => {
    setSelectedTxIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredPendingTransactions.map(tx => tx.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTxIds.includes(id));
    setSelectedTxIds(prev => (allSelected
      ? prev.filter(id => !visibleIds.includes(id))
      : [...new Set([...prev, ...visibleIds])]));
  };

  const notifications = data?.notifications || [];
  const visibleNotifications = notifications.filter(n => !dismissedAlertIds.includes(n.id));
  const unreadCount = visibleNotifications.filter(n => !readAlertIds.includes(n.id)).length;

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
  const allActiveSchedules = data?.activeSchedules || (data?.activeSchedule ? [data.activeSchedule] : []);

  // Determine if a transaction is currently covered under an active repayment schedule
  const isTxScheduled = (tx) => {
    return allActiveSchedules.some(s => {
      if (s.status !== 'ACTIVE') return false;
      const hasUnpaid = s.installments?.some(i => i.status !== 'PAID');
      if (!hasUnpaid) return false;

      // 1. If schedule is explicitly linked to a specific transaction, match ONLY that exact transaction
      if (s.transaction_id) {
        return Number(s.transaction_id) === Number(tx.id);
      }

      // 2. If schedule is for a customer/merchant, match ONLY the transaction with the matching scheduled amount
      const matchesMerchant = (tx.merchant_id && s.merchant_id && String(tx.merchant_id) === String(s.merchant_id)) ||
        (tx.customer_id && s.customer_id && String(tx.customer_id) === String(s.customer_id));
      if (!matchesMerchant) return false;

      if (Math.abs(parseFloat(s.total_amount) - parseFloat(tx.total_amount)) < 0.01) {
        return true;
      }

      return false;
    });
  };

  // Only display unscheduled pending receipts (scheduled ones are displayed in the Active Schedule above)
  const pendingTransactions = transactions.filter(tx => tx.status !== 'SETTLED' && !isTxScheduled(tx));
  const repayments = data?.repayments || [];
  const profiles = data?.profiles || [];

  const hasAnyActiveSchedule = allActiveSchedules.some(s => s.installments?.some(i => i.status !== 'PAID'));
  const selectedStoreProfile = profiles.find(p => String(p.merchant_id) === String(selectedScheduleViewMerchant));

  // Filter pending transactions based on selected store filter
  const filteredPendingTransactions = pendingTransactions.filter(tx => {
    if (!selectedScheduleViewMerchant || selectedScheduleViewMerchant === 'ALL') return true;
    return String(tx.merchant_id) === String(selectedScheduleViewMerchant);
  });

  // Multi-select helpers for bulk scheduling
  const allVisibleSelected = filteredPendingTransactions.length > 0
    && filteredPendingTransactions.every(tx => selectedTxIds.includes(tx.id));
  const selectedTxTotal = transactions
    .filter(tx => selectedTxIds.includes(tx.id))
    .reduce((sum, tx) => sum + parseFloat(tx.total_amount || 0), 0);

  // The one receipt being scheduled, whichever way the modal was opened.
  // Derived here (not next to scheduleTargetTxIds) because `transactions` is
  // only in scope below.
  const singleTargetTx = isBulkSchedule
    ? null
    : (transactions.find(tx => scheduleTargetTxIds.includes(tx.id)) || selectedScheduleTx);

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
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex flex-row gap-1.5 md:gap-3 items-start flex-1 min-h-0">
        {/* MOBILE SIDEBAR DRAWER (FOR PHONES) */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <aside className="relative w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between h-full z-50 shadow-2xl overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span className="font-extrabold text-sm text-slate-100">{t('Customer Menu', 'የደንበኛ ምናሌ')}</span>
                  </div>
                  <button
                    onClick={() => setMobileSidebarOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
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

              <div className="pt-4 border-t border-slate-800 text-[10px] text-slate-500 text-center">
                Smart Dube Mobile • Ethiopian BNPL
              </div>
            </aside>
          </div>
        )}

        {/* LEFT SIDEBAR NAVIGATION (DESKTOP ONLY) */}
        <aside className={`hidden md:flex ${sidebarCollapsed ? 'w-[68px]' : 'w-60'} flex-shrink-0 glass-panel rounded-2xl p-2 md:p-3 flex-col justify-between border border-slate-800 sticky top-[52px] h-[calc(100vh-56px)] overflow-y-auto transition-all duration-300`}>
          <div className="space-y-3 md:space-y-4 w-full">
            {/* Header Toggle */}
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} pb-2 border-b border-slate-850`}>
              <span className={`hidden ${sidebarCollapsed ? '' : 'md:inline'} text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono`}>Nav</span>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                title={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
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
        <div className="flex-1 w-full space-y-6 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto pr-2 pb-20">
          {/* TAB 1: DASHBOARD HOME */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
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
          )}

          {/* TAB 2: NEIGHBORHOOD MERCHANTS */}
          {activeTab === 'MERCHANTS' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                  {t('Your Linked Dube Merchant Ledgers', 'የተገናኙ የነጋዴ ዱቤ አካውንቶች')}
                </h3>
                <span className="text-xs font-semibold text-slate-400 font-mono">
                  {profiles.length} {t('Active Ledgers', 'ገባሪ አካውንቶች')}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profiles.map(p => {
                  const creditLimit = parseFloat(p.credit_limit || 0);
                  const currentBalance = parseFloat(p.current_balance || 0);
                  const availableLimit = Math.max(0, creditLimit - currentBalance);
                  const utilization = creditLimit > 0 ? Math.min(100, Math.round((currentBalance / creditLimit) * 100)) : 0;

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
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                          p.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {p.status || 'ACTIVE'}
                        </span>
                      </div>

                      {/* Middle Stats Grid: Approved Limit, Account Debt, Available Limit */}
                      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-850">
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold">{t('Approved Limit:', 'የተፈቀደ ገደብ፦')}</p>
                          <p className="font-extrabold text-sky-400 text-xs sm:text-sm font-mono mt-0.5">
                            {creditLimit.toFixed(2)} <span className="text-[9px] font-sans">ETB</span>
                          </p>
                        </div>
                        <div className="text-center border-x border-slate-800/80 px-1">
                          <p className="text-[10px] text-slate-400 font-semibold">{t('Account Debt:', 'የአካውንት እዳ፦')}</p>
                          <p className="font-extrabold text-amber-400 text-xs sm:text-sm font-mono mt-0.5">
                            {currentBalance.toFixed(2)} <span className="text-[9px] font-sans">ETB</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-semibold">{t('Available Limit:', 'ቀሪ ገደብ፦')}</p>
                          <p className="font-extrabold text-emerald-400 text-xs sm:text-sm font-mono mt-0.5">
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
              {/* Salary Cycle Repayment Scheduler Trigger & Active Plan Card - Always visible for merchant selection */}
              {(() => {
                const allActiveSchedules = data?.activeSchedules || (data?.activeSchedule ? [data.activeSchedule] : []);
                const hasAnyActiveSchedule = allActiveSchedules.some(s => s.installments?.some(i => i.status !== 'PAID'));

                const activeMerchantId = (selectedScheduleViewMerchant && selectedScheduleViewMerchant !== 'ALL')
                  ? selectedScheduleViewMerchant
                  : '';

                const profileForStore = activeMerchantId
                  ? profiles.find(p => String(p.merchant_id) === activeMerchantId)
                  : (profiles.find(p => allActiveSchedules.some(s => String(s.merchant_id) === String(p.merchant_id))) || profiles[0]);

                // A customer can hold several concurrent plans (one per scheduled
                // receipt), so show every plan for the selected store, not just one.
                const viewSchedules = activeMerchantId
                  ? allActiveSchedules.filter(s =>
                      (profileForStore && String(s.merchant_id) === String(profileForStore.merchant_id)) ||
                      (profileForStore && s.customer_id === profileForStore.id)
                    )
                  : allActiveSchedules;

                const hasUnpaidInsts = viewSchedules.some(s => s.installments?.some(i => i.status !== 'PAID'));

                return (
                  <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-sky-400" />
                          {t('Salary Repayment Schedule', 'የደመወዝ ክፍያ የጊዜ ሰሌዳ')}
                        </h4>
                        {hasUnpaidInsts && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {t('ACTIVE PLAN', 'ገባሪ እቅድ')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {t('Split Dube balances into weekly or monthly salary installments per store', 'የዱቤ እዳዎችን ለእያንዳንዱ ሱቅ ወደ ሳምንታዊ ወይም ወርሃዊ የደመወዝ ክፍሎች ይከፋፍሉ')}
                      </p>

                      {/* Store Schedule Switcher Tabs - ALWAYS VISIBLE AT TOP */}
                      {profiles.length > 1 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mt-3">
                          {/* All Stores option */}
                          <button
                            onClick={() => {
                              setSelectedScheduleViewMerchant('ALL');
                              setSelectedScheduleMerchant('ALL');
                              setSelectedTxIds([]);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                              selectedScheduleViewMerchant === 'ALL'
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-400'
                                : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                            }`}
                          >
                            <Store className="w-3.5 h-3.5" />
                            <span>{t('All Stores', 'ሁሉም ሱቆች')}</span>
                            {summary.totalBalance > 0 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono text-amber-300">
                                {summary.totalBalance.toFixed(0)} ETB
                              </span>
                            )}
                          </button>

                          {profiles.map(p => {
                            const isSelected = selectedScheduleViewMerchant === String(p.merchant_id);

                            return (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setSelectedScheduleViewMerchant(String(p.merchant_id));
                                  setSelectedScheduleMerchant(String(p.merchant_id));
                                  setSelectedTxIds([]);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-400'
                                    : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                                }`}
                              >
                                <Store className="w-3.5 h-3.5" />
                                <span>{p.store_name}</span>
                                {p.current_balance > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono text-amber-300">
                                    {p.current_balance.toFixed(0)} ETB
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* A customer can hold several concurrent plans (one per scheduled
                        receipt), so render every plan for the selected store, not just one. */}
                    {viewSchedules.map(schedule => {
                      const linkedTx = schedule.transaction_id
                        ? transactions.find(tx => Number(tx.id) === Number(schedule.transaction_id))
                        : null;
                      const planLabel = linkedTx
                        ? `${linkedTx.transaction_ref} — ${linkedTx.store_name}`
                        : `${t('Active Plan for', 'ለ')} ${linkedTx?.store_name || profileForStore?.store_name || schedule.store_name}`;

                      return (
                        <div key={schedule.id} className="mt-3 space-y-2 bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                          <div className="text-[11px] font-bold text-sky-400 flex justify-between items-center gap-2">
                            <span className="truncate">
                              {planLabel}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {schedule.installments.filter(i => i.status === 'PAID').length} / {schedule.installments.length} {t('Paid', 'ተከፍሏል')}
                            </span>
                          </div>
                          {schedule.installments.map(inst => {
                            const instPendingRepayment = repayments.find(r =>
                              r.status === 'PENDING' &&
                              (r.transaction_id === schedule.transaction_id
                                || r.customer_id === profileForStore?.id
                                || r.merchant_id === profileForStore?.merchant_id) &&
                              Math.abs(parseFloat(r.amount) - inst.amount) < 0.01
                            );

                            return (
                              <div key={`${schedule.id}-${inst.installmentNo}`} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-800/60 font-mono">
                                <div>
                                  <span className="text-slate-200">{t('Inst', 'ክፍል')} #{inst.installmentNo} ({t('Due', 'ቀን')}: {inst.dueDate})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-amber-400 font-bold">{inst.amount.toFixed(2)} ETB</span>
                                  {inst.status === 'PAID' ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold">{t('PAID', 'ተከፍሏል')}</span>
                                  ) : instPendingRepayment ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30 flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5 animate-pulse" />
                                      {t('Pending Review', 'በግምገማ ላይ')}
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        // Pay the receipt THIS plan belongs to, not whichever
                                        // unsettled receipt happens to match the store
                                        const payTx = (linkedTx && linkedTx.status !== 'SETTLED' ? linkedTx : null)
                                          || transactions.find(tx => tx.customer_id === profileForStore?.id && tx.status !== 'SETTLED')
                                          || transactions.find(tx => tx.merchant_id === profileForStore?.merchant_id && tx.status !== 'SETTLED')
                                          || transactions.find(tx => tx.status !== 'SETTLED')
                                          || transactions[0];
                                        if (payTx) {
                                          setSelectedTxForPayment({
                                            ...payTx,
                                            store_name: payTx.store_name || profileForStore?.store_name,
                                            merchant_id: payTx.merchant_id ?? profileForStore?.merchant_id,
                                            customer_id: payTx.customer_id ?? profileForStore?.id,
                                            total_amount: inst.amount,
                                            installmentNo: inst.installmentNo
                                          });
                                        }
                                      }}
                                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer transition-all"
                                    >
                                      {t('Pay', 'ክፈል')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {!hasUnpaidInsts && (
                      <div className="mt-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 text-center space-y-2.5">
                        <p className="text-xs text-slate-300 font-medium">
                          {t('No repayment schedule set up for', 'ለ')} {profileForStore?.store_name || 'this store'} {t('yet', 'አልተዘጋጀም')} (Debt: {profileForStore?.current_balance?.toFixed(2) || '0.00'} ETB).
                        </p>
                        <button
                          onClick={() => {
                            setSelectedScheduleMerchant(String(profileForStore?.merchant_id || ''));
                            openScheduleModal();
                          }}
                          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-600/20 inline-flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <Clock className="w-4 h-4" />
                          <span>
                            {t('Create Schedule for', 'ለ')} {profileForStore?.store_name || 'Store'}
                          </span>
                        </button>
                      </div>
                    )}

                    {hasUnpaidInsts && (
                      <button
                        onClick={() => {
                          setSelectedScheduleMerchant(String(profileForStore?.merchant_id || ''));
                          openScheduleModal();
                        }}
                        className="w-full mt-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        {t('Change / Customize Schedule', 'የጊዜ ሰሌዳውን ቀይር / አስተካክል')}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Itemized Dube Receipts */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800">
                <div className="mb-4">
                  <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-emerald-400" />
                    {t('Itemized Pending Dube Receipts', 'ያልተከፈሉ የዱቤ ደረሰኞች ዝርዝር')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{t('Pay back instantly via Telebirr, Chapa, or CBE Birr', 'በቴሌብር፣ ቻፓ ወይም ሲቢኢ ብር በፍጥነት ይክፈሉ')}</p>
                </div>

                {filteredPendingTransactions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    {selectedStoreProfile
                      ? `${t('No pending credit ledger items found for', 'ምንም ያልተከፈለ የዱቤ ቀሪ ሂሳብ አልተገኘም ለ')} ${selectedStoreProfile.store_name}.`
                      : t('No pending credit ledger items found.', 'ምንም ያልተከፈለ የዱቤ ቀሪ ሂሳብ አልተገኘም።')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Multi-select toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAllVisible}
                            className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-slate-300">
                            {allVisibleSelected ? t('Deselect all', 'ሁሉንም አስወግድ') : t('Select all', 'ሁሉንም ይምረጡ')}
                          </span>
                        </label>
                        {selectedTxIds.length > 0 && (
                          <span className="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] font-extrabold font-mono">
                            {selectedTxIds.length} {t('selected', 'ተመርጠዋል')} • {selectedTxTotal.toFixed(2)} ETB
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedTxIds.length > 0 && (
                          <button
                            onClick={() => setSelectedTxIds([])}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            {t('Clear', 'አጽዳ')}
                          </button>
                        )}
                        <button
                          onClick={openBulkScheduleModal}
                          disabled={selectedTxIds.length === 0}
                          className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-extrabold shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {t('Schedule Selected', 'የተመረጡትን ሰሌዳ')} {selectedTxIds.length > 0 && `(${selectedTxIds.length})`}
                          </span>
                        </button>
                      </div>
                    </div>

                    {filteredPendingTransactions.map(tx => {
                      const pendingRepayment = repayments.find(r => r.transaction_id === tx.id && r.status === 'PENDING');
                      const isPendingReview = !!pendingRepayment;
                      const isRowSelected = selectedTxIds.includes(tx.id);

                      return (
                        <div
                          key={tx.id}
                          className={`p-4 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors ${
                            isRowSelected
                              ? 'bg-sky-500/10 border-sky-500/40 ring-1 ring-sky-500/30'
                              : 'bg-slate-900/70 border-slate-800'
                          }`}
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isRowSelected}
                              onChange={() => toggleTxSelection(tx.id)}
                              className="mt-1 w-4 h-4 rounded accent-sky-500 cursor-pointer shrink-0"
                            />
                            <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-emerald-400">{tx.transaction_ref}</span>
                              <span className="text-slate-400 text-xs">•</span>
                              <span className="font-semibold text-slate-200 text-xs">{tx.store_name}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                                  isPendingReview
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono'
                                    : tx.status === 'SETTLED'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : tx.status === 'OVERDUE'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-amber-500/20 text-amber-400'
                                }`}
                              >
                                {isPendingReview ? (
                                  <>
                                    <Clock className="w-3 h-3 animate-pulse" />
                                    <span>{t('PENDING REVIEW', 'በግምገማ ላይ')}</span>
                                  </>
                                ) : tx.status === 'SETTLED' ? (
                                  t('SETTLED', 'የተከፈለ')
                                ) : tx.status === 'OVERDUE' ? (
                                  t('OVERDUE', 'ቀን ያለፈበት')
                                ) : (
                                  t('PENDING', 'ያልተከፈለ')
                                )}
                              </span>
                            </div>

                            {/* Line items preview */}
                            <div className="text-xs text-slate-400 flex flex-wrap gap-2 pt-1">
                              {tx.items && tx.items.map((item, i) => (
                                <span key={i} className="bg-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300">
                                  {item.quantity}x {item.name} ({item.total ? item.total.toFixed(2) : ''} ETB)
                                </span>
                              ))}
                            </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 self-end md:self-auto">
                            <div className="text-right">
                              <p className="text-xs text-slate-500">{t('Due Date:', 'የመክፈያ ቀን፦')} {tx.due_date ? String(tx.due_date).split('T')[0] : 'N/A'}</p>
                              <p className="font-extrabold text-amber-400 text-base">{tx.total_amount.toFixed(2)} ETB</p>
                            </div>

                            {tx.status !== 'SETTLED' && (
                              <div className="flex items-center gap-2">
                                {/* Schedule Button - only available if not already under review */}
                                {!isPendingReview && (
                                  <button
                                    onClick={() => {
                                      setSelectedScheduleMerchant(String(tx.merchant_id || ''));
                                      openScheduleModal(tx);
                                    }}
                                    className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                                  >
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>{t('Schedule', 'ሰሌዳ')}</span>
                                  </button>
                                )}

                                {/* Pay Debt Button or Pending Review Button */}
                                {isPendingReview ? (
                                  <div
                                    title={t('Your payment receipt is under review by the merchant', 'የክፍያ ደረሰኝዎ በነጋዴው እየተገመገመ ነው')}
                                    className="px-3.5 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 font-mono cursor-default shadow-sm"
                                  >
                                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                                    <span>{t('Pending Review', 'በግምገማ ላይ')}</span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setSelectedTxForPayment(tx)}
                                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    <span>{t('Pay Debt', 'ዕዳ ክፈል')}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl border border-slate-800 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-sky-400" />
                  {isBulkSchedule
                    ? `Schedule ${scheduleTargetTxIds.length} Dube Receipts`
                    : 'Repayment Installment Schedule Builder'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isBulkSchedule
                    ? t('Each receipt gets its own plan, anchored to its own due date', 'እያንዳንዱ ደረሰኝ ራሱን እቅድ ያገኛል፣ በራሱ የመክፈያ ቀን')
                    : t('Structure your Dube debt payoff before the repayment deadline', 'የዱቤ ዕዳዎችችን ከመክፈያ ገደቡ በፊት ያስተካክሉ')}
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
              {/* Selected Target Account Banner */}
              {(() => {
                if (isBulkSchedule) {
                  return (
                    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30">
                      <span className="text-xs text-slate-400 font-semibold">{t('Selected Receipts:', 'የተመረጡ ደረሰኞች፦')}</span>
                      <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5 font-mono">
                        <Receipt className="w-3.5 h-3.5" />
                        <span>
                          {scheduleTargetTxIds.length} {t('Dubes', 'ዱቤዎች')} • {selectedTxTotal.toFixed(2)} ETB
                        </span>
                      </span>
                    </div>
                  );
                }

                const selectedP = singleTargetTx
                  ? profiles.find(pr => String(pr.merchant_id) === String(singleTargetTx.merchant_id))
                  : (selectedScheduleMerchant !== 'ALL'
                    ? profiles.find(pr => String(pr.merchant_id) === String(selectedScheduleMerchant))
                    : null);

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
                // Use specific tx amount if modal was opened from a receipt row
                let displayBalance;
                let storeLabel;
                let selectedTx;
                if (isBulkSchedule) {
                  displayBalance = selectedTxTotal;
                  storeLabel = t('across selected receipts', 'በተመረጡ ደረሰኞች ላይ');
                  selectedTx = transactions.find(tx => scheduleTargetTxIds.includes(tx.id));
                } else if (singleTargetTx) {
                  displayBalance = parseFloat(singleTargetTx.total_amount);
                  storeLabel = singleTargetTx.store_name;
                  selectedTx = singleTargetTx;
                } else if (selectedScheduleMerchant !== 'ALL') {
                  const selectedP = profiles.find(pr => String(pr.merchant_id) === String(selectedScheduleMerchant));
                  displayBalance = selectedP ? selectedP.current_balance : (summary.totalBalance || 0);
                  storeLabel = selectedP ? selectedP.store_name : `All ${summary.activeAccountsCount || 1} stores`;
                  selectedTx = transactions.find(t => selectedP && t.merchant_id === selectedP.merchant_id) || transactions[0];
                } else {
                  displayBalance = summary.totalBalance || 0;
                  storeLabel = `Total across all ${summary.activeAccountsCount || 1} stores`;
                  selectedTx = transactions[0];
                }
                return (
                  <>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-slate-300">{t('Current Dube Balance:', 'የአሁኑ የዱቤ ቀሪ ሂሳብ፦')}</label>
                        <span className="text-[10px] text-slate-400 font-sans">({storeLabel})</span>
                      </div>
                      <div className="bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-800 text-sm font-extrabold text-amber-400">
                        {displayBalance.toFixed(2)} ETB
                      </div>
                    </div>

                    {/* Current Dube Repayment Deadline */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-slate-300">
                          {isBulkSchedule
                            ? t('Per-Receipt Deadlines:', 'በየደረሰኝ የመክፈያ ገደቦች፦')
                            : t('Current Dube Repayment Deadline:', 'የዱቤ መክፈያ የጊዜ ገደብ፦')}
                        </label>
                        {scheduleResult?.deadlineDate && (
                          <span className="text-[10px] text-emerald-400 font-sans font-bold">({t('Schedule Deadline', 'የሰሌዳ ማብቂያ')})</span>
                        )}
                      </div>
                      <div className="bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-800 text-sm font-extrabold text-emerald-400 font-mono">
                        {isBulkSchedule
                          ? (scheduleResult?.schedules?.length
                            ? scheduleResult.schedules.map(s => s.deadlineDate).join('  •  ')
                            : t('Each receipt keeps its own due date', 'እያንዳንዱ ደረሰኝ ራሱን የመክፈያ ቀን ያስቀምጣል'))
                          : (scheduleResult?.deadlineDate || (selectedTx?.due_date ? String(selectedTx.due_date).split('T')[0] : 'N/A'))}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* 2. Repayment Frequency */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Repayment Frequency:</label>
                <select
                  value={frequency}
                  onChange={e => {
                    setFrequency(e.target.value);
                    setScheduleResult(null);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-semibold focus:border-sky-500 outline-none"
                >
                  <option value="WEEKLY">Weekly Installments</option>
                  <option value="MONTHLY">Monthly Installments</option>
                </select>
              </div>

              {/* 3. Number of Installments */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Number of Installments:</label>
                <select
                  value={numInstallments}
                  onChange={e => {
                    setNumInstallments(parseInt(e.target.value));
                    setScheduleResult(null);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-semibold focus:border-sky-500 outline-none"
                >
                  <option value={2}>2 Installments</option>
                  <option value={3}>3 Installments</option>
                  <option value={4}>4 Installments</option>
                  <option value={6}>6 Installments</option>
                  <option value={12}>12 Installments</option>
                </select>
              </div>


              {/* 6. Calculate Schedule Button */}
              <button
                onClick={handleGenerateSchedule}
                className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />
                <span>Calculate Schedule</span>
              </button>

              {/* 7. Show Installment Breakdown */}
              {scheduleResult && (
                <div className="space-y-3 pt-2">
                  {isBulkSchedule ? (
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                      <div className="flex justify-between items-center pb-1">
                        <h4 className="text-xs font-bold text-emerald-400">Per-Receipt Breakdown:</h4>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {scheduleResult.schedules.length} {t('plans', 'እቅዶች')} • {scheduleResult.totalAmount.toFixed(2)} ETB
                        </span>
                      </div>
                      {scheduleResult.schedules.map(s => {
                        const metaTx = transactions.find(tx => tx.id === s.transactionId);
                        return (
                          <div key={s.transactionId} className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                              <span className="text-[11px] font-bold text-sky-400 font-mono">
                                {metaTx?.transaction_ref || `TX-${s.transactionId}`}
                                {metaTx?.store_name && (
                                  <span className="text-slate-400 font-sans font-semibold"> • {metaTx.store_name}</span>
                                )}
                              </span>
                              <span className="text-[10px] text-amber-400 font-bold font-mono">
                                {s.totalAmount.toFixed(2)} ETB
                              </span>
                            </div>
                            {s.installments.map(inst => (
                              <div key={inst.installmentNo} className="flex justify-between items-center text-xs py-1.5 px-2 bg-slate-950/60 rounded-lg border border-slate-800/80 font-mono">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-bold flex items-center justify-center">
                                    #{inst.installmentNo}
                                  </span>
                                  <span className="text-slate-200">Due Date: {inst.dueDate}</span>
                                </div>
                                <span className="text-amber-400 font-bold">{inst.amount.toFixed(2)} ETB</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2.5 max-h-60 overflow-y-auto">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                        <h4 className="text-xs font-bold text-emerald-400">Installment Breakdown:</h4>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {scheduleResult.installments.length} Installments
                        </span>
                      </div>
                      {scheduleResult.installments.map(inst => (
                        <div key={inst.installmentNo} className="flex justify-between items-center text-xs py-1.5 px-2 bg-slate-950/60 rounded-lg border border-slate-800/80 font-mono">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-bold flex items-center justify-center">
                              #{inst.installmentNo}
                            </span>
                            <span className="text-slate-200">Due Date: {inst.dueDate}</span>
                          </div>
                          <span className="text-amber-400 font-bold">{inst.amount.toFixed(2)} ETB</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 8. Customer Confirm */}
                  <button
                    onClick={handleApplySchedule}
                    disabled={applyingSchedule}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {applyingSchedule
                        ? 'Confirming...'
                        : isBulkSchedule
                        ? `Confirm & Apply to ${scheduleResult.schedules.length} Receipts`
                        : 'Customer Confirm & Apply Schedule'}
                    </span>
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  setScheduleModalOpen(false);
                  setScheduleResult(null);
                }}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerts Warnings Modal */}
      {alertsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-lg rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-4">
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
                  const isOverdue = n.type === 'OVERDUE_ALERT';
                  const isReminder = n.type === 'REMINDER';
                  return (
                    <div
                      key={n.id}
                      className={`p-3.5 rounded-xl border flex gap-3 items-start transition-all ${
                        isOverdue
                          ? 'bg-red-500/10 border-red-500/20 text-red-200'
                          : isReminder
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isOverdue ? (
                          <AlertCircle className="w-4 h-4 text-red-400 animate-pulse" />
                        ) : (
                          <Bell className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider font-extrabold">
                          <span className={isOverdue ? 'text-red-400' : isReminder ? 'text-amber-400' : 'text-slate-400'}>
                            {n.type === 'OVERDUE_ALERT' && '⚠️ Critical Overdue Warning'}
                            {n.type === 'REMINDER' && '📅 Repayment Reminder'}
                            {n.type === 'CREDIT_ISSUED' && '💳 New Credit Logged'}
                            {n.type === 'PAYMENT_RECEIPT' && '🧾 Payment Receipt Confirmed'}
                            {!['OVERDUE_ALERT', 'REMINDER', 'CREDIT_ISSUED', 'PAYMENT_RECEIPT'].includes(n.type) && '💬 Store Alert'}
                          </span>
                          <span className="text-slate-500 font-normal normal-case">
                            {new Date(n.sent_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed font-sans">{n.message}</p>
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
