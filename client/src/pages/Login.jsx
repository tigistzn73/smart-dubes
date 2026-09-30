import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Store,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  Lock,
  Phone,
  UserPlus,
  KeyRound,
  Mail,
  MapPin,
  CreditCard,
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Eye,
  EyeOff,
  Upload
} from 'lucide-react';

export const Login = () => {
  const { loginWithToken, switchDemoRole, register, forgotPassword, resetPassword } = useAuth();
  const { lang, setLang } = useTheme();
  const t = (en, am) => (lang === 'EN' ? en : am);

  // Auth View: SIGN_IN | REGISTER | FORGOT_PASSWORD | RESET_PASSWORD
  const [authView, setAuthView] = useState('SIGN_IN');

  // Sign In State
  const [phone, setPhone] = useState('+251911223344');
  const [password, setPassword] = useState('merchant123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Registration Form State
  const [regForm, setRegForm] = useState({
    fullName: '',
    phone: '+251',
    email: '',
    role: 'MERCHANT',
    password: '',
    confirmPassword: '',
    faydaId: 'FYD-',
    storeName: '',
    businessLicenseNo: '',
    address: 'Addis Ababa',
    photoUrl: ''
  });
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Forgot Password State
  const [forgotPhone, setForgotPhone] = useState('+251');
  const [demoOTP, setDemoOTP] = useState('');

  // Reset Password State
  const [resetPhone, setResetPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // ========== SIGN IN ==========
  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });
      
      let data = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error('Unable to connect to Smart Dube backend server. Please verify the server is active.');
      }
      
      if (!res.ok) throw new Error(data.error || 'Login failed. Please check your credentials.');
      loginWithToken(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Image Upload Handler for Customer Registration
  const handleCustomerPhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo file size must be less than 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setRegForm(prev => ({ ...prev, photoUrl: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // ========== REGISTER ==========
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (regForm.password !== regForm.confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (regForm.password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    try {
      await register({
        fullName: regForm.fullName,
        phone: regForm.phone,
        email: regForm.email || undefined,
        role: regForm.role,
        password: regForm.password,
        faydaId: regForm.faydaId,
        storeName: regForm.role === 'MERCHANT' ? (regForm.storeName || undefined) : undefined,
        businessLicenseNo: regForm.role === 'MERCHANT' ? (regForm.businessLicenseNo || undefined) : undefined,
        address: regForm.role === 'MERCHANT' ? (regForm.address || undefined) : undefined,
        photoUrl: regForm.role === 'CUSTOMER' ? (regForm.photoUrl || undefined) : undefined
      });
      
      setSuccess('Registration successful! Redirecting to sign in...');
      setPhone(regForm.phone);
      setPassword('');
      
      setTimeout(() => {
        setAuthView('SIGN_IN');
        setSuccess('');
      }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ========== FORGOT PASSWORD ==========
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDemoOTP('');

    try {
      const data = await forgotPassword(forgotPhone);
      setSuccess(data.message);
      setDemoOTP(data._demoOTP || '');
      // Auto-fill reset form
      setResetPhone(forgotPhone);
      setOtpCode(data._demoOTP || '');
      // Switch to reset view after 2s
      setTimeout(() => {
        setAuthView('RESET_PASSWORD');
        setSuccess('');
      }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ========== RESET PASSWORD ==========
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    try {
      await resetPassword(resetPhone, otpCode, newPassword);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Clear messages on view switch
  const switchView = (view) => {
    setAuthView(view);
    setError('');
    setSuccess('');
    setDemoOTP('');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-4 px-4 overflow-hidden">

      <div className="w-full max-w-md space-y-3.5">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
            {t('Smart Dube Digital Ledger', 'ስማርት ዱቤ ዲጂታል ሌጀር')}
          </h1>
          <p className="text-[10px] text-slate-400">{t('Ethiopian BNPL Credit & Repayment Framework', 'የኢትዮጵያ የዱቤ ብድር እና ክፍያ ስርዓት')}</p>
        </div>



        {/* Alerts */}
        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold text-center flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold text-center flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* ======================= SIGN IN VIEW ======================= */}
        {authView === 'SIGN_IN' && (
          <div className="glass-panel px-5 py-4.5 rounded-2xl border border-slate-700/80 shadow-2xl space-y-4 bg-slate-900/90">
            <div className="text-center space-y-0.5">
              <h3 className="text-base font-extrabold text-slate-100 flex items-center justify-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                {t('Sign In to Your Account', 'ወደ መለያዎ ይግቡ')}
              </h3>
              <p className="text-[11px] text-slate-400">{t('JWT-authenticated secure login with bcrypt password verification', 'በJWT የተረጋገጠ ደህንነቱ የተጠበቀ መግቢያ')}</p>
            </div>

            <form onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">{t('Phone Number (+251):', 'የስልክ ቁጥር (+251)፦')}</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+251911..."
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-100 font-mono font-medium focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all shadow-inner"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">{t('Password:', 'የይለፍ ቃል፦')}</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-9 pr-9 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all shadow-inner"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-450 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <button
                  type="button"
                  onClick={() => switchView('FORGOT_PASSWORD')}
                  className="text-emerald-400 hover:text-emerald-300 font-bold hover:underline transition-colors cursor-pointer"
                >
                  {t('Forgot password?', 'የይለፍ ቃል ረስተዋል?')}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:via-teal-400 hover:to-emerald-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 cursor-pointer mt-1"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    {t('Authenticating...', 'በመግባት ላይ...')}
                  </span>
                ) : (
                  <>
                    <span>{t('Sign In to Smart Dube', 'ወደ ስማርት ዱቤ ይግቡ')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800">
              {t("Don't have an account?", 'መለያ የለዎትም?')}{' '}
              <button onClick={() => switchView('REGISTER')} className="text-sky-400 hover:text-sky-300 font-extrabold hover:underline transition-colors ml-1">
                {t('Register here', 'እዚህ ይመዝገቡ')}
              </button>
            </p>
          </div>
        )}

        {/* ======================= REGISTER VIEW ======================= */}
        {authView === 'REGISTER' && (
          <div className="glass-panel p-7 rounded-2xl border border-slate-700/80 shadow-2xl space-y-5 max-h-[70vh] overflow-y-auto bg-slate-900/90">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-slate-100 flex items-center justify-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                Create New Account
              </h3>
              <p className="text-xs text-slate-400">Register as a Merchant or Customer with Fayda KYC</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              {/* Role Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-2">Account Type:</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'MERCHANT', label: 'Merchant', icon: Store, activeBorder: 'border-emerald-400', activeBg: 'bg-emerald-500/20 text-emerald-300' },
                    { value: 'CUSTOMER', label: 'Customer', icon: UserCheck, activeBorder: 'border-amber-400', activeBg: 'bg-amber-500/20 text-amber-300' }
                  ].map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRegForm({ ...regForm, role: r.value })}
                      className={`p-3 rounded-xl border text-center transition-all duration-200 flex flex-col items-center gap-1.5 cursor-pointer ${
                        regForm.role === r.value
                          ? `border-2 ${r.activeBorder} ${r.activeBg} font-extrabold shadow-lg scale-[1.02]`
                          : 'border-slate-700/80 bg-slate-950/60 text-slate-300 font-semibold hover:border-slate-500 hover:bg-slate-800/80 hover:text-slate-100'
                      }`}
                    >
                      <r.icon className="w-5 h-5" />
                      <span className="text-xs">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Abebe Bikila"
                  value={regForm.fullName}
                  onChange={e => setRegForm({ ...regForm, fullName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number (+251):</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="+251911..."
                    value={regForm.phone}
                    onChange={e => setRegForm({ ...regForm, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Address <span className="text-slate-500 font-normal">(optional)</span>:
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={regForm.email}
                    onChange={e => setRegForm({ ...regForm, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Fayda ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  <span className="flex items-center gap-1">
                    <Fingerprint className="w-3.5 h-3.5 text-yellow-400" />
                    Fayda National ID:
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="FYD-1234-5678-90"
                  value={regForm.faydaId}
                  onChange={e => setRegForm({ ...regForm, faydaId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Merchant-specific Fields */}
              {regForm.role === 'MERCHANT' && (
                <div className="space-y-3 bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-500/20">
                  <p className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider">Merchant Business Details</p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Store Name:</label>
                    <div className="relative">
                      <Store className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        placeholder="e.g. Arada Neighborhood Supermarket"
                        value={regForm.storeName}
                        onChange={e => setRegForm({ ...regForm, storeName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Business License No:</label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        placeholder="e.g. BL-ADDIS-2025-0001"
                        value={regForm.businessLicenseNo}
                        onChange={e => setRegForm({ ...regForm, businessLicenseNo: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Business Address:</label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        placeholder="e.g. Bole Sub-city, Addis Ababa"
                        value={regForm.address}
                        onChange={e => setRegForm({ ...regForm, address: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Customer-specific Photo Upload Field (ONLY FOR CUSTOMER ROLE) */}
              {regForm.role === 'CUSTOMER' && (
                <div className="space-y-2 bg-sky-950/20 p-3.5 rounded-xl border border-sky-500/20">
                  <label className="block text-xs font-semibold text-slate-300">Customer Profile Photo / Avatar Image:</label>
                  <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center">
                      {regForm.photoUrl ? (
                        <img src={regForm.photoUrl} alt="Customer Preview" className="w-full h-full object-cover" />
                      ) : (
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(regForm.fullName || 'Customer')}`}
                          alt="Default Avatar"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 text-xs font-bold inline-flex items-center gap-1.5 transition-all">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{regForm.photoUrl ? 'Change Image' : 'Upload Profile Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleCustomerPhotoUpload}
                          className="hidden"
                        />
                      </label>
                      {regForm.photoUrl && (
                        <button
                          type="button"
                          onClick={() => setRegForm({ ...regForm, photoUrl: '' })}
                          className="block text-[10px] text-red-400 hover:underline cursor-pointer"
                        >
                          Remove Uploaded Photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Password:</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      placeholder="Min 6 characters"
                      value={regForm.password}
                      onChange={e => setRegForm({ ...regForm, password: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password:</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      placeholder="Repeat password"
                      value={regForm.confirmPassword}
                      onChange={e => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-sky-600 hover:from-sky-400 hover:via-blue-400 hover:to-sky-500 text-white font-extrabold text-xs shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Creating Account...
                  </span>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Account & Sign In</span>
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800">
              Already have an account?{' '}
              <button onClick={() => switchView('SIGN_IN')} className="text-emerald-400 hover:text-emerald-300 font-extrabold hover:underline transition-colors ml-1">
                Sign in
              </button>
            </p>
          </div>
        )}

        {/* ======================= FORGOT PASSWORD VIEW ======================= */}
        {authView === 'FORGOT_PASSWORD' && (
          <div className="glass-panel p-7 rounded-2xl border border-slate-700/80 shadow-2xl space-y-5 bg-slate-900/90">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-slate-100 flex items-center justify-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                Forgot Password
              </h3>
              <p className="text-xs text-slate-400">Enter your registered phone number to receive a 6-digit OTP reset PIN via SMS</p>
            </div>

            {/* Show OTP if in demo mode */}
            {demoOTP && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center space-y-2">
                <p className="text-xs text-amber-400 font-semibold">📱 SMS OTP Sent! (Demo Mode – PIN shown below)</p>
                <div className="flex items-center justify-center gap-2">
                  {demoOTP.split('').map((digit, i) => (
                    <div key={i} className="w-10 h-12 rounded-xl bg-slate-950 border border-amber-500/40 flex items-center justify-center text-xl font-extrabold text-amber-400 shadow-inner">
                      {digit}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">This PIN expires in 15 minutes. Switching to Reset view automatically...</p>
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">Registered Phone Number (+251):</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-amber-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={forgotPhone}
                    onChange={e => setForgotPhone(e.target.value)}
                    placeholder="+251911..."
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 font-mono font-medium focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-inner"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-white font-extrabold text-xs shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Sending OTP PIN...
                  </span>
                ) : (
                  <>
                    <span>Send SMS Reset PIN</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button onClick={() => switchView('SIGN_IN')} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-bold transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
              <button onClick={() => switchView('RESET_PASSWORD')} className="text-xs text-sky-400 hover:text-sky-300 font-extrabold hover:underline transition-colors">
                Already have OTP code?
              </button>
            </div>
          </div>
        )}

        {/* ======================= RESET PASSWORD VIEW ======================= */}
        {authView === 'RESET_PASSWORD' && (
          <div className="glass-panel p-7 rounded-2xl border border-slate-700/80 shadow-2xl space-y-5 bg-slate-900/90">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-slate-100 flex items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-sky-400" />
                Reset Your Password
              </h3>
              <p className="text-xs text-slate-400">Enter the 6-digit OTP PIN from your SMS and set your new password</p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">Phone Number:</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={resetPhone}
                    onChange={e => setResetPhone(e.target.value)}
                    placeholder="+251911..."
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 font-mono font-medium focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all shadow-inner"
                    required
                  />
                </div>
              </div>

              {/* OTP Code */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-2">6-Digit OTP Verification PIN:</label>
                <div className="flex items-center gap-2 justify-center">
                  {[...Array(6)].map((_, i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={1}
                      value={otpCode[i] || ''}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const newOtp = otpCode.split('');
                        newOtp[i] = val;
                        setOtpCode(newOtp.join(''));
                        if (val && e.target.nextElementSibling) {
                          e.target.nextElementSibling.focus();
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Backspace' && !otpCode[i] && e.target.previousElementSibling) {
                          e.target.previousElementSibling.focus();
                        }
                      }}
                      className="w-11 h-13 rounded-xl bg-slate-950 border border-slate-700/80 text-center text-lg font-extrabold text-amber-400 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all shadow-inner"
                    />
                  ))}
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">New Password:</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 font-medium focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all shadow-inner"
                    required
                  />
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">Confirm New Password:</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={e => setConfirmNewPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 font-medium focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all shadow-inner"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length < 6}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-sky-600 hover:from-sky-400 hover:via-blue-400 hover:to-sky-500 text-white font-extrabold text-xs shadow-lg shadow-sky-500/30 hover:shadow-sky-500/50 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Resetting Password...
                  </span>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Reset Password & Sign In</span>
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button onClick={() => switchView('FORGOT_PASSWORD')} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-bold transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Request New OTP</span>
              </button>
              <button onClick={() => switchView('SIGN_IN')} className="text-xs text-emerald-400 hover:text-emerald-300 font-extrabold hover:underline transition-colors">
                Back to Sign In
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 pt-6">
          Copyright &copy; 2022 - 2026 All Rights Reserved - Developed By Tigist Zinabu.
        </div>
      </div>
    </div>
  );
};
