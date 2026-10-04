import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  ShieldCheck,
  Building,
  Activity,
  FileCheck,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Server,
  Lock,
  Layers,
  Send,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Menu,
  Maximize2,
  Minimize2,
  AlertCircle
} from 'lucide-react';
import { getErrorMessage } from '../utils/errorHelper';

export const AdminDashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [gatewayLogs, setGatewayLogs] = useState([]);
  const { lang } = useTheme();
  const t = (en, am) => (lang === 'EN' ? en : am);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD | KYC | GATEWAYS | AUDIT_LOGS
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  // Sync fullscreen state
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  // Listen for mobile sidebar toggle and tab switch from Navbar
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

  // Webhook Test Form
  const [testGateway, setTestGateway] = useState('TELEBIRR');
  const [webhookMessage, setWebhookMessage] = useState('');
  const [adminError, setAdminError] = useState('');

  const token = localStorage.getItem('smart_dube_token');

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [dRes, gRes, aRes] = await Promise.all([
        fetch('/api/admin/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/gateways', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/audit-logs', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const dData = await dRes.json();
      const gData = await gRes.json();
      const aData = await aRes.json();

      setData(dData);
      setGatewayLogs(gData.logs || []);
      setAuditLogs(aData.logs || []);
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyKYC = async (merchantId, status) => {
    let notes = `Verified by System Admin on ${new Date().toLocaleDateString()}`;
    if (status === 'REJECTED') {
      const reason = prompt('Please enter the rejection reason:');
      if (reason === null) return; // Cancelled
      if (!reason.trim()) {
        setAdminError(t('Rejection reason is required.', 'ውድቅ የተደረገበት ምክንያት ያስፈልጋል።'));
        return;
      }
      notes = reason.trim();
    }

    setAdminError('');
    try {
      const res = await fetch(`/api/admin/kyc/${merchantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, notes })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(resData, 'Failed to update KYC status'));

      fetchAdminData();
    } catch (err) {
      setAdminError(getErrorMessage(err));
    }
  };

  const handleTriggerWebhook = async () => {
    setAdminError('');
    try {
      const res = await fetch('/api/admin/webhook-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          gateway: testGateway,
          payload: { event: 'PAYMENT_SETTLEMENT_TEST', timestamp: new Date().toISOString(), status: 'SUCCESS' }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Webhook simulation failed'));
      setWebhookMessage(`Simulated ${testGateway} Webhook event dispatched!`);
      setTimeout(() => setWebhookMessage(''), 4000);
      fetchAdminData();
    } catch (err) {
      setAdminError(getErrorMessage(err));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const metrics = data?.metrics || {};
  const merchants = data?.merchants || [];

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

    const txs = data?.transactions || [];
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
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <span className="font-extrabold text-sm text-slate-100">{t('Admin Menu', 'የአድሚን ምናሌ')}</span>
                  </div>
                  <button
                    onClick={() => setMobileSidebarOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="flex flex-col gap-2">
                  <button
                    onClick={() => { setActiveTab('DASHBOARD'); setMobileSidebarOpen(false); }}
                    className={`w-full p-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 border cursor-pointer ${
                      activeTab === 'DASHBOARD'
                        ? 'bg-slate-800 text-purple-400 border-slate-700 shadow-md'
                        : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-850'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    <span>{t('Dashboard', 'ዳሽቦርድ')}</span>
                  </button>

                  {[
                    { id: 'KYC', name: t('Merchant Verification', 'የነጋዴዎች ማረጋገጫ'), icon: Building, count: merchants.length },
                    { id: 'GATEWAYS', name: t('Gateway Monitor', 'የክፍያ መተላለፊያ መከታተያ'), icon: Server },
                    { id: 'AUDIT_LOGS', name: t('System Audit Trail', 'የስርዓት ኦዲት ታሪክ'), icon: Lock }
                  ].map(item => {
                    const isActive = activeTab === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id); setMobileSidebarOpen(false); }}
                        className={`w-full p-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                          isActive
                            ? 'bg-slate-800 text-purple-400 border-slate-700 shadow-md'
                            : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4" />
                          <span>{item.name}</span>
                        </div>
                        {item.count !== undefined && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-950 text-slate-400">
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-800 text-[10px] text-slate-500 text-center">
                Smart Dube Administration • Production
              </div>
            </aside>
          </div>
        )}

        {/* LEFT SIDEBAR NAVIGATION (DESKTOP ONLY) */}
        <aside className={`hidden md:flex ${sidebarCollapsed ? 'w-[68px]' : 'w-60'} flex-shrink-0 glass-panel rounded-2xl p-2 md:p-3 flex-col justify-start border border-slate-800 md:fixed md:left-0 md:top-[var(--nav-h,52px)] md:bottom-0 md:z-30 overflow-y-auto transition-all duration-300`}>
          <div className="space-y-3 md:space-y-4 w-full">
            {/* Header Toggle */}
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} pb-2 border-b border-slate-850`}>
              <span className={`hidden ${sidebarCollapsed ? '' : 'md:inline'} text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono`}>Nav</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  title={isFullscreen ? t('Exit Fullscreen', 'ከሙሉ ገጽ ውጣ') : t('Fullscreen', 'ሙሉ ገጽ')}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4 text-emerald-400" /> : <Maximize2 className="w-4 h-4 text-sky-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  title={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <nav className="flex flex-col gap-2 md:gap-1.5 w-full">
              {/* Dashboard Link */}
              <button
                onClick={() => setActiveTab('DASHBOARD')}
                className={`w-full p-2 md:px-3 md:py-2.5 ${sidebarCollapsed ? 'md:justify-center' : 'justify-center md:justify-between'} rounded-xl text-xs font-bold transition-all flex items-center border cursor-pointer ${
                  activeTab === 'DASHBOARD'
                    ? 'bg-slate-800/80 text-purple-400 border-slate-700/60 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-900/40'
                }`}
                title={t('Dashboard', 'ዳሽቦርድ')}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span className={`hidden ${sidebarCollapsed ? '' : 'md:inline'} whitespace-nowrap`}>{t('Dashboard', 'ዳሽቦርድ')}</span>
                </div>
              </button>

              {[
                { id: 'KYC', name: t('Merchant Verification', 'የነጋዴዎች ማረጋገጫ'), icon: Building, count: merchants.length },
                { id: 'GATEWAYS', name: t('Gateway Monitor', 'የክፍያ መተላለፊያ መከታተያ'), icon: Server },
                { id: 'AUDIT_LOGS', name: t('System Audit Trail', 'የስርዓት ኦዲት ታሪክ'), icon: Lock }
              ].map(item => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full p-2 md:px-3 md:py-2.5 ${sidebarCollapsed ? 'md:justify-center' : 'justify-center md:justify-between'} rounded-xl text-xs font-bold transition-all flex items-center border cursor-pointer ${
                      isActive
                        ? 'bg-slate-800/80 text-purple-400 border-slate-700/60 shadow-md'
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
                        isActive ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-950/60 text-slate-500'
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
          {/* Top Banner Card for Admin */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-panel p-4 rounded-xl border border-slate-800/80 shadow-md">
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-extrabold text-slate-100 tracking-tight">
                  Smart Dube Platform Administration
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  ROLE: SYSTEM ADMIN
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                Administrator: {user?.fullName || 'Root Admin'} &bull; Environment: Production &bull; National BNPL Infrastructure
              </div>
            </div>
          </div>

          {adminError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-between gap-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{adminError}</span>
              </div>
              <button onClick={() => setAdminError('')} className="text-red-400 hover:text-white text-xs font-bold px-2 py-0.5 rounded cursor-pointer">
                ✕
              </button>
            </div>
          )}

          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              {/* Metrics Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase">{t('Pending KYC Reviews', 'የሚጠባበቁ የነጋዴዎች ማረጋገጫ')}</p>
                      <h3 className="text-2xl font-extrabold text-amber-400 mt-1">{metrics.pendingKycCount || 0}</h3>
                    </div>
                    <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
                      <Clock className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase">{t('Registered Merchants', 'የተመዘገቡ ነጋዴዎች')}</p>
                      <h3 className="text-2xl font-extrabold text-purple-400 mt-1">{metrics.totalMerchants || 0}</h3>
                    </div>
                    <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl">
                      <Building className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase">{t('Total Dube Volume', 'አጠቃላይ የዱቤ ልውውጥ መጠን')}</p>
                      <h3 className="text-2xl font-extrabold text-emerald-400 mt-1">{(metrics.totalDubeIssued || 0).toFixed(2)} ETB</h3>
                    </div>
                    <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                      <Activity className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase">{t('Total Repayments', 'አጠቃላይ የተመለሰ ክፍያ')}</p>
                      <h3 className="text-2xl font-extrabold text-sky-400 mt-1">{(metrics.totalRepayments || 0).toFixed(2)} ETB</h3>
                    </div>
                    <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl">
                      <FileCheck className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Sales Trend Line Graph */}
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                    {t('System-wide Weekly Dube Transaction Trend', 'አጠቃላይ የሳምንታዊ የዱቤ ልውውጥ እንቅስቃሴ')}
                  </h4>
                  <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                    {t('Last 7 Days', 'ያለፉት 7 ቀናት')}
                  </span>
                </div>
                <div className="relative pt-4">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32 overflow-visible">
                    <defs>
                      <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#A855F7" stopOpacity="0.25"/>
                        <stop offset="100%" stopColor="#A855F7" stopOpacity="0"/>
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
                    {areaD && <path d={areaD} fill="url(#chart-gradient)" />}

                    {/* Line path */}
                    {pathD && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#A855F7"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-[0_0_6px_rgba(168,85,247,0.3)]"
                      />
                    )}

                    {/* Chart Points & Labels */}
                    {chartPoints.map((p, idx) => (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="4"
                          className="fill-purple-400 stroke-slate-900 stroke-2 hover:r-5 transition-all"
                        />
                        {p.sales > 0 && (
                          <text
                            x={p.x}
                            y={p.y - 10}
                            textAnchor="middle"
                            className="text-[9px] fill-purple-300 font-mono font-bold"
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

              {/* Welcome/Quick Guide Card */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 text-xs text-slate-400 space-y-2">
                <p className="font-bold text-slate-200">{t('Welcome to the Smart Dube Administration Portal!', 'እንኳን ወደ ስማርት ዱቤ አስተዳዳሪ ገጽ በደህና መጡ!')}</p>
                <p>
                  {t('Use the left sidebar navigation to review merchant application licenses, monitor system payment gateways, and view the system audit trail.', 'የግራ የጎን ምናሌን በመጠቀም የነጋዴዎችን ፈቃድ ማረጋገጥ፣ የክፍያ መተላለፊያዎችን መቆጣጠር እና የስርዓት ኦዲት መረጃዎችን መመልከት ይችላሉ።')}
                </p>
              </div>
            </div>
          )}

      {/* TAB 1: MERCHANT KYC VERIFICATION */}
      {activeTab === 'KYC' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800">
          <h3 className="text-base font-extrabold text-slate-100 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-400" />
            {t('Merchant KYC & Business License Verification Queue', 'የነጋዴዎች የ KYC እና የንግድ ፈቃድ ማረጋገጫ ወረፋ')}
          </h3>

          <div className="space-y-4">
            {merchants.map(m => (
              <div
                key={m.id}
                className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-extrabold text-slate-100 text-sm">{m.store_name}</h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        m.kyc_status === 'VERIFIED'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : m.kyc_status === 'REJECTED'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {m.kyc_status === 'VERIFIED' ? t('VERIFIED', 'የተረጋገጠ') : m.kyc_status === 'REJECTED' ? t('REJECTED', 'ውድቅ የተደረገ') : t('PENDING', 'በመጠባበቅ ላይ')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    {t('Owner:', 'ባለቤት፦')} <span className="text-slate-200 font-semibold">{m.owner_name}</span> ({m.phone})
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-400 pt-1">
                    <span>{t('License No:', 'የንግድ ፈቃድ ቁጥር፦')} <strong className="text-yellow-400">{m.business_license_no}</strong></span>
                    <span>{t('Fayda ID:', 'የፋይዳ መታወቂያ፦')} <strong className="text-sky-400">{m.fayda_id}</strong></span>
                    <span>{t('Address:', 'አድራሻ፦')} {m.address}</span>
                  </div>
                  {m.kyc_status === 'REJECTED' && m.kyc_notes && (
                    <div className="mt-2 text-xs bg-red-500/10 text-red-400 border border-red-500/20 p-2 rounded-lg flex items-start gap-1.5 max-w-lg">
                      <span className="font-black uppercase text-[9px] bg-red-500/20 px-1.5 py-0.5 rounded tracking-wider shrink-0 mt-0.5">{t('REASON', 'ምክንያት')}</span>
                      <span className="font-semibold text-slate-300">{m.kyc_notes}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto">
                  <button
                    onClick={() => handleVerifyKYC(m.id, 'VERIFIED')}
                    disabled={m.kyc_status === 'VERIFIED'}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white text-xs font-bold border border-emerald-500/30 transition-all flex items-center gap-1 disabled:opacity-40"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t('Approve', 'አጽድቅ')}</span>
                  </button>

                  <button
                    onClick={() => handleVerifyKYC(m.id, 'REJECTED')}
                    disabled={m.kyc_status === 'REJECTED'}
                    className="px-3.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold border border-red-500/30 transition-all flex items-center gap-1 disabled:opacity-40"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{t('Reject', 'ውድቅ አድርግ')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: PAYMENT GATEWAY MONITOR */}
      {activeTab === 'GATEWAYS' && (
        <div className="space-y-6">
          {/* Simulator Controls */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-sky-400" />
                {t('Live Payment Gateway Webhook Dispatcher', 'የቀጥታ ክፍያ ማስተላለፊያ ዌብሁክ አስጀማሪ')}
              </h4>
              <p className="text-xs text-slate-400">{t('Trigger sandbox payment notifications for Telebirr, Chapa, or CBE Birr', 'ለቴሌብር፣ ቻፓ ወይም ሲቢኢ ብር የሙከራ ክፍያ ማሳወቂያዎችን ያስነሱ')}</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={testGateway}
                onChange={e => setTestGateway(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold"
              >
                <option value="TELEBIRR">{t('Telebirr Gateway', 'የቴሌብር በር')}</option>
                <option value="CHAPA">{t('Chapa Pay', 'ቻፓ ክፍያ')}</option>
                <option value="CBE_BIRR">{t('CBE Birr', 'ሲቢኢ ብር')}</option>
              </select>

              <button
                onClick={handleTriggerWebhook}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/20 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('Fire Webhook', 'ዌብሁክ አስነሳ')}</span>
              </button>
            </div>
          </div>

          {webhookMessage && (
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold">
              {webhookMessage}
            </div>
          )}

          {/* Webhook logs feed */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800">
            <h3 className="text-base font-extrabold text-slate-100 mb-4">{t('Gateway API Traffic & Event Stream', 'የክፍያ መተላለፊያ API ትራፊክ እና የክስተት ፍሰት')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono">
                    <th className="pb-2">{t('Gateway', 'ክፍያ መተላለፊያ')}</th>
                    <th className="pb-2">{t('Event Type', 'የክስተት አይነት')}</th>
                    <th className="pb-2">{t('Payload Details', 'የመረጃ ዝርዝሮች')}</th>
                    <th className="pb-2">{t('Status', 'ሁኔታ')}</th>
                    <th className="pb-2">{t('Timestamp', 'ጊዜ ማህተም')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono">
                  {gatewayLogs.map(l => (
                    <tr key={l.id}>
                      <td className="py-2.5 font-bold text-sky-400">{l.gateway_name}</td>
                      <td className="py-2.5 text-yellow-400">{l.event_type}</td>
                      <td className="py-2.5 text-slate-400 truncate max-w-xs">{l.payload_json}</td>
                      <td className="py-2.5 text-emerald-400 font-bold">{l.response_status}</td>
                      <td className="py-2.5 text-slate-500">{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL LOG */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800">
          <h3 className="text-base font-extrabold text-slate-100 mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            {t('Immutable Financial & Security Audit Log Explorer', 'የማይለወጥ የፋይናንስ እና የደህንነት ኦዲት መዝገብ መግለጫ')}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">{t('Actor Name', 'ፈጻሚው አካል')}</th>
                  <th className="pb-2">{t('Action', 'ድርጊት')}</th>
                  <th className="pb-2">{t('Target Resource', 'የተነካው መረጃ')}</th>
                  <th className="pb-2">{t('IP Address', 'የአይፒ አድራሻ')}</th>
                  <th className="pb-2">{t('Timestamp', 'ጊዜ ማህተም')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {auditLogs.map(a => (
                  <tr key={a.id}>
                    <td className="py-2.5 font-mono text-slate-500">#{a.id}</td>
                    <td className="py-2.5 font-semibold text-slate-100">{a.actor_name}</td>
                    <td className="py-2.5 font-mono font-bold text-emerald-400">{a.action}</td>
                    <td className="py-2.5 text-slate-300 font-mono">{a.resource}</td>
                    <td className="py-2.5 text-slate-400 font-mono">{a.ip_address}</td>
                    <td className="py-2.5 text-slate-500 font-mono">{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};
