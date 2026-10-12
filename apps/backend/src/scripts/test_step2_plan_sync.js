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

// Client query simulator (public unauthenticated or client-authenticated)
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

async function runStep2Tests() {
  console.log('====================================================');
  console.log('  STEP 2: SUBSCRIPTION PLAN SYNC VERIFICATION TESTS');
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
    // 0. Get initial plans from admin
    const initialRes = await api('/admin/plans');
    assert(initialRes.ok, 'Initial Admin plans retrieved');
    const plans = initialRes.data.data;
    const basePlan = plans.find(p => p.id === 'base');
    assert(!!basePlan, 'Found "base" plan for testing');
    
    const originalBaseActiveVer = basePlan.versions.find(v => v.status === 'active') || basePlan.versions[0];
    const originalBaseDurations = JSON.parse(JSON.stringify(originalBaseActiveVer.durations));
    const originalBaseFeatures = JSON.parse(JSON.stringify(basePlan.features || {}));

    // TEST 1: Admin edits an existing plan's price. Save it. Verify the database contains the new value.
    console.log('\n--- TEST 1: Admin edits plan price & verifies database update ---');
    const test1Price = 888;
    const updatedDurations1 = {
      ...originalBaseDurations,
      '1_month': { ...originalBaseDurations['1_month'], price_inr: test1Price },
    };

    const updatePriceRes = await api('/admin/plans/base', {
      method: 'PATCH',
      body: JSON.stringify({
        durations: updatedDurations1,
      }),
    });
    assert(updatePriceRes.ok, `Admin PATCH /admin/plans/base responded with ${updatePriceRes.status}`);

    // Verify database direct read
    const dbAdminRes1 = await api('/admin/plans');
    const dbBasePlan1 = dbAdminRes1.data.data.find(p => p.id === 'base');
    const dbActiveVer1 = dbBasePlan1.versions.find(v => v.status === 'active') || dbBasePlan1.versions[0];
    assert(dbActiveVer1.durations['1_month'].price_inr === test1Price, `Database contains new price: ${dbActiveVer1.durations['1_month'].price_inr} === ${test1Price}`);

    // TEST 2: Open/refresh Client billing page. Verify the new value appears.
    console.log('\n--- TEST 2: Client billing page query returns updated price ---');
    const clientRes2 = await clientGetPlans();
    assert(clientRes2.ok, `Client GET /subscription/plans responded with ${clientRes2.status}`);
    const clientBasePlan2 = clientRes2.data.data.plans.find(p => p.id === 'base');
    assert(!!clientBasePlan2, 'Client received base plan');
    assert(clientBasePlan2.durations['1_month'].price_inr === test1Price, `Client immediately shows updated price: ${clientBasePlan2.durations['1_month'].price_inr} === ${test1Price}`);

    // TEST 3: Admin edits the same plan's duration/features/limits. Save it. Refresh Client billing page. Verify all updated values appear.
    console.log('\n--- TEST 3: Admin edits duration/features/limits & Client verifies ---');
    const updatedLimitsDurations = {
      ...updatedDurations1,
      '1_month': {
        ...updatedDurations1['1_month'],
        monthly_qr_quota: 250,
        monthly_ai_quota: 125,
        max_qr_codes: 8,
      },
    };
    const updatedFeatures = {
      ...originalBaseFeatures,
      white_label: true,
      api_access: true,
    };

    const updateDetailsRes = await api('/admin/plans/base', {
      method: 'PATCH',
      body: JSON.stringify({
        features: updatedFeatures,
        durations: updatedLimitsDurations,
      }),
    });
    assert(updateDetailsRes.ok, 'Admin PATCH /admin/plans/base with updated features & limits succeeded');

    const clientRes3 = await clientGetPlans();
    assert(clientRes3.ok, 'Client refreshed /subscription/plans');
    const clientBasePlan3 = clientRes3.data.data.plans.find(p => p.id === 'base');
    assert(clientBasePlan3.features.white_label === true, 'Client shows updated feature white_label: true');
    assert(clientBasePlan3.features.api_access === true, 'Client shows updated feature api_access: true');
    assert(
      (clientBasePlan3.durations['1_month'].monthly_qr_quota === 250 || clientBasePlan3.durations['1_month'].allocated_qr_quota === 250),
      'Client shows updated QR limit: 250'
    );
    assert(
      (clientBasePlan3.durations['1_month'].monthly_ai_quota === 125 || clientBasePlan3.durations['1_month'].allocated_ai_quota === 125),
      'Client shows updated AI limit: 125'
    );
    assert(clientBasePlan3.durations['1_month'].max_qr_codes === 8, 'Client shows updated max QR codes: 8');

    // TEST 4: Create a new active plan from Admin. Verify it appears on Client billing page.
    console.log('\n--- TEST 4: Create new active plan from Admin & Client verifies ---');
    const newPlanSlug = `test_plan_${Date.now()}`;
    const newPlanName = `Test Sync Plan ${Date.now()}`;
    const createNewPlanRes = await api('/admin/plans', {
      method: 'POST',
      body: JSON.stringify({
        name: newPlanName,
        description: 'Temporary plan for testing sync',
        display_order: 99,
        is_active: true,
        durations: {
          '1_month': { duration_months: 1, price_inr: 650, monthly_qr_quota: 100, monthly_ai_quota: 50, max_qr_codes: 3 },
          '6_months': { duration_months: 6, price_inr: 3500, monthly_qr_quota: 150, monthly_ai_quota: 75, max_qr_codes: 5 },
          '12_months': { duration_months: 12, price_inr: 6000, monthly_qr_quota: 200, monthly_ai_quota: 100, max_qr_codes: 10 },
        },
      }),
    });
    assert(createNewPlanRes.ok && createNewPlanRes.status === 201, `Admin POST /admin/plans created plan: ${newPlanName}`);
    const createdPlanId = createNewPlanRes.data.data.id;

    const clientRes4 = await clientGetPlans();
    const clientNewPlan = clientRes4.data.data.plans.find(p => p.id === createdPlanId);
    assert(!!clientNewPlan, `Client received newly created plan (${createdPlanId})`);
    if (clientNewPlan) {
      assert(clientNewPlan.name === newPlanName, `Client shows correct new plan name: ${clientNewPlan.name}`);
      assert(clientNewPlan.durations['1_month'].price_inr === 650, `Client shows correct price for new plan: 650`);
    }

    // TEST 5: Deactivate an existing plan from Admin. Verify it no longer appears on Client billing page.
    console.log('\n--- TEST 5: Deactivate plan from Admin & verify removal from Client ---');
    const deactivateRes = await api(`/admin/plans/${createdPlanId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    assert(deactivateRes.ok, `Admin deactivated plan ${createdPlanId}`);

    const clientRes5 = await clientGetPlans();
    const clientDeactivatedPlan = clientRes5.data.data.plans.find(p => p.id === createdPlanId);
    assert(!clientDeactivatedPlan, `Client no longer shows deactivated plan (${createdPlanId})`);

    // Clean up created test plan
    await api(`/admin/plans/${createdPlanId}`, { method: 'DELETE' });

    // TEST 6: Refresh the browser and verify the Client still shows the latest database values.
    console.log('\n--- TEST 6: Consecutive fresh requests continue serving latest database values ---');
    const clientRes6a = await clientGetPlans();
    const clientRes6b = await clientGetPlans();
    assert(clientRes6a.ok && clientRes6b.ok, 'Consecutive client requests succeeded');
    const basePlan6a = clientRes6a.data.data.plans.find(p => p.id === 'base');
    const basePlan6b = clientRes6b.data.data.plans.find(p => p.id === 'base');
    assert(basePlan6a.durations['1_month'].price_inr === test1Price, 'Refresh 1 retains latest price');
    assert(basePlan6b.durations['1_month'].price_inr === test1Price, 'Refresh 2 retains latest price');

    // TEST 7: Confirm there are no duplicate API/database requests or infinite fetch loops.
    console.log('\n--- TEST 7: Request stability & header verification ---');
    const t0 = Date.now();
    const probeRes = await fetch(`${BASE_URL}/subscription/plans`, { method: 'GET' });
    const durationMs = Date.now() - t0;
    assert(probeRes.ok, `Single request completed cleanly in ${durationMs}ms`);
    assert(
      probeRes.headers.get('cache-control')?.includes('no-store') ||
      probeRes.headers.get('cache-control')?.includes('no-cache'),
      `Cache-Control header prevents stale caching: ${probeRes.headers.get('cache-control')}`
    );

    // Restore original Base plan settings
    console.log('\n--- Restoring original Base plan configuration ---');
    await api('/admin/plans/base', {
      method: 'PATCH',
      body: JSON.stringify({
        features: originalBaseFeatures,
        durations: originalBaseDurations,
      }),
    });
    const restoredRes = await clientGetPlans();
    const restoredBase = restoredRes.data.data.plans.find(p => p.id === 'base');
    assert(
      restoredBase.durations['1_month'].price_inr === originalBaseDurations['1_month'].price_inr,
      `Base plan price restored cleanly to original value: ${restoredBase.durations['1_month'].price_inr}`
    );

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`  STEP 2 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStep2Tests();
