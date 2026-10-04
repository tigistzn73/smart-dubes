import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Settings,
  User,
  Lock,
  Store,
  ShieldCheck,
  Bell,
  X,
  CheckCircle,
  AlertTriangle,
  KeyRound,
  FileText,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { getErrorMessage } from '../utils/errorHelper';

export const SettingsModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('PROFILE'); // PROFILE | SECURITY | BUSINESS
  const [isMinimized, setIsMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  if (!isOpen || !user) return null;

  const role = (user.role || '').toUpperCase();

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (!passwordForm.currentPassword) {
      setMessage({ type: 'ERROR', text: 'Current password is required.' });
      return;
    }

    if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
      setMessage({ type: 'ERROR', text: 'New password must be at least 6 characters.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: 'ERROR', text: 'New passwords do not match.' });
      return;
    }

    if (passwordForm.newPassword === passwordForm.currentPassword) {
      setMessage({ type: 'ERROR', text: 'New password must be different from the current one.' });
      return;
    }

    setLoading(true);
    try {
      // Someone already signed in changes their own password by proving the
      // current one. This used to POST to /reset-password with the current
      // password in the OTP field, which can never match a stored reset code,
      // so in-app password changes always failed with "Invalid OTP code".
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('smart_dube_token')}`
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update password.'));

      setMessage({ type: 'SUCCESS', text: 'Password updated successfully!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMessage({ type: 'ERROR', text: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 animate-bounce-short">
        <div className="glass-panel px-4 py-3 rounded-2xl border border-emerald-500/40 shadow-2xl bg-slate-900/95 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
            <Settings className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-slate-200">Settings Panel (Minimized)</span>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-white transition-all text-xs font-bold flex items-center gap-1 cursor-pointer"
            title="Expand Settings"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Expand</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="my-auto glass-panel w-full max-w-2xl rounded-2xl border border-slate-700/80 p-6 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto bg-slate-900/95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                Account & Portal Settings
              </h3>
              <p className="text-xs text-slate-400">Manage profile preferences, security, and dashboard configurations</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Minimize Settings"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close Settings"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
              message.type === 'ERROR'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            {message.type === 'ERROR' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('PROFILE')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'PROFILE'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <User className="w-4 h-4" />
            <span>My Profile</span>
          </button>

          <button
            onClick={() => setActiveTab('SECURITY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'SECURITY'
                ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Security & Password</span>
          </button>

          {role === 'MERCHANT' && (
            <button
              onClick={() => setActiveTab('BUSINESS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'BUSINESS'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>Store Information</span>
            </button>
          )}
        </div>

        {/* Tab 1: Profile */}
        {activeTab === 'PROFILE' && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Full Name</span>
                <p className="font-bold text-slate-200 text-sm">{user.fullName || 'N/A'}</p>
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Registered Phone</span>
                <p className="font-bold text-emerald-400 font-mono text-sm">{user.phone}</p>
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Email Address</span>
                {/* The login response does not carry the email, but /api/auth/me
                    does and AuthContext re-fetches it on every session start, so
                    the field arrives a moment after sign-in. Rendering "N/A"
                    during that window would be a lie: the address exists, it just
                    has not been fetched yet, so the gap is shown as pending
                    instead. An account with genuinely no email on file falls
                    through to "Not provided". */}
                <p className="font-bold text-sky-400 font-mono text-sm break-words">
                  {user.email === undefined ? (
                    <span className="text-slate-500 font-normal animate-pulse">Loading...</span>
                  ) : (
                    user.email || 'Not provided'
                  )}
                </p>
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Ethiopian Fayda ID</span>
                <p className="font-semibold text-amber-400 font-mono">{user.faydaId || 'FYD-VERIFIED'}</p>
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-mono">System Account Role</span>
                <p className="font-bold text-slate-200 uppercase">{user.role}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-slate-400 leading-relaxed text-[11px]">
              🛡️ <strong>Identity Verified:</strong> Your profile is tied to Ethiopian Fayda Digital ID & phone number verification. To update your legal name or phone number, please contact system administration.
            </div>
          </div>
        )}

        {/* Tab 2: Security */}
        {activeTab === 'SECURITY' && (
          <form noValidate onSubmit={handlePasswordChange} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">New Password:</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Minimum 6 characters"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Confirm New Password:</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Re-enter new password"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 focus:outline-none focus:border-sky-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Updating Password...' : 'Update Password'}</span>
            </button>
          </form>
        )}

        {/* Tab 3: Store Info (Merchants only) */}
        {activeTab === 'BUSINESS' && role === 'MERCHANT' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono">Store / Business Name</span>
                <p className="font-extrabold text-slate-100 text-sm">{user.merchant?.store_name || 'Arada Supermarket'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-mono">Business License No</span>
                  <p className="font-mono text-emerald-400 font-bold">{user.merchant?.business_license_no || 'BL-ADDIS-2024'}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-mono">KYC Verification</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {user.merchant?.kyc_status || 'VERIFIED'}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/60">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Store Address</span>
                <p className="text-slate-300 font-medium">{user.merchant?.address || 'Addis Ababa'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all cursor-pointer"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
};
