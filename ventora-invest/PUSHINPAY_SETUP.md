# Ventora + PushinPay PIX

## 1. Supabase
Execute `supabase/pushinpay.sql` after the existing Ventora migrations.

The migration creates `deposits`, locks it with RLS, adds idempotent settlement functions, and credits the wallet only after a `paid` confirmation whose amount matches the locally created charge.

## 2. Vercel environment variables
Add these in Production (and Preview only if you intentionally want preview payments):

- `NEXT_PUBLIC_SITE_URL=https://ventora-invest.vercel.app`
- `SUPABASE_SECRET_KEY=<Supabase server secret/service_role>`
- `PUSHINPAY_API_TOKEN=<PushinPay token>`
- `PUSHINPAY_WEBHOOK_SECRET=<long random secret>`
- `PUSHINPAY_BASE_URL=https://api.pushinpay.com.br/api`

Do NOT put `SUPABASE_SECRET_KEY`, `PUSHINPAY_API_TOKEN`, or `PUSHINPAY_WEBHOOK_SECRET` in any `NEXT_PUBLIC_*` variable.

After adding/changing env vars, redeploy the Vercel project.

## 3. Webhook
The backend automatically sends this URL in every PIX creation:

`https://ventora-invest.vercel.app/api/webhooks/pushinpay?token=<PUSHINPAY_WEBHOOK_SECRET>`

If you configure a custom webhook header in PushinPay, the route also accepts `x-ventora-webhook-secret` with the same secret.

## 4. Flow
1. User opens Carteira -> Adicionar saldo.
2. `/api/payments/pushinpay/deposit` creates a local pending record and calls PushinPay `POST /pix/cashIn`.
3. QR code + copia e cola are shown inside Ventora.
4. PushinPay sends `paid` to the webhook. The server verifies the webhook secret and exact value.
5. `settle_pushinpay_deposit` locks the deposit and credits wallet balance exactly once.
6. Browser polling `/status` is only a fallback and uses `GET /transactions/{id}` with rate limiting/reconciliation lock.

## 5. Production safety
- Never credit from client-provided status.
- Never expose PushinPay token or Supabase secret to the browser.
- Keep the Vercel project/domain HTTPS-only.
- Configure Upstash rate limiting for production.
- Keep PushinPay account limits and webhook delivery monitored.

## Hotfix for HTTP 400 during PIX creation
If `/api/payments/pushinpay/deposit` returns HTTP 400/500 before reaching PushinPay, run:

`supabase/pushinpay-hotfix.sql`

The hotfix moves local deposit creation behind a server-only RPC executed with `SUPABASE_SECRET_KEY`, then explicitly reloads the PostgREST schema cache. The browser never receives permission to insert/update deposit or wallet records.
