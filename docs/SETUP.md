# PromptCanvas AI - setup guide (step by step)

Everything below is done in a browser. No coding needed.

## Step 1 - Supabase (accounts + database)

1. Go to supabase.com and sign in.
2. Click **New project**. Name it `promptcanvas`. Pick a strong database password (save it somewhere safe). Choose the region closest to you (or EU/US, it does not matter much). Wait for it to finish creating.
3. In the left sidebar go to **SQL Editor** > **New query**. Open the file `supabase/schema.sql` in this repo, copy EVERYTHING inside it, paste it into the SQL editor and click **RUN**. You should see "Success. No rows returned".
4. Go to **Project Settings** (gear icon) > **API**. You will see:
   - Project URL (looks like `https://xxxx.supabase.co`)
   - anon public key
   - service_role key (click Reveal)
5. Open `supabase-config.json` in the repo and fill in the Project URL and the **anon public** key (NOT the service_role key - that one never goes in a file):
   ```json
   { "url": "https://xxxx.supabase.co", "key": "your-anon-public-key" }
   ```
6. Also allow email signups without confirmation while testing: **Authentication** > **Sign In / Providers** > turn OFF "Confirm email". (You can turn it back on later.)

## Step 2 - Push to GitHub and deploy on Vercel

1. The repo is already on GitHub: `blessedeokouromi-hash/PromptCanvas`.
2. Go to vercel.com and sign in with GitHub. Click **Add New** > **Project** > import `PromptCanvas`.
3. Leave all build settings as Vercel suggests (it detects no build step). Click **Deploy**.
4. After it deploys you get a URL like `promptcanvas-xxx.vercel.app`.

## Step 3 - Environment variables (Vercel)

In Vercel: your PromptCanvas project > **Settings** > **Environment Variables**. Add these one by one (same values for Production, Preview and Development):

| Name | Where to get it |
|---|---|
| SUPABASE_URL | Supabase > Settings > API > Project URL |
| SUPABASE_ANON_KEY | Supabase > Settings > API > anon public |
| SUPABASE_SERVICE_ROLE_KEY | Supabase > Settings > API > service_role (SECRET - never share) |
| ADMIN_EMAILS | your email, e.g. `blessedeokouromi@gmail.com` |

After adding, **Redeploy** the project (Deployments tab > latest > Redeploy).

## Step 4 - AI keys (optional but recommended)

| Feature | Works without a key? | Key needed | Where to get it |
|---|---|---|---|
| Background generation | YES, free | none | - |
| Prompt edit, image-to-image, background swap, portrait | no | POLLINATIONS_TOKEN (free) | enter.pollinations.ai |
| Background removal | no | REMOVEBG_KEY | remove.bg (free: 50/month) |
| Upscale 2x | no | REPLICATE_API_TOKEN | replicate.com |
| Object removal | no | REPLICATE_API_TOKEN | replicate.com |

Add the keys to Vercel environment variables (same place as Step 3), then Redeploy.
`POLLINATIONS_TOKEN` is free: sign up at enter.pollinations.ai and copy the token.

## Step 5 - Payments

### Paystack
1. Create/verify a Paystack business account (paystack.com). Verification is required to receive real money.
2. Dashboard > **Settings** > **API Keys & Webhooks**: copy the **Secret key**.
3. Add to Vercel env: `PAYSTACK_SECRET_KEY`.
4. On the same page set the **Webhook URL** to `https://YOUR-VERCEL-URL/api/payments/webhook-paystack`.

### Flutterwave
1. Create/verify a Flutterwave account (flutterwave.com).
2. Dashboard > **Settings** > **API**: copy the **Secret key**.
3. Add to Vercel env: `FLUTTERWAVE_SECRET_KEY`.
4. Dashboard > **Settings** > **Webhooks**: set the URL to `https://YOUR-VERCEL-URL/api/payments/webhook-flutterwave` and type a long random string as the **secret hash**. Put the SAME string in Vercel env as `FLW_WEBHOOK_HASH`.

Use test keys first (Paystack `sk_test_...`, Flutterwave `FLWSECK_TEST-...`), pay yourself once, confirm Premium activates, then switch to live keys.

## Step 6 - Adsterra ads

1. Sign up at adsterra.com, add your site, get approved.
2. Create placements: a 728x90 / responsive **Banner**, a **Native Banner**, a **Social Bar** and optionally a **Popunder**. Each gives you a code snippet.
3. Open your site at `/admin.html` while signed in with your ADMIN_EMAILS email. Paste each snippet into its box and Save.
4. Ads show ONLY for free users. Premium users never see them (the server tells the page, the ad code is never even sent).

## Step 7 - Verify everything works

- Sign up with a real email > dashboard shows 2 credits.
- Generate a background (free, no key needed) > credit drops to 1 > history shows the image.
- Run out of credits > editor says so clearly > next day 2 credits return.
- Admin dashboard at `/admin.html` shows your user, stats and ad editor.
- (After payment keys) make a test payment > Premium activates > ads disappear > 100 credits.

## Costs

- Supabase free tier, Vercel free tier, Pollinations free token: all free.
- remove.bg free tier: 50 previews/month. Replicate: pay-per-use (a few cents per edit).
- The only real costs are the payment processors' transaction fees when you earn money.
