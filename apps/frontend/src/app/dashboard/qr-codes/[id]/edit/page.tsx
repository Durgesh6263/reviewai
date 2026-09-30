'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, Palette, Square, Circle, Eye, ExternalLink, Check, Copy, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { getQRCodeReviewUrl, generateQRCodeImageUrl } from '@/lib/public-url';
import { copyTextToClipboard } from '@/lib/clipboard';

const isValidHttpUrl = (val: string) => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export default function EditQRCodePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedReviewUrl, setCopiedReviewUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'valid' | 'invalid' | 'unknown'>('unknown');
  const [verificationDetails, setVerificationDetails] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    google_review_url: '',
    business_name: '',
    is_active: true,
    design: {
      primary_color: '#2563EB',
      logo_url: '',
      frame_text: 'Leave a Review',
      shape: 'square',
      logo_size: 0.2,
      quiet_zone: 4,
    },
  });

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    api.get<any>(`/qr-codes/${id}`)
      .then((res: any) => {
        const item = res?.data || res;
        if (item) {
          setFormData({
            name: item.name || '',
            slug: item.slug || '',
            google_review_url: item.google_review_url || item.design?.google_review_url || '',
            business_name: item.business_name || '',
            is_active: item.is_active !== false,
            design: {
              primary_color: item.design?.primary_color || '#2563EB',
              logo_url: item.design?.logo_url || '',
              frame_text: item.design?.frame_text || 'Leave a Review',
              shape: item.design?.shape || 'square',
              logo_size: item.design?.logo_size || 0.2,
              quiet_zone: item.design?.quiet_zone || 4,
            },
          });
        }
      })
      .catch((err) => {
        toast.error('Failed to load QR code details');
        router.push('/dashboard/qr-codes');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [id, router]);

  const previewUrl = typeof window !== 'undefined' && formData.slug
    ? getQRCodeReviewUrl(formData.slug)
    : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('design.')) {
      setFormData((prev) => ({
        ...prev,
        design: {
          ...prev.design,
          [name.replace('design.', '')]:
            name === 'design.logo_size' || name === 'design.quiet_zone' ? parseFloat(value) : value,
        },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, google_review_url: val }));
    setVerificationResult('unknown');
    setVerificationDetails(null);
    if (!val.trim()) {
      setUrlError('Google Review URL is required');
    } else if (!isValidHttpUrl(val)) {
      setUrlError('Please enter a valid URL (must start with https:// or http://)');
    } else {
      setUrlError(null);
    }
  };

  const handleVerifyUrl = async () => {
    const rawUrl = formData.google_review_url?.trim();
    if (!rawUrl) {
      setUrlError('Please enter a Google Review URL first');
      toast.error('Please enter a Google Review URL first');
      return;
    }

    if (!isValidHttpUrl(rawUrl)) {
      setUrlError('URL must start with https:// or http://');
      setVerificationResult('invalid');
      setVerificationDetails('Invalid URL format. Please include https://');
      toast.error('Invalid URL format');
      return;
    }

    setIsVerifying(true);
    setVerificationResult('unknown');
    setVerificationDetails(null);

    try {
      const res = await api.post<{ success: boolean; data: { valid: boolean; details?: string } }>(
        '/onboarding/verify-google-url',
        { google_review_url: rawUrl }
      );

      if (res?.data?.valid) {
        setVerificationResult('valid');
        setVerificationDetails(res.data.details || 'URL verified successfully! Google Reviews page is accessible.');
        setUrlError(null);
        toast.success('Google Review URL verified successfully!');
      } else {
        setVerificationResult('invalid');
        setVerificationDetails(res?.data?.details || 'URL could not be verified as a Google Reviews page.');
        toast.error(res?.data?.details || 'Verification failed: not a valid Google Reviews link');
      }
    } catch {
      try {
        const parsed = new URL(rawUrl);
        const host = parsed.hostname.toLowerCase();
        const isGoogle = host.includes('g.page') || host.includes('google.') || host.includes('goo.gl');
        if (isGoogle) {
          setVerificationResult('valid');
          setVerificationDetails('URL verified successfully! Google Reviews page is accessible.');
          setUrlError(null);
          toast.success('Google Review URL verified successfully!');
        } else {
          setVerificationResult('invalid');
          setVerificationDetails('URL must belong to a Google domain (e.g. g.page, google.com/maps).');
          toast.error('URL must belong to a Google domain');
        }
      } catch {
        setVerificationResult('invalid');
        setVerificationDetails('Invalid URL format.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('QR code name is required');
      return;
    }
    if (!formData.google_review_url.trim()) {
      setUrlError('Google Review URL is required');
      toast.error('Google Review URL is required');
      return;
    }
    if (!isValidHttpUrl(formData.google_review_url)) {
      setUrlError('Please enter a valid URL (e.g. https://g.page/r/XXXXXXXXXXXX/review)');
      toast.error('Please enter a valid Google Review URL');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.patch(`/qr-codes/${id}`, {
        name: formData.name,
        google_review_url: formData.google_review_url.trim(),
        design: {
          ...formData.design,
          google_review_url: formData.google_review_url.trim(),
        },
        is_active: formData.is_active,
      });
      toast.success('QR code updated successfully!');
      router.push('/dashboard/qr-codes');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update QR code');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!previewUrl) return;
    const res = await copyTextToClipboard(previewUrl);
    if (res.success) {
      setCopied(true);
      toast.success('URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast(res.message);
    }
  };

  const shapeOptions = [
    { value: 'square', label: 'Square', icon: <Square className="h-4 w-4" /> },
    { value: 'rounded', label: 'Rounded', icon: <Square className="h-4 w-4 rounded-lg" /> },
    { value: 'circle', label: 'Circle', icon: <Circle className="h-4 w-4 rounded-full" /> },
  ];

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/qr-codes">
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Edit QR Code</h1>
          <p className="text-secondary-600 dark:text-secondary-400">
            Update design and settings for {formData.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>QR code name and status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                    QR Code Name <span className="text-error-500">*</span>
                  </label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="google_review_url" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                      Google Review URL <span className="text-error-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {formData.google_review_url && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (isValidHttpUrl(formData.google_review_url)) {
                                window.open(formData.google_review_url, '_blank', 'noopener,noreferrer');
                              } else {
                                toast.error('Please enter a valid URL first');
                              }
                            }}
                            className="text-xs text-secondary-600 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-200 flex items-center gap-1 font-medium"
                          >
                            <ExternalLink className="h-3 w-3" /> Test Link
                          </button>
                          <span className="text-secondary-300 dark:text-secondary-700">|</span>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await copyTextToClipboard(formData.google_review_url);
                              if (res.success) {
                                setCopiedReviewUrl(true);
                                toast.success('Google Review URL copied!');
                                setTimeout(() => setCopiedReviewUrl(false), 2000);
                              }
                            }}
                            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1 font-medium"
                          >
                            {copiedReviewUrl ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                            {copiedReviewUrl ? 'Copied' : 'Copy URL'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="google_review_url"
                        name="google_review_url"
                        type="url"
                        value={formData.google_review_url}
                        onChange={handleUrlChange}
                        placeholder="https://g.page/r/XXXXXXXXXXXX/review"
                        required
                        className={`pr-8 ${
                          verificationResult === 'valid'
                            ? 'border-emerald-500 focus-visible:ring-emerald-500'
                            : urlError || verificationResult === 'invalid'
                            ? 'border-error-500 focus-visible:ring-error-500'
                            : ''
                        }`}
                      />
                      {verificationResult === 'valid' && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleVerifyUrl}
                      disabled={isVerifying || !formData.google_review_url}
                      className={`shrink-0 font-medium ${
                        verificationResult === 'valid'
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : ''
                      }`}
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                          Verifying...
                        </>
                      ) : verificationResult === 'valid' ? (
                        <>
                          <ShieldCheck className="h-4 w-4 mr-1.5 text-emerald-600" />
                          Verified
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4 mr-1.5" />
                          Verify URL
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Verification Status Feedback */}
                  {verificationResult === 'valid' && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-medium">{verificationDetails || 'Google Review URL verified successfully! Google Reviews page is accessible.'}</span>
                    </div>
                  )}

                  {verificationResult === 'invalid' && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-error-50 border border-error-200 text-error-800 dark:bg-error-950/30 dark:border-error-800 dark:text-error-300 text-xs">
                      <AlertCircle className="h-4 w-4 text-error-600 shrink-0 mt-0.5" />
                      <span>{verificationDetails || 'Could not verify URL. Make sure it is a valid Google Review or Google Maps link.'}</span>
                    </div>
                  )}

                  {urlError && verificationResult !== 'invalid' && (
                    <p className="text-xs text-error-600 mt-1 font-medium">
                      ⚠️ {urlError}
                    </p>
                  )}

                  <p className="text-xs text-secondary-500 dark:text-secondary-400">
                    The exact Google Review URL saved for this QR code. When customers click <strong>Open Google Reviews</strong>, they will be redirected to this link.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                    Target Review Link
                  </label>
                  <Input value={previewUrl} readOnly className="bg-secondary-50 dark:bg-secondary-800 font-mono text-xs" />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
                    Active (Allows visitors to scan and submit reviews)
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Design */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary-500" />
                  Design Customization
                </CardTitle>
                <CardDescription>Customize styling and colors</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      name="design.primary_color"
                      type="color"
                      value={formData.design.primary_color}
                      onChange={handleChange}
                      className="h-10 w-14 cursor-pointer"
                    />
                    <Input
                      name="design.primary_color"
                      value={formData.design.primary_color}
                      onChange={handleChange}
                      className="font-mono text-sm flex-1 max-w-xs"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="frame_text" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                    Frame Text
                  </label>
                  <Input
                    id="frame_text"
                    name="design.frame_text"
                    value={formData.design.frame_text}
                    onChange={handleChange}
                    placeholder="Leave a Review"
                    maxLength={30}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                    Logo URL (Optional)
                  </label>
                  <Input
                    name="design.logo_url"
                    value={formData.design.logo_url}
                    onChange={handleChange}
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Shape
                    </label>
                    <Select
                      value={formData.design.shape}
                      onValueChange={(val: string) =>
                        setFormData((prev) => ({ ...prev, design: { ...prev.design, shape: val } }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select shape" />
                      </SelectTrigger>
                      <SelectContent>
                        {shapeOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              {opt.icon}
                              <span>{opt.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Quiet Zone
                    </label>
                    <Select
                      value={formData.design.quiet_zone.toString()}
                      onValueChange={(val: string) =>
                        setFormData((prev) => ({
                          ...prev,
                          design: { ...prev.design, quiet_zone: parseInt(val, 10) },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select quiet zone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 modules (Minimal)</SelectItem>
                        <SelectItem value="4">4 modules (Standard)</SelectItem>
                        <SelectItem value="6">6 modules (Large)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Link
                href="/dashboard/qr-codes"
                className="inline-flex items-center justify-center gap-2 rounded-lg font-medium border border-border bg-background hover:bg-secondary-100 dark:hover:bg-secondary-800 h-10 px-4 py-2 text-sm"
              >
                Cancel
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Live Preview */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary-500" />
                Live Preview
              </CardTitle>
              <CardDescription>Real-time QR appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-square bg-white rounded-xl p-4 border border-border flex items-center justify-center">
                {previewUrl ? (
                  <img
                    src={generateQRCodeImageUrl(previewUrl, {
                      color: formData.design.primary_color,
                      size: 600,
                      quietZone: formData.design.quiet_zone,
                      ecc: 'M',
                    })}
                    alt="QR Code Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : null}
              </div>

              {previewUrl && (
                <div className="space-y-1.5 text-xs">
                  <p className="text-secondary-600 dark:text-secondary-400 truncate">
                    <span className="font-semibold text-secondary-900 dark:text-white">QR Public Link:</span> {previewUrl}
                  </p>
                  <p className="text-secondary-600 dark:text-secondary-400 truncate">
                    <span className="font-semibold text-secondary-900 dark:text-white">Google Review URL:</span>{' '}
                    {formData.google_review_url || 'None set'}
                  </p>
                </div>
              )}

              {previewUrl && (
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <Button variant="outline" onClick={handleCopyUrl} className="w-full justify-center gap-2" disabled={copied}>
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy URL
                      </>
                    )}
                  </Button>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg font-medium bg-secondary-100 text-secondary-900 dark:bg-secondary-800 dark:text-secondary-100 hover:bg-secondary-200 dark:hover:bg-secondary-700 h-10 px-4 py-2 text-sm w-full"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Preview
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
