import type { Metadata } from 'next';
import LegalDocument from '../legal-document';

export const metadata: Metadata = {
  title: 'Fair-Play Rules',
  description: 'Fair-play and competitive integrity rules for TypeRival.',
  alternates: { canonical: '/rules' },
};

export default function RulesPage() {
  return <LegalDocument eyebrow="FAIR-PLAY RULES" title="Your hands. Your score." sections={[
    { heading: 'Human typing only', body: 'Every competitive result must be typed by the player in real time. Scripts, macros, pasted text, programmable automation, synthetic input, and tools that complete or correct the passage are prohibited.' },
    { heading: 'One player, one account', body: 'Do not share accounts, play for another person, arrange outcomes, create duplicate accounts to manipulate ratings, or coordinate with an opponent to produce a false result.' },
    { heading: 'Devices and assistance', body: 'Normal phone, tablet, or physical-keyboard input is allowed in this MVP. Ranked mobile and tablet runs share one device class, while desktop runs use another. Emulators or accessibility tools may not be used to falsify input. Accessibility accommodations will be documented before organized prize events.' },
    { heading: 'Scoring', body: 'The server verifies the assigned passage, run ticket, permitted duration, timing window, and one-time submission. Accuracy, net WPM, performance score, and rating rules are applied consistently by the service.' },
    { heading: 'Suspicious results', body: 'Runs may be marked for review when speed, timing, accuracy, or request patterns appear implausible. Reviewed results do not enter clear leaderboards or award competitive progress unless accepted.' },
    { heading: 'Challenges and conduct', body: 'Friendly links expire and may be shared by anyone who receives them. Do not use handles, links, or competition to impersonate, harass, threaten, or reveal private information.' },
    { heading: 'Enforcement', body: 'TypeRival may invalidate results, remove leaderboard entries, limit features, or delete accounts when the evidence supports cheating, abuse, exploitation, or a threat to the competition.' },
    { heading: 'Free beta only', body: 'No cash contest is active. Any future prize event will have separate official rules, age and location requirements, identity checks, an appeal process, and legal review before entry opens.' },
  ]} />;
}
