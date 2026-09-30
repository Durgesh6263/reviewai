'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Sparkles, QrCode, ChevronRight, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface LimitScreenProps {
  type: 'qr_scan' | 'ai_generation';
  limit: number;
  used: number;
  planName: string;
  businessName: string;
  businessSlug: string;
  sessionId?: string;
}

/**
 * QR Scan Limit Screen
 * Shown when a customer scans a QR code but the business has reached their monthly scan limit
 */
export function QRLimitScreenContent({
  limit,
  used,
  planName,
  businessName,
  businessSlug,
}: Omit<LimitScreenProps, 'type' | 'sessionId'>) {
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = () => {
    setIsLoading(true);
    // Redirect to business owner's upgrade page
    // In a real app, this would redirect to a billing portal
    window.location.href = `/dashboard/settings?tab=subscription&upgrade=true&business=${businessSlug}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <QrCode className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">Monthly Scan Limit Reached</h1>
          <p className="text-secondary-600 dark:text-secondary-400">
            {businessName} has reached their monthly QR scan limit on the {planName} plan.
          </p>
        </div>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Limit Details</CardTitle>
            <CardDescription>Monthly QR scan usage for the current billing period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-secondary-700 dark:text-secondary-300">Plan</span>
                <span className="font-medium text-secondary-900 dark:text-white">{planName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary-700 dark:text-secondary-300">Scans Used</span>
                <span className="font-medium text-secondary-900 dark:text-white">{used} / {limit}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary-700 dark:text-secondary-300">Remaining</span>
                <span className="font-medium text-error-500">{Math.max(0, limit - used)}</span>
              </div>
            </div>

            <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
              />
            </div>

            <p className="text-sm text-secondary-600 dark:text-secondary-400">
              The limit resets at the start of each month. Upgrade to a higher plan for more scans.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col space-y-3 pt-4 border-t">
            <Button
              onClick={handleUpgrade}
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  Upgrade Plan
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            <p className="text-center text-sm text-secondary-500">
              Business owner: <Link href="/dashboard/settings?tab=subscription" className="text-primary-600 hover:text-primary-500 font-medium">manage your plan</Link>
            </p>
          </CardFooter>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-sm text-secondary-500 dark:text-secondary-400">
            This limit applies to the business owner&apos;s account, not to you as a customer.
          </p>
        </div>
      </div>
    </div>
  );
}

export function QRLimitScreen({
  limit,
  used,
  planName,
  businessName,
  businessSlug,
}: Omit<LimitScreenProps, 'type' | 'sessionId'>) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <QRLimitScreenContent
        limit={limit}
        used={used}
        planName={planName}
        businessName={businessName}
        businessSlug={businessSlug}
      />
    </Suspense>
  );
}

/**
 * AI Generation Limit Screen
 * Shown when a business tries to generate an AI review but has reached their monthly limit
 */
export function AILimitScreenContent({
  limit,
  used,
  planName,
  businessName,
  businessSlug,
  sessionId,
}: Omit<LimitScreenProps, 'type'>) {
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = () => {
    setIsLoading(true);
    window.location.href = `/dashboard/settings?tab=subscription&upgrade=true&business=${businessSlug}`;
  };

  const handleBack = () => {
    if (sessionId) {
      window.location.href = `/review/${sessionId}`;
    } else {
      window.history.back();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-purple-500" />
          </div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">Monthly AI Generation Limit Reached</h1>
          <p className="text-secondary-600 dark:text-secondary-400">
            {businessName} has reached their monthly AI review generation limit on the {planName} plan.
          </p>
        </div>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Limit Details</CardTitle>
            <CardDescription>Monthly AI generation usage for the current billing period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-secondary-700 dark:text-secondary-300">Plan</span>
                <span className="font-medium text-secondary-900 dark:text-white">{planName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary-700 dark:text-secondary-300">Generations Used</span>
                <span className="font-medium text-secondary-900 dark:text-white">{used} / {limit}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary-700 dark:text-secondary-300">Remaining</span>
                <span className="font-medium text-error-500">{Math.max(0, limit - used)}</span>
              </div>
            </div>

            <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
              />
            </div>

            <p className="text-sm text-secondary-600 dark:text-secondary-400">
              The limit resets at the start of each month. Upgrade to a higher plan for more AI generations.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col space-y-3 pt-4 border-t">
            <Button
              onClick={handleUpgrade}
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  Upgrade Plan
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleBack}
              className="w-full"
              disabled={isLoading}
            >
              Back to Review
            </Button>
            <p className="text-center text-sm text-secondary-500">
              <Link href="/dashboard/settings?tab=subscription" className="text-primary-600 hover:text-primary-500 font-medium">Manage your plan</Link>
            </p>
          </CardFooter>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-sm text-secondary-500 dark:text-secondary-400">
            You can still collect private feedback and manually write reviews.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AILimitScreen({
  limit,
  used,
  planName,
  businessName,
  businessSlug,
  sessionId,
}: Omit<LimitScreenProps, 'type'>) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AILimitScreenContent
        limit={limit}
        used={used}
        planName={planName}
        businessName={businessName}
        businessSlug={businessSlug}
        sessionId={sessionId}
      />
    </Suspense>
  );
}

/**
 * Generic Limit Screen for reuse
 */
export function LimitScreen({ type, ...props }: LimitScreenProps) {
  if (type === 'qr_scan') {
    return <QRLimitScreen {...props} />;
  }
  return <AILimitScreen {...props} />;
}