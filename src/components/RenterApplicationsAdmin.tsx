import { useEffect, useState } from 'react';
import { ClipboardList, Loader2, Mail, Phone } from 'lucide-react';
import { apiRequest } from '@/lib/api';

type RentalApplication = {
  id: string;
  applicant_name: string;
  phone: string;
  email: string;
  employment_status: string;
  monthly_gross_income: number | string | null;
  move_date: string;
  current_address: string;
  amenities: string[];
  has_pets: boolean;
  first_time_renter: boolean;
  status: 'new' | 'reviewing' | 'closed';
  created_at: string;
  property_title: string | null;
};

function applicationDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function RenterApplicationsAdmin() {
  const [applications, setApplications] = useState<RentalApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest<RentalApplication[]>('/admin/rental-applications')
      .then((data) => { if (active) setApplications(data); })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load rental applications.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function updateStatus(application: RentalApplication, status: RentalApplication['status']) {
    try {
      await apiRequest(`/admin/rental-applications/${application.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setApplications((current) => current.map((item) => item.id === application.id ? { ...item, status } : item));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update the application status.');
    }
  }

  if (loading) return <div className="rental-admin-empty"><Loader2 size={20} className="chat-spin" /> Loading applications…</div>;
  if (error) return <div className="rental-admin-empty" role="alert">{error}</div>;
  if (applications.length === 0) {
    return <div className="rental-admin-empty"><ClipboardList size={23} /><p>No rental applications yet.</p></div>;
  }

  return (
    <div className="rental-admin-list">
      {applications.map((application) => (
        <article className="rental-admin-card" key={application.id}>
          <div className="rental-admin-card-heading">
            <div>
              <p className="eyebrow">Received {applicationDate(application.created_at)}</p>
              <h3>{application.applicant_name}</h3>
              <p>{application.property_title ?? 'Open to available properties'}</p>
            </div>
            <label className="rental-status-label">Status
              <select value={application.status} onChange={(event) => void updateStatus(application, event.target.value as RentalApplication['status'])}>
                <option value="new">New</option>
                <option value="reviewing">Reviewing</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          </div>
          <div className="rental-admin-contact">
            <a href={`mailto:${application.email}`}><Mail size={14} /> {application.email}</a>
            <a href={`tel:${application.phone}`}><Phone size={14} /> {application.phone}</a>
          </div>
          <dl className="rental-admin-details">
            <div><dt>Current address</dt><dd>{application.current_address}</dd></div>
            <div><dt>Employment</dt><dd>{application.employment_status}</dd></div>
            <div><dt>Monthly gross income</dt><dd>{application.monthly_gross_income === null ? 'Not provided' : Number(application.monthly_gross_income).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</dd></div>
            <div><dt>Move-in timing</dt><dd>{application.move_date}</dd></div>
            <div><dt>Pets</dt><dd>{application.has_pets ? 'Yes' : 'No'}</dd></div>
            <div><dt>First rental application</dt><dd>{application.first_time_renter ? 'Yes' : 'No'}</dd></div>
            <div className="rental-admin-amenities"><dt>Interested amenities</dt><dd>{application.amenities.length ? application.amenities.join(', ') : 'None selected'}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}
