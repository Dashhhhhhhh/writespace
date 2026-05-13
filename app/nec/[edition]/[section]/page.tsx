import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCodeDocument } from "../../../../lib/code-catalog";
import { findNecSection, getNecEdition } from "../../../../lib/nec";

type SectionPageProps = {
  params: Promise<{
    edition: string;
    section: string;
  }>;
};

export async function generateMetadata({
  params,
}: SectionPageProps): Promise<Metadata> {
  const { edition: rawEdition, section: rawSection } = await params;
  const edition = getNecEdition(decodeURIComponent(rawEdition));
  const sectionId = decodeURIComponent(rawSection);
  const section = await findNecSection(edition, sectionId);

  return {
    title: section
      ? `NEC ${section.edition} ${section.section}`
      : `NEC ${edition} ${sectionId}`,
    description: section?.title
      ? `${section.title} from the configured NEC ${section.edition} index.`
      : `NEC ${edition} section reference.`,
  };
}

export default async function SectionPage({ params }: SectionPageProps) {
  const { edition: rawEdition, section: rawSection } = await params;
  const edition = getNecEdition(decodeURIComponent(rawEdition));
  const requestedSection = decodeURIComponent(rawSection);
  const section = await findNecSection(edition, requestedSection);

  if (!section) {
    notFound();
  }

  const document = getCodeDocument(`nec-${section.edition}`);
  const pdfPath = document?.pdfUrl ?? `/code-pdf/nec-${section.edition}.pdf`;
  const pdfUrl = `${pdfPath}#page=${section.page ?? 1}&search=${encodeURIComponent(section.section)}`;

  return (
    <main className="section-shell">
      <article className="section-document">
        <header className="section-viewer-header">
          <Link className="back-link" href="/">
            Back to chat
          </Link>

          <div className="section-title-block">
            <p className="eyebrow">National Electrical Code reference</p>
            <h1>
              NEC {section.edition} {section.section}
            </h1>

            {section.title ? <h2>{section.title}</h2> : null}
          </div>
        </header>

        <iframe
          className="pdf-frame"
          src={pdfUrl}
          title={`NEC ${section.edition} ${section.section} PDF page`}
        />

        {requestedSection !== section.section ? (
          <p className="section-note">
            The index did not contain a separate entry for {requestedSection}, so
            this page shows parent section {section.section}.
          </p>
        ) : null}

        <details className="section-text-fallback">
          <summary>Show extracted fallback text</summary>
          <div className="section-text">
            {section.text.split(/\n{2,}/).map((paragraph, index) => (
              <p key={`${section.section}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </details>

        <p className="section-footer">
          Source text comes from the licensed NEC index configured for this
          deployment. Verify final interpretations with the authority having
          jurisdiction.
        </p>
      </article>
    </main>
  );
}
