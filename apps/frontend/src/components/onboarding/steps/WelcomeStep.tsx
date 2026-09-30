'use client';

import { Sparkles, Target, Zap, Shield, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { OnboardingStepData } from '@/lib/onboarding-types';

interface WelcomeStepProps {
  stepData: undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
}

export function WelcomeStep({ stepData, onDataChange, isSaving }: WelcomeStepProps) {
  const features = [
    {
      icon: Sparkles,
      title: 'Smart Review Generation',
      description: 'AI-powered review responses that sound natural and authentic',
    },
    {
      icon: Target,
      title: 'Experience Tags',
      description: 'Collect structured feedback with customizable tags and emojis',
    },
    {
      icon: Zap,
      title: 'Instant QR Codes',
      description: 'Generate beautiful, trackable QR codes in seconds',
    },
    {
      icon: Shield,
      title: 'Privacy First',
      description: 'GDPR compliant with full data control and export',
    },
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Invite staff, assign roles, and manage responses together',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Sparkles className="h-10 w-10 text-primary-600 dark:text-primary-400" />
        </div>
        <h2 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">
          Welcome to ReviewAI! 👋
        </h2>
        <p className="text-secondary-600 dark:text-secondary-400 text-lg max-w-2xl mx-auto">
          Turn every customer interaction into a 5-star review. We&apos;ll guide you through
          setting up your business, connecting Google reviews, and creating your first QR code.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature, index) => (
          <Card key={index} className="h-full hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="font-semibold text-secondary-900 dark:text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-secondary-600 dark:text-secondary-400 text-sm">
                {feature.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl">
        <h3 className="font-medium text-primary-900 dark:text-primary-100 mb-2">
          What to expect
        </h3>
        <ul className="space-y-1 text-sm text-primary-700 dark:text-primary-300">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 flex items-center justify-center bg-primary-100 dark:bg-primary-800 rounded-full text-xs font-bold">1</span>
            <span>Enter your business details</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 flex items-center justify-center bg-primary-100 dark:bg-primary-800 rounded-full text-xs font-bold">2</span>
            <span>Connect your Google Review page</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 flex items-center justify-center bg-primary-100 dark:bg-primary-800 rounded-full text-xs font-bold">3</span>
            <span>Add experience tags for feedback</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 flex items-center justify-center bg-primary-100 dark:bg-primary-800 rounded-full text-xs font-bold">4</span>
            <span>Design your QR code</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 flex items-center justify-center bg-primary-100 dark:bg-primary-800 rounded-full text-xs font-bold">5</span>
            <span>Test it works with your phone</span>
          </li>
        </ul>
      </div>

      <Button
        className="w-full py-3 text-lg"
        onClick={() => onDataChange('business_info', stepData || { name: '', google_review_url: '', timezone: 'UTC' })}
        disabled={isSaving}
      >
        Let&apos;s Get Started
      </Button>
    </div>
  );
}