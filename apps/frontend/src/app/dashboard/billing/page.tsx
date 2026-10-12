'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Sparkles, 
  Shield, 
  Crown, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Info, 
  QrCode, 
  Zap, 
  Clock, 
  ArrowRight,
  AlertTriangle,
  Building2,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { formatNumber, formatCurrency, cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface SubscriptionStatus {
  business_id?: string;
  plan: {
    name: string;
    slug: string;
    version?: string;
    version_id?: string;
    duration?: string;
    duration_months?: number;
    price_inr?: number;
    features: Record<string, boolean>;
  };
  is_trial?: boolean;
  status: string;
  display_status?: string;
  raw_status?: string;
  start_date?: string;
  end_date?: string;
  expiry_date?: string;
  current_period_end: string;
  days_remaining?: number;
  price_paid?: number;
  price_inr?: number;
  duration?: string;
  duration_months?: number;
  total_qr_quota?: number;
  used_qr?: number;
  remaining_qr?: number;
  total_ai_quota?: number;
  used_ai?: number;
  remaining_ai?: number;
  qr_scans: {
    limit: number;
    used: number;
    remaining: number;
    percentage: number;
  };
  ai_generations: {
    limit: number;
    used: number;
    remaining: number;
    percentage: number;
  };
  is_active: boolean;
  is_expired?: boolean;
  is_blocked?: boolean;
  is_qr_allowed?: boolean;
  is_ai_allowed?: boolean;
  exhaustion_reason?: string | null;
  exhaustion_message?: string | null;
  current_period_start?: string;
  next_monthly_reset?: string;
  current_period_index?: number;
  monthly_qr_limit?: number;
  monthly_ai_limit?: number;
  current_month_qr_used?: number;
  current_month_ai_used?: number;
  current_month_qr_remaining?: number;
  current_month_ai_remaining?: number;
  monthly_history?: Array<{
    subscription_id?: string;
    period_index: number;
    period_start: string;
    period_end: string;
    qr_used: number;
    ai_used: number;
    recorded_at: string;
  }>;
  history?: Array<{
    subscription_id?: string;
    plan_id: string;
    plan_name: string;
    plan_version_id: string;
    duration: string;
    duration_months: number;
    price_inr: number;
    start_date: string;
    end_date: string;
    total_qr_quota: number;
    total_ai_quota: number;
    used_qr_quota: number;
    used_ai_quota: number;
    status: string;
    exhaustion_reason?: string | null;
    assigned_by?: string;
    activated_at?: string;
    archived_at?: string;
  }>;
}

interface DurationOffering {
  duration_months: number;
  price_inr: number;
  monthly_qr_quota?: number;
  monthly_ai_quota?: number;
  monthly_qr_limit?: number;
  monthly_ai_limit?: number;
  allocated_qr_quota: number;
  allocated_ai_quota: number;
  max_qr_codes: number;
}

interface PublicPlan {
  id: string;
  name: string;
  description: string;
  display_order: number;
  features: Record<string, boolean>;
  version_number: number;
  plan_version_id?: string;
  durations: {
    '1_month': DurationOffering;
    '6_months': DurationOffering;
    '12_months': DurationOffering;
  };
}

interface PublicPlansResponse {
  plans: PublicPlan[];
  trial: any;
}

interface UpgradeRequest {
  id: string;
  business_id: string;
  requested_plan: string;
  plan_name?: string;
  plan_version_id?: string;
  duration_months?: number;
  price_inr?: number;
  total_qr_quota?: number;
  total_ai_quota?: number;
  max_qr_codes?: number;
  message: string | null;
  status: 'pending' | 'contacted' | 'approved' | 'rejected' | 'canceled';
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
}

const PLAN_ICONS: Record<string, any> = {
  base: Sparkles,
  pro: Shield,
  unlimited: Crown,
  free_trial: Sparkles,
  starter: Sparkles,
  enterprise: Crown,
};

function BillingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDuration, setSelectedDuration] = useState<'1_month' | '6_months' | '12_months'>('6_months');

  // Request modal state
  const [requestModalPlan, setRequestModalPlan] = useState<PublicPlan | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load businesses
  useEffect(() => {
    api.get<any>('/businesses')
      .then((res: any) => {
        const list = res?.data?.businesses || res?.data || res?.businesses || [];
        if (Array.isArray(list) && list.length > 0) {
          setBusinesses(list.map((b: any) => ({ id: b.id, name: b.name })));
          const queryBizId = searchParams.get('business_id');
          const storedBizId = typeof window !== 'undefined' ? localStorage.getItem('reviewai_active_business_id') : null;
          let targetBizId = list[0].id;
          if (queryBizId && list.some((b: any) => b.id === queryBizId)) {
            targetBizId = queryBizId;
          } else if (storedBizId && list.some((b: any) => b.id === storedBizId)) {
            targetBizId = storedBizId;
          }
          setSelectedBusinessId(targetBizId);
          if (typeof window !== 'undefined') {
            localStorage.setItem('reviewai_active_business_id', targetBizId);
          }
          fetchBillingData(targetBizId);
        } else {
          fetchBillingData();
        }
      })
      .catch((err) => {
        console.error('Failed to load businesses:', err);
        fetchBillingData();
      });
  }, []);

  const fetchBillingData = async (bizId?: string) => {
    try {
      setIsLoading(true);
      const targetBiz = bizId || selectedBusinessId;
      const subQuery = targetBiz ? `?business_id=${targetBiz}` : '';

      const [subRes, plansRes, reqsRes] = await Promise.all([
        api.get<{ data: SubscriptionStatus }>(`/subscription/status${subQuery}`),
        api.get<{ data: PublicPlansResponse }>(`/subscription/plans?_t=${Date.now()}`).catch(() => ({ data: { plans: [], trial: null } })),
        api.get<{ data: UpgradeRequest[] }>(`/subscription/upgrade-requests${subQuery}`).catch(() => ({ data: [] })),
      ]);

      setSubscription(subRes.data);
      const incomingPlans = plansRes.data?.plans || (plansRes as any)?.plans;
      if (Array.isArray(incomingPlans)) {
        setPlans(incomingPlans);
      }
      setUpgradeRequests(reqsRes.data || []);
    } catch (err: any) {
      console.error('Failed to load billing data:', err);
      toast.error('Failed to load billing details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBusinessChange = (bizId: string) => {
    setSelectedBusinessId(bizId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reviewai_active_business_id', bizId);
      window.dispatchEvent(new CustomEvent('reviewai_business_changed', { detail: { business_id: bizId } }));
    }
    fetchBillingData(bizId);
  };

  const handleRequestPlan = async () => {
    if (!requestModalPlan) return;
    try {
      setIsSubmitting(true);
      const offering = requestModalPlan.durations[selectedDuration];
      const versionId = requestModalPlan.plan_version_id || `${requestModalPlan.id}_v${requestModalPlan.version_number}`;
      const targetBizId = selectedBusinessId || subscription?.business_id;

      await api.post('/subscription/upgrade-request', {
        business_id: targetBizId,
        plan_id: requestModalPlan.id,
        duration_months: offering.duration_months,
        plan_version_id: versionId,
        note: upgradeMessage.trim() || undefined,
      });

      toast.success('Your plan activation request has been submitted. An administrator will activate your plan shortly.');
      setRequestModalPlan(null);
      setUpgradeMessage('');
      fetchBillingData(targetBizId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to submit plan activation request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Helper to dynamically load Razorpay checkout script
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        return resolve(true);
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayNow = async (targetPlan?: PublicPlan) => {
    const plan = targetPlan || requestModalPlan;
    if (!plan) return;

    try {
      setIsProcessingPayment(true);
      const offering = plan.durations[selectedDuration];
      const versionId = plan.plan_version_id || `${plan.id}_v${plan.version_number}`;
      const targetBizId = selectedBusinessId || subscription?.business_id;

      if (!targetBizId) {
        toast.error('Please select a business first');
        return;
      }

      // 1. Ensure Razorpay checkout script is loaded
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error('Could not load Razorpay payment gateway. Please check your internet connection.');
        return;
      }

      // 2. Server creates order with authoritative admin price (never trusted from frontend)
      const orderRes = await api.post<any>('/subscription/create-order', {
        business_id: targetBizId,
        plan_id: plan.id,
        duration_months: offering.duration_months,
        plan_version_id: versionId,
      });

      const orderData = orderRes.data?.data || orderRes.data;
      if (!orderData || !orderData.order_id) {
        throw new Error('Failed to create payment order from server');
      }

      const razorpayKey = orderData.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_reviewai_dev';

      // 3. Open Razorpay Client Checkout modal
      const options = {
        key: razorpayKey,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'ReviewAI',
        description: `${orderData.plan_name || plan.name} Plan (${offering.duration_months} Months)`,
        order_id: orderData.order_id,
        handler: async (response: any) => {
          // 4. Server-side verification is mandatory
          try {
            toast.loading('Verifying payment on server...', { id: 'verify-toast' });
            await api.post<any>('/subscription/verify-payment', {
              business_id: targetBizId,
              plan_id: plan.id,
              duration_months: offering.duration_months,
              plan_version_id: versionId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            toast.dismiss('verify-toast');
            toast.success('Payment verified! Your plan has been activated successfully.');
            setRequestModalPlan(null);
            await fetchBillingData(targetBizId);
          } catch (verifyErr: any) {
            toast.dismiss('verify-toast');
            toast.error(verifyErr.response?.data?.message || 'Payment verification failed on server');
          }
        },
        modal: {
          ondismiss: () => {
            toast('Checkout cancelled. No charge was made.', { icon: 'ℹ️' });
          },
        },
        theme: {
          color: '#4F46E5',
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failRes: any) => {
        toast.error(`Payment failed: ${failRes.error?.description || 'Transaction unsuccessful'}`);
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to initiate payment');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="py-20 flex flex-col justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500 mb-2" />
          <p className="text-secondary-500 text-sm">Loading billing and plan details...</p>
        </div>
      </div>
    );
  }

  const isTrial = Boolean(subscription?.is_trial || subscription?.plan?.slug === 'free_trial' || subscription?.status === 'FREE_TRIAL' || subscription?.status === 'trialing');
  const isExpired = Boolean(subscription?.is_expired || subscription?.status === 'EXPIRED' || subscription?.status === 'expired' || (!subscription?.is_active && (subscription?.exhaustion_reason === 'PLAN_EXPIRED' || subscription?.exhaustion_reason === 'TRIAL_EXPIRED' || subscription?.exhaustion_reason === 'SUBSCRIPTION_EXPIRED')));
  const isQuotaExhausted = Boolean((subscription?.qr_scans?.limit !== -1 && (subscription?.qr_scans?.remaining ?? 1) <= 0) || (subscription?.ai_generations?.limit !== -1 && (subscription?.ai_generations?.remaining ?? 1) <= 0));
  const isBlockedOrExpired = Boolean(isExpired || subscription?.is_blocked);
  const hasActivePaidSubscription = Boolean(subscription?.is_active && !isTrial && !isExpired);
  const pendingRequest = upgradeRequests.find(r => r.status === 'pending');

  const getStatusBadge = (status: string, isActive: boolean) => {
    const s = (status || '').toUpperCase();
    if (isExpired) {
      return <Badge className="bg-amber-600 text-white hover:bg-amber-600">{isTrial ? 'TRIAL_EXPIRED' : 'EXPIRED'}</Badge>;
    }
    if (isTrial && isActive) {
      return <Badge className="bg-blue-600 text-white hover:bg-blue-600">FREE_TRIAL</Badge>;
    }
    if (s === 'ACTIVE') {
      return <Badge className="bg-green-600 text-white hover:bg-green-600">ACTIVE</Badge>;
    }
    if (s === 'FREE_TRIAL' || s === 'TRIALING') {
      return <Badge className="bg-blue-600 text-white hover:bg-blue-600">FREE_TRIAL</Badge>;
    }
    if (s === 'QR_QUOTA_EXHAUSTED') {
      return <Badge className="bg-red-600 text-white hover:bg-red-600">QR_QUOTA_EXHAUSTED</Badge>;
    }
    if (s === 'AI_QUOTA_EXHAUSTED') {
      return <Badge className="bg-red-600 text-white hover:bg-red-600">AI_QUOTA_EXHAUSTED</Badge>;
    }
    if (s === 'EXPIRED') {
      return <Badge className="bg-amber-600 text-white hover:bg-amber-600">EXPIRED</Badge>;
    }
    if (s === 'CANCELED') {
      return <Badge variant="secondary">CANCELED</Badge>;
    }
    if (s === 'SUSPENDED') {
      return <Badge className="bg-red-800 text-white hover:bg-red-800">SUSPENDED</Badge>;
    }
    return <Badge variant={isActive ? 'default' : 'secondary'}>{s}</Badge>;
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-secondary-900 dark:text-white">Billing & Subscription</h1>
          <p className="text-secondary-600 dark:text-secondary-400 mt-1">
            Review your current subscription entitlement, plan duration, and available options.
          </p>
        </div>
        {businesses.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-secondary-500 shrink-0" />
            <Select value={selectedBusinessId} onValueChange={handleBusinessChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select business" />
              </SelectTrigger>
              <SelectContent>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Pending Activation Request Banner */}
      {pendingRequest && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-blue-900 dark:text-blue-200">
                Activation Request Pending
              </p>
              <Badge className="bg-blue-600 text-white hover:bg-blue-600">PENDING ADMIN APPROVAL</Badge>
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
              You submitted an activation request for <span className="font-semibold">{pendingRequest.plan_name || pendingRequest.requested_plan}</span>
              {pendingRequest.duration_months && ` (${pendingRequest.duration_months} Months)`}
              {pendingRequest.price_inr && ` for ${formatCurrency(pendingRequest.price_inr)}`} on {new Date(pendingRequest.created_at).toLocaleDateString()}.
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
              Access and non-resetting total usage quotas will unlock immediately upon manual Admin activation.
            </p>
          </div>
        </div>
      )}

      {/* Active Free Trial Status Banner */}
      {isTrial && !isExpired && !pendingRequest && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-900 dark:text-blue-200">
              Free Trial Active
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-300 mt-0.5">
              Your free trial is currently active until {new Date(subscription?.current_period_end || '').toLocaleDateString()}. Choose a paid plan below before your trial ends to ensure uninterrupted access.
            </p>
          </div>
        </div>
      )}

      {/* Active Subscription Status Banner (when paid and active) */}
      {hasActivePaidSubscription && !pendingRequest && (
        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-900 dark:text-green-200">
              Active Paid Subscription
            </p>
            <p className="text-sm text-green-800 dark:text-green-300 mt-0.5">
              Your {subscription?.plan?.name} plan is currently active until {new Date(subscription?.current_period_end || '').toLocaleDateString()}. You can request a new plan or extension once your current duration expires or quota is exhausted.
            </p>
          </div>
        </div>
      )}

      {/* Expired or Exhausted Alert */}
      {isExpired && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {isTrial ? 'Your free trial has expired.' : 'Your subscription has expired.'}
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
              Choose a paid plan below to restore QR scan reviews, AI draft generation, and Google review redirection.
            </p>
          </div>
        </div>
      )}

      {/* Quota Exhaustion Alerts */}
      {subscription && subscription.is_active && !isExpired && (
        <>
          {subscription.qr_scans.limit !== -1 && subscription.qr_scans.remaining <= 0 && subscription.ai_generations.remaining > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Your monthly QR scan quota has been exhausted.
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                  AI generation remains available. Your QR scan quota will automatically reset on {new Date(subscription.next_monthly_reset || subscription.current_period_end).toLocaleDateString()}.
                </p>
              </div>
            </div>
          )}

          {subscription.ai_generations.limit !== -1 && subscription.ai_generations.remaining <= 0 && subscription.qr_scans.remaining > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Your monthly AI generation quota has been exhausted.
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                  QR scan reviews remain available. Your AI generation quota will automatically reset on {new Date(subscription.next_monthly_reset || subscription.current_period_end).toLocaleDateString()}.
                </p>
              </div>
            </div>
          )}

          {subscription.qr_scans.limit !== -1 && subscription.qr_scans.remaining <= 0 && subscription.ai_generations.limit !== -1 && subscription.ai_generations.remaining <= 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Monthly QR scan and AI generation quotas exhausted.
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                  Your subscription remains active. Both services will automatically resume on {new Date(subscription.next_monthly_reset || subscription.current_period_end).toLocaleDateString()}.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Inactive or Expired Quota Alert */}
      {subscription && !subscription.is_active && !isExpired && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900 dark:text-red-200">
              {subscription.exhaustion_reason === 'QR_QUOTA_EXHAUSTED' || subscription.exhaustion_reason === 'PLAN_QR_QUOTA_EXHAUSTED' || subscription.exhaustion_reason === 'TRIAL_QR_QUOTA_EXHAUSTED'
                ? 'Your QR scan quota has been exhausted.'
                : subscription.exhaustion_reason === 'AI_QUOTA_EXHAUSTED' || subscription.exhaustion_reason === 'PLAN_AI_QUOTA_EXHAUSTED' || subscription.exhaustion_reason === 'TRIAL_AI_QUOTA_EXHAUSTED'
                  ? 'Your AI generation quota has been exhausted.'
                  : 'Your subscription has expired.'}
            </p>
            <p className="text-sm text-red-800 dark:text-red-300 mt-0.5">
              Choose a plan below to restore service access with fresh monthly quotas.
            </p>
          </div>
        </div>
      )}

      {/* CURRENT ENTITLEMENT CARD */}
      {subscription && (
        <Card className="border-secondary-200 dark:border-secondary-700 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                  {isTrial ? <Sparkles className="h-7 w-7 text-amber-500" /> : <Crown className="h-7 w-7" />}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <CardTitle className="text-2xl font-bold">
                      {isTrial ? (isExpired ? 'Free Trial (Expired)' : 'Free Trial') : (isExpired ? `${subscription.plan.name} (Expired)` : subscription.plan.name)}
                    </CardTitle>
                    {getStatusBadge(subscription.status, subscription.is_active)}
                  </div>
                  <CardDescription className="mt-1">
                    {isTrial ? (
                      <span>
                        {isExpired ? 'Trial expired on ' : 'Trial ends '}
                        {new Date(subscription.current_period_end).toLocaleDateString()}
                        {!isExpired && subscription.days_remaining !== undefined && ` • ${subscription.days_remaining} days remaining`}
                      </span>
                    ) : (
                      <span>
                        {isExpired ? 'Subscription expired on ' : 'Valid until '}
                        {new Date(subscription.current_period_end).toLocaleDateString()}
                        {!isExpired && subscription.days_remaining !== undefined && ` • ${subscription.days_remaining} days remaining`}
                        {subscription.plan.duration_months && ` • ${subscription.plan.duration_months}-Month Access`}
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => {
                  const elem = document.getElementById('available-plans-section');
                  elem?.scrollIntoView({ behavior: 'smooth' });
                }}>
                  {isTrial || isExpired || isBlockedOrExpired ? 'Choose Paid Plan' : 'View Plan Offerings'}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Key Subscription Details */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-3.5 rounded-xl bg-secondary-50/70 dark:bg-secondary-800/30 border border-secondary-100 dark:border-secondary-800 text-xs">
              <div>
                <span className="text-secondary-500 font-medium">Current Plan</span>
                <p className="font-semibold text-secondary-900 dark:text-white mt-0.5">
                  {isTrial ? (isExpired ? 'Free Trial (Expired)' : 'Free Trial') : subscription.plan.name}
                </p>
              </div>
              <div>
                <span className="text-secondary-500 font-medium">Status</span>
                <p className="font-semibold text-secondary-900 dark:text-white mt-0.5">
                  {isExpired ? (isTrial ? 'TRIAL_EXPIRED' : 'EXPIRED') : (isTrial ? 'FREE_TRIAL' : subscription.status)}
                </p>
              </div>
              <div>
                <span className="text-secondary-500 font-medium">Subscription Start</span>
                <p className="font-semibold text-secondary-900 dark:text-white mt-0.5">
                  {subscription.start_date ? new Date(subscription.start_date).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <span className="text-secondary-500 font-medium">Subscription Expiry</span>
                <p className="font-semibold text-secondary-900 dark:text-white mt-0.5">
                  {new Date(subscription.expiry_date || subscription.end_date || subscription.current_period_end).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-secondary-500 font-medium">{isTrial ? 'Trial Period' : 'Current Usage Period'}</span>
                <p className="font-semibold text-secondary-900 dark:text-white mt-0.5">
                  {subscription.current_period_start 
                    ? `${new Date(subscription.current_period_start).toLocaleDateString()} – ${new Date(subscription.current_period_end).toLocaleDateString()}` 
                    : (subscription.start_date ? new Date(subscription.start_date).toLocaleDateString() : '—')}
                </p>
              </div>
              <div>
                <span className="text-secondary-500 font-medium">{isTrial ? 'Trial End' : 'Next Monthly Reset'}</span>
                <p className="font-semibold text-secondary-900 dark:text-white mt-0.5">
                  {subscription.next_monthly_reset 
                    ? new Date(subscription.next_monthly_reset).toLocaleDateString() 
                    : new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Usage Counters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-100 dark:border-secondary-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-blue-500" />
                    {isTrial ? 'Trial QR Quota' : 'Monthly QR Limit'}
                  </span>
                  <span className="text-sm font-bold text-secondary-900 dark:text-white">
                    {subscription.qr_scans.limit === -1 
                      ? 'Unlimited' 
                      : `${formatNumber(subscription.qr_scans.used)} / ${formatNumber(subscription.qr_scans.limit)}`}
                  </span>
                </div>
                {subscription.qr_scans.limit !== -1 && (
                  <Progress value={subscription.qr_scans.percentage} className="h-2" />
                )}
                <div className="flex justify-between text-xs text-secondary-500">
                  <span className="font-mono">
                    {subscription.qr_scans.limit === -1 
                      ? 'Unlimited' 
                      : `Monthly Limit: ${formatNumber(subscription.qr_scans.limit)} | Used: ${formatNumber(subscription.qr_scans.used)} | Remaining: ${formatNumber(subscription.qr_scans.remaining)}`}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-secondary-50 dark:bg-secondary-800/40 border border-secondary-100 dark:border-secondary-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
                    <Zap className="h-4 w-4 text-purple-500" />
                    {isTrial ? 'Trial AI Quota' : 'AI Monthly Limit'}
                  </span>
                  <span className="text-sm font-bold text-secondary-900 dark:text-white">
                    {subscription.ai_generations.limit === -1 
                      ? 'Unlimited' 
                      : `${formatNumber(subscription.ai_generations.used)} / ${formatNumber(subscription.ai_generations.limit)}`}
                  </span>
                </div>
                {subscription.ai_generations.limit !== -1 && (
                  <Progress value={subscription.ai_generations.percentage} className="h-2" />
                )}
                <div className="flex justify-between text-xs text-secondary-500">
                  <span className="font-mono">
                    {subscription.ai_generations.limit === -1 
                      ? 'Unlimited' 
                      : `Monthly Limit: ${formatNumber(subscription.ai_generations.limit)} | Used: ${formatNumber(subscription.ai_generations.used)} | Remaining: ${formatNumber(subscription.ai_generations.remaining)}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Included Features */}
            {subscription.plan.features && (
              <div className="pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-secondary-500 mb-2">Active Plan Features</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(subscription.plan.features).map(([key, enabled]) => (
                    <Badge 
                      key={key} 
                      variant={enabled ? 'secondary' : 'outline'}
                      className={enabled ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'opacity-40'}
                    >
                      {key.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SUBSCRIPTION HISTORY */}
      {subscription?.history && subscription.history.length > 0 && (
        <Card className="border border-secondary-200 dark:border-secondary-800 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-secondary-500" />
                  Subscription History
                </CardTitle>
                <CardDescription>
                  Previous plans, purchased pricing, and non-resetting quota records.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {subscription.history.length} Previous {subscription.history.length === 1 ? 'Plan' : 'Plans'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary-50 dark:bg-secondary-800/50 text-secondary-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Plan Version</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Purchased Price</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">QR Quota & Used</th>
                    <th className="px-4 py-3">AI Quota & Used</th>
                    <th className="px-4 py-3">Final Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                  {subscription.history.map((h, i) => (
                    <tr key={i} className="hover:bg-secondary-50/50 dark:hover:bg-secondary-800/30">
                      <td className="px-4 py-3 font-semibold text-secondary-900 dark:text-white capitalize">
                        {h.plan_name} <span className="font-mono text-secondary-500 font-normal">({h.plan_version_id})</span>
                      </td>
                      <td className="px-4 py-3">
                        {h.duration_months ? `${h.duration_months} Months` : '14 Days'}
                      </td>
                      <td className="px-4 py-3 font-medium text-secondary-900 dark:text-white">
                        {h.price_inr ? formatCurrency(h.price_inr) : 'Free'}
                      </td>
                      <td className="px-4 py-3 text-secondary-600 dark:text-secondary-400">
                        {h.start_date ? new Date(h.start_date).toLocaleDateString() : '—'} – {h.end_date ? new Date(h.end_date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{formatNumber(h.used_qr_quota)}</span> / {h.total_qr_quota === -1 ? 'Unlimited' : formatNumber(h.total_qr_quota)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{formatNumber(h.used_ai_quota)}</span> / {h.total_ai_quota === -1 ? 'Unlimited' : formatNumber(h.total_ai_quota)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="capitalize text-[10px]">
                          {h.exhaustion_reason ? h.exhaustion_reason.replace(/_/g, ' ') : h.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MONTHLY USAGE HISTORY */}
      {subscription?.monthly_history && subscription.monthly_history.length > 0 && (
        <Card className="border border-secondary-200 dark:border-secondary-800 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-secondary-500" />
                  Monthly Usage History
                </CardTitle>
                <CardDescription>
                  Archived monthly periods and historical usage for this subscription.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {subscription.monthly_history.length} Previous {subscription.monthly_history.length === 1 ? 'Month' : 'Months'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary-50 dark:bg-secondary-800/60 text-secondary-600 dark:text-secondary-400 font-semibold border-b border-secondary-200 dark:border-secondary-700">
                  <tr>
                    <th className="py-2.5 px-3">Period</th>
                    <th className="py-2.5 px-3">QR Used</th>
                    <th className="py-2.5 px-3">AI Used</th>
                    <th className="py-2.5 px-3">Recorded At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                  {subscription.monthly_history.map((h, i) => (
                    <tr key={i} className="hover:bg-secondary-50/50 dark:hover:bg-secondary-800/30">
                      <td className="py-2.5 px-3 font-medium">
                        Period {h.period_index + 1}: {new Date(h.period_start).toLocaleDateString()} – {new Date(h.period_end).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{formatNumber(h.qr_used)} scans</td>
                      <td className="py-2.5 px-3 font-mono">{formatNumber(h.ai_used)} generations</td>
                      <td className="py-2.5 px-3 text-secondary-500">
                        {new Date(h.recorded_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AVAILABLE PLANS SECTION (DYNAMIC FROM ADMIN CONFIGURATION) */}
      <div id="available-plans-section" className="space-y-6 pt-4">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold text-secondary-900 dark:text-white">
            Available Plans & Durations
          </h2>
          <p className="text-secondary-600 dark:text-secondary-400 max-w-xl mx-auto text-sm">
            Fixed duration • Fresh monthly QR and AI limits reset automatically every month.
          </p>

          {/* Duration Selector */}
          <div className="flex justify-center pt-2">
            <Tabs 
              value={selectedDuration} 
              onValueChange={(v) => setSelectedDuration(v as any)}
              className="w-full max-w-md"
            >
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="1_month">1 Month</TabsTrigger>
                <TabsTrigger value="6_months">6 Months (Popular)</TabsTrigger>
                <TabsTrigger value="12_months">12 Months (Best Value)</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Dynamic Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.id] || Sparkles;
            const offering = plan.durations?.[selectedDuration];
            if (!offering) return null;

            const isCurrentPlan = subscription?.plan?.slug === plan.id && subscription?.is_active && !isTrial;
            const isButtonDisabled = isCurrentPlan || hasActivePaidSubscription || Boolean(pendingRequest);

            return (
              <Card 
                key={plan.id}
                className={cn(
                  'border-2 transition-all flex flex-col justify-between',
                  plan.id === 'pro' ? 'border-primary-500 shadow-md' : 'border-secondary-200 dark:border-secondary-700'
                )}
              >
                <div>
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2.5 rounded-lg bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400 inline-block">
                        <Icon className="h-6 w-6" />
                      </div>
                      {plan.id === 'pro' && (
                        <Badge className="bg-primary-600">Most Popular</Badge>
                      )}
                      {isCurrentPlan && (
                        <Badge variant="outline" className="border-green-500 text-green-600">Current Plan</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] font-mono font-medium text-secondary-500">
                        v{plan.version_number}
                      </Badge>
                    </div>
                    <CardDescription className="min-h-[40px] text-xs">
                      {plan.description}
                    </CardDescription>

                    <div className="pt-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-secondary-900 dark:text-white">
                          {formatCurrency(offering.price_inr)}
                        </span>
                        <span className="text-xs text-secondary-500">
                          / {offering.duration_months} {offering.duration_months === 1 ? 'Month' : 'Months'}
                        </span>
                      </div>
                      <p className="text-xs text-secondary-400 mt-0.5">One-time payment, no auto-charge</p>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="p-3 bg-secondary-50 dark:bg-secondary-800/40 rounded-lg space-y-1.5 text-xs">
                      <div className="flex justify-between font-medium">
                        <span className="text-secondary-600 dark:text-secondary-300">Monthly QR Limit:</span>
                        <span className="text-secondary-900 dark:text-white font-bold">
                          {offering.monthly_qr_quota === -1 || offering.allocated_qr_quota === -1 ? 'Unlimited' : `${formatNumber(offering.monthly_qr_quota ?? offering.allocated_qr_quota)} / month`}
                        </span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span className="text-secondary-600 dark:text-secondary-300">Monthly AI Limit:</span>
                        <span className="text-secondary-900 dark:text-white font-bold">
                          {offering.monthly_ai_quota === -1 || offering.allocated_ai_quota === -1 ? 'Unlimited' : `${formatNumber(offering.monthly_ai_quota ?? offering.allocated_ai_quota)} / month`}
                        </span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span className="text-secondary-600 dark:text-secondary-300">Max QR Codes:</span>
                        <span className="text-secondary-900 dark:text-white font-bold">
                          {offering.max_qr_codes}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-semibold text-secondary-600 dark:text-secondary-400">Features:</p>
                      {Object.entries(plan.features || {}).map(([key, enabled]) => (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          {enabled ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-secondary-300 dark:text-secondary-600 flex-shrink-0" />
                          )}
                          <span className={enabled ? 'text-secondary-700 dark:text-secondary-300' : 'text-secondary-400 line-through'}>
                            {key.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </div>

                <div className="p-6 pt-0 space-y-2">
                  <Button 
                    className="w-full font-semibold"
                    variant={plan.id === 'pro' ? 'default' : 'outline'}
                    disabled={isButtonDisabled || isProcessingPayment}
                    onClick={() => handlePayNow(plan)}
                  >
                    {isProcessingPayment ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    {isCurrentPlan 
                      ? 'Current Active Plan' 
                      : hasActivePaidSubscription 
                        ? 'Active Plan in Effect' 
                        : pendingRequest 
                          ? 'Request Pending' 
                          : isBlockedOrExpired && subscription?.plan?.slug === plan.id
                            ? `Pay Now • Renew ${plan.name} (${formatCurrency(offering.price_inr)})`
                            : `Pay Now • ${formatCurrency(offering.price_inr)}`}
                  </Button>
                  {!hasActivePaidSubscription && !isCurrentPlan && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-secondary-500 hover:text-secondary-800 dark:hover:text-secondary-200"
                      onClick={() => setRequestModalPlan(plan)}
                    >
                      View Details / Invoicing Option
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* PLAN SELECTION & CONFIRMATION MODAL */}
      {requestModalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !isSubmitting && setRequestModalPlan(null)}>
          <div className="bg-background rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-secondary-900 dark:text-white">
                  Confirm Plan Activation Request
                </h3>
                <p className="text-xs text-secondary-500">
                  Review plan details and total duration quotas
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setRequestModalPlan(null)} disabled={isSubmitting}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {(() => {
              const off = requestModalPlan.durations[selectedDuration];
              return (
                <div className="space-y-3">
                  {/* Summary Box */}
                  <div className="p-4 bg-secondary-50 dark:bg-secondary-800/40 rounded-xl space-y-2 text-sm border border-secondary-200 dark:border-secondary-700">
                    <div className="flex justify-between items-center">
                      <span className="text-secondary-600 dark:text-secondary-400">Selected Plan:</span>
                      <span className="font-bold text-secondary-900 dark:text-white text-base">
                        {requestModalPlan.name} <span className="text-xs font-normal text-secondary-500">(v{requestModalPlan.version_number})</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-secondary-600 dark:text-secondary-400">Duration:</span>
                      <span className="font-semibold text-secondary-900 dark:text-white">
                        {off.duration_months} Months Fixed Access
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-secondary-600 dark:text-secondary-400">Total Price:</span>
                      <span className="font-extrabold text-primary-600 text-lg">
                        {formatCurrency(off.price_inr)}
                        <span className="text-xs font-normal text-secondary-500 ml-1">(One-time payment)</span>
                      </span>
                    </div>
                    <div className="h-px bg-secondary-200 dark:border-secondary-700 my-1" />
                    <div className="flex justify-between items-center">
                      <span className="text-secondary-600 dark:text-secondary-400">Monthly QR Limit:</span>
                      <span className="font-bold text-secondary-900 dark:text-white">
                        {off.monthly_qr_quota === -1 || off.allocated_qr_quota === -1 ? 'Unlimited' : `${formatNumber(off.monthly_qr_quota ?? off.allocated_qr_quota)} / month`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-secondary-600 dark:text-secondary-400">Monthly AI Limit:</span>
                      <span className="font-bold text-secondary-900 dark:text-white">
                        {off.monthly_ai_quota === -1 || off.allocated_ai_quota === -1 ? 'Unlimited' : `${formatNumber(off.monthly_ai_quota ?? off.allocated_ai_quota)} / month`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-secondary-600 dark:text-secondary-400">Max QR Codes:</span>
                      <span className="font-semibold text-secondary-900 dark:text-white">
                        {off.max_qr_codes}
                      </span>
                    </div>
                  </div>

                  {/* Clarification Notice */}
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      Monthly Quota Policy
                    </p>
                    <p className="text-blue-800 dark:text-blue-300">
                      Quotas are allocated per month for the {off.duration_months}-month duration and reset automatically at each monthly billing cycle. Unused monthly quota does not carry forward.
                    </p>
                  </div>

                  {/* Start / Activation Behavior Notice */}
                  <div className="p-3 rounded-lg bg-secondary-100 dark:bg-secondary-800 text-xs text-secondary-700 dark:text-secondary-300 space-y-1">
                    <p className="font-semibold">Start & Activation Behavior:</p>
                    <p>
                      Submitting this request creates a <strong>PENDING</strong> request. Your subscription and total quota will become active upon manual Admin approval.
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1.5">
              <Label htmlFor="upgrade-note">Notes / Invoicing Inquiries (Optional)</Label>
              <Textarea
                id="upgrade-note"
                rows={2}
                placeholder="Any special billing details or inquiries for the Admin..."
                value={upgradeMessage}
                onChange={e => setUpgradeMessage(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2 pt-2">
              <Button 
                className="w-full font-bold bg-primary-600 hover:bg-primary-700 text-white" 
                onClick={() => handlePayNow()} 
                disabled={isProcessingPayment || isSubmitting}
              >
                {isProcessingPayment ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                Pay Now with Razorpay (Instant Activation)
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setRequestModalPlan(null)} disabled={isSubmitting || isProcessingPayment}>
                  Cancel
                </Button>
                <Button variant="secondary" className="flex-1" onClick={handleRequestPlan} disabled={isSubmitting || isProcessingPayment}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Submit Invoice Request
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-secondary-500">Loading billing...</div>}>
      <BillingPageContent />
    </Suspense>
  );
}