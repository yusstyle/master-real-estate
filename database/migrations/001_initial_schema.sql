CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session" ("userId");

CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_user_id_idx ON account ("userId");

CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  address text NOT NULL,
  price text NOT NULL,
  availability text NOT NULL,
  property_type text NOT NULL,
  bedrooms integer NOT NULL DEFAULT 0 CHECK (bedrooms >= 0),
  bathrooms numeric(3,1) NOT NULL DEFAULT 0 CHECK (bathrooms >= 0),
  area_sq_ft integer NOT NULL DEFAULT 0 CHECK (area_sq_ft >= 0),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_published_idx ON properties (is_published, updated_at DESC);

CREATE TABLE IF NOT EXISTS property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  image_url text NOT NULL,
  alt_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, storage_path)
);

CREATE INDEX IF NOT EXISTS property_images_property_order_idx ON property_images (property_id, sort_order);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_token uuid NOT NULL UNIQUE,
  visitor_name text NOT NULL,
  visitor_email text NOT NULL,
  visitor_ip text,
  is_closed boolean NOT NULL DEFAULT false,
  last_business_reply_at timestamptz,
  last_visitor_seen_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_conversations_email_idx ON chat_conversations (visitor_email);
CREATE INDEX IF NOT EXISTS chat_conversations_updated_idx ON chat_conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('visitor', 'business')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS chat_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  identifier_type text NOT NULL CHECK (identifier_type IN ('email', 'ip')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_rate_limits_lookup_idx ON chat_rate_limits (identifier, identifier_type, created_at DESC);
