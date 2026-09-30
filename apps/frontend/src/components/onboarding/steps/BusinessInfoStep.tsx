'use client';

import { useState, useEffect } from 'react';
import { MapPin, Phone, Globe, Clock, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { CategorySelect } from '@/components/business/CategorySelect';
import { getCategoryById } from '@/lib/categories';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import type { BusinessInfoStepData, ExperienceTag, OnboardingStepData } from '@/lib/onboarding-types';

interface BusinessInfoStepProps {
  stepData: BusinessInfoStepData | undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
  timezones: string[];
  defaultTags: ExperienceTag[];
  // Callback when business is created
  onBusinessCreated?: (businessId: string) => void;
}

export function BusinessInfoStep({ stepData, onDataChange, isSaving, timezones, defaultTags, onBusinessCreated }: BusinessInfoStepProps) {
  const [errors, setErrors] = useState<Partial<Record<keyof BusinessInfoStepData, string>>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [businessCreated, setBusinessCreated] = useState(false);

  const validateField = (name: keyof BusinessInfoStepData, value: string) => {
    switch (name) {
      case 'name':
        if (!value.trim()) return 'Business name is required';
        if (value.length > 100) return 'Name must be less than 100 characters';
        break;
      case 'category':
        if (!value || !value.trim()) return 'Business category is required';
        break;
      case 'google_review_url':
        if (!value.trim()) return 'Google Review URL is required';
        try {
          const url = new URL(value);
          if (!url.hostname.includes('google') && !url.hostname.includes('g.page')) {
            return 'Please use a valid Google Review URL';
          }
        } catch {
          return 'Please enter a valid URL';
        }
        break;
      case 'google_place_id':
        if (value && !value.startsWith('ChIJ')) {
          return 'Google Place ID should start with ChIJ...';
        }
        break;
      case 'website_url':
        if (value && !value.startsWith('http')) {
          return 'Please enter a valid URL starting with http:// or https://';
        }
        break;
      case 'phone':
        if (value && !/^[\d\s\-\+\(\)]{7,}$/.test(value)) {
          return 'Please enter a valid phone number';
        }
        break;
    }
    return null;
  };

  const handleChange = (name: keyof BusinessInfoStepData, value: string) => {
    const error = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: error || undefined }));

    const newData: BusinessInfoStepData = {
      ...(stepData || { name: '', category: '', google_review_url: '', timezone: 'UTC' }),
      [name]: value,
    };
    onDataChange('business_info', newData);
  };

  const handleBlur = (name: keyof BusinessInfoStepData) => {
    const value = (stepData?.[name] as string) || '';
    const error = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: error || undefined }));
  };

  const isValid = !!(
    stepData?.name?.trim() &&
    stepData?.category?.trim() &&
    stepData?.google_review_url?.trim() &&
    !errors.name &&
    !errors.category &&
    !errors.google_review_url
  );

  // Create business when step is valid and user proceeds
  const createBusiness = async () => {
    if (!stepData?.name?.trim() || !stepData?.category?.trim() || !stepData?.google_review_url?.trim()) {
      toast.error('Please fill in all required fields (Name, Category, and Google Review URL)');
      return false;
    }

    if (!isValid) {
      toast.error('Please fix validation errors before continuing');
      return false;
    }

    setIsCreating(true);
    try {
      const response = await api.post<{ success: boolean; data: { business: { id: string } } }>('/businesses', {
        name: stepData.name,
        category: stepData.category,
        google_review_url: stepData.google_review_url,
        description: stepData.description,
        website_url: stepData.website_url,
        phone: stepData.phone,
        address: stepData.address,
        timezone: stepData.timezone || 'UTC',
        google_place_id: stepData.google_place_id,
      });

      const businessId = response.data.business.id;
      setBusinessCreated(true);
      onBusinessCreated?.(businessId);
      toast.success('Business created successfully!');
      return true;
    } catch (error: unknown) {
      console.error('Failed to create business:', error);
      const err = error as { response?: { data?: { message?: string; error?: string } } };
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to create business. Please try again.');
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  // If business already created, show success state
  if (businessCreated) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
          <span className="text-success-700 dark:text-success-300">
            Business created successfully! Proceeding to Google Review configuration...
          </span>
        </div>

        {/* Show summary of created business */}
        <Card className="border-secondary-200 dark:border-secondary-700">
          <CardContent className="p-4">
            <h4 className="font-medium text-secondary-900 dark:text-white mb-3">Business Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary-500">Name:</span>
                <span className="font-medium text-secondary-900 dark:text-white">{stepData?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-500">Category:</span>
                <span className="font-medium text-secondary-900 dark:text-white">
                  {getCategoryById(stepData?.category)?.name || stepData?.category || 'Not specified'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-500">Google Review URL:</span>
                <span className="font-medium text-secondary-900 dark:text-white truncate max-w-[200px]">{stepData?.google_review_url}</span>
              </div>
              {stepData?.google_place_id && (
                <div className="flex justify-between">
                  <span className="text-secondary-500">Google Place ID:</span>
                  <span className="font-medium text-secondary-900 dark:text-white">{stepData?.google_place_id}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-secondary-500">Timezone:</span>
                <span className="font-medium text-secondary-900 dark:text-white">{stepData?.timezone}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary-200 dark:border-primary-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-primary-700 dark:text-primary-300 mb-4">
            <AlertCircle className="h-4 w-4" />
            <span>Select your business category to configure relevant customer experience tags and authentic AI review vocabulary.</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business Name */}
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
            disabled={isSaving || isCreating}
          />
          {errors.name && <p className="mt-1 text-sm text-error-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.name}</p>}
        </div>

        {/* Business Category * (Searchable dropdown) */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Business Category <span className="text-error-500">*</span>
          </label>
          <CategorySelect
            id="category"
            value={stepData?.category}
            onChange={catId => handleChange('category', catId)}
            disabled={isSaving || isCreating}
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
        {/* Google Review URL */}
        <div>
          <label htmlFor="google_review_url" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Google Review URL <span className="text-error-500">*</span>
          </label>
          <Input
            id="google_review_url"
            value={stepData?.google_review_url || ''}
            onChange={e => handleChange('google_review_url', e.target.value)}
            onBlur={() => handleBlur('google_review_url')}
            placeholder="https://g.page/your-business/review"
            className={errors.google_review_url ? 'border-error-500 focus:ring-error-500' : ''}
            disabled={isSaving || isCreating}
          />
          {errors.google_review_url && (
            <p className="mt-1 text-sm text-error-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{errors.google_review_url}
            </p>
          )}
          <p className="mt-1 text-xs text-secondary-500">Format: https://g.page/your-business/review or https://search.google.com/local/writereview?placeid=ChIJ...</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google Place ID (Optional) */}
        <div>
          <label htmlFor="google_place_id" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Google Place ID (Optional)
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
            <Input
              id="google_place_id"
              value={stepData?.google_place_id || ''}
              onChange={e => handleChange('google_place_id', e.target.value)}
              onBlur={() => handleBlur('google_place_id')}
              placeholder="ChIJ..."
              className={errors.google_place_id ? 'pl-10 border-error-500 focus:ring-error-500' : 'pl-10'}
              disabled={isSaving || isCreating}
            />
          </div>
          {errors.google_place_id && <p className="mt-1 text-sm text-error-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.google_place_id}</p>}
          <p className="mt-1 text-xs text-secondary-500">Find at: <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener" className="text-primary-600 hover:underline">Google Place ID Finder</a></p>
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Timezone
          </label>
          <Select
            value={stepData?.timezone || 'UTC'}
            onValueChange={value => handleChange('timezone', value)}
            disabled={isSaving || isCreating}
          >
            <SelectTrigger>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Website */}
        <div>
          <label htmlFor="website_url" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Website URL
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-400" />
            <Input
              id="website_url"
              value={stepData?.website_url || ''}
              onChange={e => handleChange('website_url', e.target.value)}
              onBlur={() => handleBlur('website_url')}
              placeholder="https://your-restaurant.com"
              className={errors.website_url ? 'pl-10 border-error-500 focus:ring-error-500' : 'pl-10'}
              disabled={isSaving || isCreating}
            />
          </div>
          {errors.website_url && <p className="mt-1 text-sm text-error-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.website_url}</p>}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
            Phone Number
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
              disabled={isSaving || isCreating}
            />
          </div>
          {errors.phone && <p className="mt-1 text-sm text-error-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.phone}</p>}
        </div>
      </div>

      {/* Address */}
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
          Address
        </label>
        <div className="relative">
          <MapPin className="absolute left-3 top-3 h-4 w-4 text-secondary-400" />
          <Textarea
            id="address"
            value={stepData?.address || ''}
            onChange={e => handleChange('address', e.target.value)}
            placeholder="123 Main St, City, State 12345"
            className="pl-10 min-h-[100px]"
            disabled={isSaving || isCreating}
            rows={3}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
          Description (Optional)
        </label>
        <Textarea
          id="description"
          value={stepData?.description || ''}
          onChange={e => handleChange('description', e.target.value)}
          placeholder="Tell us about your business..."
          className="min-h-[80px]"
          disabled={isSaving || isCreating}
          rows={3}
        />
        <p className="mt-1 text-xs text-secondary-500">This helps customers recognize your business on the review page.</p>
      </div>

      {/* Create Business Button / Validation Summary */}
      {isCreating ? (
        <Button disabled className="w-full py-3 text-lg" size="lg">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Creating Business...
        </Button>
      ) : isValid ? (
        <div className="space-y-3">
          <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
            <span className="text-success-700 dark:text-success-300">
              All required fields are valid! Click Continue to create your business.
            </span>
          </div>
          <Button
            onClick={createBusiness}
            disabled={isSaving}
            className="w-full py-3 text-lg"
            size="lg"
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            Create Business & Continue
          </Button>
        </div>
      ) : (
        <div className="p-4 bg-secondary-50 dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg">
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            Please fill in all required fields (Business Name and Google Review URL) to continue.
          </p>
        </div>
      )}
    </div>
  );
}