'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2, ShieldCheck, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface RazorpayCheckoutButtonProps {
  amountPaise: number; // Amount in paise (e.g. 50000 = ₹500)
  currency?: string;
  receipt?: string;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  themeColor?: string;
  buttonText?: string;
  className?: string;
  onSuccess?: (data: { order_id: string; payment_id: string; signature: string }) => void;
  onError?: (error: any) => void;
  onCancel?: () => void;
}

export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) {
      return resolve(true);
    }
    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const RazorpayCheckoutButton: React.FC<RazorpayCheckoutButtonProps> = ({
  amountPaise,
  currency = 'INR',
  receipt,
  name = 'ReviewAI',
  description = 'Subscription Checkout',
  prefill = {},
  notes = {},
  themeColor = '#4F46E5',
  buttonText = 'Pay with Razorpay',
  className = '',
  onSuccess,
  onError,
  onCancel,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleCheckout = async () => {
    try {
      setIsLoading(true);

      // 1. Ensure Razorpay checkout script is loaded
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        const errorMsg = 'Failed to load Razorpay SDK. Please check your connection.';
        toast.error(errorMsg);
        onError?.(new Error(errorMsg));
        setIsLoading(false);
        return;
      }

      // 2. Call backend to create order
      const requestPayload = {
        amount: amountPaise,
        currency,
        receipt: receipt || `rcpt_${Date.now()}`,
        notes,
      };

      const candidateUrls = [
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/create-order`,
        'http://localhost:4000/api/create-order',
        '/api/create-order',
      ];

      let orderData: any = null;

      for (const endpoint of candidateUrls) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload),
          });
          const json = await res.json().catch(() => null);
          if (res.ok && json && json.order_id) {
            orderData = json;
            break;
          }
        } catch (err) {
          // Continue to next candidate endpoint
        }
      }

      if (!orderData || !orderData.order_id) {
        const errMessage = 'Failed to create payment order. Please try again.';
        toast.error(errMessage);
        onError?.(orderData);
        setIsLoading(false);
        return;
      }

      const razorpayKeyId = orderData.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!razorpayKeyId) {
        const errMessage = 'Razorpay Key ID is not configured. Please set NEXT_PUBLIC_RAZORPAY_KEY_ID.';
        toast.error(errMessage);
        onError?.(new Error(errMessage));
        setIsLoading(false);
        return;
      }

      // 3. Configure Razorpay Standard Checkout modal options
      const options = {
        key: razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency || currency,
        name,
        description,
        order_id: orderData.order_id,
        prefill: {
          name: prefill.name || '',
          email: prefill.email || '',
          contact: prefill.contact || '',
        },
        notes: notes || {},
        theme: {
          color: themeColor,
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // 4. Send payment credentials to backend verification endpoint
          const verifyToastId = toast.loading('Verifying payment signature securely...');
          try {
            const verifyPayload = {
              order_id: response.razorpay_order_id,
              payment_id: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            };

            const verifyUrls = [
              `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/verify-payment`,
              'http://localhost:4000/api/verify-payment',
              '/api/verify-payment',
            ];

            let verifyData: any = null;

            for (const vUrl of verifyUrls) {
              try {
                const res = await fetch(vUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(verifyPayload),
                });
                const json = await res.json().catch(() => null);
                if (res.ok && json && json.success) {
                  verifyData = json;
                  break;
                }
              } catch (err) {
                // Continue
              }
            }

            toast.dismiss(verifyToastId);

            if (verifyData && verifyData.success) {
              toast.success('Payment verified successfully! Thank you.');
              onSuccess?.({
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });
            } else {
              toast.error(verifyData?.error || 'Payment signature verification failed.');
              onError?.(verifyData);
            }
          } catch (err: any) {
            toast.dismiss(verifyToastId);
            toast.error(err?.message || 'Network error verifying payment.');
            onError?.(err);
          }
        },
        modal: {
          ondismiss: () => {
            toast('Payment checkout cancelled. No charges were made.', { icon: 'ℹ️' });
            onCancel?.();
          },
        },
      };

      const razorpayInstance = new (window as any).Razorpay(options);

      // Handle payment.failed event
      razorpayInstance.on('payment.failed', (failResponse: any) => {
        const errorDesc = failResponse?.error?.description || 'Payment failed or declined.';
        toast.error(`Payment failed: ${errorDesc}`);
        onError?.(failResponse?.error);
      });

      // Open Razorpay modal
      razorpayInstance.open();
    } catch (error: any) {
      toast.error(error?.message || 'Error initializing payment.');
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleCheckout}
      disabled={isLoading || amountPaise < 100}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-all ${className}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Opening Gateway...</span>
        </>
      ) : (
        <>
          <CreditCard className="h-4 w-4" />
          <span>{buttonText}</span>
        </>
      )}
    </Button>
  );
};
