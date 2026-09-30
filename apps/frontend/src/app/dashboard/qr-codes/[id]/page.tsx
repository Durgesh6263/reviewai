'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, Edit, Download, Copy, ExternalLink, QrCode, Check, BarChart2, Eye, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { formatDate, formatNumber } from '@/lib/utils';
import { getQRCodeReviewUrl, generateQRCodeImageUrl } from '@/lib/public-url';
import { copyTextToClipboard } from '@/lib/clipboard';

export default function QRCodeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [qr, setQr] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    api.get<any>(`/qr-codes/${id}`)
      .then((res: any) => {
        const item = res?.data || res;
        setQr(item);
      })
      .catch(() => {
        toast.error('Failed to load QR code');
        router.push('/dashboard/qr-codes');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [id, router]);

  const previewUrl = typeof window !== 'undefined' && qr?.slug
    ? getQRCodeReviewUrl(qr.slug)
    : '';

  const handleCopyUrl = async () => {
    if (!previewUrl) return;
    const res = await copyTextToClipboard(previewUrl);
    if (res.success) {
      setCopied(true);
      toast.success('Target URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast(res.message);
    }
  };

  const handleDownload = async () => {
    if (!qr) return;
    try {
      const color = qr.design?.primary_color || '#2563EB';
      const downloadUrl = generateQRCodeImageUrl(previewUrl, {
        color,
        size: 600,
        quietZone: 4,
        ecc: 'M',
      });

      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${qr.name || 'qr-code'}.png`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('High-resolution QR code downloaded!');
    } catch {
      toast.error('Failed to download QR code');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!qr) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/qr-codes">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">{qr.name}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                qr.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {qr.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-secondary-600 dark:text-secondary-400">
              Assigned to <span className="font-semibold text-secondary-800 dark:text-secondary-200">{qr.business_name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/dashboard/qr-codes/${qr.id}/edit`}>
            <Button variant="outline" className="gap-2">
              <Edit className="h-4 w-4" /> Edit Design
            </Button>
          </Link>
          <Button onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" /> Download PNG
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* QR Code Preview Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary-500" /> QR Code Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 flex flex-col items-center">
            <div className="aspect-square w-full max-w-[240px] bg-white rounded-xl p-4 border border-border shadow-sm flex items-center justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
                  previewUrl
                )}&color=${encodeURIComponent(((qr.design?.primary_color || '#2563EB') as string).replace('#', ''))}&bgcolor=FFFFFF`}
                alt={qr.name}
                className="w-full h-full object-contain"
              />
            </div>
            {qr.design?.frame_text && (
              <p className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                "{qr.design.frame_text}"
              </p>
            )}

            <div className="w-full space-y-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={handleCopyUrl} className="w-full gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy URL'}
              </Button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg font-medium border border-border bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-700 h-9 px-3 text-xs w-full"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View Landing Page
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Details & Metrics */}
        <div className="md:col-span-2 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Total Scans</p>
                <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">
                  {formatNumber(qr.scan_count || 0)}
                </h3>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Reviews Created</p>
                <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">
                  0
                </h3>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Conversion</p>
                <h3 className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">
                  0.0%
                </h3>
              </CardContent>
            </Card>
          </div>

          {/* Configuration Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration & Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border text-sm">
                <span className="text-secondary-500 dark:text-secondary-400">Slug</span>
                <span className="font-mono text-secondary-900 dark:text-white font-medium">/r/{qr.slug}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-border text-sm gap-2">
                <span className="text-secondary-500 dark:text-secondary-400">Google Review URL</span>
                <div className="flex items-center gap-2 max-w-full sm:max-w-xs">
                  <span className="font-mono text-xs text-secondary-900 dark:text-white truncate">
                    {qr.google_review_url || qr.design?.google_review_url || 'Not configured'}
                  </span>
                  {(qr.google_review_url || qr.design?.google_review_url) && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={async () => {
                          const res = await copyTextToClipboard(qr.google_review_url || qr.design?.google_review_url);
                          if (res.success) toast.success('Google Review URL copied!');
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <a
                        href={qr.google_review_url || qr.design?.google_review_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 p-1"
                        title="Open Google Review Page"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between py-2 border-b border-border text-sm">
                <span className="text-secondary-500 dark:text-secondary-400">Primary Color</span>
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{ backgroundColor: qr.design?.primary_color || '#2563EB' }}
                  />
                  <span className="font-mono text-xs text-secondary-900 dark:text-white">
                    {qr.design?.primary_color || '#2563EB'}
                  </span>
                </div>
              </div>
              <div className="flex justify-between py-2 border-b border-border text-sm">
                <span className="text-secondary-500 dark:text-secondary-400">Shape</span>
                <span className="capitalize text-secondary-900 dark:text-white font-medium">
                  {qr.design?.shape || 'square'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border text-sm">
                <span className="text-secondary-500 dark:text-secondary-400">Created At</span>
                <span className="text-secondary-900 dark:text-white">
                  {qr.created_at ? formatDate(qr.created_at) : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
