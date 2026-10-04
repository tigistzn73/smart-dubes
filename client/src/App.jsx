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
    <div className="w-full p-0 px-0.5 md:px-1 pt-0 flex flex-col lg:flex-1 lg:min-h-0">
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
    <div className={`min-h-screen lg:h-screen lg:overflow-hidden ${activeTheme.bgClass} ${activeTheme.id === 'light' ? 'text-slate-900' : 'text-slate-100'} flex flex-col transition-colors duration-500`}>
      <Navbar />
      {/* Below lg this simply grows and the page scrolls. At lg the panels size
          themselves to the space left under the navbar, so this is a safety net
          rather than the main scrollbar: if a panel ever outgrows its box, the
          content is still reachable instead of being clipped by the frame. */}
      <main className="flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
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
