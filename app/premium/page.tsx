'use client';

import { useState, useEffect, Suspense } from 'react';
import { Crown, Check, HelpCircle, History, CreditCard, Copy, X, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import PricingCard from '@/components/ui/PricingCard';
import PurchaseCounter from '@/components/ui/PurchaseCounter';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { getApiUrl, copyToClipboard } from '@/lib/utils';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type PaymentMethod = 'paypal' | 'robux' | 'gcash';
type PremiumTier = 'weekly' | 'monthly' | 'lifetime';
type PremiumStockMap = Record<PremiumTier, number>;

// ... (Plans data same as before, I will include them to be safe)
const paypalPlans = [
  {
    title: 'Weekly',
    badge: '7 Days',
    price: 3,
    currency: '€',
    period: '/week',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access'],
    plan: 'weekly',
  },
  {
    title: 'Monthly',
    badge: '30 Days',
    price: 5,
    currency: '€',
    period: '/month',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access', 'Exclusive updates'],
    plan: 'monthly',
  },
  {
    title: 'Lifetime',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access', 'Exclusive updates', 'Lifetime access'],
    plan: 'lifetime',
    price: 10,
    originalPrice: 12,
    badge: '17% OFF',
    badgeVariant: 'best-value' as const,
    featured: true,
  },
];

const robuxPlans = [
  {
    title: 'Weekly',
    badge: '7 Days',
    price: 500,
    currency: '',
    period: '',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access'],
    plan: 'weekly',
  },
  {
    title: 'Monthly',
    badge: '30 Days',
    price: 800,
    currency: '',
    period: '',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access', 'Exclusive updates'],
    plan: 'monthly',
  },
  {
    title: 'Lifetime',
    badge: '16% OFF',
    badgeVariant: 'best-value' as const,
    price: 1600,
    originalPrice: 1900,
    currency: '',
    period: '',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access', 'Exclusive updates', 'Lifetime access'],
    plan: 'lifetime',
    featured: true,
  },
];

const gcashPlans = [
  {
    title: 'Weekly',
    badge: '7 Days',
    price: 250,
    currency: '₱',
    period: '/week',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access'],
    plan: 'weekly',
  },
  {
    title: 'Monthly',
    badge: '30 Days',
    price: 400,
    currency: '₱',
    period: '/month',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access', 'Exclusive updates'],
    plan: 'monthly',
  },
  {
    title: 'Lifetime',
    badge: '18% OFF',
    badgeVariant: 'best-value' as const,
    price: 700,
    originalPrice: 850,
    currency: '₱',
    period: 'one-time',
    features: ['All premium scripts', 'No key system', 'Priority support', 'Early access', 'Exclusive updates', 'Lifetime access'],
    plan: 'lifetime',
    featured: true,
  },
];

const faqs = [
  {
    question: 'How do I get premium?',
    answer: "Choose your preferred payment method and plan, then complete the payment. You'll receive instant access!",
  },
  {
    question: "What's included?",
    answer: 'All premium scripts, no key system, priority support, early access to new features, and exclusive updates.',
  },
  {
    question: 'Refund Policy',
    answer: 'All sales are final. We do not offer refunds, so please make sure you are certain before purchasing.',
  },
  {
    question: 'Need help?',
    answer: 'Join our Discord server for support or open a ticket for payment assistance.',
  },
];

function PremiumContent() {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('paypal');
  const [showTosModal, setShowTosModal] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{ plan: string; amount: number; price: number } | null>(null);
  
  const [showRobuxModal, setShowRobuxModal] = useState(false);
  const [robloxUsername, setRobloxUsername] = useState('');
  const [email, setEmail] = useState(''); // NEW POINTER: Email State
  const [robuxDetails, setRobuxDetails] = useState<{ plan: string; price: number; productId: number } | null>(null);
  
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketDetails, setTicketDetails] = useState<{ plan: string; amount: number; currency: string } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  // NEW: Status Modal State
  const [statusModal, setStatusModal] = useState<{
      isOpen: boolean;
      type: 'success' | 'error';
      title: string;
      message: string;
      details?: string;
  }>({ isOpen: false, type: 'success', title: '', message: '' });
  const [stockMap, setStockMap] = useState<PremiumStockMap>({ weekly: 0, monthly: 0, lifetime: 0 });
  const [stockLoading, setStockLoading] = useState(true);

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Check for PayPal return
    const token = searchParams.get('token');
    const status = searchParams.get('status');

    if (token && !isProcessing) {
      capturePayPalOrder(token);
    }
  }, [searchParams]);

  const loadPremiumStocks = async () => {
    try {
      const response = await fetch('/api/premium-stock', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load stock');

      const data = await response.json();
      if (data?.stocks) {
        setStockMap({
          weekly: Number(data.stocks.weekly || 0),
          monthly: Number(data.stocks.monthly || 0),
          lifetime: Number(data.stocks.lifetime || 0),
        });
      }
    } catch (error) {
      console.error('Failed to load premium stocks:', error);
    } finally {
      setStockLoading(false);
    }
  };

  useEffect(() => {
    loadPremiumStocks();
  }, []);

  const getTierStock = (tier: string) => {
    if (tier === 'weekly' || tier === 'monthly' || tier === 'lifetime') {
      return stockMap[tier];
    }
    return 0;
  };

  const capturePayPalOrder = async (orderId: string) => {
    setIsProcessing(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/paypal/capture-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderID: orderId }),
      });

      const data = await response.json();
      
      // Check if we actually got a key
      if (data.success && data.keys && data.keys.length > 0 && data.keys[0]) {
         const generatedKey = String(data.keys[0]);
         
         // Custom Modal instead of alert
         setStatusModal({
             isOpen: true,
             type: 'success',
             title: 'Purchase Successful!',
             message: 'Your key has been generated. Redirecting you to the receipt...'
         });

         const successParams = {
             orderId: data.transactionId || 'PAYPAL',
             dbOrderId: data.orderId,
             tier: data.tier,
             amount: String(data.amount),
             currency: String(data.currency),
             key: generatedKey,
             method: 'paypal',
             email: data.payerEmail || '',
             payerId: data.payerId || '',
             payerName: data.payerName || '',
         };

         // Auto-Login the user for Client Area
         localStorage.setItem('client_email', data.payerEmail || '');
         // Verification is implicit since they just paid
         localStorage.setItem('client_auth', 'true'); 

         // Redirect to Success Page
         setTimeout(() => {
             const params = new URLSearchParams({
                 orderId: successParams.orderId,
                 tier: successParams.tier,
                 amount: successParams.amount,
                 currency: successParams.currency,
                 key: successParams.key,
                 email: successParams.email,
                 payerId: successParams.payerId,
                 method: successParams.method,
                 date: new Date().toISOString()
             });
             router.push(`/success?${params.toString()}`);
         }, 1000);

      } else {
         // EXPOSE THE ERROR TO THE USER
         const errorMessage = data.junkieError || data.error || 'No key returned from server';
         const errorDetails = data.junkieDetails ? JSON.stringify(data.junkieDetails) : undefined;
         
         setStatusModal({
             isOpen: true,
             type: 'error',
             title: 'Activation Failed',
             message: errorMessage,
             details: errorDetails
         });
         setIsProcessing(false); // Stop loading to show error
      }
    } catch (error: any) {
      console.error('Capture error:', error);
      setStatusModal({
         isOpen: true,
         type: 'error',
         title: 'System Error',
         message: 'An unexpected error occurred while processing your payment.',
         details: error.message
      });
      setIsProcessing(false);
    }
  };



  const handleRobuxPayment = (plan: string, price: number) => {
      if (getTierStock(plan) <= 0) {
        setStatusModal({
          isOpen: true,
          type: 'error',
          title: 'Out of Stock',
          message: 'This premium plan is currently out of stock.'
        });
        return;
      }

      let productId = 16906166414; // Default Lifetime
      if (plan === 'weekly') productId = 16902313522;
      if (plan === 'monthly') productId = 16902308978;

      setRobuxDetails({ plan, price, productId });
      setRobloxUsername(''); 
      setEmail(''); // Reset email
      setShowRobuxModal(true);
  };

  const verifyRobuxPurchase = async () => {
    if (!robuxDetails || !robloxUsername.trim() || !email.trim()) return; // Validate email
    
    setIsProcessing(true);
    setShowRobuxModal(false); 

    try {
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/roblox/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: robloxUsername,
                email: email, // Send email
                tier: robuxDetails.plan
            }),
        });

        const data = await response.json();

        if (data.success && data.keys && data.keys.length > 0) {
             const generatedKey = String(data.keys[0]);
             
             setStatusModal({
                 isOpen: true,
                 type: 'success',
                 title: data.isRenewal ? 'Renewal Successful!' : 'Verification Successful!',
                 message: data.message || 'Key generated successfully. Redirecting you to the receipt...'
             });

             const successParams = {
                 orderId: data.transactionId || `ROBLOX-${data.userId}-${data.tier}`,
                 dbOrderId: data.transactionId || `ROBLOX-${data.userId}-${data.tier}`,
                 tier: data.tier,
                 amount: String(robuxDetails.price),
                 currency: 'ROBUX',
                 key: generatedKey,
                 method: 'robux',
                 email: `${data.username}@roblox.com`, 
                 payerId: `ROBLOX_${data.userId}`, 
                 payerName: data.username, 
             };

             // Auto-Login
             // Use the email user ENTERED, not the fallback roblox one, so it matches their input
             localStorage.setItem('client_email', email);
             localStorage.setItem('client_auth', 'true');

             setTimeout(() => {
                 // specific query params for success page
                 const params = new URLSearchParams({
                     orderId: successParams.orderId,
                     tier: successParams.tier,
                     amount: successParams.amount,
                     currency: successParams.currency,
                     key: successParams.key,
                     email: email, // Use input email
                     payerId: successParams.payerId,
                     method: successParams.method,
                     date: new Date().toISOString()
                 });

                 router.push(`/success?${params.toString()}`);
             }, 1000);

               loadPremiumStocks();

        } else {
             setStatusModal({
                 isOpen: true,
                 type: 'error',
                 title: 'Verification Failed',
                 message: data.error || 'Could not verify ownership.',
                 details: data.details
             });
        }
    } catch (error: any) {
        console.error('Verification error:', error);
        setStatusModal({
             isOpen: true,
             type: 'error',
             title: 'System Error',
             message: 'An unexpected error occurred.',
             details: error.message
        });
    } finally {
        setIsProcessing(false);
    }
  };

  const handlePayPalPayment = (plan: string, amount: number) => {
    if (getTierStock(plan) <= 0) {
      setStatusModal({
        isOpen: true,
        type: 'error',
        title: 'Out of Stock',
        message: 'This premium plan is currently out of stock.'
      });
      return;
    }

    setPendingPlan({ plan, amount, price: amount });
    setShowTosModal(true);
  };

  const handleTicketPayment = (plan: string, amount: number, currency: string) => {
    if (getTierStock(plan) <= 0) {
      setStatusModal({
        isOpen: true,
        type: 'error',
        title: 'Out of Stock',
        message: 'This premium plan is currently out of stock.'
      });
      return;
    }

    setTicketDetails({ plan, amount, currency });
    setPendingPlan({ plan, amount, price: amount }); // Just for TOS context
    setShowTosModal(true);
  };

  const proceedWithPayment = async () => {
    if (!pendingPlan) return;
    
    setShowTosModal(false);
    
    if (paymentMethod === 'paypal') {
        try {
            // Show processing immediately
            setIsProcessing(true);
            
            const apiUrl = getApiUrl();
            const response = await fetch(`${apiUrl}/api/paypal/create-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                tier: pendingPlan.plan,
                amount: pendingPlan.amount,
                currency: 'EUR',
                description: 'Seisen Hub Premium Access',
                }),
            });
            
            const data = await response.json();

            if (!response.ok) {
              setIsProcessing(false);
              setStatusModal({
                  isOpen: true,
                  type: 'error',
                  title: 'Purchase Blocked',
                  message: data.error || 'Unable to continue checkout.',
              });
              loadPremiumStocks();
              return;
            }

            const approvalLink = data.links?.find((link: any) => link.rel === 'approve');
            
            if (approvalLink) {
                window.location.href = approvalLink.href;
            } else {
                console.error('PayPal response:', data);
                setIsProcessing(false);
                setStatusModal({
                    isOpen: true,
                    type: 'error',
                    title: 'PayPal Error',
                    message: 'Failed to create PayPal order. Please try again.',
                    details: 'No approval link returned'
                });
            }
        } catch (error: any) {
            console.error('Payment error:', error);
            setIsProcessing(false);
            setStatusModal({
                isOpen: true,
                type: 'error',
                title: 'Connection Error',
                message: 'Failed to initiate payment.',
                details: error.message
            });
        }
    } else {
        // Show ticket modal
        if (ticketDetails) setShowTicketModal(true);
    }
  };

  const getCurrentPlans = () => {
    switch (paymentMethod) {
      case 'robux': return robuxPlans;
      case 'gcash': return gcashPlans;
      default: return paypalPlans;
    }
  };

  const copyTicketDetails = async () => {
      if (!ticketDetails) return;
      const text = `Premium Purchase Request\n\nPlan: ${ticketDetails.plan}\nAmount: ${ticketDetails.amount} ${ticketDetails.currency}\nMethod: ${ticketDetails.currency}`;
      await copyToClipboard(text);
      alert('Details copied to clipboard!'); 
      // Keep simple alert for copy for now, or use a toast if available. keeping simple to minimize diffs unless requested.
  };

  return (
    <div className="min-h-screen py-8 px-4 md:px-8">
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Header */}
        <section className="text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg shadow-yellow-500/30">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Premium Access</h1>
          <p className="text-gray-500">
            Unlock all features with instant access, no key system required
          </p>
        </section>

        <section className="flex justify-center -mt-8 mb-8">
            <PurchaseCounter />
        </section>

        {/* Payment Method Selection */}
        <section>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Payment Method:</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setPaymentMethod('paypal')}
              className={`px-4 py-2.5 rounded-lg border transition-all flex items-center gap-2 ${
                paymentMethod === 'paypal'
                  ? 'accent-bg accent-border accent-text'
                  : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
              }`}
              title="PayPal"
            >
              <img 
                src="/images/paypal.png" 
                alt="PayPal" 
                className="w-5 h-5 object-contain"
              />
            </button>
            <button
              onClick={() => setPaymentMethod('robux')}
              className={`px-4 py-2.5 rounded-lg border transition-all flex items-center gap-2 ${
                paymentMethod === 'robux'
                  ? 'accent-bg accent-border accent-text'
                  : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
              }`}
              title="Robux"
            >
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/c/c7/Robux_2019_Logo_gold.svg" 
                alt="Robux" 
                className="w-5 h-5"
              />
            </button>
            <button
              onClick={() => setPaymentMethod('gcash')}
              className={`px-4 py-2.5 rounded-lg border transition-all flex items-center gap-2 ${
                paymentMethod === 'gcash'
                  ? 'accent-bg accent-border accent-text'
                  : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
              }`}
              title="GCash"
            >
              <img 
                 src="/images/gcash.png" 
                 alt="GCash" 
                 className="w-6 h-6 object-contain"
               />
            </button>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="grid md:grid-cols-3 gap-6">
          {getCurrentPlans().map((plan) => (
            (() => {
              const tierStock = getTierStock(plan.plan);
              const isOutOfStock = !stockLoading && tierStock <= 0;
              const stockStatusText = stockLoading
                ? 'Checking stock...'
                : tierStock <= 5
                    ? `${tierStock} left (low stock)`
                    : `${tierStock} in stock`;

              return (
            <PricingCard
              key={plan.plan}
              title={plan.title}
              badge={plan.badge}
              badgeVariant={plan.badgeVariant}
              price={plan.price}
              // @ts-ignore
              originalPrice={plan.originalPrice}
              currency={plan.currency}
              period={plan.period}
              features={plan.features}
              featured={plan.featured}
              stockStatusText={isOutOfStock ? undefined : stockStatusText}
              stockStatusVariant={isOutOfStock ? 'out-of-stock' : tierStock <= 5 ? 'low-stock' : 'in-stock'}
              isOutOfStock={isOutOfStock}
              buttonText={isOutOfStock ? 'Out of Stock' : paymentMethod === 'paypal' ? 'Pay with PayPal' : 'Verify & Get Key'}
              buttonIcon={
                paymentMethod === 'paypal' && !isOutOfStock ? (
                  <CreditCard className="w-4 h-4" />
                ) : null
              }
              onButtonClick={() => {
                if (paymentMethod === 'paypal') {
                  handlePayPalPayment(plan.plan, plan.price);
                } else if (paymentMethod === 'robux') {
                  handleRobuxPayment(plan.plan, plan.price);
                } else {
                  handleTicketPayment(plan.plan, plan.price, 'GCash');
                }
              }}
              priceIcon={
                paymentMethod === 'robux' ? (
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/c/c7/Robux_2019_Logo_gold.svg" 
                    alt="R$" 
                    className="w-6 h-6 mr-1 object-contain"
                  />
                ) : undefined
              }
            />
              );
            })()
          ))}
        </section>

        {/* FAQ Section */}
        <section>
          <h2 className="text-xl font-bold text-white mb-6">Frequently Asked Questions</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {faqs.map((faq, index) => (
              <Card key={index} variant="hover" className="p-5">
                <h3 className="font-medium text-white mb-2 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 accent-text" />
                  {faq.question}
                </h3>
                <p className="text-gray-500 text-sm">{faq.answer}</p>
              </Card>
            ))}
          </div>
        </section>
      </div>

      {/* Processing Modal */}
      {isProcessing && !statusModal.isOpen && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
              <div className="text-center animate-fade-in">
                  <Loader2 className="w-12 h-12 accent-text animate-spin mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-white mb-2">Processing Payment...</h2>
                  <p className="text-gray-500 max-w-sm mx-auto">
                      Please do not close this window or refresh the page. This may take a few seconds.
                  </p>
              </div>
          </div>
      )}

      {/* Status Modal */}
      {statusModal.isOpen && (
          <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
              <Card className="w-full max-w-md p-6 text-center border shadow-2xl relative">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                      statusModal.type === 'success' ? 'accent-bg accent-text' : 'bg-red-500/20 text-red-500'
                  }`}>
                      {statusModal.type === 'success' ? <CheckCircle className="w-8 h-8"/> : <AlertCircle className="w-8 h-8"/>}
                  </div>
                  
                  <h2 className="text-2xl font-bold text-white mb-2">{statusModal.title}</h2>
                  <p className="text-gray-400 mb-6">{statusModal.message}</p>
                  
                  {statusModal.details && (
                      <div className="bg-[#0a0a0a] p-3 rounded text-left mb-6 overflow-hidden">
                          <p className="text-xs text-gray-500 mb-1 font-mono uppercase">Error Details:</p>
                          <code className="text-xs text-red-400 block break-words">{statusModal.details}</code>
                      </div>
                  )}

                  <Button 
                      onClick={() => setStatusModal({ ...statusModal, isOpen: false })}
                      className="w-full"
                      variant={statusModal.type === 'success' ? 'primary' : 'secondary'}
                  >
                      {statusModal.type === 'success' ? 'Continue' : 'Close and Try Again'}
                  </Button>
              </Card>
          </div>
      )}

      {/* TOS Modal */}
      {showTosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md p-6 relative">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 accent-text" />
              Terms of Service
            </h2>
            
            <p className="text-gray-400 text-sm mb-4">
              Before purchasing premium access, you must read and agree to our Terms of Service.
            </p>
            
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
              <p className="text-red-400 text-sm">
                <strong>⚠️ Important:</strong> All sales are final. No refunds will be issued.
              </p>
            </div>
            
            <label className="flex items-start gap-3 cursor-pointer mb-6">
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={(e) => setTosAccepted(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-gray-400 text-sm">
                I have read and agree to the{' '}
                <a href="/legal" className="accent-text hover:underline" target="_blank">
                  Terms of Service
                </a>.
              </span>
            </label>
            
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setShowTosModal(false);
                  setTosAccepted(false);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!tosAccepted}
                onClick={proceedWithPayment}
              >
                <Check className="w-4 h-4" />
                Accept & Continue
              </Button>
            </div>
          </Card>
        </div>
      )}



      {/* Robux Verification Modal */}
      {showRobuxModal && robuxDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
              <Card className="w-full max-w-md p-6 relative">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                       <span className="text-2xl">🎮</span>
                       Verify Ownership
                  </h2>
                  
                  <div className="space-y-4 mb-6">
                      <div className="bg-[#1a1a1a] p-4 rounded-lg space-y-2 text-sm text-gray-300">
                          <p><strong>Plan:</strong> <span className="text-white capitalize">{robuxDetails.plan}</span></p>
                          <p>
                              <strong>Product:</strong>{' '}
                              <a 
                                  href={`https://www.roblox.com/catalog/${robuxDetails.productId}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="accent-text font-mono hover:underline"
                              >
                                  Click here to Buy Item ({robuxDetails.productId})
                              </a>
                          </p>
                          
                          <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded mt-3">
                                <p className="text-xs text-orange-200 font-medium mb-1">⚠️ Renewal / Additional Purchase:</p>
                                <p className="text-xs text-orange-200/80">
                                    To <strong>Renew</strong> (Weekly/Monthly) or buy an <strong>Additional Key</strong> (Lifetime), you <strong>MUST DELETE</strong> the item from your Roblox inventory and <strong>BUY IT AGAIN</strong>.
                                    <br/><br/>
                                    <strong>Existing Lifetime users:</strong> To just get your <em>current</em> key, simply click Verify without rebuying.
                                </p>
                          </div>
                      </div>

                          <div className="space-y-3">
                              <div>
                                  <label className="block text-sm font-medium text-gray-400 mb-1">Roblox Username</label>
                                  <input 
                                      type="text" 
                                      value={robloxUsername}
                                      onChange={(e) => setRobloxUsername(e.target.value)}
                                      placeholder="Enter your Roblox username..."
                                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white focus:outline-none focus-visible:border-[var(--accent)] transition-colors"
                                  />
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-gray-400 mb-1">Email Address</label>
                                  <input 
                                      type="email" 
                                      value={email}
                                      onChange={(e) => setEmail(e.target.value)}
                                      placeholder="Enter your email for backup..."
                                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white focus:outline-none focus-visible:border-[var(--accent)] transition-colors"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">We'll save your key to this email as a backup.</p>
                              </div>
                          </div>
                  </div>

                  <div className="flex gap-3">
                      <Button variant="secondary" className="flex-1" onClick={() => setShowRobuxModal(false)}>
                          Cancel
                      </Button>
                      <Button className="flex-1" onClick={verifyRobuxPurchase} disabled={!robloxUsername.trim() || !email.trim()}>
                          <Check className="w-4 h-4" />
                          Verify
                      </Button>
                  </div>
              </Card>
          </div>
      )}

      {/* Ticket Modal */}
      {showTicketModal && ticketDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
              <Card className="w-full max-w-md p-6 relative">
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <CreditCard className="w-5 h-5 accent-text" />
                      Complete Purchase
                  </h2>
                  
                  <div className="space-y-4 mb-6">
                      <div className="bg-[#1a1a1a] p-4 rounded-lg space-y-2 text-sm text-gray-300">
                          <p><strong>Plan:</strong> <span className="text-white capitalize">{ticketDetails.plan}</span></p>
                          <p><strong>Amount:</strong> <span className="text-white">{ticketDetails.amount} {ticketDetails.currency}</span></p>
                          <p><strong>Method:</strong> <span className="text-white capitalize">{ticketDetails.currency === 'Robux' ? 'Robux' : 'GCash'}</span></p>
                      </div>
                      
                      <p className="text-sm text-gray-400">
                          To complete your purchase, please open a ticket in our Discord server and provide proof of payment.
                      </p>

                      <Button variant="secondary" className="w-full" onClick={copyTicketDetails}>
                          <Copy className="w-4 h-4" />
                          Copy Ticket Details
                      </Button>
                  </div>

                  <div className="flex gap-3">
                      <Button variant="secondary" className="flex-1" onClick={() => setShowTicketModal(false)}>
                          Close
                      </Button>
                      <a href="https://discord.gg/F4sAf6z8Ph" target="_blank" className="flex-1">
                          <Button className="w-full">
                               Open Discord
                          </Button>
                      </a>
                  </div>
              </Card>
          </div>
      )}
    </div>
  );
}

export default function PremiumPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin accent-text"/></div>}>
      <PremiumContent />
    </Suspense>
  );
}
