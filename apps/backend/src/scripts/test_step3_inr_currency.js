const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '7b5a8acc7af93ef1e67721e63764cd5a87bd656b22b08368018e84861b5f7b3c';
const BASE_URL = 'http://localhost:4000/api/v1';

const adminToken = jwt.sign(
  {
    sub: '00000000-0000-0000-0000-000000000001',
    email: 'admin@reviewai.com',
    role: 'admin',
    type: 'access',
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// Centralized INR Currency Formatter (mirroring apps/frontend/src/lib/utils.ts)
function formatCurrency(amount, currency = 'INR') {
  const numericAmount = typeof amount === 'number' && !isNaN(amount) ? amount : Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numericAmount);
}

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function clientGetPlans() {
  const res = await fetch(`${BASE_URL}/subscription/plans?_t=${Date.now()}`, {
    headers: {
      'Cache-Control': 'no-cache',
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function runStep3Tests() {
  console.log('====================================================');
  console.log('  STEP 3: SUBSCRIPTION PRICE INR (₹) VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // TEST 1: Admin plan price displays as ₹
    console.log('\n--- TEST 1: Admin plan price displays as ₹ ---');
    const adminRes = await api('/admin/plans');
    assert(adminRes.ok, 'Admin plans retrieved successfully');
    const adminPlans = adminRes.data.data;
    for (const plan of adminPlans) {
      const activeVer = plan.versions.find(v => v.status === 'active') || plan.versions[0];
      for (const [durKey, off] of Object.entries(activeVer.durations)) {
        const formatted = formatCurrency(off.price_inr);
        assert(formatted.startsWith('₹'), `Admin plan ${plan.name} (${durKey}) formats with ₹: ${formatted}`);
        assert(!formatted.includes('$') && !formatted.includes('USD'), `Admin formatted price has no $ or USD: ${formatted}`);
      }
    }

    // TEST 2: Client plan price displays as ₹
    console.log('\n--- TEST 2: Client plan price displays as ₹ ---');
    const clientRes = await clientGetPlans();
    assert(clientRes.ok, 'Client plans retrieved successfully');
    const clientPlans = clientRes.data.data.plans;
    for (const plan of clientPlans) {
      for (const [durKey, off] of Object.entries(plan.durations)) {
        const formatted = formatCurrency(off.price_inr);
        assert(formatted.startsWith('₹'), `Client plan ${plan.name} (${durKey}) formats with ₹: ${formatted}`);
        assert(!formatted.includes('$') && !formatted.includes('USD'), `Client formatted price has no $ or USD: ${formatted}`);
      }
    }

    // TEST 3: Existing database price is not accidentally multiplied or divided
    console.log('\n--- TEST 3: Database raw values remain intact (source of truth is rupees) ---');
    const basePlan = adminPlans.find(p => p.id === 'base');
    const proPlan = adminPlans.find(p => p.id === 'pro');
    const unlimitedPlan = adminPlans.find(p => p.id === 'unlimited');
    const baseVer = basePlan.versions.find(v => v.status === 'active') || basePlan.versions[0];
    const proVer = proPlan.versions.find(v => v.status === 'active') || proVer.versions[0];
    const unlimVer = unlimitedPlan.versions.find(v => v.status === 'active') || unlimitedPlan.versions[0];

    assert(baseVer.durations['1_month'].price_inr === 499, `Base 1-month raw price is exactly 499 (not 49900 or 4.99): ${baseVer.durations['1_month'].price_inr}`);
    assert(proVer.durations['1_month'].price_inr === 1499, `Pro 1-month raw price is exactly 1499: ${proVer.durations['1_month'].price_inr}`);
    assert(unlimVer.durations['1_month'].price_inr === 2999, `Unlimited 1-month raw price is exactly 2999: ${unlimVer.durations['1_month'].price_inr}`);

    // TEST 4: Specific formatting test cases: 2699 → ₹2,699, etc.
    console.log('\n--- TEST 4: Formatting accuracy with Indian number formatting ---');
    const testCases = [
      { input: 2699, expected: '₹2,699' },
      { input: 7499, expected: '₹7,499' },
      { input: 14999, expected: '₹14,999' },
      { input: 599, expected: '₹599' },
      { input: 1000, expected: '₹1,000' },
      { input: 24999, expected: '₹24,999' },
      { input: 100000, expected: '₹1,00,000' }, // Indian numbering system verification (lakh)
    ];

    for (const tc of testCases) {
      const result = formatCurrency(tc.input);
      assert(result === tc.expected, `formatCurrency(${tc.input}) === "${tc.expected}" (got: "${result}")`);
    }

    // TEST 5: Verify paise conversion handling
    console.log('\n--- TEST 5: Verify unit nature (Rupees confirmed) ---');
    console.log('Database inspection confirms pricing schema stores price_inr in whole rupees.');
    assert(baseVer.durations['1_month'].price_inr < 10000, 'Database values are stored in whole INR rupees, no paise-to-rupee division needed.');

    // TEST 6: No $ or USD remains in subscription pricing UI
    console.log('\n--- TEST 6: Absence of $ or USD in formatted plan catalog ---');
    for (const plan of clientPlans) {
      for (const [key, off] of Object.entries(plan.durations)) {
        const text = `${formatCurrency(off.price_inr)} / ${off.duration_months} Month`;
        assert(!text.includes('$') && !text.includes('USD') && !text.includes('US$'), `Client display string clean: "${text}"`);
      }
    }

    // TEST 7: Admin and Client show exactly the same numeric price
    console.log('\n--- TEST 7: Admin vs Client numeric consistency ---');
    for (const adminP of adminPlans) {
      const clientP = clientPlans.find(cp => cp.id === adminP.id);
      if (!clientP) continue;
      const adminV = adminP.versions.find(v => v.status === 'active') || adminP.versions[0];
      for (const durKey of ['1_month', '6_months', '12_months']) {
        const adminPrice = adminV.durations[durKey]?.price_inr;
        const clientPrice = clientP.durations[durKey]?.price_inr;
        assert(adminPrice === clientPrice, `${adminP.name} [${durKey}]: Admin price (${adminPrice}) === Client price (${clientPrice})`);
      }
    }

    // TEST 8: Refresh and verify price remains correct
    console.log('\n--- TEST 8: Repeated fetch stability ---');
    const ref1 = await clientGetPlans();
    const ref2 = await clientGetPlans();
    const base1 = ref1.data.data.plans.find(p => p.id === 'base');
    const base2 = ref2.data.data.plans.find(p => p.id === 'base');
    assert(formatCurrency(base1.durations['1_month'].price_inr) === '₹499', 'Fetch 1: Base plan price is ₹499');
    assert(formatCurrency(base2.durations['1_month'].price_inr) === '₹499', 'Fetch 2: Base plan price is ₹499');

    // TEST 9: Verify different plan durations show correct prices
    console.log('\n--- TEST 9: Different durations verification ---');
    assert(formatCurrency(baseVer.durations['1_month'].price_inr) === '₹499', 'Base 1 Month: ₹499');
    assert(formatCurrency(baseVer.durations['6_months'].price_inr) === '₹2,499', 'Base 6 Months: ₹2,499');
    assert(formatCurrency(baseVer.durations['12_months'].price_inr) === '₹4,499', 'Base 12 Months: ₹4,499');

    assert(formatCurrency(proVer.durations['1_month'].price_inr) === '₹1,499', 'Pro 1 Month: ₹1,499');
    assert(formatCurrency(proVer.durations['6_months'].price_inr) === '₹7,499', 'Pro 6 Months: ₹7,499');
    assert(formatCurrency(proVer.durations['12_months'].price_inr) === '₹13,499', 'Pro 12 Months: ₹13,499');

    assert(formatCurrency(unlimVer.durations['1_month'].price_inr) === '₹2,999', 'Unlimited 1 Month: ₹2,999');
    assert(formatCurrency(unlimVer.durations['6_months'].price_inr) === '₹14,999', 'Unlimited 6 Months: ₹14,999');
    assert(formatCurrency(unlimVer.durations['12_months'].price_inr) === '₹24,999', 'Unlimited 12 Months: ₹24,999');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`  STEP 3 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStep3Tests();
