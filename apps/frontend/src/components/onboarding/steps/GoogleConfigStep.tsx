'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, ExternalLink, Loader2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { GoogleConfigStepData, OnboardingStepData } from '@/lib/onboarding-types';
import { api } from '@/lib/api-client';

interface GoogleConfigStepProps {
  stepData: GoogleConfigStepData | undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
}

export function GoogleConfigStep({ stepData, onDataChange, isSaving }: GoogleConfigStepProps) {
  const [url, setUrl] = useState(stepData?.google_review_url || '');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'valid' | 'invalid' | 'unknown'>('unknown');
  const [verificationDetails, setVerificationDetails] = useState<string | null>(null);

  useEffect(() => {
    if (stepData?.google_review_url) {
      setUrl(stepData.google_review_url);
      if (stepData.verified) {
        setVerificationResult('valid');
      }
    }
  }, [stepData]);

  const verifyUrl = async () => {
    if (!url.trim()) return;

    setIsVerifying(true);
    setVerificationResult('unknown');
    setVerificationDetails(null);

    try {
      const response = await api.post<{ success: boolean; data: { valid: boolean; details?: string } }>('/onboarding/verify-google-url', {
        google_review_url: url,
      });

      if (response.data.valid) {
        setVerificationResult('valid');
        setVerificationDetails('URL verified successfully! Google Reviews page is accessible.');
        onDataChange('google_config', { google_review_url: url, verified: true });
      } else {
        setVerificationResult('invalid');
        setVerificationDetails(response.data.details || 'URL could not be verified as a Google Reviews page.');
        onDataChange('google_config', { google_review_url: url, verified: false });
      }
    } catch (error) {
      console.error('Verification failed:', error);
      setVerificationResult('invalid');
      setVerificationDetails('Failed to verify URL. Please check the URL and try again.');
      onDataChange('google_config', { google_review_url: url, verified: false });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setVerificationResult('unknown');
    setVerificationDetails(null);
    onDataChange('google_config', { google_review_url: value, verified: false });
  };

  const isValid = verificationResult === 'valid' && url.trim().length > 0;

  return (
    <div className="space-y-6">
      <Card className="border-primary-200 dark:border-primary-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-primary-900 dark:text-primary-100">
                Google Review URL Verification
              </h3>
              <p className="text-sm text-primary-700 dark:text-primary-300 mt-1">
                We&apos;ll verify your Google Review URL to ensure customers are directed to the correct page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300">
          Google Review URL <span className="text-error-500">*</span>
        </label>
        <div className="relative">
          <Input
            value={url}
            onChange={e => handleUrlChange(e.target.value)}
            placeholder="https://g.page/your-business/review"
            className="pr-28"
            disabled={isSaving || isVerifying}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isVerifying && <Loader2 className="h-4 w-4 animate-spin text-primary-600" />}
            {verificationResult === 'valid' && (
              <CheckCircle className="h-4 w-4 text-success-500" />
            )}
            {verificationResult === 'invalid' && (
              <AlertCircle className="h-4 w-4 text-error-500" />
            )}
            {!isVerifying && url && (
              <Button
                variant="outline"
                size="sm"
                onClick={verifyUrl}
                disabled={isSaving}
                className="h-8 px-3"
              >
                Verify
              </Button>
            )}
            {url && !isVerifying && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-secondary-400 hover:text-secondary-600"
                aria-label="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        {verificationDetails && (
          <div
            className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
              verificationResult === 'valid'
                ? 'bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800'
                : 'bg-error-50 dark:bg-error-900/20 text-error-700 dark:text-error-300 border border-error-200 dark:border-error-800'
            }`}
          >
            {verificationResult === 'valid' ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            )}
            <span>{verificationDetails}</span>
          </div>
        )}
      </div>

      {/* Example URLs */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base">Supported URL Formats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg font-mono text-sm text-secondary-700 dark:text-secondary-300">
            https://g.page/your-business/review
          </div>
          <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg font-mono text-sm text-secondary-700 dark:text-secondary-300">
            https://search.google.com/local/writereview?placeid=ChIJ...
          </div>
          <div className="p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg font-mono text-sm text-secondary-700 dark:text-secondary-300">
            https://maps.google.com/?cid=123456789
          </div>
        </CardContent>
      </Card>

      {/* How to find URL */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base">How to Get Your Google Review URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-start gap-3">
            <Badge variant="secondary" className="flex-shrink-0 mt-0.5">1</Badge>
            <div>
              <p className="font-medium text-secondary-900 dark:text-white">Go to Google Maps</p>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">Search for your business and click on it</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="secondary" className="flex-shrink-0 mt-0.5">2</Badge>
            <div>
              <p className="font-medium text-secondary-900 dark:text-white">Click "Write a review"</p>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">This opens the review dialog with the URL</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="secondary" className="flex-shrink-0 mt-0.5">3</Badge>
            <div>
              <p className="font-medium text-secondary-900 dark:text-white">Copy the URL</p>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">Paste it above and click Verify</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isValid && (
        <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
          <span className="text-success-700 dark:text-success-300">
            Google Review URL verified! Ready to proceed.
          </span>
        </div>
      )}
    </div>
  );
}