# PromptCanvas AI

A production-ready AI image editing web app: prompt-based editing, background removal/replacement/generation, enhancement, upscaling, portrait editing and object removal, with a credit system, subscriptions (Paystack + Flutterwave), an admin dashboard and Adsterra ads for free users.

Built as a static frontend + Vercel serverless backend + Supabase (auth, database, storage). No build step, no framework to learn.

## Quick start

See **docs/SETUP.md** for the full no-code walkthrough. In short:

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Put the project URL + anon key into `supabase-config.json`.
3. Import the repo on Vercel, add environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`), deploy.
4. Optional keys (all free tiers available): `POLLINATIONS_TOKEN` (editing tools), `REMOVEBG_KEY` (background removal), `REPLICATE_API_TOKEN` (upscaling, object removal).
5. Payment keys: `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLW_WEBHOOK_HASH` (+ webhook URLs in each dashboard).
6. Ads: paste Adsterra snippets in `/admin.html`.

## Architecture

- `public/` - the entire frontend (landing, auth, dashboard, editor, pricing, account, admin). Pure HTML/CSS/JS, dark premium design, fully responsive.
- `api/` - Vercel serverless functions. All secrets stay in environment variables.
- `supabase/schema.sql` - tables, row-level security, and the atomic SQL functions that guard credits (`claim_credit`, `refund_credit`, `renew_subscriptions`).

### Security model

- Credits live in the database and are spent by an atomic SQL function, so no client can bypass daily/monthly limits.
- Prices live on the server (`api/lib/plans.js`); clients only ever send a plan name.
- Premium activates ONLY after a server-to-server verification with the payment provider (or a properly signed webhook). A browser redirect alone never activates anything.
- Webhook signatures are verified (Paystack HMAC-SHA512, Flutterwave verif-hash) and activation is idempotent, so replayed webhooks cannot double-credit.
- Failed AI processing automatically refunds the credit.
- Admin routes require a signed-in user whose email is in `ADMIN_EMAILS`.

## Tests

`npm test` runs an integration suite against an in-memory Supabase emulator with the REAL handlers and a REAL Pollinations call: signup, credits, deduction, limit bypass prevention, refund-on-failure, history isolation, payment webhooks (bad + good signatures), idempotent activation, monthly renewal, expiry downgrade, admin gate and ad delivery. 39 checks, all passing.

## Honest status

See **docs/REPORT.md** for what is tested, what needs a key, and what is left.
