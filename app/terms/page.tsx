import type { Metadata } from 'next';
import LegalDocument from '../legal-document';

export const metadata: Metadata = {
  title: 'Beta Terms',
  description: 'Terms for the TypeRival free-to-play beta.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return <LegalDocument eyebrow="BETA TERMS" title="Play hard. Keep it fair." sections={[
    { heading: 'Agreement and eligibility', body: 'By creating an account or using online competition, you agree to these MVP terms. Players must be at least 13 to create an account. Visitors under 13 may use private, device-only practice and must not submit personal information.' },
    { heading: 'Free MVP', body: 'TypeRival currently has no entry fees, wagers, cash wallet, purchasable competitive advantage, or cash prizes. XP has no cash value and cannot be transferred, sold, or redeemed.' },
    { heading: 'Scoring and rankings', body: 'Net WPM is based on correct characters and errors. A player below 90% accuracy cannot defeat a player at or above 90%. Remaining ties use performance score, then accuracy. Clear signed-in runs may appear on the rolling 30-day leaderboard. Ranked Time Trial results are separated into touch, swipe, and hardware lanes. Private Race alpha results are session-only and do not change XP or rating.' },
    { heading: 'Acceptable use', body: 'Do not cheat, automate input, impersonate others, harass players, expose private information, disrupt the service, exploit bugs, or use TypeRival unlawfully. You are responsible for activity performed through your account.' },
    { heading: 'Enforcement', body: 'TypeRival may hold, remove, or invalidate suspicious results and may limit or delete accounts for cheating, abuse, unlawful conduct, security threats, or repeated violations.' },
    { heading: 'Availability and changes', body: 'The beta is provided on an “as available” basis to the extent permitted by law. Features, rankings, XP, and availability may change, pause, or end as the product develops.' },
    { heading: 'Future prizes', body: 'Any future sponsor-funded skill event will launch separately with official rules, eligibility and identity checks, jurisdiction controls, tax disclosures, and professional legal review. No prize event is active today.' },
    { heading: 'Updates', body: 'Material changes will be reflected by a new effective date. Continued use after a change means you accept the updated beta terms, subject to rights that cannot legally be waived.' },
  ]} />;
}
