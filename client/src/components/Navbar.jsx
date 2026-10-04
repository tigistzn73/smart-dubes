import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeChooser';
import { SettingsModal } from './SettingsModal';
import { useTheme } from '../context/ThemeContext';
import {
  LogOut,
  Settings,
  ChevronDown,
  User,
  ShieldCheck,
  Store,
  Bell,
  Menu,
  X,
  Wallet,
  LayoutDashboard,
  PlusCircle,
  ShoppingBag,
  Users,
  FileText,
  Upload,
  Receipt,
  CheckCircle2,
  Building,
  Server,
  Lock,
  Maximize2,
  Minimize2
} from 'lucide-react';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const { lang, setLang } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const menuRef = useRef(null);
  const headerRef = useRef(null);

  const t = (en, am) => (lang === 'EN' ? en : am);

  // Publish the real navbar height as --nav-h so the sticky sidebars can park
  // exactly underneath it. It is not a fixed number: the header grows and
  // shrinks with the viewport (the subtitle is sm:block only) and with the
  // controls shown for guest/merchant/customer/admin.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const publish = () => {
      const h = Math.round(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--nav-h', `${h}px`);
    };

    publish();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', publish);
      return () => window.removeEventListener('resize', publish);
    }

    const ro = new ResizeObserver(publish);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

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

  // Listen for unread count updates
  useEffect(() => {
    const handleUpdateAlerts = (e) => {
      if (e.detail && typeof e.detail.count === 'number') {
        setUnreadAlertsCount(e.detail.count);
      }
    };
    const handleOpenDrawer = () => setMobileDrawerOpen(true);
    window.addEventListener('update-unread-alerts', handleUpdateAlerts);
    window.addEventListener('open-mobile-drawer', handleOpenDrawer);
    return () => {
      window.removeEventListener('update-unread-alerts', handleUpdateAlerts);
      window.removeEventListener('open-mobile-drawer', handleOpenDrawer);
    };
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavClick = (tabId) => {
    window.dispatchEvent(new CustomEvent('switch-tab', { detail: { tab: tabId } }));
    setMobileDrawerOpen(false);
  };

  const role = (user?.role || '').toUpperCase();

  const getRoleNavItems = () => {
    if (role === 'MERCHANT') {
      return [
        { id: 'DASHBOARD', name: t('Dashboard Home', 'ዳሽቦርድ መነሻ'), icon: LayoutDashboard },
        { id: 'NEW_CUSTOMER', name: t('New Credit Profile', 'አዲስ የዱቤ ፕሮፋይል'), icon: PlusCircle },
        { id: 'LOG_SALE', name: t('Log Dube Sale', 'የዱቤ ሽያጭ መዝግብ'), icon: ShoppingBag },
        { id: 'CUSTOMERS', name: t('Customer Ledgers', 'የደንበኞች ሌጀር'), icon: Users },
        { id: 'TRANSACTIONS', name: t('Credit History', 'የዱቤ ታሪክ'), icon: FileText },
        { id: 'RECEIPT_APPROVALS', name: t('Receipt Approvals', 'ደረሰኝ ማጽደቂያ'), icon: Upload }
      ];
    }
    if (role === 'CUSTOMER') {
      return [
        { id: 'DASHBOARD', name: t('Dashboard Home', 'ዳሽቦርድ መነሻ'), icon: Wallet },
        { id: 'MERCHANTS', name: t('Linked Merchants', 'የተገናኙ ነጋዴዎች'), icon: Store },
        { id: 'TRANSACTIONS', name: t('Pending Dube Receipts', 'ያልተከፈሉ ደረሰኞች'), icon: Receipt },
        { id: 'REPAYMENTS', name: t('Settlement History', 'የክፍያ ታሪክ'), icon: CheckCircle2 }
      ];
    }
    if (role === 'ADMIN') {
      return [
        { id: 'DASHBOARD', name: t('Admin Dashboard', 'የአድሚን ዳሽቦርድ'), icon: LayoutDashboard },
        { id: 'KYC', name: t('Merchant Verification', 'የነጋዴዎች ማረጋገጫ'), icon: Building },
        { id: 'GATEWAYS', name: t('Gateway Monitor', 'የክፍያ መተላለፊያ መከታተያ'), icon: Server },
        { id: 'AUDIT_LOGS', name: t('System Audit Trail', 'የስርዓት ኦዲት ታሪክ'), icon: Lock }
      ];
    }
    return [];
  };

  const navItems = getRoleNavItems();

  return (
    <>
      {/* GLOBAL SLIDE-OUT MOBILE NAVIGATION DRAWER */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-[9999] flex animate-fade-in">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Slide-out Panel */}
          <aside className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-700/80 p-5 flex flex-col justify-start h-full z-[10000] shadow-2xl overflow-y-auto">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-yellow-500 p-0.5 flex items-center justify-center">
                    <div className="w-full h-full bg-slate-900 rounded-[6px] flex items-center justify-center font-bold text-xs text-yellow-400">
                      ET
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Smart Dube</h3>
                    <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase">{user?.role || 'Guest'} Navigation</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Profile Card in Drawer */}
              {user && (
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center gap-3">
                  <img
                    src={user.photo_url || user.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName || 'User')}`}
                    alt={user.fullName}
                    className="w-10 h-10 rounded-full object-cover border border-emerald-500/40 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-200 truncate">{user.fullName}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{user.phone}</p>
                  </div>
                </div>
              )}

              {/* Navigation Items List */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono px-1">
                  {t('Menu Links', 'የምናሌ አገናኞች')}
                </p>
                <nav className="flex flex-col gap-1.5 pt-1">
                  {navItems.map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className="w-full p-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 border border-slate-800/80 bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-emerald-400 hover:border-emerald-500/30 cursor-pointer shadow-sm active:scale-[0.98]"
                      >
                        <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-left flex-1">{item.name}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Language & Theme Controls */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase font-mono">
                  <span>{t('Language', 'ቋንቋ')}</span>
                  <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setLang('EN')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${lang === 'EN' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => setLang('AM')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${lang === 'AM' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
                    >
                      እማ
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions. mt-auto rather than justify-between on the aside:
                space-between pushes the first child above the scroll origin when
                the drawer is shorter than its content, which makes the top of the
                menu impossible to scroll back to. */}
            <div className="mt-auto pt-4 border-t border-slate-800 space-y-2">
              <button
                onClick={() => {
                  toggleFullscreen();
                  setMobileDrawerOpen(false);
                }}
                className="w-full p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 border border-slate-700/60 transition-all cursor-pointer"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4 text-emerald-400" /> : <Maximize2 className="w-4 h-4 text-sky-400" />}
                <span>{isFullscreen ? t('Exit Fullscreen', 'ከሙሉ ገጽ ውጣ') : t('Fullscreen Mode', 'ሙሉ ገጽ ሁነታ')}</span>
              </button>

              <button
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setSettingsOpen(true);
                }}
                className="w-full p-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 border border-slate-700/60 transition-all cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>{t('Profile & Settings', 'የግል መረጃ እና ማስተካከያ')}</span>
              </button>

              <button
                onClick={() => {
                  setMobileDrawerOpen(false);
                  logout();
                }}
                className="w-full p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('Sign Out', 'ውጣ')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <header ref={headerRef} className="navbar-header sticky top-0 z-40 border-b border-slate-800 px-2 py-1.5 flex items-center justify-between transition-colors duration-300">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-ethiopia-green via-ethiopia-yellow to-ethiopia-red p-0.5 shadow-lg glow-accent flex items-center justify-center">
              <div className="w-full h-full bg-[#051026] rounded-[10px] flex items-center justify-center font-black text-sm text-yellow-400 tracking-wider">
                ET
              </div>
            </div>
            {user && (
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="w-10 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-750 text-emerald-400 border border-slate-700/60 transition-all md:hidden cursor-pointer flex items-center justify-center shadow-md active:scale-95"
                title="Open Navigation Menu"
              >
                <Menu className="w-4 h-4 text-emerald-400" />
              </button>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-emerald-400 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
                Smart Dube
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                BNPL Digital Ledger
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Neighborhood Credit System • Ethiopia</p>
          </div>
        </div>

        {/* Right Controls: Inbox Alerts & Customer Profile Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Guest Landing Language & Theme Controls */}
          {!user && (
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/60 shadow-md">
                <button
                  onClick={() => setLang('EN')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                    lang === 'EN'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLang('AM')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                    lang === 'AM'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  እማ
                </button>
              </div>
            </div>
          )}

          {/* Inbox Alerts Notification Button (Customer Portal) */}
          {user && user.role === 'CUSTOMER' && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-inbox-alerts'))}
              className="relative px-2.5 py-1.5 rounded-xl border border-slate-700/60 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 hover:text-white transition-all flex items-center gap-2 cursor-pointer shadow-md text-xs font-bold"
              title="Inbox Alerts"
            >
              <div className="relative">
                <Bell className="w-4 h-4 text-amber-400" />
                {unreadAlertsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-extrabold flex items-center justify-center animate-pulse">
                    {unreadAlertsCount}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline">Inbox Alerts</span>
            </button>
          )}

          {/* Theme toggle — always visible, guests and signed in alike */}
          <ThemeToggle />

          {/* User Profile Button with Integrated Theme Chooser */}
          {user && (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Dropdown Menu Container with Customer Photo & Name */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all duration-200 text-xs font-bold text-slate-200 cursor-pointer shadow-md group ${
                    menuOpen
                      ? 'bg-slate-800 border-emerald-500/60 ring-2 ring-emerald-500/20 shadow-emerald-500/10'
                      : 'bg-slate-800/80 hover:bg-slate-750 border-slate-700/60 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 hover:ring-1 hover:ring-emerald-500/30'
                  } border`}
                  title="Account, Theme & Settings"
                >
                  <img
                    src={user.photo_url || user.photoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName || 'User')}`}
                    alt={user.fullName}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName || 'User')}`;
                    }}
                    className="w-6 h-6 rounded-full object-cover border border-emerald-500/40 group-hover:border-emerald-400 bg-slate-800 shrink-0 shadow-sm transition-all group-hover:scale-105"
                  />
                  <div className="text-left hidden sm:block">
                    <p className="font-semibold text-slate-200 group-hover:text-white text-xs leading-none truncate max-w-[130px] transition-colors">{user.fullName}</p>
                    <p className="text-[8.5px] text-emerald-400 font-mono font-bold uppercase mt-0.5 leading-none">{user.role}</p>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition-transform duration-200 shrink-0 ${menuOpen ? 'rotate-180 text-emerald-400' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 space-y-1.5 z-50 animate-fade-in">
                    {/* User Summary Header */}
                    <div className="px-3 py-2 border-b border-slate-800">
                      <p className="text-xs font-bold text-slate-200 truncate">{user.fullName}</p>
                      <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase">{user.role}</p>
                    </div>

                    {/* Profile & Settings Button */}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setSettingsOpen(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold text-slate-200 hover:bg-emerald-500/15 hover:text-emerald-300 border border-transparent hover:border-emerald-500/30 flex items-center gap-2.5 transition-all cursor-pointer group shadow-sm"
                    >
                      <User className="w-4 h-4 text-emerald-400 group-hover:scale-110 group-hover:text-emerald-300 transition-transform" />
                      <span>{lang === 'EN' ? 'My Profile & Settings' : 'የግል መረጃ እና ማስተካከያ'}</span>
                    </button>

                    {/* Logout Button */}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                      className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold text-red-400 hover:bg-red-500/15 hover:text-red-300 border border-transparent hover:border-red-500/30 flex items-center gap-2.5 transition-all cursor-pointer group shadow-sm"
                    >
                      <LogOut className="w-4 h-4 text-red-400 group-hover:scale-110 group-hover:text-red-300 transition-transform" />
                      <span>{lang === 'EN' ? 'Logout' : 'ውጣ'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
};
