/**
 * Razorpay Standard Web Checkout Controller & Routes
 * 
 * Implements:
 * 1. POST /api/create-order - Creates order via Razorpay SDK with amount >= 100 paise
 * 2. POST /api/verify-payment - Verifies payment signature using HMAC-SHA256
 * 
 * Security:
 * - Credentials are read exclusively from environment variables (process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET)
 * - Secret keys are never hardcoded or exposed to the client
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { logger } from '../../shared/logger';

export function getRazorpayClient(): Razorpay | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return null;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

/**
 * STEP 1: BACKEND - Create Order
 * Endpoint: POST /api/create-order
 * Request: { amount (paise), currency, receipt }
 * Return: { order_id, amount, currency }
 * Minimum amount: 100 paise
 */
export async function handleCreateRazorpayOrder(req: Request, res: Response): Promise<void> {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body || {};

    // Validate amount >= 100 paise
    const numericAmount = Number(amount);
    if (!amount || isNaN(numericAmount) || numericAmount < 100) {
      res.status(400).json({
        error: 'Invalid amount. Minimum amount is 100 paise (₹1.00).',
        code: 'INVALID_AMOUNT',
      });
      return;
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      logger.error('Razorpay credentials missing from environment variables');
      res.status(401).json({
        error: 'Razorpay authentication failed: Missing API credentials',
        code: 'AUTH_FAILED',
      });
      return;
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      res.status(401).json({
        error: 'Razorpay authentication failed: Missing credentials',
        code: 'AUTH_FAILED',
      });
      return;
    }

    const receiptId = receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    try {
      const order = await razorpay.orders.create({
        amount: Math.round(numericAmount),
        currency: currency || 'INR',
        receipt: receiptId,
        notes: notes || {},
      });

      res.status(200).json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: keyId,
        success: true,
      });
    } catch (apiError: any) {
      logger.error({ err: apiError?.message, status: apiError?.statusCode }, 'Razorpay API order creation failed');
      const statusCode = apiError?.statusCode === 401 ? 401 : 500;
      res.status(statusCode).json({
        error: apiError?.error?.description || apiError?.message || 'Failed to create Razorpay order',
        code: apiError?.statusCode === 401 ? 'AUTH_FAILED' : 'GATEWAY_ERROR',
      });
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Unexpected error creating Razorpay order');
    res.status(500).json({
      error: 'Internal server error while creating order',
      code: 'INTERNAL_ERROR',
    });
  }
}

/**
 * STEP 3: BACKEND - Verify Signature
 * Endpoint: POST /api/verify-payment
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Compare generated signature with razorpay_signature
 * Return success only if signatures match
 */
export async function handleVerifyRazorpayPayment(req: Request, res: Response): Promise<void> {
  try {
    const order_id = req.body?.order_id || req.body?.razorpay_order_id;
    const payment_id = req.body?.payment_id || req.body?.razorpay_payment_id;
    const razorpay_signature = req.body?.signature || req.body?.razorpay_signature;

    // Missing fields: return 400
    if (!order_id || !payment_id || !razorpay_signature) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: order_id, payment_id, and razorpay_signature are required',
        code: 'MISSING_FIELDS',
      });
      return;
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      logger.error('RAZORPAY_KEY_SECRET is not configured');
      res.status(500).json({
        success: false,
        error: 'Razorpay configuration error',
      });
      return;
    }

    // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    // Signature mismatch: return 400, do NOT mark as paid
    if (generatedSignature !== razorpay_signature) {
      logger.warn({ order_id, payment_id }, 'Payment signature verification mismatch');
      res.status(400).json({
        success: false,
        error: 'Payment verification failed: Signature mismatch',
        code: 'SIGNATURE_MISMATCH',
      });
      return;
    }

    // Return success only if signatures match
    logger.info({ order_id, payment_id }, 'Payment signature successfully verified');
    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      order_id,
      payment_id,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Unexpected error verifying Razorpay payment');
    res.status(500).json({
      success: false,
      error: 'Internal server error while verifying payment',
      code: 'INTERNAL_ERROR',
    });
  }
}

export function createStandardCheckoutRoutes(): Router {
  const router = Router();
  router.post('/create-order', handleCreateRazorpayOrder);
  router.post('/verify-payment', handleVerifyRazorpayPayment);
  return router;
}
