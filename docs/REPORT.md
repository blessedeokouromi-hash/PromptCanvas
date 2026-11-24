# PromptCanvas AI - build report

Date: 24 November 2026. Everything below states exactly what was built, what was tested, and what still needs something from outside.

## 1. Features successfully implemented (and how they were tested)

**Frontend (all pages render, smoke-tested 10/10 over HTTP)**
- Landing page with pricing, features, responsive premium dark design with gradients
- Sign up / sign in / forgot password (Supabase email + password)
- Dashboard: plan card, credit balance with bar, recent edits grid
- Editor: upload (drag/drop or tap, client-side downscale + JPEG compression), preview, 8 AI tools, prompt box, brush mask for object removal, progress indicator, download, history sidebar
- Pricing page with Paystack + Flutterwave buttons and server-side verify on return
- Account page: profile, password change, subscription status + expiry, payment history
- Admin dashboard: stats, user list + search, credit adjust (+10 / set), grant/revoke premium, transactions, ad placement editor

**Backend (Vercel serverless, real handlers tested 39/39 in integration tests)**
- `/api/me` profile + credits + plan (tested)
- `/api/upload` image storage with type/size validation (tested)
- `/api/edit` all 8 actions, atomic credit claim, automatic refund on failure (tested, including the refund path)
- `/api/history` per-user history isolation (tested)
- `/api/ads` ad config + premium flag (tested: free users get ad code, premium do not)
- `/api/payments/init` creates pending transaction and checkout link; amount fixed server-side (tested; real checkout needs provider keys)
- `/api/payments/verify` server-to-server confirmation with amount + currency checks (idempotency tested)
- Paystack webhook with HMAC-SHA512 signature verification (bad signature rejected, good accepted, duplicate ignored - tested)
- Flutterwave webhook with secret-hash verification (tested)
- `/api/payments/history` (tested)
- Admin routes gated by ADMIN_EMAILS (tested: non-admin blocked)
- `/api/cron/renew` daily Vercel cron: monthly 100-credit renewal, expiry downgrade (tested)
- Supabase schema with row-level security, atomic `claim_credit` SQL function, auto profile creation on signup

**AI (real providers, no simulation)**
- Background generation works TODAY with no key at all: real Pollinations Flux call, verified live during testing (real image generated and stored)
- Prompt editing, image-to-image, background swap, portrait editing: real Pollinations Kontext adapter built; the free tier currently requires a free "pollen" token, and the code was verified to fail honestly (with a clear message + credit refund) rather than fake a result when the token is absent
- Rate limiting on the free tier (~1 image/minute per IP) is handled with spaced retries
- Adsterra loading is live (code served per placement, only to free users)

## 2. Features requiring API keys (the app runs without them; each shows a clear message and refunds the credit)

- `POLLINATIONS_TOKEN` (FREE, enter.pollinations.ai): prompt edit, image-to-image, background swap, portrait edit
- `REMOVEBG_KEY` (free 50/month, remove.bg): true background removal with transparency
- `REPLICATE_API_TOKEN` (pay-per-use, pennies, replicate.com): 2x upscaling and object removal (brush mask → LaMa inpainting)
- Without keys, those buttons explain exactly which key to add. No fake results are ever shown.

## 3. Features requiring external account configuration

- Supabase project + schema (docs/SETUP.md step 1, one SQL paste)
- Vercel project + environment variables + deploy (step 2-3)
- Paystack business account + secret key + webhook URL (step 5)
- Flutterwave account + secret key + webhook URL + secret hash (step 5)
- Adsterra account + placement codes (step 6)
- Custom domain (optional): add in Vercel > Domains

## 4. Remaining problems / honest limits

- Payment flow is fully coded (init, verify, signed webhooks, idempotent activation, renewal) but could NOT be tested with real money because no Paystack/Flutterwave keys exist yet. First live payment should be done in test mode as described in SETUP.md step 5.
- Admin "monitor AI usage" is covered by stats (total edits, last-24h edits, failed edits) but there is no per-user usage chart yet.
- The in-memory rate limiter is per serverless instance (standard best-effort); the atomic credit system is the real limit enforcement and it is database-side.
- Email deliverability: Supabase's built-in sender is fine for testing; for production volume, add custom SMTP in Supabase Auth settings.
- Pollinations free tier ~1 image/minute per IP: fine for early users; the token (free) lifts this.
