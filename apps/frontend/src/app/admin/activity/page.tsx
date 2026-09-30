'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  Building2,
  QrCode,
  Sparkles,
  CreditCard,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Loader2,
  Calendar,
  Filter,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';

interface ActivityItem {
  id: string;
  type: string;
  user_name?: string | null;
  user_email?: string | null;
  business_name?: string | null;
  details: string;
  status?: string | null;
  created_at: string;
}

export default function AdminActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchActivity = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: ActivityItem[] }>('/admin/recent-activity?limit=50');
      if (res?.data) {
        setActivities(res.data);
      }
    } catch (e) {
      console.error('Failed to load activity feed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, []);

  const getEventIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('business')) return <Building2 className="h-4 w-4 text-blue-400" />;
    if (t.includes('qr')) return <QrCode className="h-4 w-4 text-emerald-400" />;
    if (t.includes('ai') || t.includes('draft') || t.includes('review')) return <Sparkles className="h-4 w-4 text-amber-400" />;
    if (t.includes('subscript') || t.includes('upgrade') || t.includes('plan')) return <CreditCard className="h-4 w-4 text-purple-400" />;
    if (t.includes('user') || t.includes('register')) return <UserPlus className="h-4 w-4 text-indigo-400" />;
    if (t.includes('error') || t.includes('fail')) return <ShieldAlert className="h-4 w-4 text-rose-400" />;
    return <Activity className="h-4 w-4 text-slate-400" />;
  };

  const getBadgeVariant = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('business')) return 'border-blue-500/30 text-blue-400 bg-blue-500/10';
    if (t.includes('qr')) return 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10';
    if (t.includes('ai') || t.includes('review')) return 'border-amber-500/30 text-amber-400 bg-amber-500/10';
    if (t.includes('subscript')) return 'border-purple-500/30 text-purple-400 bg-purple-500/10';
    if (t.includes('error')) return 'border-rose-500/30 text-rose-400 bg-rose-500/10';
    return 'border-slate-700 text-slate-400 bg-slate-800/40';
  };

  const filtered = activities.filter((item) => {
    const matchesFilter = filterType === 'all' || item.type.toLowerCase().includes(filterType.toLowerCase());
    const matchesSearch =
      !searchTerm ||
      item.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.business_name && item.business_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.user_email && item.user_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.user_name && item.user_name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 text-xs">
              Audit & Activity
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="h-8 w-8 text-indigo-400" />
            Platform Activity Feed
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Chronological audit log of business registrations, QR actions, AI generations, and privileged admin events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchActivity}
            disabled={loading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Feed
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search activity, business, actor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-500 h-9"
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {[
            { label: 'All Events', value: 'all' },
            { label: 'Business', value: 'business' },
            { label: 'QR', value: 'qr' },
            { label: 'Reviews / AI', value: 'review' },
            { label: 'Subscriptions', value: 'subscript' },
          ].map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filterType === f.value ? 'default' : 'outline'}
              onClick={() => setFilterType(f.value)}
              className={
                filterType === f.value
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800 h-8 text-xs'
              }
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Activity Timeline List */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base text-white">Event Log ({filtered.length})</CardTitle>
          <CardDescription className="text-slate-400">
            Immutable system logs recorded from platform services and admin control actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No matching activity events found.
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {filtered.map((item) => (
                <div key={item.id} className="relative group">
                  {/* Dot on timeline */}
                  <div className="absolute -left-6 top-1 flex items-center justify-center h-4 w-4 rounded-full bg-slate-900 border-2 border-indigo-500/80 group-hover:scale-110 transition-transform" />

                  <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-slate-900 border border-slate-800">
                          {getEventIcon(item.type)}
                        </div>
                        <Badge variant="outline" className={`text-[11px] font-mono ${getBadgeVariant(item.type)}`}>
                          {item.type}
                        </Badge>
                        {item.status && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize">
                            {item.status}
                          </span>
                        )}
                      </div>

                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(item.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-slate-200 mt-2.5">
                      {item.details}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-900 text-xs text-slate-400">
                      {item.business_name && (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-slate-300 font-medium">{item.business_name}</span>
                        </div>
                      )}
                      {item.user_name && (
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500">Actor:</span>
                          <span className="text-slate-300">{item.user_name}</span>
                          {item.user_email && <span className="text-slate-500">({item.user_email})</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
