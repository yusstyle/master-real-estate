# Master Real Estate

Real estate listings site with live chat, renter applications, and an admin dashboard.

**Stack:** React 18 + Vite + TypeScript + Tailwind (web), Express 5 (API), better-auth, Neon Postgres, Cloudinary, Resend.

## Setup
1. `npm install`
2. `cp .env.example .env` and fill in the values (never commit `.env`).
3. `npm run db:migrate` (safe to re-run)
4. `npm run dev`, then open http://localhost:5173. Admins sign in at `/admin`.

## Scripts
`dev`, `build`, `typecheck`, `lint`, `db:migrate`

See `database/README.md` for more on the database setup.

## Application fee (Paystack)
Set `PAYSTACK_SECRET_KEY` (start with a `sk_test_` key) and optionally `APPLICATION_FEE_USD` (default 80, per adult) in `.env`, then run `npm run db:migrate`.
Applicants are redirected to Paystack's hosted page after submitting. Payment is verified server-side on return and via the webhook.
In the Paystack dashboard, set the webhook URL to `https://YOUR-DOMAIN/api/payments/webhook`. Refunds are issued manually from the Paystack dashboard.
USD charging must be enabled on your Paystack account.

## Manual bank transfer (while card payments are not ready)
Set `MANUAL_PAYMENT_ACCOUNT_NUMBER` (and optionally `MANUAL_PAYMENT_ACCOUNT_NAME`, `MANUAL_PAYMENT_BANK_NAME`, `MANUAL_PAYMENT_INSTRUCTIONS`) in `.env`, then run `npm run db:migrate`.
After submitting, the applicant sees the account details, the amount and a reference code, pays, and taps "I have made the payment". The application then shows as "Says paid, needs checking" in the admin dashboard. Check your bank account and click "Confirm payment received" to mark it paid.
Manual transfer takes priority over Paystack. Remove `MANUAL_PAYMENT_ACCOUNT_NUMBER` to go back to Paystack.
