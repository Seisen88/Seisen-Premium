'use client';

import { useState, useEffect } from 'react';
import { Shield, CreditCard, Settings, LogOut, Search, Copy, Check, Lock, Loader2, AlertCircle, MessageSquare, Eye, FileCode, Plus, Save, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { getApiUrl, copyToClipboard } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';
import { fetchScripts } from '@/lib/scripts';

interface Payment {
  transaction_id: string;
  payer_email?: string;
  roblox_username?: string;
  tier: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  generated_keys: string | string[];
}

interface Ticket {
  id: string;
  ticket_number: string;
  user_name: string;
  user_email: string;
  subject: string;
  status: string;
  created_at: string;
}

interface Stats {
  totalPurchases: number;
  paypalPurchases: number;
  robloxPurchases: number;
  paypalRevenue: number;
  robloxRevenue: number;
}

type PremiumTier = 'weekly' | 'monthly' | 'lifetime';
type PaymentMethod = 'robux' | 'paypal' | 'gcash';

const PAYMENT_METHODS: { id: PaymentMethod; label: string; color: string; accent: string }[] = [
  { id: 'robux',  label: 'Robux',  color: 'amber',  accent: '#fbbf24' },
  { id: 'paypal', label: 'PayPal', color: 'blue',   accent: '#0070ba' },
  { id: 'gcash',  label: 'GCash',  color: 'green',  accent: '#22c55e' },
];

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [activeTab, setActiveTab] = useState<'payments' | 'tickets' | 'scripts' | 'settings'>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>({ totalPurchases: 0, paypalPurchases: 0, robloxPurchases: 0, paypalRevenue: 0, robloxRevenue: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Script metadata state
  const [scripts, setScripts] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [scriptSearch, setScriptSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [selectedScript, setSelectedScript] = useState<any | null>(null);
  const [bulkFeatures, setBulkFeatures] = useState('');
  const [stockLoading, setStockLoading] = useState(false);

  type MethodStockMap = Record<PremiumTier, Record<PaymentMethod, number>>;
  type MethodDraftMap = Record<PremiumTier, Record<PaymentMethod, string>>;
  const defaultMethodStock = (): MethodStockMap => ({
    weekly:   { robux: 0, paypal: 0, gcash: 0 },
    monthly:  { robux: 0, paypal: 0, gcash: 0 },
    lifetime: { robux: 0, paypal: 0, gcash: 0 },
  });
  const defaultMethodDraft = (): MethodDraftMap => ({
    weekly:   { robux: '0', paypal: '0', gcash: '0' },
    monthly:  { robux: '0', paypal: '0', gcash: '0' },
    lifetime: { robux: '0', paypal: '0', gcash: '0' },
  });
  const [methodStock, setMethodStock] = useState<MethodStockMap>(defaultMethodStock());
  const [methodDraft, setMethodDraft] = useState<MethodDraftMap>(defaultMethodDraft());
  const [savingMethodKey, setSavingMethodKey] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 5;
  const TABLE_ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      setIsAuthenticated(true);
      fetchData(token);
    }
  }, []);

  const fetchData = async (token: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${getApiUrl()}/api/admin/payments`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        logout();
        return;
      }

      if (!res.ok) throw new Error('Failed to fetch data');

      const data = await res.json();
      if (data.success) {
        setPayments(data.payments);
        setStats(data.stats);
      }
      
      // Fetch tickets
      const ticketRes = await fetch(`${getApiUrl()}/api/admin/tickets`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ticketData = await ticketRes.json();
      if (ticketData.success) {
        setTickets(ticketData.tickets);
      }

      await fetchPremiumStock(token);
    } catch (err) {
      console.error(err);
      setError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPremiumStock = async (token: string) => {
    try {
      setStockLoading(true);
      const res = await fetch(`${getApiUrl()}/api/admin/premium-stock?scope=paymentMethod`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const methodData = await res.json();
        const ms = methodData?.methodStocks || {};
        const newStock = defaultMethodStock();
        const newDraft = defaultMethodDraft();
        for (const tier of ['weekly', 'monthly', 'lifetime'] as PremiumTier[]) {
          for (const m of ['robux', 'paypal', 'gcash'] as PaymentMethod[]) {
            const val = Number(ms[tier]?.[m] || 0);
            newStock[tier][m] = val;
            newDraft[tier][m] = String(val);
          }
        }
        setMethodStock(newStock);
        setMethodDraft(newDraft);
      }
    } catch (error) {
      console.error('Error fetching premium stock:', error);
    } finally {
      setStockLoading(false);
    }
  };

  const saveMethodStock = async (tier: PremiumTier, method: PaymentMethod) => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) return;

      const value = Number(methodDraft[tier][method]);
      if (!Number.isInteger(value) || value < 0) {
        alert('Stock must be a non-negative integer.');
        return;
      }

      const key = `${method}-${tier}`;
      setSavingMethodKey(key);

      const res = await fetch(`${getApiUrl()}/api/admin/premium-stock`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ tier, method, stock: value }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update stock');

      const ms = data.methodStocks || {};
      const newStock = defaultMethodStock();
      const newDraft = defaultMethodDraft();
      for (const t of ['weekly', 'monthly', 'lifetime'] as PremiumTier[]) {
        for (const m of ['robux', 'paypal', 'gcash'] as PaymentMethod[]) {
          const val = Number(ms[t]?.[m] || 0);
          newStock[t][m] = val;
          newDraft[t][m] = String(val);
        }
      }
      setMethodStock(newStock);
      setMethodDraft(newDraft);
    } catch (error) {
      console.error('Error saving method stock:', error);
      const message = error instanceof Error ? error.message : 'Failed to save stock';
      alert(message);
    } finally {
      setSavingMethodKey(null);
    }
  };

  const loadScriptData = async () => {
    try {
      // Fetch scripts from GitHub
      const scriptsData = await fetchScripts();
      setScripts(scriptsData);

      // Fetch existing metadata from database
      const response = await fetch('/api/admin/script-metadata');
      const metadataData = await response.json();
      
      // Convert to map for easy lookup
      const metadataMap: Record<string, any> = {};
      metadataData.forEach((item: any) => {
        metadataMap[item.script_name] = item;
      });
      
      setMetadata(metadataMap);
    } catch (error) {
      console.error('Error loading script data:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'scripts' && scripts.length === 0) {
      loadScriptData();
    }
  }, [activeTab]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch(`${getApiUrl()}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      
      if (data.success) {
        // The backend returns a token, but the frontend in admin.js sends the password as the token?
        // backend/server.js expects `Bearer ${adminPassword}` in GET /api/admin/payments.
        // It returns a random token on login, but check middleware...
        // Ah, `app.get('/api/admin/payments'...)` checks `authHeader !== 'Bearer ' + adminPassword`?
        // Wait, line 944 of server.js: `if (!authHeader || authHeader !== 'Bearer ' + adminPassword)`.
        // So the token returned by login isn't used! The PASSWORD is used as the token.
        // I will store the password as the token, matching the logic I see in server.js.
        // Wait, `js/admin.js` line 41: `adminToken = password;`
        
        localStorage.setItem('adminToken', data.token);
        setIsAuthenticated(true);
        fetchData(data.token);
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch (err) {
      setError('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    setIsAuthenticated(false);
    setPassword('');
    setPayments([]);
  };

  const handleCopy = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // Script metadata functions
  const saveMetadata = async (scriptName: string) => {
    try {
      setSaving(scriptName);
      const data = metadata[scriptName];
      if (!data) return;

      const method = data.id ? 'PUT' : 'POST';
      const response = await fetch('/api/admin/script-metadata', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Failed to save');

      const savedData = await response.json();
      setMetadata(prev => ({ ...prev, [scriptName]: savedData }));
      alert('Saved successfully!');
    } catch (error) {
      console.error('Error saving metadata:', error);
      alert('Failed to save metadata');
    } finally {
      setSaving(null);
    }
  };

  const deleteMetadata = async (scriptName: string) => {
    if (!confirm(`Delete metadata for ${scriptName}?`)) return;

    try {
      const data = metadata[scriptName];
      if (!data?.id) return;

      const response = await fetch(`/api/admin/script-metadata?id=${data.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');

      setMetadata(prev => {
        const newMetadata = { ...prev };
        delete newMetadata[scriptName];
        return newMetadata;
      });
      alert('Deleted successfully!');
    } catch (error) {
      console.error('Error deleting metadata:', error);
      alert('Failed to delete metadata');
    }
  };

  const updateMetadata = (scriptName: string, field: string, value: any) => {
    setMetadata(prev => ({
      ...prev,
      [scriptName]: {
        ...prev[scriptName],
        script_name: scriptName,
        [field]: value,
      }
    }));
  };

  const addFeature = (scriptName: string) => {
    const current = metadata[scriptName]?.features || [];
    updateMetadata(scriptName, 'features', [...current, '']);
  };

  const updateFeature = (scriptName: string, index: number, value: string) => {
    const current = metadata[scriptName]?.features || [];
    const updated = [...current];
    updated[index] = value;
    updateMetadata(scriptName, 'features', updated);
  };

  const removeFeature = (scriptName: string, index: number) => {
    const current = metadata[scriptName]?.features || [];
    const updated = current.filter((_: string, i: number) => i !== index);
    updateMetadata(scriptName, 'features', updated);
  };

  const importBulkFeatures = (scriptName: string) => {
    if (!bulkFeatures.trim()) return;
    
    // Parse features from text - split by newlines and filter lines starting with * or -
    const features = bulkFeatures
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('*') || line.startsWith('-'))
      .map(line => line.replace(/^[\*\-]\s*/, '').trim())
      .filter(line => line.length > 0);
    
    if (features.length === 0) {
      alert('No features found. Make sure each feature starts with * or -');
      return;
    }

    const current = metadata[scriptName]?.features || [];
    updateMetadata(scriptName, 'features', [...current, ...features]);
    setBulkFeatures('');
    alert(`Imported ${features.length} features!`);
  };

  const filteredPayments = payments.filter(p => {
    const search = searchQuery.toLowerCase();
    return (
      (p.payer_email || '').toLowerCase().includes(search) ||
      (p.roblox_username || '').toLowerCase().includes(search) ||
      p.transaction_id.toLowerCase().includes(search) ||
      p.tier.toLowerCase().includes(search)
    );
  });

  const totalPaymentPages = Math.max(1, Math.ceil(filteredPayments.length / TABLE_ITEMS_PER_PAGE));
  const paginatedPayments = filteredPayments.slice(
    (paymentsPage - 1) * TABLE_ITEMS_PER_PAGE,
    paymentsPage * TABLE_ITEMS_PER_PAGE
  );

  const totalTicketPages = Math.max(1, Math.ceil(tickets.length / TABLE_ITEMS_PER_PAGE));
  const paginatedTickets = tickets.slice(
    (ticketsPage - 1) * TABLE_ITEMS_PER_PAGE,
    ticketsPage * TABLE_ITEMS_PER_PAGE
  );

  useEffect(() => {
    setPaymentsPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setPaymentsPage(1);
  }, [payments.length]);

  useEffect(() => {
    setTicketsPage(1);
  }, [tickets.length]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md p-8 animate-fade-in">
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-800 to-black border border-gray-700 flex items-center justify-center mb-4 shadow-xl">
                    <Shield className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Admin Access</h1>
                <p className="text-gray-500 text-sm">Authorized personnel only</p>
            </div>

            <form onSubmit={login} className="space-y-4">
                <div>
                   <input 
                     type="password"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     placeholder="Enter admin password"
                     className="w-full p-3 bg-[#141414] border border-[#2a2a2a] rounded-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
                     autoFocus
                   />
                </div>
                
                {error && (
                    <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Login'}
                </Button>
            </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 md:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
              <p className="text-gray-500 text-sm">Dashboard Overview</p>
            </div>
          </div>
          <Button variant="secondary" onClick={logout}>
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="p-5 border-l-4 border-l-blue-500">
                <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">Total Orders</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.totalPurchases}</p>
            </Card>
            <Card className="p-5 border-l-4 border-l-[#0070ba]">
                <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">PayPal</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.paypalPurchases}</p>
                <p className="text-sm text-[#0070ba] font-semibold mt-1">${stats.paypalRevenue.toFixed(2)}</p>
            </Card>
            <Card className="p-5 border-l-4 border-l-[#fbbf24]">
                <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">Roblox</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.robloxPurchases}</p>
                <p className="text-sm text-[#fbbf24] font-semibold mt-1">{stats.robloxRevenue.toLocaleString()} R$</p>
            </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[#2a2a2a] pb-4">
          {[
            { id: 'payments', label: 'Recent Payments', icon: CreditCard },
            { id: 'tickets', label: 'Support Tickets', icon: MessageSquare },
            { id: 'scripts', label: 'Script Metadata', icon: FileCode },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                    type="text"
                    placeholder="Search by email, username, transaction ID..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPaymentsPage(1);
                    }}
                    className="w-full pl-10 pr-4 py-3 bg-[#141414] border border-[#2a2a2a] rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50"
                />
            </div>

            {/* Payments Table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#0a0a0a]">
                    <tr>
                      <th className="text-left p-4 text-gray-400 font-medium">Order ID</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Date</th>
                      <th className="text-left p-4 text-gray-400 font-medium">User</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Plan</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Amount</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Method</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Key</th>
                      <th className="text-left p-4 text-gray-400 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f1f1f]">
                    {isLoading ? (
                        <tr>
                        <td colSpan={8} className="p-8 text-center text-gray-500">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                Loading data...
                            </td>
                        </tr>
                    ) : filteredPayments.length === 0 ? (
                        <tr>
                        <td colSpan={8} className="p-8 text-center text-gray-500">No payments found</td>
                        </tr>
                    ) : (
                      paginatedPayments.map((p) => {
                            let key = 'N/A';
                            try {
                                if (Array.isArray(p.generated_keys) && p.generated_keys.length > 0) key = p.generated_keys[0];
                                else if (typeof p.generated_keys === 'string') {
                                    if (p.generated_keys.startsWith('[')) {
                                        const parsed = JSON.parse(p.generated_keys);
                                        if (parsed.length > 0) key = parsed[0];
                                    } else {
                                        key = p.generated_keys;
                                    }
                                }
                            } catch (e) {}

                            return (
                                <tr key={p.transaction_id} className="hover:bg-[#1a1a1a] transition-colors">
                                    <td className="p-4 text-gray-500 font-mono text-xs">{p.transaction_id.substring(0, 12)}...</td>
                                    <td className="p-4 text-gray-300 whitespace-nowrap">
                                        {new Date(p.created_at).toLocaleDateString()}
                                        <div className="text-xs text-gray-600">{new Date(p.created_at).toLocaleTimeString()}</div>
                                    </td>
                                    <td className="p-4 text-white font-medium">{p.payer_email || p.roblox_username || 'N/A'}</td>
                                    <td className="p-4 capitalize">
                                        <span className="px-2 py-1 rounded-md bg-[#252525] border border-[#333] text-gray-300 text-xs">
                                            {p.tier}
                                        </span>
                                    </td>
                                    <td className="p-4 text-white font-medium">
                                        {p.currency === 'ROBUX' ? `${p.amount} R$` : `$${p.amount}`}
                                    </td>
                                    <td className="p-4">
                                        {p.currency === 'ROBUX' ? (
                                            <span className="text-amber-500 flex items-center gap-1 text-xs font-bold">● Robux</span>
                                        ) : (
                                            <span className="text-blue-500 flex items-center gap-1 text-xs font-bold">● PayPal</span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <code className="bg-[#111] px-2 py-1 rounded text-xs text-emerald-500 max-w-[100px] truncate">{key}</code>
                                            <button 
                                                onClick={() => handleCopy(key)}
                                                className="text-gray-500 hover:text-white transition-colors"
                                                title="Copy Key"
                                            >
                                                {copiedKey === key ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <Link 
                                          href={`/success?orderId=${p.transaction_id}&tier=${p.tier}&amount=${p.amount}&currency=${p.currency}&key=${key}&email=${p.payer_email || ''}&payerId=${p.payer_email || ''}&date=${p.created_at}&method=${p.currency === 'ROBUX' ? 'Robux' : 'PayPal'}&admin=1`}
                                          target="_blank"
                                        >
                                          <Button size="sm" variant="secondary" className="h-8 px-2 flex items-center justify-center gap-1">
                                            <Eye className="w-3.5 h-3.5" />
                                            View
                                          </Button>
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredPayments.length > 0 && totalPaymentPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-[#1f1f1f]">
                  <div className="text-sm text-gray-500">
                    Showing {((paymentsPage - 1) * TABLE_ITEMS_PER_PAGE) + 1} to {Math.min(paymentsPage * TABLE_ITEMS_PER_PAGE, filteredPayments.length)} of {filteredPayments.length} payments
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                      disabled={paymentsPage === 1}
                      size="sm"
                      variant="secondary"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPaymentPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setPaymentsPage(page)}
                          className={`px-3 py-1 rounded text-sm ${
                            paymentsPage === page
                              ? 'bg-emerald-500 text-white'
                              : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#252525]'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <Button
                      onClick={() => setPaymentsPage((p) => Math.min(totalPaymentPages, p + 1))}
                      disabled={paymentsPage === totalPaymentPages}
                      size="sm"
                      variant="secondary"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="space-y-4">
             <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#0a0a0a]">
                    <tr>
                      <th className="text-left p-4 text-gray-400 font-medium">Ticket #</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Status</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Subject</th>
                      <th className="text-left p-4 text-gray-400 font-medium">User</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Date</th>
                      <th className="text-left p-4 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f1f1f]">
                    {tickets.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-500">No tickets found</td>
                        </tr>
                    ) : (
                      paginatedTickets.map((t) => (
                            <tr key={t.id} className="hover:bg-[#1a1a1a] transition-colors">
                                <td className="p-4 text-white font-mono">{t.ticket_number}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs border ${
                                        t.status === 'open' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                        t.status === 'closed' ? 'bg-gray-500/10 text-gray-500 border-gray-500/20' :
                                        'bg-purple-500/10 text-purple-500 border-purple-500/20'
                                    } capitalize`}>
                                        {t.status.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="p-4 text-white">{t.subject}</td>
                                <td className="p-4 text-gray-400">
                                    <div className="text-white">{t.user_name}</div>
                                    <div className="text-xs">{t.user_email}</div>
                                </td>
                                <td className="p-4 text-gray-500 text-xs">
                                    {new Date(t.created_at).toLocaleDateString()}
                                </td>
                                 <td className="p-4">
                                     <Link href={`/admin/tickets/${t.ticket_number}`}>
                                         <Button size="sm" variant="secondary" className="h-8 px-2 flex items-center justify-center gap-1">
                                             <Eye className="w-3.5 h-3.5" />
                                             View
                                         </Button>
                                     </Link>
                                 </td>
                            </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>

              {tickets.length > 0 && totalTicketPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-[#1f1f1f]">
                  <div className="text-sm text-gray-500">
                    Showing {((ticketsPage - 1) * TABLE_ITEMS_PER_PAGE) + 1} to {Math.min(ticketsPage * TABLE_ITEMS_PER_PAGE, tickets.length)} of {tickets.length} tickets
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setTicketsPage((p) => Math.max(1, p - 1))}
                      disabled={ticketsPage === 1}
                      size="sm"
                      variant="secondary"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalTicketPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setTicketsPage(page)}
                          className={`px-3 py-1 rounded text-sm ${
                            ticketsPage === page
                              ? 'bg-emerald-500 text-white'
                              : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#252525]'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <Button
                      onClick={() => setTicketsPage((p) => Math.min(totalTicketPages, p + 1))}
                      disabled={ticketsPage === totalTicketPages}
                      size="sm"
                      variant="secondary"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'scripts' && (

  <div className="space-y-4">
    {/* Search */}
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
      <input
        type="text"
        placeholder="Search scripts..."
        value={scriptSearch}
        onChange={(e) => {
          setScriptSearch(e.target.value);
          setCurrentPage(1);
        }}
        className="w-full pl-10 pr-4 py-3 bg-[#141414] border border-[#2a2a2a] rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50"
      />
    </div>

    {/* Scripts Table */}
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0a]">
            <tr>
              <th className="text-left p-4 text-gray-400 font-medium">Title</th>
              <th className="text-left p-4 text-gray-400 font-medium">Status</th>
              <th className="text-left p-4 text-gray-400 font-medium">Type</th>
              <th className="text-left p-4 text-gray-400 font-medium">Last Updated</th>
              <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f1f1f]">
            {(() => {
              const filteredScripts = scripts.filter(s => 
                s.name.toLowerCase().includes(scriptSearch.toLowerCase())
              );
              const totalPages = Math.ceil(filteredScripts.length / ITEMS_PER_PAGE);
              const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
              const paginatedScripts = filteredScripts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

              if (paginatedScripts.length === 0) {
                return (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      {scriptSearch ? `No scripts found matching "${scriptSearch}"` : 'No scripts available'}
                    </td>
                  </tr>
                );
              }

              return paginatedScripts.map((script) => {
                const hasMeta = !!metadata[script.name]?.id;
                const lastUpdated = metadata[script.name]?.updated_at || metadata[script.name]?.created_at;
                
                return (
                  <tr key={script.id} className="hover:bg-[#1a1a1a] transition-colors">
                    <td className="p-4 text-white font-medium">{script.name}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-1 rounded border ${
                        script.status === 'Working' 
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}>
                        {script.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-1 rounded border ${
                        script.type === 'Premium'
                          ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                          : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                      }`}>
                        {script.type}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 text-xs">
                      {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        onClick={() => setSelectedScript(script)}
                        size="sm"
                        variant="secondary"
                        className="h-8 px-3 flex items-center justify-center gap-1 ml-auto"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </Button>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(() => {
        const filteredScripts = scripts.filter(s => 
          s.name.toLowerCase().includes(scriptSearch.toLowerCase())
        );
        const totalPages = Math.ceil(filteredScripts.length / ITEMS_PER_PAGE);

        if (totalPages > 1) {
          return (
            <div className="flex items-center justify-between p-4 border-t border-[#1f1f1f]">
              <div className="text-sm text-gray-500">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredScripts.length)} of {filteredScripts.length} scripts
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  size="sm"
                  variant="secondary"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded text-sm ${
                        currentPage === page
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#252525]'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  size="sm"
                  variant="secondary"
                >
                  Next
                </Button>
              </div>
            </div>
          );
        }
        return null;
      })()}
    </Card>

    {/* Edit Modal */}
    {selectedScript && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">{selectedScript.name}</h3>
                <div className="flex gap-2 mt-2">
                  <span className="text-xs px-2 py-1 rounded bg-[#333] text-gray-300">
                    {selectedScript.type}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    selectedScript.status === 'Working' 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {selectedScript.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedScript(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={metadata[selectedScript.name]?.description || ''}
                onChange={(e) => updateMetadata(selectedScript.name, 'description', e.target.value)}
                placeholder="Enter script description..."
                rows={4}
                className="w-full px-4 py-3 bg-black border border-[#333] rounded-lg text-white focus:outline-none focus:border-emerald-500/50 resize-none"
              />
            </div>

            {/* Features */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-300">
                  Features
                </label>
                <Button
                  onClick={() => addFeature(selectedScript.name)}
                  variant="secondary"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Feature
                </Button>
              </div>
              
              {/* Bulk Import */}
              <div className="mb-4 p-4 bg-[#0a0a0a] rounded-lg border border-[#2a2a2a]">
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Bulk Import Features
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Paste a list of features (one per line, starting with * or -). Example:
                </p>
                <textarea
                  value={bulkFeatures}
                  onChange={(e) => setBulkFeatures(e.target.value)}
                  placeholder="* Auto Farm&#10;- Kill Aura&#10;* Auto Quest&#10;- Auto Collect"
                  rows={4}
                  className="w-full px-3 py-2 bg-black border border-[#333] rounded text-white text-sm focus:outline-none focus:border-emerald-500/50 resize-none mb-2"
                />
                <Button
                  onClick={() => importBulkFeatures(selectedScript.name)}
                  variant="secondary"
                  size="sm"
                  disabled={!bulkFeatures.trim()}
                >
                  Import Features
                </Button>
              </div>

              <div className="space-y-2">
                {(metadata[selectedScript.name]?.features || []).map((feature: string, index: number) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={feature}
                      onChange={(e) => updateFeature(selectedScript.name, index, e.target.value)}
                      placeholder={`Feature ${index + 1}`}
                      className="flex-1 px-4 py-2 bg-black border border-[#333] rounded-lg text-white focus:outline-none focus:border-emerald-500/50"
                    />
                    <Button
                      onClick={() => removeFeature(selectedScript.name, index)}
                      variant="secondary"
                      size="sm"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {(!metadata[selectedScript.name]?.features || metadata[selectedScript.name].features.length === 0) && (
                  <p className="text-sm text-gray-500 italic">No features added yet</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  saveMetadata(selectedScript.name);
                  setSelectedScript(null);
                }}
                disabled={saving === selectedScript.name}
                className="flex-1"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving === selectedScript.name ? 'Saving...' : 'Save Changes'}
              </Button>
              {metadata[selectedScript.name]?.id && (
                <Button
                  onClick={() => {
                    deleteMetadata(selectedScript.name);
                    setSelectedScript(null);
                  }}
                  variant="secondary"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button
                onClick={() => setSelectedScript(null)}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )}
  </div>
)}


        {activeTab === 'settings' && (
            <Card className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">Stock by Payment Method</h3>
                <p className="text-gray-500 text-sm">Set individual stock for Robux, PayPal, and GCash per tier.</p>
              </div>

              {stockLoading ? (
                <div className="text-gray-400 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading stock...
                </div>
              ) : (
                <div className="space-y-6">
                  {PAYMENT_METHODS.map(({ id: methodId, label, accent }) => (
                    <div key={methodId}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent }} />
                        <p className="text-white font-semibold text-sm">{label}</p>
                      </div>
                      <div className="grid md:grid-cols-3 gap-4">
                        {(['weekly', 'monthly', 'lifetime'] as PremiumTier[]).map((tier) => {
                          const saveKey = `${methodId}-${tier}`;
                          const currentVal = methodStock[tier][methodId];
                          return (
                            <div
                              key={tier}
                              className="bg-[#101010] border border-[#2a2a2a] rounded-xl p-4 space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-white font-semibold capitalize text-sm">{tier}</p>
                                <span
                                  className={`text-xs px-2 py-1 rounded border ${
                                    currentVal > 0
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                                  }`}
                                >
                                  {currentVal > 0 ? 'In Stock' : 'Out of Stock'}
                                </span>
                              </div>

                              <input
                                type="number"
                                min={0}
                                value={methodDraft[tier][methodId]}
                                onChange={(e) =>
                                  setMethodDraft((prev) => ({
                                    ...prev,
                                    [tier]: { ...prev[tier], [methodId]: e.target.value },
                                  }))
                                }
                                className="w-full p-2.5 bg-[#141414] border border-[#2a2a2a] rounded-lg text-white focus:outline-none focus:border-emerald-500/50"
                              />

                              <Button
                                className="w-full"
                                onClick={() => saveMethodStock(tier, methodId)}
                                disabled={savingMethodKey === saveKey}
                              >
                                {savingMethodKey === saveKey ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                                Save
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
        )}
      </div>
    </div>
  );
}
