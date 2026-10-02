'use client';

import { useState } from 'react';
import { MapPin, Phone, Globe, AlertCircle, ExternalLink, Mail, ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategorySelect } from '@/components/business/CategorySelect';
import type { BusinessInfoStepData, ExperienceTag } from '@/lib/onboarding-types';

interface BusinessInfoStepProps {
  stepData: BusinessInfoStepData | undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
  timezones: string[];
  defaultTags: ExperienceTag[];
  duplicateBlocked?: {
    isBlocked: boolean;
    googleReviewUrl?: string;
    existingAccount?: string;
  } | null;
  onClearDuplicateWarning?: () => void;
  validationErrors?: Partial<Record<keyof BusinessInfoStepData, string>>;
}

export function BusinessInfoStep({
  stepData,
  onDataChange,
  isSaving,
  timezones,
  duplicateBlocked,
  onClearDuplicateWarning,
  validationErrors = {},
}: BusinessInfoStepProps) {
  const [localErrors, setLocalErrors] = useState<Partial<Record<keyof BusinessInfoStepData, string>>>({});

  const errors = { ...localErrors, ...validationErrors };

  const validateField = (name: keyof BusinessInfoStepData, value: string) => {
    switch (name) {
      case 'name':
        if (!value.trim()) return 'Business name is required';
        if (value.length > 100) return 'Name must be less than 100 characters';
        break;
      case 'category':
        if (!value || !value.trim()) return 'Business category is required';
        break;
      case 'address':
        if (!value.trim()) return 'Business address is required';
        break;
      case 'phone':
        if (!value.trim()) return 'Business phone number is required';
        if (!/^[\d\s\-\+\(\)]{7,}$/.test(value.trim())) {
          return 'Please enter a valid phone number (min 7 digits)';
        }
        break;
      case 'google_review_url': {
        const trimmed = value.trim();
        if (!trimmed) return 'Google Review URL is required';
        try {
          const url = new URL(trimmed);
          const host = url.hostname.toLowerCase();
          const isGoogle =
            host === 'g.page' ||
            host.endsWith('.g.page') ||
            host === 'maps.app.goo.gl' ||
            host === 'goo.gl' ||
            host.endsWith('.goo.gl') ||
            host === 'google.com' ||
            host.endsWith('.google.com') ||
            /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);

          if (!isGoogle) {
            return 'Please enter a valid Google Review or Google Maps business URL';
          }
        } catch {
          return 'Please enter a valid URL';
        }
        break;
      }
      case 'website_url':
        if (value.trim() && !value.trim().startsWith('http')) {
          return 'Please enter a valid URL starting with http:// or https://';
        }
        break;
    }
    return null;
  };

  const handleChange = (name: keyof BusinessInfoStepData, value: string) => {
    // If user changes google_review_url and duplicate warning was active, clear it
    if (name === 'google_review_url' && duplicateBlocked?.isBlocked) {
      onClearDuplicateWarning?.();
    }

    const error = validateField(name, value);
    setLocalErrors(prev => ({ ...prev, [name]: error || undefined }));

    const newData: BusinessInfoStepData = {
      ...(stepData || { name: '', category: '', google_review_url: '', phone: '', address: '', timezone: 'UTC' }),
      [name]: value,
    };
    onDataChange('business_info', newData);
  };

  const handleBlur = (name: keyof BusinessInfoStepData) => {
    const value = (stepData?.[name] as string) || '';
    const error = validateField(name, value);
    setLocalErrors(prev => ({ ...prev, [name]: error || undefined }));
  };

  const handleContactSupport = () => {
    const supportEmail = 'support@reviewai.com';
    const subject = encodeURIComponent('Business Registration Inquiry - Duplicate Google Business');
    const body = encodeURIComponent(
      `Hello Support,\n\nI encountered a duplicate registration message while registering my business on ReviewAI.\n\nBusiness Name: ${stepData?.name || ''}\nGoogle Review URL: ${duplicateBlocked?.googleReviewUrl || stepData?.google_review_url || ''}\n\nPlease assist with verifying my ownership.\n\nThank you.`
    );
    window.open(`mailto:${supportEmail}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Duplicate Warning UI */}
      {duplicateBlocked?.isBlocked && (
        <Card className="border-error-300 dark:border-error-700 bg-error-50/70 dark:bg-error-950/40 shadow-sm animate-in fade-in-50 duration-200">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-error-600 dark:text-error-400 flex-shrink-0 mt-0.5" />
              <div>
                <CardTitle className="text-lg font-semibold text-error-900 dark:text-error-100">
                  This Google Business is already registered with ReviewAI.
                </CardTitle>
                <p className="text-sm text-error-700 dark:text-error-300 mt-1">
                  A business with this Google Place ID / Review page is already linked to an existing ReviewAI account. Duplicate registrations and trial activations are not permitted.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="p-3.5 bg-white dark:bg-secondary-900 rounded-lg border border-error-200 dark:border-error-800 space-y-2 text-sm">
              <div>
                <span className="font-semibold text-secondary-600 dark:text-secondary-400 block text-xs uppercase tracking-wider mb-0.5">
                  Google Review URL:
                </span>
                <span className="font-mono text-xs text-secondary-900 dark:text-secondary-100 break-all select-all">
                  {duplicateBlocked.googleReviewUrl || stepData?.google_review_url}
                </span>
              </div>
              <div className="pt-2 border-t border-border">
                <span className="font-semibold text-secondary-600 dark:text-secondary-400 block text-xs uppercase tracking-wider mb-0.5">
                  Existing account:
                </span>
                <span className="font-mono text-sm font-medium text-secondary-900 dark:text-white select-all">
                  {duplicateBlocked.existingAccount &&
                  duplicateBlocked.existingAccount !== 'Protected Account' &&
                  duplicateBlocked.existingAccount !== 'Protected'
                    ? duplicateBlocked.existingAccount
                    : 'du************le@gmail.com'}
                </span>
              </div>
            </div>

            <p className="text-sm text-secondary-700 dark:text-secondary-300">
              If you believe this is your business or you need help, please contact Customer Support.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                type="button"
                onClick={handleContactSupport}
                className="bg-error-600 hover:bg-error-700 text-white"
              >
                <Mail className="h-4 w-4 mr-2" />
                Contact Support
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClearDuplicateWarning}
                className="border-secondary-300 dark:border-secondary-700 hover:bg-secondary-100 dark:hover:bg-secondary-800"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      <Card className="border-primary-200 dark:border-primary-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-primary-700 dark:text-primary-300">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>Enter your business details and connect your Google Review URL. All marked fields (*) are mandatory to proceed.</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business Name * */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Business Name <span className="text-error-500">*</span>
          </label>
          <Input
            id="name"
            value={stepData?.name || ''}
            onChange={e => handleChange('name', e.target.value)}
            onBlur={() => handleBlur('name')}
            placeholder="e.g., Mario's Italian Restaurant"
            className={errors.name ? 'border-error-500 focus:ring-error-500' : ''}
            disabled={isSaving}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-error-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{errors.name}
            </p>
          )}
        </div>

        {/* Business Category * */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Business Category <span className="text-error-500">*</span>
          </label>
          <CategorySelect
            id="category"
            value={stepData?.category}
            onChange={catId => handleChange('category', catId)}
            disabled={isSaving}
            error={errors.category}
          />
          {errors.category && (
            <p className="mt-1 text-sm text-error-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{errors.category}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business Address * */}
        <div>
          <label htmlFor="address" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Business Address <span className="text-error-500">*</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-3 h-4 w-4 text-secondary-400" />
            <Textarea
              id="address"
              value={stepData?.address || ''}
              onChange={e => handleChange('address', e.target.value)}
              onBlur={() => handleBlur('address')}
              placeholder="123 Main St, Suite 100, City, State 12345"
              className={errors.address ? 'pl-10 min-h-[90px] border-error-500 focus:ring-error-500' : 'pl-10 min-h-[90px]'}
              disabled={isSaving}
              rows={3}
            />
          </div>
          {errors.address && (
            <p className="mt-1 text-sm text-error-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{errors.address}
            </p>
          )}
        </div>

        {/* Business Phone Number * */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Business Phone Number <span className="text-error-500">*</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
            <Input
              id="phone"
              value={stepData?.phone || ''}
              onChange={e => handleChange('phone', e.target.value)}
              onBlur={() => handleBlur('phone')}
              placeholder="+1 (555) 123-4567"
              className={errors.phone ? 'pl-10 border-error-500 focus:ring-error-500' : 'pl-10'}
              disabled={isSaving}
            />
          </div>
          {errors.phone && (
            <p className="mt-1 text-sm text-error-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{errors.phone}
            </p>
          )}

          {/* Timezone */}
          <div className="mt-4">
            <label htmlFor="timezone" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Timezone
            </label>
            <Select
              value={stepData?.timezone || 'UTC'}
              onValueChange={value => handleChange('timezone', value)}
              disabled={isSaving}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {timezones.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Google Review URL * */}
      <div className="space-y-3">
        <label htmlFor="google_review_url" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300">
          Google Review URL <span className="text-error-500">*</span>
        </label>
        <div className="relative">
          <Input
            id="google_review_url"
            value={stepData?.google_review_url || ''}
            onChange={e => handleChange('google_review_url', e.target.value)}
            onBlur={() => handleBlur('google_review_url')}
            placeholder="https://g.page/your-business/review"
            className={errors.google_review_url ? 'pr-10 border-error-500 focus:ring-error-500' : 'pr-10'}
            disabled={isSaving}
          />
          {stepData?.google_review_url && (
            <a
              href={stepData.google_review_url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600 transition-colors"
              title="Open Google Review URL in new tab"
              aria-label="Open review link in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        {errors.google_review_url && (
          <p className="mt-1 text-sm text-error-500 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />{errors.google_review_url}
          </p>
        )}

        {/* Supported URL Formats */}
        <Card className="border-secondary-200 dark:border-secondary-800 bg-secondary-50/50 dark:bg-secondary-900/50 mt-3">
          <CardHeader className="py-2.5 px-4">
            <CardTitle className="text-xs font-semibold text-secondary-600 dark:text-secondary-400 uppercase tracking-wider">
              Supported URL Formats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-4 pb-3 pt-0">
            <div className="p-2 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-800 rounded font-mono text-xs text-secondary-700 dark:text-secondary-300 break-all">
              https://g.page/your-business/review
            </div>
            <div className="p-2 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-800 rounded font-mono text-xs text-secondary-700 dark:text-secondary-300 break-all">
              https://search.google.com/local/writereview?placeid=...
            </div>
            <div className="p-2 bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-800 rounded font-mono text-xs text-secondary-700 dark:text-secondary-300 break-all">
              https://maps.google.com/?cid=123456789
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Website (Optional) */}
        <div>
          <label htmlFor="website_url" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Website URL (Optional)
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
            <Input
              id="website_url"
              value={stepData?.website_url || ''}
              onChange={e => handleChange('website_url', e.target.value)}
              onBlur={() => handleBlur('website_url')}
              placeholder="https://your-business.com"
              className={errors.website_url ? 'pl-10 border-error-500 focus:ring-error-500' : 'pl-10'}
              disabled={isSaving}
            />
          </div>
          {errors.website_url && (
            <p className="mt-1 text-sm text-error-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{errors.website_url}
            </p>
          )}
        </div>

        {/* Description (Optional) */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Description (Optional)
          </label>
          <Textarea
            id="description"
            value={stepData?.description || ''}
            onChange={e => handleChange('description', e.target.value)}
            placeholder="Brief description of your business..."
            className="min-h-[42px] py-2"
            disabled={isSaving}
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}