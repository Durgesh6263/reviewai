'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, AlertCircle, CheckCircle, X, Plus, Trash2, GripVertical, ExternalLink, Download, Printer, QrCode, MapPin, Link as LinkIcon, ImageIcon, Tag, ArrowUpDown, ChevronUp, ChevronDown, Eye, Copy, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { getQRCodeReviewUrl } from '@/lib/public-url';

interface Business {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  google_maps_link: string | null;
  google_review_url: string | null;
  google_place_id: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BusinessTag {
  id: string;
  label: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface QRCodeData {
  id: string;
  name: string;
  slug: string;
  review_ai_url: string;
  business_name: string;
  is_active: boolean;
}

export default function BusinessProfilePage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [tags, setTags] = useState<BusinessTag[]>([]);
  const [qrCode, setQRCode] = useState<QRCodeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tagSaving, setTagSaving] = useState<string | null>(null);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [editingTag, setEditingTag] = useState<BusinessTag | null>(null);
  const [tagFormData, setTagFormData] = useState({ label: '' });
  const [reordering, setReordering] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [businessRes, tagsRes, qrRes] = await Promise.all([
        api.get<{ data: Business }>('/businesses/me'),
        api.get<{ data: BusinessTag[] }>('/businesses/me/tags'),
        api.get<{ data: QRCodeData }>('/qr-codes/business/me/primary').catch(() => ({ data: null })),
      ]);
      setBusiness(businessRes.data);
      setTags(tagsRes.data);
      setQRCode(qrRes.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load business profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save business profile
  const handleSaveProfile = async (field: string, value: any) => {
    if (!business) return;
    setSaving(field);
    try {
      await api.patch('/businesses/me', { [field]: value });
      setBusiness(prev => prev ? { ...prev, [field]: value } : null);
      toast.success('Changes saved');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save');
      // Revert optimistic update
      fetchData();
    } finally {
      setSaving(null);
    }
  };

  // Tag management
  const handleAddTag = async () => {
    if (!tagFormData.label.trim()) {
      toast.error('Tag name is required');
      return;
    }
    setTagSaving('add');
    try {
      await api.post('/businesses/me/tags', { label: tagFormData.label.trim() });
      toast.success('Tag added');
      setShowTagDialog(false);
      setTagFormData({ label: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to add tag');
    } finally {
      setTagSaving(null);
    }
  };

  const handleEditTag = async (tag: BusinessTag) => {
    if (!tagFormData.label.trim()) {
      toast.error('Tag name is required');
      return;
    }
    setTagSaving(tag.id);
    try {
      await api.patch(`/businesses/me/tags/${tag.id}`, { label: tagFormData.label.trim() });
      toast.success('Tag updated');
      setShowTagDialog(false);
      setEditingTag(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update tag');
    } finally {
      setTagSaving(null);
    }
  };

  const handleToggleTag = async (tag: BusinessTag) => {
    setTagSaving(tag.id);
    try {
      await api.patch(`/businesses/me/tags/${tag.id}`, { is_active: !tag.is_active });
      toast.success(tag.is_active ? 'Tag deactivated' : 'Tag activated');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update tag');
    } finally {
      setTagSaving(null);
    }
  };

  const handleDeleteTag = async (tag: BusinessTag) => {
    if (!confirm(`Delete "${tag.label}"? This cannot be undone.`)) return;
    setTagSaving(tag.id);
    try {
      await api.delete(`/businesses/me/tags/${tag.id}`);
      toast.success('Tag removed');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete tag');
    } finally {
      setTagSaving(null);
    }
  };

  const openTagDialog = (tag?: BusinessTag) => {
    if (tag) {
      setEditingTag(tag);
      setTagFormData({ label: tag.label });
    } else {
      setEditingTag(null);
      setTagFormData({ label: '' });
    }
    setShowTagDialog(true);
  };

  // Drag and drop for reordering
  const handleDragStart = (e: React.DragEvent, tagId: string) => {
    e.dataTransfer.setData('tagId', tagId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, tagId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(tagId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetTagId: string) => {
    e.preventDefault();
    const draggedTagId = e.dataTransfer.getData('tagId');
    setDragOverId(null);

    if (draggedTagId === targetTagId) return;

    const draggedIndex = tags.findIndex(t => t.id === draggedTagId);
    const targetIndex = tags.findIndex(t => t.id === targetTagId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTags = [...tags];
    const [draggedTag] = newTags.splice(draggedIndex, 1);
    newTags.splice(targetIndex, 0, draggedTag);

    // Update display orders
    const tagOrders = newTags.map((t, i) => ({ id: t.id, display_order: i }));
    setReordering(true);
    try {
      await api.post('/businesses/me/tags/reorder', { tagOrders });
      toast.success('Tags reordered');
      fetchData();
    } catch (error: any) {
      toast.error('Failed to reorder tags');
    } finally {
      setReordering(false);
    }
  };

  // QR Code actions
  const handleDownloadQR = async () => {
    if (!qrCode) return;
    try {
      const response = await api.get<Blob>(`/qr-codes/${qrCode.id}/image`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${qrCode.business_name}-qr-code.png`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('QR code downloaded!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to download QR code');
    }
  };

  const handlePrintQR = () => {
    setShowPrintDialog(true);
  };

  const handleCopyQRUrl = async () => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode.review_ai_url);
      toast.success('QR URL copied to clipboard!');
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  // Validation helpers
  const validateGoogleReviewUrl = (url: string): boolean => {
    if (!url) return true; // Allow empty
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('google.com') ||
             parsed.hostname.includes('g.page') ||
             parsed.hostname.includes('maps.app.goo.gl');
    } catch {
      return false;
    }
  };

  const validateGoogleMapsUrl = (url: string): boolean => {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('google.com') ||
             parsed.hostname.includes('goo.gl') ||
             parsed.hostname.includes('maps.app.goo.gl');
    } catch {
      return false;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-error-500 mx-auto mb-4" />
        <p className="text-error-500">Business not found</p>
      </div>
    );
  }

  const activeTags = tags.filter(t => t.is_active);
  const inactiveTags = tags.filter(t => !t.is_active);
  const qrUrl = qrCode?.review_ai_url || getQRCodeReviewUrl(business.slug);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Business Profile</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage your business information, Google setup, tags, and QR code</p>
        </div>
      </div>

      {/* Section 1: Business Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary-500" />
            Business Information
          </CardTitle>
          <CardDescription>Basic details shown to customers on the review page</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="name">Business Name <span className="text-error-500">*</span></Label>
              <Input
                id="name"
                value={business.name}
                onChange={(e) => handleSaveProfile('name', e.target.value)}
                disabled={saving === 'name'}
                className="mt-1"
              />
              {saving === 'name' && <Loader2 className="h-4 w-4 animate-spin text-secondary-400 mt-1" />}
            </div>

            <div>
              <Label htmlFor="slug">URL Slug</Label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-secondary-500 dark:text-secondary-400 px-3 py-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg text-sm font-mono">
                  /r/
                </span>
                <Input
                  id="slug"
                  value={business.slug}
                  disabled
                  className="flex-1 bg-secondary-50 dark:bg-secondary-800"
                />
              </div>
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                Slug is stable and cannot be changed. Existing QR codes depend on it.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={business.description || ''}
              onChange={(e) => handleSaveProfile('description', e.target.value)}
              disabled={saving === 'description'}
              placeholder="Describe your business..."
              rows={3}
              className="mt-1"
            />
            {saving === 'description' && <Loader2 className="h-4 w-4 animate-spin text-secondary-400 mt-1" />}
          </div>

          <div>
            <Label htmlFor="logo_url">Logo URL</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="logo_url"
                value={business.logo_url || ''}
                onChange={(e) => handleSaveProfile('logo_url', e.target.value)}
                disabled={saving === 'logo_url'}
                placeholder="https://example.com/logo.png"
                className="flex-1"
              />
              {business.logo_url && (
                <Button variant="outline" size="icon" onClick={() => window.open(business.logo_url!, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
              PNG, JPEG, or WebP. Recommended: 200x200px minimum.
            </p>
            {saving === 'logo_url' && <Loader2 className="h-4 w-4 animate-spin text-secondary-400 mt-1" />}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={business.phone || ''}
                onChange={(e) => handleSaveProfile('phone', e.target.value)}
                disabled={saving === 'phone'}
                placeholder="+1 (555) 123-4567"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={business.website || ''}
                onChange={(e) => handleSaveProfile('website', e.target.value)}
                disabled={saving === 'website'}
                placeholder="https://example.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={business.timezone}
                onChange={(e) => handleSaveProfile('timezone', e.target.value)}
                disabled={saving === 'timezone'}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={business.address || ''}
              onChange={(e) => handleSaveProfile('address', e.target.value)}
              disabled={saving === 'address'}
              placeholder="Full street address"
              rows={2}
              className="mt-1"
            />
            {saving === 'address' && <Loader2 className="h-4 w-4 animate-spin text-secondary-400 mt-1" />}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Google Review Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary-500" />
            Google Review Setup
          </CardTitle>
          <CardDescription>
            Configure how customers are redirected to leave Google reviews.
            <br />The QR code always points to your ReviewAI page — this URL is only used for the final redirect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="google_place_id">Google Place ID <span className="text-error-500">*</span></Label>
            <Input
              id="google_place_id"
              value={business.google_place_id}
              onChange={(e) => handleSaveProfile('google_place_id', e.target.value)}
              disabled={saving === 'google_place_id'}
              placeholder="ChIJ... (required for Google redirect)"
              className="mt-1"
            />
            <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
              Find your Place ID at{' '}
              <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                Google Place ID Finder
              </a>
              . Never auto-guessed — must be entered manually.
            </p>
            {saving === 'google_place_id' && <Loader2 className="h-4 w-4 animate-spin text-secondary-400 mt-1" />}
          </div>

          <div>
            <Label htmlFor="google_maps_link">Google Maps Listing URL</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="google_maps_link"
                type="url"
                value={business.google_maps_link || ''}
                onChange={(e) => handleSaveProfile('google_maps_link', e.target.value)}
                disabled={saving === 'google_maps_link'}
                placeholder="https://maps.google.com/?cid=... or https://goo.gl/maps/..."
                className="flex-1"
              />
              {business.google_maps_link && (
                <Button variant="outline" size="icon" onClick={() => window.open(business.google_maps_link!, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className={cn('text-xs mt-1', validateGoogleMapsUrl(business.google_maps_link || '') ? 'text-secondary-500' : 'text-error-500')}>
              {business.google_maps_link && !validateGoogleMapsUrl(business.google_maps_link)
                ? '⚠ Must be a valid Google Maps URL (maps.google.com, goo.gl/maps, maps.app.goo.gl)'
                : 'Optional: Link to your Google Maps listing'}
            </p>
            {saving === 'google_maps_link' && <Loader2 className="h-4 w-4 animate-spin text-secondary-400 mt-1" />}
          </div>

          <div>
            <Label htmlFor="google_review_url">Google Review URL <span className="text-error-500">*</span></Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="google_review_url"
                type="url"
                value={business.google_review_url || ''}
                onChange={(e) => handleSaveProfile('google_review_url', e.target.value)}
                disabled={saving === 'google_review_url'}
                placeholder="https://www.google.com/search?q=Business+Name+review or https://g.page/.../review"
                className="flex-1"
              />
              {business.google_review_url && (
                <Button variant="outline" size="icon" onClick={() => window.open(business.google_review_url!, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className={cn('text-xs mt-1', validateGoogleReviewUrl(business.google_review_url || '') ? 'text-secondary-500' : 'text-error-500')}>
              {business.google_review_url && !validateGoogleReviewUrl(business.google_review_url)
                ? '⚠ Must be a valid Google Review URL (google.com, g.page, maps.app.goo.gl with review intent)'
                : 'Required: Where customers land after writing their review. Used for final redirect only.'}
            </p>
            <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
              Changing this does NOT affect your QR code. The QR always points to /r/{business.slug}.
            </p>
            {saving === 'google_review_url' && <Loader2 className="h-4 w-4 animate-spin text-secondary-400 mt-1" />}
          </div>

          {!business.google_review_url && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 inline-block mr-2" />
              <span className="text-sm text-amber-800 dark:text-amber-200">
                Google Review URL is required for the customer flow to complete. Customers will not be redirected to Google without it.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Experience Tags */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary-500" />
                Experience Tags
              </CardTitle>
              <CardDescription>
                Tags customers select to describe their experience. Minimum 6 recommended, maximum 10 active.
              </CardDescription>
            </div>
            <Button onClick={() => openTagDialog()}>
              <Plus className="h-4 w-4 mr-2" /> Add Tag
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reordering && (
            <div className="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg text-sm text-primary-700 dark:text-primary-300">
              Drag and drop to reorder tags. Changes save automatically.
            </div>
          )}

          <div className="space-y-3">
            {tags.length === 0 ? (
              <div className="text-center py-8">
                <Tag className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
                <p className="text-secondary-500 dark:text-secondary-400">No tags yet. Add your first tag to get started.</p>
              </div>
            ) : (
              <>
                {activeTags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2 flex items-center gap-2">
                      Active Tags ({activeTags.length}/10)
                      {reordering && <ArrowUpDown className="h-4 w-4 text-primary-500" />}
                    </h4>
                    <div className="space-y-2">
                      {activeTags.map((tag, index) => (
                        <div
                          key={tag.id}
                          draggable={reordering}
                          onDragStart={(e) => handleDragStart(e, tag.id)}
                          onDragOver={(e) => handleDragOver(e, tag.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, tag.id)}
                          className={cn(
                            'flex items-center gap-3 p-3 border rounded-lg transition-colors',
                            'bg-white dark:bg-secondary-800 border-border',
                            dragOverId === tag.id && 'border-primary-500 bg-primary-50 dark:bg-primary-900/20',
                            reordering && 'cursor-grab active:cursor-grabbing'
                          )}
                        >
                          {reordering && (
                            <GripVertical className="h-5 w-5 text-secondary-400 cursor-grab" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-secondary-900 dark:text-white truncate">{tag.label}</p>
                            <p className="text-xs text-secondary-500 dark:text-secondary-400">Order: {index + 1}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={tag.is_active}
                              onCheckedChange={() => handleToggleTag(tag)}
                              disabled={tagSaving === tag.id}
                              aria-label={tag.is_active ? 'Deactivate tag' : 'Activate tag'}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openTagDialog(tag)}
                              disabled={tagSaving === tag.id}
                              className="h-8 w-8"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTag(tag)}
                              disabled={tagSaving === tag.id}
                              className="h-8 w-8 text-error-600 hover:text-error-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {tagSaving === tag.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {inactiveTags.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                      Inactive Tags ({inactiveTags.length})
                    </h4>
                    <div className="space-y-2">
                      {inactiveTags.map((tag) => (
                        <div key={tag.id} className="flex items-center gap-3 p-3 border rounded-lg bg-secondary-50 dark:bg-secondary-800/50 border-border">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-secondary-900 dark:text-white truncate">{tag.label}</p>
                            <p className="text-xs text-secondary-500 dark:text-secondary-400">Inactive — not shown to customers</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={tag.is_active}
                              onCheckedChange={() => handleToggleTag(tag)}
                              disabled={tagSaving === tag.id}
                              aria-label="Activate tag"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openTagDialog(tag)}
                              disabled={tagSaving === tag.id}
                              className="h-8 w-8"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteTag(tag)}
                              disabled={tagSaving === tag.id}
                              className="h-8 w-8 text-error-600 hover:text-error-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {tagSaving === tag.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTags.length < 6 && activeTags.length > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 inline-block mr-2" />
                    <span className="text-sm text-amber-800 dark:text-amber-200">
                      Recommended minimum: 6 active tags. You have {activeTags.length}.
                    </span>
                  </div>
                )}

                {activeTags.length > 10 && (
                  <div className="p-3 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-error-500 inline-block mr-2" />
                    <span className="text-sm text-error-700 dark:text-error-300">
                      Maximum 10 active tags allowed. You have {activeTags.length}. Deactivate some tags.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 4: ReviewAI QR */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary-500" />
            ReviewAI QR Code
          </CardTitle>
          <CardDescription>
            Your primary QR code. Customers scan this to start the review flow.
            The QR encodes only your ReviewAI URL — never the Google Review URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {qrCode ? (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center gap-6 p-4 border rounded-lg">
                <div className="flex-shrink-0">
                  <div className="h-48 w-48 border rounded-lg p-4 bg-white dark:bg-secondary-900 flex items-center justify-center">
                    <img
                      src={`/api/qr-codes/${qrCode.id}/preview`}
                      alt={`${qrCode.business_name} QR Code`}
                      className="max-h-full max-w-full"
                    />
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <Label className="text-xs font-medium text-secondary-500 dark:text-secondary-400">QR Code URL</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={qrUrl}
                        readOnly
                        className="flex-1 bg-secondary-50 dark:bg-secondary-800 font-mono text-sm"
                      />
                      <Button variant="outline" size="sm" onClick={handleCopyQRUrl}>
                        <Copy className="h-4 w-4 mr-1" /> Copy
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Business Name</Label>
                    <p className="font-medium text-secondary-900 dark:text-white">{qrCode.business_name}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-secondary-500 dark:text-secondary-400">Status</Label>
                    <Badge variant={qrCode.is_active ? 'default' : 'secondary'}>
                      {qrCode.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleDownloadQR}>
                  <Download className="h-4 w-4 mr-2" /> Download PNG
                </Button>
                <Button variant="outline" onClick={handlePrintQR}>
                  <Printer className="h-4 w-4 mr-2" /> Print QR
                </Button>
                <a href={qrUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 border border-border bg-background hover:bg-secondary-100 dark:hover:bg-secondary-800 h-10 px-4 py-2 text-sm">
                    <ExternalLink className="h-4 w-4 mr-2" /> Test QR Flow
                  </a>
              </div>

              <div className="p-3 bg-secondary-50 dark:bg-secondary-800/50 border border-border rounded-lg">
                <p className="text-sm text-secondary-600 dark:text-secondary-400">
                  <strong>Important:</strong> This QR code points to <code className="bg-secondary-200 dark:bg-secondary-700 px-1.5 py-0.5 rounded text-xs font-mono">{qrUrl}</code>.
                  Changing your Google Review URL or business name will NOT change this QR code.
                  Existing printed QR codes will continue to work.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <QrCode className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No QR Code Found</h3>
              <p className="text-secondary-500 dark:text-secondary-400 mb-4">
                Create a QR code to start collecting reviews.
              </p>
              <a href="/dashboard/qr-codes/new" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm h-10 px-4 py-2 text-sm">
                Create QR Code
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tag Dialog */}
      <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTag ? 'Edit Tag' : 'Add Tag'}</DialogTitle>
            <DialogDescription>
              {editingTag
                ? 'Update the tag label. Historical selections preserve the original label.'
                : 'Create a new experience tag for customers to select.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="tag_label">Tag Name</Label>
              <Input
                id="tag_label"
                value={tagFormData.label}
                onChange={(e) => setTagFormData({ label: e.target.value.trim() })}
                placeholder="e.g., Staff behavior, Cleanliness, Value for money"
                maxLength={100}
                autoFocus
                disabled={!!tagSaving}
              />
              <p className="text-xs text-secondary-500 dark:text-secondary-500 mt-1">
                {tagFormData.label.length}/100 characters. Duplicates prevented.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTagDialog(false); setEditingTag(null); setTagFormData({ label: '' }); }} disabled={!!tagSaving}>
              Cancel
            </Button>
            <Button onClick={editingTag ? () => handleEditTag(editingTag) : handleAddTag} disabled={!!tagSaving || !tagFormData.label.trim()}>
              {tagSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingTag ? 'Save Changes' : 'Add Tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Print QR Code</DialogTitle>
            <DialogDescription>Print-ready version with business name and instructions</DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center" id="print-content">
            <div className="inline-block p-4 bg-white dark:bg-secondary-900 rounded-lg border">
              <img
                src={`/api/qr-codes/${qrCode?.id}/preview`}
                alt={`${business.name} QR Code`}
                className="h-64 w-64"
              />
            </div>
            <div className="mt-4 space-y-1">
              <h3 className="text-xl font-bold text-secondary-900 dark:text-white">{business.name}</h3>
              <p className="text-secondary-600 dark:text-secondary-400">Scan to share your experience</p>
              <p className="text-xs text-secondary-500 dark:text-secondary-500 font-mono">{qrUrl}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              const printContent = document.getElementById('print-content');
              if (printContent) {
                const printWindow = window.open('', '_blank');
                printWindow!.document.write(`
                  <html><head><title>Print QR - ${business.name}</title>
                  <style>
                    body { font-family: system-ui; text-align: center; padding: 20px; }
                    img { max-width: 100%; height: auto; }
                    h3 { margin: 16px 0 4px; }
                    p { margin: 4px 0; }
                    .url { font-family: monospace; font-size: 12px; color: #666; }
                    @media print { button { display: none; } }
                  </style>
                  </head><body>
                  ${printContent.innerHTML}
                  <script>window.onload = () => window.print();</script>
                  </body></html>
                `);
                printWindow!.document.close();
              }
            }}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}