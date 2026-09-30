'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle, Mail, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api-client';

type StatusType = 'verifying' | 'success' | 'error' | 'resent';

interface StatusConfig {
  icon: React.ReactNode;
  bgColor: string;
  title: string;
  description: string;
  primaryAction: { label: string; href?: string; onClick?: () => void; variant: 'default' | 'outline' } | null;
  secondaryAction: { label: string; href: string } | null;
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StatusType>('verifying');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const verifyEmail = async (verifyToken: string) => {
    try {
      await api.post('/auth/verify-email', { token: verifyToken });
      setStatus('success');
      setMessage('Your email has been verified successfully!');
    } catch (error: any) {
      setStatus('error');
      const errorMessage = error.response?.data?.message || 'Verification failed. The link may have expired.';
      setMessage(errorMessage);
    }
  };

  const resendVerification = async (userEmail: string) => {
    try {
      await api.post('/auth/resend-verification', { email: userEmail });
      setStatus('resent');
      setMessage('A new verification email has been sent!');
    } catch (error: any) {
      setStatus('error');
      const errorMessage = error.response?.data?.message || 'Failed to resend verification email.';
      setMessage(errorMessage);
    }
  };

  const handleResend = () => {
    if (email) {
      setStatus('verifying');
      resendVerification(email);
    }
  };

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else if (email) {
      // Resend verification email
      resendVerification(email);
    } else {
      setStatus('error');
      setMessage('Invalid verification link');
    }
    setIsLoading(false);
  }, [token, email]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950 px-4 py-12">
        <div className="w-full max-w-md text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-secondary-900 dark:text-white">ReviewAI</span>
          </Link>

          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-primary-500 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white mb-2">Verifying your email</h1>
          <p className="text-secondary-600 dark:text-secondary-400">Please wait while we verify your email address...</p>
        </div>
      </div>
    );
  }

  const getStatusConfig = (): StatusConfig => {
    switch (status) {
      case 'success':
        return {
          icon: <CheckCircle2 className="w-8 h-8 text-success-500" />,
          bgColor: 'bg-success-100 dark:bg-success-900/30',
          title: 'Email verified!',
          description: message,
          primaryAction: { label: 'Sign in', href: '/login', variant: 'default' },
          secondaryAction: null,
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-8 h-8 text-error-500" />,
          bgColor: 'bg-error-100 dark:bg-error-900/30',
          title: 'Verification failed',
          description: message,
          primaryAction: { label: 'Resend email', onClick: handleResend, variant: 'outline' },
          secondaryAction: { label: 'Sign up', href: '/register' },
        };
      case 'resent':
        return {
          icon: <Mail className="w-8 h-8 text-primary-500" />,
          bgColor: 'bg-primary-100 dark:bg-primary-900/30',
          title: 'Verification email sent',
          description: message,
          primaryAction: { label: 'Back to sign in', href: '/login', variant: 'default' },
          secondaryAction: null,
        };
      case 'verifying':
      default:
        return {
          icon: <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />,
          bgColor: 'bg-primary-100 dark:bg-primary-900/30',
          title: 'Verifying your email',
          description: 'Please wait while we verify your email address...',
          primaryAction: null,
          secondaryAction: null,
        };
    }
  };

  const config = getStatusConfig();

  const renderPrimaryAction = () => {
    if (!config.primaryAction) return null;
    if (config.primaryAction.onClick) {
      return (
        <Button
          onClick={config.primaryAction.onClick}
          variant={config.primaryAction.variant}
          className="w-full"
          size="lg"
        >
          {config.primaryAction.label}
          <RotateCcw className="ml-2 h-4 w-4" />
        </Button>
      );
    }
    if (config.primaryAction.href) {
      return (
        <Link href={config.primaryAction.href}>
          <Button className="w-full" size="lg" variant={config.primaryAction.variant}>
            {config.primaryAction.label}
          </Button>
        </Link>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-950 px-4 py-12">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-6">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-secondary-900 dark:text-white">ReviewAI</span>
        </Link>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pt-6 pb-4">
            <div className={`w-16 h-16 ${config.bgColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
              {config.icon}
            </div>
            <CardTitle className="text-2xl">{config.title}</CardTitle>
            <CardDescription className="text-base">{config.description}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 pb-6 space-y-3">
            {renderPrimaryAction()}
            {config.secondaryAction && (
              <Link href={config.secondaryAction.href} className="block text-primary-600 hover:text-primary-500 font-medium">
                {config.secondaryAction.label}
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}