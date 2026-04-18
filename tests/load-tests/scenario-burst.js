import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, TEST_TOKEN, TARGET_EVENT_SLUG } from './config.js';

export const options = {
  scenarios: {
    thundering_herd: {
      executor: 'ramping-arrival-rate',
      startRate: 500, // Starting at an aggressive 500 req/sec
      timeUnit: '1s',
      preAllocatedVUs: 3000, 
      maxVUs: 8000, // 8,000 concurrent sockets (The absolute physical maximum a standard Windows machine can handle before OS TCP failure)
      stages: [
        { target: 5000, duration: '20s' },  // Rapid scale to 5,000 req/sec
        { target: 10000, duration: '30s' }, // 10,000 req/sec for 30s = 300,000 API requests (Simulating the 30k student burst mathematically)
        { target: 0, duration: '10s' },     // Graceful drop
      ],
    },
  },
};

export function setup() {
  // Fetch the actual database ID for the dummy event slug
  const res = http.get(`${BASE_URL}/events/${TARGET_EVENT_SLUG}`);
  if (res.status !== 200) {
    throw new Error(`Failed to find event: ${TARGET_EVENT_SLUG}. Got status ${res.status}`);
  }
  return { eventId: res.json().data.id };
}

export default function (data) {
  // Scenario: "Thundering Herd" Write Burst
  // 10,000 students clicking the "Bookmark / Register" button the exact second 
  // slots are un-frozen. This evaluates D1 concurrency and write-locks.

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_TOKEN}`
    },
  };

  // The actual codebase toggle endpoint is /users/me/bookmarks/:eventId
  const res = http.post(`${BASE_URL}/users/me/bookmarks/${data.eventId}`, "{}", params);

  check(res, {
    // 201 Created (insert) or 200 OK (deleted/un-toggled)
    'status is 201 or 200': (r) => r.status === 201 || r.status === 200,
    // Writes take longer than reads, so p95 expectation is slightly relaxed
    'latency is acceptable (< 200ms)': (r) => r.timings.duration < 200,
  });
}
