'use client';

import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Shield, 
  Crown, 
  Edit, 
  Plus, 
  History, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Save, 
  AlertCircle,
  Archive,
  Eye,
  Layers,
  Clock,
  QrCode,
  Zap,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { toast } from 'react-hot-toast';

export interface DurationOffering {
  duration_months: number;
  price_inr: number;
  monthly_qr_quota: number;
  monthly_ai_quota: number;
  monthly_qr_limit?: number;
  monthly_ai_limit?: number;
  allocated_qr_quota?: number;
  allocated_ai_quota?: number;
  max_qr_codes: number;
}

export interface PlanVersion {
  version_number: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  created_by: string;
  published_at?: string;
  archived_at?: string;
  change_notes?: string;
  durations: {
    '1_month': DurationOffering;
    '6_months': DurationOffering;
    '12_months': DurationOffering;
  };
}

export interface PlanDefinition {
  id: string;
  name: string;
  description: string;
  display_order: number;
  is_active: boolean;
  features: Record<string, boolean>;
  versions: PlanVersion[];
}

export interface TrialConfig {
  enabled: boolean;
  duration_days: number;
  total_qr_quota: number;
  total_ai_quota: number;
  max_qr_codes: number;
  features: Record<string, boolean>;
  version: number;
  updated_at?: string;
}

const PLAN_ICONS: Record<string, any> = {
  base: Sparkles,
  pro: Shield,
  unlimited: Crown,
};

export function PlanAndTrialManagement() {
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [trialConfig, setTrialConfig] = useState<TrialConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Modal States
  const [isTrialModalOpen, setIsTrialModalOpen] = useState(false);
  const [trialForm, setTrialForm] = useState<Partial<TrialConfig>>({});

  const [editingPlan, setEditingPlan] = useState<PlanDefinition | null>(null);
  const [planForm, setPlanForm] = useState<{
    name: string;
    description: string;
    display_order: number;
    is_active: boolean;
    features: Record<string, boolean>;
  }>({ name: '', description: '', display_order: 1, is_active: true, features: {} });

  const [versioningPlan, setVersioningPlan] = useState<PlanDefinition | null>(null);
  const [versionForm, setVersionForm] = useState<{
    durations: {
      '1_month': DurationOffering;
      '6_months': DurationOffering;
      '12_months': DurationOffering;
    };
    change_notes: string;
    publishImmediately: boolean;
  }>({
    durations: {
      '1_month': { duration_months: 1, price_inr: 499, monthly_qr_quota: 200, monthly_ai_quota: 100, allocated_qr_quota: 200, allocated_ai_quota: 100, max_qr_codes: 1 },
      '6_months': { duration_months: 6, price_inr: 2499, monthly_qr_quota: 200, monthly_ai_quota: 100, allocated_qr_quota: 200, allocated_ai_quota: 100, max_qr_codes: 5 },
      '12_months': { duration_months: 12, price_inr: 4499, monthly_qr_quota: 200, monthly_ai_quota: 100, allocated_qr_quota: 200, allocated_ai_quota: 100, max_qr_codes: 10 },
    },
    change_notes: '',
    publishImmediately: true,
  });

  const [historyPlan, setHistoryPlan] = useState<PlanDefinition | null>(null);
  const [trialHistory, setTrialHistory] = useState<any[]>([]);
  const [isTrialHistoryOpen, setIsTrialHistoryOpen] = useState(false);

  // Add Plan Modal State
  const [isAddPlanModalOpen, setIsAddPlanModalOpen] = useState(false);
  const [addPlanForm, setAddPlanForm] = useState<{
    name: string;
    description: string;
    display_order: number;
    is_active: boolean;
    features: Record<string, boolean>;
    durations: {
      '1_month': DurationOffering;
      '6_months': DurationOffering;
      '12_months': DurationOffering;
    };
  }>({
    name: '',
    description: '',
    display_order: 1,
    is_active: true,
    features: {
      google_reviews: true,
      ai_generation: true,
      qr_customization: true,
      advanced_analytics: false,
      api_access: false,
      white_label: false,
      priority_support: false,
    },
    durations: {
      '1_month': { duration_months: 1, price_inr: 799, monthly_qr_quota: 100, monthly_ai_quota: 50, allocated_qr_quota: 100, allocated_ai_quota: 50, max_qr_codes: 1 },
      '6_months': { duration_months: 6, price_inr: 3999, monthly_qr_quota: 100, monthly_ai_quota: 50, allocated_qr_quota: 100, allocated_ai_quota: 50, max_qr_codes: 5 },
      '12_months': { duration_months: 12, price_inr: 6999, monthly_qr_quota: 100, monthly_ai_quota: 50, allocated_qr_quota: 100, allocated_ai_quota: 50, max_qr_codes: 10 },
    },
  });

  // Delete / Archive Modal State
  const [deletingPlan, setDeletingPlan] = useState<PlanDefinition | null>(null);
  const [deleteReferences, setDeleteReferences] = useState<{
    hasActiveSubscriptions?: boolean;
    hasHistoricalSubscriptions?: boolean;
    hasPendingRequests?: boolean;
    activeSubscriptionCount?: number;
    historicalSubscriptionCount?: number;
    pendingRequestCount?: number;
    totalReferences?: number;
    canPermanentlyDelete?: boolean;
  } | null>(null);
  const [isCheckingReferences, setIsCheckingReferences] = useState(false);

  const openAddPlanModal = () => {
    const nextOrder = plans.reduce((max, p) => Math.max(max, p.display_order || 0), 0) + 1;
    setAddPlanForm({
      name: '',
      description: '',
      display_order: nextOrder,
      is_active: true,
      features: {
        google_reviews: true,
        ai_generation: true,
        qr_customization: true,
        advanced_analytics: false,
        api_access: false,
        white_label: false,
        priority_support: false,
      },
      durations: {
        '1_month': { duration_months: 1, price_inr: 799, monthly_qr_quota: 100, monthly_ai_quota: 50, allocated_qr_quota: 100, allocated_ai_quota: 50, max_qr_codes: 1 },
        '6_months': { duration_months: 6, price_inr: 3999, monthly_qr_quota: 100, monthly_ai_quota: 50, allocated_qr_quota: 100, allocated_ai_quota: 50, max_qr_codes: 5 },
        '12_months': { duration_months: 12, price_inr: 6999, monthly_qr_quota: 100, monthly_ai_quota: 50, allocated_qr_quota: 100, allocated_ai_quota: 50, max_qr_codes: 10 },
      },
    });
    setIsAddPlanModalOpen(true);
  };

  const handleSaveNewPlan = async () => {
    if (!addPlanForm.name.trim()) {
      toast.error('Plan name is required');
      return;
    }
    try {
      setIsSaving(true);
      const res = await api.post<{ data: PlanDefinition }>('/admin/plans', addPlanForm);
      toast.success(`Plan "${res.data.name}" created successfully`);
      setIsAddPlanModalOpen(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create plan');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlanClick = async (plan: PlanDefinition) => {
    setDeletingPlan(plan);
    setDeleteReferences(null);
    setIsCheckingReferences(true);
    try {
      const res = await api.get<{ data: any }>(`/admin/plans/${plan.id}/references`);
      setDeleteReferences(res.data);
    } catch (err: any) {
      console.error('Failed to check plan references', err);
    } finally {
      setIsCheckingReferences(false);
    }
  };

  const handleConfirmDelete = async (forceArchive: boolean) => {
    if (!deletingPlan) return;
    try {
      setIsSaving(true);
      const url = forceArchive ? `/admin/plans/${deletingPlan.id}?forceArchive=true` : `/admin/plans/${deletingPlan.id}`;
      const res = await api.delete<{ data: any; message: string }>(url);
      toast.success(res.message || (forceArchive ? 'Plan archived successfully' : 'Plan permanently deleted'));
      setDeletingPlan(null);
      setDeleteReferences(null);
      await fetchData();
    } catch (err: any) {
      if (err.response?.status === 409 && err.response?.data?.details) {
        setDeleteReferences(err.response.data.details);
      } else {
        toast.error(err.response?.data?.message || 'Failed to delete plan');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const fetchTrialHistory = async () => {
    try {
      const res = await api.get<{ data: any[] }>('/admin/trial-config/history');
      setTrialHistory(res.data || []);
    } catch (e) {
      console.error('Failed to load trial history', e);
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [plansRes, trialRes, historyRes] = await Promise.all([
        api.get<{ data: PlanDefinition[] }>('/admin/plans'),
        api.get<{ data: TrialConfig }>('/admin/trial-config'),
        api.get<{ data: any[] }>('/admin/trial-config/history').catch(() => ({ data: [] })),
      ]);
      setPlans(plansRes.data);
      setTrialConfig(trialRes.data);
      setTrialHistory(historyRes.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load plans and trial configuration');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Handlers: Trial Config ---
  const openTrialModal = () => {
    if (!trialConfig) return;
    setTrialForm({
      enabled: trialConfig.enabled,
      duration_days: trialConfig.duration_days,
      total_qr_quota: trialConfig.total_qr_quota,
      total_ai_quota: trialConfig.total_ai_quota,
      max_qr_codes: trialConfig.max_qr_codes,
      features: { ...trialConfig.features },
    });
    setIsTrialModalOpen(true);
  };

  const handleSaveTrial = async () => {
    try {
      setIsSaving(true);
      const res = await api.patch<{ data: TrialConfig & { affected_active_trials?: number } }>('/admin/trial-config', trialForm);
      setTrialConfig(res.data);
      await fetchTrialHistory();
      const affectedMsg = res.data.affected_active_trials !== undefined
        ? ` (${res.data.affected_active_trials} active trials updated)`
        : '';
      toast.success(`Free Trial configuration saved${affectedMsg}.`);
      setIsTrialModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save trial configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Handlers: Plan Info ---
  const openEditPlanModal = (plan: PlanDefinition) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description,
      display_order: plan.display_order,
      is_active: plan.is_active,
      features: { ...plan.features },
    });
  };

  const handleSavePlanMetadata = async () => {
    if (!editingPlan) return;
    try {
      setIsSaving(true);
      const res = await api.patch<{ data: PlanDefinition }>(`/admin/plans/${editingPlan.id}`, planForm);
      setPlans(prev => prev.map(p => p.id === editingPlan.id ? res.data : p));
      toast.success(`${res.data.name} plan updated`);
      setEditingPlan(null);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update plan metadata');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Handlers: New Version ---
  const openNewVersionModal = (plan: PlanDefinition) => {
    setVersioningPlan(plan);
    const activeVer = plan.versions.find(v => v.status === 'active') || plan.versions[0];
    if (activeVer) {
      setVersionForm({
        durations: JSON.parse(JSON.stringify(activeVer.durations)),
        change_notes: '',
        publishImmediately: true,
      });
    }
  };

  const handleCreateVersion = async () => {
    if (!versioningPlan) return;
    try {
      setIsSaving(true);
      await api.post(`/admin/plans/${versioningPlan.id}/versions`, versionForm);
      toast.success(`New version created for ${versioningPlan.name} plan`);
      setVersioningPlan(null);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create plan version');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishVersion = async (planId: string, versionNumber: number) => {
    try {
      await api.post(`/admin/plans/${planId}/versions/${versionNumber}/publish`);
      toast.success(`Version ${versionNumber} published as active`);
      await fetchData();
      if (historyPlan && historyPlan.id === planId) {
        const updated = await api.get<{ data: PlanDefinition[] }>('/admin/plans');
        const match = updated.data.find(p => p.id === planId);
        if (match) setHistoryPlan(match);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to publish version');
    }
  };

  const handleArchiveVersion = async (planId: string, versionNumber: number) => {
    try {
      await api.post(`/admin/plans/${planId}/versions/${versionNumber}/archive`);
      toast.success(`Version ${versionNumber} archived`);
      await fetchData();
      if (historyPlan && historyPlan.id === planId) {
        const updated = await api.get<{ data: PlanDefinition[] }>('/admin/plans');
        const match = updated.data.find(p => p.id === planId);
        if (match) setHistoryPlan(match);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to archive version');
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* FREE TRIAL CONFIGURATION CARD */}
      <Card className="border-secondary-200 dark:border-secondary-700 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                FREE TRIAL
              </CardTitle>
              <Badge variant={trialConfig?.enabled ? 'default' : 'secondary'} className={trialConfig?.enabled ? 'bg-green-600' : ''}>
                {trialConfig?.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              {trialConfig?.version && (
                <Badge variant="outline" className="text-xs">
                  Config v{trialConfig.version}
                </Badge>
              )}
            </div>
            <CardDescription>
              Admin-controlled terms for new trial signups. Ongoing customer trials retain their initial terms.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                fetchTrialHistory();
                setIsTrialHistoryOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <History className="h-3.5 w-3.5" /> History ({trialHistory.length})
            </Button>
            <Button variant="outline" size="sm" onClick={openTrialModal} className="flex items-center gap-2">
              <Edit className="h-4 w-4" /> Edit Trial
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-secondary-50 dark:bg-secondary-800/40 rounded-xl mb-4">
            <div>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 font-medium">Duration</p>
              <p className="text-lg font-bold text-secondary-900 dark:text-white mt-0.5">
                {trialConfig?.duration_days} Days
              </p>
            </div>
            <div>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 font-medium">QR Limit</p>
              <p className="text-lg font-bold text-secondary-900 dark:text-white mt-0.5">
                {trialConfig?.total_qr_quota} total scans
              </p>
            </div>
            <div>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 font-medium">AI Limit</p>
              <p className="text-lg font-bold text-secondary-900 dark:text-white mt-0.5">
                {trialConfig?.total_ai_quota} total drafts
              </p>
            </div>
            <div>
              <p className="text-xs text-secondary-500 dark:text-secondary-400 font-medium">Max QR Codes</p>
              <p className="text-lg font-bold text-secondary-900 dark:text-white mt-0.5">
                {trialConfig?.max_qr_codes} code
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-xs text-secondary-500 dark:text-secondary-400 self-center mr-1">Trial Features:</span>
            {trialConfig?.features && Object.entries(trialConfig.features).map(([key, enabled]) => (
              <Badge key={key} variant={enabled ? 'secondary' : 'outline'} className={enabled ? 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300' : 'opacity-40'}>
                {key.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* PLANS MANAGEMENT: BASE, PRO, UNLIMITED */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-secondary-900 dark:text-white">Paid Plans & Versioning</h2>
            <p className="text-sm text-secondary-600 dark:text-secondary-400">
              Manage plans with 1, 6, and 12-month monthly quota offerings.
            </p>
          </div>
          <Button onClick={openAddPlanModal} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Plan
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.id] || Sparkles;
            const activeVer = plan.versions.find(v => v.status === 'active') || plan.versions[0];

            return (
              <Card key={plan.id} className="border-secondary-200 dark:border-secondary-700">
                <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-2xl font-bold text-secondary-900 dark:text-white">
                          {plan.name}
                        </CardTitle>
                        <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {activeVer && (
                          <Badge variant="outline" className="bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-mono">
                            v{activeVer.version_number} (Active)
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        {plan.description}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditPlanModal(plan)} className="flex items-center gap-1.5">
                      <Edit className="h-3.5 w-3.5" /> Edit Info
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openNewVersionModal(plan)} className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400">
                      <Plus className="h-3.5 w-3.5" /> New Version
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setHistoryPlan(plan)} className="flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5" /> History ({plan.versions?.length || 1})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeletePlanClick(plan)}
                      className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/40"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Duration Offerings Matrix */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['1_month', '6_months', '12_months'] as const).map((durKey) => {
                      const offering = activeVer?.durations?.[durKey];
                      if (!offering) return null;

                      return (
                        <div key={durKey} className="p-4 rounded-xl border border-secondary-200 dark:border-secondary-700 bg-secondary-50/50 dark:bg-secondary-800/30 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-secondary-900 dark:text-white text-base">
                              {offering.duration_months} {offering.duration_months === 1 ? 'Month' : 'Months'}
                            </span>
                            <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
                              {formatCurrency(offering.price_inr)}
                            </span>
                          </div>

                          <div className="space-y-1.5 text-sm pt-2 border-t border-secondary-200 dark:border-secondary-700">
                            <div className="flex justify-between text-secondary-600 dark:text-secondary-300">
                              <span className="flex items-center gap-1.5">
                                <QrCode className="h-4 w-4 text-blue-500" /> Monthly QR Limit:
                              </span>
                              <span className="font-medium text-secondary-900 dark:text-white">
                                {offering.monthly_qr_quota === -1 || offering.allocated_qr_quota === -1 ? 'Unlimited' : `${formatNumber(offering.monthly_qr_quota ?? offering.allocated_qr_quota ?? 0)} / month`}
                              </span>
                            </div>
                            <div className="flex justify-between text-secondary-600 dark:text-secondary-300">
                              <span className="flex items-center gap-1.5">
                                <Zap className="h-4 w-4 text-purple-500" /> Monthly AI Limit:
                              </span>
                              <span className="font-medium text-secondary-900 dark:text-white">
                                {offering.monthly_ai_quota === -1 || offering.allocated_ai_quota === -1 ? 'Unlimited' : `${formatNumber(offering.monthly_ai_quota ?? offering.allocated_ai_quota ?? 0)} / month`}
                              </span>
                            </div>
                            <div className="flex justify-between text-secondary-600 dark:text-secondary-300">
                              <span>Max QR Codes:</span>
                              <span className="font-medium text-secondary-900 dark:text-white">
                                {offering.max_qr_codes}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Included features */}
                  <div className="pt-2">
                    <span className="text-xs text-secondary-500 dark:text-secondary-400 mr-2">Plan Features:</span>
                    <div className="inline-flex flex-wrap gap-1.5 mt-1">
                      {Object.entries(plan.features || {}).map(([key, enabled]) => (
                        <Badge key={key} variant={enabled ? 'secondary' : 'outline'} className={enabled ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-none' : 'opacity-40'}>
                          {key.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* DIALOG: EDIT TRIAL CONFIGURATION */}
      {isTrialModalOpen && (
        <Dialog open={isTrialModalOpen} onOpenChange={setIsTrialModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Free Trial Configuration</DialogTitle>
              <DialogDescription>
                Updates trial terms for future signups. Current ongoing trials will not be affected.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="trial-enabled" className="cursor-pointer">Enable Free Trial</Label>
                <Switch
                  id="trial-enabled"
                  checked={trialForm.enabled}
                  onCheckedChange={(checked) => setTrialForm(prev => ({ ...prev, enabled: checked }))}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="trial-days">Trial Duration (Days)</Label>
                <Input
                  id="trial-days"
                  type="number"
                  min={1}
                  value={trialForm.duration_days ?? 14}
                  onChange={(e) => setTrialForm(prev => ({ ...prev, duration_days: parseInt(e.target.value) || 1 }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="trial-qr">Total QR Quota</Label>
                  <Input
                    id="trial-qr"
                    type="number"
                    min={0}
                    value={trialForm.total_qr_quota ?? 100}
                    onChange={(e) => setTrialForm(prev => ({ ...prev, total_qr_quota: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="trial-ai">Total AI Quota</Label>
                  <Input
                    id="trial-ai"
                    type="number"
                    min={0}
                    value={trialForm.total_ai_quota ?? 50}
                    onChange={(e) => setTrialForm(prev => ({ ...prev, total_ai_quota: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="trial-max-qr">Max QR Codes</Label>
                <Input
                  id="trial-max-qr"
                  type="number"
                  min={1}
                  value={trialForm.max_qr_codes ?? 1}
                  onChange={(e) => setTrialForm(prev => ({ ...prev, max_qr_codes: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTrialModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveTrial} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Trial Config
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIALOG: EDIT PLAN METADATA */}
      {editingPlan && (
        <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {editingPlan.name} Plan Info</DialogTitle>
              <DialogDescription>
                Modify plan name, description, and display settings. Does not alter purchased customer quotas.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="plan-name">Plan Name</Label>
                <Input
                  id="plan-name"
                  value={planForm.name}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="plan-desc">Description</Label>
                <Textarea
                  id="plan-desc"
                  rows={2}
                  value={planForm.description}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="space-y-1">
                  <Label htmlFor="plan-order">Display Order</Label>
                  <Input
                    id="plan-order"
                    type="number"
                    value={planForm.display_order}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, display_order: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label htmlFor="plan-active">Active Plan</Label>
                  <Switch
                    id="plan-active"
                    checked={planForm.is_active}
                    onCheckedChange={(c) => setPlanForm(prev => ({ ...prev, is_active: c }))}
                  />
                </div>
              </div>

              {/* Feature toggles */}
              <div className="space-y-2 pt-2 border-t border-secondary-200 dark:border-secondary-700">
                <Label className="text-sm font-semibold">Plan Features</Label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(planForm.features || {}).map(([key, enabled]) => (
                    <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-secondary-50/50 dark:bg-secondary-800/40 border border-secondary-200 dark:border-secondary-700 text-xs">
                      <Label htmlFor={`edit-feat-${key}`} className="cursor-pointer capitalize text-xs">
                        {key.replace(/_/g, ' ')}
                      </Label>
                      <Switch
                        id={`edit-feat-${key}`}
                        checked={enabled}
                        onCheckedChange={(checked) => setPlanForm(prev => ({
                          ...prev,
                          features: { ...prev.features, [key]: checked }
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPlan(null)}>Cancel</Button>
              <Button onClick={handleSavePlanMetadata} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIALOG: NEW VERSION */}
      {versioningPlan && (
        <Dialog open={!!versioningPlan} onOpenChange={(open) => !open && setVersioningPlan(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Version for {versioningPlan.name}</DialogTitle>
              <DialogDescription>
                Existing active customers will continue using their purchased version until expiration.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {(['1_month', '6_months', '12_months'] as const).map((key) => {
                const label = key === '1_month' ? '1 Month' : key === '6_months' ? '6 Months' : '12 Months';
                const off = versionForm.durations[key];

                return (
                  <div key={key} className="p-4 border rounded-xl space-y-3 bg-secondary-50/50 dark:bg-secondary-800/40">
                    <h4 className="font-semibold text-secondary-900 dark:text-white flex items-center justify-between">
                      <span>{label} Duration Offering</span>
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label>Price (INR ₹)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={off.price_inr}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setVersionForm(prev => ({
                              ...prev,
                              durations: { ...prev.durations, [key]: { ...prev.durations[key], price_inr: val } }
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Monthly QR Limit</Label>
                        <Input
                          type="number"
                          value={off.monthly_qr_quota ?? off.allocated_qr_quota}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            const q = isNaN(val) ? 0 : val;
                            setVersionForm(prev => ({
                              ...prev,
                              durations: {
                                ...prev.durations,
                                [key]: {
                                  ...prev.durations[key],
                                  monthly_qr_quota: q,
                                  monthly_qr_limit: q,
                                  allocated_qr_quota: q,
                                }
                              }
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Monthly AI Limit</Label>
                        <Input
                          type="number"
                          value={off.monthly_ai_quota ?? off.allocated_ai_quota}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            const q = isNaN(val) ? 0 : val;
                            setVersionForm(prev => ({
                              ...prev,
                              durations: {
                                ...prev.durations,
                                [key]: {
                                  ...prev.durations[key],
                                  monthly_ai_quota: q,
                                  monthly_ai_limit: q,
                                  allocated_ai_quota: q,
                                }
                              }
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Max QR Codes</Label>
                        <Input
                          type="number"
                          min={1}
                          value={off.max_qr_codes}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setVersionForm(prev => ({
                              ...prev,
                              durations: { ...prev.durations, [key]: { ...prev.durations[key], max_qr_codes: val } }
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="space-y-1">
                <Label htmlFor="change-notes">Change Notes</Label>
                <Input
                  id="change-notes"
                  placeholder="e.g. Increased QR limits for seasonal promo"
                  value={versionForm.change_notes}
                  onChange={(e) => setVersionForm(prev => ({ ...prev, change_notes: e.target.value }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-primary-50 dark:bg-primary-950/40">
                <div>
                  <Label htmlFor="publish-immediate" className="font-semibold cursor-pointer">Publish Immediately as Active Version</Label>
                  <p className="text-xs text-secondary-500">New purchases will immediately receive this version.</p>
                </div>
                <Switch
                  id="publish-immediate"
                  checked={versionForm.publishImmediately}
                  onCheckedChange={(c) => setVersionForm(prev => ({ ...prev, publishImmediately: c }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setVersioningPlan(null)}>Cancel</Button>
              <Button onClick={handleCreateVersion} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Create Version
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIALOG: VERSION HISTORY */}
      {historyPlan && (
        <Dialog open={!!historyPlan} onOpenChange={(open) => !open && setHistoryPlan(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{historyPlan.name} Version History</DialogTitle>
              <DialogDescription>
                Historical plan versions preserved for existing customer subscriptions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {historyPlan.versions.map((ver) => (
                <div key={ver.version_number} className="p-4 border rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg text-secondary-900 dark:text-white">
                        Version {ver.version_number}
                      </span>
                      <Badge variant={ver.status === 'active' ? 'default' : ver.status === 'draft' ? 'outline' : 'secondary'} className={ver.status === 'active' ? 'bg-green-600' : ''}>
                        {ver.status.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex gap-2">
                      {ver.status !== 'active' && (
                        <Button size="sm" variant="outline" onClick={() => handlePublishVersion(historyPlan.id, ver.version_number)}>
                          Publish
                        </Button>
                      )}
                      {ver.status === 'active' && historyPlan.versions.length > 1 && (
                        <Button size="sm" variant="ghost" className="text-secondary-500" onClick={() => handleArchiveVersion(historyPlan.id, ver.version_number)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-secondary-500">
                    Created: {new Date(ver.created_at).toLocaleDateString()} by {ver.created_by}
                    {ver.published_at && ` • Published: ${new Date(ver.published_at).toLocaleDateString()}`}
                    {ver.change_notes && ` • Notes: ${ver.change_notes}`}
                  </p>

                  <div className="grid grid-cols-3 gap-2 text-xs bg-secondary-50 dark:bg-secondary-800/40 p-2.5 rounded-lg">
                    {(['1_month', '6_months', '12_months'] as const).map(d => {
                      const off = ver.durations?.[d];
                      if (!off) return null;
                      return (
                        <div key={d}>
                          <span className="font-semibold text-secondary-900 dark:text-white">{d.replace('_', ' ')}:</span>
                          <span className="ml-1 text-primary-600 font-medium">₹{off.price_inr}</span>
                          <div className="text-secondary-500">QR: {off.monthly_qr_quota === -1 || off.allocated_qr_quota === -1 ? '∞' : (off.monthly_qr_quota ?? off.allocated_qr_quota)}/mo | AI: {off.monthly_ai_quota === -1 || off.allocated_ai_quota === -1 ? '∞' : (off.monthly_ai_quota ?? off.allocated_ai_quota)}/mo</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setHistoryPlan(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIALOG: TRIAL VERSION & AUDIT HISTORY */}
      {isTrialHistoryOpen && (
        <Dialog open={isTrialHistoryOpen} onOpenChange={setIsTrialHistoryOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Free Trial Configuration & Audit History</DialogTitle>
              <DialogDescription>
                Immutable historical record of all trial configuration changes, affected clients, and admin audit trail.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {trialHistory.length === 0 ? (
                <div className="text-center py-8 text-secondary-500 text-sm">
                  No configuration changes recorded yet. Current active version: v{trialConfig?.version || 1}.
                </div>
              ) : (
                trialHistory.map((item, idx) => (
                  <div key={item.id || idx} className="p-4 border rounded-xl space-y-3 border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-900">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-secondary-900 dark:text-white">
                          Config v{item.version || item.new_values?.version || idx + 1}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {item.action_type || 'TRIAL_CONFIG_CHANGED'}
                        </Badge>
                        {item.affected_active_trials !== undefined && (
                          <Badge variant="secondary" className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                            {item.affected_active_trials} Active {item.affected_active_trials === 1 ? 'Trial' : 'Trials'} Affected
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-secondary-500">
                        {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                      </span>
                    </div>

                    <p className="text-xs text-secondary-600 dark:text-secondary-400">
                      Modified by: <span className="font-mono font-medium">{item.admin_id || 'admin'}</span>
                      {item.affected_fields && item.affected_fields.length > 0 && (
                        <span> • Changed: {item.affected_fields.join(', ')}</span>
                      )}
                    </p>

                    {item.summary && (
                      <div className="text-xs p-2 bg-secondary-50 dark:bg-secondary-800/40 rounded text-secondary-700 dark:text-secondary-300 font-mono">
                        {item.summary}
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-secondary-50 dark:bg-secondary-800/40 p-2.5 rounded-lg">
                      <div>
                        <span className="text-secondary-500">Duration:</span>
                        <span className="ml-1 font-semibold text-secondary-900 dark:text-white">
                          {item.new_values?.duration_days ?? '-'} Days
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary-500">QR Quota:</span>
                        <span className="ml-1 font-semibold text-secondary-900 dark:text-white">
                          {item.new_values?.total_qr_quota ?? '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary-500">AI Quota:</span>
                        <span className="ml-1 font-semibold text-secondary-900 dark:text-white">
                          {item.new_values?.total_ai_quota ?? '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary-500">Max QRs:</span>
                        <span className="ml-1 font-semibold text-secondary-900 dark:text-white">
                          {item.new_values?.max_qr_codes ?? '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTrialHistoryOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIALOG: ADD NEW PLAN */}
      {isAddPlanModalOpen && (
        <Dialog open={isAddPlanModalOpen} onOpenChange={setIsAddPlanModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Subscription Plan</DialogTitle>
              <DialogDescription>
                Create a new paid plan offering with 1, 6, and 12-month durations and monthly limits.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
              <div className="space-y-4 p-4 border rounded-xl bg-secondary-50/50 dark:bg-secondary-800/30">
                <h4 className="font-semibold text-secondary-900 dark:text-white">Plan Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="add-plan-name">Plan Name *</Label>
                    <Input
                      id="add-plan-name"
                      placeholder="e.g. Custom Growth"
                      value={addPlanForm.name}
                      onChange={(e) => setAddPlanForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="add-plan-order">Display Order</Label>
                    <Input
                      id="add-plan-order"
                      type="number"
                      value={addPlanForm.display_order}
                      onChange={(e) => setAddPlanForm(prev => ({ ...prev, display_order: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add-plan-desc">Short Description</Label>
                  <Textarea
                    id="add-plan-desc"
                    rows={2}
                    placeholder="Brief description of the plan..."
                    value={addPlanForm.description}
                    onChange={(e) => setAddPlanForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <Label htmlFor="add-plan-active" className="cursor-pointer font-medium">Active Status</Label>
                    <p className="text-xs text-secondary-500">Active plans appear in client plan selection catalog.</p>
                  </div>
                  <Switch
                    id="add-plan-active"
                    checked={addPlanForm.is_active}
                    onCheckedChange={(c) => setAddPlanForm(prev => ({ ...prev, is_active: c }))}
                  />
                </div>
              </div>

              {/* Multiple Durations Configuration */}
              <div className="space-y-4">
                <h4 className="font-semibold text-secondary-900 dark:text-white">Duration Offerings (1 / 6 / 12 Months)</h4>
                {(['1_month', '6_months', '12_months'] as const).map((key) => {
                  const label = key === '1_month' ? '1 Month' : key === '6_months' ? '6 Months' : '12 Months';
                  const off = addPlanForm.durations[key];

                  return (
                    <div key={key} className="p-4 border rounded-xl space-y-3 bg-secondary-50/50 dark:bg-secondary-800/40">
                      <h5 className="font-semibold text-secondary-900 dark:text-white flex items-center justify-between">
                        <span>{label} Offering</span>
                      </h5>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label>Price (INR ₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={off.price_inr}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setAddPlanForm(prev => ({
                                ...prev,
                                durations: { ...prev.durations, [key]: { ...prev.durations[key], price_inr: val } }
                              }));
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Monthly QR Limit</Label>
                          <Input
                            type="number"
                            value={off.monthly_qr_quota}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const q = isNaN(val) ? 0 : val;
                              setAddPlanForm(prev => ({
                                ...prev,
                                durations: {
                                  ...prev.durations,
                                  [key]: {
                                    ...prev.durations[key],
                                    monthly_qr_quota: q,
                                    monthly_qr_limit: q,
                                    allocated_qr_quota: q,
                                  }
                                }
                              }));
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Monthly AI Limit</Label>
                          <Input
                            type="number"
                            value={off.monthly_ai_quota}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const q = isNaN(val) ? 0 : val;
                              setAddPlanForm(prev => ({
                                ...prev,
                                durations: {
                                  ...prev.durations,
                                  [key]: {
                                    ...prev.durations[key],
                                    monthly_ai_quota: q,
                                    monthly_ai_limit: q,
                                    allocated_ai_quota: q,
                                  }
                                }
                              }));
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Max QR Codes</Label>
                          <Input
                            type="number"
                            min={1}
                            value={off.max_qr_codes}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 1;
                              setAddPlanForm(prev => ({
                                ...prev,
                                durations: { ...prev.durations, [key]: { ...prev.durations[key], max_qr_codes: val } }
                              }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Plan Features */}
              <div className="space-y-3 p-4 border rounded-xl bg-secondary-50/50 dark:bg-secondary-800/30">
                <h4 className="font-semibold text-secondary-900 dark:text-white">Plan Features</h4>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(addPlanForm.features).map(([featKey, featVal]) => (
                    <div key={featKey} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-700">
                      <Label htmlFor={`feat-${featKey}`} className="text-xs font-medium cursor-pointer capitalize">
                        {featKey.replace(/_/g, ' ')}
                      </Label>
                      <Switch
                        id={`feat-${featKey}`}
                        checked={featVal}
                        onCheckedChange={(checked) => setAddPlanForm(prev => ({
                          ...prev,
                          features: { ...prev.features, [featKey]: checked }
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddPlanModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveNewPlan} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIALOG: DELETE / ARCHIVE CONFIRMATION */}
      {deletingPlan && (
        <Dialog open={!!deletingPlan} onOpenChange={(open) => !open && setDeletingPlan(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-secondary-900 dark:text-white">
                {deleteReferences && deleteReferences.totalReferences && deleteReferences.totalReferences > 0 ? (
                  <>
                    <Archive className="h-5 w-5 text-amber-500" />
                    Archive Plan: {deletingPlan.name}?
                  </>
                ) : (
                  <>
                    <Trash2 className="h-5 w-5 text-red-500" />
                    Delete Plan: {deletingPlan.name}?
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="py-3">
              {isCheckingReferences ? (
                <div className="flex items-center justify-center py-6 gap-3 text-secondary-600">
                  <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                  <span>Checking customer subscriptions and requests...</span>
                </div>
              ) : deleteReferences && deleteReferences.totalReferences && deleteReferences.totalReferences > 0 ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-sm">
                    <p className="font-semibold flex items-center gap-1.5 mb-1">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      Plan in Use
                    </p>
                    <p>
                      This plan is currently used by existing customers. It will be archived instead of permanently deleted.
                    </p>
                  </div>

                  <div className="space-y-1.5 text-xs text-secondary-600 dark:text-secondary-400 bg-secondary-50 dark:bg-secondary-800/40 p-3 rounded-lg border border-secondary-200 dark:border-secondary-700">
                    <div className="flex justify-between">
                      <span>Active Subscriptions:</span>
                      <span className="font-semibold text-secondary-900 dark:text-white">
                        {deleteReferences.activeSubscriptionCount || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Historical Subscriptions:</span>
                      <span className="font-semibold text-secondary-900 dark:text-white">
                        {deleteReferences.historicalSubscriptionCount || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pending Requests:</span>
                      <span className="font-semibold text-secondary-900 dark:text-white">
                        {deleteReferences.pendingRequestCount || 0}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-secondary-500 leading-relaxed">
                    Existing customers will continue using their purchased plan without interruption. The plan will no longer be available for new customer purchases or activations.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-secondary-700 dark:text-secondary-300">
                    This plan has no active or historical customer subscriptions and no pending requests.
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                    It will be permanently deleted from the database. This action cannot be undone.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setDeletingPlan(null)}>
                Cancel
              </Button>
              {deleteReferences && deleteReferences.totalReferences && deleteReferences.totalReferences > 0 ? (
                <Button
                  onClick={() => handleConfirmDelete(true)}
                  disabled={isSaving || isCheckingReferences}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
                  Archive
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => handleConfirmDelete(false)}
                  disabled={isSaving || isCheckingReferences}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Delete Permanently
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
