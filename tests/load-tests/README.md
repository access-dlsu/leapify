# Leapify Load Testing with k6

Simulate 30,000 concurrently active students attempting to read data and register for events.

## Prerequisites

1. Deploy Leapify to a **staging** Cloudflare environment first: `wrangler deploy --env staging`. **Do not load test `localhost`**.
2. Install [k6](https://k6.io/docs/get-started/installation/).
   - macOS: `brew install k6`
   - Windows: `winget install k6`
3. Obtain a **valid Firebase JWT**. Log into your test UI (`http://localhost:3000`), copy the JWT from the token viewer, and save it.

## The Scenarios

### 1. Polling Tsunami (Read/Cache Test)

Simulates students sitting on the event page, polling `GET /events/:slug/slots` every 5 seconds waiting for the event to open. Evaluates Cloudflare KV caching performance.

```bash
k6 run \
  -e BASE_URL="https://your-leap-worker-staging.accessdlsu.workers.dev" \
  -e TARGET_EVENT_SLUG="test-event-123" \
  load-tests/scenario-polling.js
```

### 2. Thundering Herd (Write/D1 DB Test)

Simulates the exact second registration opens, where thousands of users fire `POST` requests simultaneously. Evaluates D1 queueing, transaction handling, and write locks.

```bash
k6 run \
  -e BASE_URL="https://your-leap-worker-staging.accessdlsu.workers.dev" \
  -e TARGET_EVENT_SLUG="test-event-123" \
  -e TEST_TOKEN="eyJhbGciOiJSUzI1NiIsImt..." \
  load-tests/scenario-burst.js
```
