'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, ChevronRight, ChevronLeft, X, Sparkles, BarChart3, QrCode, Users, Settings, HelpCircle, ArrowRight, Monitor, Smartphone, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api-client';
import type { OnboardingStepData } from '@/lib/onboarding-types';

interface DashboardTourStepProps {
  stepData: { completed_tour?: boolean; current_tour_step?: number } | undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
}

const TOUR_STEPS = [
  {
    id: 'overview',
    title: 'Dashboard Overview',
    description: 'Your command center for review analytics, QR code management, and team collaboration.',
    icon: BarChart3,
    highlight: 'overview-section',
  },
  {
    id: 'qr-codes',
    title: 'QR Codes',
    description: 'Create, customize, and manage QR codes for different locations or campaigns.',
    icon: QrCode,
    highlight: 'qr-codes-section',
  },
  {
    id: 'analytics',
    title: 'Analytics & Insights',
    description: 'Track scan rates, review conversion, sentiment trends, and team performance.',
    icon: BarChart3,
    highlight: 'analytics-section',
  },
  {
    id: 'team',
    title: 'Team Management',
    description: 'Invite staff, assign roles, and manage permissions for collaborative review management.',
    icon: Users,
    highlight: 'team-section',
  },
  {
    id: 'settings',
    title: 'Settings & Integrations',
    description: 'Configure business details, notifications, webhooks, and third-party integrations.',
    icon: Settings,
    highlight: 'settings-section',
  },
];

export function DashboardTourStep({ stepData, onDataChange, isSaving }: DashboardTourStepProps) {
  const [currentTourStep, setCurrentTourStep] = useState(stepData?.current_tour_step || 0);
  const [tourCompleted, setTourCompleted] = useState(stepData?.completed_tour || false);
  const [showTooltip, setShowTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const tourStep = TOUR_STEPS[currentTourStep];
  const tourProgress = ((currentTourStep + 1) / TOUR_STEPS.length) * 100;
  const isLastTourStep = currentTourStep === TOUR_STEPS.length - 1;

  useEffect(() => {
    onDataChange('dashboard_tour', { completed_tour: tourCompleted, current_tour_step: currentTourStep });
  }, [currentTourStep, tourCompleted, onDataChange]);

  const handleNext = () => {
    if (isLastTourStep) {
      completeTour();
    } else {
      setCurrentTourStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentTourStep > 0) {
      setCurrentTourStep(prev => prev - 1);
    }
  };

  const completeTour = () => {
    setTourCompleted(true);
    onDataChange('dashboard_tour', { completed_tour: true, current_tour_step: currentTourStep });
  };

  const skipTour = () => {
    completeTour();
  };

  const showFeatureTooltip = (feature: { title: string; description: string }, index: number) => {
    // This is a simplified tooltip - in a real app you'd use a proper tooltip library
    setShowTooltip({ text: `${feature.title}: ${feature.description}`, x: 100 + index * 200, y: 200 });
    setTimeout(() => setShowTooltip(null), 3000);
  };

  const IconComponent = tourStep?.icon || Sparkles;

  return (
    <div className="space-y-6">
      {/* Tour Progress */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium text-secondary-900 dark:text-white">
            Dashboard Tour
          </h3>
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            Step {currentTourStep + 1} of {TOUR_STEPS.length}
          </p>
        </div>
        <Badge variant={tourCompleted ? 'success' : 'secondary'}>
          {tourCompleted ? 'Completed' : 'In Progress'}
        </Badge>
      </div>

      <Progress value={tourProgress} className="h-2 mb-6" />

      {/* Tour Content */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center">
              <IconComponent className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <CardTitle className="text-lg">{tourStep?.title}</CardTitle>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">
                {tourStep?.description}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-6">
            {/* Interactive Demo Area */}
            <div className="relative">
              <div className="bg-secondary-50 dark:bg-secondary-800 rounded-lg border border-secondary-200 dark:border-secondary-700 p-6 min-h-[300px]">
                {currentTourStep === 0 && <OverviewDemo />}
                {currentTourStep === 1 && <QRCodesDemo />}
                {currentTourStep === 2 && <AnalyticsDemo />}
                {currentTourStep === 3 && <TeamDemo />}
                {currentTourStep === 4 && <SettingsDemo />}
              </div>

              {/* Hotspot indicators */}
              {!tourCompleted && (
                <div className="absolute inset-0 pointer-events-none">
                  {getHotspots(currentTourStep).map((hotspot, index) => (
                    <div
                      key={hotspot.id}
                      className="absolute"
                      style={{ top: hotspot.top, left: hotspot.left }}
                    >
                      <div
                        className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center animate-pulse shadow-lg"
                        style={{ boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.3)' }}
                      >
                        <span className="text-white text-xs font-bold">{index + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Key Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {getFeatures(currentTourStep).map((feature, index) => (
                <Card key={feature.id} className="border-secondary-200 dark:border-secondary-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
                  onClick={() => showFeatureTooltip(feature, index)}
                >
                  <CardContent className="p-4 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center">
                      <feature.icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <h4 className="font-medium text-secondary-900 dark:text-white mb-1">{feature.title}</h4>
                    <p className="text-sm text-secondary-600 dark:text-secondary-400">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pro Tips */}
            <Card className="border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary-600" />
                  Pro Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {getProTips(currentTourStep).map((tip, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm text-primary-700 dark:text-primary-300">
                    <span className="flex-shrink-0 mt-0.5">→</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentTourStep === 0 || isSaving}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={skipTour}
            disabled={isSaving}
          >
            Skip Tour
          </Button>

          <Button
            onClick={handleNext}
            disabled={isSaving}
            className="w-36"
          >
            {isLastTourStep && !tourCompleted ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete
              </>
            ) : tourCompleted ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Done
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>

      {tourCompleted && (
        <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
          <span className="text-success-700 dark:text-success-300">
            Tour completed! You&apos;re ready to start collecting reviews.
          </span>
        </div>
      )}

      {/* Tooltip for features */}
      {showTooltip && (
        <div
          className="fixed z-50 bg-secondary-900 dark:bg-secondary-100 text-white dark:text-secondary-900 px-4 py-3 rounded-lg shadow-lg max-w-xs pointer-events-none animate-fade-in"
          style={{ top: showTooltip.y, left: showTooltip.x }}
        >
          <p className="text-sm">{showTooltip.text}</p>
        </div>
      )}
    </div>
  );
}

// Demo components for each tour step
function OverviewDemo() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {['Total Scans', 'Reviews Generated', 'Conversion Rate', 'Avg Rating'].map((stat, i) => (
          <div key={stat} className="bg-white dark:bg-secondary-900 p-4 rounded-lg border border-secondary-200 dark:border-secondary-700">
            <p className="text-sm text-secondary-500">{stat}</p>
            <p className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">{['1,234', '89', '7.2%', '4.8'][i]}</p>
            <p className="text-xs text-success-500 mt-1">+12% vs last month</p>
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-secondary-900 p-4 rounded-lg border border-secondary-200 dark:border-secondary-700">
        <p className="text-sm text-secondary-500 mb-2">Recent Activity</p>
        <div className="space-y-2">
          {['New 5-star review from Sarah M.', 'QR code scanned at Main Entrance', 'Team member John added'].map((activity, i) => (
            <div key={i} className="flex items-center gap-3 p-2 bg-secondary-50 dark:bg-secondary-800 rounded">
              <div className="w-2 h-2 bg-primary-500 rounded-full" />
              <span className="text-sm text-secondary-700 dark:text-secondary-300">{activity}</span>
              <span className="ml-auto text-xs text-secondary-400">{['2 min ago', '15 min ago', '1 hour ago'][i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QRCodesDemo() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-secondary-900 dark:text-white">Your QR Codes</h4>
        <Button size="sm"><span className="h-4 w-4 mr-1">+</span> Create New</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['Main Entrance', 'Table Tents', 'Receipt Stickers', 'Window Display'].map((name, i) => (
          <div key={name} className="bg-white dark:bg-secondary-900 p-4 rounded-lg border border-secondary-200 dark:border-secondary-700 flex items-center gap-4">
            <div className="w-16 h-16 bg-secondary-100 dark:bg-secondary-800 rounded-lg flex items-center justify-center">
              <QrCode className="h-8 w-8 text-secondary-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-secondary-900 dark:text-white">{name}</p>
              <p className="text-sm text-secondary-500">{['1,234 scans', '567 scans', '234 scans', '89 scans'][i]}</p>
            </div>
            <Badge variant={['success', 'success', 'warning', 'secondary'][i] as 'success' | 'warning' | 'secondary'}>{['Active', 'Active', 'Low', 'Paused'][i]}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsDemo() {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-secondary-900 p-4 rounded-lg border border-secondary-200 dark:border-secondary-700">
        <p className="text-sm text-secondary-500 mb-3">Scan Trends (Last 30 Days)</p>
        <div className="h-48 bg-secondary-100 dark:bg-secondary-800 rounded flex items-center justify-center">
          <BarChart3 className="h-12 w-12 text-secondary-300" />
        </div>
        <p className="text-xs text-secondary-400 mt-2 text-center">Chart would render here with Recharts</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {['Peak Hours', 'Device Types', 'Location Comparison', 'Sentiment Trend'].map((metric, i) => (
          <div key={metric} className="bg-white dark:bg-secondary-900 p-4 rounded-lg border border-secondary-200 dark:border-secondary-700 text-center">
            <p className="text-sm text-secondary-500">{metric}</p>
            <p className="text-xl font-bold text-secondary-900 dark:text-white mt-1">{['2-4 PM', 'Mobile 78%', 'Entrance #1', 'Positive 85%'][i]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamDemo() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-secondary-900 dark:text-white">Team Members</h4>
        <Button size="sm" variant="outline">Invite</Button>
      </div>
      <div className="space-y-2">
        {[
          { name: 'You (Owner)', role: 'Admin', status: 'Active', avatar: 'JD' },
          { name: 'Sarah Chen', role: 'Manager', status: 'Active', avatar: 'SC' },
          { name: 'Mike Johnson', role: 'Staff', status: 'Pending', avatar: 'MJ' },
        ].map((member, i) => (
          <div key={member.name} className="bg-white dark:bg-secondary-900 p-4 rounded-lg border border-secondary-200 dark:border-secondary-700 flex items-center gap-4">
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 dark:text-primary-400 font-medium">
              {member.avatar}
            </div>
            <div className="flex-1">
              <p className="font-medium text-secondary-900 dark:text-white">{member.name}</p>
              <p className="text-sm text-secondary-500">{member.role}</p>
            </div>
            <Badge variant={member.status === 'Active' ? 'success' : 'warning'}>{member.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsDemo() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { title: 'Business Profile', desc: 'Name, address, phone, website', icon: Monitor },
          { title: 'Google Integration', desc: 'Review URL, Place ID, Maps', icon: Smartphone },
          { title: 'QR Code Defaults', desc: 'Colors, frames, logo, size', icon: QrCode },
          { title: 'Notifications', desc: 'Email, Slack, webhook alerts', icon: HelpCircle },
          { title: 'Print Settings', desc: 'Materials, sizes, branding', icon: Printer },
          { title: 'API & Webhooks', desc: 'Integrate with your stack', icon: ArrowRight },
        ].map((setting, i) => (
          <Card key={setting.title} className="border-secondary-200 dark:border-secondary-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                <setting.icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="font-medium text-secondary-900 dark:text-white">{setting.title}</p>
                <p className="text-sm text-secondary-500">{setting.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function getHotspots(step: number) {
  const hotspots: Record<number, Array<{ id: string; top: string; left: string }>> = {
    0: [
      { id: 'stats', top: '10%', left: '5%' },
      { id: 'activity', top: '55%', left: '5%' },
    ],
    1: [
      { id: 'create', top: '5%', left: '70%' },
      { id: 'qr-list', top: '35%', left: '5%' },
    ],
    2: [
      { id: 'chart', top: '10%', left: '5%' },
      { id: 'metrics', top: '55%', left: '5%' },
    ],
    3: [
      { id: 'invite', top: '5%', left: '70%' },
      { id: 'members', top: '35%', left: '5%' },
    ],
    4: [
      { id: 'settings-grid', top: '10%', left: '5%' },
    ],
  };
  return hotspots[step] || [];
}

function getFeatures(step: number) {
  const features: Record<number, Array<{ id: string; title: string; description: string; icon: React.ComponentType<{ className?: string }> }>> = {
    0: [
      { id: 'realtime', title: 'Real-time Updates', description: 'See scans and reviews instantly', icon: Sparkles },
      { id: 'quick-actions', title: 'Quick Actions', description: 'Create QR codes in one click', icon: QrCode },
      { id: 'alerts', title: 'Smart Alerts', description: 'Get notified on negative reviews', icon: HelpCircle },
    ],
    1: [
      { id: 'bulk-create', title: 'Bulk Creation', description: 'Generate multiple codes at once', icon: QrCode },
      { id: 'custom-design', title: 'Custom Designs', description: 'Brand each location uniquely', icon: Sparkles },
      { id: 'analytics', title: 'Per-code Analytics', description: 'Track performance by location', icon: BarChart3 },
    ],
    2: [
      { id: 'trends', title: 'Trend Analysis', description: 'Spot patterns over time', icon: BarChart3 },
      { id: 'export', title: 'Export Reports', description: 'PDF, CSV, and API access', icon: ArrowRight },
      { id: 'benchmarks', title: 'Industry Benchmarks', description: 'Compare with competitors', icon: Sparkles },
    ],
    3: [
      { id: 'roles', title: 'Role-based Access', description: 'Admin, Manager, Staff roles', icon: Users },
      { id: 'notifications', title: 'Team Notifications', description: 'Assign review responses', icon: HelpCircle },
      { id: 'audit', title: 'Audit Log', description: 'Track all team actions', icon: Settings },
    ],
    4: [
      { id: 'branding', title: 'White-label Options', description: 'Remove ReviewAI branding', icon: Monitor },
      { id: 'webhooks', title: 'Webhooks', description: 'Real-time event streaming', icon: ArrowRight },
      { id: 'api', title: 'REST API', description: 'Build custom integrations', icon: Settings },
    ],
  };
  return features[step] || [];
}

function getProTips(step: number) {
  const tips: Record<number, string[]> = {
    0: [
      'Pin your most important metrics to the top',
      'Set up daily/weekly email summaries',
      'Use the mobile app for on-the-go monitoring',
    ],
    1: [
      'Test QR codes on multiple devices before printing',
      'Use different frame colors for different campaigns',
      'Enable logo for brand recognition',
    ],
    2: [
      'Filter by date range to compare periods',
      'Export data before board meetings',
      'Set up automated weekly reports',
    ],
    3: [
      'Start with Manager role for supervisors',
      'Enable review assignment for faster responses',
      'Regular audit log reviews for compliance',
    ],
    4: [
      'Configure webhooks before launching campaigns',
      'Test notification templates with your team',
      'Save API keys securely - they won\'t be shown again',
    ],
  };
  return tips[step] || [];
}