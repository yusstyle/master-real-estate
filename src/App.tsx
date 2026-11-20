import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  ChevronDown,
  Eye,
  FileImage,
  ImagePlus,
  Layers3,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MoveDown,
  MoveUp,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { authClient } from '@/lib/auth';
import ChatWidget from '@/components/ChatWidget';
import ChatAdmin from '@/components/ChatAdmin';
import RenterApplication from '@/components/RenterApplication';
import RenterApplicationsAdmin from '@/components/RenterApplicationsAdmin';

type PropertyImage = {
  id: string;
  property_id: string;
  storage_path: string;
  image_url: string;
  alt_text: string;
  sort_order: number;
};

type Property = {
  id: string;
  title: string;
  address: string;
  price: string;
  availability: string;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  area_sq_ft: number;
  is_published: boolean;
  property_images: PropertyImage[];
};

type DraftProperty = {
  title: string;
  address: string;
  price: string;
  availability: string;
  property_type: string;
  bedrooms: string;
  bathrooms: string;
  area_sq_ft: string;
};

const illustrativeImages = [
  { src: '/assets/images/illustrative/image.png', label: 'Illustrative interior', alt: 'Illustrative modern residence interior with panoramic windows' },
  { src: '/assets/images/illustrative/image copy.png', label: 'Illustrative architecture', alt: 'Illustrative high-rise architecture photographed at dusk' },
  { src: '/assets/images/illustrative/image copy 2.png', label: 'Illustrative commercial', alt: 'Illustrative contemporary commercial building in daylight' },
  { src: '/assets/images/illustrative/image copy 3.png', label: 'Illustrative residence', alt: 'Illustrative contemporary family residence at sunset' },
  { src: '/assets/images/illustrative/image copy 4.png', label: 'Illustrative estate', alt: 'Illustrative luxury estate with a reflective pool at twilight' },
];

const blankDraft: DraftProperty = {
  title: '', address: '', price: '', availability: '', property_type: 'Residence', bedrooms: '', bathrooms: '', area_sq_ft: '',
};

function publicImageUrl(image: PropertyImage) {
  return image.image_url;
}

function App() {
  const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin';
  const [properties, setProperties] = useState<Property[]>([]);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [draft, setDraft] = useState<DraftProperty>(blankDraft);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<'listings' | 'enquiries' | 'applications'>('listings');
  const [applicationPropertyId, setApplicationPropertyId] = useState('');

  const selectedProperty = useMemo(() => properties.find((property) => property.id === selectedPropertyId) ?? null, [properties, selectedPropertyId]);
  const publishedProperties = properties.filter((property) => property.is_published);

  useEffect(() => {
    let active = true;
    void apiRequest<{ email: string | null; isAdmin: boolean }>('/session')
      .then(({ email, isAdmin }) => {
        if (!active) return;
        setSessionEmail(email);
        if (isAdminRoute && isAdmin) setManageOpen(true);
        else if (isAdminRoute) setAuthOpen(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice(error instanceof Error ? error.message : 'Could not load the current session.');
          if (isAdminRoute) {
            setAuthOpen(true);
            setAuthMessage(error instanceof Error ? error.message : 'Could not load the current session.');
          }
        }
      });
    return () => { active = false; };
  }, [isAdminRoute]);

  useEffect(() => {
    void loadProperties();
  }, [sessionEmail]);

  async function loadProperties() {
    try {
      const data = await apiRequest<Property[]>('/properties');
      setProperties(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The listing gallery is temporarily unavailable.');
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage('');
    try {
      const result = authMode === 'signin'
        ? await authClient.signIn.email({ email: authEmail, password: authPassword })
        : await authClient.signUp.email({
            email: authEmail,
            password: authPassword,
            name: authEmail.split('@')[0],
          });
      if (result.error) {
        setAuthMessage(result.error.message || 'We could not complete that request.');
        return;
      }
      const session = await apiRequest<{ email: string | null; isAdmin: boolean }>('/session');
      if (!session.isAdmin) {
        if (authMode === 'signup') {
          await authClient.signOut();
          setAuthMessage(import.meta.env.PROD
            ? 'Account created. Verify your email before signing in with a configured administrator account.'
            : 'Administrator access is limited to the addresses configured for this admin page.');
          setAuthMode('signin');
          return;
        }
        setAuthMessage('This account is not configured for administrator access.');
        return;
      }
      setSessionEmail(session.email);
      setAuthOpen(false);
      setManageOpen(true);
      setAuthEmail('');
      setAuthPassword('');
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'We could not complete that request.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    try {
      await authClient.signOut();
      setSessionEmail(null);
      setManageOpen(false);
      setSelectedPropertyId(null);
      if (isAdminRoute) setAuthOpen(true);
      void loadProperties();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not sign out.');
    }
  }

  function openApplication(propertyId = '') {
    setApplicationPropertyId(propertyId);
    document.getElementById('renter-application')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionEmail) return;
    setSaving(true);
    setNotice('');
    const payload = {
      title: draft.title,
      address: draft.address,
      price: draft.price,
      availability: draft.availability,
      property_type: draft.property_type,
      bedrooms: Number(draft.bedrooms) || 0,
      bathrooms: Number(draft.bathrooms) || 0,
      area_sq_ft: Number(draft.area_sq_ft) || 0,
    };
    try {
      const property = await apiRequest<Property>('/properties', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setProperties((current) => [property, ...current]);
      setSelectedPropertyId(property.id);
      const uploadNotice = pendingFiles.length > 0 ? await uploadFiles(property, pendingFiles) : null;
      setDraft(blankDraft);
      setPendingFiles([]);
      setNotice(uploadNotice ?? 'Listing saved. Add photos below, then publish when verified.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'We could not save this listing.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadFiles(propertyOverride?: Property, selectedFiles: File[] = pendingFiles): Promise<string | null> {
    const property = propertyOverride ?? selectedProperty;
    if (!property || !sessionEmail) return null;
    const existingCount = property.property_images?.length ?? 0;
    const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
    const accepted = selectedFiles.filter((file) => acceptedTypes.has(file.type) && file.size <= 10 * 1024 * 1024);
    const uploaded: PropertyImage[] = [];
    const uploadErrors: string[] = [];
    for (const [index, file] of accepted.entries()) {
      try {
        const signed = await apiRequest<{
          timestamp: number;
          publicId: string;
          signature: string;
          apiKey: string;
          cloudName: string;
        }>('/images/sign', {
          method: 'POST',
          body: JSON.stringify({ property_id: property.id }),
        });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', signed.apiKey);
        formData.append('timestamp', String(signed.timestamp));
        formData.append('public_id', signed.publicId);
        formData.append('signature', signed.signature);
        const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, {
          method: 'POST',
          body: formData,
        });
        const uploadResult = await uploadResponse.json() as { public_id?: string; secure_url?: string; error?: { message?: string } };
        if (!uploadResponse.ok || !uploadResult.public_id || !uploadResult.secure_url) {
          throw new Error(uploadResult.error?.message ?? 'Cloudinary could not upload this image.');
        }
        const image = await apiRequest<PropertyImage>(`/properties/${property.id}/images`, {
          method: 'POST',
          body: JSON.stringify({
            public_id: uploadResult.public_id,
            secure_url: uploadResult.secure_url,
            alt_text: `${property.title} — verified property photograph ${existingCount + index + 1}`,
          }),
        });
        uploaded.push(image);
      } catch (error) {
        uploadErrors.push(error instanceof Error ? error.message : 'An image upload failed.');
      }
    }
    setProperties((current) => current.map((item) => item.id === property.id ? { ...item, property_images: [...(item.property_images ?? []), ...uploaded] } : item));
    setPendingFiles([]);
    if (accepted.length !== selectedFiles.length) {
      return 'Some files were skipped. Use JPG, PNG, WebP, or AVIF images under 10 MB.';
    }
    return uploadErrors[0] ?? null;
  }

  async function deleteImage(image: PropertyImage) {
    if (!selectedProperty) return;
    try {
      await apiRequest(`/properties/${selectedProperty.id}/images/${image.id}`, { method: 'DELETE' });
      setProperties((current) => current.map((item) => item.id === selectedProperty.id ? { ...item, property_images: item.property_images.filter((entry) => entry.id !== image.id) } : item));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete the image.');
    }
  }

  async function moveImage(imageId: string, direction: -1 | 1) {
    if (!selectedProperty) return;
    const images = [...selectedProperty.property_images].sort((a, b) => a.sort_order - b.sort_order);
    const index = images.findIndex((image) => image.id === imageId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= images.length) return;
    [images[index], images[targetIndex]] = [images[targetIndex], images[index]];
    try {
      await apiRequest(`/properties/${selectedProperty.id}/images/order`, {
        method: 'PUT',
        body: JSON.stringify({ image_ids: images.map((image) => image.id) }),
      });
      setProperties((current) => current.map((item) => item.id === selectedProperty.id ? { ...item, property_images: images.map((image, nextIndex) => ({ ...image, sort_order: nextIndex })) } : item));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not reorder the images.');
    }
  }

  async function togglePublished(property: Property) {
    const nextValue = !property.is_published;
    try {
      await apiRequest(`/properties/${property.id}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ is_published: nextValue }),
      });
      setProperties((current) => current.map((item) => item.id === property.id ? { ...item, is_published: nextValue } : item));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update the publish status.');
    }
  }

  return (
    <div className={isAdminRoute ? 'app-shell admin-route' : 'app-shell'}>
      {isAdminRoute && (
        <header className="admin-route-header">
          <a className="brand" href="/" aria-label="Masters Real Estate home">
            <span className="brand-mark"><Building2 size={21} strokeWidth={1.5} /></span>
            <span><strong>MASTERS</strong><small>ADMIN</small></span>
          </a>
          <a className="admin-back-link" href="/">Back to website</a>
        </header>
      )}
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Masters Real Estate home">
          <span className="brand-mark"><Building2 size={21} strokeWidth={1.5} /></span>
          <span><strong>MASTERS</strong><small>REAL ESTATE</small></span>
        </a>
        <button className="mobile-menu" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle navigation"><Menu size={22} /></button>
        <nav className={mobileNavOpen ? 'site-nav is-open' : 'site-nav'}>
          <a href="#approach" onClick={() => setMobileNavOpen(false)}>Our approach</a>
          <a href="#collection" onClick={() => setMobileNavOpen(false)}>Collection</a>
          <a href="#renter-application" onClick={() => { setMobileNavOpen(false); setApplicationPropertyId(''); }}>Apply to rent</a>
          <a href="#journal" onClick={() => setMobileNavOpen(false)}>Journal</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow light"><span /> Curated property, considered living</p>
            <h1>Spaces with <em>presence.</em></h1>
            <p className="hero-intro">Masters connects people with architecture that feels inevitable — carefully selected residences, considered developments, and places made to endure.</p>
            <a className="button button-gold" href="#collection">Explore the collection <ArrowRight size={17} /></a>
          </div>
          <div className="hero-image"><img src={illustrativeImages[0].src} alt={illustrativeImages[0].alt} fetchPriority="high" /><span className="image-caption">Illustrative image · Interior study 01</span></div>
          <div className="hero-scroll">Scroll to discover <ChevronDown size={16} /></div>
        </section>

        <section className="statement" id="approach">
          <p className="eyebrow">The Masters standard</p>
          <h2>Real estate, <span>refined.</span></h2>
          <p className="statement-copy">We believe the right place changes how a life is lived. Our work is a deliberate edit: fewer properties, better context, and a level of care that continues long after the keys change hands.</p>
          <div className="principles">
            <div><span>01</span><strong>Point of view</strong><p>Architecture with a clear idea, not a passing trend.</p></div>
            <div><span>02</span><strong>Quiet confidence</strong><p>Useful detail, considered materials, no unnecessary noise.</p></div>
            <div><span>03</span><strong>Long horizon</strong><p>Decisions made for the next decade, not the next quarter.</p></div>
          </div>
        </section>

        <section className="image-band"><div className="band-image"><img src={illustrativeImages[1].src} alt={illustrativeImages[1].alt} loading="lazy" /><span className="image-caption">Illustrative image · Vertical study 02</span></div><div className="band-note"><Sparkles size={18} /><p>“A considered home is one that continues to reveal itself.”</p><span>— Masters editorial</span></div></section>

        <section className="collection" id="collection">
          <div className="section-heading"><div><p className="eyebrow">The collection</p><h2>Verified listings, <span>when ready.</span></h2></div><p className="section-note">Actual listings appear here only after a signed-in administrator adds verified property details and photographs.</p></div>
          {publishedProperties.length === 0 ? <div className="empty-collection"><div className="empty-icon"><FileImage size={27} /></div><div><h3>The collection is being composed.</h3><p>No verified properties are currently available to view. Illustrative photography elsewhere on this page is clearly marked and is not a listing.</p></div><a className="text-button" href="#renter-application">Start a rental application <ArrowRight size={16} /></a></div> : <div className="property-grid">{publishedProperties.map((property) => <PropertyCard key={property.id} property={property} onApply={() => openApplication(property.id)} />)}</div>}
        </section>

        <RenterApplication
          key={applicationPropertyId}
          properties={publishedProperties}
          initialPropertyId={applicationPropertyId}
        />

        <section className="feature-split" id="journal"><div className="feature-copy"><p className="eyebrow">A visual language</p><h2>Architecture is the first <span>conversation.</span></h2><p>From the weight of a door handle to the way morning light enters a room, the details tell you what a place values. We look closely, so you can decide confidently.</p><a className="text-button" href="#approach">Read our approach <ArrowRight size={16} /></a></div><div className="feature-image"><img src={illustrativeImages[2].src} alt={illustrativeImages[2].alt} loading="lazy" /><span className="image-caption">Illustrative image · Civic study 03</span></div></section>
        <section className="editorial-grid"><div className="editorial-image tall"><img src={illustrativeImages[3].src} alt={illustrativeImages[3].alt} loading="lazy" /><span className="image-caption">Illustrative image · Residential study 04</span></div><div className="editorial-copy"><p className="eyebrow">The journal</p><h2>Notes on the <span>made world.</span></h2><p>Short observations on spaces, cities, material, and the rituals that make a property feel like home.</p><button className="button button-outline">Journal coming soon <ArrowRight size={16} /></button></div><div className="editorial-image wide"><img src={illustrativeImages[4].src} alt={illustrativeImages[4].alt} loading="lazy" /><span className="image-caption">Illustrative image · Estate study 05</span></div></section>
      </main>

      {notice && !manageOpen && <p className="notice" role="status"><ShieldCheck size={16} /> {notice}</p>}
      <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><Building2 size={20} strokeWidth={1.5} /></span><strong>MASTERS</strong></div><p>Independent real estate, thoughtfully presented.</p><span className="footer-line" /></footer>

      {authOpen && <div className="overlay" role="dialog" aria-modal="true"><div className="auth-card"><button className="close-button" onClick={() => { setAuthOpen(false); if (isAdminRoute) window.location.assign('/'); }} aria-label="Close"><X size={20} /></button><div className="auth-symbol"><LockKeyhole size={21} /></div><p className="eyebrow">Private workspace</p><h2>{authMode === 'signin' ? 'Administrator sign in.' : 'Create administrator access.'}</h2><p className="auth-description">Only configured administrator email addresses can access applications and manage listings.</p><form onSubmit={handleAuth}><label>Email address<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required /></label><label>Password<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} minLength={8} required /></label><button className="button button-dark full-width" disabled={authLoading}>{authLoading ? 'Please wait…' : authMode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></button></form>{authMessage && <p className="form-message">{authMessage}</p>}<button className="switch-auth" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthMessage(''); }}>{authMode === 'signin' ? 'Need an account? Create one' : 'Already have access? Sign in'}</button></div></div>}

      {manageOpen && (
        <div className="overlay manager-overlay" role="dialog" aria-modal="true">
          <div className="manager-card">
            <div className="manager-header">
              <div>
                <p className="eyebrow">Admin dashboard</p>
                <h2>{adminTab === 'listings' ? 'Listing studio' : adminTab === 'enquiries' ? 'Customer enquiries' : 'Renter applications'}</h2>
                <p>{sessionEmail}</p>
              </div>
              <div className="manager-actions">
                <button className="icon-text-button" onClick={signOut}><LogOut size={16} /> Sign out</button>
                <button className="close-button" onClick={() => { setManageOpen(false); if (isAdminRoute) window.location.assign('/'); }} aria-label="Close"><X size={20} /></button>
              </div>
              <div className="admin-tabs">
                <button className={adminTab === 'listings' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setAdminTab('listings')}><Building2 size={14} /> Listings</button>
                <button className={adminTab === 'enquiries' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setAdminTab('enquiries')}><Mail size={14} /> Enquiries</button>
                <button className={adminTab === 'applications' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => setAdminTab('applications')}><ClipboardList size={14} /> Applications</button>
              </div>
            </div>
            {adminTab === 'listings' ? (
              <div className="manager-layout">
                <form className="listing-form" onSubmit={saveProperty}>
                  <div className="form-section-title"><span>01</span><strong>Property details</strong></div>
                  {(['title', 'address', 'price', 'availability'] as const).map((field) => (
                    <label key={field}>
                      {field === 'title' ? 'Listing title' : field === 'address' ? 'Verified address' : field === 'price' ? 'Price' : 'Availability'}
                      <input
                        value={draft[field]}
                        onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                        placeholder={field === 'address' ? 'Enter only verified information' : ''}
                        required
                      />
                    </label>
                  ))}
                  <div className="field-row">
                    <label>Type
                      <select value={draft.property_type} onChange={(event) => setDraft({ ...draft, property_type: event.target.value })}>
                        <option>Residence</option><option>Condominium</option><option>Townhome</option><option>Commercial</option><option>Land</option>
                      </select>
                    </label>
                    <label>Bedrooms<input type="number" min="0" value={draft.bedrooms} onChange={(event) => setDraft({ ...draft, bedrooms: event.target.value })} required /></label>
                  </div>
                  <div className="field-row">
                    <label>Bathrooms<input type="number" min="0" step="0.5" value={draft.bathrooms} onChange={(event) => setDraft({ ...draft, bathrooms: event.target.value })} required /></label>
                    <label>Area (sq ft)<input type="number" min="0" value={draft.area_sq_ft} onChange={(event) => setDraft({ ...draft, area_sq_ft: event.target.value })} required /></label>
                  </div>
                  <label className="file-drop">
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => setPendingFiles(Array.from(event.target.files ?? []))} />
                    <ImagePlus size={22} />
                    <strong>{pendingFiles.length ? `${pendingFiles.length} photo${pendingFiles.length === 1 ? '' : 's'} selected` : 'Add verified property photos'}</strong>
                    <span>JPG, PNG, WebP or AVIF · up to 10 MB each</span>
                  </label>
                  <button className="button button-dark full-width" disabled={saving}>
                    {saving ? 'Saving listing…' : <><Plus size={17} /> Save listing</>}
                  </button>
                </form>
                <div className="studio-list">
                  <div className="form-section-title"><span>02</span><strong>Existing listings</strong></div>
                  {properties.length === 0 ? (
                    <div className="studio-empty"><Layers3 size={20} /><p>Saved listings will appear here.</p></div>
                  ) : properties.map((property) => (
                    <div key={property.id} className={selectedPropertyId === property.id ? 'studio-property selected' : 'studio-property'}>
                      <button onClick={() => setSelectedPropertyId(property.id)}>
                        <span><strong>{property.title}</strong><small>{property.address}</small></span>
                        <span className={property.is_published ? 'status published' : 'status'}>{property.is_published ? 'Published' : 'Draft'}</span>
                      </button>
                      {selectedPropertyId === property.id && (
                        <div className="image-manager">
                          <div className="image-manager-top">
                            <span>{property.property_images.length} photos</span>
                            <label className="mini-upload">
                              <Upload size={14} /> Add photos
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/avif"
                                multiple
                                onChange={(event) => {
                                  const files = Array.from(event.target.files ?? []);
                                  setPendingFiles(files);
                                  void uploadFiles(property, files);
                                }}
                              />
                            </label>
                          </div>
                          {property.property_images.length === 0 && <p className="small-muted">No verified photos uploaded yet.</p>}
                          {[...property.property_images].sort((a, b) => a.sort_order - b.sort_order).map((image, index) => (
                            <div className="managed-image" key={image.id}>
                              <img src={publicImageUrl(image)} alt={image.alt_text} />
                              <div><span>Image {index + 1}</span><small>{image.alt_text}</small></div>
                              <button onClick={() => void moveImage(image.id, -1)} disabled={index === 0} aria-label="Move image up"><MoveUp size={15} /></button>
                              <button onClick={() => void moveImage(image.id, 1)} disabled={index === property.property_images.length - 1} aria-label="Move image down"><MoveDown size={15} /></button>
                              <button className="danger-button" onClick={() => void deleteImage(image)} aria-label="Delete image"><Trash2 size={15} /></button>
                            </div>
                          ))}
                          <button
                            className={property.is_published ? 'publish-button is-published' : 'publish-button'}
                            onClick={() => void togglePublished(property)}
                          >
                            {property.is_published ? <><Check size={15} /> Published to collection</> : <><Eye size={15} /> Publish after verification</>}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : adminTab === 'enquiries' ? <ChatAdmin /> : <RenterApplicationsAdmin />}
            {notice && <p className="notice"><ShieldCheck size={16} /> {notice}</p>}
          </div>
        </div>
      )}

      <ChatWidget />
    </div>
  );
}

function PropertyCard({ property, onApply }: { property: Property; onApply: () => void }) {
  const image = [...property.property_images].sort((a, b) => a.sort_order - b.sort_order)[0];
  return <article className="property-card">{image ? <img src={publicImageUrl(image)} alt={image.alt_text} loading="lazy" /> : <div className="property-placeholder"><FileImage size={22} /><span>Photographs forthcoming</span></div>}<div className="property-card-body"><div className="property-card-top"><span className="property-type">{property.property_type}</span><span>{property.availability}</span></div><h3>{property.title}</h3><p>{property.address}</p><div className="property-meta"><span>{property.bedrooms} beds</span><span>{property.bathrooms} baths</span><span>{property.area_sq_ft.toLocaleString()} sq ft</span></div><strong className="property-price">{property.price}</strong><button className="button button-dark property-apply-button" onClick={onApply}>Apply for this property <ArrowRight size={15} /></button></div></article>;
}

export default App;
