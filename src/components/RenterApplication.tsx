import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, Landmark, Loader2, ShieldCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api';

type ManualPayment = {
  id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  instructions: string;
  reference: string;
  amount_cents: number;
};

type ApplicationProperty = {
  id: string;
  title: string;
  address: string;
};

type ApplicationFields = {
  applicant_name: string;
  phone: string;
  email: string;
  employment_status: string;
  monthly_gross_income: string;
  move_date: string;
  current_address: string;
  amenities: string[];
  has_pets: string;
  first_time_renter: string;
  property_id: string;
  adults: string;
  privacy_consent: boolean;
};

const initialFields: ApplicationFields = {
  applicant_name: '',
  phone: '',
  email: '',
  employment_status: '',
  monthly_gross_income: '',
  move_date: '',
  current_address: '',
  amenities: [],
  has_pets: '',
  first_time_renter: '',
  property_id: '',
  adults: '1',
  privacy_consent: false,
};

const amenityOptions = [
  'Gym',
  'Parking available',
  'Swimming pool',
  'Security services',
  'Laundry facilities',
  'Furnished',
  'Pet-friendly',
  'Near public transport',
];

const employmentOptions = ['Employed', 'Unemployed', 'Self-employed', 'Student', 'Retired'];
const moveDateOptions = ['Immediately', 'Within a month', 'In 3 months', 'Other'];

export default function RenterApplication({
  properties,
  initialPropertyId,
}: {
  properties: ApplicationProperty[];
  initialPropertyId: string;
}) {
  const [fields, setFields] = useState<ApplicationFields>({ ...initialFields, property_id: initialPropertyId });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState('');
  const [fee, setFee] = useState<{ enabled: boolean; method: 'manual' | 'paystack' | null; amount_per_adult: number } | null>(null);
  const [transfer, setTransfer] = useState<ManualPayment | null>(null);
  const [payerName, setPayerName] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [copied, setCopied] = useState(false);
  const returnedPayment = new URLSearchParams(window.location.search).get('payment');

  useEffect(() => {
    let active = true;
    void apiRequest<{ enabled: boolean; method: 'manual' | 'paystack' | null; amount_per_adult: number }>('/application-fee')
      .then((data) => { if (active) setFee(data); })
      .catch(() => { /* fee info is optional */ });
    return () => { active = false; };
  }, []);

  const adultsCount = Number(fields.adults);
  const feeTotal = fee?.enabled ? fee.amount_per_adult * adultsCount : 0;

  function toggleAmenity(amenity: string) {
    setFields((current) => ({
      ...current,
      amenities: current.amenities.includes(amenity)
        ? current.amenities.filter((item) => item !== amenity)
        : [...current.amenities, amenity],
    }));
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      const result = await apiRequest<{
        id: string;
        payment_required: boolean;
        payment_url: string | null;
        manual_payment: Omit<ManualPayment, 'id'> | null;
      }>('/rental-applications', {
        method: 'POST',
        body: JSON.stringify({
          ...fields,
          adults: Number(fields.adults),
          has_pets: fields.has_pets === 'yes',
          first_time_renter: fields.first_time_renter === 'yes',
          monthly_gross_income: fields.monthly_gross_income === '' ? null : Number(fields.monthly_gross_income),
        }),
      });
      if (result.manual_payment) {
        setTransfer({ ...result.manual_payment, id: result.id });
        setFields({ ...initialFields, property_id: fields.property_id });
        return;
      }
      if (result.payment_url) {
        window.location.assign(result.payment_url);
        return;
      }
      if (result.payment_required) {
        setPaymentNotice('Your application was saved, but we could not start the payment page. We will contact you with a payment link.');
      }
      setSubmitted(true);
      setFields({ ...initialFields, property_id: fields.property_id });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not submit your application.');
    } finally {
      setSending(false);
    }
  }

  async function copyAccountNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the number is shown on screen */
    }
  }

  async function confirmTransfer() {
    if (!transfer) return;
    setClaiming(true);
    setError('');
    try {
      await apiRequest(`/rental-applications/${transfer.id}/payment-claim`, {
        method: 'POST',
        body: JSON.stringify({ payment_reference: transfer.reference, payer_name: payerName }),
      });
      setClaimed(true);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'We could not record your payment notice.');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <section className="rental-application" id="renter-application">
      <div className="rental-application-heading">
        <p className="eyebrow">Rent with Masters</p>
        <h2>Renter <span>application.</span></h2>
        <p>Tell us a little about your rental needs. An administrator will review your submission and follow up with you.</p>
      </div>
      {transfer ? (
        claimed ? (
          <div className="application-success" role="status">
            <Check size={24} />
            <div>
              <h3>Thank you. We have noted your payment.</h3>
              <p>Our team will confirm the transfer of ${(transfer.amount_cents / 100).toFixed(2)} (reference {transfer.reference}) in our account and then follow up with you using the details you provided.</p>
            </div>
          </div>
        ) : (
          <div className="transfer-panel">
            <div className="transfer-heading">
              <Landmark size={24} />
              <div>
                <h3>Application received. One last step: pay the fee.</h3>
                <p>Transfer exactly <strong>${(transfer.amount_cents / 100).toFixed(2)} USD</strong> to the account below, then tap “I have made the payment”.</p>
              </div>
            </div>
            <dl className="transfer-details">
              {transfer.bank_name && <div><dt>Bank</dt><dd>{transfer.bank_name}</dd></div>}
              {transfer.account_name && <div><dt>Account name</dt><dd>{transfer.account_name}</dd></div>}
              <div>
                <dt>Account number</dt>
                <dd className="transfer-account">
                  {transfer.account_number}
                  <button type="button" className="transfer-copy" onClick={() => void copyAccountNumber(transfer.account_number)} aria-label="Copy account number">
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                </dd>
              </div>
              <div><dt>Payment reference (put this in the transfer narration)</dt><dd>{transfer.reference}</dd></div>
            </dl>
            {transfer.instructions && <p className="transfer-note">{transfer.instructions}</p>}
            <label className="transfer-payer">Name on the account you paid from (optional, helps us find your payment)
              <input value={payerName} onChange={(event) => setPayerName(event.target.value)} maxLength={120} />
            </label>
            {error && <p className="application-error" role="alert">{error}</p>}
            <button className="button button-dark application-submit" type="button" onClick={() => void confirmTransfer()} disabled={claiming}>
              {claiming ? <><Loader2 size={17} className="chat-spin" /> Saving…</> : <>I have made the payment <ArrowRight size={17} /></>}
            </button>
            <p className="application-fee-note">Your application is only marked as paid after our team sees the money in our account.</p>
          </div>
        )
      ) : returnedPayment === 'success' ? (
        <div className="application-success" role="status">
          <Check size={24} />
          <div>
            <h3>Application and fee received.</h3>
            <p>Thank you. Your payment was confirmed and your application is now with our team. We will contact you using the details you provided.</p>
          </div>
        </div>
      ) : submitted ? (
        <div className="application-success" role="status">
          <Check size={24} />
          <div>
            <h3>Application received.</h3>
            <p>Thank you. Your information has been submitted for review. We will contact you using the details you provided.</p>
            {paymentNotice && <p>{paymentNotice}</p>}
          </div>
        </div>
      ) : (
        <form className="renter-form" onSubmit={submitApplication}>
          <fieldset>
            <legend>Contact details</legend>
            <div className="application-grid">
              <label>Full name
                <input autoComplete="name" name="applicant_name" value={fields.applicant_name} onChange={(event) => setFields({ ...fields, applicant_name: event.target.value })} maxLength={120} required />
              </label>
              <label>Phone number
                <input autoComplete="tel" name="phone" type="tel" value={fields.phone} onChange={(event) => setFields({ ...fields, phone: event.target.value })} maxLength={30} required />
              </label>
              <label>Email address
                <input autoComplete="email" name="email" type="email" value={fields.email} onChange={(event) => setFields({ ...fields, email: event.target.value })} maxLength={254} required />
              </label>
              <label>Current address
                <input autoComplete="street-address" name="current_address" value={fields.current_address} onChange={(event) => setFields({ ...fields, current_address: event.target.value })} maxLength={300} required />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Rental plans</legend>
            <div className="application-grid">
              <label>Property of interest
                <select name="property_id" value={fields.property_id} onChange={(event) => setFields({ ...fields, property_id: event.target.value })}>
                  <option value="">I’m open to available properties</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>{property.title} — {property.address}</option>
                  ))}
                </select>
              </label>
              <label>Number of adults applying
                <select name="adults" value={fields.adults} onChange={(event) => setFields({ ...fields, adults: event.target.value })}>
                  {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              <label>Preferred move-in timing
                <select name="move_date" value={fields.move_date} onChange={(event) => setFields({ ...fields, move_date: event.target.value })} required>
                  <option value="">Choose one</option>
                  {moveDateOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <div className="application-question">
              <span>What is your employment status?</span>
              <div className="application-options">
                {employmentOptions.map((option) => (
                  <label key={option} className="application-option">
                    <input type="radio" name="employment_status" value={option} checked={fields.employment_status === option} onChange={(event) => setFields({ ...fields, employment_status: event.target.value })} required />
                    {option}
                  </label>
                ))}
              </div>
            </div>
            <label className="income-field">Monthly gross income (optional)
              <input name="monthly_gross_income" type="number" min="0" max="100000000" step="0.01" value={fields.monthly_gross_income} onChange={(event) => setFields({ ...fields, monthly_gross_income: event.target.value })} />
            </label>
          </fieldset>

          <fieldset>
            <legend>Home preferences</legend>
            <div className="application-question">
              <span>Which amenities are you interested in?</span>
              <div className="application-options application-options-grid">
                {amenityOptions.map((option) => (
                  <label key={option} className="application-option">
                    <input type="checkbox" checked={fields.amenities.includes(option)} onChange={() => toggleAmenity(option)} />
                    {option}
                  </label>
                ))}
              </div>
            </div>
            <div className="application-question">
              <span>Do you have any pets?</span>
              <div className="application-options">
                {[['yes', 'Yes, I have pets'], ['no', 'No pets']].map(([value, label]) => (
                  <label key={value} className="application-option">
                    <input type="radio" name="has_pets" value={value} checked={fields.has_pets === value} onChange={(event) => setFields({ ...fields, has_pets: event.target.value })} required />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="application-question">
              <span>Is this your first time applying for a rental?</span>
              <div className="application-options">
                {[['yes', 'Yes'], ['no', 'No']].map(([value, label]) => (
                  <label key={value} className="application-option">
                    <input type="radio" name="first_time_renter" value={value} checked={fields.first_time_renter === value} onChange={(event) => setFields({ ...fields, first_time_renter: event.target.value })} required />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="application-privacy">
            <ShieldCheck size={19} />
            <p>We use this information to respond to your rental enquiry. Do not include Social Security numbers, card details, passwords, or other sensitive financial information here. {fee?.method === 'manual' ? 'The application fee is paid by bank transfer after you submit.' : 'Any payment happens on Paystack’s secure page.'}</p>
          </div>
          <label className="application-consent">
            <input type="checkbox" checked={fields.privacy_consent} onChange={(event) => setFields({ ...fields, privacy_consent: event.target.checked })} required />
            I agree that Masters Real Estate may use the information above to review and respond to this rental enquiry.
          </label>
          {returnedPayment === 'failed' && <p className="application-error" role="alert">We could not confirm your payment. If you were charged, contact us and quote your email address.</p>}
          {error && <p className="application-error" role="alert">{error}</p>}
          <button className="button button-dark application-submit" type="submit" disabled={sending}>
            {sending ? <><Loader2 size={17} className="chat-spin" /> Submitting…</> : <>{feeTotal ? (fee?.method === 'manual' ? `Submit and continue to payment ($${feeTotal.toFixed(2)})` : `Submit and pay $${feeTotal.toFixed(2)}`) : 'Submit application'} <ArrowRight size={17} /></>}
          </button>
          <p className="application-fee-note">
            {fee?.method === 'manual'
              ? `Application fee: $${fee.amount_per_adult.toFixed(2)} USD per adult ($${feeTotal.toFixed(2)} for ${adultsCount}). After you submit, you will see our bank account details to pay by transfer. Your application is marked as paid once our team confirms the money has arrived.`
              : fee?.enabled
              ? `Application fee: $${fee.amount_per_adult.toFixed(2)} USD per adult ($${feeTotal.toFixed(2)} for ${adultsCount}). You will pay by card on Paystack’s secure page right after you submit; this site never sees your card details. The fee is refundable on request: refunds are reviewed by our team and returned to the original payment method.`
              : 'No application fee is collected through this form.'}
          </p>
        </form>
      )}
    </section>
  );
}
