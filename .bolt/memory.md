# Project memory

## Product intent & audience

- Masters Real Estate image system for property listings.
- Premium architectural photography presentation with responsive components.
- Audience: real estate clients, buyers, and prospective renters.

## Brand personality & voice

- Premium, architectural, polished; not cookie-cutter.

## Visual design & UX direction

- Responsive image components for property listings.
- Architectural photography as primary visual content.
- Framework: Vite + React, JSX, Tailwind CSS, Lucide React icons.
- Use `@/` path alias for project module imports.

## Decisions, constraints & rationale

- Neon PostgreSQL backend with Better Auth for administrator access.
- Cloudinary integration for property image hosting/management.
- Renter applications are submitted to Neon and visible only to the configured administrator.
- The renter form does not collect application fees, payment details, government ID numbers, or Social Security numbers.
- Target repository: `https://github.com/yusstyle/master-real-estate`.
- Supabase backend references were removed; no prior Supabase data was imported.

## Open questions & assumptions

- Neon, Cloudinary, and Resend configuration values still need to be supplied in `.env`.
- `npm run db:migrate` must run against the intended Neon project before database-backed actions can work.
- Whether deployment target beyond GitHub repo is needed is unspecified.