'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, MapPin, Mail, Phone, Globe, Clock, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategorySelect } from '@/components/business/CategorySelect';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney',
];

export default function NewBusinessPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const [formData, setFormData] = useState({
    name: '',
    category: 'gym-fitness',
    slug: '',
    email: '',
    phone: '',
    google_review_url: '',
    google_place_id: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'US',
    timezone: 'America/New_York',
    settings: {
      review_goal: 10,
      auto_reply_enabled: false,
      auto_reply_template: '',
      notification_email: '',
      language: 'en',
    },
  });

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'name') {
      setFormData(prev => ({
        ...prev,
        name: value,
        slug: generateSlug(value) || prev.slug,
      }));
    } else if (name === 'google_place_id') {
      setFormData(prev => {
        const trimmed = value.trim();
        const autoUrl = trimmed && !prev.google_review_url
          ? `https://search.google.com/local/writereview?placeid=${trimmed}`
          : prev.google_review_url;
        return {
          ...prev,
          google_place_id: value,
          google_review_url: autoUrl,
        };
      });
    } else if (name === 'google_review_url') {
      setFormData(prev => {
        let extractedPlaceId = prev.google_place_id;
        const placeIdMatch = value.match(/[?&]placeid=([a-zA-Z0-9_-]+)/i);
        if (placeIdMatch && placeIdMatch[1] && !prev.google_place_id) {
          extractedPlaceId = placeIdMatch[1];
        }
        return {
          ...prev,
          google_review_url: value,
          google_place_id: extractedPlaceId,
        };
      });
    } else if (name.startsWith('settings.')) {
      setFormData(prev => ({
        ...prev,
        settings: {
          ...prev.settings,
          [name.replace('settings.', '')]: value,
        },
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submission synchronously
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    if (!formData.name.trim()) {
      toast.error('Business name is required', { id: 'create-business-toast' });
      return;
    }
    if (!formData.email.trim()) {
      toast.error('Business email is required', { id: 'create-business-toast' });
      return;
    }
    if (!formData.google_review_url.trim() && !formData.google_place_id.trim()) {
      toast.error('Google Review URL or Google Place ID is required', { id: 'create-business-toast' });
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const addressParts = [
        formData.address_line1.trim(),
        formData.address_line2.trim(),
        formData.city.trim(),
        formData.state.trim() ? `${formData.state.trim()} ${formData.postal_code.trim()}`.trim() : formData.postal_code.trim(),
        formData.country.trim(),
      ].filter(Boolean);

      const payload = {
        name: formData.name.trim(),
        category: formData.category,
        slug: formData.slug.trim() || undefined,
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        google_review_url: formData.google_review_url.trim() || undefined,
        google_place_id: formData.google_place_id.trim() || undefined,
        address: {
          street: formData.address_line1.trim() || undefined,
          address_line2: formData.address_line2.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || undefined,
          postal_code: formData.postal_code.trim() || undefined,
          country: formData.country.trim() || 'US',
          formatted: addressParts.join(', '),
        },
        timezone: formData.timezone || 'UTC',
        settings: {
          category: formData.category,
          review_goal: Number(formData.settings.review_goal) || 10,
          monthly_review_goal: Number(formData.settings.review_goal) || 10,
          auto_reply_enabled: Boolean(formData.settings.auto_reply_enabled),
          auto_reply_template: String(formData.settings.auto_reply_template || ''),
          notification_email: formData.settings.notification_email.trim() || formData.email.trim(),
          language: formData.settings.language || 'en',
          language_default: formData.settings.language || 'en',
        },
      };

      const response = await api.post<any>('/businesses', payload);
      const createdBusiness = response?.data?.business || response?.data || response?.business;
      const businessId = createdBusiness?.id || response?.id;

      toast.success('Business created successfully!', { id: 'create-business-toast' });
      if (businessId) {
        router.push(`/dashboard/businesses/${businessId}`);
      } else {
        router.push('/dashboard/businesses');
      }
    } catch (error: any) {
      console.error('Failed to create business:', error);
      const errData = error.response?.data;
      let errorMsg = errData?.error || errData?.message;
      if (errData?.details) {
        const firstKey = Object.keys(errData.details)[0];
        if (firstKey && Array.isArray(errData.details[firstKey])) {
          errorMsg = `${errData.details[firstKey][0]}`;
        }
      }
      toast.error(
        errorMsg && errorMsg !== 'Internal server error'
          ? errorMsg
          : 'Unable to create the business. Please check the information and try again.',
        { id: 'create-business-toast' }
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/businesses">
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Add Business</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Create a new business location to start collecting reviews</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary-500" />
              Basic Information
            </CardTitle>
            <CardDescription>Enter the basic details for your business</CardDescription>
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
                placeholder="e.g., Joe's Coffee Shop"
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
                onChange={catId => setFormData(prev => ({ ...prev, category: catId }))}
              />
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                Determines default customer experience tags and authentic AI review vocabulary.
              </p>
            </div>

            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                URL Slug
              </label>
              <div className="flex items-center gap-2">
                <span className="text-secondary-500 dark:text-secondary-400">/r/</span>
                <Input
                  id="slug"
                  name="slug"
                  value={formData.slug}
                  onChange={handleChange}
                  placeholder="auto-generated-from-name"
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                This will be used in the QR code URL. Auto-generated from name if left empty.
              </p>
            </div>

            <div>
              <label htmlFor="google_review_url" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Google Review URL <span className="text-error-500">*</span>
              </label>
              <Input
                id="google_review_url"
                name="google_review_url"
                type="url"
                value={formData.google_review_url}
                onChange={handleChange}
                placeholder="https://g.page/r/XXXXXXXXXXXX/review"
                required={!formData.google_place_id}
              />
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                Your direct Google Review link (e.g. from Google Business Profile &gt; &quot;Ask for reviews&quot; or https://g.page/r/.../review).
              </p>
            </div>

            <div>
              <label htmlFor="google_place_id" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Google Place ID <span className="text-secondary-400 font-normal">(Optional)</span>
              </label>
              <Input
                id="google_place_id"
                name="google_place_id"
                value={formData.google_place_id}
                onChange={handleChange}
                placeholder="ChIJ... (optional if Google Review URL is provided)"
              />
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                Used for Places API integration. If entered, automatically helps construct your review URL. Find yours at{' '}
                <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">Google Place ID Finder</a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary-500" />
              Contact Information
            </CardTitle>
            <CardDescription>How customers can reach this business</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Email <span className="text-error-500">*</span>
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="business@example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Phone
                </label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            <div>
              <label htmlFor="notification_email" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Notification Email
              </label>
              <Input
                id="notification_email"
                name="settings.notification_email"
                type="email"
                value={formData.settings.notification_email}
                onChange={handleChange}
                placeholder="notifications@example.com"
              />
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                Where to send review notifications (defaults to business email if empty)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary-500" />
              Address
            </CardTitle>
            <CardDescription>Physical location of the business</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="address_line1" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Street Address
              </label>
              <Input
                id="address_line1"
                name="address_line1"
                value={formData.address_line1}
                onChange={handleChange}
                placeholder="123 Main Street"
              />
            </div>
            <div>
              <label htmlFor="address_line2" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Address Line 2 (Optional)
              </label>
              <Input
                id="address_line2"
                name="address_line2"
                value={formData.address_line2}
                onChange={handleChange}
                placeholder="Suite 100, Floor 2, etc."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  City
                </label>
                <Input
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  placeholder="New York"
                />
              </div>
              <div>
                <label htmlFor="state" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  State/Province
                </label>
                <Input
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="NY"
                />
              </div>
              <div>
                <label htmlFor="postal_code" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Postal Code
                </label>
                <Input
                  id="postal_code"
                  name="postal_code"
                  value={formData.postal_code}
                  onChange={handleChange}
                  placeholder="10001"
                />
              </div>
            </div>
            <div>
              <label htmlFor="country" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Country
              </label>
              <Select value={formData.country} onValueChange={(value: string) => setFormData(prev => ({ ...prev, country: value }))}>
                <SelectTrigger id="country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                  <SelectItem value="DE">Germany</SelectItem>
                  <SelectItem value="FR">France</SelectItem>
                  <SelectItem value="IN">India</SelectItem>
                  <SelectItem value="JP">Japan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary-500" />
              Settings
            </CardTitle>
            <CardDescription>Configure review collection preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Timezone
                </label>
                <Select value={formData.timezone} onValueChange={(value: string) => setFormData(prev => ({ ...prev, timezone: value }))}>
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Default Language
                </label>
                <Select value={formData.settings.language} onValueChange={(value: string) => setFormData(prev => ({ ...prev, settings: { ...prev.settings, language: value } }))}>
                  <SelectTrigger id="language">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="hinglish">Hinglish</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label htmlFor="review_goal" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Monthly Review Goal
              </label>
              <Input
                id="review_goal"
                name="settings.review_goal"
                type="number"
                value={formData.settings.review_goal}
                onChange={handleChange}
                min="1"
                max="10000"
              />
            </div>

            <div>
              <label htmlFor="auto_reply_template" className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                Auto-Reply Template
              </label>
              <Textarea
                id="auto_reply_template"
                name="settings.auto_reply_template"
                value={formData.settings.auto_reply_template}
                onChange={handleChange}
                placeholder="Thank you for your review! We appreciate your feedback."
                rows={3}
              />
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                Template for auto-replies to reviews. Use &#123;customer_name&#125;, &#123;rating&#125;, &#123;business_name&#125; as placeholders.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="auto_reply_enabled"
                name="settings.auto_reply_enabled"
                checked={formData.settings.auto_reply_enabled}
                onChange={(e) => setFormData(prev => ({ ...prev, settings: { ...prev.settings, auto_reply_enabled: e.target.checked } }))}
                className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="auto_reply_enabled" className="text-sm font-medium text-secondary-700 dark:text-secondary-300 cursor-pointer">
                Enable auto-reply to reviews
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-border">
          <Link href="/dashboard/businesses" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 border border-border bg-background hover:bg-secondary-100 dark:hover:bg-secondary-800 h-10 px-4 py-2 text-sm">
            Cancel
          </Link>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Business'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}