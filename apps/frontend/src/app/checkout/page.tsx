'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  CreditCard, 
  Sparkles, 
  Lock,
  RefreshCw 
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RazorpayCheckoutButton } from '@/components/RazorpayCheckoutButton';

export default function CheckoutPage() {
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'custom'>('pro');
  const [customAmountRupees, setCustomAmountRupees] = useState<number>(499);
  const [customerName, setCustomerName] = useState<string>('Test Customer');
  const [customerEmail, setCustomerEmail] = useState<string>('customer@example.com');
  const [customerPhone, setCustomerPhone] = useState<string>('9999999999');

  const [paymentSuccessData, setPaymentSuccessData] = useState<{
    order_id: string;
    payment_id: string;
    signature: string;
  } | null>(null);

  const getAmountInPaise = (): number => {
    if (selectedPlan === 'starter') return 19900; // ₹199
    if (selectedPlan === 'pro') return 49900; // ₹499
    return Math.max(100, Math.round((Number(customAmountRupees) || 1) * 100));
  };

  const currentAmountPaise = getAmountInPaise();
  const currentAmountRupees = (currentAmountPaise / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Billing
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 gap-1 py-1">
              <Lock className="h-3 w-3" />
              Razorpay Checkout
            </Badge>
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Razorpay Standard Web Checkout
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
            Secure order creation, modal checkout, and HMAC-SHA256 signature verification.
          </p>
        </div>

        {paymentSuccessData ? (
          /* Payment Success Confirmation Card */
          <Card className="border-emerald-500/30 bg-white dark:bg-slate-900 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-emerald-500/10 border-b border-emerald-500/20 p-6 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mb-4">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                Payment Verified & Completed!
              </h2>
              <p className="text-emerald-600 dark:text-emerald-400 text-sm mt-1">
                The HMAC-SHA256 server verification passed with 100% authenticity.
              </p>
            </div>

            <CardContent className="p-6 space-y-6">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Order ID:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 select-all">
                    {paymentSuccessData.order_id}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Payment ID:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 select-all">
                    {paymentSuccessData.payment_id}
                  </span>
                </div>
                <div className="flex flex-col py-1">
                  <span className="text-slate-500 dark:text-slate-400 mb-1">Signature:</span>
                  <span className="break-all text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800 select-all">
                    {paymentSuccessData.signature}
                  </span>
                </div>
              </div>

              <div className="flex gap-4">
                <Button
                  onClick={() => setPaymentSuccessData(null)}
                  className="w-full flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Test Another Payment
                </Button>
                <Link href="/dashboard/billing" className="w-full">
                  <Button variant="outline" className="w-full">
                    Return to Billing Dashboard
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Checkout Configuration & Payment Initiation Form */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left: Configuration & Details */}
            <div className="md:col-span-2 space-y-6">
              {/* Select Package/Amount */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-indigo-500" />
                    Select Test Offering
                  </CardTitle>
                  <CardDescription>
                    Choose a preset or enter a custom test amount (min ₹1.00 / 100 paise)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPlan('starter')}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        selectedPlan === 'starter'
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-indigo-500'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-semibold text-slate-900 dark:text-white">Starter</div>
                      <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">₹199</div>
                      <div className="text-xs text-slate-500 mt-1">19,900 paise</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPlan('pro')}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        selectedPlan === 'pro'
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-indigo-500'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-semibold text-slate-900 dark:text-white">Pro Plan</div>
                      <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">₹499</div>
                      <div className="text-xs text-slate-500 mt-1">49,900 paise</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPlan('custom')}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        selectedPlan === 'custom'
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-indigo-500'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-semibold text-slate-900 dark:text-white">Custom</div>
                      <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">Custom</div>
                      <div className="text-xs text-slate-500 mt-1">Flexible</div>
                    </button>
                  </div>

                  {selectedPlan === 'custom' && (
                    <div className="pt-2 animate-in fade-in duration-200">
                      <Label htmlFor="custom-amount" className="text-sm font-medium">
                        Custom Amount (INR ₹)
                      </Label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                          ₹
                        </span>
                        <Input
                          id="custom-amount"
                          type="number"
                          min="1"
                          step="1"
                          value={customAmountRupees}
                          onChange={(e) => setCustomAmountRupees(Math.max(1, Number(e.target.value)))}
                          className="pl-8"
                          placeholder="e.g. 500"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Equivalent to {Math.round(customAmountRupees * 100).toLocaleString()} paise (minimum 100 paise).
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Customer Contact Prefill */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Customer Information (Prefill)</CardTitle>
                  <CardDescription>
                    These details will automatically populate in the Razorpay payment modal
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name" className="text-sm font-medium">
                        Customer Name
                      </Label>
                      <Input
                        id="name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="John Doe"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-sm font-medium">
                        Phone Number
                      </Label>
                      <Input
                        id="phone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="9999999999"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Order Summary & Checkout Action */}
            <div className="space-y-6">
              <Card className="shadow-md border-indigo-100 dark:border-indigo-900/50">
                <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
                  <CardTitle className="text-base font-semibold">Payment Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Item</span>
                      <span className="font-medium text-slate-900 dark:text-white capitalize">
                        {selectedPlan === 'custom' ? 'Custom Payment' : `${selectedPlan} Plan`}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Gateway Currency</span>
                      <span className="font-medium text-slate-900 dark:text-white">INR</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Amount in Paise</span>
                      <span className="font-medium font-mono text-slate-900 dark:text-white">
                        {currentAmountPaise.toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t pt-3 flex justify-between items-baseline font-bold">
                      <span className="text-base text-slate-900 dark:text-white">Total Payable</span>
                      <span className="text-2xl text-indigo-600 dark:text-indigo-400">
                        ₹{currentAmountRupees}
                      </span>
                    </div>
                  </div>

                  {/* Standard Web Checkout Button */}
                  <div className="pt-4">
                    <RazorpayCheckoutButton
                      amountPaise={currentAmountPaise}
                      currency="INR"
                      name="ReviewAI SaaS"
                      description={`Standard Web Checkout (₹${currentAmountRupees})`}
                      prefill={{
                        name: customerName,
                        email: customerEmail,
                        contact: customerPhone,
                      }}
                      buttonText={`Pay ₹${currentAmountRupees}`}
                      className="w-full py-6 text-base bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg rounded-xl"
                      onSuccess={(data) => {
                        setPaymentSuccessData(data);
                      }}
                    />
                  </div>

                  <div className="space-y-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>256-bit SSL encrypted checkout</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4 text-indigo-500 shrink-0" />
                      <span>Supports UPI, Cards, Netbanking & Wallets</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Integration Verification Checklist */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Razorpay Checkout Pipeline:
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  <span>1. POST /api/create-order generates order_id</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  <span>2. checkout.js modal opens with test credentials</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  <span>3. POST /api/verify-payment verifies HMAC SHA-256</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
