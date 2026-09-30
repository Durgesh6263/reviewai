'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Zap,
  Clock,
  AlertTriangle,
  Building2,
  Tag,
  Calendar,
  Cpu,
  RefreshCw,
  Loader2,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';

interface BusinessGen {
  id: string;
  name: string;
  category: string;
  generations: number;
  avg_rating: number;
}

interface CategoryGen {
  category: string;
  count: number;
}

interface DateGen {
  date: string;
  count: number;
}

interface ModelGen {
  model: string;
  count: number;
}

interface AIUsageData {
  total_generations: number;
  regeneration_count: number;
  avg_response_time_ms: number;
  failed_requests: number;
  by_business: BusinessGen[];
  by_category: CategoryGen[];
  by_date: DateGen[];
  model_distribution: ModelGen[];
  notice: string;
}

export default function AdminAIUsagePage() {
  const [range, setRange] = useState<string>('30d');
  const [data, setData] = useState<AIUsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAIUsage = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: AIUsageData }>(`/admin/ai-usage?range=${range}`);
      if (res?.data) {
        setData(res.data);
      }
    } catch (e) {
      console.error('Failed to load AI usage metrics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAIUsage();
  }, [range]);

  const maxCategoryCount = Math.max(...(data?.by_category.map((c) => c.count) || [1]), 1);

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-xs">
              AI Operations
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-amber-400" />
            AI Review Generation Analytics
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time telemetry and throughput across Anthropic / Claude AI generation engines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {['7d', '30d', '90d'].map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? 'default' : 'outline'}
              onClick={() => setRange(r)}
              className={
                range === r
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
              }
            >
              {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchAIUsage}
            disabled={loading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <>
          {/* Top AI KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Generations */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Total AI Generations</CardTitle>
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Zap className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(data?.total_generations || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Customer reviews drafted</p>
              </CardContent>
            </Card>

            {/* Regeneration Count */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Regenerations</CardTitle>
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <RefreshCw className="h-4 w-4 text-indigo-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{formatNumber(data?.regeneration_count || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Re-rolls requested by customer</p>
              </CardContent>
            </Card>

            {/* Avg Response Time */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Average Response Time</CardTitle>
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Clock className="h-4 w-4 text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {data?.avg_response_time_ms ? `${(data.avg_response_time_ms / 1000).toFixed(2)}s` : 'Data unavailable'}
                </div>
                <p className="text-xs text-slate-500 mt-1">Latency per generation</p>
              </CardContent>
            </Card>

            {/* Failed AI Requests */}
            <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Failed Requests</CardTitle>
                <div className="p-2 bg-rose-500/10 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{data?.failed_requests || 0}</div>
                <p className="text-xs text-emerald-400 mt-1">100% operational uptime</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Generations by Category */}
            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Tag className="h-5 w-5 text-amber-400" />
                  Generations by Category
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Distribution of AI generation across business categories
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(!data?.by_category || data.by_category.length === 0) ? (
                  <p className="text-slate-500 text-sm py-4">No category data recorded yet.</p>
                ) : (
                  data.by_category.map((cat) => (
                    <div key={cat.category} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-300">{cat.category}</span>
                        <span className="text-slate-400 font-semibold">{cat.count} drafts</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, (cat.count / maxCategoryCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* AI Models & Engine Distribution */}
            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-indigo-400" />
                  Model Engine Usage
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Active models delivering customer reviews
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(!data?.model_distribution || data.model_distribution.length === 0) ? (
                  <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300 font-medium">Claude 3.5 Sonnet</span>
                      <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30">Primary Engine</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Default high-conversion natural language model</p>
                  </div>
                ) : (
                  data.model_distribution.map((m) => (
                    <div key={m.model} className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-300">{m.model}</span>
                      <span className="text-xs text-slate-400 font-mono">{m.count} calls</span>
                    </div>
                  ))
                )}

                {/* Security Note */}
                <div className="p-3 mt-4 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span>
                    Anthropic API secret keys and service tokens are securely protected on the server.
                    They are never exposed to the frontend or browser network payloads.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Businesses Utilizing AI */}
          <Card className="bg-slate-900/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-400" />
                AI Generation by Business
              </CardTitle>
              <CardDescription className="text-slate-400">
                Top businesses with the highest volume of AI-assisted customer drafts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(!data?.by_business || data.by_business.length === 0) ? (
                <p className="text-slate-500 text-sm py-4">No business generation data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950/50 text-slate-300 text-xs uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Business</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">AI Generations</th>
                        <th className="py-3 px-4">Avg Rating</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {data.by_business.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-white">{b.name}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="border-slate-700 text-slate-300 text-xs capitalize">
                              {b.category}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-white font-semibold">{b.generations}</td>
                          <td className="py-3 px-4 text-amber-400 font-medium">{b.avg_rating} ★</td>
                          <td className="py-3 px-4 text-right">
                            <Link href={`/admin/clients/${b.id}`}>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-400 hover:text-white">
                                View <ArrowUpRight className="h-3 w-3 ml-1" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
