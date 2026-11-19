CREATE TABLE IF NOT EXISTS rental_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  applicant_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  employment_status text NOT NULL CHECK (employment_status IN ('Employed', 'Unemployed', 'Self-employed', 'Student', 'Retired')),
  monthly_gross_income numeric(12,2) CHECK (monthly_gross_income IS NULL OR monthly_gross_income >= 0),
  move_date text NOT NULL CHECK (move_date IN ('Immediately', 'Within a month', 'In 3 months', 'Other')),
  current_address text NOT NULL,
  amenities text[] NOT NULL DEFAULT '{}',
  has_pets boolean NOT NULL,
  first_time_renter boolean NOT NULL,
  privacy_consent boolean NOT NULL CHECK (privacy_consent = true),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_applications_created_idx ON rental_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS rental_applications_email_idx ON rental_applications (email, created_at DESC);
