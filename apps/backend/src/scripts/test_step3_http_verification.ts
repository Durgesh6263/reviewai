import 'dotenv/config';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import crypto from 'crypto';
import { razorpayService } from '../modules/payment/razorpay-service';

async function testHttpEndpoint() {
  console.log('Testing HTTP Verification Endpoint...');
  const testBusinessId = '88d2da14-f37b-46b9-95af-51379d92fd6a';
  const testUserId = '43c94316-cbfa-4599-8ed9-ff52dec73f23';
  const testUserEmail = 'devanshi@gmail.com';
  const jwtSecret = process.env.JWT_SECRET || 'your-default-jwt-secret-key-change-it';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'aPma1OvKUzwxLL99M9NABte3';

  const token = jwt.sign(
    {
      sub: testUserId,
      email: testUserEmail,
      role: 'business_owner',
      type: 'access',
    },
    jwtSecret,
    { expiresIn: '1h' }
  );

  // 1. Create order
  const order = await razorpayService.createOrder({
    businessId: testBusinessId,
    planId: 'base',
    durationMonths: 6,
    userId: testUserId,
    userEmail: testUserEmail,
  });

  const paymentId = `pay_http_test_${Date.now()}`;
  const validSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${order.order_id}|${paymentId}`)
    .digest('hex');

  // 2. Call HTTP POST /api/v1/payments/razorpay/verify
  console.log(`Sending HTTP POST to http://localhost:4000/api/v1/payments/razorpay/verify`);
  const response = await axios.post(
    'http://localhost:4000/api/v1/payments/razorpay/verify',
    {
      business_id: testBusinessId,
      plan_id: 'base',
      duration_months: 6,
      razorpay_order_id: order.order_id,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  console.log('HTTP Verification Response status:', response.status);
  console.log('HTTP Verification Response data:', JSON.stringify(response.data, null, 2));

  if (!response.data.success) {
    throw new Error('HTTP Verification failed');
  }

  // 3. Test HTTP Replay (Idempotency)
  console.log('Testing HTTP Idempotency (replay)...');
  const replayRes = await axios.post(
    'http://localhost:4000/api/v1/payments/razorpay/verify',
    {
      business_id: testBusinessId,
      plan_id: 'base',
      duration_months: 6,
      razorpay_order_id: order.order_id,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  console.log('Replay HTTP Response status:', replayRes.status);
  console.log('Replay data:', replayRes.data);
  if (!replayRes.data.data.already_processed) {
    throw new Error('Expected already_processed: true');
  }

  console.log('\nHTTP ENDPOINT END-TO-END TEST SUCCEEDED!');
}

testHttpEndpoint().catch((err) => {
  console.error('HTTP test failed:', err.response?.data || err.message);
  process.exit(1);
});
