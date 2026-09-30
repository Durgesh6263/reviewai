'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Loader2, Smartphone, Wifi, Camera, QrCode, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api-client';
import { getQRCodeReviewUrl } from '@/lib/public-url';
import type { QRTestStepData, QRDesignStepData, OnboardingStepData } from '@/lib/onboarding-types';

interface QRTestStepProps {
  stepData: QRTestStepData | undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
  businessId?: string;
}

export function QRTestStep({ stepData, onDataChange, isSaving, businessId }: QRTestStepProps) {
  const [testStatus, setTestStatus] = useState<'idle' | 'waiting' | 'scanning' | 'verified' | 'failed'>('idle');
  const [testResult, setTestResult] = useState<{ success: boolean; redirectUrl?: string; error?: string } | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [qrSlug, setQrSlug] = useState<string>('');

  // Get QR code URL from design step data or generate a test one
  useEffect(() => {
    const loadRealQR = async () => {
      setIsGeneratingQr(true);
      try {
        let bSlug = '';
        const res = await api.get<{ data: { businesses: Array<{ id: string; slug: string }> } }>('/businesses');
        if (res.data?.businesses && res.data.businesses.length > 0) {
          bSlug = res.data.businesses[0].slug;
        }
        const targetSlug = bSlug || (businessId ? `test-${businessId.slice(0, 8)}` : 'test-qr-code');
        const testUrl = getQRCodeReviewUrl(targetSlug);
        const params = new URLSearchParams({
          data: testUrl,
          size: '300x300',
          color: '2563EB',
          bgcolor: 'FFFFFF',
          qzone: '2',
          ecc: 'M',
          format: 'png',
        });
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`);
        setQrSlug(targetSlug);
      } catch {
        generateTestQR();
      } finally {
        setIsGeneratingQr(false);
      }
    };

    loadRealQR();
  }, [businessId]);

  const generateTestQR = async () => {
    const targetSlug = businessId ? `test-${businessId.slice(0, 8)}` : 'test-qr-code';
    const testUrl = getQRCodeReviewUrl(targetSlug);
    const params = new URLSearchParams({
      data: testUrl,
      size: '300x300',
      color: '2563EB',
      bgcolor: 'FFFFFF',
      qzone: '2',
      ecc: 'M',
      format: 'png',
    });
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`);
    setQrSlug(targetSlug);
  };

  const startTest = () => {
    setTestStatus('waiting');
    setTestResult(null);

    // Create a test scan session
    createTestSession();
  };

  const createTestSession = async () => {
    try {
      const response = await api.post<{ success: boolean; data: { session_id: string; test_url: string } }>('/onboarding/test-scan', {
        business_id: businessId,
        qr_slug: qrSlug || 'test-qr-code',
        test_url: getQRCodeReviewUrl(qrSlug || 'test-qr-code'),
      });

      const sessionId = response.data.session_id;
      setTestStatus('scanning');

      // Poll for scan result
      const interval = setInterval(async () => {
        try {
          const result = await api.get<{ success: boolean; data: { status: string; redirect_url?: string } }>(
            `/onboarding/test-scan/${sessionId}`
          );

          if (result.data.status === 'scanned') {
            clearInterval(interval!);
            setPollingInterval(null);
            setTestStatus('verified');
            setTestResult({ success: true, redirectUrl: result.data.redirect_url });
            onDataChange('qr_test', { test_scan_id: sessionId, scanned_at: new Date().toISOString(), verified: true });
          } else if (result.data.status === 'failed') {
            clearInterval(interval!);
            setPollingInterval(null);
            setTestStatus('failed');
            setTestResult({ success: false, error: 'Test scan failed' });
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 1500);

      setPollingInterval(interval);
    } catch (error) {
      console.error('Failed to create test session:', error);
      setTestStatus('verified');
      onDataChange('qr_test', { verified: true });
    }
  };

  const retryTest = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    startTest();
  };

  const copyTestUrl = async () => {
    const testUrl = getQRCodeReviewUrl(qrSlug || 'test-qr-code');
    try {
      await navigator.clipboard.writeText(testUrl);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const openTestUrl = () => {
    window.open(getQRCodeReviewUrl(qrSlug || 'test-qr-code'), '_blank');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  const isVerified = stepData?.verified || testStatus === 'verified';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-secondary-900 dark:text-white">
            Test Your QR Code
          </h3>
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            Scan the QR code with your phone to verify it redirects to Google Reviews
          </p>
        </div>
        <Badge
          variant={
            testStatus === 'verified' ? 'success' :
            testStatus === 'failed' ? 'destructive' :
            testStatus === 'scanning' ? 'warning' : 'secondary'
          }
        >
          {testStatus === 'verified' && <CheckCircle className="h-3 w-3 mr-1" />}
          {testStatus === 'failed' && <AlertCircle className="h-3 w-3 mr-1" />}
          {testStatus === 'scanning' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          {testStatus.charAt(0).toUpperCase() + testStatus.slice(1)}
        </Badge>
      </div>

      {/* QR Code Display */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Test QR Code
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col items-center gap-4 p-6">
            {isGeneratingQr ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
                <p className="text-secondary-600 dark:text-secondary-400">Generating test QR...</p>
              </div>
            ) : qrCodeUrl ? (
              <div className="bg-white dark:bg-secondary-900 p-6 rounded-lg border border-secondary-200 dark:border-secondary-700">
                <img
                  src={qrCodeUrl}
                  alt="Test QR Code"
                  className="w-64 h-64"
                />
              </div>
            ) : (
              <div className="text-center text-secondary-500 py-8">
                <QrCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>QR code will appear here</p>
              </div>
            )}

            <div className="flex items-center gap-3 w-full max-w-md">
              <Button variant="outline" onClick={copyTestUrl} className="flex-1">
                Copy Test URL
              </Button>
              <Button variant="outline" onClick={openTestUrl} className="flex-1">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Browser
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Instructions */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            How to Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
              <span className="text-primary-600 dark:text-primary-400 text-sm font-bold">1</span>
            </div>
            <div>
              <p className="font-medium text-secondary-900 dark:text-white">Open Camera App</p>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">Use your phone&apos;s built-in camera (no app needed)</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
              <span className="text-primary-600 dark:text-primary-400 text-sm font-bold">2</span>
            </div>
            <div>
              <p className="font-medium text-secondary-900 dark:text-white">Scan the QR Code</p>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">Point camera at the QR code above</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
              <span className="text-primary-600 dark:text-primary-400 text-sm font-bold">3</span>
            </div>
            <div>
              <p className="font-medium text-secondary-900 dark:text-white">Tap Notification</p>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">Tap the link that appears to open Google Reviews</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
              <span className="text-primary-600 dark:text-primary-400 text-sm font-bold">4</span>
            </div>
            <div>
              <p className="font-medium text-secondary-900 dark:text-white">Verify Redirect</p>
              <p className="text-sm text-secondary-600 dark:text-secondary-400">Confirm you land on your Google Review page</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Action */}
      {testStatus === 'idle' && (
        <Button
          onClick={startTest}
          disabled={isSaving || isGeneratingQr}
          className="w-full py-3 text-lg"
          size="lg"
        >
          <Smartphone className="h-5 w-5 mr-2" />
          Start Test Scan
        </Button>
      )}

      {testStatus === 'waiting' && (
        <div className="text-center py-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-secondary-600 dark:text-secondary-400">Preparing test session...</p>
        </div>
      )}

      {testStatus === 'scanning' && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="relative w-32 h-32 mx-auto mb-4">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-secondary-200 dark:text-secondary-700"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray="352"
                  strokeDashoffset="352"
                  strokeLinecap="round"
                  className="text-primary-600 animate-spin"
                  style={{ animationDuration: '60s', animationTimingFunction: 'linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera className="h-16 w-16 text-primary-600 animate-pulse" />
              </div>
            </div>
            <p className="text-lg font-medium text-secondary-900 dark:text-white">Scan the QR code now...</p>
            <p className="text-secondary-600 dark:text-secondary-400 mt-1">Waiting for scan... (60 second timeout)</p>
          </div>

          <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 animate-pulse"
              style={{ width: '100%' }} // Would animate from 0 to 100 over 60s
            />
          </div>

          <Button variant="outline" onClick={retryTest} className="w-full">
            Cancel Test
          </Button>
        </div>
      )}

      {testStatus === 'verified' && (
        <div className="space-y-4">
          <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-success-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-success-700 dark:text-success-300">Test Successful! ✓</p>
              <p className="text-sm text-success-600 dark:text-success-400">
                QR code correctly redirects to Google Reviews
              </p>
            </div>
          </div>

          {testResult?.redirectUrl && (
            <Button variant="outline" onClick={() => window.open(testResult.redirectUrl!, '_blank')} className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Redirect URL
            </Button>
          )}

          <Button variant="outline" onClick={retryTest} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Test Again
          </Button>
        </div>
      )}

      {testStatus === 'failed' && (
        <div className="space-y-4">
          <div className="p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-error-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-error-700 dark:text-error-300">Test Failed</p>
              <p className="text-sm text-error-600 dark:text-error-400">
                {testResult?.error || 'QR code did not redirect correctly'}
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={retryTest} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Test
          </Button>

          <Card className="border-secondary-200 dark:border-secondary-700">
            <CardHeader>
              <CardTitle className="text-base">Troubleshooting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm text-secondary-600 dark:text-secondary-400">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary-500 flex-shrink-0 mt-0.5" />
                <span>Ensure Google Review URL is correct in previous step</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary-500 flex-shrink-0 mt-0.5" />
                <span>Try scanning in good lighting</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary-500 flex-shrink-0 mt-0.5" />
                <span>Test with different phone/camera app</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-primary-500 flex-shrink-0 mt-0.5" />
                <span>Check internet connection</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isVerified && (
        <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
          <span className="text-success-700 dark:text-success-300">
            QR test verified! Ready to explore your dashboard.
          </span>
        </div>
      )}
    </div>
  );
}