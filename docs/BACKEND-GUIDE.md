# Leapify Backend Setup Guide

This guide walks through the process of obtaining all required API keys and setting up your environment for Leapify.

## 1. Local Environment Setup

Copy `.dev.vars.example` to `.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
```

---

## 2. Infrastructure Bindings (Cloudflare)

You must create these resources in your Cloudflare dashboard and update `wrangler.toml`:

- **D1 Database**: `wrangler d1 create leapify`
- **KV Namespace**: `wrangler kv namespace create LEAPIFY_KV`
- **Queue**: Create `leapify-email-queue` and `leapify-email-dlq` in the Queues dashboard.
- **R2 Bucket** (Optional): `wrangler r2 bucket create leapify-files`

---

## 3. Obtaining Service API Keys

### [Google OAuth (Authentication)](https://console.cloud.google.com/apis/credentials)

Leapify uses Google Identity Services (GIS) to verify student JWTs.

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Select your project (or create one).
3. Go to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
5. Select **Web application** as the application type.
6. Add your frontend domain to **Authorized JavaScript origins** (e.g., `http://localhost:3000`).
7. Copy the **Client ID** (format: `xxx.apps.googleusercontent.com`).
8. Set `GOOGLE_CLIENT_ID` in your `.dev.vars` or `wrangler secret put`.

### [Google Forms (Slots & Registration)](https://console.cloud.google.com/)

Leapify tracks real-time slots via Google Forms Webhooks.

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Search for and **enable the Google Forms API**.
3. Go to **IAM & Admin > Service Accounts**.
4. Create a Service Account, then go to **Keys > Add Key > Create New Key (JSON)**.
5. **CRITICAL: Grant Form Access**:
   - Copy the `client_email` from your service account JSON.
   - Go to every Google Form you want Leapify to track.
   - Click **More (three dots) > Add collaborators**.
   - Paste the service account email and grant it **Editor** access.
6. `GFORMS_SERVICE_ACCOUNT_JSON`: Paste the content of that JSON file into `.dev.vars` (as a single-quoted string if it contains multiple lines).
