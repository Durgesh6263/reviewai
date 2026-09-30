'use client';

import { useState, useEffect } from 'react';
import {
  BarChart2,
  Calendar,
  QrCode,
  Users,
  Sparkles,
  Edit3,
  Copy,
  ExternalLink,
  MessageSquareWarning,
  Building2,
  Loader2,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';

interface UsageSummary {
  total_scans: number;
  review_sessions: number;
  ai_drafts: number;
  edited_reviews: number;
  copy_events: number;
  google_continue_events: number;
  private_feedback: number;
  active_businesses: number;
  period: string;
}

interface DailyTimeSeries {
  date: string;
  scans: number;
  sessions: number;
  ai_drafts: number;
  google_continues: number;
}

export default function AdminUsagePage() {
  const [range, setRange] = useState<string>('30d');
  const [customStart, setCustomStart] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [timeSeries, setTimeSeries] = useState<DailyTimeSeries[]>([]);

  const fetchUsageData = async () => {
    try {
      setLoading(true);
      let queryUrl = `/admin/usage?range=${range}`;
      if (range === 'custom' && customStart) {
        queryUrl += `&start_date=${encodeURIComponent(customStart)}`;
      }
      const res = await api.get<{ data: { summary: UsageSummary; time_series: DailyTimeSeries[] } }>(queryUrl);
      if (res?.data) {
        setSummary(res.data.summary);
        setTimeSeries(res.data.time_series || []);
      }
    } catch (e) {
      console.error('Failed to load platform usage:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageData();
  }, [range]);

  const maxScans = Math.max(...timeSeries.map((d) => d.scans), 1);

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 text-xs">
              Platform Analytics
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart2 className="h-8 w-8 text-indigo-400" />
            Feature Usage Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Platform-wide activity tracking across QR scans, review flows, AI generations, and conversion events.
          </p>
        </div>

        {/* Time filters */}
        <div className="flex flex-wrap items-center gap-2">
          {['today', '7d', '30d', '90d'].map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? 'default' : 'outline'}
              onClick={() => setRange(r)}
              className={
                range === r
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
              }
            >
              {r === 'today' ? 'Today' : r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchUsageData}
            disabled={loading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          {/* 8 Feature Usage Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total QR Scans */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Total QR Scans</CardTitle>
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <QrCode className="h-4 w-4 text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.total_scans || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Physical QR engagement</p>
              </CardContent>
            </Card>

            {/* Review Sessions */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Review Sessions</CardTitle>
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.review_sessions || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Flow initiated by visitors</p>
              </CardContent>
            </Card>

            {/* AI Generations */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">AI Drafts Generated</CardTitle>
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.ai_drafts || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Authentic drafts composed</p>
              </CardContent>
            </Card>

            {/* Edited Reviews */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Edited Reviews</CardTitle>
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Edit3 className="h-4 w-4 text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.edited_reviews || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Drafts modified by customer</p>
              </CardContent>
            </Card>

            {/* Copy Events */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Review Copy Events</CardTitle>
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <Copy className="h-4 w-4 text-indigo-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.copy_events || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Copied to clipboard</p>
              </CardContent>
            </Card>

            {/* Google Continue Events */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Google Continue Clicks</CardTitle>
                <div className="p-2 bg-rose-500/10 rounded-lg">
                  <ExternalLink className="h-4 w-4 text-rose-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.google_continue_events || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Direct to Google Review URL</p>
              </CardContent>
            </Card>

            {/* Private Feedback */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Private Feedback</CardTitle>
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <MessageSquareWarning className="h-4 w-4 text-orange-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.private_feedback || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Prevented public negative reviews</p>
              </CardContent>
            </Card>

            {/* Active Businesses */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Active Businesses</CardTitle>
                <div className="p-2 bg-teal-500/10 rounded-lg">
                  <Building2 className="h-4 w-4 text-teal-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(summary?.active_businesses || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Businesses with activity in period</p>
              </CardContent>
            </Card>
          </div>

          {/* Activity Over Time Chart */}
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center justify-between">
                <span>Daily Activity Breakdown</span>
                <span className="text-xs font-normal text-slate-400">Scans vs Sessions vs AI vs Google</span>
              </CardTitle>
              <CardDescription className="text-slate-400">
                Daily volume of customer touchpoints across the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timeSeries.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No recorded usage events within this selected time window.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {timeSeries.slice(-9).map((d) => (
                      <div key={d.date} className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-2">
                        <div className="flex justify-between items-center text-xs font-medium text-slate-400">
                          <span>{d.date}</span>
                          <span className="text-indigo-400 font-semibold">{d.scans} scans</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (d.scans / maxScans) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                          <span>Sessions: {d.sessions}</span>
                          <span>AI: {d.ai_drafts}</span>
                          <span>Google: {d.google_continues}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
