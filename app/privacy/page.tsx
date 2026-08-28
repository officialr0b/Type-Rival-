import type { Metadata } from 'next';
import LegalDocument from '../legal-document';

export const metadata: Metadata = {
  title: 'Privacy Notice',
  description: 'How the TypeRival beta collects, uses, and protects information.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return <LegalDocument eyebrow="PRIVACY NOTICE" title="Your data stays yours." sections={[
    { heading: 'Who this applies to', body: 'This notice covers the TypeRival web beta. Players must be at least 13 to create an account. Children under 13 may use private practice stored only on their device and should not submit personal information.' },
    { heading: 'Information collected', body: 'For signed-in players, TypeRival stores an account identifier, email through the authentication provider, public handle, run metrics, passages and timing, XP, rating, match outcomes, and challenge activity.' },
    { heading: 'Security information', body: 'Operational systems may process IP addresses, browser or device details, request identifiers, and logs to prevent abuse, investigate errors, enforce rate limits, and keep the service reliable.' },
    { heading: 'How information is used', body: 'Information authenticates players, saves progress, calculates rankings, operates challenges, prevents abuse, troubleshoots failures, and improves TypeRival. Gameplay data is not sold or used for third-party advertising in this MVP.' },
    { heading: 'Service providers', body: 'Supabase processes authentication and database data, Vercel hosts the web application and operational logs, and Google processes information when Google sign-in is selected. Information may be disclosed when required by law or needed to protect users and the service.' },
    { heading: 'Public information', body: 'Your chosen handle, leaderboard averages, rating, and challenge results may be visible to other people. Do not use your email, full name, or other private information as a handle.' },
    { heading: 'Retention and control', body: 'Saved gameplay remains while an account is active unless security, operational, or legal needs require a different period. Signed-in players can download their TypeRival data or permanently delete their account from the Account page.' },
    { heading: 'Local practice and security', body: 'Guest practice is stored in the browser and can be removed by clearing site data. TypeRival uses access controls, server validation, encrypted connections, and rate limits, but no online service can guarantee absolute security.' },
  ]} />;
}
