export const BASE_URL = __ENV.BASE_URL || 'https://your-leap-worker-staging.accessdlsu.workers.dev'
// Provide a valid Firebase JWT here via environment variable when running the test
// e.g., k6 run -e TEST_TOKEN="eyJ..." load-tests/scenario-burst.js
export const TEST_TOKEN = __ENV.TEST_TOKEN || 'MISSING_TOKEN'
export const TARGET_EVENT_SLUG = __ENV.TARGET_EVENT_SLUG || 'test-event-123'
