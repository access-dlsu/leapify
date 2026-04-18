import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, TARGET_EVENT_SLUG } from './config.js';

export const options = {
  // Simulating the "Waiting Room" phase: 
  // 30,000 students polling every 5 seconds = ~6,000 requests per second.
  // We simulate ramping up to 6,000 active virtual users to push the KV cache.
  stages: [
    { duration: '10s', target: 200 },  // Ramp up safely
    { duration: '30s', target: 500 },  // 500 VUs is plenty to see cache performance on a local ISP!
    { duration: '10s', target: 0 },    // Drop off
  ],
};

export default function () {
  // Scenario: Students sit on the frontend waiting for registration to open.
  // The frontend automatically polls the slots endpoint.
  // This should hit the Cloudflare KV cache perfectly and bypass D1.
  
  const res = http.get(`${BASE_URL}/events/${TARGET_EVENT_SLUG}/slots`);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    // Expected to be extremely fast because of KV cache (<50ms)
    'latency is acceptable (< 50ms)': (r) => r.timings.duration < 50,
  });

  // The client polls every 5 seconds. We add a tiny bit of random jitter so 
  // requests don't all magically synchronize into perfect blocks.
  sleep(5 + Math.random());
}
