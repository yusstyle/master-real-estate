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
