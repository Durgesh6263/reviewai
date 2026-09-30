'use client';

import { useState, useEffect } from 'react';
import { Loader2, ArrowLeft, AlertCircle, CheckCircle, AlertTriangle, Building2, User, Mail, Phone, Globe, MapPin, Calendar, CreditCard, QrCode, Tag, BarChart2, MessageSquare, Settings, ExternalLink, Download, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { formatDate, formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

interface BusinessDetail {
  id: string;
  name: string;
  slug: string;
  email: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  owner_role: string;
  owner_is_pilot: boolean;
  owner_pilot_cohort: string | null;
  owner_created_at: string | null;
  description: string | null;
  logo_url: string | null;
  google_review_url: string | null;
  website_url: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  timezone: string;
  status: string;
  settings: Record<string, unknown>;
  is_pilot_business: boolean;
  pilot_limits: {
    max_qr_codes: number;
    max_scans_per_month: number;
    max_staff: number;
  };
  pilot_readiness: {
    score: number;
    status: 'not_started' | 'in_progress' | 'ready' | 'launched';
    missing: string[];
  };
  health: {
    score: number;
    status: 'healthy' | 'at_risk' | 'critical';
    factors: string[];
  };
  activity_summary: {
    scans_30d: number;
    sessions_30d: number;
    reviews_30d: number;
    conversion_rate: number;
    avg_rating: number;
    top_languages: { language: string; count: number }[];
  };
  qr_codes: Array<{
    id: string;
    name: string;
    slug: string;
    design: Record<string, unknown>;
    is_active: boolean;
    download_count: number;
    last_downloaded_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
  tags: Array<{
    id: string;
    name: string;
    emoji: string;
    order: number;
    created_at: string;
  }>;
  subscription: {
    id: string;
    plan: string;
    status: string;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    current_period_start: string;
    current_period_end: string;
    trial_start: string | null;
    trial_end: string | null;
    canceled_at: string | null;
    cancel_at_period_end: boolean;
    quantity: number;
    monthly_price: number;
    features: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  } | null;
  usage_logs: Array<{
    metric: string;
    count: number;
    period_start: string;
    period_end: string;
  }>;
  onboarding_progress: {
    current_step: string;
    completed_steps: string[];
    step_data: Record<string, unknown>;
    started_at: string;
    completed_at: string | null;
    is_pilot_user: boolean;
    pilot_cohort: string | null;
  } | null;
  feedback: Array<{
    id: string;
    category: string;
    rating: number;
    feedback_text: string | null;
    step_context: string | null;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

export default function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'qr' | 'tags' | 'usage' | 'subscription' | 'feedback'>('overview');
  const [businessId, setBusinessId] = useState<string>('');

  useEffect(() => {
    params.then(resolvedParams => {
      setBusinessId(resolvedParams.id);
    });
  }, [params]);

  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        setIsLoading(true);
        const response = await api.get<{ data: BusinessDetail }>(`/admin/businesses/${businessId}`);
        setBusiness(response.data);
      } catch (err: any) {
        console.error('Failed to fetch business:', err);
        setError(err.response?.data?.message || 'Failed to load business details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBusiness();
  }, [businessId]);

  const getReadinessBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      not_started: { label: 'Not Started', className: 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300' },
      in_progress: { label: 'In Progress', className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' },
      ready: { label: 'Ready', className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' },
      launched: { label: 'Launched', className: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' },
    };
    const c = config[status] || config.not_started;
    return (
      <Badge className={cn('text-sm px-3 py-1', c.className)}>{c.label}</Badge>
    );
  };

  const getHealthBadge = (status: string) => {
    const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      healthy: { label: 'Healthy', className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400', icon: <CheckCircle className="h-4 w-4" /> },
      at_risk: { label: 'At Risk', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400', icon: <AlertTriangle className="h-4 w-4" /> },
      critical: { label: 'Critical', className: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400', icon: <AlertCircle className="h-4 w-4" /> },
    };
    const c = config[status] || config.healthy;
    return (
      <Badge className={cn('text-sm px-3 py-1 gap-1.5', c.className)}>
        {c.icon} {c.label}
      </Badge>
    );
  };

  const getPlanBadge = (plan: string | null) => {
    if (!plan) return <Badge variant="secondary">Free</Badge>;
    const config: Record<string, string> = {
      starter: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
      professional: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400',
      enterprise: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
    };
    return (
      <Badge className={cn(config[plan] || 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300')}>
        {plan.charAt(0).toUpperCase() + plan.slice(1)}
      </Badge>
    );
  };

  const getSubscriptionStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      active: { label: 'Active', className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' },
      trialing: { label: 'Trialing', className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' },
      past_due: { label: 'Past Due', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400' },
      canceled: { label: 'Canceled', className: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' },
      incomplete: { label: 'Incomplete', className: 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300' },
    };
    const c = config[status] || { label: status, className: 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300' };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-secondary-200 dark:bg-secondary-700 rounded" />
            <div className="h-4 w-64 bg-secondary-200 dark:bg-secondary-700 rounded mt-1" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4 mb-2" />
                <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-error-500 mx-auto mb-4" />
        <p className="text-error-500 mb-4">{error || 'Business not found'}</p>
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to List
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">{business.name}</h1>
            <p className="text-secondary-600 dark:text-secondary-400 font-mono text-sm">/r/{business.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {business.is_pilot_business && (
            <Badge className="bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-400">
              Pilot Business
            </Badge>
          )}
          {getReadinessBadge(business.pilot_readiness.status)}
          {getHealthBadge(business.health.status)}
        </div>
      </div>

      {/* Open Feedback Alert Banner (Task 8) */}
      {business.feedback && business.feedback.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {business.feedback.length} customer feedback item{business.feedback.length > 1 ? 's' : ''} recorded for this business.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Review constructive feedback to resolve operational issues and improve customer satisfaction.
              </p>
            </div>
          </div>
          <Link href={`/admin/feedback?search=${encodeURIComponent(business.name)}`}>
            <Button size="sm" variant="outline" className="text-xs border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50">
              Open in Feedback System <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Pilot Readiness</p>
                <p className="text-3xl font-bold text-secondary-900 dark:text-white">{business.pilot_readiness.score}/100</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-secondary-500">{business.pilot_readiness.missing.length} items missing</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Health Score</p>
                <p className="text-3xl font-bold text-secondary-900 dark:text-white">{business.health.score}/100</p>
              </div>
              {getHealthBadge(business.health.status)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div>
              <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Scans (30d)</p>
              <p className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(business.activity_summary.scans_30d)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div>
              <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Reviews (30d)</p>
              <p className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(business.activity_summary.reviews_30d)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value: string) => setActiveTab(value as 'overview' | 'qr' | 'tags' | 'usage' | 'subscription' | 'feedback')}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="qr">QR Codes ({business?.qr_codes.length || 0})</TabsTrigger>
          <TabsTrigger value="tags">Tags ({business?.tags.length || 0})</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="feedback">Feedback ({business?.feedback.length || 0})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Business Information */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" /> Business Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Name</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1">{business.name}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Slug</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1 font-mono text-sm">/r/{business.slug}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Email</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1">{business.email}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Timezone</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1">{business.timezone}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Status</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1 capitalize">{business.status}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Created</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1">{formatDate(business.created_at)}</p>
                  </div>
                </div>
                {business.description && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Description</label>
                    <p className="text-secondary-700 dark:text-secondary-300 mt-1 whitespace-pre-wrap">{business.description}</p>
                  </div>
                )}
                {business.google_review_url && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Google Review URL</label>
                    <a href={business.google_review_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 dark:text-primary-400 mt-1 inline-flex items-center gap-1">
                      {business.google_review_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {business.website_url && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Website</label>
                    <a href={business.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 dark:text-primary-400 mt-1 inline-flex items-center gap-1">
                      {business.website_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {business.phone && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Phone</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1">{business.phone}</p>
                  </div>
                )}
                {business.address && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Address</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1">{JSON.stringify(business.address)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Owner Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" /> Owner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Name</label>
                  <p className="font-medium text-secondary-900 dark:text-white mt-1">{business.owner_name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Email</label>
                  <p className="font-medium text-secondary-900 dark:text-white mt-1">{business.owner_email}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Role</label>
                  <Badge variant="secondary" className="mt-1 capitalize">{business.owner_role}</Badge>
                </div>
                {business.owner_created_at && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Joined</label>
                    <p className="font-medium text-secondary-900 dark:text-white mt-1">{formatDate(business.owner_created_at)}</p>
                  </div>
                )}
                {business.owner_is_pilot && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Pilot Cohort</label>
                    <Badge className="mt-1 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-400">
                      {business.owner_pilot_cohort}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pilot Readiness */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" /> Pilot Readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold text-secondary-900 dark:text-white">{business.pilot_readiness.score}/100</p>
                    <p className="text-sm text-secondary-500">Overall Score</p>
                  </div>
                  {getReadinessBadge(business.pilot_readiness.status)}
                </div>
                <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      business.pilot_readiness.score >= 70 ? 'bg-green-500' :
                      business.pilot_readiness.score >= 40 ? 'bg-blue-500' :
                      business.pilot_readiness.score > 0 ? 'bg-amber-500' : 'bg-secondary-300'
                    )}
                    style={{ width: `${business.pilot_readiness.score}%` }}
                  />
                </div>
                {business.pilot_readiness.missing.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Missing Items</label>
                    <ul className="mt-2 space-y-1">
                      {business.pilot_readiness.missing.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-secondary-600 dark:text-secondary-400">
                          <AlertCircle className="h-4 w-4 text-error-500 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {business.pilot_readiness.missing.length === 0 && business.pilot_readiness.status !== 'launched' && (
                  <div className="text-center py-4">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-secondary-900 dark:text-white">Ready to Launch!</p>
                    <p className="text-sm text-secondary-500 mt-1">All pilot readiness criteria met</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Health Indicator */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="h-5 w-5" /> Health Indicator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold text-secondary-900 dark:text-white">{business.health.score}/100</p>
                    <p className="text-sm text-secondary-500">Health Score</p>
                  </div>
                  {getHealthBadge(business.health.status)}
                </div>
                <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      business.health.score >= 80 ? 'bg-green-500' :
                      business.health.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    )}
                    style={{ width: `${business.health.score}%` }}
                  />
                </div>
                {business.health.factors.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Factors</label>
                    <ul className="mt-2 space-y-1">
                      {business.health.factors.map((factor, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-secondary-600 dark:text-secondary-400">
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="h-5 w-5" /> Activity (30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 grid-cols-2">
                  <div>
                    <p className="text-2xl font-bold text-secondary-900 dark:text-white">{formatNumber(business.activity_summary.scans_30d)}</p>
                    <p className="text-sm text-secondary-500">Scans</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-secondary-900 dark:text-white">{formatNumber(business.activity_summary.sessions_30d)}</p>
                    <p className="text-sm text-secondary-500">Sessions</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-secondary-900 dark:text-white">{formatNumber(business.activity_summary.reviews_30d)}</p>
                    <p className="text-sm text-secondary-500">Reviews</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-secondary-900 dark:text-white">{business.activity_summary.conversion_rate.toFixed(1)}%</p>
                    <p className="text-sm text-secondary-500">Conversion</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Avg Rating</label>
                  <p className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">{business.activity_summary.avg_rating.toFixed(1)}/5</p>
                </div>
                {business.activity_summary.top_languages.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-secondary-500 uppercase tracking-wider">Top Languages</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {business.activity_summary.top_languages.map((lang, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {lang.language}: {lang.count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* QR Codes Tab */}
        <TabsContent value="qr" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">QR Codes</h2>
            <a href={`/admin/qr-codes?business_id=${business.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
              View All <ExternalLink className="h-3 w-3 ml-1 inline" />
            </a>
          </div>
          {business.qr_codes.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <QrCode className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No QR Codes</h3>
                <p className="text-secondary-500 dark:text-secondary-400">This business hasn't created any QR codes yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <TableHead className="px-4 py-3">QR Code</TableHead>
                      <TableHead className="px-4 py-3 hidden md:table-cell">Design</TableHead>
                      <TableHead className="px-4 py-3">Status</TableHead>
                      <TableHead className="px-4 py-3">Downloads</TableHead>
                      <TableHead className="px-4 py-3 hidden sm:table-cell">Created</TableHead>
                      <TableHead className="px-4 py-3">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {business.qr_codes.map((qr) => (
                      <TableRow key={qr.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <TableCell className="px-4 py-4">
                          <div>
                            <Link href={`/r/${qr.slug}`} target="_blank" rel="noopener noreferrer" className="font-medium text-secondary-900 dark:text-white hover:text-primary-600">
                              {qr.name || 'Unnamed QR'}
                            </Link>
                            <p className="text-sm text-secondary-500 font-mono text-xs">/r/{qr.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4 hidden md:table-cell">
                          <div className="flex items-center gap-2 text-xs text-secondary-500">
                            <span>Shape: {typeof qr.design === 'object' && qr.design && 'shape' in qr.design ? (qr.design as any).shape : 'default'}</span>
                            <span>Dots: {typeof qr.design === 'object' && qr.design && 'dot_style' in qr.design ? (qr.design as any).dot_style : 'default'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Badge variant={qr.is_active ? 'secondary' : 'outline'} className={cn(
                            qr.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                          )}>
                            {qr.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-sm text-secondary-600 dark:text-secondary-400">
                          {qr.download_count}
                        </TableCell>
                        <TableCell className="px-4 py-4 hidden sm:table-cell text-sm text-secondary-500">
                          {formatDate(qr.created_at)}
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <a href={`/r/${qr.slug}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-sm">
                              <ExternalLink className="h-4 w-4 inline-block mr-1" /> Test
                            </a>
                            <Button variant="ghost" size="sm" className="h-8">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Experience Tags</h2>
          </div>
          {business.tags.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Tag className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No Tags</h3>
                <p className="text-secondary-500 dark:text-secondary-400">No experience tags configured for this business.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <TableHead className="px-4 py-3">Tag</TableHead>
                      <TableHead className="px-4 py-3">Order</TableHead>
                      <TableHead className="px-4 py-3 hidden sm:table-cell">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {business.tags.map((tag) => (
                      <TableRow key={tag.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <TableCell className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{tag.emoji}</span>
                            <span className="font-medium text-secondary-900 dark:text-white">{tag.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-sm text-secondary-500">#{tag.order}</TableCell>
                        <TableCell className="px-4 py-4 hidden sm:table-cell text-sm text-secondary-500">
                          {formatDate(tag.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Usage & Limits</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Pilot Limits */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" /> Pilot Limits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {business.is_pilot_business ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-secondary-600 dark:text-secondary-400">QR Codes</span>
                        <span className="font-medium">{business.qr_codes.length} / {business.pilot_limits.max_qr_codes}</span>
                      </div>
                      <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (business.qr_codes.length / business.pilot_limits.max_qr_codes) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-secondary-600 dark:text-secondary-400">Scans/Month</span>
                        <span className="font-medium">{business.activity_summary.scans_30d} / {business.pilot_limits.max_scans_per_month}</span>
                      </div>
                      <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (business.activity_summary.scans_30d / business.pilot_limits.max_scans_per_month) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-secondary-600 dark:text-secondary-400">Staff Members</span>
                        <span className="font-medium">0 / {business.pilot_limits.max_staff}</span>
                      </div>
                      <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-secondary-300 rounded-full" style={{ width: '0%' }} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-secondary-500">Not a pilot business - unlimited usage</p>
                )}
              </CardContent>
            </Card>

            {/* Usage Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="h-5 w-5" /> Usage Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {business.usage_logs.length === 0 ? (
                  <p className="text-secondary-500 text-center py-8">No usage data available</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border">
                        <TableHead className="px-4 py-3">Metric</TableHead>
                        <TableHead className="px-4 py-3">Count</TableHead>
                        <TableHead className="px-4 py-3">Period</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {business.usage_logs.map((log, i) => (
                        <TableRow key={i} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                          <TableCell className="px-4 py-3 capitalize">{log.metric.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="px-4 py-3">{formatNumber(log.count)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm text-secondary-500">
                            {formatDate(log.period_start)} - {formatDate(log.period_end)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="space-y-6">
          {business.subscription ? (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" /> Subscription Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-secondary-600 dark:text-secondary-400">Plan</span>
                    <div className="flex items-center gap-2">
                      {getPlanBadge(business.subscription.plan)}
                      {getSubscriptionStatusBadge(business.subscription.status)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-secondary-600 dark:text-secondary-400">Monthly Price</span>
                    <span className="font-medium">${(business.subscription.monthly_price / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-secondary-600 dark:text-secondary-400">Billing Cycle</span>
                    <span className="font-medium capitalize">Monthly</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-secondary-600 dark:text-secondary-400">Current Period</span>
                    <span className="font-medium text-secondary-900 dark:text-white">
                      {formatDate(business.subscription.current_period_start)} - {formatDate(business.subscription.current_period_end)}
                    </span>
                  </div>
                  {business.subscription.trial_end && (
                    <div className="flex items-center justify-between">
                      <span className="text-secondary-600 dark:text-secondary-400">Trial Ends</span>
                      <span className="font-medium text-secondary-900 dark:text-white">{formatDate(business.subscription.trial_end)}</span>
                    </div>
                  )}
                  {business.subscription.cancel_at_period_end && (
                    <div className="flex items-center justify-between">
                      <span className="text-secondary-600 dark:text-secondary-400">Cancels at Period End</span>
                      <Badge variant="secondary">Yes</Badge>
                    </div>
                  )}
                  {business.subscription.stripe_customer_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-secondary-600 dark:text-secondary-400">Stripe Customer</span>
                      <span className="font-mono text-xs text-secondary-900 dark:text-white">{business.subscription.stripe_customer_id}</span>
                    </div>
                  )}
                  {business.subscription.stripe_subscription_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-secondary-600 dark:text-secondary-400">Stripe Subscription</span>
                      <span className="font-mono text-xs text-secondary-900 dark:text-white">{business.subscription.stripe_subscription_id}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" /> Features
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {business.subscription.features && Object.entries(business.subscription.features).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <span className="text-secondary-600 dark:text-secondary-400 capitalize">{key.replace(/_/g, ' ')}</span>
                      <Badge variant={value ? 'default' : 'outline'} className={value ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : ''}>
                        {value ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <CreditCard className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No Subscription</h3>
                <p className="text-secondary-500 dark:text-secondary-400">This business is on the free plan.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Pilot Feedback</h2>
            <Link href={`/admin/feedback?search=${encodeURIComponent(business.name)}`}>
              <Button size="sm" variant="outline" className="text-xs">
                Manage in Feedback System <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
          {business.feedback.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <MessageSquare className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No Feedback</h3>
                <p className="text-secondary-500 dark:text-secondary-400">No pilot feedback submitted for this business.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                      <TableHead className="px-4 py-3">Category</TableHead>
                      <TableHead className="px-4 py-3">Rating</TableHead>
                      <TableHead className="px-4 py-3">Message</TableHead>
                      <TableHead className="px-4 py-3 hidden sm:table-cell">Step</TableHead>
                      <TableHead className="px-4 py-3">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {business.feedback.map((fb) => (
                      <TableRow key={fb.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                        <TableCell className="px-4 py-4">
                          <Badge variant="secondary" className="capitalize">{fb.category.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            {'★'.repeat(fb.rating)}{'☆'.repeat(5 - fb.rating)}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <p className="text-sm text-secondary-700 dark:text-secondary-300 line-clamp-1 max-w-[300px]">
                            {fb.feedback_text || 'No description'}
                          </p>
                        </TableCell>
                        <TableCell className="px-4 py-4 hidden sm:table-cell text-sm text-secondary-500">
                          {fb.step_context || 'N/A'}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-sm text-secondary-500">
                          {formatDate(fb.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}