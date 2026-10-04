import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { MerchantDashboard } from './pages/MerchantDashboard';
import { CustomerPortal } from './pages/CustomerPortal';
import { AdminDashboard } from './pages/AdminDashboard';

const MainContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const role = (user.role || '').toUpperCase();

  return (
    <div className="w-full p-0 px-0.5 md:px-1 pt-0 flex flex-col">
      {role === 'MERCHANT' && <MerchantDashboard />}
      {role === 'CUSTOMER' && <CustomerPortal />}
      {role === 'ADMIN' && <AdminDashboard />}
      {role !== 'MERCHANT' && role !== 'CUSTOMER' && role !== 'ADMIN' && (
        <Login />
      )}
    </div>
  );
};

const AppContainer = () => {
  const { activeTheme } = useTheme();

  return (
    <div className={`min-h-screen ${activeTheme.bgClass} ${activeTheme.id === 'light' ? 'text-slate-900' : 'text-slate-100'} flex flex-col transition-colors duration-500`}>
      <Navbar />
      {/* The document itself is the scrollbar. An earlier version pinned the
          shell to lg:h-screen + lg:overflow-hidden and scrolled an inner pane
          instead, which left the window with nothing to scroll and made it look
          like the page was stuck. Pages now grow naturally and the browser
          scrolls them; only the sidebars scroll internally. */}
      <main className="flex flex-col">
        <MainContent />
      </main>
    </div>
  );
};

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppContainer />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
