import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCodeDocument } from "../../../../lib/code-catalog";
import { findCodeChunk } from "../../../../lib/code-index";

type SourcePageProps = {
  params: Promise<{
    documentId: string;
    locator: string;
  }>;
};

export async function generateMetadata({
  params,
}: SourcePageProps): Promise<Metadata> {
  const { documentId: rawDocumentId, locator: rawLocator } = await params;
  const documentId = decodeURIComponent(rawDocumentId);
  const locator = decodeURIComponent(rawLocator);
  const chunk = await findCodeChunk(documentId, locator);

  return {
    title: chunk
      ? `${chunk.documentLabel} ${chunk.locator}`
      : `WHS Code Source ${locator}`,
    description: chunk?.title
      ? `${chunk.title} from ${chunk.documentLabel}.`
      : "WHS code source reference.",
  };
}

export default async function SourcePage({ params }: SourcePageProps) {
  const { documentId: rawDocumentId, locator: rawLocator } = await params;
  const documentId = decodeURIComponent(rawDocumentId);
  const requestedLocator = decodeURIComponent(rawLocator);
  const document = getCodeDocument(documentId);
  const chunk = await findCodeChunk(documentId, requestedLocator);

  if (!document || !chunk) {
    notFound();
  }

  const search = chunk.section ?? chunk.title ?? "";
  const pdfUrl = `${document.pdfUrl}#page=${chunk.page ?? 1}${
    search ? `&search=${encodeURIComponent(search)}` : ""
  }`;

  return (
    <main className="section-shell">
      <article className="section-document">
        <header className="section-viewer-header">
          <Link className="back-link" href="/">
            Back to chat
          </Link>

          <div className="section-title-block">
            <p className="eyebrow">WHS code reference</p>
            <h1>
              {chunk.documentLabel} {chunk.locator}
            </h1>

            {chunk.title ? <h2>{chunk.title}</h2> : null}
          </div>
        </header>

        <iframe
          className="pdf-frame"
          src={pdfUrl}
          title={`${chunk.documentLabel} ${chunk.locator} PDF page`}
        />

        {requestedLocator !== chunk.locator ? (
          <p className="section-note">
            The index did not contain a separate entry for {requestedLocator}, so
            this page shows {chunk.locator}.
          </p>
        ) : null}

        <details className="section-text-fallback">
          <summary>Show extracted fallback text</summary>
          <div className="section-text">
            {chunk.text.split(/\n{2,}/).map((paragraph, index) => (
              <p key={`${chunk.documentId}-${chunk.locator}-${index}`}>
                {paragraph}
              </p>
            ))}
          </div>
        </details>

        <p className="section-footer">
          Source text comes from the configured WHS code index. Verify final
          interpretations with the authority having jurisdiction.
        </p>
      </article>
    </main>
  );
}
