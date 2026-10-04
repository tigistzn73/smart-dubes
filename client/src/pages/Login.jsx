import React, { useState, useEffect } from 'react';
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

// Remembering the phone number is opt-in, and the password is never stored.
//
// Why the password is never stored, displayed or prefilled:
//
//   - localStorage is plain text, readable by any script on the origin and by
//     anyone with access to the machine. A password written there is not
//     protected in any way, unlike the bcrypt hash the server keeps.
//   - This file previously seeded the field with a hardcoded 'merchant123', so
//     every visitor's password box was prefilled and readable in plain text
//     before touching the keyboard.
//   - Prefilling also trains users to hit "Sign In" without reading the screen,
//     which is how a shoulder-surfer or a screen-share captures a live password.
//
// The phone number is treated differently: it is not a secret, but it is a
// permanent account pointer. Left in storage on a shared or public machine it
// tells whoever picks up the next exactly which account to target, and it is one
// more way to confirm to an attacker that a guessed phone number is registered.
// So it is only written once the user has explicitly asked for it, and un-ticking
// the box deletes it rather than merely stopping the writes.
const LAST_PHONE_KEY = 'smart_dube_last_phone';
const REMEMBER_FLAG_KEY = 'smart_dube_remember_phone';

// Deliberately shape-checked rather than trusted. localStorage is editable by
// the user and survives across app versions, so a stale or hand-edited value must
// not end up rendered into the field unchecked.
const PHONE_SHAPE = /^\+?\d[\d\s-]{6,}$/;

/**
 * Whether the user asked for their number to be remembered on this device.
 *
 * The flag itself is safe to keep in plain text: it is a boolean preference, not
 * a credential, and on its own it reveals nothing.
 */
function readRememberOptIn() {
  try {
    return window.localStorage.getItem(REMEMBER_FLAG_KEY) === '1';
  } catch {
    // Storage can throw outright in private browsing or when blocked by policy.
    // Failing to read the preference just means "not remembered", which is the
    // safe direction to fail in.
    return false;
  }
}

function writeRememberOptIn(enabled) {
  try {
    if (enabled) {
      window.localStorage.setItem(REMEMBER_FLAG_KEY, '1');
    } else {
      window.localStorage.removeItem(REMEMBER_FLAG_KEY);
    }
  } catch {
    // Same reasoning as above: a storage failure must not break sign-in.
  }
}

/** Forget the stored number. Used when the user opts out, to clear what is there. */
function forgetPhone() {
  try {
    window.localStorage.removeItem(LAST_PHONE_KEY);
  } catch {
    // Nothing to do; if storage is blocked there was nothing stored to remove.
  }
}

/**
 * The phone number to show on load.
 *
 * Returns the default unless the user previously opted in, so the remembered
 * number is never surfaced on a device where remembering was not requested.
 */
function readRememberedPhone() {
  if (!readRememberOptIn()) return '+251';
  try {
    const saved = window.localStorage.getItem(LAST_PHONE_KEY);
    return saved && PHONE_SHAPE.test(saved) ? saved : '+251';
  } catch {
    return '+251';
  }
}

/**
 * Remember the phone number after a successful sign-in.
 *
 * Callers gate this on the opt-in flag. The function still validates its input,
 * so a caller that forgets to check cannot store junk. It takes the value to
 * store as its argument and writes nothing else, so there is no code path that
 * can hand it a password.
 */
function rememberPhone(value) {
  try {
    const trimmed = String(value || '').trim();
    if (PHONE_SHAPE.test(trimmed)) {
      window.localStorage.setItem(LAST_PHONE_KEY, trimmed);
    }
  } catch {
    // Same reasoning as above: a storage failure must not break sign-in.
  }
}
import { getErrorMessage, isValidEthiopianPhone, isValidEmail } from '../utils/errorHelper';

/**
 * Whether the reset identifier is well formed.
 *
 * The reset flow is entered with an email address, but this check was written when
 * the identifier was a phone number only — so completing the flow with the address
 * the code had just been sent to was rejected as an invalid phone number. The rule
 * mirrors the server's forgotPassword, which treats an identifier containing "@"
 * as an email and anything else as a phone.
 */
function isValidResetIdentifier(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  return v.includes('@') ? isValidEmail(v) : isValidEthiopianPhone(v);
}

export const Login = () => {
  const { loginWithToken, switchDemoRole, register, forgotPassword, resetPassword } = useAuth();
  const { lang, setLang } = useTheme();
  const t = (en, am) => (lang === 'EN' ? en : am);

  // Auth View: SIGN_IN | REGISTER | FORGOT_PASSWORD | RESET_PASSWORD
  const [authView, setAuthView] = useState('SIGN_IN');

  // Sign In State
  // Prefilled from the last successful sign-in. The password starts empty and is
  // never restored, so it is never on screen when the page loads.
  const [phone, setPhone] = useState(readRememberedPhone);
  const [password, setPassword] = useState('');
  // Prefers "not remembered", so a device that never opted in stores nothing.
  const [rememberPhoneOptIn, setRememberPhoneOptIn] = useState(readRememberOptIn);

  // Ticking the box takes effect at once rather than waiting for a successful
  // sign-in, so the number the user just typed is already saved if they reload.
  // Un-ticking deletes what was stored instead of only stopping future writes,
  // because leaving a stale account pointer behind after opting out is the exact
  // outcome the opt-in exists to prevent.
  const handleRememberPhoneToggle = (enabled) => {
    setRememberPhoneOptIn(enabled);
    writeRememberOptIn(enabled);
    if (enabled) rememberPhone(phone);
    else forgetPhone();
  };
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
  const [forgotPhone, setForgotPhone] = useState('');
  // Set only when the server reports that delivery is simulated, i.e. nothing
  // actually left the machine. With real email/SMS configured the code is
  // never available to the browser and has to be typed from the message.
  const [demoOTP, setDemoOTP] = useState('');
  const [codeDestination, setCodeDestination] = useState('');
  const [codeChannel, setCodeChannel] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

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

    const trimmedPhone = (phone || '').trim();
    if (!trimmedPhone) {
      setError(t('Phone number is required.', 'የስልክ ቁጥር ያስፈልጋል።'));
      setLoading(false);
      return;
    }

    if (!password) {
      setError(t('Password is required.', 'የይለፍ ቃል ያስፈልጋል።'));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmedPhone, password })
      });
      
      let data = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        throw new Error('Unable to connect to Smart Dube backend server. Please verify the server is active.');
      }
      
      if (!res.ok) throw new Error(getErrorMessage(data, 'Login failed. Please check your credentials.'));
      // Only when the user asked for it, and only after the credentials are
      // accepted, so a typo is not saved and re-offered next time. The server's
      // canonical form is used rather than the raw input, so the stored value is
      // one this server will recognise next time.
      if (rememberPhoneOptIn) rememberPhone(data.user?.phone || phone);
      loginWithToken(data.token, data.user);
    } catch (err) {
      setError(getErrorMessage(err));
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

    if (!regForm.fullName || !regForm.fullName.trim()) {
      setError('Full name is required.');
      setLoading(false);
      return;
    }

    const trimmedPhone = (regForm.phone || '').trim();
    if (!trimmedPhone || trimmedPhone === '+251') {
      setError('Phone number is required.');
      setLoading(false);
      return;
    }

    if (!isValidEthiopianPhone(trimmedPhone)) {
      setError('Please enter a valid Ethiopian phone number (e.g. +251911223344 or 0911223344).');
      setLoading(false);
      return;
    }

    if (!regForm.password || regForm.password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (!regForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regForm.email.trim())) {
      setError('A valid email address is required.');
      setLoading(false);
      return;
    }

    if (regForm.password !== regForm.confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (regForm.role === 'MERCHANT' && (!regForm.storeName || !regForm.storeName.trim())) {
      setError('Store name is required for merchant registration.');
      setLoading(false);
      return;
    }

    try {
      await register({
        fullName: regForm.fullName.trim(),
        phone: trimmedPhone,
        email: (regForm.email || '').trim(),
        role: regForm.role,
        password: regForm.password,
        faydaId: regForm.faydaId?.trim() || undefined,
        storeName: regForm.role === 'MERCHANT' ? (regForm.storeName?.trim() || undefined) : undefined,
        businessLicenseNo: regForm.role === 'MERCHANT' ? (regForm.businessLicenseNo?.trim() || undefined) : undefined,
        address: regForm.role === 'MERCHANT' ? (regForm.address?.trim() || undefined) : undefined,
        photoUrl: regForm.role === 'CUSTOMER' ? (regForm.photoUrl || undefined) : undefined
      });
      
      setSuccess('Registration successful! Redirecting to sign in...');
      setPhone(trimmedPhone);
      setPassword('');
      
      setTimeout(() => {
        setAuthView('SIGN_IN');
        setSuccess('');
      }, 2500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ========== FORGOT PASSWORD ==========
  // Counts the resend cooldown down to zero once a code has been requested.
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const requestResetCode = async (phoneNumber) => {
    const data = await forgotPassword(phoneNumber);

    setSuccess(data.message || 'A verification code has been sent.');
    // Populated only when the server reports delivery is simulated, i.e.
    // nothing actually left the machine.
    setDemoOTP(data._demoOTP || '');
    setCodeDestination(data.destination || '');
    setCodeChannel(data.channel || '');
    setResetPhone(phoneNumber);
    setOtpCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setResendCooldown(60);
    setAuthView('RESET_PASSWORD');
    setError('');
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDemoOTP('');

    const trimmedPhone = (forgotPhone || '').trim();
    if (!trimmedPhone) {
      setError('Registered email address is required.');
      setLoading(false);
      return;
    }

    if (!isValidEmail(trimmedPhone)) {
      setError('Please enter a valid email address.');
      setLoading(false);
      return;
    }

    try {
      await requestResetCode(trimmedPhone);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return;

    setLoading(true);
    setError('');
    try {
      await requestResetCode(resetPhone.trim());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ========== RESET PASSWORD ==========
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const trimmedPhone = (resetPhone || '').trim();
    if (!trimmedPhone) {
      setError('The email address or phone number you requested the code for is required.');
      setLoading(false);
      return;
    }

    if (!isValidResetIdentifier(trimmedPhone)) {
      setError(
        trimmedPhone.includes('@')
          ? 'Please enter a valid email address.'
          : 'Please enter a valid Ethiopian phone number (e.g. +251911223344 or 0911223344).'
      );
      setLoading(false);
      return;
    }

    const cleanOtp = (otpCode || '').trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setError('Please enter the full 6-digit OTP verification PIN.');
      setLoading(false);
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      await resetPassword(trimmedPhone, cleanOtp, newPassword);
    } catch (err) {
      setError(getErrorMessage(err));
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
      setCodeDestination('');
      setCodeChannel('');
      // Returning to the request form means the pending code is abandoned, so
      // clear the code box rather than leaving a stale one behind.
      if (view !== 'RESET_PASSWORD') setOtpCode('');
      // Dropping the typed password when leaving sign-in keeps it off the screen
      // while the register or reset form is shown, and means returning to sign-in
      // gives an empty box rather than the previous attempt still sitting there.
      setPassword('');
    };

  return (
    <div className="flex flex-col items-center py-4 px-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">

      <div className="w-full max-w-md space-y-3.5 my-auto">
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

            <form noValidate onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1">{t('Phone Number (+251):', 'የስልክ ቁጥር (+251)፦')}</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    name="phone"
                    autoComplete="tel"
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
                    name="password"
                    autoComplete="current-password"
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
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={rememberPhoneOptIn}
                    onChange={e => handleRememberPhoneToggle(e.target.checked)}
                    className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                  />
                  {t('Remember this device', 'ይህን መሣሪያ ይቀዳሽ')}
                </label>
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
          <div className="glass-panel p-7 rounded-2xl border border-slate-700/80 shadow-2xl space-y-5 bg-slate-900/90">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-slate-100 flex items-center justify-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                Create New Account
              </h3>
              <p className="text-xs text-slate-400">Register as a Merchant or Customer with Fayda KYC</p>
            </div>

            <form noValidate onSubmit={handleRegister} className="space-y-4">
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
                  Email Address: <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    placeholder="email@example.com" 
                    value={regForm.email}
                    onChange={e => setRegForm({ ...regForm, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                    required
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
              <p className="text-xs text-slate-400">
                {t(
                  'Enter your registered email address. We will send a 6-digit verification code to that email.',
                  'የተመዘገበውን ኢሜይል ያስገቡ፣ ወደዚያ ኢሜይል 6-አሃድ ማረጋገጫ ኮድ እንልካለን'
                )}
              </p>
            </div>

            <form noValidate onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">Registered Email Address:</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-amber-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    value={forgotPhone}
                    onChange={e => setForgotPhone(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-inner"
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
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center pt-2 border-t border-slate-800">
              <button onClick={() => switchView('SIGN_IN')} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-bold transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
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
              <p className="text-xs text-slate-400">
                {codeDestination
                  ? `Enter the 6-digit code sent to ${codeDestination}${codeChannel ? ` by ${codeChannel === 'EMAIL' ? 'email' : 'SMS'}` : ''}, then set your new password.`
                  : t('Enter the 6-digit verification code you received, then set your new password', 'የ6-አሃድ ማረጋገጫ ኮድ ያስገቡ፣ ከዚያ ስልክ ይለውጡ')}
              </p>
            </div>

            {success && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold text-center flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {demoOTP && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">
                  Email delivery not configured
                </p>
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  No SMTP relay is configured, so nothing was actually sent. This
                  code is shown here instead. To send it for real, set{' '}
                  <code className="font-mono">SMTP_HOST</code>,{' '}
                  <code className="font-mono">SMTP_USER</code>,{' '}
                  <code className="font-mono">SMTP_PASS</code> and{' '}
                  <code className="font-mono">EMAIL_FROM</code> in the server env
                  file, then restart the server. Gmail and Outlook require{' '}
                  <code className="font-mono">SMTP_PASS</code> to be an App
                  Password, not the account password.
                </p>
                <div className="flex items-center justify-center gap-2">
                  {demoOTP.split('').map((digit, i) => (
                    <span key={i} className="w-9 h-11 rounded-lg bg-amber-500/10 border border-amber-500/40 text-center text-lg font-extrabold text-amber-400 flex items-center justify-center">
                      {digit}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              {/* Where the code went. Read-only: editing it here would leave the
                  identifier out of step with the address the OTP was sent to, and
                  the failure would look like a wrong code rather than a wrong
                  account. */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  {t('Code sent to:', 'ኮድ የተላከው:')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={resetPhone}
                    readOnly
                    aria-readonly="true"
                    placeholder="your@email.com"
                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-300 font-mono font-medium cursor-default select-all focus:outline-none focus:border-slate-600 transition-all shadow-inner"
                    required
                  />
                </div>
              </div>

              {/* OTP Code */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-2">
                  {t('6-Digit Verification Code:', 'የ6-አሃድ ማረጋገጫ ኮድ:')}
                </label>
                <div className="flex items-center gap-2 justify-center">
                  {[...Array(6)].map((_, i) => (
                    <input
                      key={i}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={otpCode[i] || ''}
                      // Lets iOS/Android offer the code straight from the email or
                      // SMS they just received. Without it the customer has to read
                      // six digits off a screen and type them by hand.
                      autoComplete="one-time-code"
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const newOtp = otpCode.split('');
                        newOtp[i] = val;
                        setOtpCode(newOtp.join(''));
                        if (val && e.target.nextElementSibling) {
                          e.target.nextElementSibling.focus();
                        }
                      }}
                      // maxLength={1} also truncates a paste down to a single
                      // character, so selecting the code in the email and copying it
                      // filled only the first box. Spread the pasted digits across
                      // the remaining boxes instead, starting at this one.
                      onPaste={e => {
                        const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
                        if (!pasted) return;
                        e.preventDefault();
                        const boxes = [...e.target.parentElement.children];
                        const slots = otpCode.padEnd(6, ' ').split('');
                        for (let k = 0; k < pasted.length && i + k < 6; k++) {
                          slots[i + k] = pasted[k];
                        }
                        setOtpCode(slots.join('').replace(/\s/g, ''));
                        boxes[Math.min(i + pasted.length, 5)]?.focus();
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Backspace' && !otpCode[i] && e.target.previousElementSibling) {
                          e.target.previousElementSibling.focus();
                        }
                      }}
                      className="w-11 h-14 rounded-xl bg-slate-950 border border-slate-700/80 text-center text-lg font-extrabold text-amber-400 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all shadow-inner"
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
              <button onClick={handleResendCode} disabled={resendCooldown > 0 || loading} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-extrabold transition-colors disabled:text-slate-600 disabled:hover:text-slate-600 disabled:cursor-not-allowed">
                  {resendCooldown > 0 ? (
                    <span>Resend code in {resendCooldown}s</span>
                  ) : (
                    <>
                      <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                      <span>Resend Code</span>
                    </>
                  )}
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
