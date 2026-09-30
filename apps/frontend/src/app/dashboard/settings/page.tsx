'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, User, Mail, Lock, Bell, CreditCard, Trash2, CheckCircle2, AlertCircle, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-provider';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { formatDate } from '@/lib/utils';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  email_verified: boolean;
  created_at: string;
}

interface NotificationSettings {
  email_reviews: boolean;
  email_weekly_report: boolean;
  email_marketing: boolean;
  push_reviews: boolean;
  push_mentions: boolean;
}

interface SubscriptionData {
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>({
    email_reviews: true,
    email_weekly_report: true,
    email_marketing: false,
    push_reviews: true,
    push_mentions: true,
  });
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const [profileRes, notifRes, subRes] = await Promise.all([
        api.get<UserProfile>('/auth/me'),
        api.get<NotificationSettings>('/settings/notifications'),
        api.get<SubscriptionData>('/subscription'),
      ]);
      setProfile(profileRes);
      setNotifications(notifRes || notifications);
      setSubscription(subRes);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving('profile');
    try {
      await api.patch('/auth/me', {
        name: profile?.name,
      });
      await refreshUser();
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(null);
    }
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving('email');
    try {
      await api.patch('/auth/email', { email: profile?.email });
      await refreshUser();
      toast.success('Email updated! Please verify your new email address.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update email');
    } finally {
      setSaving(null);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const currentPassword = formData.get('current_password') as string;
    const newPassword = formData.get('new_password') as string;
    const confirmPassword = formData.get('confirm_password') as string;

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSaving('password');
    try {
      await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
      toast.success('Password updated successfully!');
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update password');
    } finally {
      setSaving(null);
    }
  };

  const handleNotificationUpdate = async (key: keyof NotificationSettings) => {
    const newValue = !notifications[key];
    setNotifications(prev => ({ ...prev, [key]: newValue }));
    try {
      await api.patch('/settings/notifications', { [key]: newValue });
    } catch {
      toast.error('Failed to update notification setting');
      setNotifications(prev => ({ ...prev, [key]: !newValue }));
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('File must be an image');
      return;
    }

    setSaving('avatar');
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await api.post('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      toast.success('Avatar updated!');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to upload avatar');
    } finally {
      setSaving(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
      return;
    }

    setSaving('subscription');
    try {
      await api.post('/subscription/cancel');
      toast.success('Subscription cancelled. You will retain access until the end of your billing period.');
      fetchSettings();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to cancel subscription');
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (user?.role === 'admin' || user?.email === 'thelastminuteprojectsss@gmail.com') {
      toast.error('Admin accounts are strictly protected and cannot be deleted.');
      return;
    }

    const confirmText = 'DELETE MY ACCOUNT';
    const input = prompt(`This action is irreversible. Type "${confirmText}" to confirm:`);
    if (input !== confirmText) {
      toast.error('Account deletion cancelled');
      return;
    }

    setSaving('delete');
    try {
      await api.delete('/auth/account');
      toast.success('Account deleted successfully');
      window.location.href = '/login';
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete account');
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Settings</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Manage your account and preferences</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6 pb-8">
                <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4 mb-4" />
                <div className="space-y-4">
                  <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4" />
                  <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const notificationItems = [
    { key: 'email_reviews' as keyof NotificationSettings, label: 'New review notifications', description: 'Get emailed when someone leaves a review' },
    { key: 'email_weekly_report' as keyof NotificationSettings, label: 'Weekly performance report', description: 'Receive a weekly summary of your review metrics' },
    { key: 'email_marketing' as keyof NotificationSettings, label: 'Marketing emails', description: 'Receive product updates and tips' },
    { key: 'push_reviews' as keyof NotificationSettings, label: 'Push: New reviews', description: 'Get push notifications for new reviews' },
    { key: 'push_mentions' as keyof NotificationSettings, label: 'Push: Mentions', description: 'Get push notifications when mentioned' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Settings</h1>
        <p className="text-secondary-600 dark:text-secondary-400">Manage your account and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary-500" />
                Profile Information
              </CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleProfileUpdate} className="space-y-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profile?.avatar_url || ''} alt={profile?.name || 'User'} />
                    <AvatarFallback className="text-2xl">
                      {profile?.name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-secondary-700 dark:text-secondary-300">Profile Picture</label>
                    <Button variant="outline" type="button" className="w-fit">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="sr-only"
                        id="avatar-upload"
                      />
                      <label htmlFor="avatar-upload" className="cursor-pointer">
                        <span className="flex items-center gap-2">
                          <Upload className="h-4 w-4" /> Change Avatar
                        </span>
                      </label>
                    </Button>
                    <p className="text-xs text-secondary-500">JPG, PNG up to 2MB</p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="block mb-1">Full Name</Label>
                    <Input
                      id="name"
                      name="name"
                      value={profile?.name || ''}
                      onChange={(e) => setProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="block mb-1">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={profile?.email || ''}
                      onChange={(e) => setProfile(prev => prev ? { ...prev, email: e.target.value } : null)}
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={saving === 'profile'}>
                    {saving === 'profile' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save Changes
                  </Button>
                  {profile?.email_verified ? (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                      <CheckCircle2 className="h-4 w-4" /> Email verified
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 text-sm">
                      <AlertCircle className="h-4 w-4" /> Email not verified
                    </span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary-500" />
                Change Email
              </CardTitle>
              <CardDescription>Update your email address</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailUpdate} className="space-y-4">
                <div>
                  <Label htmlFor="new-email" className="block mb-1">New Email Address</Label>
                  <Input
                    id="new-email"
                    name="email"
                    type="email"
                    value={profile?.email || ''}
                    onChange={(e) => setProfile(prev => prev ? { ...prev, email: e.target.value } : null)}
                    required
                  />
                </div>
                <Button type="submit" disabled={saving === 'email'}>
                  {saving === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Email'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary-500" />
                Change Password
              </CardTitle>
              <CardDescription>Update your password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <Label htmlFor="current_password" className="block mb-1">Current Password</Label>
                  <Input id="current_password" name="current_password" type="password" required />
                </div>
                <div>
                  <Label htmlFor="new_password" className="block mb-1">New Password</Label>
                  <Input id="new_password" name="new_password" type="password" minLength={8} required />
                  <p className="text-xs text-secondary-500 mt-1">Must be at least 8 characters</p>
                </div>
                <div>
                  <Label htmlFor="confirm_password" className="block mb-1">Confirm New Password</Label>
                  <Input id="confirm_password" name="confirm_password" type="password" required />
                </div>
                <Button type="submit" disabled={saving === 'password'}>
                  {saving === 'password' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {user?.role !== 'admin' ? (
            <Card className="border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-900/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-error-600 dark:text-error-400">
                  <Trash2 className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-secondary-900 dark:text-white">Delete Account</p>
                    <p className="text-sm text-secondary-600 dark:text-secondary-400">Permanently delete your account and all data</p>
                  </div>
                  <Button variant="destructive" onClick={handleDeleteAccount} disabled={saving === 'delete'}>
                    {saving === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Account'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border bg-secondary-900/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  Account Security
                </CardTitle>
                <CardDescription>Platform administrator account protection</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-secondary-400">
                  This account has administrator privileges. Admin accounts are permanently protected and cannot be deleted or deactivated by anyone.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary-500" />
                Notification Preferences
              </CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationItems.map((item) => (
                <div key={item.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium text-secondary-900 dark:text-white">{item.label}</p>
                    <p className="text-sm text-secondary-500 dark:text-secondary-400">{item.description}</p>
                  </div>
                  <Switch
                    checked={notifications[item.key]}
                    onCheckedChange={() => handleNotificationUpdate(item.key)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary-500" />
                Subscription
              </CardTitle>
              <CardDescription>Manage your subscription plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {subscription ? (
                <div className="space-y-4">
                  <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold text-secondary-900 dark:text-white capitalize">{subscription.plan}</p>
                        <p className="text-secondary-600 dark:text-secondary-400">
                          Status: <span className="capitalize font-medium">{subscription.status}</span>
                        </p>
                      </div>
                      {subscription.status === 'active' && (
                        <Button variant="outline" onClick={handleCancelSubscription} disabled={saving === 'subscription'}>
                          {saving === 'subscription' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel Subscription'}
                        </Button>
                      )}
                    </div>
                    {subscription.current_period_end && (
                      <p className="text-sm text-secondary-600 dark:text-secondary-400 mt-2">
                        {subscription.cancel_at_period_end
                          ? `Cancels on ${formatDate(subscription.current_period_end)}`
                          : `Renews on ${formatDate(subscription.current_period_end)}`}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium text-secondary-900 dark:text-white mb-2">Billing History</h4>
                    <p className="text-secondary-600 dark:text-secondary-400">
                      <Link href="/dashboard/billing" className="text-primary-600 hover:underline inline-flex items-center gap-2">View invoices and payment history</Link>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 text-secondary-300 dark:text-secondary-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-1">No active subscription</h3>
                  <p className="text-secondary-500 dark:text-secondary-400 mb-4">Upgrade to unlock premium features</p>
                  <Link href="/pricing" className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm h-10 px-4 py-2 text-sm">View Plans</Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { Upload } from 'lucide-react';