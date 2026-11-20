ALTER TABLE rental_applications
  ADD COLUMN IF NOT EXISTS adults integer NOT NULL DEFAULT 1 CHECK (adults BETWEEN 1 AND 6),
  ADD COLUMN IF NOT EXISTS fee_amount_cents integer CHECK (fee_amount_cents IS NULL OR fee_amount_cents > 0),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS payment_reference text UNIQUE,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
