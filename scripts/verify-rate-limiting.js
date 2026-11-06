const http = require('http');

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 8080,
        ...options,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function login(email, password) {
  const res = await httpRequest(
    {
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email, password },
  );
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`Login failed for ${email}: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

async function runVerification() {
  console.log('=====================================================');
  console.log('  KINERGY PLATFORM — RATE LIMITING VERIFICATION SUITE');
  console.log('=====================================================\n');

  // 1. Authenticate Owner & Receptionist upfront
  console.log('1. Authenticating test users...');
  const ownerToken = await login('owner@kinergy.platform', 'OwnerPassword123!');
  console.log('   ✓ Owner login successful (usr-owner).');
  const receptionToken = await login('reception.demo@kinergy.platform', 'DemoPass123!');
  console.log('   ✓ Receptionist login successful (usr-reception).\n');

  // 2. Scenario A: Normal Authenticated Navigation Across Modules (30 rapid requests)
  console.log(
    '2. Scenario A: Executing 30 sequential authenticated requests across modules (Owner)...',
  );
  const endpoints = [
    '/api/v1/gym/membership-plans',
    '/api/v1/gym/memberships',
    '/api/v1/clients',
    '/api/v1/auth/me',
    '/api/v1/gym/attendance/daily',
  ];

  let successCount = 0;
  let throttledCount = 0;
  for (let i = 1; i <= 30; i++) {
    const endpoint = endpoints[(i - 1) % endpoints.length];
    const res = await httpRequest({
      path: endpoint,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    if (res.statusCode === 200) {
      successCount++;
    } else if (res.statusCode === 429) {
      throttledCount++;
      console.error(`   ✗ Request #${i} (${endpoint}) throttled with 429!`);
    } else {
      console.warn(`   ! Request #${i} (${endpoint}) returned status ${res.statusCode}`);
    }
  }
  console.log(
    `   ✓ Results: ${successCount}/30 succeeded (200 OK), ${throttledCount} throttled (429).`,
  );
  if (throttledCount > 0) {
    throw new Error(
      `Scenario A FAILED: ${throttledCount} requests were throttled during normal navigation!`,
    );
  }

  // 3. Scenario B: Concurrent Burst Navigation (10 parallel requests)
  console.log(
    '\n3. Scenario B: Executing 10 concurrent requests to simulate rapid tab switching (Owner)...',
  );
  const burstEndpoints = [
    '/api/v1/gym/membership-plans',
    '/api/v1/gym/memberships',
    '/api/v1/clients',
    '/api/v1/auth/me',
    '/api/v1/gym/attendance/daily',
    '/api/v1/gym/membership-plans',
    '/api/v1/gym/memberships',
    '/api/v1/clients',
    '/api/v1/auth/me',
    '/api/v1/gym/attendance/daily',
  ];

  const burstResults = await Promise.all(
    burstEndpoints.map((ep) =>
      httpRequest({
        path: ep,
        method: 'GET',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
    ),
  );

  const burstSuccess = burstResults.filter((r) => r.statusCode === 200).length;
  const burst429 = burstResults.filter((r) => r.statusCode === 429).length;
  console.log(`   ✓ Burst Results: ${burstSuccess}/10 succeeded (200 OK), ${burst429} throttled.`);
  if (burst429 > 0) {
    throw new Error(`Scenario B FAILED: ${burst429} concurrent requests were throttled!`);
  }

  // 4. Scenario C: Second Authenticated User Bucket Isolation (Receptionist)
  console.log(
    '\n4. Scenario C: Executing 20 requests for second user (reception.demo@kinergy.platform)...',
  );
  let receptionSuccess = 0;
  let reception429 = 0;
  for (let i = 1; i <= 20; i++) {
    const endpoint = endpoints[(i - 1) % endpoints.length];
    const res = await httpRequest({
      path: endpoint,
      method: 'GET',
      headers: { Authorization: `Bearer ${receptionToken}` },
    });
    if (res.statusCode === 200) receptionSuccess++;
    if (res.statusCode === 429) reception429++;
  }
  console.log(
    `   ✓ Receptionist Results: ${receptionSuccess}/20 succeeded (200 OK), ${reception429} throttled.`,
  );
  if (reception429 > 0) {
    throw new Error(`Scenario C FAILED: Second user was throttled!`);
  }

  // 5. Scenario D: Sensitive Auth Endpoint Rate Limiting (@LoginThrottle: 5 reqs / 60s)
  console.log(
    '\n5. Scenario D: Verifying sensitive endpoint brute-force protection (/auth/login)...',
  );
  let authThrottled = false;
  let retryAfterHeader = null;
  let errorResponseBody = null;

  for (let i = 1; i <= 7; i++) {
    const res = await httpRequest(
      {
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'brute-force@kinergy.test', password: `Attempt${i}!` },
    );

    console.log(`   Attempt #${i}: Status ${res.statusCode}`);
    if (res.statusCode === 429) {
      authThrottled = true;
      retryAfterHeader = res.headers['retry-after'];
      errorResponseBody = res.body;
      console.log(
        `   ✓ Request #${i} correctly blocked by @LoginThrottle (429 Too Many Requests).`,
      );
      console.log(`     Retry-After: ${retryAfterHeader}`);
      console.log(`     Response Body:`, JSON.stringify(errorResponseBody));
      break;
    }
  }

  if (!authThrottled) {
    throw new Error('Scenario D FAILED: Login endpoint was not throttled after repeated attempts!');
  }

  // 6. Scenario E: Verify Authenticated Navigation Remains Functional Even When Unauth IP Bucket is Throttled
  console.log(
    '\n6. Scenario E: Verifying authenticated users are NOT impacted by unauthenticated IP throttle...',
  );
  const afterAuthThrottleRes = await httpRequest({
    path: '/api/v1/gym/membership-plans',
    method: 'GET',
    headers: { Authorization: `Bearer ${ownerToken}` },
  });

  console.log(
    `   Owner request status while login IP is throttled: ${afterAuthThrottleRes.statusCode}`,
  );
  if (afterAuthThrottleRes.statusCode !== 200) {
    throw new Error(
      `Scenario E FAILED: Authenticated user was incorrectly blocked with status ${afterAuthThrottleRes.statusCode}!`,
    );
  }

  const afterAuthReceptionRes = await httpRequest({
    path: '/api/v1/clients',
    method: 'GET',
    headers: { Authorization: `Bearer ${receptionToken}` },
  });
  console.log(
    `   Receptionist request status while login IP is throttled: ${afterAuthReceptionRes.statusCode}`,
  );
  if (afterAuthReceptionRes.statusCode !== 200) {
    throw new Error(
      `Scenario E FAILED: Second user was incorrectly blocked with status ${afterAuthReceptionRes.statusCode}!`,
    );
  }

  console.log(
    '   ✓ Both authenticated users navigate seamlessly while unauthenticated IP is throttled.',
  );

  console.log('\n=====================================================');
  console.log('  ALL RUNTIME VERIFICATION SCENARIOS PASSED (5/5)      ');
  console.log('=====================================================');
}

runVerification().catch((err) => {
  console.error('\nVerification FAILED with error:', err);
  process.exit(1);
});
