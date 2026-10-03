import React, { createContext, useContext, useState, useEffect } from 'react';
import { getErrorMessage } from '../utils/errorHelper';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('smart_dube_token') || null);
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('smart_dube_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.user) {
            setUser(data.user);
            localStorage.setItem('smart_dube_user', JSON.stringify(data.user));
          } else if (data && data.error && (data.error.includes('expired') || data.error.includes('denied'))) {
            logout();
          }
        })
        .catch(err => {
          console.warn('[Auth] Session check network note:', err.message);
        });
    }
  }, [token]);

  const loginWithToken = (newToken, userData) => {
    localStorage.setItem('smart_dube_token', newToken);
    if (userData) {
      localStorage.setItem('smart_dube_user', JSON.stringify(userData));
    }
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('smart_dube_token');
    localStorage.removeItem('smart_dube_user');
    setToken(null);
    setUser(null);
  };

  // Quick Demo Login Switcher for evaluators. These phone numbers must match
  // the accounts created by server/src/db/seed.js.
  const switchDemoRole = async (roleType) => {
    const accounts = {
      ADMIN: { phone: '+251987005355', password: 'admin123' },
      MERCHANT: { phone: '+251911223344', password: 'merchant123' },
      CUSTOMER: { phone: '+251933445566', password: 'customer123' }
    };
    const account = accounts[roleType];
    if (!account) return;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account)
      });
      const data = await res.json();
      if (data.token) {
        loginWithToken(data.token, data.user);
      } else {
        console.warn('[Auth] Demo login failed:', data.error);
      }
    } catch (err) {
      console.error('Demo switch error:', err);
    }
  };

  // Register new user account
  const register = async ({ fullName, phone, email, role, password, faydaId, storeName, businessLicenseNo, address, photoUrl }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, phone, email, role, password, faydaId, storeName, businessLicenseNo, address, photoUrl })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(getErrorMessage(data, 'Registration failed.'));
    return data;
  };

  // Forgot password - request a verification code. It goes to the email
  // captured at registration, or by SMS when the account has no email on file.
  const forgotPassword = async (identifier) => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: identifier && identifier.includes('@')
        ? JSON.stringify({ email: identifier })
        : JSON.stringify({ phone: identifier })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to send a verification code.'));
    return data;
  };

  // Reset password with the verification code
  const resetPassword = async (phone, otpCode, newPassword) => {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otpCode, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(getErrorMessage(data, 'Password reset failed.'));
    loginWithToken(data.token, data.user);
    return data;
  };

  // Change password while signed in. Verifies the current password directly, so
  // no verification code is involved.
  const changePassword = async (currentPassword, newPassword) => {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(getErrorMessage(data, 'Password change failed.'));
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, loginWithToken, logout, switchDemoRole, register, forgotPassword, resetPassword, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
