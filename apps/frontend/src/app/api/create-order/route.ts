import { NextResponse } from 'next/server';

/**
 * STEP 1: BACKEND - Create Order
 * Endpoint: POST /api/create-order
 * Request: { amount (paise), currency, receipt }
 * Return: { order_id, amount, currency }
 * Minimum amount: 100 paise
 * 
 * Security:
 * - Credentials are read exclusively from environment variables
 * - Secret keys are never hardcoded or exposed to the browser
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { amount, currency = 'INR', receipt, notes } = body || {};

    const numericAmount = Number(amount);
    if (!amount || isNaN(numericAmount) || numericAmount < 100) {
      return NextResponse.json(
        { error: 'Invalid amount. Minimum amount is 100 paise (₹1.00).', code: 'INVALID_AMOUNT' },
        { status: 400 }
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: 'Razorpay authentication failed: Missing API credentials', code: 'AUTH_FAILED' },
        { status: 401 }
      );
    }

    const receiptId = receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        amount: Math.round(numericAmount),
        currency: currency || 'INR',
        receipt: receiptId,
        notes: notes || {},
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const status = res.status === 401 ? 401 : 500;
      return NextResponse.json(
        {
          error: data?.error?.description || 'Failed to create Razorpay order',
          code: status === 401 ? 'AUTH_FAILED' : 'GATEWAY_ERROR',
        },
        { status }
      );
    }

    return NextResponse.json({
      order_id: data.id,
      amount: data.amount,
      currency: data.currency,
      key_id: keyId,
      success: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal server error while creating order', details: err?.message },
      { status: 500 }
    );
  }
}
