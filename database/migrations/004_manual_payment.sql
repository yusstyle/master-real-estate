-- Manual bank-transfer payments: applicants transfer the fee, tell us they have paid
-- ("pending"), and an administrator confirms it in the dashboard ("paid").
ALTER TABLE rental_applications DROP CONSTRAINT IF EXISTS rental_applications_payment_status_check;
ALTER TABLE rental_applications
  ADD CONSTRAINT rental_applications_payment_status_check CHECK (payment_status IN ('unpaid', 'pending', 'paid'));

ALTER TABLE rental_applications
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IS NULL OR payment_method IN ('paystack', 'manual')),
  ADD COLUMN IF NOT EXISTS payment_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payer_name text CHECK (payer_name IS NULL OR char_length(payer_name) <= 120);
