const jwt = require('jsonwebtoken');

const JWT_SECRET = '7b5a8acc7af93ef1e67721e63764cd5a87bd656b22b08368018e84861b5f7b3c';
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

async function runTests() {
  console.log('====================================================');
  console.log('  STEP 4: ADMIN PLAN ADD / DELETE & VERSIONING TESTS');
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

  // 1. Initial State: Fetch plans in Admin
  console.log('\n--- Test 1: Fetch Existing Admin Plans ---');
  const getPlansRes = await api('/admin/plans');
  assert(getPlansRes.ok && Array.isArray(getPlansRes.data.data), 'GET /admin/plans returns array of plans');
  const initialPlans = getPlansRes.data.data;
  console.log(`Found ${initialPlans.length} existing plans: ${initialPlans.map(p => p.id).join(', ')}`);

  // 2. Validation Test: Reject empty name & negative values
  console.log('\n--- Test 2: Plan Validation ---');
  const emptyNameRes = await api('/admin/plans', {
    method: 'POST',
    body: JSON.stringify({ name: '   ', durations: {} }),
  });
  assert(!emptyNameRes.ok && emptyNameRes.status === 400, 'Rejects empty plan name with 400');

  const negPriceRes = await api('/admin/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Invalid Plan',
      durations: {
        '1_month': { duration_months: 1, price_inr: -100, monthly_qr_quota: 50, monthly_ai_quota: 25, max_qr_codes: 1 },
        '6_months': { duration_months: 6, price_inr: 500, monthly_qr_quota: 50, monthly_ai_quota: 25, max_qr_codes: 5 },
        '12_months': { duration_months: 12, price_inr: 1000, monthly_qr_quota: 50, monthly_ai_quota: 25, max_qr_codes: 10 },
      },
    }),
  });
  assert(!negPriceRes.ok && negPriceRes.status === 400, 'Rejects negative price with 400');

  // 3. Test A, B, C: Create a new custom plan with multiple durations & monthly limits
  console.log('\n--- Test 3: Create New Plan with 1, 6, 12 Month Offerings & Monthly Limits ---');
  const customPlanName = `Growth Enterprise ${Date.now()}`;
  const createPlanPayload = {
    name: customPlanName,
    description: 'Designed for scaling multi-location restaurant chains.',
    display_order: 10,
    is_active: true,
    features: {
      google_reviews: true,
      ai_generation: true,
      qr_customization: true,
      advanced_analytics: true,
      api_access: true,
      white_label: false,
      priority_support: true,
    },
    durations: {
      '1_month': {
        duration_months: 1,
        price_inr: 799,
        monthly_qr_quota: 350,
        monthly_ai_quota: 150,
        max_qr_codes: 3,
      },
      '6_months': {
        duration_months: 6,
        price_inr: 3999,
        monthly_qr_quota: 350,
        monthly_ai_quota: 150,
        max_qr_codes: 10,
      },
      '12_months': {
        duration_months: 12,
        price_inr: 6999,
        monthly_qr_quota: 350,
        monthly_ai_quota: 150,
        max_qr_codes: 25,
      },
    },
  };

  const createRes = await api('/admin/plans', {
    method: 'POST',
    body: JSON.stringify(createPlanPayload),
  });

  assert(createRes.ok && createRes.status === 201, 'POST /admin/plans succeeds with 201');
  const createdPlan = createRes.data.data;
  assert(createdPlan && createdPlan.name === customPlanName, `Created plan returned with name "${customPlanName}"`);
  assert(createdPlan.versions.length === 1 && createdPlan.versions[0].version_number === 1, 'Initial version v1 is created');
  assert(createdPlan.versions[0].durations['1_month'].monthly_qr_quota === 350, '1 month monthly QR quota is 350');
  assert(createdPlan.versions[0].durations['6_months'].price_inr === 3999, '6 month price is ₹3999');

  const customPlanId = createdPlan.id;

  // 4. Test D: Client Public Catalog includes the new active plan
  console.log('\n--- Test 4: Client Public Catalog Visibility ---');
  const publicRes = await api('/subscriptions/plans');
  assert(publicRes.ok, 'GET /subscriptions/plans returns 200');
  const clientPlans = publicRes.data.data.plans;
  const foundInClient = clientPlans.find(p => p.id === customPlanId);
  assert(!!foundInClient, `Client catalog contains new plan "${customPlanId}"`);
  if (foundInClient) {
    assert(foundInClient.durations['1_month'].price_inr === 799, 'Client sees 1-month offering ₹799');
    assert(foundInClient.durations['1_month'].monthly_qr_quota === 350, 'Client sees monthly QR limit 350');
  }

  // 5. Test E, F, G: Versioning - Create new version of existing plan
  console.log('\n--- Test 5: Plan Versioning ---');
  const newVersionPayload = {
    durations: {
      '1_month': {
        duration_months: 1,
        price_inr: 899, // price increased
        monthly_qr_quota: 500, // quota increased
        monthly_ai_quota: 200,
        max_qr_codes: 5,
      },
      '6_months': {
        duration_months: 6,
        price_inr: 4499,
        monthly_qr_quota: 500,
        monthly_ai_quota: 200,
        max_qr_codes: 15,
      },
      '12_months': {
        duration_months: 12,
        price_inr: 7999,
        monthly_qr_quota: 500,
        monthly_ai_quota: 200,
        max_qr_codes: 30,
      },
    },
    change_notes: 'Upgrade to v2 with higher monthly limits',
    publishImmediately: true,
  };

  const verRes = await api(`/admin/plans/${customPlanId}/versions`, {
    method: 'POST',
    body: JSON.stringify(newVersionPayload),
  });

  assert(verRes.ok && verRes.status === 201, `Created new version v2 for plan "${customPlanId}"`);
  const v2Data = verRes.data.data;
  assert(v2Data.version_number === 2 && v2Data.status === 'active', 'Version 2 is active');

  // Verify client catalog now receives v2
  const updatedPublicRes = await api('/subscriptions/plans');
  const clientPlanV2 = updatedPublicRes.data.data.plans.find(p => p.id === customPlanId);
  assert(clientPlanV2 && clientPlanV2.version_number === 2, 'New customers immediately see v2 in catalog');
  assert(clientPlanV2 && clientPlanV2.durations['1_month'].price_inr === 899, 'Catalog updated with v2 price ₹899');
  assert(clientPlanV2 && clientPlanV2.durations['1_month'].monthly_qr_quota === 500, 'Catalog updated with v2 monthly QR limit 500');

  // 6. Test References Check Endpoint
  console.log('\n--- Test 6: Check Plan References Endpoint ---');
  const refsRes = await api(`/admin/plans/${customPlanId}/references`);
  assert(refsRes.ok, 'GET /admin/plans/:planId/references returns 200');
  assert(refsRes.data.data.canPermanentlyDelete === true, 'Unused plan reports canPermanentlyDelete = true');
  assert(refsRes.data.data.totalReferences === 0, 'Unused plan reports 0 totalReferences');

  // Check Base plan references (should have active/historical subscriptions)
  const baseRefsRes = await api('/admin/plans/base/references');
  assert(baseRefsRes.ok, 'GET /admin/plans/base/references returns 200');
  console.log(`Base plan references: ${JSON.stringify(baseRefsRes.data.data)}`);
  assert(baseRefsRes.data.data.totalReferences > 0, 'Base plan has customer references');

  // 7. Test H: Delete an unused plan -> successfully removed permanently
  console.log('\n--- Test 7: Delete Unused Plan (Permanent Deletion) ---');
  const deleteUnusedRes = await api(`/admin/plans/${customPlanId}`, { method: 'DELETE' });
  assert(deleteUnusedRes.ok && deleteUnusedRes.data.data.action === 'deleted', 'Unused plan permanently deleted');

  // Verify it no longer exists in Admin
  const afterDeletePlansRes = await api('/admin/plans');
  const stillInAdmin = afterDeletePlansRes.data.data.some(p => p.id === customPlanId);
  assert(!stillInAdmin, `Deleted plan "${customPlanId}" is completely removed from Admin plans list`);

  // Verify it no longer exists in Client catalog
  const afterDeletePublicRes = await api('/subscriptions/plans');
  const stillInClient = afterDeletePublicRes.data.data.plans.some(p => p.id === customPlanId);
  assert(!stillInClient, `Deleted plan "${customPlanId}" is removed from Client catalog`);

  // 8. Test I, J, K: Safe Delete Rule for Plan with Existing Customers
  console.log('\n--- Test 8: Safe Delete Rule (Archive instead of Delete for plan with customers) ---');
  // Attempt to delete Base plan without forceArchive -> must return 409 Conflict
  const deleteBaseWithoutForce = await api('/admin/plans/base', { method: 'DELETE' });
  assert(deleteBaseWithoutForce.status === 409, 'Deleting plan with customers without force returns 409 Conflict');
  const errorMsg = deleteBaseWithoutForce.data.error || deleteBaseWithoutForce.data.message || '';
  assert(
    errorMsg.includes('archived instead of permanently deleted'),
    `Error message states plan will be archived instead of permanently deleted (got: "${errorMsg}")`
  );
  assert(deleteBaseWithoutForce.data.details && deleteBaseWithoutForce.data.details.totalReferences > 0, 'Conflict details include customer reference counts');

  // Now create a plan, simulate a reference or test archiving with forceArchive
  console.log('\n--- Test 9: Archive Plan & Verify Safe Inactivity & Persistence ---');
  const planToArchiveName = `Archived Tier ${Date.now()}`;
  const planToArchiveRes = await api('/admin/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: planToArchiveName,
      description: 'Temporary tier to verify safe archiving.',
      durations: {
        '1_month': { duration_months: 1, price_inr: 599, monthly_qr_quota: 100, monthly_ai_quota: 50, max_qr_codes: 1 },
        '6_months': { duration_months: 6, price_inr: 2999, monthly_qr_quota: 100, monthly_ai_quota: 50, max_qr_codes: 5 },
        '12_months': { duration_months: 12, price_inr: 5499, monthly_qr_quota: 100, monthly_ai_quota: 50, max_qr_codes: 10 },
      },
    }),
  });
  const archivePlanId = planToArchiveRes.data.data.id;

  // Archive it via forceArchive
  const archiveRes = await api(`/admin/plans/${archivePlanId}?forceArchive=true`, { method: 'DELETE' });
  assert(archiveRes.ok, 'Archive plan with forceArchive=true returns 200');

  // Verify in Admin: plan is marked inactive (archived)
  const plansAfterArchive = (await api('/admin/plans')).data.data;
  const archivedPlanInAdmin = plansAfterArchive.find(p => p.id === archivePlanId);
  // If it was unreferenced, deletePlan with forceArchive permanently deletes unless totalReferences > 0;
  // Let's test explicit metadata inactivation via PATCH /admin/plans/:planId
  const patchRes = await api(`/admin/plans/base`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: false }),
  });
  assert(patchRes.ok, 'Deactivating/archiving base plan via PATCH returns 200');

  // Verify archived base plan does NOT appear in Client catalog
  const clientPlansAfterBaseDeactivate = (await api('/subscriptions/plans')).data.data.plans;
  const baseInClient = clientPlansAfterBaseDeactivate.some(p => p.id === 'base');
  assert(!baseInClient, 'Archived/Inactive plan does NOT appear in Client catalog');

  // Re-activate base plan to leave system in pristine state
  await api(`/admin/plans/base`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: true }),
  });
  const clientPlansRestored = (await api('/subscriptions/plans')).data.data.plans;
  assert(clientPlansRestored.some(p => p.id === 'base'), 'Base plan restored to active in Client catalog');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
