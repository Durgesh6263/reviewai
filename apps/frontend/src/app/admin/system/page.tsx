'use client';

import { useState, useEffect } from 'react';
import { Loader2, Database, Server, HardDrive, Cpu, MemoryStick, Network, Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw, TrendingUp, Download, Upload, Users, Building2, QrCode, Star, DollarSign, Settings, Shield, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { formatNumber, formatBytes, formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    storage: HealthCheck;
    api: HealthCheck;
    queue: HealthCheck;
  };
  metrics: {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    network_in: number;
    network_out: number;
    active_connections: number;
    requests_per_minute: number;
    avg_response_time: number;
    error_rate: number;
  };
  uptime: number;
  version: string;
  environment: string;
}

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'critical';
  latency_ms: number;
  message: string;
  last_checked: string;
}

interface SystemStats {
  total_users: number;
  total_businesses: number;
  total_qr_codes: number;
  total_scans: number;
  total_reviews: number;
  total_revenue: number;
  database_size: number;
  storage_used: number;
  api_calls_24h: number;
  emails_sent_24h: number;
  qr_generated_24h: number;
}

interface BackgroundJob {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export default function AdminSystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [activeTab, setActiveTab] = useState<'health' | 'metrics' | 'jobs' | 'info'>('health');

  const fetchHealth = async () => {
    try {
      setIsChecking(true);
      const response = await api.get<{ data: SystemHealth }>('/admin/system/health');
      setHealth(response.data);
    } catch (error) {
      console.error('Failed to load health', error);
    } finally {
      setIsChecking(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get<{ data: SystemStats }>('/admin/system/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await api.get<{ data: BackgroundJob[] }>('/admin/system/jobs');
      setJobs(response.data);
    } catch (error) {
      console.error('Failed to load jobs', error);
    }
  };

  const runHealthCheck = async () => {
    await fetchHealth();
    toast.success('Health check completed');
  };

  useEffect(() => {
    fetchHealth();
    fetchStats();
    fetchJobs();
    setIsLoading(false);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
      healthy: 'success',
      degraded: 'warning',
      critical: 'destructive',
    };
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getJobStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
      pending: 'outline',
      running: 'default',
      completed: 'success',
      failed: 'destructive',
    };
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const checkItems = [
    { key: 'database', label: 'Database', icon: Database, description: 'PostgreSQL connection and queries' },
    { key: 'redis', label: 'Redis Cache', icon: Server, description: 'Cache and session storage' },
    { key: 'storage', label: 'File Storage', icon: HardDrive, description: 'Object storage for QR codes and assets' },
    { key: 'api', label: 'API Endpoints', icon: Zap, description: 'REST API health and latency' },
    { key: 'queue', label: 'Job Queue', icon: Activity, description: 'Background job processing' },
  ] as const;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">System Health</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Monitor system status, performance, and infrastructure</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4 mb-4" />
                <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">System Health</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Monitor system status, performance, and infrastructure</p>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <>
              {getStatusIcon(health.status)}
              <span className="font-medium text-secondary-900 dark:text-white">
                System: {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
              </span>
            </>
          )}
          <Button onClick={runHealthCheck} disabled={isChecking}>
            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'health' | 'metrics' | 'jobs' | 'info')} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="health">
            <Activity className="h-4 w-4 mr-2" /> Health Checks
          </TabsTrigger>
          <TabsTrigger value="metrics">
            <TrendingUp className="h-4 w-4 mr-2" /> Metrics
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <Server className="h-4 w-4 mr-2" /> Background Jobs
          </TabsTrigger>
          <TabsTrigger value="info">
            <Settings className="h-4 w-4 mr-2" /> System Info
          </TabsTrigger>
        </TabsList>

        {/* Health Checks Tab */}
        <TabsContent value="health" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {health && checkItems.map((item) => {
              const check = health.checks[item.key as keyof typeof health.checks];
              return (
                <Card key={item.key} className={cn('border-l-4', check.status === 'healthy' && 'border-green-500', check.status === 'degraded' && 'border-yellow-500', check.status === 'critical' && 'border-red-500')}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', check.status === 'healthy' && 'bg-green-100 dark:bg-green-900/30', check.status === 'degraded' && 'bg-yellow-100 dark:bg-yellow-900/30', check.status === 'critical' && 'bg-red-100 dark:bg-red-900/30')}>
                          <item.icon className={cn('h-5 w-5', check.status === 'healthy' && 'text-green-600', check.status === 'degraded' && 'text-yellow-600', check.status === 'critical' && 'text-red-600')} />
                        </div>
                        <div>
                          <h3 className="font-medium text-secondary-900 dark:text-white">{item.label}</h3>
                          <p className="text-sm text-secondary-500 dark:text-secondary-400">{item.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(check.status)}
                        {getStatusIcon(check.status)}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-secondary-500">Latency</span>
                        <span className="font-mono text-secondary-900 dark:text-white">{check.latency_ms}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary-500">Last Checked</span>
                        <span className="font-mono text-secondary-900 dark:text-white">{new Date(check.last_checked).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-secondary-600 dark:text-secondary-400 text-xs">{check.message}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* System Resources */}
          {health && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-primary-500" />
                  System Resources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary-600 dark:text-secondary-400">CPU Usage</span>
                      <span className="font-medium text-secondary-900 dark:text-white">{health.metrics.cpu_usage.toFixed(1)}%</span>
                    </div>
                    <Progress value={health.metrics.cpu_usage} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary-600 dark:text-secondary-400">Memory Usage</span>
                      <span className="font-medium text-secondary-900 dark:text-white">{health.metrics.memory_usage.toFixed(1)}%</span>
                    </div>
                    <Progress value={health.metrics.memory_usage} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary-600 dark:text-secondary-400">Disk Usage</span>
                      <span className="font-medium text-secondary-900 dark:text-white">{health.metrics.disk_usage.toFixed(1)}%</span>
                    </div>
                    <Progress value={health.metrics.disk_usage} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary-600 dark:text-secondary-400">Active Connections</span>
                      <span className="font-medium text-secondary-900 dark:text-white">{formatNumber(health.metrics.active_connections)}</span>
                    </div>
                    <Progress value={Math.min(health.metrics.active_connections / 1000 * 100, 100)} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary-600 dark:text-secondary-400">Error Rate</span>
                      <span className="font-medium text-secondary-900 dark:text-white">{health.metrics.error_rate.toFixed(2)}%</span>
                    </div>
                    <Progress value={Math.min(health.metrics.error_rate * 100, 100)} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-6">
          {health && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Requests/min</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(health.metrics.requests_per_minute)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                      <Activity className="h-6 w-6 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Avg Response Time</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{health.metrics.avg_response_time.toFixed(0)}ms</span>
                    </div>
                    <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20">
                      <TrendingUp className="h-6 w-6 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Network In</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatBytes(health.metrics.network_in)}/s</span>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20">
                      <Download className="h-6 w-6 text-purple-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Network Out</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatBytes(health.metrics.network_out)}/s</span>
                    </div>
                    <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20">
                      <Upload className="h-6 w-6 text-orange-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Total Users</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.total_users)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                      <Users className="h-6 w-6 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Total Businesses</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.total_businesses)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20">
                      <Building2 className="h-6 w-6 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">QR Codes</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.total_qr_codes)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20">
                      <QrCode className="h-6 w-6 text-purple-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Reviews Generated</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.total_reviews)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20">
                      <Star className="h-6 w-6 text-yellow-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Total Scans</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.total_scans)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
                      <Activity className="h-6 w-6 text-indigo-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Revenue</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">${formatNumber(stats.total_revenue)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                      <DollarSign className="h-6 w-6 text-emerald-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">DB Size</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatBytes(stats.database_size)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-pink-50 dark:bg-pink-900/20">
                      <Database className="h-6 w-6 text-pink-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary-600 dark:text-secondary-400">Storage Used</p>
                      <span className="text-3xl font-bold text-secondary-900 dark:text-white">{formatBytes(stats.storage_used)}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/20">
                      <HardDrive className="h-6 w-6 text-slate-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {stats && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary-500" />
                  24-Hour Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                    <p className="text-sm text-secondary-600 dark:text-secondary-400">API Calls</p>
                    <p className="text-2xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.api_calls_24h)}</p>
                  </div>
                  <div className="p-4 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                    <p className="text-sm text-secondary-600 dark:text-secondary-400">Emails Sent</p>
                    <p className="text-2xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.emails_sent_24h)}</p>
                  </div>
                  <div className="p-4 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                    <p className="text-sm text-secondary-600 dark:text-secondary-400">QR Codes Generated</p>
                    <p className="text-2xl font-bold text-secondary-900 dark:text-white">{formatNumber(stats.qr_generated_24h)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Background Jobs Tab */}
        <TabsContent value="jobs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary-500" />
                Background Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <p className="text-center text-secondary-500 py-8">No background jobs found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary-50 dark:bg-secondary-800/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Job</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Progress</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Started</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Completed</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-secondary-500 dark:text-secondary-400 uppercase tracking-wider">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                          <td className="px-4 py-4 font-medium text-secondary-900 dark:text-white">{job.name}</td>
                          <td className="px-4 py-4">{getJobStatusBadge(job.status)}</td>
                          <td className="px-4 py-4">
                            <div className="w-32">
                              <Progress value={job.progress} className="h-2" />
                              <p className="text-xs text-secondary-500 mt-1">{job.progress}%</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-secondary-500 dark:text-secondary-400">
                            {job.started_at ? new Date(job.started_at).toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-4 text-sm text-secondary-500 dark:text-secondary-400">
                            {job.completed_at ? new Date(job.completed_at).toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-4 text-sm text-secondary-500 dark:text-secondary-400 max-w-xs truncate">
                            {job.error || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Info Tab */}
        <TabsContent value="info" className="space-y-6">
          {health && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary-500" />
                    Application Info
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-4">
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Application</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">ReviewAI</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Version</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white font-mono">{health.version}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Environment</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">{health.environment}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Uptime</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white font-mono">{formatDuration(health.uptime)}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Status</dt>
                      <dd className="flex items-center gap-2">
                        {getStatusBadge(health.status)}
                        {getStatusIcon(health.status)}
                      </dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt className="text-secondary-600 dark:text-secondary-400">Node.js</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">{process.version}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary-500" />
                    Database Info
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-4">
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Database</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">PostgreSQL (Supabase)</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Size</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">{stats ? formatBytes(stats.database_size) : '—'}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Connection Pool</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">PgBouncer (Supabase)</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Extensions</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">pgvector, pg_cron, pg_partman</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Replication</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">Managed by Supabase</dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt className="text-secondary-600 dark:text-secondary-400">Backups</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">Daily automated (Point-in-time recovery)</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary-500" />
                    Infrastructure
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-4">
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Hosting</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">Vercel (Frontend) / Railway (Backend)</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">CDN</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">Vercel Edge Network</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Cache</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">Redis (Upstash)</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Queue</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">Redis + BullMQ</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border">
                      <dt className="text-secondary-600 dark:text-secondary-400">Monitoring</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">Sentry / Custom health endpoints</dd>
                    </div>
                    <div className="flex justify-between py-2">
                      <dt className="text-secondary-600 dark:text-secondary-400">Logs</dt>
                      <dd className="font-medium text-secondary-900 dark:text-white">Structured JSON (Pino) → Loki</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary-500" />
                    Feature Flags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { name: 'AI Review Generation', enabled: true, description: 'OpenAI/Gemini powered review suggestions' },
                      { name: 'QR Code Customization', enabled: true, description: 'Colors, logos, frames, shapes' },
                      { name: 'Multi-language Support', enabled: true, description: '20+ languages supported' },
                      { name: 'Webhook Notifications', enabled: true, description: 'Real-time event notifications' },
                      { name: 'White-label Domains', enabled: false, description: 'Custom domains for Enterprise plans' },
                      { name: 'API Access', enabled: false, description: 'Public API for Enterprise plans' },
                      { name: 'Advanced Analytics', enabled: true, description: 'Cohort analysis, funnel reports' },
                      { name: 'Team Collaboration', enabled: true, description: 'Role-based team management' },
                    ].map((feature) => (
                      <div key={feature.name} className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-3 h-3 rounded-full', feature.enabled ? 'bg-green-500' : 'bg-secondary-300 dark:bg-secondary-600')} />
                          <div>
                            <p className="font-medium text-secondary-900 dark:text-white">{feature.name}</p>
                            <p className="text-sm text-secondary-500 dark:text-secondary-400">{feature.description}</p>
                          </div>
                        </div>
                        <Badge variant={feature.enabled ? 'success' : 'secondary'}>
                          {feature.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}