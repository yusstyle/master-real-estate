import 'dotenv/config';
import path from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { betterAuth } from 'better-auth';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { v2 as cloudinary } from 'cloudinary';
import { Pool, type PoolClient } from 'pg';

const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
const appUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:5173';
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
);

const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
const feePerAdultUsd = Number(process.env.APPLICATION_FEE_USD ?? 80);
// Manual bank transfer: set MANUAL_PAYMENT_ACCOUNT_NUMBER to turn it on. It takes priority over Paystack.
const manualPayment = process.env.MANUAL_PAYMENT_ACCOUNT_NUMBER?.trim()
  ? {
      account_number: process.env.MANUAL_PAYMENT_ACCOUNT_NUMBER.trim(),
      account_name: process.env.MANUAL_PAYMENT_ACCOUNT_NAME?.trim() ?? '',
      bank_name: process.env.MANUAL_PAYMENT_BANK_NAME?.trim() ?? '',
      instructions: process.env.MANUAL_PAYMENT_INSTRUCTIONS?.trim() ?? '',
    }
  : null;
const feeEnabled = Boolean(manualPayment || process.env.PAYSTACK_SECRET_KEY);
// Exact https origins only (scheme + host), e.g. https://www.mastersreal-estates.com. Invalid, non-https or non-bare-origin entries are dropped in production.
function normalizeOrigin(value: string) {
  try {
    const trimmed = value.trim();
    if (trimmed.includes('*')) return null; // wildcards are never trusted
    const url = new URL(trimmed);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
    // Reject anything that is not a bare origin (paths, queries, credentials) instead of silently widening it.
    if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}
const extraOrigins = (process.env.EXTRA_TRUSTED_ORIGINS ?? '')
  .split(',')
  .map(normalizeOrigin)
  .filter((origin): origin is string => Boolean(origin));
const trustedProductionOrigins = [...new Set([normalizeOrigin(appUrl), ...extraOrigins].filter((o): o is string => Boolean(o)))];

function createAuth(pool: Pool, secret: string) {
  return betterAuth({
    database: pool,
    baseURL: `${appUrl.replace(/\/$/, '')}/api/auth`,
    secret,
    trustedOrigins: process.env.NODE_ENV === 'production'
      ? trustedProductionOrigins
      : [appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: process.env.NODE_ENV === 'production',
      minPasswordLength: 8,
    },
    emailVerification: {
      sendOnSignUp: process.env.NODE_ENV === 'production',
      sendVerificationEmail: async ({ user, url }) => {
        const sent = await deliverEmail(
          user.email,
          'Verify your Masters Real Estate account',
          `<p>Confirm your email address to access the Masters Real Estate admin workspace.</p><p><a href="${escapeHtml(url)}">Verify my email</a></p>`,
        );
        if (!sent) throw new Error('Email verification could not be sent. Check the Resend settings.');
      },
    },
  });
}

type AppAuth = ReturnType<typeof createAuth>;

function jsonError(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

function isAdminEmail(email: string) {
  return adminEmails.has(email.trim().toLowerCase());
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function clientIp(req: Request) {
  return req.header('x-forwarded-for')?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

async function deliverEmail(to: string, subject: string, html: string, replyTo?: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return false;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!response.ok) {
      console.error('Resend email delivery failed:', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('Resend email request failed:', error);
    return false;
  }
}

function getAdmin(auth: AppAuth) {
  return async (req: Request, res: Response) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!result) {
      jsonError(res, 401, 'Please sign in to continue.');
      return null;
    }
    if (!isAdminEmail(result.user.email)) {
      jsonError(res, 403, 'This account does not have administrator access.');
      return null;
    }
    return result.user;
  };
}

function registerApi(pool: Pool, auth: AppAuth) {
  const requireAdmin = getAdmin(auth);
  const query = (text: string, values: unknown[] = []) => pool.query(text, values);

  app.use('/api/auth', toNodeHandler(auth));
  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => { (req as Request & { rawBody?: Buffer }).rawBody = buf; },
  }));

  app.get('/api/session', async (req, res) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const email = result?.user.email ?? null;
    const isAdmin = Boolean(email && isAdminEmail(email));
    res.json({ email: isAdmin ? email : null, isAdmin });
  });

  app.get('/api/properties', async (req, res) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const ownerId = result && isAdminEmail(result.user.email) ? result.user.id : null;
    const { rows } = await query(
    `SELECT p.id, p.owner_id, p.title, p.address, p.price, p.availability, p.property_type,
      p.bedrooms, p.bathrooms::float8 AS bathrooms, p.area_sq_ft, p.is_published, p.created_at, p.updated_at,
        COALESCE(
          json_agg(json_build_object(
            'id', pi.id,
            'property_id', pi.property_id,
            'storage_path', pi.storage_path,
            'image_url', pi.image_url,
            'alt_text', pi.alt_text,
            'sort_order', pi.sort_order
          ) ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL),
          '[]'::json
        ) AS property_images
      FROM properties p
      LEFT JOIN property_images pi ON pi.property_id = p.id
      WHERE p.is_published = true OR ($1::text IS NOT NULL AND p.owner_id = $1)
      GROUP BY p.id
      ORDER BY p.updated_at DESC`,
      [ownerId],
    );
    res.json(rows);
  });

  app.post('/api/properties', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const { title, address, price, availability, property_type, bedrooms, bathrooms, area_sq_ft } = req.body ?? {};
    if (![title, address, price, availability, property_type].every((value) => typeof value === 'string' && value.trim())) {
      return jsonError(res, 400, 'Complete all required property details.');
    }
    const bedroomCount = Number(bedrooms);
    const bathroomCount = Number(bathrooms);
    const area = Number(area_sq_ft);
    if (
      !Number.isInteger(bedroomCount) || bedroomCount < 0 ||
      !Number.isFinite(bathroomCount) || bathroomCount < 0 ||
      !Number.isInteger(area) || area < 0
    ) {
      return jsonError(res, 400, 'Bedrooms, bathrooms, and area must be valid non-negative numbers.');
    }
    const { rows } = await query(
      `INSERT INTO properties (owner_id, title, address, price, availability, property_type, bedrooms, bathrooms, area_sq_ft)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        user.id,
        title.trim(),
        address.trim(),
        price.trim(),
        availability.trim(),
        property_type.trim(),
        bedroomCount,
        bathroomCount,
        area,
      ],
    );
    res.status(201).json({ ...rows[0], bathrooms: Number(rows[0].bathrooms), property_images: [] });
  });

  async function verifyPaystackPayment(reference: string) {
    if (!paystackSecret) return false;
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    });
    if (!response.ok) return false;
    const payload = await response.json() as { data?: { status?: string; amount?: number; currency?: string } };
    const data = payload.data;
    if (!data || data.status !== 'success' || data.currency !== 'USD') return false;
    const { rowCount } = await query(
      `UPDATE rental_applications SET payment_status = 'paid', paid_at = now(), updated_at = now()
       WHERE payment_reference = $1 AND fee_amount_cents = $2 AND payment_status <> 'paid'`,
      [reference, data.amount],
    );
    if (rowCount) return true;
    const { rows } = await query(
      "SELECT 1 FROM rental_applications WHERE payment_reference = $1 AND payment_status = 'paid'",
      [reference],
    );
    return rows.length > 0;
  }

  app.get('/api/application-fee', (_req, res) => {
    res.json({
      enabled: feeEnabled,
      method: manualPayment ? 'manual' : paystackSecret ? 'paystack' : null,
      amount_per_adult: feePerAdultUsd,
      currency: 'USD',
    });
  });

  // Applicant says they have made the bank transfer. This only flags it as "pending";
  // an administrator confirms it against the bank account before it counts as paid.
  app.post('/api/rental-applications/:id/payment-claim', async (req, res) => {
    if (!manualPayment) return jsonError(res, 404, 'Manual payments are not enabled.');
    const reference = typeof req.body?.payment_reference === 'string' ? req.body.payment_reference.trim() : '';
    const payerName = typeof req.body?.payer_name === 'string' ? req.body.payer_name.trim() : '';
    if (!reference) return jsonError(res, 400, 'A payment reference is required.');
    if (payerName.length > 120) return jsonError(res, 400, 'Enter a sender name under 120 characters.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return jsonError(res, 404, 'Application not found.');
    }
    const { rowCount } = await query(
      `UPDATE rental_applications
       SET payment_status = 'pending', payment_method = 'manual', payment_claimed_at = now(),
           payer_name = $3, updated_at = now()
       WHERE id = $1 AND payment_reference = $2 AND payment_status IN ('unpaid', 'pending')`,
      [req.params.id, reference, payerName || null],
    );
    if (rowCount) return res.json({ success: true });
    const { rows } = await query(
      'SELECT payment_status FROM rental_applications WHERE id = $1 AND payment_reference = $2',
      [req.params.id, reference],
    );
    if (rows[0]?.payment_status === 'paid') return res.json({ success: true });
    return jsonError(res, 404, 'Application not found.');
  });

  app.get('/api/payments/callback', async (req, res) => {
    const reference = typeof req.query.reference === 'string'
      ? req.query.reference
      : typeof req.query.trxref === 'string' ? req.query.trxref : '';
    const paid = reference ? await verifyPaystackPayment(reference) : false;
    res.redirect(`${appUrl.replace(/\/$/, '')}/?payment=${paid ? 'success' : 'failed'}#renter-application`);
  });

  app.post('/api/payments/webhook', async (req, res) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.header('x-paystack-signature');
    if (!paystackSecret || !rawBody || !signature) return jsonError(res, 401, 'Invalid signature.');
    const expected = Buffer.from(createHmac('sha512', paystackSecret).update(rawBody).digest('hex'));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return jsonError(res, 401, 'Invalid signature.');
    }
    if (req.body?.event === 'charge.success' && typeof req.body?.data?.reference === 'string') {
      await verifyPaystackPayment(req.body.data.reference);
    }
    res.sendStatus(200);
  });

  app.post('/api/rental-applications', async (req, res) => {
    const body = req.body ?? {};
    const name = typeof body.applicant_name === 'string' ? body.applicant_name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const employmentStatus = body.employment_status;
    const moveDate = body.move_date;
    const currentAddress = typeof body.current_address === 'string' ? body.current_address.trim() : '';
    const income = body.monthly_gross_income;
    const amenities = body.amenities;
    const hasPets = body.has_pets;
    const firstTimeRenter = body.first_time_renter;
    const propertyId = body.property_id || null;
    const adults = body.adults === undefined ? 1 : body.adults;
    const allowedEmployment = ['Employed', 'Unemployed', 'Self-employed', 'Student', 'Retired'];
    const allowedMoveDates = ['Immediately', 'Within a month', 'In 3 months', 'Other'];
    const allowedAmenities = [
      'Gym',
      'Parking available',
      'Swimming pool',
      'Security services',
      'Laundry facilities',
      'Furnished',
      'Pet-friendly',
      'Near public transport',
    ];

    if (name.length < 2 || name.length > 120) return jsonError(res, 400, 'Enter a name between 2 and 120 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return jsonError(res, 400, 'Enter a valid email address.');
    if (phone.length < 7 || phone.length > 30 || !/^[+()\d.\-\s]+$/.test(phone)) return jsonError(res, 400, 'Enter a valid phone number.');
    if (!allowedEmployment.includes(employmentStatus)) return jsonError(res, 400, 'Select an employment status.');
    if (!allowedMoveDates.includes(moveDate)) return jsonError(res, 400, 'Select a preferred move-in time.');
    if (currentAddress.length < 5 || currentAddress.length > 300) return jsonError(res, 400, 'Enter a current address between 5 and 300 characters.');
    if (!Array.isArray(amenities) || amenities.some((value: unknown) => typeof value !== 'string' || !allowedAmenities.includes(value))) {
      return jsonError(res, 400, 'Select valid amenities.');
    }
    if (!Number.isInteger(adults) || adults < 1 || adults > 6) return jsonError(res, 400, 'Select the number of adults (1 to 6).');
    if (typeof hasPets !== 'boolean' || typeof firstTimeRenter !== 'boolean') return jsonError(res, 400, 'Answer the pet and first-rental questions.');
    if (typeof body.privacy_consent !== 'boolean' || !body.privacy_consent) return jsonError(res, 400, 'Consent is required to submit this application.');
    if (income !== null && (!Number.isFinite(income) || income < 0 || income > 100000000)) {
      return jsonError(res, 400, 'Enter a valid monthly gross income or leave it blank.');
    }
    if (
      propertyId !== null &&
      (typeof propertyId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(propertyId))
    ) {
      return jsonError(res, 400, 'Select a valid property.');
    }

    const feeCents = feeEnabled ? Math.round(feePerAdultUsd * 100 * adults) : null;
    // Manual transfers get a short code the applicant can put in the bank narration.
    const paymentReference = !feeEnabled
      ? null
      : manualPayment
        ? `MRE-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`
        : `MRE-${randomUUID()}`;
    let applicationId = '';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`rental-application:${email}`]);
      const { rows: countRows } = await client.query(
        'SELECT count(*)::int AS count FROM rental_applications WHERE email = $1 AND created_at >= now() - interval \'1 hour\'',
        [email],
      );
      if (countRows[0].count >= 5) {
        await client.query('ROLLBACK');
        return jsonError(res, 429, 'Too many applications were submitted for this email. Please try again later.');
      }

      const { rows } = await client.query(
        `INSERT INTO rental_applications (
          property_id, applicant_name, phone, email, employment_status, monthly_gross_income,
          move_date, current_address, amenities, has_pets, first_time_renter, privacy_consent,
          adults, fee_amount_cents, payment_reference
        )
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12::int, $13::int, $14::text
        WHERE $1::uuid IS NULL OR EXISTS (SELECT 1 FROM properties WHERE id = $1::uuid AND is_published = true)
        RETURNING id`,
        [
          propertyId,
          name,
          phone,
          email,
          employmentStatus,
          income,
          moveDate,
          currentAddress,
          amenities,
          hasPets,
          firstTimeRenter,
          adults,
          feeCents,
          paymentReference,
        ],
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return jsonError(res, 400, 'The selected property is no longer available.');
      }
      await client.query('COMMIT');
      applicationId = rows[0].id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    let paymentUrl: string | null = null;
    if (paymentReference && feeCents && !manualPayment) {
      try {
        const response = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST',
          headers: { Authorization: `Bearer ${paystackSecret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            amount: feeCents,
            currency: 'USD',
            reference: paymentReference,
            callback_url: `${appUrl.replace(/\/$/, '')}/api/payments/callback`,
            metadata: { application_id: applicationId, adults },
          }),
        });
        const payload = await response.json() as { status?: boolean; message?: string; data?: { authorization_url?: string } };
        if (response.ok && payload.status && payload.data?.authorization_url) {
          paymentUrl = payload.data.authorization_url;
        } else {
          console.error('Paystack initialize failed:', response.status, payload.message);
        }
      } catch (error) {
        console.error('Paystack initialize request failed:', error);
      }
    }
    res.status(201).json({
      id: applicationId,
      payment_required: Boolean(paymentReference),
      payment_url: paymentUrl,
      manual_payment: manualPayment && paymentReference && feeCents
        ? { ...manualPayment, reference: paymentReference, amount_cents: feeCents }
        : null,
    });
  });

  app.get('/api/admin/rental-applications', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { rows } = await query(
      `SELECT a.id, a.applicant_name, a.phone, a.email, a.employment_status, a.monthly_gross_income,
        a.move_date, a.current_address, a.amenities, a.has_pets, a.first_time_renter,
        a.status, a.created_at, p.title AS property_title,
        a.adults, a.fee_amount_cents, a.payment_status, a.payment_reference, a.paid_at,
        a.payment_method, a.payment_claimed_at, a.payer_name
      FROM rental_applications a
      LEFT JOIN properties p ON p.id = a.property_id
      ORDER BY a.created_at DESC`,
    );
    res.json(rows);
  });

  app.patch('/api/admin/rental-applications/:id/status', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const allowedStatuses = ['new', 'reviewing', 'closed'];
    if (!allowedStatuses.includes(req.body?.status)) return jsonError(res, 400, 'Select a valid application status.');
    const { rowCount } = await query(
      'UPDATE rental_applications SET status = $1, updated_at = now() WHERE id = $2',
      [req.body.status, req.params.id],
    );
    if (!rowCount) return jsonError(res, 404, 'Application not found.');
    res.json({ success: true });
  });

  // Admin confirms (or reverses) a payment after checking the bank account.
  app.patch('/api/admin/rental-applications/:id/payment', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const next = req.body?.payment_status;
    if (next !== 'paid' && next !== 'unpaid') return jsonError(res, 400, 'Choose paid or unpaid.');
    const { rowCount } = await query(
      `UPDATE rental_applications
       SET payment_status = $1::text,
           paid_at = CASE WHEN $1::text = 'paid' THEN now() ELSE NULL END,
           payment_claimed_at = CASE WHEN $1::text = 'paid' THEN payment_claimed_at ELSE NULL END,
           updated_at = now()
       WHERE id = $2 AND fee_amount_cents IS NOT NULL`,
      [next, req.params.id],
    );
    if (!rowCount) return jsonError(res, 404, 'Application not found.');
    res.json({ success: true });
  });

  app.patch('/api/properties/:id/publish', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (typeof req.body?.is_published !== 'boolean') return jsonError(res, 400, 'A publish status is required.');
    const { rowCount } = await query(
      'UPDATE properties SET is_published = $1, updated_at = now() WHERE id = $2 AND owner_id = $3',
      [req.body.is_published, req.params.id, user.id],
    );
    if (!rowCount) return jsonError(res, 404, 'Listing not found.');
    res.json({ success: true });
  });

  app.post('/api/images/sign', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (!cloudinaryConfigured) return jsonError(res, 503, 'Cloudinary is not configured on the server.');
    const propertyId = req.body?.property_id;
    if (typeof propertyId !== 'string') return jsonError(res, 400, 'A property is required.');
    const { rowCount } = await query('SELECT id FROM properties WHERE id = $1 AND owner_id = $2', [propertyId, user.id]);
    if (!rowCount) return jsonError(res, 404, 'Listing not found.');

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `properties/${propertyId}/${randomUUID()}`;
    const signature = cloudinary.utils.api_sign_request(
      { public_id: publicId, timestamp },
      process.env.CLOUDINARY_API_SECRET!,
    );
    res.json({
      timestamp,
      publicId,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    });
  });

  app.post('/api/properties/:id/images', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const { public_id, secure_url, alt_text } = req.body ?? {};
    const expectedPrefix = `properties/${req.params.id}/`;
    let imageHost = '';
    try {
      imageHost = new URL(secure_url).hostname;
    } catch {
      return jsonError(res, 400, 'The uploaded image URL is invalid.');
    }
    if (
      typeof public_id !== 'string' ||
      !public_id.startsWith(expectedPrefix) ||
      imageHost !== 'res.cloudinary.com' ||
      typeof secure_url !== 'string' ||
      typeof alt_text !== 'string'
    ) {
      return jsonError(res, 400, 'The uploaded image details are invalid.');
    }
    const propertyResult = await query('SELECT id FROM properties WHERE id = $1 AND owner_id = $2', [req.params.id, user.id]);
    if (!propertyResult.rowCount) return jsonError(res, 404, 'Listing not found.');

    const { rows } = await query(
      `INSERT INTO property_images (property_id, owner_id, storage_path, image_url, alt_text, sort_order)
       SELECT $1, $2, $3, $4, $5, COALESCE(MAX(sort_order) + 1, 0)
       FROM property_images WHERE property_id = $1
       RETURNING *`,
      [req.params.id, user.id, public_id, secure_url, alt_text.slice(0, 300)],
    );
    res.status(201).json(rows[0]);
  });

  app.delete('/api/properties/:id/images/:imageId', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (!cloudinaryConfigured) return jsonError(res, 503, 'Cloudinary is not configured on the server.');
    const { rows } = await query(
      'SELECT pi.id, pi.storage_path FROM property_images pi JOIN properties p ON p.id = pi.property_id WHERE pi.id = $1 AND p.id = $2 AND p.owner_id = $3',
      [req.params.imageId, req.params.id, user.id],
    );
    const image = rows[0];
    if (!image) return jsonError(res, 404, 'Image not found.');
    const result = await cloudinary.uploader.destroy(image.storage_path);
    if (result.result !== 'ok' && result.result !== 'not found') {
      return jsonError(res, 502, 'Cloudinary could not remove the image.');
    }
    await query('DELETE FROM property_images WHERE id = $1', [image.id]);
    res.json({ success: true });
  });

  app.put('/api/properties/:id/images/order', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const imageIds = req.body?.image_ids;
    if (!Array.isArray(imageIds) || !imageIds.every((id) => typeof id === 'string')) {
      return jsonError(res, 400, 'A valid image order is required.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT pi.id FROM property_images pi JOIN properties p ON p.id = pi.property_id WHERE p.id = $1 AND p.owner_id = $2',
        [req.params.id, user.id],
      );
      if (rows.length !== imageIds.length || new Set(imageIds).size !== imageIds.length ||
          rows.some(({ id }) => !imageIds.includes(id))) {
        await client.query('ROLLBACK');
        return jsonError(res, 400, 'The image order does not match this listing.');
      }
      for (const [index, id] of imageIds.entries()) {
        await client.query('UPDATE property_images SET sort_order = $1 WHERE id = $2', [index, id]);
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/api/admin/conversations', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { rows } = await query(
      `SELECT id, visitor_name, visitor_email, is_closed, created_at, updated_at, last_business_reply_at
       FROM chat_conversations ORDER BY updated_at DESC`,
    );
    res.json(rows);
  });

  app.get('/api/admin/conversations/:id/messages', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { rows } = await query(
      'SELECT id, sender, content, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id],
    );
    res.json(rows);
  });

  app.patch('/api/admin/conversations/:id/close', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { rowCount } = await query(
      'UPDATE chat_conversations SET is_closed = true, updated_at = now() WHERE id = $1',
      [req.params.id],
    );
    if (!rowCount) return jsonError(res, 404, 'Conversation not found.');
    res.json({ success: true });
  });

  app.post('/api/admin/conversations/:id/reply', async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 2000) : '';
    if (!content) return jsonError(res, 400, 'Reply cannot be empty.');
    const { rows } = await query(
      'SELECT visitor_name, visitor_email, visitor_token, is_closed FROM chat_conversations WHERE id = $1',
      [req.params.id],
    );
    const conversation = rows[0];
    if (!conversation) return jsonError(res, 404, 'Conversation not found.');
    if (conversation.is_closed) return jsonError(res, 409, 'This conversation is closed.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO chat_messages (conversation_id, sender, content) VALUES ($1, $2, $3)',
        [req.params.id, 'business', content],
      );
      await client.query(
        'UPDATE chat_conversations SET last_business_reply_at = now(), updated_at = now() WHERE id = $1',
        [req.params.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const emailDelivered = await deliverEmail(
      conversation.visitor_email,
      'Masters Real Estate has replied to your enquiry',
      `<p>Dear ${escapeHtml(conversation.visitor_name)},</p><p>${escapeHtml(content)}</p><p>Continue the conversation on the Masters Real Estate website using reference ${escapeHtml(conversation.visitor_token)}.</p>`,
    );
    if (!emailDelivered) console.warn('Chat reply saved without email notification; check Resend configuration.');
    res.json({ success: true, emailDelivered });
  });

  app.post('/api/chat/retrieve', async (req, res) => {
    const token = req.body?.visitor_token;
    if (typeof token !== 'string') return jsonError(res, 400, 'Invalid conversation reference.');
    const { rows } = await query(
      'SELECT id, is_closed FROM chat_conversations WHERE visitor_token = $1',
      [token],
    );
    const conversation = rows[0];
    if (!conversation) return jsonError(res, 404, 'Conversation not found.');
    const messages = await query(
      'SELECT sender, content, created_at AS timestamp FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversation.id],
    );
    if (messages.rows.some((message) => message.sender === 'business')) {
      await query('UPDATE chat_conversations SET last_visitor_seen_at = now() WHERE id = $1', [conversation.id]);
    }
    res.json({ messages: messages.rows, isClosed: conversation.is_closed });
  });

  app.post('/api/chat/submit', async (req, res) => {
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const content = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
    const token = typeof req.body?.visitor_token === 'string' ? req.body.visitor_token : '';
    const honeypot = typeof req.body?.company_website === 'string' ? req.body.company_website : '';
    if (honeypot) return res.json({ success: true, conversationRef: 'demo' });
    if (!content || content.length < 5) return jsonError(res, 400, 'Please enter a message of at least 5 characters.');

    const isNewConversation = !token;
    let conversation: { id: string; visitor_token: string; visitor_name: string; visitor_email: string } | undefined;
    if (token) {
      const { rows } = await query(
        'SELECT id, visitor_token, visitor_name, visitor_email FROM chat_conversations WHERE visitor_token = $1',
        [token],
      );
      conversation = rows[0];
      if (!conversation) return jsonError(res, 404, 'Conversation not found. Start a new message.');
    } else {
      const name = rawName.slice(0, 100);
      if (name.length < 2) return jsonError(res, 400, 'Please enter your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) || rawEmail.length > 254) {
        return jsonError(res, 400, 'Please enter a valid email address.');
      }
      const { rows } = await query(
        `INSERT INTO chat_conversations (visitor_token, visitor_name, visitor_email, visitor_ip)
         VALUES ($1, $2, $3, $4)
         RETURNING id, visitor_token, visitor_name, visitor_email`,
        [randomUUID(), name, rawEmail, clientIp(req)],
      );
      conversation = rows[0];
    }

    if (!conversation) return jsonError(res, 500, 'Could not start the conversation.');
    const client = await pool.connect();
    try {
      await applyRateLimits(client, conversation.visitor_email, clientIp(req));
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO chat_messages (conversation_id, sender, content) VALUES ($1, $2, $3)',
        [conversation.id, 'visitor', content],
      );
      await client.query(
        'UPDATE chat_conversations SET is_closed = false, updated_at = now() WHERE id = $1',
        [conversation.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && error.message === 'CHAT_RATE_LIMIT') {
        if (isNewConversation) await query('DELETE FROM chat_conversations WHERE id = $1', [conversation.id]);
        return jsonError(res, 429, 'You have sent too many messages. Please try again later.');
      }
      throw error;
    } finally {
      client.release();
    }

    const messageCount = await query(
      "SELECT count(*)::int AS count FROM chat_messages WHERE conversation_id = $1 AND sender = 'visitor'",
      [conversation.id],
    );
    const recipient = process.env.CHAT_RECIPIENT_EMAIL;
    const emailDelivered = recipient ? await deliverEmail(
      recipient,
      `New chat enquiry from ${conversation.visitor_name} — Masters Real Estate`,
      `<p>From ${escapeHtml(conversation.visitor_name)} (${escapeHtml(conversation.visitor_email)})</p><p>${escapeHtml(content)}</p><p>${messageCount.rows[0].count} messages in this conversation. Reference: ${escapeHtml(conversation.visitor_token)}</p>`,
      conversation.visitor_email,
    ) : false;
    if (!emailDelivered) console.warn('Chat enquiry saved without email notification; check Resend configuration.');
    res.json({ success: true, conversationRef: conversation.visitor_token, emailDelivered });
  });
}

async function applyRateLimits(client: PoolClient, email: string, ip: string) {
  const identifiers = [`email:${email}`, `ip:${ip}`].sort();
  await client.query('BEGIN');
  for (const identifier of identifiers) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identifier]);
  }
  const limits = [
    { identifier: email, type: 'email', max: 5 },
    { identifier: ip, type: 'ip', max: 15 },
  ];
  for (const limit of limits) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS count FROM chat_rate_limits
       WHERE identifier = $1 AND identifier_type = $2 AND created_at >= now() - interval '1 hour'`,
      [limit.identifier, limit.type],
    );
    if (rows[0].count >= limit.max) throw new Error('CHAT_RATE_LIMIT');
  }
  for (const limit of limits) {
    await client.query(
      'INSERT INTO chat_rate_limits (identifier, identifier_type) VALUES ($1, $2)',
      [limit.identifier, limit.type],
    );
  }
  await client.query('DELETE FROM chat_rate_limits WHERE created_at < now() - interval \'24 hours\'');
  await client.query('COMMIT');
}

if (!databaseUrl || !authSecret) {
  console.error('Neon backend is not configured. Set DATABASE_URL and BETTER_AUTH_SECRET in .env.');
  app.use(express.json());
  app.use('/api', (_req, res) => jsonError(res, 503, 'Configure DATABASE_URL and BETTER_AUTH_SECRET to enable the backend.'));
} else {
  const pool = new Pool({ connectionString: databaseUrl });
  pool.on('error', (error) => console.error('Database pool error:', error.message));
  pool.on('connect', (client) => client.on('error', (error) => console.error('Database client error:', error.message)));
  const auth = createAuth(pool, authSecret);
  if (cloudinaryConfigured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  registerApi(pool, auth);
}

if (process.env.NODE_ENV === 'production') {
  const distDir = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  console.error('API request failed:', error);
  if (res.headersSent) {
    next(error);
    return;
  }
  jsonError(res, 500, 'The request could not be completed.');
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`Auth trusted origins: ${trustedProductionOrigins.join(', ') || '(none)'}`);
  }
});
