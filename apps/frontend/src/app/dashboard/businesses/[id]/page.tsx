'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Edit,
  ExternalLink,
  QrCode,
  Globe,
  Phone,
  MapPin,
  Calendar,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  Trash2,
  Plus,
  Download,
  AlertCircle,
  Clock,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { formatDate, formatNumber } from '@/lib/utils';
import { getCategoryById, getDefaultTagsForCategory } from '@/lib/categories';

interface Business {
  id: string;
  name: string;
  category?: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  google_review_url: string;
  google_place_id?: string;
  website_url?: string | null;
  phone?: string | null;
  tags?: string[];
  settings?: Record<string, any>;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
  } | string | null;
  timezone?: string;
  status: 'active' | 'suspended' | 'pending_verification';
  created_at: string;
  updated_at: string;
}

interface BusinessStats {
  total_scans: number;
  total_sessions: number;
  total_generated: number;
  total_redirects: number;
  conversion_rate: number;
  qr_codes_count: number;
}

interface QRCodeItem {
  id: string;
  name: string;
  slug: string;
  design: {
    primary_color: string;
  };
  is_active: boolean;
  scan_count: number;
  created_at: string;
}

export default function BusinessDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [business, setBusiness] = useState<Business | null>(null);
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [qrCodes, setQrCodes] = useState<QRCodeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchBusinessData = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const [bizRes, statsRes, qrRes] = await Promise.allSettled([
        api.get<any>(`/businesses/${id}`),
        api.get<any>(`/businesses/${id}/stats`),
        api.get<any>(`/qr-codes?business_id=${id}`),
      ]);

      if (bizRes.status === 'fulfilled') {
        const b = bizRes.value?.data?.business || bizRes.value?.business || bizRes.value?.data || bizRes.value;
        setBusiness(b);
      } else {
        toast.error('Failed to load business details');
        router.push('/dashboard/businesses');
        return;
      }

      if (statsRes.status === 'fulfilled') {
        const s = statsRes.value?.data?.business || statsRes.value?.data || statsRes.value;
        setStats(s);
      }

      if (qrRes.status === 'fulfilled') {
        const qList = Array.isArray(qrRes.value?.data)
          ? qrRes.value.data
          : Array.isArray(qrRes.value)
          ? qrRes.value
          : [];
        setQrCodes(qList);
      }
    } catch (err: any) {
      toast.error('An error occurred loading business data');
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchBusinessData();
  }, [fetchBusinessData]);

  const handleCopyGoogleUrl = async () => {
    if (!business?.google_review_url) return;
    try {
      await navigator.clipboard.writeText(business.google_review_url);
      setCopiedUrl(true);
      toast.success('Google Review URL copied!');
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const handleDelete = async () => {
    if (!business) return;
    if (!confirm(`Are you sure you want to delete "${business.name}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      await api.delete(`/businesses/${business.id}`);
      toast.success('Business deleted successfully');
      router.push('/dashboard/businesses');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete business');
      setDeleting(false);
    }
  };

  const formatAddress = (address: any) => {
    if (!address) return null;
    if (typeof address === 'string') return address;
    const parts = [
      address.street,
      address.city,
      address.state,
      address.postal_code,
      address.country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!business) return null;

  const addressText = formatAddress(business.address);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/businesses">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">{business.name}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  business.status === 'active'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}
              >
                {business.status === 'active' ? 'Active' : business.status}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
                {getCategoryById(business.category || business.settings?.category)?.name || 'General Business'}
              </span>
            </div>
            <p className="text-sm text-secondary-500 dark:text-secondary-400">
              Slug: <span className="font-mono">{business.slug}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/dashboard/businesses/${business.id}/edit`}>
            <Button variant="outline" className="gap-2">
              <Edit className="h-4 w-4" /> Edit Business
            </Button>
          </Link>
          <Link href={`/dashboard/qr-codes/new`}>
            <Button className="gap-2 bg-primary-600 hover:bg-primary-700">
              <Plus className="h-4 w-4" /> New QR Code
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={handleDelete} disabled={deleting} className="text-error-600 hover:text-error-700 hover:bg-error-50">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Total Scans</p>
            <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">
              {formatNumber(stats?.total_scans || 0)}
            </h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Reviews Generated</p>
            <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">
              {formatNumber(stats?.total_generated || 0)}
            </h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Google Redirects</p>
            <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">
              {formatNumber(stats?.total_redirects || 0)}
            </h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Conversion Rate</p>
            <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">
              {(stats?.conversion_rate || 0).toFixed(1)}%
            </h3>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Business Profile Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Google Review URL Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary-500" /> Google Review Connection
              </CardTitle>
              <CardDescription>
                Where customers are redirected after leaving positive feedback
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Input value={business.google_review_url || ''} readOnly className="font-mono text-xs bg-secondary-50 dark:bg-secondary-800" />
                <Button variant="outline" size="icon" onClick={handleCopyGoogleUrl} title="Copy Review URL">
                  {copiedUrl ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
                {business.google_review_url && (
                  <a
                    href={business.google_review_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-background hover:bg-secondary-100 h-10 w-10 shrink-0"
                    title="Open Google Review Link"
                  >
                    <ExternalLink className="h-4 w-4 text-secondary-600" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary-500" /> Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {business.description && (
                <div>
                  <span className="text-xs font-medium text-secondary-500 dark:text-secondary-400 block mb-1">
                    Description
                  </span>
                  <p className="text-secondary-800 dark:text-secondary-200">{business.description}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                {business.website_url && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-secondary-400" />
                    <a
                      href={business.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 dark:text-primary-400 hover:underline truncate"
                    >
                      {business.website_url}
                    </a>
                  </div>
                )}
                {business.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-secondary-400" />
                    <span className="text-secondary-800 dark:text-secondary-200">{business.phone}</span>
                  </div>
                )}
                {addressText && (
                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="h-4 w-4 text-secondary-400 mt-0.5 shrink-0" />
                    <span className="text-secondary-800 dark:text-secondary-200">{addressText}</span>
                  </div>
                )}
                <div className="flex items-start gap-2 sm:col-span-2 pt-2 border-t border-border">
                  <Tag className="h-4 w-4 text-primary-500 mt-1 shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs text-secondary-500 font-medium block">Category Experience Tags</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {((business.tags && business.tags.length > 0)
                        ? business.tags
                        : (business.settings?.custom_tags && business.settings.custom_tags.length > 0)
                        ? business.settings.custom_tags
                        : (business.settings?.tags && business.settings.tags.length > 0)
                        ? business.settings.tags
                        : getDefaultTagsForCategory(business.category || business.settings?.category)
                      ).map((tag: string) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-md bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300 border border-secondary-200 dark:border-secondary-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border text-xs text-secondary-500 dark:text-secondary-400">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Created {formatDate(business.created_at)}</span>
                </div>
                {business.timezone && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Timezone: {business.timezone}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: QR Codes */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary-500" /> QR Codes
                </CardTitle>
                <CardDescription>Review collection points</CardDescription>
              </div>
              <Link href="/dashboard/qr-codes/new">
                <Button size="sm" variant="outline" className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {qrCodes.length === 0 ? (
                <div className="text-center py-6 text-secondary-500">
                  <QrCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No QR codes yet</p>
                  <Link href="/dashboard/qr-codes/new">
                    <Button size="sm" className="mt-3 text-xs">Create First QR</Button>
                  </Link>
                </div>
              ) : (
                qrCodes.map((qr) => (
                  <div
                    key={qr.id}
                    className="p-3 border border-border rounded-lg flex items-center justify-between hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded border flex items-center justify-center bg-white"
                        style={{ borderColor: qr.design?.primary_color || '#2563EB' }}
                      >
                        <QrCode className="h-5 w-5" style={{ color: qr.design?.primary_color || '#2563EB' }} />
                      </div>
                      <div>
                        <Link href={`/dashboard/qr-codes/${qr.id}`} className="font-medium text-sm text-secondary-900 dark:text-white hover:underline block">
                          {qr.name}
                        </Link>
                        <p className="text-xs text-secondary-500 font-mono">/r/{qr.slug}</p>
                      </div>
                    </div>
                    <Link href={`/dashboard/qr-codes/${qr.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
