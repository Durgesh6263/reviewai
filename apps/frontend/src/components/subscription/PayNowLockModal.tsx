'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Lock, ArrowRight, Sparkles, CreditCard } from 'lucide-react';

export interface PayNowLockModalProps {
  isBlocked: boolean;
  exhaustionReason?: string | null;
  customMessage?: string | null;
  planName?: string;
  onClose?: () => void;
}

export function getExhaustionHeadline(reason?: string | null): string {
  switch (reason) {
    case 'TRIAL_EXPIRED':
      return 'Your free trial has ended. Choose a plan to continue.';
    case 'PLAN_EXPIRED':
    case 'SUBSCRIPTION_EXPIRED':
      return 'Your subscription has expired. Choose a plan to continue.';
    case 'QR_QUOTA_EXHAUSTED':
    case 'PLAN_QR_QUOTA_EXHAUSTED':
    case 'TRIAL_QR_QUOTA_EXHAUSTED':
      return 'Your monthly QR scan quota has been exhausted. Access will resume next monthly cycle or upgrade your plan.';
    case 'AI_QUOTA_EXHAUSTED':
    case 'PLAN_AI_QUOTA_EXHAUSTED':
    case 'TRIAL_AI_QUOTA_EXHAUSTED':
      return 'Your monthly AI generation quota has been exhausted. Access will resume next monthly cycle or upgrade your plan.';
    default:
      return 'Your subscription has expired. Choose a plan to continue.';
  }
}

export function PayNowLockModal({
  isBlocked,
  exhaustionReason,
  customMessage,
  planName,
  onClose,
}: PayNowLockModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Exclude billing and settings pages from modal disruption
  const isBillingPage = pathname === '/dashboard/billing' || pathname.startsWith('/dashboard/billing/');
  const isSettingsPage = pathname === '/dashboard/settings';

  useEffect(() => {
    // Show modal if blocked and not on billing/settings
    if (isBlocked && !isBillingPage && !isSettingsPage) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [isBlocked, pathname, isBillingPage, isSettingsPage]);

  const handleOpenBilling = () => {
    setIsOpen(false);
    router.push('/dashboard/billing');
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) onClose();
  };

  const dynamicReason = customMessage || getExhaustionHeadline(exhaustionReason);

  return (
    <>
      {/* Persistent Sticky Locked Banner across protected areas for EXPIRED subscriptions */}
      {isBlocked && !isBillingPage && (
        <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/50 px-4 py-3 sticky top-16 z-20">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2.5 text-red-900 dark:text-red-200">
              <Lock className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>
                <strong className="font-semibold">Access Locked: </strong>
                {dynamicReason}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => setIsOpen(true)}
                variant="outline"
                className="text-xs h-8 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100"
              >
                View Reason
              </Button>
              <Button
                size="sm"
                onClick={handleOpenBilling}
                className="text-xs h-8 bg-red-600 hover:bg-red-700 text-white font-medium shadow-xs"
              >
                Pay Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quota Exhaustion Warning Banner for ACTIVE subscriptions where only QR or AI quota is exhausted */}
      {!isBlocked && (exhaustionReason === 'QR_QUOTA_EXHAUSTED' || exhaustionReason === 'AI_QUOTA_EXHAUSTED') && !isBillingPage && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 py-3 sticky top-16 z-20">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong className="font-semibold">
                  {exhaustionReason === 'QR_QUOTA_EXHAUSTED' ? 'QR Quota Exhausted: ' : 'AI Quota Exhausted: '}
                </strong>
                {dynamicReason}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={handleOpenBilling}
                className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs"
              >
                Upgrade Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Now Modal */}
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) handleClose();
        else setIsOpen(true);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center pb-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 flex items-center justify-center mb-3">
              <ShieldAlert className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>
            <DialogTitle className="text-2xl font-bold text-secondary-900 dark:text-white">
              Your access has ended
            </DialogTitle>
            <DialogDescription className="text-base text-secondary-600 dark:text-secondary-400 mt-2 font-medium">
              {dynamicReason}
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-xl border border-secondary-200 dark:border-secondary-700/60 space-y-2 text-sm text-secondary-600 dark:text-secondary-300">
            <p className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary-500 shrink-0" />
              Core features including QR scans and AI generation are currently paused.
            </p>
            <p className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-500 shrink-0" />
              Select a 1, 6, or 12-month fixed duration plan with total quotas to instantly restore access.
            </p>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenBilling}
              className="w-full sm:w-auto font-medium"
            >
              View Plans
            </Button>
            <Button
              type="button"
              onClick={handleOpenBilling}
              className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white font-semibold flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span>Pay Now</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
