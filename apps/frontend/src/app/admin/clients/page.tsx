'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Filter,
  ArrowUpDown,
  Building2,
  Calendar,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  UserCheck,
  UserX,
  ShieldAlert,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { cn, formatNumber } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface ClientItem {
  id: string;
  user_id: string;
  name: string;
  owner_name: string;
  email: string;
  owner_email: string;
  role: string;
  business_count: number;
  business_names: string[];
  primary_business_name: string;
  slug: string;
  category: string;
  category_name: string;
  categories: string[];
  account_status: 'active' | 'deactivated';
  activity_status: 'active' | 'inactive' | 'deactivated';
  is_active_recently: boolean;
  status: string;
  plan: string;
  created_at: string;
  last_activity: string;
  last_login_at?: string;
  total_scans: number;
  total_sessions: number;
  total_drafts: number;
  google_continue_events: number;
  total_qr_codes: number;
  active_qr_codes: number;
  businesses: Array<{
    id: string;
    name: string;
    slug: string;
    category: string;
    category_name: string;
    status: string;
    plan: string;
    total_scans: number;
    total_sessions: number;
    total_drafts: number;
    google_continue_events: number;
  }>;
}

export default function AdminClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [meta, setMeta] = useState<{
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    active_users_count?: number;
    inactive_users_count?: number;
    deactivated_users_count?: number;
    total_businesses_count?: number;
  }>({
    total: 0,
    page: 1,
    limit: 20,
    total_pages: 1,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [plan, setPlan] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Deactivation confirmation modal state
  const [userToDeactivate, setUserToDeactivate] = useState<ClientItem | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const fetchClients = async (isRef = false) => {
    try {
      if (isRef) setIsRefreshing(true);
      else setIsLoading(true);

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());
      if (category !== 'all') params.set('category', category);
      if (plan !== 'all') params.set('plan', plan);
      if (status !== 'all') params.set('status', status);
      if (sort !== 'newest') params.set('sort', sort);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await api.get<{ data: ClientItem[]; meta: any }>(`/admin/clients?${params.toString()}`);
      setClients(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (e) {
      console.error('Error fetching clients:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [page, category, plan, status, sort, dateFrom, dateTo]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchClients();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle Deactivate User
  const handleConfirmDeactivate = async () => {
    if (!userToDeactivate) return;
    try {
      setIsProcessingAction(true);
      await api.post(`/admin/users/${userToDeactivate.id}/deactivate`, {
        reason: 'Deactivated by Platform Administrator',
      });
      toast.success(`User ${userToDeactivate.email} has been deactivated.`);
      setUserToDeactivate(null);
      fetchClients(true);
    } catch (err: any) {
      console.error('Failed to deactivate user:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to deactivate user.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Handle Activate User
  const handleActivateUser = async (user: ClientItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post(`/admin/users/${user.id}/activate`, {});
      toast.success(`User ${user.email} has been reactivated.`);
      fetchClients(true);
    } catch (err: any) {
      console.error('Failed to activate user:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to activate user.');
    }
  };

  const renderStatusBadge = (accountStatus: string, activityStatus: string) => {
    if (accountStatus === 'deactivated') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Deactivated
        </span>
      );
    }
    if (activityStatus === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-800 text-slate-400 border border-slate-700">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Inactive
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Active Clients</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 rounded-full">
              {meta.total} clients
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Complete registry of all registered users, multi-business ownership, activity, and review metrics.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchClients(true)}
          disabled={isRefreshing}
          className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs gap-2 rounded-xl self-start sm:self-auto"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filter Controls Bar */}
      <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Input */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search user name, email, ID, or business..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-slate-950/70 border-slate-800 text-white placeholder:text-slate-500 h-9 text-xs rounded-xl focus-visible:ring-primary-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Categories</option>
            <option value="gym">Gym &amp; Fitness</option>
            <option value="cafe">Café &amp; Coffee</option>
            <option value="restaurant">Restaurant</option>
            <option value="hospital">Hospital &amp; Healthcare</option>
            <option value="dental">Dental Clinic</option>
            <option value="salon">Salon &amp; Beauty</option>
            <option value="hotel">Hotel &amp; Hospitality</option>
            <option value="retail">Retail Store</option>
            <option value="automobile">Automobile Service</option>
            <option value="education">Education &amp; Coaching</option>
            <option value="other">Other</option>
          </select>

          {/* Plan Filter */}
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Plans</option>
            <option value="free">Free Tier</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>

          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Accounts</option>
            <option value="deactivated">Deactivated Accounts</option>
            <option value="active_recent">Active Recently (30d)</option>
            <option value="inactive">Inactive (No Recent Activity)</option>
          </select>

          {/* Sort Filter */}
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary-500"
          >
            <option value="newest">Newest Users</option>
            <option value="oldest">Oldest Users</option>
            <option value="last_activity">Last Activity</option>
            <option value="businesses_desc">Most Businesses</option>
            <option value="usage_desc">Most Usage</option>
          </select>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3.5 px-4">User / Owner</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-3">Businesses</th>
                <th className="py-3.5 px-3">Category</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-3">Subscription</th>
                <th className="py-3.5 px-3 text-center">QR Scans</th>
                <th className="py-3.5 px-3 text-center">Sessions</th>
                <th className="py-3.5 px-3 text-center">AI Drafts</th>
                <th className="py-3.5 px-3 text-center">Google Continues</th>
                <th className="py-3.5 px-4">Last Activity</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary-400" />
                    Loading client registry...
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    No clients match the specified search or filters.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/admin/clients/${c.id}`)}
                  >
                    {/* User / Owner */}
                    <td className="py-3.5 px-4 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary-500/15 border border-primary-500/30 flex items-center justify-center flex-shrink-0 text-primary-400 font-bold text-[11px]">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate max-w-[140px]">
                          <span className="group-hover:text-primary-400 transition-colors">{c.name}</span>
                          <span className="block text-[10px] text-slate-500 font-normal font-mono truncate">
                            ID: {c.id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-3.5 px-4 text-slate-400 truncate max-w-[160px] font-mono text-[11px]">
                      {c.email}
                    </td>

                    {/* Businesses Count & Names */}
                    <td className="py-3.5 px-3">
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                          <Building2 className="w-3 h-3 text-primary-400" />
                          <span>{c.business_count} {c.business_count === 1 ? 'business' : 'businesses'}</span>
                        </span>
                        {c.business_names.length > 0 && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                            {c.business_names.join(', ')}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-800/90 text-slate-300 border border-slate-700 uppercase">
                        {c.category_name}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-3">
                      {renderStatusBadge(c.account_status, c.activity_status)}
                    </td>

                    {/* Subscription */}
                    <td className="py-3.5 px-3 font-medium text-slate-300 capitalize">
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {c.plan}
                      </span>
                    </td>

                    {/* QR Scans */}
                    <td className="py-3.5 px-3 text-center font-mono font-medium text-slate-200">
                      {formatNumber(c.total_scans)}
                    </td>

                    {/* Sessions */}
                    <td className="py-3.5 px-3 text-center font-mono font-medium text-slate-200">
                      {formatNumber(c.total_sessions)}
                    </td>

                    {/* AI Drafts */}
                    <td className="py-3.5 px-3 text-center font-mono font-medium text-slate-200">
                      {formatNumber(c.total_drafts)}
                    </td>

                    {/* Google Continues */}
                    <td className="py-3.5 px-3 text-center font-mono font-medium text-emerald-400">
                      {formatNumber(c.google_continue_events)}
                    </td>

                    {/* Last Activity */}
                    <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                      {new Date(c.last_activity).toLocaleDateString()}
                    </td>

                    {/* Actions: View + Activate/Deactivate */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/admin/clients/${c.id}`}
                          className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 font-medium px-2 py-1 rounded-lg hover:bg-primary-500/10 text-[11px] transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </Link>

                        {c.role === 'admin' ? null : c.account_status === 'deactivated' ? (
                          <button
                            onClick={(e) => handleActivateUser(c, e)}
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded-lg hover:bg-emerald-500/10 text-[11px] transition-colors"
                            title="Activate User Account"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Activate</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setUserToDeactivate(c)}
                            className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded-lg hover:bg-red-500/10 text-[11px] transition-colors"
                            title="Deactivate User Account"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Deactivate</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.total_pages > 1 && (
          <div className="p-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 bg-slate-950/50">
            <span>
              Showing {((meta.page - 1) * meta.limit) + 1} to {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} clients
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 px-2.5 border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="px-2 text-slate-200 font-medium">
                Page {meta.page} of {meta.total_pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page >= meta.total_pages}
                onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                className="h-8 px-2.5 border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Deactivation Confirmation Modal */}
      {userToDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white">Deactivate this user?</h3>
                <p className="text-xs text-slate-400 mt-1">
                  The user <span className="font-semibold text-slate-200">{userToDeactivate.email}</span> will immediately lose access to protected ReviewAI dashboard functionality.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Historical Data Preservation</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                All businesses ({userToDeactivate.business_count}), QR codes, scans, reviews, and subscriptions will remain safely preserved in the database. You can reactivate this account at any time.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUserToDeactivate(null)}
                disabled={isProcessingAction}
                className="border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmDeactivate}
                disabled={isProcessingAction}
                className="bg-red-600 hover:bg-red-500 text-white text-xs gap-1.5"
              >
                {isProcessingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Deactivate User</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
