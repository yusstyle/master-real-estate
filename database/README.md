# Neon setup

1. Create a Neon project and copy its PostgreSQL connection string into `.env` as `DATABASE_URL`. Keep it server-side; do not prefix it with `VITE_`.
2. Copy the variables from `.env.example` into `.env` and set `BETTER_AUTH_SECRET` to a new random value and `ADMIN_EMAILS` to a comma-separated list of administrator email addresses.
3. For listing photos, set the three Cloudinary values in `.env`. In production, configure Resend and a verified sender in `RESEND_FROM_EMAIL` for admin email verification; set `CHAT_RECIPIENT_EMAIL` to enable chat notifications.
4. Run `npm run db:migrate` to create the authentication, listing, image, chat, and renter application tables in Neon. The migration is safe to re-run.
5. Run `npm run dev`, then open `http://localhost:5173/`. Public visitors use the homepage; administrators sign in at `http://localhost:5173/admin`. The API runs on port 3000 and the Vite server proxies `/api` requests to it.

The schema migration creates empty tables. It does not import any data from an existing Supabase project.
Renter applications are visible only to the configured administrator through the API. The form does not ask for or collect payment details, government ID numbers, or Social Security numbers.
