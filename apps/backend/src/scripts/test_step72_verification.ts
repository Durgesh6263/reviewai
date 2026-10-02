import { resolveGoogleBusinessIdentity, maskEmail, normalizeGoogleReviewUrl } from '../modules/business/google-business';

async function runTests() {
  console.log('=== STEP 72 VERIFICATION TESTS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Email Masking
  console.log('--- Testing Email Masking ---');
  const email1 = maskEmail('durgeshjatale@gmail.com');
  assert(email1.endsWith('@gmail.com') && email1.startsWith('du') && email1.includes('***'), `Mask durgeshjatale@gmail.com -> ${email1}`);

  const email2 = maskEmail('johnsmith@gmail.com');
  assert(email2.endsWith('@gmail.com') && email2.startsWith('jo') && email2.includes('***'), `Mask johnsmith@gmail.com -> ${email2}`);

  const email3 = maskEmail('abc@gmail.com');
  assert(email3.endsWith('@gmail.com') && email3.startsWith('a') && email3.includes('*'), `Mask abc@gmail.com -> ${email3}`);

  const email4 = maskEmail('test.user@company.co.uk');
  assert(email4.endsWith('@company.co.uk') && email4.includes('***'), `Mask test.user@company.co.uk -> ${email4}`);

  // 2. URL Normalization
  console.log('\n--- Testing URL Normalization ---');
  const norm1 = normalizeGoogleReviewUrl('https://g.page/r/CYPgDr_K-_-CEBI/review?utm_source=qr');
  assert(norm1.includes('g.page/r/CYPgDr_K-_-CEBI/review') && !norm1.includes('utm_source'), `Normalized clean URL: ${norm1}`);

  const norm2 = normalizeGoogleReviewUrl('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4&feature=share');
  assert(norm2.includes('placeid=ChIJN1t_tDeuEmsRUsoyG83frY4'), `Normalized search URL: ${norm2}`);

  // 3. Identity Resolution
  console.log('\n--- Testing Google Business Identity Resolution ---');
  const res1 = await resolveGoogleBusinessIdentity('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
  assert(res1.placeId === 'ChIJN1t_tDeuEmsRUsoyG83frY4', `Place ID extracted: ${res1.placeId}`);

  const res2 = await resolveGoogleBusinessIdentity('https://g.page/r/CYPgDr_K-_-CEBI/review');
  assert(res2.placeId === 'CYPgDr_K-_-CEBI', `g.page Place ID token: ${res2.placeId}`);

  const res3 = await resolveGoogleBusinessIdentity('https://maps.google.com/?cid=123456789101112');
  assert(res3.placeId === 'cid:123456789101112', `CID identifier generated: ${res3.placeId}`);

  // 4. Different locations same name
  console.log('\n--- Testing Same Business Name Different Location ---');
  const resLocA = await resolveGoogleBusinessIdentity('https://search.google.com/local/writereview?placeid=LocationA_PlaceId123');
  const resLocB = await resolveGoogleBusinessIdentity('https://search.google.com/local/writereview?placeid=LocationB_PlaceId456');
  assert(resLocA.placeId !== resLocB.placeId, `Location A (${resLocA.placeId}) != Location B (${resLocB.placeId})`);

  // 5. Invalid URL Handling
  console.log('\n--- Testing Invalid URL Rejection ---');
  const nonGoogle = resolveGoogleBusinessIdentity('https://example.com/not-google');
  assert(!nonGoogle.isValid, `Non-Google URL rejected: ${nonGoogle.details}`);

  const malformed = resolveGoogleBusinessIdentity('invalid-url-string');
  assert(!malformed.isValid, `Malformed URL rejected: ${malformed.details}`);

  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
