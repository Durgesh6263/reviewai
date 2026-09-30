'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Loader2, Download, Copy, Check, Image, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api-client';
import { toast } from 'react-hot-toast';
import type { QRDesignStepData, BusinessInfoStepData, OnboardingStepData } from '@/lib/onboarding-types';
import {
  QR_FRAMES,
  QR_ERROR_CORRECTION,
} from '@/lib/onboarding-types';
import { getQRCodeReviewUrl, getPublicAppUrl } from '@/lib/public-url';

interface QRGenerationStepProps {
  stepData: QRDesignStepData | undefined;
  onDataChange: (key: string, value: unknown) => void;
  isSaving: boolean;
  businessId?: string;
}

const defaultDesign: QRDesignStepData = {
  qr_id: '',
  color: '#2563EB',
  logo: true,
  frame: 'rounded',
  frame_text: 'Scan to Review',
  size: 512,
  error_correction: 'M',
};

export function QRGenerationStep({ stepData, onDataChange, isSaving, businessId }: QRGenerationStepProps) {
  const [design, setDesign] = useState<QRDesignStepData>({
    ...defaultDesign,
    ...stepData,
  });
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrId, setQrId] = useState<string>('');

  const generatePreview = async () => {
    if (!design.color) return;

    setIsGenerating(true);
    try {
      // Use qrserver.com for preview
      const slug = qrId ? qrId : 'demo';
      const params = new URLSearchParams({
        data: getQRCodeReviewUrl(slug),
        size: `${design.size}x${design.size}`,
        color: design.color.replace('#', ''),
        bgcolor: 'FFFFFF',
        qzone: design.frame === 'none' ? '0' : '2',
        ecc: design.error_correction,
        format: 'png',
      });

      // Add logo parameter if enabled
      if (design.logo) {
        params.append('logo', `${getPublicAppUrl()}/logo.png`);
      }

      const url = `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
      setPreviewUrl(url);
    } catch (error) {
      console.error('Failed to generate preview:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const createQRCode = async () => {
    if (!design.color || !businessId) {
      toast.error('Business ID not available. Please complete business setup first.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await api.post<{ success: boolean; data?: any; qr_code?: any }>('/qr-codes', {
        business_id: businessId,
        label: 'Main Location',
        design: {
          color: design.color,
          logo: design.logo,
          frame: design.frame,
          frame_text: design.frame_text,
          size: design.size,
          error_correction: design.error_correction,
        },
      });

      const qrResult = (response as any)?.qr_code || (response as any)?.data || response;
      const newQrId = qrResult?.id;
      const newSlug = qrResult?.slug || qrResult?.id;

      if (!newQrId) {
        throw new Error('QR code ID was not returned by server');
      }

      setQrId(newQrId);

      // Update design with QR ID
      const updatedDesign = { ...design, qr_id: newQrId };
      setDesign(updatedDesign);
      onDataChange('qr_design', updatedDesign);

      // Generate preview with actual slug
      const previewParams = new URLSearchParams({
        data: getQRCodeReviewUrl(newSlug),
        size: `${design.size}x${design.size}`,
        color: design.color.replace('#', ''),
        bgcolor: 'FFFFFF',
        qzone: design.frame === 'none' ? '0' : '2',
        ecc: design.error_correction,
        format: 'png',
      });

      if (design.logo) {
        previewParams.append('logo', `${getPublicAppUrl()}/logo.png`);
      }

      setPreviewUrl(`https://api.qrserver.com/v1/create-qr-code/?${previewParams.toString()}`);
      toast.success('QR code created successfully!');
    } catch (error: any) {
      console.error('Failed to create QR code:', error);
      toast.error(error?.response?.data?.error || error?.message || 'Failed to create QR code');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDesignChange = <K extends keyof QRDesignStepData>(key: K, value: QRDesignStepData[K]) => {
    const updatedDesign = { ...design, [key]: value };
    setDesign(updatedDesign);
    onDataChange('qr_design', updatedDesign);

    // Debounce preview generation
    if (key !== 'qr_id') {
      setTimeout(generatePreview, 300);
    }
  };

  const downloadQR = async () => {
    if (!previewUrl) return;
    try {
      const response = await fetch(previewUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reviewai-qr-${design.frame_text.toLowerCase().replace(/\s+/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const copyQRUrl = async () => {
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      toast.success('QR code URL copied to clipboard');
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error('Failed to copy QR code URL');
    }
  };

  // Generate preview on mount and design changes
  useEffect(() => {
    if (design.color && !previewUrl) {
      generatePreview();
    }
  }, [design.color, design.size, design.error_correction, design.frame, design.logo]);

  const hasQrCode = !!design.qr_id || !!qrId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-secondary-900 dark:text-white">
            Design Your QR Code
          </h3>
          <p className="text-sm text-secondary-600 dark:text-secondary-400">
            Customize the appearance and generate your QR code
          </p>
        </div>
      </div>

      {/* Design Controls */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base">Customization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          {/* Color */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Primary Color
            </Label>
            <div className="flex items-center gap-4">
              <Input
                type="color"
                value={design.color}
                onChange={e => handleDesignChange('color', e.target.value)}
                className="w-12 h-12 rounded-lg border-0 p-1 cursor-pointer"
              />
              <Input
                value={design.color}
                onChange={e => handleDesignChange('color', e.target.value)}
                className="flex-1 font-mono text-sm"
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Size */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Size: {design.size}px
            </Label>
            <Slider
              value={[design.size]}
              onValueChange={([value]) => handleDesignChange('size', value)}
              min={256}
              max={1024}
              step={64}
              className="w-full"
              disabled={isSaving}
            />
            <div className="flex justify-between text-xs text-secondary-500 mt-1">
              <span>256px</span>
              <span>512px</span>
              <span>1024px</span>
            </div>
          </div>

          {/* Error Correction */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Error Correction
            </Label>
            <Select
              value={design.error_correction}
              onValueChange={value => handleDesignChange('error_correction', value as QRDesignStepData['error_correction'])}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QR_ERROR_CORRECTION.map(item => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-secondary-500">
              Higher correction = more damage tolerance but denser QR code
            </p>
          </div>

          {/* Logo */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300">
                Include Logo
              </Label>
              <p className="text-xs text-secondary-500">Add ReviewAI logo in center</p>
            </div>
            <Switch
              checked={design.logo}
              onCheckedChange={checked => handleDesignChange('logo', checked)}
              disabled={isSaving}
            />
          </div>

          {/* Frame */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Frame Style
            </Label>
            <Select
              value={design.frame}
              onValueChange={value => handleDesignChange('frame', value as QRDesignStepData['frame'])}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QR_FRAMES.map(item => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frame Text */}
          <div>
            <Label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Frame Text
            </Label>
            <Input
              value={design.frame_text}
              onChange={e => handleDesignChange('frame_text', e.target.value)}
              placeholder="Scan to Review"
              maxLength={30}
              disabled={isSaving || design.frame === 'none'}
            />
            {design.frame === 'none' && (
              <p className="mt-1 text-xs text-secondary-500">Frame text hidden when frame is 'None'</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Live Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col items-center gap-4 p-6">
            {isGenerating ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
                <p className="text-secondary-600 dark:text-secondary-400">Generating preview...</p>
              </div>
            ) : previewUrl ? (
              <div className="bg-white dark:bg-secondary-900 p-4 rounded-lg border border-secondary-200 dark:border-secondary-700">
                <img
                  src={previewUrl}
                  alt="QR Code Preview"
                  className="max-w-full h-auto"
                  style={{ maxWidth: '300px' }}
                />
              </div>
            ) : (
              <div className="text-center text-secondary-500 py-8">
                <QrCode className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Preview will appear here</p>
              </div>
            )}

            {hasQrCode && !isGenerating && (
              <div className="flex items-center gap-3 w-full max-w-md">
                <Button variant="outline" onClick={downloadQR} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download PNG
                </Button>
                <Button variant="outline" onClick={copyQRUrl} className="flex-1">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy URL
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generate QR Code Button */}
      {!hasQrCode && (
        <Button
          onClick={createQRCode}
          disabled={isSaving || isGenerating}
          className="w-full py-3 text-lg"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Creating QR Code...
            </>
          ) : (
            <>
              <QrCode className="h-5 w-5 mr-2" />
              Generate QR Code
            </>
          )}
        </Button>
      )}

      {hasQrCode && (
        <div className="p-4 bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
          <span className="text-success-700 dark:text-success-300">
            QR code created successfully! You can download it or proceed to test it.
          </span>
        </div>
      )}

      {/* Tips */}
      <Card className="border-secondary-200 dark:border-secondary-700">
        <CardHeader>
          <CardTitle className="text-base">Best Practices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div className="flex items-start gap-3 text-sm text-secondary-600 dark:text-secondary-400">
            <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
            <span>Use high contrast colors for better scanning</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-secondary-600 dark:text-secondary-400">
            <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
            <span>Test on multiple devices before printing</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-secondary-600 dark:text-secondary-400">
            <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
            <span>Print at least 2x2 inches for reliable scanning</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-secondary-600 dark:text-secondary-400">
            <CheckCircle className="h-5 w-5 text-success-500 flex-shrink-0 mt-0.5" />
            <span>Keep quiet zone (white border) around QR code</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}