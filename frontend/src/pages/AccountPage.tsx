import { useAuth, roleLabel } from '../auth/AuthContext'
import { useDatasetContext } from '../context/DatasetContext'
import { PageHeader } from '../components/layout/PageHeader'
import { CampusIDBadge } from '../components/account/CampusIDBadge'
import { Skeleton } from '../components/ui/Skeleton'
import './AccountPage.css'

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div className="account-detail"><span>{label}</span><strong>{value?.trim() || 'Not provided'}</strong></div>
}

export function AccountPage() {
  const { user, loading } = useAuth()
  const { datasets, loading: datasetsLoading } = useDatasetContext()
  const assignedDataset = user?.dataset_id ? datasets.find((dataset) => dataset.id === user.dataset_id) : undefined

  if (loading) return <div className="account-page"><PageHeader eyebrow="YOUR AXIOM PROFILE" title="Account" description="Your campus identity and account details." /><div className="account-loading"><Skeleton width="100%" height={300} /><Skeleton width="100%" height={130} /></div></div>
  if (!user) return <div className="account-page"><PageHeader eyebrow="YOUR AXIOM PROFILE" title="Account" description="Your campus identity and account details." /><section className="account-empty" role="status"><strong>Account information unavailable</strong><span>Sign in again to view your AXIOM account.</span></section></div>

  const affiliation = [
    user.department,
    user.faculty_source_id ? `Faculty ${user.faculty_source_id}` : null,
    user.club_id ? `Club ${user.club_id}` : null,
  ].filter(Boolean).join(' · ')
  const name = user.username || 'Not provided'
  const role = roleLabel(user.role)

  return <div className="account-page">
    <PageHeader eyebrow="YOUR AXIOM PROFILE" title="Account" description="Your campus identity, role and account details. This view is private to your signed-in account." />
    <div className="account-layout">
      <section className="account-badge-panel" aria-labelledby="account-badge-heading">
        <div className="account-panel-heading"><span>IDENTITY CARD</span><h2 id="account-badge-heading">Campus identification</h2><p>Your AXIOM account ID is encoded in both the barcode and QR code.</p></div>
        <CampusIDBadge displayName={name} canonicalId={user.username} roleKey={user.role} role={role} affiliation={affiliation} organization={assignedDataset?.institute} />
      </section>
      <section className="account-information-panel" aria-labelledby="account-information-heading">
        <div className="account-panel-heading"><span>ACCOUNT DETAILS</span><h2 id="account-information-heading">Your profile</h2><p>Only information returned for your current authenticated session is shown.</p></div>
        <div className="account-details">
          <Detail label="Account name" value={user.username} />
          <Detail label="AXIOM account ID" value={user.username} />
          <Detail label="Role" value={role} />
          <Detail label="Department" value={user.department} />
          {user.faculty_source_id && <Detail label="Faculty record" value={user.faculty_source_id} />}
          {user.club_id && <Detail label="Club / organization" value={user.club_id} />}
          {user.dataset_id && <Detail label="Assigned institution" value={datasetsLoading ? 'Loading…' : assignedDataset?.institute} />}
          {!user.dataset_id && user.role === 'admin' && <Detail label="Dataset access" value="Administrative access" />}
        </div>
        <div className="account-privacy-note"><span aria-hidden="true">◇</span><p>AXIOM does not expose your internal database identifier, passwords, or session tokens on this badge.</p></div>
      </section>
    </div>
  </div>
}
