import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * STEP 3: BACKEND - Verify Signature
 * Endpoint: POST /api/verify-payment
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Compare generated signature with razorpay_signature
 * Return success only if signatures match
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const order_id = body?.order_id || body?.razorpay_order_id;
    const payment_id = body?.payment_id || body?.razorpay_payment_id;
    const razorpay_signature = body?.signature || body?.razorpay_signature;

    // Missing fields: return 400
    if (!order_id || !payment_id || !razorpay_signature) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: order_id, payment_id, and razorpay_signature are required',
          code: 'MISSING_FIELDS',
        },
        { status: 400 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error: Razorpay secret key is not set',
          code: 'SERVER_CONFIG_ERROR',
        },
        { status: 500 }
      );
    }

    // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    const isMatch = generatedSignature === razorpay_signature;

    // Signature mismatch: return 400, do NOT mark as paid
    if (!isMatch) {
      return NextResponse.json(
        {
          success: false,
          error: 'Payment verification failed: Signature mismatch',
          code: 'SIGNATURE_MISMATCH',
        },
        { status: 400 }
      );
    }

    // Return success only if signatures match
    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      order_id,
      payment_id,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Internal server error while verifying payment', details: err?.message },
      { status: 500 }
    );
  }
}
