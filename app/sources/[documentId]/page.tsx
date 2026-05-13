import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCodeDocument } from "../../../lib/code-catalog";

type SourceDocumentPageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function generateMetadata({
  params,
}: SourceDocumentPageProps): Promise<Metadata> {
  const { documentId: rawDocumentId } = await params;
  const documentId = decodeURIComponent(rawDocumentId);
  const document = getCodeDocument(documentId);

  return {
    title: document
      ? `${document.codeLabel} ${document.edition} PDF Viewer`
      : "WHS Code PDF Viewer",
    description: document
      ? `PDF viewer for ${document.name} ${document.edition}.`
      : "WHS code source PDF viewer.",
  };
}

export default async function SourceDocumentPage({
  params,
}: SourceDocumentPageProps) {
  const { documentId: rawDocumentId } = await params;
  const documentId = decodeURIComponent(rawDocumentId);
  const document = getCodeDocument(documentId);

  if (!document) {
    notFound();
  }

  const pdfUrl = `${document.pdfUrl}#page=1`;

  return (
    <main className="section-shell">
      <article className="section-document section-document-full-viewer">
        <header className="section-viewer-header">
          <Link className="back-link" href="/">
            Back to chat
          </Link>

          <div className="section-title-block">
            <p className="eyebrow">WHS code source PDF</p>
            <h1>
              {document.codeLabel} {document.edition}
            </h1>
            <h2>{document.name}</h2>
          </div>
        </header>

        <iframe
          className="pdf-frame"
          src={pdfUrl}
          title={`${document.codeLabel} ${document.edition} PDF viewer`}
        />

        <p className="section-footer">
          Source PDFs are provided for in-app reference. Verify final
          interpretations with the authority having jurisdiction.
        </p>
      </article>
    </main>
  );
}
