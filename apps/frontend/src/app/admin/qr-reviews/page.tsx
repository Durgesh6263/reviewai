'use client';

import { useState, useEffect } from 'react';
import {
  QrCode,
  ArrowDown,
  Sparkles,
  ExternalLink,
  Edit3,
  Copy,
  Star,
  Tag,
  Users,
  RefreshCw,
  Loader2,
  Info,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';

interface FunnelStep {
  step: number;
  name: string;
  description: string;
  count: number;
  is_external: boolean;
  conversion_from_previous: number;
  conversion_from_start: number;
}

interface FunnelData {
  funnel: FunnelStep[];
  overall_conversion_rate: number;
  note: string;
}

export default function AdminQRReviewsFunnelPage() {
  const [range, setRange] = useState<string>('30d');
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFunnelData = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: FunnelData }>(`/admin/funnel?range=${range}`);
      if (res?.data) {
        setData(res.data);
      }
    } catch (e) {
      console.error('Failed to load funnel metrics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFunnelData();
  }, [range]);

  const getStepIcon = (step: number) => {
    switch (step) {
      case 1:
        return <QrCode className="h-5 w-5 text-blue-400" />;
      case 2:
        return <Users className="h-5 w-5 text-purple-400" />;
      case 3:
        return <Star className="h-5 w-5 text-amber-400" />;
      case 4:
        return <Tag className="h-5 w-5 text-emerald-400" />;
      case 5:
        return <Sparkles className="h-5 w-5 text-indigo-400" />;
      case 6:
        return <Edit3 className="h-5 w-5 text-pink-400" />;
      case 7:
        return <Copy className="h-5 w-5 text-cyan-400" />;
      case 8:
        return <ExternalLink className="h-5 w-5 text-rose-400" />;
      default:
        return <CheckCircle2 className="h-5 w-5 text-indigo-400" />;
    }
  };

  const baseCount = data?.funnel?.[0]?.count || 1;

  return (
    <div className="space-y-8 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10 text-xs">
              Conversion Architecture
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <QrCode className="h-8 w-8 text-cyan-400" />
            Customer Review Conversion Funnel
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            8-stage end-to-end customer journey from physical QR scan to external Google Review completion.
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
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
              }
            >
              {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchFunnelData}
            disabled={loading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
        </div>
      ) : (
        <>
          {/* Conversion Highlight Header Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-slate-400">Total Scans In Period</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{formatNumber(data?.funnel?.[0]?.count || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Top of the funnel entry</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-slate-400">Google Continue Clicks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-rose-400">{formatNumber(data?.funnel?.[7]?.count || 0)}</div>
                <p className="text-xs text-slate-500 mt-1">Reached external Google page</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-slate-400">Overall Conversion Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-cyan-400">{data?.overall_conversion_rate || 0}%</div>
                <p className="text-xs text-slate-500 mt-1">Scans converted to Google URL click</p>
              </CardContent>
            </Card>
          </div>

          {/* Interactive 8-Stage Funnel Flow */}
          <div className="space-y-3">
            {data?.funnel.map((step, index) => {
              const widthPct = Math.max(8, Math.min(100, (step.count / baseCount) * 100));

              return (
                <div key={step.step} className="group relative">
                  <div
                    className={`p-4 rounded-xl border transition-all duration-200 ${
                      step.is_external
                        ? 'bg-rose-950/20 border-rose-800/40 hover:border-rose-700/60'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Step Name & Description */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-slate-950 border border-slate-800">
                          {getStepIcon(step.step)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold text-slate-500">
                              STEP {step.step}
                            </span>
                            <h3 className="text-base font-semibold text-white">{step.name}</h3>
                            {step.is_external && (
                              <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[10px]">
                                External (Google)
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
                        </div>
                      </div>

                      {/* Numbers & Conversion Rate */}
                      <div className="flex items-center gap-6 self-end sm:self-center">
                        <div className="text-right">
                          <div className="text-xl font-bold text-white">{formatNumber(step.count)}</div>
                          <div className="text-[11px] text-slate-400">
                            {index === 0 ? 'Base Volume' : `${step.conversion_from_previous}% of prev`}
                          </div>
                        </div>

                        <div className="w-16 text-right">
                          <span className="text-xs font-mono font-bold text-cyan-400">
                            {step.conversion_from_start}%
                          </span>
                          <div className="text-[10px] text-slate-500">overall</div>
                        </div>
                      </div>
                    </div>

                    {/* Funnel Visual Width Bar */}
                    <div className="mt-3 w-full bg-slate-950/80 rounded-full h-2 overflow-hidden border border-slate-800/50">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          step.is_external ? 'bg-gradient-to-r from-rose-500 to-pink-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Down arrow connector between steps */}
                  {index < data.funnel.length - 1 && (
                    <div className="flex justify-center my-1 text-slate-600">
                      <ArrowDown className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Clarity & Data Integrity Notice */}
          <Card className="bg-slate-950 border border-slate-800">
            <CardContent className="p-4 flex items-start gap-3 text-xs text-slate-400">
              <Info className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-slate-300 mb-1">Data Tracking Integrity Notice</p>
                <p>
                  Steps 1 through 7 are tracked directly within the ReviewAI platform infrastructure with exact timestamps.
                  Step 8 records customer intent when they click "Continue to Google Review" to open the external Google Place review URL.
                  ReviewAI never fabricates or claims that a Google review was completed without actual verification.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
