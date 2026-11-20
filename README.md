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
