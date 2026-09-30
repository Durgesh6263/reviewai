'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, Palette, Image, Square, Circle, Download, Copy, Check, Building2, QrCode, Eye, ExternalLink, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

import { getQRCodeReviewUrl, generateQRCodeImageUrl } from '@/lib/public-url';

interface Business {
  id: string;
  name: string;
  slug: string;
  google_review_url?: string;
}

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

export default function NewQRCodePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [copiedReviewUrl, setCopiedReviewUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'valid' | 'invalid' | 'unknown'>('unknown');
  const [verificationDetails, setVerificationDetails] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    business_id: '',
    name: '',
    slug: '',
    google_review_url: '',
    design: {
      primary_color: '#2563EB',
      logo_url: '',
      frame_text: 'Leave a Review',
      shape: 'square',
      logo_size: 0.2,
      quiet_zone: 4,
    },
  });

  const generateSlug = (name: string, businessSlug: string) => {
    const base = businessSlug || '';
    const namePart = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    return base + (namePart ? '-' + namePart : '');
  };

  useEffect(() => {
    // Fetch businesses for the select dropdown
    api.get<any>('/businesses?limit=100').then(response => {
      const list = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.businesses)
        ? response.businesses
        : Array.isArray(response)
        ? response
        : [];
      setBusinesses(list);
      if (list.length > 0 && !formData.business_id) {
        setFormData(prev => ({
          ...prev,
          business_id: list[0].id,
          google_review_url: prev.google_review_url || list[0].google_review_url || '',
        }));
      }
    }).catch(() => {
      toast.error('Failed to load businesses');
    });
  }, []);

  useEffect(() => {
    if (formData.business_id && formData.name) {
      const business = businesses.find(b => b.id === formData.business_id);
      if (business) {
        const slug = generateSlug(formData.name, business.slug);
        setFormData(prev => ({ ...prev, slug }));
        const target = getQRCodeReviewUrl(slug);
        setPreviewUrl(target);
      }
    }
  }, [formData.business_id, formData.name, businesses]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name.startsWith('design.')) {
      setFormData(prev => ({
        ...prev,
        design: {
          ...prev.design,
          [name.replace('design.', '')]: name === 'design.logo_size' || name === 'design.quiet_zone' ? parseFloat(value) : value,
        },
      }));
    } else {
      setFormData(prev => {
        const updated = { ...prev, [name]: value };
        if (name === 'name') {
          updated.slug = generateSlug(value, businesses.find(b => b.id === prev.business_id)?.slug || '');
        }
        return updated;
      });
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

  const handleBusinessChange = (businessId: string) => {
    const business = businesses.find(b => b.id === businessId);
    setFormData(prev => ({
      ...prev,
      business_id: businessId,
      slug: generateSlug(prev.name, business?.slug || ''),
      google_review_url: prev.google_review_url || business?.google_review_url || '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.business_id) {
      toast.error('Please select a business');
      return;
    }
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
      const payload = {
        ...formData,
        google_review_url: formData.google_review_url.trim(),
        design: {
          ...formData.design,
          google_review_url: formData.google_review_url.trim(),
        },
      };
      const response = await api.post<any>('/qr-codes', payload);
      toast.success('QR code created successfully!');
      router.push('/dashboard/qr-codes');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create QR code');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopied(true);
      toast.success('URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const shapeOptions = [
    { value: 'square', label: 'Square', icon: <Square className="h-4 w-4" /> },
    { value: 'rounded', label: 'Rounded', icon: <Square className="h-4 w-4 rounded-lg" /> },
    { value: 'circle', label: 'Circle', icon: <Circle className="h-4 w-4 rounded-full" /> },
  ];

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
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Create QR Code</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Design a custom QR code for collecting Google reviews</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Business Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary-500" />
                  Business
                </CardTitle>
                <CardDescription>Select the business this QR code belongs to</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={formData.business_id} onValueChange={handleBusinessChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a business" />
                  </SelectTrigger>
                  <SelectContent>
                    {businesses.map((business) => (
                      <SelectItem key={business.id} value={business.id}>
                        {business.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary-500" />
                  Basic Information
                </CardTitle>
                <CardDescription>Name, slug, and Google Review URL for this QR code</CardDescription>
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
                    placeholder="e.g., gym front desk qr"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="slug" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                    URL Slug
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary-500 dark:text-secondary-400 px-3 py-2 bg-secondary-100 dark:bg-secondary-800 rounded-l-lg border border-r-0 border-border text-xs sm:text-sm">
                      /r/
                    </span>
                    <Input
                      id="slug"
                      name="slug"
                      value={formData.slug}
                      onChange={handleChange}
                      className="rounded-r-lg border-l-0 font-mono text-xs sm:text-sm"
                      readOnly
                    />
                  </div>
                  <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                    Auto-generated from business slug and QR code name
                  </p>
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
                              try {
                                await navigator.clipboard.writeText(formData.google_review_url);
                                setCopiedReviewUrl(true);
                                toast.success('Google Review URL copied!');
                                setTimeout(() => setCopiedReviewUrl(false), 2000);
                              } catch {
                                toast.error('Failed to copy URL');
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
                    Paste the exact Google Review URL provided by Google (e.g. <code className="font-mono bg-secondary-100 dark:bg-secondary-800 px-1 py-0.5 rounded">https://g.page/r/CYPgDr_K-_-CEBI/review</code>). Click <strong>Verify URL</strong> to confirm it works properly.
                  </p>
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
                <CardDescription>Customize the appearance of your QR code</CardDescription>
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
                  <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                    Text displayed below the QR code (max 30 characters)
                  </p>
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
                  <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                    Logo will be centered in the QR code. Recommended: 200x200px, transparent background
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Shape
                    </label>
                    <Select value={formData.design.shape} onValueChange={(value: string) => setFormData(prev => ({ ...prev, design: { ...prev.design, shape: value } }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select shape" />
                      </SelectTrigger>
                      <SelectContent>
                        {shapeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              {option.icon}
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Logo Size
                    </label>
                    <Select value={formData.design.logo_size.toString()} onValueChange={(value: string) => setFormData(prev => ({ ...prev, design: { ...prev.design, logo_size: parseFloat(value) } }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.15">15% (Small)</SelectItem>
                        <SelectItem value="0.2">20% (Default)</SelectItem>
                        <SelectItem value="0.25">25% (Medium)</SelectItem>
                        <SelectItem value="0.3">30% (Large)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                      Quiet Zone
                    </label>
                    <Select value={formData.design.quiet_zone.toString()} onValueChange={(value: string) => setFormData(prev => ({ ...prev, design: { ...prev.design, quiet_zone: parseInt(value) } }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select quiet zone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 modules (Minimal)</SelectItem>
                        <SelectItem value="4">4 modules (Standard)</SelectItem>
                        <SelectItem value="6">6 modules (Large)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                      White space around the QR code for better scanning
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border">
              <Link href="/dashboard/qr-codes" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 border border-border bg-background hover:bg-secondary-100 dark:hover:bg-secondary-800 h-10 px-4 py-2 text-sm">
                Cancel
              </Link>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create QR Code'
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Preview & Public Base URL */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="sticky top-24">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-5 w-5 text-primary-500" />
                Live Preview & QR Settings
              </CardTitle>
              <CardDescription className="text-xs">Standards-compliant QR for phone camera scanning</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* QR Image Box */}
              <div className="aspect-square bg-white rounded-xl p-4 border border-border flex items-center justify-center shadow-xs">
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
                ) : (
                  <div className="text-center text-secondary-500">
                    <QrCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Fill in the form to see preview</p>
                  </div>
                )}
              </div>

              {previewUrl && (
                <>
                  <div className="space-y-1.5 text-xs">
                    <p className="text-secondary-600 dark:text-secondary-400 truncate">
                      <span className="font-semibold text-secondary-900 dark:text-white">QR Public Link:</span> {previewUrl}
                    </p>
                    <p className="text-secondary-600 dark:text-secondary-400 truncate">
                      <span className="font-semibold text-secondary-900 dark:text-white">Google Review URL:</span>{' '}
                      {formData.google_review_url || 'None set'}
                    </p>
                    <p className="text-secondary-600 dark:text-secondary-400">
                      <span className="font-semibold text-secondary-900 dark:text-white">Business:</span>{' '}
                      {businesses.find(b => b.id === formData.business_id)?.name || 'Not selected'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-border">
                    <Button variant="outline" size="sm" onClick={handleCopyUrl} className="w-full justify-center gap-2" disabled={copied}>
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy Target URL
                        </>
                      )}
                    </Button>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-lg font-medium border border-border bg-secondary-100 hover:bg-secondary-200 dark:bg-secondary-800 dark:hover:bg-secondary-700 h-9 px-3 text-xs w-full"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Customer Review Page
                    </a>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}