import { FormEvent, useState } from 'react';
import { ArrowRight, Check, Loader2, ShieldCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api';

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
      await apiRequest<{ id: string }>('/rental-applications', {
        method: 'POST',
        body: JSON.stringify({
          ...fields,
          monthly_gross_income: fields.monthly_gross_income === '' ? null : Number(fields.monthly_gross_income),
        }),
      });
      setSubmitted(true);
      setFields({ ...initialFields, property_id: fields.property_id });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not submit your application.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rental-application" id="renter-application">
      <div className="rental-application-heading">
        <p className="eyebrow">Rent with Masters</p>
        <h2>Renter <span>application.</span></h2>
        <p>Tell us a little about your rental needs. An administrator will review your submission and follow up with you.</p>
      </div>
      {submitted ? (
        <div className="application-success" role="status">
          <Check size={24} />
          <div>
            <h3>Application received.</h3>
            <p>Thank you. Your information has been submitted for review. We will contact you using the details you provided.</p>
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
            <p>We use this information to respond to your rental enquiry. Do not include Social Security numbers, payment details, passwords, or other sensitive financial information.</p>
          </div>
          <label className="application-consent">
            <input type="checkbox" checked={fields.privacy_consent} onChange={(event) => setFields({ ...fields, privacy_consent: event.target.checked })} required />
            I agree that Masters Real Estate may use the information above to review and respond to this rental enquiry.
          </label>
          {error && <p className="application-error" role="alert">{error}</p>}
          <button className="button button-dark application-submit" type="submit" disabled={sending}>
            {sending ? <><Loader2 size={17} className="chat-spin" /> Submitting…</> : <>Submit application <ArrowRight size={17} /></>}
          </button>
          <p className="application-fee-note">This form does not collect application fees or payment information.</p>
        </form>
      )}
    </section>
  );
}
