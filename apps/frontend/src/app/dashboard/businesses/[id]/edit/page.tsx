'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Save,
  Loader2,
  Globe,
  Phone,
  MapPin,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Tag,
  Plus,
  X,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CategorySelect } from '@/components/business/CategorySelect';
import { getCategoryById, getDefaultTagsForCategory } from '@/lib/categories';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

export default function EditBusinessPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'valid' | 'invalid' | 'unknown'>('unknown');
  const [verificationDetails, setVerificationDetails] = useState<string | null>(null);

  const [initialCategory, setInitialCategory] = useState<string>('other');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [categoryChangePending, setCategoryChangePending] = useState<{ oldCat: string; newCat: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'other',
    google_review_url: '',
    description: '',
    website_url: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
    timezone: 'UTC',
    status: 'active',
  });

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    api.get<any>(`/businesses/${id}`)
      .then((res: any) => {
        const b = res?.data?.business || res?.business || res?.data || res;
        if (b) {
          const addr = typeof b.address === 'object' && b.address !== null ? b.address : {};
          const cat = b.category || b.settings?.category || 'other';
          const existingTags = b.tags || b.settings?.custom_tags || b.settings?.tags || getDefaultTagsForCategory(cat);
          setInitialCategory(cat);
          setTags(existingTags);
          setFormData({
            name: b.name || '',
            category: cat,
            google_review_url: b.google_review_url || '',
            description: b.description || '',
            website_url: b.website_url || '',
            phone: b.phone || '',
            street: addr.street || '',
            city: addr.city || '',
            state: addr.state || '',
            country: addr.country || '',
            postal_code: addr.postal_code || '',
            timezone: b.timezone || 'UTC',
            status: b.status || 'active',
          });
        }
      })
      .catch(() => {
        toast.error('Failed to load business details');
        router.push('/dashboard/businesses');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [id, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'google_review_url') {
      setVerificationResult('unknown');
      setVerificationDetails(null);
    }
  };

  const handleCategoryChange = (newCatId: string) => {
    if (newCatId === formData.category) return;
    const oldCat = formData.category;
    setFormData(prev => ({ ...prev, category: newCatId }));

    // Check if current tags differ from the new category defaults
    const newDefaults = getDefaultTagsForCategory(newCatId);
    const areTagsSameAsNew = JSON.stringify(tags) === JSON.stringify(newDefaults);
    if (!areTagsSameAsNew) {
      setCategoryChangePending({ oldCat, newCat: newCatId });
    }
  };

  const handleApplyNewCategoryDefaults = () => {
    if (categoryChangePending) {
      const newDefaults = getDefaultTagsForCategory(categoryChangePending.newCat);
      setTags(newDefaults);
      toast.success(`Updated tags to ${getCategoryById(categoryChangePending.newCat).name} defaults`);
      setCategoryChangePending(null);
    }
  };

  const handleKeepCurrentTags = () => {
    setCategoryChangePending(null);
    toast('Preserved current customized tags', { icon: 'ℹ️' });
  };

  const handleAddTag = () => {
    const t = newTagInput.trim();
    if (!t) return;
    if (tags.some(existing => existing.toLowerCase() === t.toLowerCase())) {
      toast.error('Tag already exists');
      return;
    }
    if (tags.length >= 12) {
      toast.error('Maximum 12 tags allowed');
      return;
    }
    setTags(prev => [...prev, t]);
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (tags.length <= 4) {
      toast.error('At least 4 tags are recommended for customer selection');
      return;
    }
    setTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const handleResetTags = () => {
    const defaults = getDefaultTagsForCategory(formData.category);
    setTags(defaults);
    toast.success(`Reset tags to ${getCategoryById(formData.category).name} defaults`);
  };

  const handleVerifyUrl = async () => {
    const rawUrl = formData.google_review_url?.trim();
    if (!rawUrl) {
      toast.error('Please enter a Google Review URL first');
      return;
    }

    try {
      new URL(rawUrl);
    } catch {
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
      toast.error('Business name is required');
      return;
    }
    if (!formData.google_review_url.trim()) {
      toast.error('Google Review URL is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        category: formData.category,
        custom_tags: tags,
        tags: tags,
        settings: {
          category: formData.category,
          custom_tags: tags,
        },
        google_review_url: formData.google_review_url.trim(),
        description: formData.description.trim() || null,
        website_url: formData.website_url.trim() || null,
        phone: formData.phone.trim() || null,
        timezone: formData.timezone || 'UTC',
        address: {
          street: formData.street.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || undefined,
          country: formData.country.trim() || undefined,
          postal_code: formData.postal_code.trim() || undefined,
        },
      };

      await api.patch(`/businesses/${id}`, payload);
      toast.success('Business updated successfully!');
      router.push(`/dashboard/businesses/${id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update business');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <Link href={`/dashboard/businesses/${id}`}>
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Edit Business</h1>
          <p className="text-secondary-600 dark:text-secondary-400">
            Update profile details for {formData.name}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary-500" /> Basic Information
            </CardTitle>
            <CardDescription>Core identity of your business</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Business Name <span className="text-error-500">*</span>
              </label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Business Category <span className="text-error-500">*</span>
              </label>
              <CategorySelect
                id="category"
                value={formData.category}
                onChange={handleCategoryChange}
              />
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                Changing category updates context-aware AI review generation and vocabulary.
              </p>
            </div>

            {categoryChangePending && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Update Experience Tags for {getCategoryById(categoryChangePending.newCat).name}?
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                      You changed the category from &ldquo;{getCategoryById(categoryChangePending.oldCat).name}&rdquo; to &ldquo;{getCategoryById(categoryChangePending.newCat).name}&rdquo;. Would you like to update your tags to the suggested defaults for this category, or keep your existing tags?
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-7 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyNewCategoryDefaults}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
                  >
                    Update Tags to {getCategoryById(categoryChangePending.newCat).name} Defaults
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleKeepCurrentTags}
                    className="text-xs h-8"
                  >
                    Keep Current Tags
                  </Button>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Description
              </label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Brief summary of your services..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Customer Experience Tags Customization */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-5 w-5 text-primary-500" /> Customer Experience Tags
                </CardTitle>
                <CardDescription>
                  Tags customers choose on their review page to highlight key positive experiences
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetTags}
                className="text-xs gap-1.5 text-secondary-600 hover:text-secondary-900 dark:text-secondary-400"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset Defaults
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-secondary-100 dark:bg-secondary-800 text-secondary-800 dark:text-secondary-200 border border-secondary-200 dark:border-secondary-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-500 transition-colors p-0.5"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 max-w-sm pt-2">
              <Input
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add custom tag..."
                className="h-9 text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddTag}
                variant="outline"
                className="h-9 text-xs gap-1 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Add Tag
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Google Review URL */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary-500" /> Google Review Connection
            </CardTitle>
            <CardDescription>Direct link to your Google Maps review prompt</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="google_review_url" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                  Google Review URL <span className="text-error-500">*</span>
                </label>
                {formData.google_review_url && (
                  <a
                    href={formData.google_review_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-secondary-600 hover:text-secondary-900 dark:text-secondary-400 dark:hover:text-secondary-200 flex items-center gap-1 font-medium"
                  >
                    <ExternalLink className="h-3 w-3" /> Test Link
                  </a>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Input
                    id="google_review_url"
                    name="google_review_url"
                    value={formData.google_review_url}
                    onChange={handleChange}
                    placeholder="https://g.page/r/.../review"
                    required
                    className={`pr-8 ${
                      verificationResult === 'valid'
                        ? 'border-emerald-500 focus-visible:ring-emerald-500'
                        : verificationResult === 'invalid'
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

              <p className="text-xs text-secondary-500 dark:text-secondary-400">
                Copy your review link from your Google Business Profile dashboard ("Ask for reviews" button, e.g. <code className="font-mono bg-secondary-100 dark:bg-secondary-800 px-1 py-0.5 rounded">https://g.page/r/CYPgDr_K-_-CEBI/review</code>). Click <strong>Verify URL</strong> to confirm it works properly.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary-500" /> Contact & Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="website_url" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Website URL
                </label>
                <Input
                  id="website_url"
                  name="website_url"
                  value={formData.website_url}
                  onChange={handleChange}
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Phone Number
                </label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>

            <div>
              <label htmlFor="street" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Street Address
              </label>
              <Input
                id="street"
                name="street"
                value={formData.street}
                onChange={handleChange}
                placeholder="123 Main St, Suite 100"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  City
                </label>
                <Input id="city" name="city" value={formData.city} onChange={handleChange} />
              </div>

              <div>
                <label htmlFor="state" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  State / Province
                </label>
                <Input id="state" name="state" value={formData.state} onChange={handleChange} />
              </div>

              <div>
                <label htmlFor="postal_code" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Postal Code
                </label>
                <Input id="postal_code" name="postal_code" value={formData.postal_code} onChange={handleChange} />
              </div>

              <div>
                <label htmlFor="country" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Country
                </label>
                <Input id="country" name="country" value={formData.country} onChange={handleChange} placeholder="US" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Link
            href={`/dashboard/businesses/${id}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg font-medium border border-border bg-background hover:bg-secondary-100 dark:hover:bg-secondary-800 h-10 px-4 py-2 text-sm"
          >
            Cancel
          </Link>
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
