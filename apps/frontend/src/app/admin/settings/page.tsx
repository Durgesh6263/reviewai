'use client';

import { useState, useEffect } from 'react';
import { Save, Loader2, Shield, Mail, Bell, Globe, Database, Key, Users, CreditCard, Zap, Trash2, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface AdminSettings {
  general: {
    site_name: string;
    site_url: string;
    support_email: string;
    default_language: string;
    maintenance_mode: boolean;
    registration_enabled: boolean;
    email_verification_required: boolean;
  };
  email: {
    provider: string;
    from_name: string;
    from_email: string;
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_password: string;
    templates: {
      welcome: string;
      verification: string;
      password_reset: string;
      review_generated: string;
      subscription_created: string;
      subscription_canceled: string;
    };
  };
  security: {
    jwt_secret: string;
    jwt_expiry: string;
    refresh_token_expiry: string;
    password_min_length: number;
    require_2fa_for_admins: boolean;
    session_timeout: number;
    max_login_attempts: number;
    lockout_duration: number;
    cors_origins: string[];
  };
  integrations: {
    openai_api_key: string;
    gemini_api_key: string;
    google_places_api_key: string;
    stripe_secret_key: string;
    stripe_publishable_key: string;
    stripe_webhook_secret: string;
    sentry_dsn: string;
    slack_webhook_url: string;
  };
  features: {
    ai_reviews_enabled: boolean;
    qr_customization_enabled: boolean;
    multi_language_enabled: boolean;
    webhooks_enabled: boolean;
    white_label_domains_enabled: boolean;
    api_access_enabled: boolean;
    advanced_analytics_enabled: boolean;
    team_collaboration_enabled: boolean;
  };
  limits: {
    max_businesses_per_user: number;
    max_qr_codes_per_business: number;
    max_scans_per_month_free: number;
    max_scans_per_month_starter: number;
    max_scans_per_month_professional: number;
    max_scans_per_month_enterprise: number;
    ai_reviews_per_month_free: number;
    ai_reviews_per_month_starter: number;
    ai_reviews_per_month_professional: number;
    ai_reviews_per_month_enterprise: number;
    file_upload_max_size: number;
  };
}

interface SettingsTab {
  id: keyof AdminSettings;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const tabs: SettingsTab[] = [
  { id: 'general', label: 'General', icon: <Globe className="h-4 w-4" />, description: 'Basic site configuration' },
  { id: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, description: 'Email provider and templates' },
  { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" />, description: 'Authentication and security settings' },
  { id: 'integrations', label: 'Integrations', icon: <Zap className="h-4 w-4" />, description: 'Third-party service connections' },
  { id: 'features', label: 'Features', icon: <Users className="h-4 w-4" />, description: 'Feature flags and toggles' },
  { id: 'limits', label: 'Limits', icon: <Database className="h-4 w-4" />, description: 'Usage limits and quotas' },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingTab, setSavingTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<keyof AdminSettings>('general');

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<{ data: AdminSettings }>('/admin/settings');
      setSettings(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (tab: keyof AdminSettings, data: Partial<AdminSettings[keyof AdminSettings]>) => {
    setSavingTab(tab);
    try {
      await api.patch(`/admin/settings/${tab}`, data);
      setSettings(prev => prev ? { ...prev, [tab]: { ...prev[tab], ...data } } : null);
      toast.success(`${tabs.find(t => t.id === tab)?.label} settings saved`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSavingTab(null);
    }
  };

  const handleInputChange = (tab: keyof AdminSettings, field: string, value: any) => {
    setSettings(prev => prev ? {
      ...prev,
      [tab]: {
        ...prev[tab],
        [field]: value
      }
    } : null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Admin Settings</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Configure system-wide settings</p>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4 mb-4" />
                <div className="h-8 bg-secondary-200 dark:bg-secondary-700 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-12">
        <p className="text-error-500">Failed to load settings</p>
        <Button onClick={fetchSettings} className="mt-4">Retry</Button>
      </div>
    );
  }

  const renderGeneralTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Site Configuration</CardTitle>
          <CardDescription>Basic settings for your ReviewAI instance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="site_name">Site Name</Label>
              <Input
                id="site_name"
                value={settings.general.site_name}
                onChange={(e) => handleInputChange('general', 'site_name', e.target.value)}
                placeholder="ReviewAI"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site_url">Site URL</Label>
              <Input
                id="site_url"
                type="url"
                value={settings.general.site_url}
                onChange={(e) => handleInputChange('general', 'site_url', e.target.value)}
                placeholder="https://reviewai.example.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="support_email">Support Email</Label>
            <Input
              id="support_email"
              type="email"
              value={settings.general.support_email}
              onChange={(e) => handleInputChange('general', 'support_email', e.target.value)}
              placeholder="support@reviewai.example.com"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default_language">Default Language</Label>
              <Select
                value={settings.general.default_language}
                onValueChange={(v: string) => handleInputChange('general', 'default_language', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi', 'cs'].map((lang) => (
                    <SelectItem key={lang} value={lang}>{lang.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Settings</CardTitle>
          <CardDescription>Control platform-wide behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Maintenance Mode</Label>
              <p className="text-sm text-secondary-500">Disable access for non-admin users</p>
            </div>
            <Switch
              checked={settings.general.maintenance_mode}
              onCheckedChange={(checked: boolean) => handleInputChange('general', 'maintenance_mode', checked)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Registration Enabled</Label>
              <p className="text-sm text-secondary-500">Allow new users to register</p>
            </div>
            <Switch
              checked={settings.general.registration_enabled}
              onCheckedChange={(checked: boolean) => handleInputChange('general', 'registration_enabled', checked)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Email Verification Required</Label>
              <p className="text-sm text-secondary-500">Require email verification before login</p>
            </div>
            <Switch
              checked={settings.general.email_verification_required}
              onCheckedChange={(checked: boolean) => handleInputChange('general', 'email_verification_required', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => handleSave('general', settings.general)}
          disabled={savingTab === 'general'}
        >
          {savingTab === 'general' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save General Settings
        </Button>
      </div>
    </div>
  );

  const renderEmailTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Provider</CardTitle>
          <CardDescription>Configure SMTP settings for transactional emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email_provider">Provider</Label>
              <Select
                value={settings.email.provider}
                onValueChange={(v: string) => handleInputChange('email', 'provider', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smtp">SMTP</SelectItem>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="mailgun">Mailgun</SelectItem>
                  <SelectItem value="postmark">Postmark</SelectItem>
                  <SelectItem value="ses">Amazon SES</SelectItem>
                  <SelectItem value="resend">Resend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from_name">From Name</Label>
              <Input
                id="from_name"
                value={settings.email.from_name}
                onChange={(e) => handleInputChange('email', 'from_name', e.target.value)}
                placeholder="ReviewAI"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="from_email">From Email</Label>
              <Input
                id="from_email"
                type="email"
                value={settings.email.from_email}
                onChange={(e) => handleInputChange('email', 'from_email', e.target.value)}
                placeholder="noreply@reviewai.example.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input
                id="smtp_host"
                value={settings.email.smtp_host}
                onChange={(e) => handleInputChange('email', 'smtp_host', e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">SMTP Port</Label>
              <Input
                id="smtp_port"
                type="number"
                value={settings.email.smtp_port}
                onChange={(e) => handleInputChange('email', 'smtp_port', parseInt(e.target.value))}
                placeholder="587"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_user">SMTP Username</Label>
              <Input
                id="smtp_user"
                value={settings.email.smtp_user}
                onChange={(e) => handleInputChange('email', 'smtp_user', e.target.value)}
                placeholder="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_password">SMTP Password</Label>
              <Input
                id="smtp_password"
                type="password"
                value={settings.email.smtp_password}
                onChange={(e) => handleInputChange('email', 'smtp_password', e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Templates</CardTitle>
          <CardDescription>Customize email templates (use &#123;&#123;variable&#125;&#125; for dynamic content)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(settings.email.templates).map(([key, template]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`template_${key}`}>{key.charAt(0).toUpperCase() + key.slice(1)} Template</Label>
              <Textarea
                id={`template_${key}`}
                value={template}
                onChange={(e) => {
                  const newTemplates = { ...settings.email.templates, [key]: e.target.value };
                  handleInputChange('email', 'templates', newTemplates);
                }}
                rows={3}
                placeholder={`Template for ${key} emails...`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => handleSave('email', settings.email)}
          disabled={savingTab === 'email'}
        >
          {savingTab === 'email' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Email Settings
        </Button>
      </div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>JWT Configuration</CardTitle>
          <CardDescription>JSON Web Token settings for authentication</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="jwt_secret">JWT Secret</Label>
            <Input
              id="jwt_secret"
              type="password"
              value={settings.security.jwt_secret}
              onChange={(e) => handleInputChange('security', 'jwt_secret', e.target.value)}
              placeholder="••••••••••••••••"
            />
            <p className="text-sm text-secondary-500">Must be at least 32 characters. Changing this will invalidate all existing sessions.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jwt_expiry">Access Token Expiry</Label>
              <Select
                value={settings.security.jwt_expiry}
                onValueChange={(v: string) => handleInputChange('security', 'jwt_expiry', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">15 minutes</SelectItem>
                  <SelectItem value="30m">30 minutes</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="2h">2 hours</SelectItem>
                  <SelectItem value="4h">4 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refresh_token_expiry">Refresh Token Expiry</Label>
              <Select
                value={settings.security.refresh_token_expiry}
                onValueChange={(v: string) => handleInputChange('security', 'refresh_token_expiry', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="14d">14 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="60d">60 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password Policy</CardTitle>
          <CardDescription>Configure password requirements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password_min_length">Minimum Length</Label>
              <Input
                id="password_min_length"
                type="number"
                value={settings.security.password_min_length}
                onChange={(e) => handleInputChange('security', 'password_min_length', parseInt(e.target.value))}
                min={8}
                max={128}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session & Login Security</CardTitle>
          <CardDescription>Control session behavior and brute-force protection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="session_timeout">Session Timeout (minutes)</Label>
              <Input
                id="session_timeout"
                type="number"
                value={settings.security.session_timeout}
                onChange={(e) => handleInputChange('security', 'session_timeout', parseInt(e.target.value))}
                min={5}
                max={1440}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_login_attempts">Max Login Attempts</Label>
              <Input
                id="max_login_attempts"
                type="number"
                value={settings.security.max_login_attempts}
                onChange={(e) => handleInputChange('security', 'max_login_attempts', parseInt(e.target.value))}
                min={3}
                max={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lockout_duration">Lockout Duration (minutes)</Label>
              <Input
                id="lockout_duration"
                type="number"
                value={settings.security.lockout_duration}
                onChange={(e) => handleInputChange('security', 'lockout_duration', parseInt(e.target.value))}
                min={5}
                max={1440}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Require 2FA for Admins</Label>
              <p className="text-sm text-secondary-500">Enforce two-factor authentication for admin users</p>
            </div>
            <Switch
              checked={settings.security.require_2fa_for_admins}
              onCheckedChange={(checked: boolean) => handleInputChange('security', 'require_2fa_for_admins', checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CORS Origins</CardTitle>
          <CardDescription>Allowed origins for cross-origin requests (one per line)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={settings.security.cors_origins.join('\n')}
            onChange={(e) => handleInputChange('security', 'cors_origins', e.target.value.split('\n').filter(Boolean))}
            rows={5}
            placeholder="https://app.example.com
https://admin.example.com"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => handleSave('security', settings.security)}
          disabled={savingTab === 'security'}
        >
          {savingTab === 'security' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Security Settings
        </Button>
      </div>
    </div>
  );

  const renderIntegrationsTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Providers</CardTitle>
          <CardDescription>API keys for AI-powered review generation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai_api_key">OpenAI API Key</Label>
            <Input
              id="openai_api_key"
              type="password"
              value={settings.integrations.openai_api_key}
              onChange={(e) => handleInputChange('integrations', 'openai_api_key', e.target.value)}
              placeholder="sk-••••••••••••••••"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gemini_api_key">Google Gemini API Key</Label>
            <Input
              id="gemini_api_key"
              type="password"
              value={settings.integrations.gemini_api_key}
              onChange={(e) => handleInputChange('integrations', 'gemini_api_key', e.target.value)}
              placeholder="••••••••••••••••"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Places</CardTitle>
          <CardDescription>API key for business address autocomplete</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="google_places_api_key">Google Places API Key</Label>
            <Input
              id="google_places_api_key"
              type="password"
              value={settings.integrations.google_places_api_key}
              onChange={(e) => handleInputChange('integrations', 'google_places_api_key', e.target.value)}
              placeholder="••••••••••••••••"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stripe</CardTitle>
          <CardDescription>Payment processing configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stripe_secret_key">Secret Key</Label>
              <Input
                id="stripe_secret_key"
                type="password"
                value={settings.integrations.stripe_secret_key}
                onChange={(e) => handleInputChange('integrations', 'stripe_secret_key', e.target.value)}
                placeholder="sk_••••••••••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stripe_publishable_key">Publishable Key</Label>
              <Input
                id="stripe_publishable_key"
                type="password"
                value={settings.integrations.stripe_publishable_key}
                onChange={(e) => handleInputChange('integrations', 'stripe_publishable_key', e.target.value)}
                placeholder="pk_••••••••••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stripe_webhook_secret">Webhook Secret</Label>
              <Input
                id="stripe_webhook_secret"
                type="password"
                value={settings.integrations.stripe_webhook_secret}
                onChange={(e) => handleInputChange('integrations', 'stripe_webhook_secret', e.target.value)}
                placeholder="whsec_••••••••••••••••"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monitoring & Notifications</CardTitle>
          <CardDescription>External service integrations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sentry_dsn">Sentry DSN</Label>
              <Input
                id="sentry_dsn"
                type="password"
                value={settings.integrations.sentry_dsn}
                onChange={(e) => handleInputChange('integrations', 'sentry_dsn', e.target.value)}
                placeholder="https://••••@sentry.io/••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack_webhook_url">Slack Webhook URL</Label>
              <Input
                id="slack_webhook_url"
                type="password"
                value={settings.integrations.slack_webhook_url}
                onChange={(e) => handleInputChange('integrations', 'slack_webhook_url', e.target.value)}
                placeholder="https://hooks.slack.com/services/••••"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => handleSave('integrations', settings.integrations)}
          disabled={savingTab === 'integrations'}
        >
          {savingTab === 'integrations' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Integration Settings
        </Button>
      </div>
    </div>
  );

  const renderFeaturesTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>Enable or disable platform features globally</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(settings.features).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div className="space-y-1">
                <Label className="text-base font-medium">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Label>
                <p className="text-sm text-secondary-500">
                  {({
                    ai_reviews_enabled: 'AI-powered review generation',
                    qr_customization_enabled: 'Custom QR code designs',
                    multi_language_enabled: 'Multiple language support',
                    webhooks_enabled: 'Real-time webhook notifications',
                    white_label_domains_enabled: 'Custom domains (Enterprise)',
                    api_access_enabled: 'Public API access (Enterprise)',
                    advanced_analytics_enabled: 'Advanced analytics & reports',
                    team_collaboration_enabled: 'Team management features',
                  }[key])}
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(checked: boolean) => handleInputChange('features', key, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => handleSave('features', settings.features)}
          disabled={savingTab === 'features'}
        >
          {savingTab === 'features' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Feature Settings
        </Button>
      </div>
    </div>
  );

  const renderLimitsTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Per-User Limits</CardTitle>
          <CardDescription>Maximum resources per user</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_businesses_per_user">Max Businesses per User</Label>
              <Input
                id="max_businesses_per_user"
                type="number"
                value={settings.limits.max_businesses_per_user}
                onChange={(e) => handleInputChange('limits', 'max_businesses_per_user', parseInt(e.target.value))}
                min={1}
                max={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_qr_codes_per_business">Max QR Codes per Business</Label>
              <Input
                id="max_qr_codes_per_business"
                type="number"
                value={settings.limits.max_qr_codes_per_business}
                onChange={(e) => handleInputChange('limits', 'max_qr_codes_per_business', parseInt(e.target.value))}
                min={1}
                max={1000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file_upload_max_size">Max File Upload Size (MB)</Label>
              <Input
                id="file_upload_max_size"
                type="number"
                value={settings.limits.file_upload_max_size}
                onChange={(e) => handleInputChange('limits', 'file_upload_max_size', parseInt(e.target.value))}
                min={1}
                max={100}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Scan Limits by Plan</CardTitle>
          <CardDescription>Maximum QR code scans per month per plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_scans_per_month_free">Free Plan</Label>
              <Input
                id="max_scans_per_month_free"
                type="number"
                value={settings.limits.max_scans_per_month_free}
                onChange={(e) => handleInputChange('limits', 'max_scans_per_month_free', parseInt(e.target.value))}
                min={0}
                max={100000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_scans_per_month_starter">Starter Plan</Label>
              <Input
                id="max_scans_per_month_starter"
                type="number"
                value={settings.limits.max_scans_per_month_starter}
                onChange={(e) => handleInputChange('limits', 'max_scans_per_month_starter', parseInt(e.target.value))}
                min={0}
                max={100000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_scans_per_month_professional">Professional Plan</Label>
              <Input
                id="max_scans_per_month_professional"
                type="number"
                value={settings.limits.max_scans_per_month_professional}
                onChange={(e) => handleInputChange('limits', 'max_scans_per_month_professional', parseInt(e.target.value))}
                min={0}
                max={1000000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_scans_per_month_enterprise">Enterprise Plan</Label>
              <Input
                id="max_scans_per_month_enterprise"
                type="number"
                value={settings.limits.max_scans_per_month_enterprise}
                onChange={(e) => handleInputChange('limits', 'max_scans_per_month_enterprise', parseInt(e.target.value))}
                min={0}
                max={10000000}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly AI Review Limits by Plan</CardTitle>
          <CardDescription>Maximum AI-generated reviews per month per plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ai_reviews_per_month_free">Free Plan</Label>
              <Input
                id="ai_reviews_per_month_free"
                type="number"
                value={settings.limits.ai_reviews_per_month_free}
                onChange={(e) => handleInputChange('limits', 'ai_reviews_per_month_free', parseInt(e.target.value))}
                min={0}
                max={1000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai_reviews_per_month_starter">Starter Plan</Label>
              <Input
                id="ai_reviews_per_month_starter"
                type="number"
                value={settings.limits.ai_reviews_per_month_starter}
                onChange={(e) => handleInputChange('limits', 'ai_reviews_per_month_starter', parseInt(e.target.value))}
                min={0}
                max={10000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai_reviews_per_month_professional">Professional Plan</Label>
              <Input
                id="ai_reviews_per_month_professional"
                type="number"
                value={settings.limits.ai_reviews_per_month_professional}
                onChange={(e) => handleInputChange('limits', 'ai_reviews_per_month_professional', parseInt(e.target.value))}
                min={0}
                max={100000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai_reviews_per_month_enterprise">Enterprise Plan</Label>
              <Input
                id="ai_reviews_per_month_enterprise"
                type="number"
                value={settings.limits.ai_reviews_per_month_enterprise}
                onChange={(e) => handleInputChange('limits', 'ai_reviews_per_month_enterprise', parseInt(e.target.value))}
                min={0}
                max={1000000}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => handleSave('limits', settings.limits)}
          disabled={savingTab === 'limits'}
        >
          {savingTab === 'limits' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Limit Settings
        </Button>
      </div>
    </div>
  );

  const renderTab = (tabId: keyof AdminSettings) => {
    switch (tabId) {
      case 'general':
        return renderGeneralTab();
      case 'email':
        return renderEmailTab();
      case 'security':
        return renderSecurityTab();
      case 'integrations':
        return renderIntegrationsTab();
      case 'features':
        return renderFeaturesTab();
      case 'limits':
        return renderLimitsTab();
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Admin Settings</h1>
        <p className="text-secondary-600 dark:text-secondary-400">Configure system-wide settings</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as keyof AdminSettings)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-2 px-3 py-2.5 text-sm">
              {tab.icon}
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="space-y-4">
            <div className="text-sm text-secondary-500 mb-4">{tab.description}</div>
            {renderTab(tab.id)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}