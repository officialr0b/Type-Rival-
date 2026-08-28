import Link from 'next/link';

export type LegalSection = {
  heading: string;
  body: string;
};

export default function LegalDocument({ eyebrow, title, sections }: {
  eyebrow: string;
  title: string;
  sections: LegalSection[];
}) {
  return (
    <main className="legal-page">
      <Link className="back-button" href="/">← BACK TO TYPERIVAL</Link>
      <span className="eyebrow">{eyebrow} · UPDATED AUGUST 28, 2026</span>
      <h1>{title}</h1>
      <div className="legal-grid">
        {sections.map((section) => (
          <article key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
