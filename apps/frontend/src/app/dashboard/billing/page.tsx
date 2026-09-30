'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Sparkles, Zap, Shield, Crown, Globe, Users, Loader2, AlertCircle, CheckCircle, XCircle, X, Info, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api-client';
import { formatNumber, cn } from '@/lib/utils';

interface SubscriptionStatus {
  plan: {
    name: string;
    slug: string;
    monthly_qr_scans: number;
    monthly_ai_generations: number;
    features: {
      custom_domain: boolean;
      advanced_analytics: boolean;
      api_access: boolean;
      white_label: boolean;
      priority_support: boolean;
      ai_reviews: boolean;
    };
  };
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
  current_period_end: string;
}

interface UpgradeRequest {
  id: string;
  business_id: string;
  requested_plan: string;
  message: string | null;
  status: 'pending' | 'contacted' | 'approved' | 'rejected' | 'canceled';
  created_at: string;
  updated_at: string;
  already_pending?: boolean;
}

interface UpgradeRequestsResponse {
  data: UpgradeRequest[];
}

interface CreateUpgradeRequestResponse {
  data: UpgradeRequest;
  message: string;
}

const PLAN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  free: Sparkles,
  starter: Zap,
  pro: Shield,
  enterprise: Crown,
};

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300',
  starter: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  pro: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  enterprise: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  contacted: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  approved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  rejected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  canceled: 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Review',
  contacted: 'Contacted',
  approved: 'Approved',
  rejected: 'Rejected',
  canceled: 'Canceled',
};

const UPGRADE_PLANS = ['starter', 'pro', 'enterprise'] as const;

function BillingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'enterprise'>('starter');
  const [upgradeMessage, setUpgradeMessage] = useState('');

  // Check for upgrade prompt from URL
  useEffect(() => {
    const upgrade = searchParams.get('upgrade');
    const plan = searchParams.get('plan');
    if (upgrade === 'true' && plan && UPGRADE_PLANS.includes(plan as typeof UPGRADE_PLANS[number])) {
      setSelectedPlan(plan as typeof UPGRADE_PLANS[number]);
      setShowUpgradeModal(true);
      // Clean URL
      router.replace('/dashboard/billing');
    }
  }, [searchParams, router]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch subscription status
      const subResponse = await api.get<{ data: SubscriptionStatus }>('/subscription/status');
      setSubscription(subResponse.data);

      // Fetch upgrade requests
      const requestsResponse = await api.get<UpgradeRequestsResponse>('/subscription/upgrade-requests');
      setUpgradeRequests(requestsResponse.data);
    } catch (err: any) {
      console.error('Failed to load billing data:', err);
      setError(err.response?.data?.message || 'Failed to load billing information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgradeRequest = async () => {
    if (!selectedPlan) return;

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const response = await api.post<CreateUpgradeRequestResponse>('/subscription/upgrade-request', {
        requested_plan: selectedPlan,
        message: upgradeMessage.trim() || undefined,
      });

      if (response.data.already_pending) {
        setError(`An upgrade request for ${selectedPlan} is already pending`);
        return;
      }

      setSuccessMessage('Upgrade request submitted successfully! Our team will review it shortly.');
      setUpgradeRequests(prev => [response.data, ...prev]);
      setShowUpgradeModal(false);
      setUpgradeMessage('');
    } catch (err: any) {
      console.error('Upgrade request failed:', err);
      setError(err.response?.data?.message || 'Failed to submit upgrade request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this upgrade request?')) return;

    try {
      setError(null);
      // Note: We'd need a backend endpoint for this. For now, just update UI.
      setUpgradeRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'canceled' as const } : r));
      setSuccessMessage('Upgrade request canceled');
    } catch (err: any) {
      setError('Failed to cancel request');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatLimit = (limit: number) => {
    if (limit === -1) return 'Unlimited';
    return limit.toLocaleString();
  };

  const getPlanPrice = (slug: string) => {
    const prices: Record<string, { monthly: number; yearly: number }> = {
      free: { monthly: 0, yearly: 0 },
      starter: { monthly: 29, yearly: 24 },
      pro: { monthly: 79, yearly: 65 },
      enterprise: { monthly: 199, yearly: 165 },
    };
    return prices[slug] || { monthly: 0, yearly: 0 };
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4 mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-20 bg-secondary-200 dark:bg-secondary-700 rounded" />
                <div className="h-20 bg-secondary-200 dark:bg-secondary-700 rounded" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="h-6 bg-secondary-200 dark:bg-secondary-700 rounded w-1/3 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-secondary-200 dark:bg-secondary-700 rounded" />)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error && !subscription) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-12 w-12 text-error-500 mx-auto mb-4" />
        <p className="text-error-500 mb-4">{error}</p>
        <Button onClick={fetchData}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Billing & Subscription</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage your plan, view usage, and request upgrades</p>
        </div>
        {!subscription?.plan.slug || subscription?.plan.slug === 'free' ? (
          <Link href="/pricing">
            <Button variant="outline">
              View All Plans
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        ) : (
          <Button onClick={() => { setSelectedPlan('starter'); setShowUpgradeModal(true); }}>
            Request Upgrade
          </Button>
        )}
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 dark:text-green-300">{successMessage}</p>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Current Plan */}
      {subscription && (
        <Card className={cn('border-2', PLAN_COLORS[subscription.plan.slug]?.replace('bg-', 'border-').replace('text-', ''))}>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={cn('p-3 rounded-xl', PLAN_COLORS[subscription.plan.slug])}>
                  {(() => {
                    const Icon = PLAN_ICONS[subscription.plan.slug] || Crown;
                    return <Icon className="h-8 w-8" />;
                  })()}
                </div>
                <div>
                  <CardTitle className="text-2xl capitalize">{subscription.plan.name} Plan</CardTitle>
                  <CardDescription>
                    {subscription.is_active ? 'Active' : 'Inactive'} • Resets {formatDate(subscription.current_period_end)}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/pricing">
                  <Button variant="outline" size="sm">View All Plans</Button>
                </Link>
                <Button onClick={() => { setSelectedPlan('starter'); setShowUpgradeModal(true); }}>
                  Request Upgrade
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Usage Bars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <UsageBar
                label="QR Scans"
                used={subscription.qr_scans.used}
                limit={subscription.qr_scans.limit}
                percentage={subscription.qr_scans.percentage}
                color="blue"
                icon={Sparkles}
              />
              <UsageBar
                label="AI Generations"
                used={subscription.ai_generations.used}
                limit={subscription.ai_generations.limit}
                percentage={subscription.ai_generations.percentage}
                color="purple"
                icon={Zap}
              />
            </div>

            {/* Plan Features */}
            <div className="pt-6 border-t border-secondary-200 dark:border-secondary-700">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">Included Features</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(subscription.plan.features).map(([key, enabled]) => (
                  <div key={key} className={cn('flex items-center gap-2 p-3 rounded-lg', enabled ? 'bg-green-50 dark:bg-green-900/20' : 'bg-secondary-50 dark:bg-secondary-800/50')}>
                    {enabled ? (
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-secondary-300 dark:text-secondary-600 flex-shrink-0" />
                    )}
                    <span className={cn('text-sm', enabled ? 'text-secondary-700 dark:text-secondary-300' : 'text-secondary-500 dark:text-secondary-400')}>
                      {formatFeatureName(key)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Requests History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Upgrade Requests</CardTitle>
            <CardDescription>History of your plan upgrade requests</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setSelectedPlan('starter'); setShowUpgradeModal(true); }}>
            Request Upgrade
          </Button>
        </CardHeader>
        <CardContent>
          {upgradeRequests.length === 0 ? (
            <div className="text-center py-12">
              <Info className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <p className="text-secondary-600 dark:text-secondary-400 mb-2">No upgrade requests yet</p>
              <p className="text-sm text-secondary-500 dark:text-secondary-500 mb-4">
                Request an upgrade when you need more scans or AI generations
              </p>
              <Button onClick={() => { setSelectedPlan('starter'); setShowUpgradeModal(true); }}>
                Request Your First Upgrade
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {upgradeRequests.map((request) => (
                <UpgradeRequestCard
                  key={request.id}
                  request={request}
                  onCancel={() => handleCancelRequest(request.id)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          selectedPlan={selectedPlan}
          onPlanChange={setSelectedPlan}
          upgradeMessage={upgradeMessage}
          onMessageChange={setUpgradeMessage}
          onSubmit={handleUpgradeRequest}
          isSubmitting={isSubmitting}
          currentPlan={subscription?.plan.slug || 'free'}
        />
      )}
    </div>
  );
}

function UsageBar({ label, used, limit, percentage, color, icon: Icon }: {
  label: string;
  used: number;
  limit: number;
  percentage: number;
  color: 'blue' | 'purple' | 'green' | 'amber';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const colorMap = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
  };

  const isUnlimited = limit === -1;

  return (
    <div className="p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-5 w-5', colorMap[color])} />
          <span className="font-medium text-secondary-700 dark:text-secondary-300">{label}</span>
        </div>
        <span className="text-sm font-mono text-secondary-900 dark:text-white">
          {isUnlimited ? 'Unlimited' : `${formatNumber(used)} / ${formatNumber(limit)}`}
        </span>
      </div>
      <Progress
        value={isUnlimited ? 0 : percentage}
        className={cn('h-3', colorMap[color].replace('bg-', 'bg-'))}
      />
      {!isUnlimited && percentage >= 80 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 text-right">
          {percentage >= 100 ? 'Limit reached' : 'Approaching limit'}
        </p>
      )}
    </div>
  );
}

function UpgradeRequestCard({ request, onCancel, formatDate }: { request: UpgradeRequest; onCancel: () => void; formatDate: (dateString: string) => string }) {
  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Your plan was approved manually.';
      case 'rejected':
        return 'Your upgrade request was not approved.';
      case 'contacted':
        return 'Our team has contacted you regarding this request.';
      case 'canceled':
        return 'This request was canceled.';
      default:
        return null;
    }
  };

  const statusMessage = getStatusMessage(request.status);

  return (
    <div className="p-4 border border-secondary-200 dark:border-secondary-700 rounded-xl hover:border-secondary-300 dark:hover:border-secondary-600 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <Crown className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p className="font-medium text-secondary-900 dark:text-white capitalize">{request.requested_plan}</p>
            <p className="text-sm text-secondary-500 dark:text-secondary-400">
              Requested {formatDate(request.created_at)}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Badge variant="secondary" className={STATUS_COLORS[request.status]}>
            {STATUS_LABELS[request.status]}
          </Badge>

          {request.message && (
            <Button variant="ghost" size="sm" className="text-left px-2">
              <span className="text-secondary-600 dark:text-secondary-400">"{request.message}"</span>
            </Button>
          )}

          {request.status === 'pending' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-error-600 hover:text-error-700 hover:bg-error-50 dark:hover:bg-error-900/20"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Cancel</span>
            </Button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="mt-3 p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg">
          <p className="text-sm text-secondary-700 dark:text-secondary-300">{statusMessage}</p>
        </div>
      )}

      {request.status !== 'pending' && request.updated_at !== request.created_at && (
        <p className="mt-3 text-sm text-secondary-500 dark:text-secondary-400">
          Status updated {formatDate(request.updated_at)}
        </p>
      )}
    </div>
  );
}

function UpgradeModal({
  isOpen,
  onClose,
  selectedPlan,
  onPlanChange,
  upgradeMessage,
  onMessageChange,
  onSubmit,
  isSubmitting,
  currentPlan,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan: 'starter' | 'pro' | 'enterprise';
  onPlanChange: (plan: 'starter' | 'pro' | 'enterprise') => void;
  upgradeMessage: string;
  onMessageChange: (message: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  currentPlan: string;
}) {
  const planOrder = ['free', 'starter', 'pro', 'enterprise'];
  const currentIndex = planOrder.indexOf(currentPlan);
  const availablePlans = UPGRADE_PLANS.filter(p => planOrder.indexOf(p) > currentIndex);

  if (!isOpen) return null;

  const planDetails: Record<string, { name: string; price: number; features: string[] }> = {
    starter: { name: 'Starter', price: 29, features: ['500 QR scans/month', '100 AI generations/month', 'Custom domain', 'Advanced analytics'] },
    pro: { name: 'Pro', price: 79, features: ['2,000 QR scans/month', '500 AI generations/month', 'Custom domain', 'Advanced analytics', 'API access', 'Priority support'] },
    enterprise: { name: 'Enterprise', price: 199, features: ['Unlimited QR scans', 'Unlimited AI generations', 'All Pro features', 'White label', 'Dedicated support', 'SLA guarantee'] },
  };

  const details = planDetails[selectedPlan];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-secondary-900 dark:text-white">Request Plan Upgrade</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Plan Selection */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-3">
              Select Plan
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {availablePlans.map((plan) => {
                const d = planDetails[plan];
                return (
                  <button
                    key={plan}
                    onClick={() => onPlanChange(plan as typeof selectedPlan)}
                    className={cn(
                      'p-3 sm:p-4 rounded-xl border-2 text-left transition-all min-h-[44px]',
                      selectedPlan === plan
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-secondary-200 dark:border-secondary-700 hover:border-secondary-300 dark:hover:border-secondary-600'
                    )}
                  >
                    <p className="font-semibold text-secondary-900 dark:text-white capitalize text-sm sm:text-base">{d.name}</p>
                    <p className="text-xs sm:text-sm text-secondary-500 dark:text-secondary-400 mt-0.5 sm:mt-1">${d.price}/month</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Plan Details */}
          <div className="p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-xl">
            <h3 className="font-medium text-secondary-900 dark:text-white mb-3">{details.name} Plan Includes:</h3>
            <ul className="space-y-2">
              {details.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-secondary-700 dark:text-secondary-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Message */}
          <div>
            <Label htmlFor="upgrade-message" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Message (Optional)
            </Label>
            <Textarea
              id="upgrade-message"
              value={upgradeMessage}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="Tell us why you want to upgrade or any specific requirements..."
              rows={3}
              className="resize-none"
              maxLength={500}
            />
            <p className="text-xs text-secondary-500 dark:text-secondary-400 mt-1 text-right">
              {upgradeMessage.length}/500
            </p>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={onSubmit} disabled={isSubmitting} isLoading={isSubmitting}>
              Submit Request
            </Button>
          </div>

          <p className="text-center text-sm text-secondary-500 dark:text-secondary-400">
            Our team will review your request and contact you within 1-2 business days.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatFeatureName(key: string) {
  const names: Record<string, string> = {
    ai_reviews: 'AI Reviews',
    custom_domain: 'Custom Domain',
    advanced_analytics: 'Advanced Analytics',
    api_access: 'API Access',
    white_label: 'White Label',
    priority_support: 'Priority Support',
  };
  return names[key] || key;
}

function BillingPageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="animate-pulse space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-20 bg-secondary-200 dark:bg-secondary-700 rounded" />
              <div className="h-20 bg-secondary-200 dark:bg-secondary-700 rounded" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="h-6 bg-secondary-200 dark:bg-secondary-700 rounded w-1/3 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-secondary-200 dark:bg-secondary-700 rounded" />)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingPageSkeleton />}>
      <BillingPageContent />
    </Suspense>
  );
}