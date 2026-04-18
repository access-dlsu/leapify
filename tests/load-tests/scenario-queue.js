import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './config.js';

export const options = {
  scenarios: {
    queue_spam: {
      executor: 'shared-iterations',
      // We only need exactly 100 HTTP requests, because the backend endpoint 
      // multiplies it by enqueuing 100 jobs internally per request.
      // 100 network requests * 100 queue jobs = exactly 10,000 queue payloads.
      vus: 50,
      iterations: 100, 
      maxDuration: '20s',
    },
  },
};

export default function () {
  // Scenario: Massive async offloading.
  // Tests if Cloudflare's backend Queue system can digest 10k messages.
  
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(`${BASE_URL}/health/queue-burst`, "{}", params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'latency is acceptable (< 200ms)': (r) => r.timings.duration < 200,
  });
}
