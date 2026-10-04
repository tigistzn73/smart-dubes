import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Users,
  PlusCircle,
  ShoppingBag,
  Send,
  ShieldAlert,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  FileText,
  DollarSign,
  PhoneCall,
  Search,
  Calendar,
  Lock,
  MessageSquare,
  X,
  Smartphone,
  Bell,
  AlertCircle,
  Eye,
  Package,
  Receipt,
  Upload,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Maximize2,
  Minimize2,
  Store
} from 'lucide-react';
import { getErrorMessage, isValidEthiopianPhone } from '../utils/errorHelper';

export const MerchantDashboard = () => {
  const { lang } = useTheme();
  const t = (en, am) => (lang === 'EN' ? en : am);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [escalationCases, setEscalationCases] = useState([]);
  const [merchant, setMerchant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD | CUSTOMERS | TRANSACTIONS | RECEIPT_APPROVALS | ESCALATIONS
  const [logCreditModalOpen, setLogCreditModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
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

  // Merchant Inbox Alerts State
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [readAlertIds, setReadAlertIds] = useState([]);

  // Register Customer Form State
  const [newCustomer, setNewCustomer] = useState({
    fullName: '',
    phone: '+251',
    faydaId: 'FYD-',
    creditLimit: '5000'
  });
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  // New Credit Transaction Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [items, setItems] = useState([{ name: '', quantity: 1, unitPrice: '' }]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [riskFeedback, setRiskFeedback] = useState(null);

  // SMS Compose Modal State
  const [smsTarget, setSmsTarget] = useState(null);
  const [smsFeedback, setSmsFeedback] = useState('');
  const [smsType, setSmsType] = useState('REMINDER');
  const [customSmsMessage, setCustomSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsSentResult, setSmsSentResult] = useState(null);

  // View Dube Items Modal State
  const [itemsModalCustomer, setItemsModalCustomer] = useState(null);

  // Credit Limit & Status Modal State
  const [limitModalCustomer, setLimitModalCustomer] = useState(null);
  const [limitInput, setLimitInput] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);
  const [limitError, setLimitError] = useState('');
  const [limitSuccess, setLimitSuccess] = useState('');

  // Bank Account Settings State
  const [bankForm, setBankForm] = useState({ bankName: '', accountName: '', accountNumber: '' });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMessage, setBankMessage] = useState(null);

  // Customer Profile Registration State
  const [customerRegError, setCustomerRegError] = useState('');
  const [customerRegSaving, setCustomerRegSaving] = useState(false);

  // SMS Modal Error State
  const [smsError, setSmsError] = useState('');

  const token = localStorage.getItem('smart_dube_token');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [mRes, cRes, tRes, eRes] = await Promise.all([
        fetch('/api/merchant/profile', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/merchant/customers', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/merchant/transactions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/merchant/escalations', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const mData = await mRes.json();
      const cData = await cRes.json();
      const tData = await tRes.json();
      const eData = await eRes.json();

      if (mData.merchant) {
        setMerchant(mData.merchant);
        setBankForm({
          bankName: mData.merchant.bank_name || '',
          accountName: mData.merchant.account_name || '',
          accountNumber: mData.merchant.account_number || ''
        });
      }
      if (cData.customers) setCustomers(cData.customers);
      if (tData.transactions) setTransactions(tData.transactions);
      if (tData.repayments) setRepayments(tData.repayments);
      if (eData.cases) setEscalationCases(eData.cases);
    } catch (err) {
      console.error('Fetch Merchant Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const openLimitModal = (customer) => {
    setLimitModalCustomer(customer);
    setLimitInput(String(customer.credit_limit ?? 0));
    setLimitError('');
    setLimitSuccess('');
  };

  const saveCustomerUpdate = async (status) => {
    if (!limitModalCustomer) return;
    const limitNum = parseFloat(limitInput);
    if (isNaN(limitNum) || limitNum < 0) {
      setLimitError(t('Credit limit must be a valid number of 0 or more.', 'የዱቤ ገደብ 0 ወይም ከዚያ በላይ ቁጥር መሆን አለበት።'));
      return;
    }
    setLimitSaving(true);
    setLimitError('');
    setLimitSuccess('');
    try {
      const res = await fetch(`/api/merchant/customers/${limitModalCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creditLimit: limitNum, status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to update customer'));

      setCustomers(prev => prev.map(c => (c.id === limitModalCustomer.id
        ? { ...c, credit_limit: data.customer.creditLimit, current_balance: data.customer.currentBalance, status: data.customer.status }
        : c)));
      setLimitModalCustomer(prev => ({ ...prev, ...data.customer, credit_limit: data.customer.creditLimit, current_balance: data.customer.currentBalance, status: data.customer.status }));
      setLimitInput(String(data.customer.creditLimit));
      setLimitSuccess(data.message || 'Saved');
      setTimeout(() => setLimitSuccess(''), 3000);
    } catch (err) {
      setLimitError(getErrorMessage(err));
    } finally {
      setLimitSaving(false);
    }
  };

  const saveBankAccount = async (e) => {
    e.preventDefault();
    setBankSaving(true);
    setBankMessage(null);
    try {
      const res = await fetch('/api/merchant/bank-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(bankForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to save bank details'));
      setMerchant(prev => (prev ? { ...prev, ...data.bankAccount } : prev));
      setBankForm({
        bankName: data.bankAccount.bank_name || '',
        accountName: data.bankAccount.account_name || '',
        accountNumber: data.bankAccount.account_number || ''
      });
      setBankMessage({ type: 'success', text: data.message });
    } catch (err) {
      setBankMessage({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setBankSaving(false);
    }
  };

  // Build Merchant Inbox Alerts
  const merchantAlerts = [
    ...repayments.filter(r => r.status === 'PENDING').map(r => ({
      id: `pending-rec-${r.id}`,
      type: 'RECEIPT_PENDING',
      title: t('Receipt Approval Required', 'ደረሰኝ ማረጋገጫ ያስፈልጋል'),
      message: `${r.customer_name || 'Customer'} (${r.customer_phone || ''}) ${t('uploaded a payment receipt of', 'የክፍያ ደረሰኝ አስገብቷል፦')} ${parseFloat(r.amount).toFixed(2)} ETB ${t('via', 'በ')} ${r.payment_gateway}. ${t('Ref:', 'ማጣቀሻ፦')} ${r.reference_code}.`,
      timestamp: r.created_at,
      actionLabel: t('Review & Approve', 'መርምር እና አጽድቅ'),
      actionTab: 'RECEIPT_APPROVALS',
      data: r
    })),
    ...customers.filter(c => (parseInt(c.overdue_count || 0) > 0) || c.status === 'RESTRICTED').map(c => ({
      id: `overdue-cust-${c.id}`,
      type: 'OVERDUE',
      title: t('Overdue Dube Debt Warning', 'ያለፈበት የዱቤ እዳ ማስጠንቀቂያ'),
      message: `${c.full_name} (${c.phone}) ${t('has overdue Dube balance of', 'ያለፈበት የዱቤ እዳ አለበት፦')} ${parseFloat(c.current_balance || 0).toFixed(2)} ETB.`,
      timestamp: c.updated_at || c.created_at,
      actionLabel: t('Send SMS Warning', 'የኤስኤምኤስ ማስጠንቀቂያ ላክ'),
      actionTarget: c,
      data: c
    })),
    ...repayments.filter(r => r.status === 'COMPLETED').slice(0, 8).map(r => ({
      id: `completed-pay-${r.id}`,
      type: 'PAYMENT_RECEIVED',
      title: t('Payment Confirmed & Settled', 'ክፍያ ተረጋግጦ ተካክሷል'),
      message: `${r.customer_name || 'Customer'} ${t('paid', 'ከፍሏል፦')} ${parseFloat(r.amount).toFixed(2)} ETB ${t('via', 'በ')} ${r.payment_gateway}. ${t('Ref:', 'ማጣቀሻ፦')} ${r.reference_code}.`,
      timestamp: r.created_at,
      actionLabel: t('View Transactions', 'የሂሳብ ታሪክ እይ'),
      actionTab: 'TRANSACTIONS',
      data: r
    }))
  ];

  const visibleAlerts = merchantAlerts.filter(a => !dismissedAlertIds.includes(a.id));
  const unreadAlertsCount = visibleAlerts.filter(a => !readAlertIds.includes(a.id)).length;

  const dismissAlert = (id) => setDismissedAlertIds(prev => [...prev, id]);

  const openAlertsModal = () => {
    setAlertsOpen(true);
    setReadAlertIds(prev => {
      const newIds = visibleAlerts.map(a => a.id).filter(id => !prev.includes(id));
      return [...prev, ...newIds];
    });
  };

  // Sync unread alerts count to Navbar bell icon
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('update-unread-alerts', { detail: { count: unreadAlertsCount } }));
  }, [unreadAlertsCount]);

  // Listen for open event from Navbar bell button
  useEffect(() => {
    const handleOpen = () => openAlertsModal();
    window.addEventListener('open-inbox-alerts', handleOpen);
    return () => window.removeEventListener('open-inbox-alerts', handleOpen);
  }, [visibleAlerts]);

  const handleApproveRepayment = async (repaymentId, action) => {
    setApprovingId(repaymentId);
    try {
      const res = await fetch('/api/merchant/approve-repayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ repaymentId, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to process payment receipt'));

      setSmsFeedback(action === 'APPROVE'
        ? '✅ Payment Receipt Approved! Debt balance updated & SMS receipt sent to customer.'
        : '❌ Payment Receipt Rejected.');
      setTimeout(() => setSmsFeedback(''), 5000);

      fetchDashboardData();
    } catch (err) {
      setSmsFeedback(`⚠️ ${getErrorMessage(err)}`);
      setTimeout(() => setSmsFeedback(''), 5000);
    } finally {
      setApprovingId(null);
    }
  };

  // Add Item row to credit order
  const addItemRow = () => {
    setItems([...items, { name: '', quantity: 1, unitPrice: '' }]);
  };

  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const q = parseFloat(item.quantity) || 0;
      const p = parseFloat(item.unitPrice) || 0;
      return sum + q * p;
    }, 0);
  };

  // Register Customer Profile
  const handleRegisterCustomer = async (e) => {
    e.preventDefault();
    setCustomerRegError('');

    if (!newCustomer.fullName || !newCustomer.fullName.trim()) {
      setCustomerRegError(t('Customer full name is required.', 'የደንበኛ ሙሉ ስም ያስፈልጋል።'));
      return;
    }

    const trimmedPhone = (newCustomer.phone || '').trim();
    if (!trimmedPhone || trimmedPhone === '+251') {
      setCustomerRegError(t('Customer phone number is required.', 'የደንበኛ ስልክ ቁጥር ያስፈልጋል።'));
      return;
    }

    if (!isValidEthiopianPhone(trimmedPhone)) {
      setCustomerRegError(t('Please enter a valid Ethiopian phone number (e.g. +251911223344 or 0911223344).', 'እባክዎ ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ (ምሳሌ +251911223344 ወይም 0911223344)።'));
      return;
    }

    const trimmedFayda = (newCustomer.faydaId || '').trim();
    if (!trimmedFayda || trimmedFayda === 'FYD-') {
      setCustomerRegError(t('Fayda ID number is required for KYC compliance.', 'የፋይዳ መታወቂያ ቁጥር ለKYC ህግ ያስፈልጋል።'));
      return;
    }

    const limitNum = parseFloat(newCustomer.creditLimit);
    if (isNaN(limitNum) || limitNum < 0) {
      setCustomerRegError(t('Max credit limit must be a valid number of 0 or more.', 'ከፍተኛ የዱቤ ገደብ 0 ወይም ከዚያ በላይ ቁጥር መሆን አለበት።'));
      return;
    }

    setCustomerRegSaving(true);
    try {
      const res = await fetch('/api/merchant/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: newCustomer.fullName.trim(),
          phone: trimmedPhone,
          faydaId: trimmedFayda,
          creditLimit: limitNum
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to register customer.'));

      setNewCustomer({ fullName: '', phone: '+251', faydaId: 'FYD-', creditLimit: '5000' });
      setCustomerRegError('');
      fetchDashboardData();
      setActiveTab('CUSTOMERS');
      setSmsFeedback(t('New customer profile registered successfully!', 'አዲስ የደንበኛ መገለጫ በተሳካ ሁኔታ ተመዝግቧል!'));
      setTimeout(() => setSmsFeedback(''), 4000);
    } catch (err) {
      setCustomerRegError(getErrorMessage(err));
    } finally {
      setCustomerRegSaving(false);
    }
  };

  // Submit Credit Transaction with Enforcer
  const handleLogCredit = async (e) => {
    e.preventDefault();
    setRiskFeedback(null);

    if (!selectedCustomerId) {
      setRiskFeedback({
        type: 'REJECTED',
        message: t('Customer Selection Required', 'የደንበኛ ምርጫ ያስፈልጋል'),
        reason: t('Please select a customer profile from your ledger before recording a sale.', 'እባክዎን ሽያጭ ከመመዝገብዎ በፊት ከሌጀርዎ ደንበኛ ይምረጡ።')
      });
      return;
    }

    const totalAmount = calculateTotal();
    if (totalAmount <= 0) {
      setRiskFeedback({
        type: 'REJECTED',
        message: t('Invalid Line Items', 'ልክ ያልሆኑ የእቃ ዝርዝሮች'),
        reason: t('Please add valid line items with quantities and unit prices greater than 0.', 'እባክዎን ከ0 በላይ ዋጋ እና ብዛት ያላቸው ትክክለኛ የእቃ ዝርዝሮችን ያክሉ።')
      });
      return;
    }

    if (!dueDate) {
      setRiskFeedback({
        type: 'REJECTED',
        message: t('Repayment Due Date Required', 'የክፍያ መተግበሪያ ቀን ያስፈልጋል'),
        reason: t('Please specify a repayment deadline date for this credit purchase.', 'እባክዎን ለዚህ የዱቤ ግዢ የክፍያ ገደብ ቀን ይወስኑ።')
      });
      return;
    }

    try {
      const res = await fetch('/api/merchant/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          items: items.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.quantity * i.unitPrice })),
          totalAmount,
          dueDate,
          notes
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setRiskFeedback({
          type: 'REJECTED',
          message: getErrorMessage(data, 'Credit transaction rejected'),
          reason: data.reason || (data.details && data.details[0]?.message) || data.message
        });
        return;
      }

      setRiskFeedback(null);
      setItems([{ name: '', quantity: 1, unitPrice: '' }]);
      setNotes('');
      fetchDashboardData();
      setActiveTab('TRANSACTIONS');
      setSmsFeedback(`Credit purchase logged successfully! Ref: ${data.transaction.txRef}`);
      setTimeout(() => setSmsFeedback(''), 4500);
    } catch (err) {
      setRiskFeedback({
        type: 'REJECTED',
        message: getErrorMessage(err, 'Failed to log credit purchase'),
        reason: err.message
      });
    }
  };

  // Trigger SMS Reminder — with compose modal support
  const handleTriggerSMS = async () => {
    if (!smsTarget) return;
    setSmsSending(true);
    setSmsError('');
    try {
      const res = await fetch('/api/merchant/sms-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customerId: smsTarget.id,
          type: smsType,
          customMessage: customSmsMessage.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to send SMS reminder'));
      setSmsSentResult(data);
    } catch (err) {
      setSmsError(getErrorMessage(err));
    } finally {
      setSmsSending(false);
    }
  };

  const closeSmsModal = () => {
    setSmsTarget(null);
    setSmsType('REMINDER');
    setCustomSmsMessage('');
    setSmsSentResult(null);
    setSmsError('');
  };

  const [escalationActionId, setEscalationActionId] = useState(null);

  const handleEscalationAction = async (caseId, action) => {
    setEscalationActionId(caseId + action);
    try {
      const endpoint = action === 'WARNING' ? '/api/merchant/escalations/warning' : '/api/merchant/escalations/court-letter';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ caseId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to process escalation'));

      setSmsFeedback(action === 'WARNING'
        ? t('Warning SMS sent to customer!', 'ማስጠንቀቂያ ለደንበኛ ተልኳል!')
        : t('Court letter sent to customer!', 'የፍርድ ቤት ደብዳቤ ለደንበኛ ተልኳል!'));
      setTimeout(() => setSmsFeedback(''), 5000);

      fetchDashboardData();
    } catch (err) {
      setSmsFeedback(`⚠️ ${getErrorMessage(err)}`);
      setTimeout(() => setSmsFeedback(''), 5000);
    } finally {
      setEscalationActionId(null);
    }
  };

  const handleResolveEscalation = async (caseId) => {
    setEscalationActionId(caseId + 'RESOLVE');
    try {
      const res = await fetch(`/api/merchant/escalations/${caseId}/resolve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ notes: 'Debt settled by customer' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to resolve case'));

      setSmsFeedback(t('Escalation case resolved!', 'የማስጠንቀቂያ ጉዳይ ተብቷል!'));
      setTimeout(() => setSmsFeedback(''), 5000);

      fetchDashboardData();
    } catch (err) {
      setSmsFeedback(`⚠️ ${getErrorMessage(err)}`);
      setTimeout(() => setSmsFeedback(''), 5000);
    } finally {
      setEscalationActionId(null);
    }
  };

  const handleCloseEscalation = async (caseId) => {
    setEscalationActionId(caseId + 'CLOSE');
    try {
      const res = await fetch(`/api/merchant/escalations/${caseId}/close`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ notes: 'Case closed by merchant' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to close case'));

      setSmsFeedback(t('Escalation case closed!', 'የማስጠንቀቂያ ጉዳይ ተዘግቷል!'));
      setTimeout(() => setSmsFeedback(''), 5000);

      fetchDashboardData();
    } catch (err) {
      setSmsFeedback(`⚠️ ${getErrorMessage(err)}`);
      setTimeout(() => setSmsFeedback(''), 5000);
    } finally {
      setEscalationActionId(null);
    }
  };

  const getAvatarUrl = (photoUrl, name) => {
    if (!photoUrl || photoUrl.includes('ui-avatars.com')) {
      return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || 'User')}`;
    }
    return photoUrl;
  };

  const getSmsPreview = (customer) => {
    if (customSmsMessage.trim()) return customSmsMessage.trim();
    if (smsType === 'REMINDER')
      return `[Smart Dube Alert] Dear ${customer.full_name}, your Dube credit repayment of ${customer.current_balance.toFixed(2)} ETB is due. Pay via Telebirr / CBE Birr to maintain your credit limit.`;
    if (smsType === 'OVERDUE_ALERT')
      return `[Smart Dube URGENT] ${customer.full_name}, your Dube debt of ${customer.current_balance.toFixed(2)} ETB is OVERDUE! New credit purchases are RESTRICTED. Please settle immediately.`;
    return '[Smart Dube] Custom notification from your merchant.';
  };

  const filteredCustomers = customers.filter(
    c =>
      c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.fayda_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const itemsPerPage = 3;
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const currentPage = Math.min(customerPage, Math.max(1, totalPages));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + itemsPerPage);

  // If KYC verification is not approved, show status-specific banner screens
  if (merchant && merchant.kyc_status !== 'VERIFIED') {
    const isPending = merchant.kyc_status === 'PENDING';
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="glass-panel max-w-xl w-full p-8 rounded-2xl border border-slate-800 shadow-2xl text-center space-y-6 bg-slate-900/90">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center bg-slate-800">
            {isPending ? (
              <AlertTriangle className="w-8 h-8 text-amber-400 animate-pulse" />
            ) : (
              <X className="w-8 h-8 text-red-500" />
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-extrabold text-slate-100">
              {isPending 
                ? 'KYC Verification Pending Approval' 
                : 'KYC Application Rejected'}
            </h3>
            <p className="text-xs text-slate-400">
              Merchant: <span className="text-slate-300 font-semibold">{merchant.store_name}</span> • License: <span className="font-mono text-slate-300">{merchant.business_license_no}</span>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 leading-relaxed text-left space-y-2.5">
            {isPending ? (
              <>
                <p>📋 <strong>Status details:</strong> Your merchant account application has been received and is currently in the verification queue.</p>
                <p>⚙️ <strong>Next Steps:</strong> Smart Dube administrators are checking your business license details and government documentation. You will receive an SMS notification once your ledger portal is activated.</p>
              </>
            ) : (
              <>
                <p>❌ <strong>Rejection details:</strong> Your merchant application could not be verified by the admin system.</p>
                {merchant.kyc_notes && (
                  <p className="p-3 bg-red-950/20 rounded-lg border border-red-500/20 text-red-300 font-medium">
                    ⚠️ <strong>Admin Reason:</strong> {merchant.kyc_notes}
                  </p>
                )}
                <p>💡 Please review your documents or contact support to submit a new verification license request.</p>
              </>
            )}
          </div>

          <div className="pt-2 text-[10px] text-slate-500">
            Account ID: #{merchant.id} • Registered Address: {merchant.address}
          </div>
        </div>
      </div>
    );
  }

  // Calculate Dashboard Stats
  const totalOutstanding = customers.reduce((sum, c) => sum + parseFloat(c.current_balance || 0), 0);
  const totalLimit = customers.reduce((sum, c) => sum + parseFloat(c.credit_limit || 0), 0);
  const activeCount = customers.filter(c => c.status === 'ACTIVE').length;
  const restrictedCount = customers.filter(c => c.status === 'RESTRICTED').length;
  const overdueCount = customers.reduce((sum, c) => sum + (parseInt(c.overdue_count || 0) > 0 ? 1 : 0), 0);
  const utilizationPercent = totalLimit > 0 ? Math.min(100, Math.round((totalOutstanding / totalLimit) * 100)) : 0;

  // Get recent 7 days sales graph data
  const getLast7DaysSales = () => {
    const days = [];
    const salesByDay = {};

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      days.push(dateStr);
      salesByDay[dateStr] = 0;
    }

    transactions.forEach(t => {
      const tDateStr = new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (salesByDay[tDateStr] !== undefined) {
        salesByDay[tDateStr] += parseFloat(t.total_amount || 0);
      }
    });

    return days.map(day => ({
      day,
      sales: salesByDay[day]
    }));
  };

  const salesData = getLast7DaysSales();
  const maxSales = Math.max(...salesData.map(d => d.sales), 100);
  const chartWidth = 500;
  const chartHeight = 120;
  const points = salesData.map((d, i) => {
    const x = i * (chartWidth / (salesData.length - 1 || 1));
    const y = chartHeight - 20 - (d.sales / maxSales) * (chartHeight - 40);
    return { x, y, sales: d.sales, day: d.day };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const areaD = pathD ? `${pathD} L ${points[points.length - 1].x} ${chartHeight - 20} L ${points[0].x} ${chartHeight - 20} Z` : '';


  return (
    <div className="flex flex-col">
      <div className="flex flex-row gap-1.5 md:gap-3 items-start">
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
                  <Store className="w-4 h-4 text-emerald-400" />
                  <span className="font-extrabold text-sm text-slate-100">{t('Merchant Menu', 'የነጋዴ ምናሌ')}</span>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex flex-col gap-2">
                {/* Dashboard */}
                <button
                  onClick={() => { setActiveTab('DASHBOARD'); setMobileSidebarOpen(false); }}
                  className={`w-full p-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 border cursor-pointer ${
                    activeTab === 'DASHBOARD'
                      ? 'bg-slate-800 text-emerald-400 border-slate-700 shadow-md'
                      : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-850'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>{t('Dashboard', 'ዳሽቦርድ')}</span>
                </button>

                {/* New Customer */}
                <button
                  onClick={() => { setRiskFeedback(null); setActiveTab('NEW_CUSTOMER'); setMobileSidebarOpen(false); }}
                  className={`w-full p-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 border cursor-pointer ${
                    activeTab === 'NEW_CUSTOMER'
                      ? 'bg-slate-800 text-emerald-400 border-slate-700 shadow-md'
                      : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-850'
                  }`}
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>{t('New Credit Profile', 'አዲስ የዱቤ ፕሮፋይል')}</span>
                </button>

                {/* Log Dube Sale */}
                <button
                  onClick={() => { setSelectedCustomerId(''); setRiskFeedback(null); setActiveTab('LOG_SALE'); setMobileSidebarOpen(false); }}
                  className={`w-full p-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 border cursor-pointer ${
                    activeTab === 'LOG_SALE'
                      ? 'bg-slate-800 text-emerald-400 border-slate-700 shadow-md'
                      : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-850'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>{t('Log Dube Sale', 'የዱቤ ሽያጭ መዝግብ')}</span>
                </button>

                {/* Remaining Navigation Items */}
                {[
                  { id: 'CUSTOMERS', name: t('Customer Ledgers', 'የደንበኞች ሌጀር'), icon: Users, count: customers.length },
                  { id: 'TRANSACTIONS', name: t('Credit History', 'የዱቤ ታሪክ'), icon: FileText, count: transactions.length },
                  { id: 'RECEIPT_APPROVALS', name: t('Receipt Approvals', 'ደረሰኝ ማጽደቂያ'), icon: Upload, count: repayments.filter(r => r.status === 'PENDING').length },
                  { id: 'ESCALATIONS', name: t('Debt Escalations', 'የብድር ማስጠንቀቂያ'), icon: ShieldAlert, count: escalationCases.filter(c => c.status === 'SENT').length }
                ].map(item => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setMobileSidebarOpen(false); }}
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
              Smart Dube Merchant • Ethiopian BNPL
            </div>
          </aside>
        </div>
      )}

      {/* LEFT SIDEBAR NAVIGATION (DESKTOP ONLY) */}
      <aside className={`hidden md:flex ${sidebarCollapsed ? 'w-[68px]' : 'w-60'} flex-shrink-0 glass-panel rounded-2xl p-2 md:p-3 flex-col justify-start border border-slate-800 lg:sticky lg:top-[52px] lg:max-h-[calc(100vh-56px)] overflow-y-auto transition-all duration-300`}>
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
                  ? 'bg-slate-800/80 text-emerald-400 border-slate-700/60 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-900/40'
              }`}
              title={t('Dashboard', 'ዳሽቦርድ')}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span className={`hidden ${sidebarCollapsed ? '' : 'md:inline'} whitespace-nowrap`}>{t('Dashboard', 'ዳሽቦርድ')}</span>
              </div>
            </button>

            {/* New Credit Profile Tab */}
            <button
              onClick={() => { setRiskFeedback(null); setActiveTab('NEW_CUSTOMER'); }}
              className={`w-full p-2 md:px-3 md:py-2.5 ${sidebarCollapsed ? 'md:justify-center' : 'justify-center md:justify-between'} rounded-xl text-xs font-bold transition-all flex items-center border cursor-pointer ${
                activeTab === 'NEW_CUSTOMER'
                  ? 'bg-slate-800/80 text-emerald-400 border-slate-700/60 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-900/40'
              }`}
              title={t('New Credit Profile', 'አዲስ የዱቤ ፕሮፋይል')}
            >
              <div className="flex items-center gap-2.5">
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span className={`hidden ${sidebarCollapsed ? '' : 'md:inline'} whitespace-nowrap`}>{t('New Credit Profile', 'አዲስ የዱቤ ፕሮፋይል')}</span>
              </div>
            </button>

            {/* Log Dube Sale Tab */}
            <button
              onClick={() => { setSelectedCustomerId(''); setRiskFeedback(null); setActiveTab('LOG_SALE'); }}
              className={`w-full p-2 md:px-3 md:py-2.5 ${sidebarCollapsed ? 'md:justify-center' : 'justify-center md:justify-between'} rounded-xl text-xs font-bold transition-all flex items-center border cursor-pointer ${
                activeTab === 'LOG_SALE'
                  ? 'bg-slate-800/80 text-emerald-400 border-slate-700/60 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 bg-transparent border-transparent hover:bg-slate-900/40'
              }`}
              title={t('Log Dube Sale', 'የዱቤ ሽያጭ መዝግብ')}
            >
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span className={`hidden ${sidebarCollapsed ? '' : 'md:inline'} whitespace-nowrap`}>{t('Log Dube Sale', 'የዱቤ ሽያጭ መዝግብ')}</span>
              </div>
            </button>

            {/* Remaining navigation tabs */}
            {[
              { id: 'CUSTOMERS', name: t('Customer Ledgers', 'የደንበኞች ሌጀር'), icon: Users, count: customers.length },
              { id: 'TRANSACTIONS', name: t('Credit History', 'የዱቤ ታሪክ'), icon: FileText, count: transactions.length },
              { id: 'RECEIPT_APPROVALS', name: t('Receipt Approvals', 'ደረሰኝ ማጽደቂያ'), icon: Upload, count: repayments.filter(r => r.status === 'PENDING').length }
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
        {/* Top Banner Stats */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 glass-panel p-4 rounded-xl border border-slate-800/80 shadow-md">
          <div className="flex flex-col gap-1 text-xs">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-extrabold text-slate-100 tracking-tight">
                {merchant ? merchant.store_name : 'Merchant Dashboard'}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                merchant?.kyc_status === 'VERIFIED'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                KYC: {merchant?.kyc_status || 'PENDING'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              License: {merchant?.business_license_no || 'N/A'} &bull; {merchant?.address || 'Addis Ababa'}
            </div>
          </div>
        </div>

        {smsFeedback && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-between animate-fade-in">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {smsFeedback}
            </span>
            <button
              onClick={() => setSmsFeedback('')}
              className="ml-4 text-emerald-400 hover:text-white transition-colors flex-shrink-0"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB: NEW CUSTOMER PROFILE */}
        {activeTab === 'NEW_CUSTOMER' && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 max-w-xl mx-auto animate-fade-in">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-100">{t('Register Customer Credit Profile', 'የደንበኛ የዱቤ ፕሮፋይል መዝግብ')}</h3>
                <p className="text-xs text-slate-400 font-medium">{t('Add a neighborhood resident and authorize their credit limit', 'የሰፈር ነዋሪ በመጨመር የዱቤ ገደብ ፍቀድ')}</p>
              </div>
            </div>

            <form noValidate onSubmit={handleRegisterCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('Full Name:', 'ሙሉ ስም፦')}</label>
                <input
                  type="text"
                  placeholder="e.g. Dawit Yohannes"
                  value={newCustomer.fullName}
                  onChange={e => {
                    setNewCustomer({ ...newCustomer, fullName: e.target.value });
                    if (customerRegError) setCustomerRegError('');
                  }}
                  className={`w-full bg-slate-900 border ${
                    customerRegError && (!newCustomer.fullName || !newCustomer.fullName.trim())
                      ? 'border-red-500 ring-1 ring-red-500/30'
                      : 'border-slate-800 focus:border-emerald-500'
                  } rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none transition-colors`}
                />
                {customerRegError && (!newCustomer.fullName || !newCustomer.fullName.trim()) && (
                  <p className="text-[11px] text-red-400 mt-1 font-semibold flex items-center gap-1">
                    <span>⚠️ {t('Please enter customer full name.', 'እባክዎን የደንበኛ ሙሉ ስም ያስገቡ።')}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('Phone Number (+251):', 'የስልክ ቁጥር (+251)፦')}</label>
                <input
                  type="text"
                  placeholder="+251911..."
                  value={newCustomer.phone}
                  onChange={e => {
                    setNewCustomer({ ...newCustomer, phone: e.target.value });
                    if (customerRegError) setCustomerRegError('');
                  }}
                  className={`w-full bg-slate-900 border ${
                    customerRegError && (!newCustomer.phone || newCustomer.phone.trim() === '+251' || !isValidEthiopianPhone(newCustomer.phone))
                      ? 'border-red-500 ring-1 ring-red-500/30'
                      : 'border-slate-800 focus:border-emerald-500'
                  } rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none transition-colors`}
                />
                {customerRegError && (!newCustomer.phone || newCustomer.phone.trim() === '+251' || !isValidEthiopianPhone(newCustomer.phone)) && (
                  <p className="text-[11px] text-red-400 mt-1 font-semibold flex items-center gap-1">
                    <span>⚠️ {t('Please enter a valid phone number (e.g. +251911223344 or 0911223344).', 'እባክዎን ትክክለኛ ስልክ ቁጥር ያስገቡ (ምሳሌ +251911223344 ወይም 0911223344)።')}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('Fayda ID Number (KYC):', 'የፋይዳ መታወቂያ ቁጥር (KYC)፦')}</label>
                <input
                  type="text"
                  placeholder="FYD-1234-5678"
                  value={newCustomer.faydaId}
                  onChange={e => {
                    setNewCustomer({ ...newCustomer, faydaId: e.target.value });
                    if (customerRegError) setCustomerRegError('');
                  }}
                  className={`w-full bg-slate-900 border ${
                    customerRegError && (!newCustomer.faydaId || newCustomer.faydaId.trim() === 'FYD-' || !newCustomer.faydaId.trim())
                      ? 'border-red-500 ring-1 ring-red-500/30'
                      : 'border-slate-800 focus:border-emerald-500'
                  } rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-mono focus:outline-none transition-colors`}
                />
                {customerRegError && (!newCustomer.faydaId || newCustomer.faydaId.trim() === 'FYD-' || !newCustomer.faydaId.trim()) && (
                  <p className="text-[11px] text-red-400 mt-1 font-semibold flex items-center gap-1">
                    <span>⚠️ {t('Fayda ID number is required for KYC compliance (e.g. FYD-1234-5678).', 'የፋይዳ መታወቂያ ቁጥር ለKYC ህግ ያስፈልጋል (ምሳሌ FYD-1234-5678)።')}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('Max Credit Limit (ETB):', 'ከፍተኛ የዱቤ ገደብ (ETB)፦')}</label>
                <input
                  type="number"
                  placeholder="5000"
                  value={newCustomer.creditLimit}
                  onChange={e => {
                    setNewCustomer({ ...newCustomer, creditLimit: e.target.value });
                    if (customerRegError) setCustomerRegError('');
                  }}
                  className={`w-full bg-slate-900 border ${
                    customerRegError && (isNaN(parseFloat(newCustomer.creditLimit)) || parseFloat(newCustomer.creditLimit) < 0)
                      ? 'border-red-500 ring-1 ring-red-500/30'
                      : 'border-slate-800 focus:border-emerald-500'
                  } rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-bold focus:outline-none transition-colors`}
                />
                {customerRegError && (isNaN(parseFloat(newCustomer.creditLimit)) || parseFloat(newCustomer.creditLimit) < 0) && (
                  <p className="text-[11px] text-red-400 mt-1 font-semibold flex items-center gap-1">
                    <span>⚠️ {t('Credit limit must be a valid number of 0 or more.', 'የዱቤ ገደብ 0 ወይም ከዚያ በላይ ቁጥር መሆን አለበት።')}</span>
                  </p>
                )}
              </div>

              {customerRegError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{customerRegError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={customerRegSaving}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {customerRegSaving ? (
                  <span className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>{t('Registering...', 'በመመዝገብ ላይ...')}</span>
                  </span>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>{t('Create Customer Profile', 'የደንበኛ መገለጫ ይፍጠሩ')}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* TAB: LOG CREDIT SALE */}
        {activeTab === 'LOG_SALE' && (
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5 max-w-xl mx-auto animate-fade-in">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-100">{t('Log Dube Sale (Credit Purchase)', 'የዱቤ ሽያጭ መዝግብ (የዕዳ ግብይት)')}</h3>
                <p className="text-xs text-slate-400 font-medium">{t('Record items given on credit with real-time risk assessment', 'በዱቤ የተሰጡ እቃዎችን ከቅጽበታዊ ስጋት ግምገማ ጋር መዝግብ')}</p>
              </div>
            </div>

            {riskFeedback && (
              <div
                className={`p-4 rounded-xl border text-xs font-bold space-y-1 ${
                  riskFeedback.type === 'REJECTED'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  {riskFeedback.type === 'REJECTED' ? <Lock className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
                  <span>{riskFeedback.message}</span>
                </div>
                {riskFeedback.reason && <p className="text-slate-350 font-normal pl-6">{riskFeedback.reason}</p>}
              </div>
            )}

            <form noValidate onSubmit={handleLogCredit} className="space-y-4">
              {/* Customer Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('Select Customer Profile:', 'የደንበኛ መገለጫ ይምረጡ፦')}</label>
                <select
                  value={selectedCustomerId}
                  onChange={e => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  required
                >
                  <option value="">{t('-- Choose Customer from Ledger --', '-- ከሌጀር ደንበኛ ይምረጡ --')}</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.phone}) • {t('Avail', 'ቀሪ ነጻ ዱቤ')}: {(c.credit_limit - c.current_balance).toFixed(2)} ETB • {t('Status', 'ሁኔታ')}: {c.status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line Items Table */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-slate-300">{t('Itemized Breakdown:', 'የእቃዎች ዝርዝር መግለጫ፦')}</label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-xs text-emerald-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    {t('Add Line Item', 'አዲስ እቃ ጨምር')}
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        placeholder={t('Item name (e.g. Teff 25kg, Oil 5L)', 'የእቃ ስም (ምሳሌ፡ ጤፍ 25kg፣ ዘይት 5L)')}
                        value={item.name}
                        onChange={e => updateItem(idx, 'name', e.target.value)}
                        className="col-span-6 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                        required
                      />
                      <input
                        type="number"
                        placeholder={t('Qty', 'ብዛት')}
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                        required
                      />
                      <input
                        type="number"
                        placeholder={t('Price', 'ዋጋ')}
                        step="0.01"
                        value={item.unitPrice}
                        onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                        className="col-span-4 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Amount & Repayment Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">{t('Repayment Deadline:', 'የክፍያ መተግበሪያ ቀን ገደብ፦')}</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div className="text-right flex flex-col justify-center">
                  <span className="text-xs text-slate-400">{t('Total Purchase Amount:', 'ጠቅላላ የግዢ ዋጋ፦')}</span>
                  <span className="text-xl font-extrabold text-amber-400">{calculateTotal().toFixed(2)} ETB</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm shadow-lg shadow-amber-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{t('Evaluate Risk & Record Credit Sale', 'ስጋትን ገምግም እና የዱቤ ሽያጭ መዝግብ')}</span>
              </button>
            </form>
          </div>
        )}

        {/* Dashboard Home View */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            {/* Financial Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">{t('Total Outstanding Debt', 'አጠቃላይ ያልተከፈለ ብድር')}</p>
                <p className="text-xl font-black text-amber-400 mt-1">{totalOutstanding.toFixed(2)} ETB</p>
                <p className="text-[10px] text-slate-400 mt-1">{t('Dube credit currently in use by customers', 'በደንበኞች ጥቅም ላይ የዋለ የዱቤ ብድር')}</p>
              </div>
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">{t('Total Credit Approved', 'አጠቃላይ የተፈቀደ ብድር')}</p>
                <p className="text-xl font-black text-sky-400 mt-1">{totalLimit.toFixed(2)} ETB</p>
                <p className="text-[10px] text-slate-400 mt-1">{t('Max combined limit authorized for customers', 'ለደንበኞች የተፈቀደ ከፍተኛ የዱቤ መጠን')}</p>
              </div>
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">{t('Available Credit Pool', 'ያልተያዘ ነፃ የዱቤ መጠን')}</p>
                <p className="text-xl font-black text-emerald-400 mt-1">{(totalLimit - totalOutstanding).toFixed(2)} ETB</p>
              </div>
            </div>

            {/* Bank Account Details for Customer Payments */}
            <form noValidate onSubmit={saveBankAccount} className="glass-card p-5 rounded-2xl border border-slate-800/80 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    {t('Bank Account for Customer Payments', 'የደንበኞች ክፍያ የባንክ መለያ')}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t('Customers see these details when they choose bank transfer and pay, then upload the receipt.', 'ደንበኞች የባንክ ዝውውር ሲመርጡ እነዚህን መረጃዎች በመክፈል አላቸው ደረሰኝ ይጫናቸዋል።')}
                  </p>
                </div>
                {merchant?.bank_name && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                    {t('ACTIVE', 'ንቁ')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
                    {t('Bank Name', 'የባንክ ስም')}
                  </label>
                  <input
                    type="text"
                    value={bankForm.bankName}
                    onChange={e => setBankForm(prev => ({ ...prev, bankName: e.target.value }))}
                    placeholder={t('e.g. Commercial Bank of Ethiopia', 'ምሳሌ CBE')}
                    maxLength={100}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
                    {t('Account Holder', 'የሂሳብ ተባላሪ')}
                  </label>
                  <input
                    type="text"
                    value={bankForm.accountName}
                    onChange={e => setBankForm(prev => ({ ...prev, accountName: e.target.value }))}
                    placeholder={t('Store / company name', 'የድርጅት ስም')}
                    maxLength={200}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
                    {t('Account Number', 'የሂሳብ ቁጥር')}
                  </label>
                  <input
                    type="text"
                    value={bankForm.accountNumber}
                    onChange={e => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                    placeholder={t('e.g. 1000 2345 6789 0123', 'ምሳሌ 1000 2345 6789 0123')}
                    maxLength={50}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className={`text-[11px] font-semibold ${bankMessage?.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {bankMessage?.text || (!bankForm.bankName && !bankForm.accountName && !bankForm.accountNumber
                    ? t('Fill all three fields, or clear all three to hide bank details from customers.', 'ሦስቱንም መስኮች ይሞሉ፣ ወይም ሦስቱንም አጽዳ አላስቀምጡ።')
                    : '')}
                </p>
                <button
                  type="submit"
                  disabled={bankSaving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
                >
                  {bankSaving ? t('Saving...', 'በማስቀመጥ ላይ...') : t('Save Bank Details', 'ባንክ መረጃ አስቀምጥ')}
                </button>
              </div>
            </form>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Daily Sales Trend Line Graph */}
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Dube Weekly Sales Trend</h4>
                  <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">
                    Last 7 Days
                  </span>
                </div>
                <div className="relative pt-4">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32 overflow-visible">
                    <defs>
                      <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25"/>
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0"/>
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
                        stroke="#0ea5e9"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="drop-shadow-[0_0_6px_rgba(14,165,233,0.3)]"
                      />
                    )}

                    {/* Chart Points & Labels */}
                    {points.map((p, idx) => (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="4"
                          className="fill-sky-400 stroke-slate-900 stroke-2 hover:r-5 transition-all"
                        />
                        {p.sales > 0 && (
                          <text
                            x={p.x}
                            y={p.y - 10}
                            textAnchor="middle"
                            className="text-[9px] fill-sky-300 font-mono font-bold"
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

              {/* Credit Utilization Donut Graph */}
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Store Credit Utilization</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    utilizationPercent > 80 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : utilizationPercent > 50 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}>
                    {utilizationPercent > 80 ? 'High Risk' : utilizationPercent > 50 ? 'Moderate' : 'Optimal'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
                  {/* Circular Donut chart */}
                  <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      {/* Grey Base Ring */}
                      <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="transparent"
                        stroke="#1e293b"
                        strokeWidth="3"
                      />
                      {/* Utilization Ring */}
                      <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="transparent"
                        stroke={utilizationPercent > 80 ? '#f43f5e' : utilizationPercent > 50 ? '#f59e0b' : '#10b981'}
                        strokeWidth="3.2"
                        strokeDasharray={`${utilizationPercent} ${100 - utilizationPercent}`}
                        strokeDashoffset="0"
                        strokeLinecap="round"
                        className="transition-all duration-700 ease-out"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-base font-black text-slate-100 font-mono leading-none">{utilizationPercent}%</span>
                      <span className="text-[7.5px] font-extrabold text-slate-500 uppercase tracking-wider mt-1">{t('Utilized', 'በስራ ላይ')}</span>
                    </div>
                  </div>

                  {/* Legends & Details */}
                  <div className="flex-1 space-y-2 text-xs font-mono w-full sm:w-auto">
                    <div className="flex justify-between items-center border-b border-slate-800/60 pb-1">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                        {t('Available Pool:', 'ያልተያዘ ቀሪ ድምር፦')}
                      </span>
                      <span className="font-bold text-emerald-400">{(totalLimit - totalOutstanding).toFixed(0)} ETB</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800/60 pb-1">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span>
                        {t('Utilized Credit:', 'ጥቅም ላይ የዋለ ዱቤ፦')}
                      </span>
                      <span className="font-bold text-amber-500">{totalOutstanding.toFixed(0)} ETB</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-slate-700"></span>
                        {t('Approved Limit:', 'የተፈቀደ ወሰን፦')}
                      </span>
                      <span className="font-bold text-slate-300">{totalLimit.toFixed(0)} ETB</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* General Ledger Health and Shortcuts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ledger Summary Stats */}
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80 space-y-4">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">{t('Ledger Health Overview', 'የሌጀር ጤና አጠቃላይ እይታ')}</h4>
                <div className="space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{t('Active Credit Ledgers:', 'ንቁ የዱቤ ሌጀሮች፦')}</span>
                    <span className="font-bold text-emerald-400">{activeCount} {t('customers', 'ደንበኞች')}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{t('Restricted Ledgers:', 'የተገደቡ ሌጀሮች፦')}</span>
                    <span className="font-bold text-amber-500">{restrictedCount} {t('customers', 'ደንበኞች')}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{t('Overdue Invoices:', 'የክፍያ ጊዜ ያለፈባቸው ሂሳቦች፦')}</span>
                    <span className="font-bold text-red-500">{overdueCount} {t('accounts', 'አካውንቶች')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('Pending Approvals:', 'የሚጠባበቁ ማጽደቂያዎች፦')}</span>
                    <span className="font-bold text-yellow-400">{repayments.filter(r => r.status === 'PENDING').length} {t('uploads', 'የተጫኑ')}</span>
                  </div>
                </div>
              </div>

              {/* Direct Actions/Quick Links */}
              <div className="glass-card p-5 rounded-2xl border border-slate-800/80 space-y-4">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">{t('Quick Actions', 'ፈጣን እርምጃዎች')}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setActiveTab('CUSTOMERS')}
                    className="p-3 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left space-y-1 transition-all cursor-pointer group"
                  >
                    <Users className="w-5 h-5 text-emerald-400" />
                    <p className="text-[11px] font-bold text-slate-300 group-hover:text-emerald-400">{t('View Ledgers', 'ሌጀሮችን እይ')}</p>
                  </button>
                  <button
                    onClick={() => setActiveTab('TRANSACTIONS')}
                    className="p-3 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left space-y-1 transition-all cursor-pointer group"
                  >
                    <FileText className="w-5 h-5 text-sky-400" />
                    <p className="text-[11px] font-bold text-slate-300 group-hover:text-sky-400">{t('Credit History', 'የዱቤ ታሪክ')}</p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* TAB 1: CUSTOMERS INDEX */}
      {activeTab === 'CUSTOMERS' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              placeholder={t('Search by customer name, phone (+251...), or Fayda ID...', 'በደንበኛ ስም፣ ስልክ ቁጥር ወይም ፋይዳ መታወቂያ ይፈልጉ...')}
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCustomerPage(1); }}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedCustomers.map(customer => {
              const utilPercent = Math.min(100, Math.round((customer.current_balance / customer.credit_limit) * 100));

              return (
                <div
                  key={customer.id}
                  className={`glass-card p-5 rounded-2xl relative border transition-all hover:border-slate-700 ${
                    customer.status === 'RESTRICTED'
                      ? 'border-amber-500/40 bg-amber-950/10'
                      : customer.status === 'BLOCKED'
                      ? 'border-red-500/40 bg-red-950/10'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={getAvatarUrl(customer.photo_url, customer.full_name)}
                        alt={customer.full_name}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(customer.full_name)}`;
                        }}
                        className="w-12 h-12 rounded-xl object-cover border border-slate-700 shadow-md bg-slate-800"
                      />
                      <div>
                        <h4 className="font-bold text-sm text-slate-100">{customer.full_name}</h4>
                        <p className="text-xs text-slate-400 font-mono">{customer.phone}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        customer.status === 'ACTIVE'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : customer.status === 'RESTRICTED'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {customer.status === 'ACTIVE' ? t('ACTIVE', 'ንቁ') : customer.status === 'RESTRICTED' ? t('RESTRICTED', 'የተገደበ') : t('BLOCKED', 'የታገደ')}
                    </span>
                  </div>

                  {/* Fayda ID Badge */}
                  <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800/80 mb-3 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500 text-[10px]">{t('Fayda ID:', 'የፋይዳ መታወቂያ፦')}</span>
                    <span className="text-yellow-400 font-semibold">{customer.fayda_id}</span>
                  </div>

                  {/* Balance Gauge */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">{t('Current Balance:', 'የአሁኑ ቀሪ ሂሳብ፦')}</span>
                      <span className="font-bold text-amber-400">{customer.current_balance.toFixed(2)} ETB</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">{t('Max Limit:', 'ከፍተኛ ወሰን፦')}</span>
                      <span className="text-slate-300 font-semibold">{customer.credit_limit.toFixed(2)} ETB</span>
                    </div>

                    <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-all ${
                          utilPercent > 85 ? 'bg-red-500' : utilPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${utilPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 gap-2">
                    <button
                      onClick={() => {
                        setSelectedCustomerId(customer.id);
                        setRiskFeedback(null);
                        setActiveTab('LOG_SALE');
                      }}
                      disabled={customer.status === 'BLOCKED'}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-semibold border border-emerald-500/30 flex items-center justify-center gap-1 transition-all disabled:opacity-40"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>{t('Log Dube', 'ዱቤ መዝግብ')}</span>
                    </button>

                    <button
                      onClick={() => setItemsModalCustomer(customer)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-xs font-semibold border border-amber-500/30 flex items-center justify-center gap-1 transition-all cursor-pointer"
                      title={t('View Dube Items & Balance Breakdown', 'የተገዙ እቃዎችን እና ዝርዝር መግለጫን እይ')}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{t('Items', 'እቃዎች')}</span>
                    </button>

                    <button
                      onClick={() => openLimitModal(customer)}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 text-xs font-semibold border border-sky-500/30 flex items-center justify-center gap-1 transition-all cursor-pointer"
                      title={t('Adjust Credit Limit or Block Customer', 'የክሬዲት ወሰን አስተካክል ወይም ደንበኛውን አጥፋ')}
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>{t('Limit', 'ወሰን')}</span>
                    </button>

                    <button
                      onClick={() => {
                        setSmsTarget(customer);
                        setSmsSentResult(null);
                        setSmsType('REMINDER');
                        setCustomSmsMessage('');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 text-xs font-semibold border border-sky-500/30 flex items-center justify-center gap-1 transition-all cursor-pointer"
                      title={t('Compose & Send SMS Alert', 'የኤስኤምኤስ መልዕክት ጻፍ እና ላክ')}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{t('SMS Alert', 'ኤስኤምኤስ ላክ')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-xs mt-4">
              <button
                type="button"
                onClick={() => setCustomerPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white border border-slate-800 hover:border-slate-700 disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <span className="font-mono text-slate-400 font-bold">
                Page <strong className="text-emerald-400 font-extrabold">{currentPage}</strong> of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCustomerPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3.5 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white border border-slate-800 hover:border-slate-700 disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}



      {/* TAB 3: CREDIT HISTORY */}
      {activeTab === 'TRANSACTIONS' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-400" />
            {t('Itemized Dube Credit Purchases History', 'የዱቤ ዕዳ ግዢዎች ዝርዝር ታሪክ')}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono">
                  <th className="pb-3">{t('Ref Code', 'ማጣቀሻ ኮድ')}</th>
                  <th className="pb-3">{t('Customer', 'ደንበኛ')}</th>
                  <th className="pb-3">{t('Phone', 'ስልክ')}</th>
                  <th className="pb-3">{t('Total Amount', 'ጠቅላላ መጠን')}</th>
                  <th className="pb-3">{t('Due Date', 'መክፈያ ቀን')}</th>
                  <th className="pb-3">{t('Status', 'ሁኔታ')}</th>
                  <th className="pb-3">{t('Logged Date', 'የተመዘገበበት ቀን')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-800/40">
                    <td className="py-3.5 font-mono text-emerald-400 font-bold">{tx.transaction_ref}</td>
                    <td className="py-3.5 font-semibold text-slate-100">{tx.customer_name}</td>
                    <td className="py-3.5 font-mono text-slate-400">{tx.customer_phone}</td>
                    <td className="py-3.5 font-bold text-amber-400">{tx.total_amount.toFixed(2)} ETB</td>
                    <td className="py-3.5 font-mono text-slate-300">{tx.due_date ? String(tx.due_date).split('T')[0] : 'N/A'}</td>
                    <td className="py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          tx.status === 'SETTLED'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : tx.status === 'OVERDUE'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {tx.status === 'SETTLED' ? t('SETTLED', 'የተከፈለ') : tx.status === 'OVERDUE' ? t('OVERDUE', 'ቀን ያለፈበት') : t('PENDING', 'ያልተከፈለ')}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-500 font-mono">{new Date(tx.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: RECEIPT UPLOAD APPROVALS */}
      {activeTab === 'RECEIPT_APPROVALS' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-400" />
                {t('Uploaded Payment Receipts & Settlement Approvals', 'የተጫኑ የክፍያ ደረሰኞች እና የማጽደቂያ ወረፋ')}
              </h3>
              <p className="text-xs text-slate-400">{t('Review customer proof of payment screenshots and approve debt settlement', 'የደንበኞችን የባንክ ደረሰኝ ስክሪንሾት በማየት ክፍያውን ያጽድቁ')}</p>
            </div>

            {repayments.filter(r => r.status === 'PENDING').length > 0 && (
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold animate-pulse">
                ⏳ {repayments.filter(r => r.status === 'PENDING').length} {t('Pending Review', 'ማረጋገጫ በመጠባበቅ ላይ')}
              </span>
            )}
          </div>

          {repayments.filter(r => r.payment_gateway === 'RECEIPT_UPLOAD' || r.receipt_url).length === 0 ? (
            <div className="text-center py-10 bg-slate-900/40 rounded-xl border border-slate-800 text-slate-500 text-xs">
              📭 {t('No uploaded payment receipts awaiting review.', 'ምንም የሚጠባበቅ የክፍያ ደረሰኝ የለም።')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {repayments.filter(r => r.payment_gateway === 'RECEIPT_UPLOAD' || r.receipt_url).map(r => (
                <div key={r.id} className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800 space-y-3 shadow-lg">
                  {/* Customer Info */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <h4 className="font-bold text-sm text-slate-100">{r.customer_name}</h4>
                      <p className="text-xs text-slate-400 font-mono">{r.customer_phone}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      r.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : r.status === 'REJECTED'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                    }`}>
                      {r.status === 'PENDING' ? t('PENDING REVIEW', '⏳ ማረጋገጫ በመጠባበቅ ላይ') : r.status === 'REJECTED' ? t('REJECTED', 'ውድቅ የተደረገ') : t('COMPLETED', 'ተጠናቋል')}
                    </span>
                  </div>

                  {/* Payment Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-slate-500 text-[10px] block">{t('Amount Paid:', 'የተከፈለ መጠን፦')}</span>
                      <span className="text-emerald-400 font-bold text-sm">{r.amount.toFixed(2)} ETB</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">{t('Ref Code / TXN:', 'ማጣቀሻ ኮድ፦')}</span>
                      <span className="text-yellow-400 font-bold">{r.reference_code || r.repayment_ref}</span>
                    </div>
                  </div>

                  {/* Duplicate Submission Warning Alert */}
                  {(r.ref_usage_count > 1 || r.image_usage_count > 1) && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex flex-col gap-1 text-[11px] text-red-400">
                      <div className="flex items-center gap-1.5 font-extrabold uppercase tracking-wide">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span>{t('Duplicate Upload Warning!', '⚠️ የክፍያ ደረሰኝ ድግግሞሽ ማስጠንቀቂያ!')}</span>
                      </div>
                      <p className="text-slate-300">
                        {t('This payment has been submitted more than once:', 'ይህ ክፍያ ከአንድ ጊዜ በላይ ተልኳል፦')}
                        {r.ref_usage_count > 1 && <span className="block mt-0.5 font-semibold text-red-400">• {t('Transaction ID is used in submissions.', 'ማመሳከሪያ ኮዱ ከአንድ ጊዜ በላይ ስራ ላይ ውሏል።')}</span>}
                        {r.image_usage_count > 1 && <span className="block font-semibold text-red-400">• {t('Exact same receipt screenshot image uploaded multiple times.', 'ተመሳሳይ የደረሰኝ ፎቶ ከአንድ ጊዜ በላይ ተልኳል።')}</span>}
                      </p>
                      <p className="text-slate-400 italic text-[10px] mt-0.5">
                        {t('Verify the official bank SMS carefully before approving.', 'እባክዎን ማጽደቅዎ በፊት የባንክ የኤስኤምኤስ መልዕክቱን በጥንቃቄ ያረጋግጡ።')}
                      </p>
                    </div>
                  )}

                  {/* Receipt Image Thumbnail */}
                  {r.receipt_url ? (
                    <div className="relative group">
                      <img
                        src={r.receipt_url}
                        alt="Customer Receipt Proof"
                        onClick={() => setPreviewImage(r.receipt_url)}
                        className="w-full h-40 object-cover rounded-xl border border-slate-700 cursor-pointer hover:opacity-90 transition-all"
                      />
                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all rounded-xl pointer-events-none">
                        <span className="bg-slate-900/90 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 shadow-lg">
                          <Eye className="w-3.5 h-3.5 text-amber-400" /> {t('Tap to Zoom Receipt', 'ለማጉላት ደረሰኙን ይጫኑ')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-950/60 p-4 rounded-xl text-center text-slate-500 text-xs italic border border-slate-800">
                      {t('No image attached', 'ምንም ፎቶ አልተያያዘም')}
                    </div>
                  )}

                  {/* Action Buttons for PENDING receipts */}
                  {r.status === 'PENDING' && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleApproveRepayment(r.id, 'APPROVE')}
                        disabled={approvingId === r.id}
                        className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>{t('Approve Payment', 'ክፍያውን አጽድቅ')}</span>
                      </button>

                      <button
                        onClick={() => handleApproveRepayment(r.id, 'REJECT')}
                        disabled={approvingId === r.id}
                        className="py-2.5 px-3 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        <span>{t('Decline', 'ውድቅ አድርግ')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DEBT ESCALATIONS */}
      {activeTab === 'ESCALATIONS' && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                {t('Debt Escalation Management', 'የብድር ማስጠንቀቂያ አስተዳደር')}
              </h3>
              <p className="text-xs text-slate-400">{t('Manage overdue debt warnings and court letters', 'የያለፈባቸውን ብድር ማስጠንቀቂያ እና የፍርድ ቤት ደብዳቤዎችን ያስተዳድሩ')}</p>
            </div>

            {escalationCases.filter(c => c.status === 'SENT').length > 0 && (
              <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-mono font-bold animate-pulse">
                {escalationCases.filter(c => c.status === 'SENT').length} {t('Active Escalations', 'ንቁ ማስጠንቀቂያዎች')}
              </span>
            )}
          </div>

          {escalationCases.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/40 rounded-xl border border-slate-800 text-slate-500 text-xs">
              {t('No escalation cases found. Overdue debts will appear here automatically.', 'ምንም የማስጠንቀቂያ ጉዳይ አልተገኘም። የያለፈባቸው ብድር በራስ-አክል እዚህ ይታያሉ።')}
            </div>
          ) : (
            <div className="space-y-4">
              {escalationCases.map(ec => (
                <div key={ec.id} className={`bg-slate-900/90 rounded-2xl p-5 border space-y-4 shadow-lg ${
                  ec.escalation_type === 'COURT_LETTER' ? 'border-red-500/40' : 'border-slate-800'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-100">{ec.customer_name}</h4>
                      <p className="text-xs text-slate-400 font-mono">{ec.customer_phone}</p>
                      {ec.transaction_ref && (
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">Ref: {ec.transaction_ref}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        ec.status === 'RESOLVED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : ec.status === 'CLOSED'
                          ? 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                          : ec.escalation_type === 'COURT_LETTER'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {ec.status === 'RESOLVED' ? t('RESOLVED', 'ተብቷል') : ec.status === 'CLOSED' ? t('CLOSED', 'ተዘግቷል') : ec.escalation_type === 'COURT_LETTER' ? t('COURT LETTER', 'የፍርድ ቤት ደብዳቤ') : t('WARNING', 'ማስጠንቀቂያ')}
                      </span>
                      <span className="text-xs font-bold text-amber-400">{parseFloat(ec.amount).toFixed(2)} ETB</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">{t('Due Date', 'መክፈያ ቀን')}</span>
                      <span className="text-slate-300 font-bold">{ec.due_date ? String(ec.due_date).split('T')[0] : 'N/A'}</span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">{t('Warning Sent', 'ማስጠንቀቂያ ተልኳል')}</span>
                      <span className="text-slate-300 font-bold">{ec.warning_sent_at ? new Date(ec.warning_sent_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">{t('Letter On Page', 'በገጹ ላይ ያለ ደብዳቤ')}</span>
                      <span className="text-slate-300 font-bold">{ec.court_letter_issued_at ? new Date(ec.court_letter_issued_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">{t('Court Letter Notified', 'የፍርድ ቤት ደብዳቤ ተልኳል')}</span>
                      <span className="text-slate-300 font-bold">{ec.court_letter_sent_at ? new Date(ec.court_letter_sent_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] block">{t('Status', 'ሁኔታ')}</span>
                      <span className="text-slate-300 font-bold">{ec.status}</span>
                    </div>
                  </div>

                  {ec.court_letter_issued && !ec.court_letter_sent_at && (
                    <p className={`text-[11px] rounded-lg border p-2 ${
                      ec.court_letter_can_be_sent
                        ? 'bg-red-950/40 border-red-500/30 text-red-300'
                        : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
                    }`}>
                      {ec.court_letter_can_be_sent
                        ? t(
                            `The ${ec.grace_period_days} day grace period is over. The letter has been on the customer's page the whole time and is ready to be sent to them by SMS.`,
                            `${ec.grace_period_days} ቀናት ጊዜ አልፏል። ደብዳቤው ሙሉ በሙሉ ጊዜ በደንበኛው በገጹ ላይ ነብቷ ሲሆን በኤስኤምኤስ ለመላክ ተዘጋጅቷል።`
                          )
                        : t(
                            `The court letter is on the customer's Smart Dube page. You can send it to them by SMS in ${ec.days_until_court_letter} day${ec.days_until_court_letter === 1 ? '' : 's'}, once the ${ec.grace_period_days} day grace period is over.`,
                            `የፍርድ ቤት ደብዳቤው በደንበኛው በገጹ ላይ ይገኛል። በ${ec.grace_period_days} ቀናት ጊዜ ከፍተኗ በኋላ በ${ec.days_until_court_letter} ቀናት በኤስኤምኤስ ማስታወቅ ይችላሉ።`
                          )}
                    </p>
                  )}

                  {ec.notes && (
                    <p className="text-[11px] text-slate-400 italic bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      {t('Notes:', 'ማስታወሻዎች፦')} {ec.notes}
                    </p>
                  )}

                  {ec.status !== 'RESOLVED' && ec.status !== 'CLOSED' && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                      {ec.court_letter_issued && !ec.court_letter_sent_at && (
                        <button
                          onClick={() => handleEscalationAction(ec.id, 'COURT_LETTER')}
                          disabled={escalationActionId === ec.id + 'COURT_LETTER' || !ec.court_letter_can_be_sent}
                          title={!ec.court_letter_can_be_sent
                            ? t(
                                `Available in ${ec.days_until_court_letter} day(s), once the ${ec.grace_period_days} day grace period is over.`,
                                `በ${ec.grace_period_days} ቀናት ጊዜ ከፍተኗ በኋላ በ${ec.days_until_court_letter} ቀናት በኋላ ይሰራል።`
                              )
                            : undefined}
                          className="px-3 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600/20"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>{escalationActionId === ec.id + 'COURT_LETTER'
                            ? t('Sending...', 'በመላክ ላይ...')
                            : ec.court_letter_can_be_sent
                            ? t('Send Court Letter', 'የፍርድ ቤት ደብዳቤ ላክ')
                            : t(`Send Court Letter (in ${ec.days_until_court_letter}d)`, `የፍርድ ቤት ደብዳቤ ላክ (በ${ec.days_until_court_letter}ቀን)`)}</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleEscalationAction(ec.id, 'WARNING')}
                        disabled={escalationActionId === ec.id + 'WARNING'}
                        className="px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{escalationActionId === ec.id + 'WARNING' ? t('Sending...', 'በመላክ ላይ...') : t('Resend Warning', 'ማስጠንቀቂያ እንደገና ላክ')}</span>
                      </button>
                      <button
                        onClick={() => handleResolveEscalation(ec.id)}
                        disabled={escalationActionId === ec.id + 'RESOLVE'}
                        className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>{t('Mark Resolved', 'ተብቷል ምልክት አድርግ')}</span>
                      </button>
                      <button
                        onClick={() => handleCloseEscalation(ec.id)}
                        disabled={escalationActionId === ec.id + 'CLOSE'}
                        className="px-3 py-2 rounded-xl bg-slate-600/20 hover:bg-slate-600/30 text-slate-400 border border-slate-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{t('Close Case', 'ጉዳይ ዝጋ')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div> {/* right main content end */}
      </div> {/* outer sidebar grid wrapper end */}


      {/* ================ SMS COMPOSE MODAL ================ */}
      {smsTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="my-auto glass-panel w-full max-w-lg rounded-2xl border border-slate-700/60 shadow-2xl relative flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Send SMS Alert</h3>
                  <p className="text-[10px] text-slate-400 font-mono">{smsTarget.phone}</p>
                </div>
              </div>
              <button onClick={closeSmsModal} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
              {smsSentResult ? (
                /* ---- SUCCESS VIEW ---- */
                <div className="space-y-4">
                  <div className="text-center space-y-2 py-3">
                    <div className="w-14 h-14 mx-auto bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-emerald-400" />
                    </div>
                    <h4 className="text-base font-extrabold text-emerald-400">SMS Dispatched!</h4>
                    <p className="text-xs text-slate-400">Message delivered to Ethio Telecom SMS gateway</p>
                  </div>

                  {/* Simulated phone bubble */}
                  <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">SD</div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-200">Smart Dube</p>
                        <p className="text-[9px] text-slate-500 font-mono">{smsTarget.phone}</p>
                      </div>
                      <span className="ml-auto text-[9px] text-slate-500 font-mono">Just now</span>
                    </div>
                    <div className="bg-slate-800 rounded-2xl rounded-tl-sm p-3 max-w-[90%]">
                      <p className="text-xs text-slate-200 leading-relaxed">{getSmsPreview(smsTarget)}</p>
                    </div>
                    <p className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Delivered via Ethio Telecom Bulk SMS
                    </p>
                  </div>

                  <button
                    onClick={closeSmsModal}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
                  >
                    Close
                  </button>
                </div>
              ) : (
                /* ---- COMPOSE VIEW ---- */
                <div className="space-y-4">
                  {/* Customer Info */}
                  <div className="flex items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                    <img
                      src={getAvatarUrl(smsTarget.photo_url, smsTarget.full_name)}
                      alt={smsTarget.full_name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(smsTarget.full_name)}`;
                      }}
                      className="w-10 h-10 rounded-xl object-cover border border-slate-700 bg-slate-800"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-100">{smsTarget.full_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{smsTarget.phone}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-[10px] text-slate-500">Balance</p>
                      <p className="text-xs font-bold text-amber-400">{smsTarget.current_balance.toFixed(2)} ETB</p>
                    </div>
                  </div>

                  {/* Alert Type Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-2">Alert Type:</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: 'REMINDER', label: 'Reminder', icon: Bell, color: 'sky' },
                        { val: 'OVERDUE_ALERT', label: 'Overdue', icon: AlertCircle, color: 'red' },
                        { val: 'CUSTOM', label: 'Custom', icon: MessageSquare, color: 'purple' }
                      ].map(t => (
                        <button
                          key={t.val}
                          type="button"
                          onClick={() => setSmsType(t.val)}
                          className={`p-2.5 rounded-xl border text-center flex flex-col items-center gap-1 transition-all ${
                            smsType === t.val
                              ? `border-${t.color}-500 bg-${t.color}-500/10 text-${t.color}-400 font-bold shadow-md`
                              : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <t.icon className="w-4 h-4" />
                          <span className="text-[10px]">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Message Input */}
                  {smsType === 'CUSTOM' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Custom Message:</label>
                      <textarea
                        rows={3}
                        placeholder="Type your custom SMS message here..."
                        value={customSmsMessage}
                        onChange={e => setCustomSmsMessage(e.target.value)}
                        maxLength={160}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none"
                      />
                      <p className="text-[10px] text-slate-500 text-right mt-1">{customSmsMessage.length}/160 chars</p>
                    </div>
                  )}

                  {/* Live SMS Preview */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Message Preview</label>
                    <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300">SD</div>
                        <p className="text-[10px] font-bold text-slate-300">Smart Dube</p>
                        <span className="ml-auto text-[9px] text-slate-600 font-mono">SMS</span>
                      </div>
                      <div className="bg-slate-800 rounded-2xl rounded-tl-sm p-3 max-w-[90%]">
                        <p className="text-[11px] text-slate-300 leading-relaxed">{getSmsPreview(smsTarget)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Send Action Options: Direct Native Phone SMS & Gateway Bulk SMS */}
                  <div className="space-y-2 pt-1">
                    {smsError && (
                      <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{smsError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {/* 1. Direct Native Phone SMS app link */}
                      <a
                        href={`sms:${smsTarget.phone}?body=${encodeURIComponent(getSmsPreview(smsTarget))}`}
                        onClick={() => {
                          navigator.clipboard.writeText(`To: ${smsTarget.phone}\nMessage: ${getSmsPreview(smsTarget)}`);
                          setSmsFeedback(`Copied SMS text for ${smsTarget.phone} to clipboard!`);
                          setTimeout(() => setSmsFeedback(''), 4000);
                        }}
                        className="py-2.5 px-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all text-center"
                        title="Open Native Phone Messages App"
                      >
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                        <span>Open Phone SMS App</span>
                      </a>

                      {/* 2. Gateway Bulk SMS API */}
                      <button
                        type="button"
                        onClick={handleTriggerSMS}
                        disabled={smsSending || (smsType === 'CUSTOM' && !customSmsMessage.trim())}
                        className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-sky-500/30 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {smsSending ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Send via Gateway API</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 text-center px-2">
                      💡 <span className="text-slate-300 font-semibold">Tip:</span> On mobile phones, "Open Phone SMS App" opens your Messages app directly. On desktop browsers, click <span className="text-emerald-400 font-semibold">Open Pick an App</span> or use <span className="text-sky-400 font-semibold">Send via Gateway API</span>.
                    </p>

                    <button
                      type="button"
                      onClick={closeSmsModal}
                      className="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW DUBE ITEMS & BALANCE BREAKDOWN MODAL */}
      {limitModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setLimitModalCustomer(null)} />
          <div className="my-auto relative glass-card rounded-2xl border border-slate-700 w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">{t('Manage Credit Limit', 'የክሬዲት ወሰን አስተዳድር')}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {limitModalCustomer.full_name} • {limitModalCustomer.phone}
                </p>
              </div>
              <button
                onClick={() => setLimitModalCustomer(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-center">
                <p className="text-[10px] uppercase font-mono text-slate-500 font-bold">{t('Outstanding', 'ያልተከፈለ')}</p>
                <p className="text-base font-extrabold text-amber-400 mt-0.5">{parseFloat(limitModalCustomer.current_balance || 0).toFixed(2)} ETB</p>
              </div>
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 text-center">
                <p className="text-[10px] uppercase font-mono text-slate-500 font-bold">{t('Overdue Dubes', 'ያለፈበት ዱቤ')}</p>
                <p className="text-base font-extrabold text-red-400 mt-0.5">{parseInt(limitModalCustomer.overdue_count || 0)}</p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
                {t('New Credit Limit (ETB)', 'አዲስ የክሬዲት ወሰን (ETB)')}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={limitInput}
                onChange={e => setLimitInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                {t('Cannot be set below the outstanding balance.', 'ከያልተከፈለው ቀሪ ሂሳብ በታች ሊሆን አይችልም።')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">{t('Status:', 'ሁኔታ፦')}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                limitModalCustomer.status === 'ACTIVE'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : limitModalCustomer.status === 'RESTRICTED'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {limitModalCustomer.status}
              </span>
            </div>

            {limitError && (
              <p className="text-[11px] font-semibold text-red-400 bg-red-950/20 border border-red-500/20 rounded-lg p-2.5">{limitError}</p>
            )}
            {limitSuccess && (
              <p className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-2.5">{limitSuccess}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => saveCustomerUpdate(limitModalCustomer.status)}
                disabled={limitSaving}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                {limitSaving ? t('Saving...', 'በማስቀመጥ ላይ...') : t('Save Limit', 'ወሰን አስቀምጥ')}
              </button>
              <button
                onClick={() => saveCustomerUpdate('BLOCKED')}
                disabled={limitSaving || limitModalCustomer.status === 'BLOCKED'}
                className="px-3 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-bold border border-red-500/30 transition-all disabled:opacity-40"
              >
                {t('Block', 'አጥፋ')}
              </button>
              <button
                onClick={() => saveCustomerUpdate('ACTIVE')}
                disabled={limitSaving || limitModalCustomer.status === 'ACTIVE'}
                className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold border border-emerald-500/30 transition-all disabled:opacity-40"
              >
                {t('Unblock', 'ክፈት')}
              </button>
              <button
                onClick={() => saveCustomerUpdate('RESTRICTED')}
                disabled={limitSaving || limitModalCustomer.status === 'RESTRICTED'}
                className="px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-xs font-bold border border-amber-500/30 transition-all disabled:opacity-40"
              >
                {t('Restrict', 'ገደብ')}
              </button>
            </div>
          </div>
        </div>
      )}

      {itemsModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="my-auto glass-panel w-full max-w-2xl rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <img
                  src={getAvatarUrl(itemsModalCustomer.photo_url, itemsModalCustomer.full_name)}
                  alt={itemsModalCustomer.full_name}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(itemsModalCustomer.full_name)}`;
                  }}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-700 shadow-md bg-slate-800"
                />
                <div>
                  <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
                    {itemsModalCustomer.full_name}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      itemsModalCustomer.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : itemsModalCustomer.status === 'RESTRICTED'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {itemsModalCustomer.status}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Phone: {itemsModalCustomer.phone} • Fayda ID: <span className="text-yellow-400 font-semibold">{itemsModalCustomer.fayda_id}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setItemsModalCustomer(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 text-center">
                <p className="text-[10px] uppercase font-mono text-slate-500 font-bold">Current Dube Debt</p>
                <p className="text-lg font-extrabold text-amber-400 mt-0.5">{itemsModalCustomer.current_balance.toFixed(2)} ETB</p>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 text-center">
                <p className="text-[10px] uppercase font-mono text-slate-500 font-bold">Approved Credit Limit</p>
                <p className="text-lg font-extrabold text-sky-400 mt-0.5">{itemsModalCustomer.credit_limit.toFixed(2)} ETB</p>
              </div>

              <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 text-center">
                <p className="text-[10px] uppercase font-mono text-slate-500 font-bold">Available Remaining</p>
                <p className="text-lg font-extrabold text-emerald-400 mt-0.5">
                  {Math.max(0, itemsModalCustomer.credit_limit - itemsModalCustomer.current_balance).toFixed(2)} ETB
                </p>
              </div>
            </div>

            {/* Itemized Transactions & Products Breakdown */}
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-amber-400" />
                Itemized Dube Product History
              </h4>

              {(() => {
                const customerTx = transactions.filter(t => t.customer_id === itemsModalCustomer.id);

                if (customerTx.length === 0) {
                  return (
                    <div className="text-center py-8 bg-slate-900/40 rounded-xl border border-slate-800 text-slate-500 text-xs">
                      📭 No credit transactions or itemized purchases recorded for this customer profile yet.
                    </div>
                  );
                }

                return (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {customerTx.map(tx => (
                      <div key={tx.id} className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 space-y-2">
                        {/* Tx Header */}
                        <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sky-400 font-bold">{tx.transaction_ref}</span>
                            <span className="text-slate-500 font-mono text-[10px]">Due: {tx.due_date ? String(tx.due_date).split('T')[0] : 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              tx.status === 'SETTLED'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : tx.status === 'OVERDUE'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {tx.status}
                            </span>
                            <span className="font-bold text-amber-400 text-sm">{tx.total_amount.toFixed(2)} ETB</span>
                          </div>
                        </div>

                        {/* Items Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-slate-500 font-mono text-[10px] border-b border-slate-800/60">
                                <th className="pb-1">Item Name</th>
                                <th className="pb-1 text-center">Qty</th>
                                <th className="pb-1 text-right">Unit Price</th>
                                <th className="pb-1 text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 text-slate-300">
                              {tx.items && tx.items.map((item, i) => (
                                <tr key={i}>
                                  <td className="py-1.5 font-medium text-slate-200">{item.name}</td>
                                  <td className="py-1.5 text-center font-mono text-slate-400">{item.quantity}x</td>
                                  <td className="py-1.5 text-right font-mono text-slate-400">
                                    {item.unitPrice ? parseFloat(item.unitPrice).toFixed(2) : '-'} ETB
                                  </td>
                                  <td className="py-1.5 text-right font-mono font-bold text-emerald-400">
                                    {(item.total || (item.quantity * (item.unitPrice || 0))).toFixed(2)} ETB
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {tx.notes && (
                          <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-800/40">
                            Note: {tx.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <button
              onClick={() => setItemsModalCustomer(null)}
              className="w-full py-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold text-xs transition-all cursor-pointer"
            >
              Close Breakdown
            </button>
          </div>
        </div>
      )}
      {/* FULL RECEIPT IMAGE ZOOM PREVIEW MODAL */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="my-auto relative max-w-3xl w-full p-2 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg transition-all z-10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              alt="Full Receipt Proof"
              className="w-full max-h-[85vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {/* MERCHANT INBOX ALERTS & NOTIFICATIONS MODAL */}
      {alertsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="my-auto glass-panel w-full max-w-xl rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-100">
                    {t('Merchant Inbox Alerts & Notices', 'የነጋዴ የገቢ መልዕክቶች እና ማስጠንቀቂያዎች')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t('Real-time payment receipts, overdue alerts & audit notices', 'ቅጽበታዊ የክፍያ ደረሰኞች፣ ያለፈባቸው እዳዎች እና ማሳወቂያዎች')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAlertsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alerts List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[420px]">
              {visibleAlerts.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs bg-slate-900/30 rounded-xl border border-slate-850 p-6">
                  <p className="text-2xl mb-2">📭</p>
                  <p className="font-semibold">{t('You have no active alerts or notices.', 'ምንም ገባሪ ማሳወቂያ ወይም ማስጠንቀቂያ የለዎትም።')}</p>
                  <p className="text-[11px] text-slate-600 mt-1">{t('New receipt uploads and overdue credit alerts will appear here.', 'አዳዲስ የደረሰኝ ማረጋገጫዎች እና ያለፈባቸው እዳዎች እዚህ ይታያሉ።')}</p>
                </div>
              ) : (
                visibleAlerts.map(alert => {
                  const isPendingRec = alert.type === 'RECEIPT_PENDING';
                  const isOverdue = alert.type === 'OVERDUE';
                  const isPayment = alert.type === 'PAYMENT_RECEIVED';

                  return (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all ${
                        isPendingRec
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : isOverdue
                          ? 'bg-red-500/10 border-red-500/30 text-red-200'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="p-2 rounded-lg bg-black/30 shrink-0 mt-0.5">
                          {isPendingRec && <Upload className="w-4 h-4 text-amber-400" />}
                          {isOverdue && <AlertTriangle className="w-4 h-4 text-red-400" />}
                          {isPayment && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-100">{alert.title}</span>
                            {alert.timestamp && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">{alert.message}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {alert.actionTab && (
                          <button
                            onClick={() => {
                              setActiveTab(alert.actionTab);
                              setAlertsOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
                          >
                            {alert.actionLabel}
                          </button>
                        )}
                        {alert.actionTarget && (
                          <button
                            onClick={() => {
                              setSmsTarget(alert.actionTarget);
                              setAlertsOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                          >
                            {alert.actionLabel}
                          </button>
                        )}
                        <button
                          onClick={() => dismissAlert(alert.id)}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
              <span>{visibleAlerts.length} {t('Total Notices', 'ጠቅላላ ማሳወቂያዎች')}</span>
              <button
                onClick={() => setAlertsOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-colors cursor-pointer"
              >
                {t('Close', 'ዝጋ')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
