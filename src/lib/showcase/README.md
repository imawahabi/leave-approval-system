# Showcase mock backend

This folder contains an **in-browser mock of the Supabase client** used
purely to present this app (screenshots, demos, portfolio reviews) without
standing up a backend.

## How it activates

`src/lib/supabase.ts` exports the mock client **only** when the app is
built or run with the environment variable:

```
VITE_SHOWCASE_MOCK=1 npm run dev
# or
VITE_SHOWCASE_MOCK=1 npm run build
```

With the variable unset (the default everywhere, including production
builds and deployments) the real Supabase client is created exactly as
before. The mock cannot activate accidentally: it requires the explicit
flag at build time, and even then it serves only the fictional seed data
in `mockData.ts` and makes no network calls.

## What it does

- `mockData.ts` - invented organisation (sectors, departments, leave
  types), 22 fictional leaders, and leave requests in every workflow
  state (pending stage 1 / stage 2, approved, archived, cancelled),
  generated relative to the current date so the UI always looks alive.
- `mockClient.ts` - the subset of the Supabase JS surface this app uses:
  table queries with embedded relations and filters, the review-queue and
  admin RPCs, the `civil-auth` edge function (any 12-digit civil ID +
  any 4-digit PIN signs in as the fictional admin), and OTP session
  handling persisted to `localStorage`.

## Demo sign-in

Open the app with the flag on, enter any 12-digit number as the civil ID
and any 4-digit PIN. You are signed in as the fictional system admin
(منى خالد السالم) with the full seeded dataset.
