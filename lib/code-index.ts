import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildCodeSourceUrl as buildCatalogCodeSourceUrl,
  getCodeDocument,
  getCodeDocumentLabel,
  type CodeDocument,
} from "./code-catalog";

export type CodeCitation = {
  documentId: string;
  documentLabel: string;
  codeLabel: string;
  edition: string;
  locator: string;
  section?: string;
  title?: string;
  url?: string;
  page?: number;
};

export type CodeChunk = CodeCitation & {
  text: string;
};

export type CodeMatch = CodeChunk & {
  score: number;
  snippet: string;
};

type RawCodeIndex = {
  documentId?: unknown;
  edition?: unknown;
  chunks?: unknown;
  sections?: unknown;
};

type CandidateDocumentResult = {
  document: CodeDocument;
  matches: CodeMatch[];
  score: number;
};

const MAX_SNIPPET_LENGTH = 850;
const MAX_RESULTS = 8;
const indexCache = new Map<string, Promise<CodeChunk[]>>();

export function buildCodeSourceUrl(
  citation: Pick<CodeCitation, "documentId" | "locator">,
) {
  return buildCatalogCodeSourceUrl(citation.documentId, citation.locator);
}

export function toCodeCitation(chunk: CodeChunk): CodeCitation {
  return {
    documentId: chunk.documentId,
    documentLabel: chunk.documentLabel,
    codeLabel: chunk.codeLabel,
    edition: chunk.edition,
    locator: chunk.locator,
    section: chunk.section,
    title: chunk.title,
    page: chunk.page,
    url: buildCodeSourceUrl(chunk),
  };
}

export async function loadCodeChunks(document: CodeDocument) {
  const cached = indexCache.get(document.id);

  if (cached) {
    return cached;
  }

  const loading = readCodeChunks(document);
  indexCache.set(document.id, loading);

  try {
    return await loading;
  } catch (error) {
    indexCache.delete(document.id);
    throw error;
  }
}

export async function findCodeChunk(documentId: string, locator: string) {
  const document = getCodeDocument(documentId);

  if (!document) {
    return null;
  }

  const chunks = await loadCodeChunks(document);
  const normalizedLocator = locator.trim().toLowerCase();
  const exactMatch = chunks.find(
    (chunk) => chunk.locator.toLowerCase() === normalizedLocator,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const page = Number(locator.match(/\b(?:page|p\.)\s*(\d+)\b/i)?.[1]);

  if (Number.isFinite(page) && page > 0) {
    return chunks.find((chunk) => chunk.page === page) ?? null;
  }

  const parentSection = locator.trim().replace(/\([A-Za-z0-9]+\).*$/, "");

  if (parentSection && parentSection !== locator.trim()) {
    return (
      chunks.find(
        (chunk) =>
          chunk.locator.toLowerCase() === parentSection.toLowerCase() ||
          chunk.section?.toLowerCase() === parentSection.toLowerCase(),
      ) ?? null
    );
  }

  return null;
}

export async function selectCodeDocumentForQuestion(
  documents: CodeDocument[],
  question: string,
) {
  const settledResults = await Promise.allSettled(
    documents.map(async (document): Promise<CandidateDocumentResult> => {
      const chunks = await loadCodeChunks(document);
      const matches = retrieveCodeChunks(chunks, question);
      const retrievalScore = matches[0]?.score ?? 0;

      return {
        document,
        matches,
        score: scoreCodeDocument(document, question) + retrievalScore,
      };
    }),
  );

  const results = settledResults
    .filter(
      (result): result is PromiseFulfilledResult<CandidateDocumentResult> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value)
    .sort((left, right) => right.score - left.score);

  if (results.length === 0) {
    const firstError = settledResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )?.reason;

    throw new Error(
      firstError instanceof Error
        ? firstError.message
        : "No selected code indexes are available. Build the local indexes before using chat.",
    );
  }

  return results[0];
}

export function retrieveCodeChunks(
  chunks: CodeChunk[],
  question: string,
  maxResults = MAX_RESULTS,
) {
  const tokens = tokenize(question);
  const references = extractReferences(question);
  const normalizedQuestion = question.toLowerCase();

  return chunks
    .map((chunk) => {
      const searchableText = `${chunk.locator} ${chunk.section ?? ""} ${
        chunk.title ?? ""
      } ${chunk.text}`;
      const normalizedText = searchableText.toLowerCase();
      let score = 0;

      references.forEach((reference) => {
        const normalizedReference = reference.toLowerCase();
        const locator = chunk.locator.toLowerCase();
        const section = chunk.section?.toLowerCase() ?? "";

        if (locator === normalizedReference || section === normalizedReference) {
          score += 80;
          return;
        }

        if (
          locator.startsWith(normalizedReference) ||
          section.startsWith(normalizedReference)
        ) {
          score += 32;
        }

        if (normalizedText.includes(normalizedReference)) {
          score += 24;
        }
      });

      tokens.forEach((token) => {
        const titleHit = chunk.title?.toLowerCase().includes(token) ?? false;
        const locatorHit =
          chunk.locator.toLowerCase().includes(token) ||
          chunk.section?.toLowerCase().includes(token);
        const textHits = countOccurrences(normalizedText, token);

        score += textHits;

        if (titleHit) {
          score += 8;
        }

        if (locatorHit) {
          score += 12;
        }
      });

      if (/\bgfci\b|ground[- ]fault/.test(normalizedQuestion)) {
        score += countOccurrences(normalizedText, "ground-fault") * 5;
      }

      if (/\bafci\b|arc[- ]fault/.test(normalizedQuestion)) {
        score += countOccurrences(normalizedText, "arc-fault") * 5;
      }

      return {
        ...chunk,
        score,
        snippet: buildSnippet(chunk.text, tokens.concat(references)),
      } satisfies CodeMatch;
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults);
}

function scoreCodeDocument(document: CodeDocument, question: string) {
  const normalizedQuestion = question.toLowerCase();
  let score = 0;

  if (normalizedQuestion.includes(document.edition.toLowerCase())) {
    score += 12;
  }

  [document.codeLabel, document.familyLabel, document.name].forEach((label) => {
    if (phraseInText(normalizedQuestion, label)) {
      score += 55;
    }
  });

  document.aliases.forEach((alias) => {
    if (phraseInText(normalizedQuestion, alias)) {
      score += alias.length <= 4 ? 70 : 42;
    }
  });

  return score;
}

async function readCodeChunks(document: CodeDocument) {
  const indexSource = getCodeIndexUrl(document) ?? getCodeIndexPath(document);
  let rawIndex: string;

  if (isRemoteUrl(indexSource)) {
    rawIndex = await fetchRemoteIndex(indexSource);
  } else {
    try {
      rawIndex = await fs.readFile(/*turbopackIgnore: true*/ indexSource, "utf8");
    } catch (error) {
      const message =
        error instanceof Error && "code" in error && error.code === "ENOENT"
          ? `Code index not found for ${getCodeDocumentLabel(
              document,
            )} at ${indexSource}. Build it with npm run index:codes.`
          : `Unable to read the code index for ${getCodeDocumentLabel(
              document,
            )} at ${indexSource}.`;

      throw new Error(message);
    }
  }

  let parsed: RawCodeIndex;

  try {
    parsed = JSON.parse(rawIndex) as RawCodeIndex;
  } catch {
    throw new Error(`${getCodeDocumentLabel(document)} index is not valid JSON.`);
  }

  const rawChunks = Array.isArray(parsed.chunks)
    ? parsed.chunks
    : Array.isArray(parsed.sections)
      ? parsed.sections
      : [];

  const chunks = rawChunks
    .map((chunk): CodeChunk | null => normalizeCodeChunk(document, chunk))
    .filter((chunk): chunk is CodeChunk => chunk !== null);

  if (chunks.length === 0) {
    throw new Error(
      `${getCodeDocumentLabel(document)} index does not contain usable text chunks.`,
    );
  }

  return chunks;
}

function normalizeCodeChunk(document: CodeDocument, value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const text = String(candidate.text ?? "").trim();

  if (!text) {
    return null;
  }

  const section = String(candidate.section ?? "").trim();
  const rawLocator = String(candidate.locator ?? "").trim();
  const page = Number(candidate.page);
  const title = String(candidate.title ?? "").trim();
  const locator =
    rawLocator ||
    section ||
    (Number.isFinite(page) && page > 0 ? `Page ${page}` : "");

  if (!locator) {
    return null;
  }

  return {
    documentId: document.id,
    documentLabel: getCodeDocumentLabel(document),
    codeLabel: document.codeLabel,
    edition: String(candidate.edition ?? document.edition).trim() || document.edition,
    locator,
    section: section || undefined,
    title: title || undefined,
    text,
    page: Number.isFinite(page) && page > 0 ? page : undefined,
    url: buildCodeSourceUrl({ documentId: document.id, locator }),
  } satisfies CodeChunk;
}

function getCodeIndexPath(document: CodeDocument) {
  return path.isAbsolute(document.indexPath)
    ? document.indexPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), document.indexPath);
}

function getCodeIndexUrl(document: CodeDocument) {
  const documentEnvKey = `CODE_INDEX_URL_${document.id
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")}`;
  const documentUrl = process.env[documentEnvKey]?.trim();

  if (documentUrl) {
    return documentUrl;
  }

  const baseUrl = process.env.CODE_INDEX_BASE_URL?.trim();

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/+$/, "")}/${document.id}.json`;
}

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

async function fetchRemoteIndex(indexUrl: string) {
  let url: URL;

  try {
    url = new URL(indexUrl);
  } catch {
    throw new Error("CODE_INDEX_URL values must be valid absolute URLs.");
  }

  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("CODE_INDEX_URL values must use HTTPS unless they point to localhost.");
  }

  const bearerToken =
    process.env.CODE_INDEX_BEARER_TOKEN?.trim() ||
    process.env.NEC_INDEX_BEARER_TOKEN?.trim();
  const response = await fetch(url, {
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(
      `Unable to fetch code index from ${url.origin}${url.pathname}: HTTP ${response.status}.`,
    );
  }

  return response.text();
}

function tokenize(value: string) {
  const normalizedValue = value.toLowerCase();
  const tokens = normalizedValue
    .replace(/[^a-z0-9.() -]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

  if (/\bgfci\b|ground[- ]fault/.test(normalizedValue)) {
    tokens.push("ground", "fault", "circuit", "interrupter", "protection");
  }

  if (/\bafci\b|arc[- ]fault/.test(normalizedValue)) {
    tokens.push("arc", "fault", "circuit", "interrupter", "protection");
  }

  return Array.from(new Set(tokens));
}

function extractReferences(value: string) {
  return Array.from(
    new Set(
      value.match(/\b\d{1,4}(?:\.\d+)+(?:\([A-Za-z0-9]+\))*\b/g) ?? [],
    ),
  );
}

function countOccurrences(value: string, token: string) {
  let count = 0;
  let offset = value.indexOf(token);

  while (offset !== -1) {
    count += 1;
    offset = value.indexOf(token, offset + token.length);
  }

  return count;
}

function buildSnippet(text: string, tokens: string[]) {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (normalizedText.length <= MAX_SNIPPET_LENGTH) {
    return normalizedText;
  }

  const lowerText = normalizedText.toLowerCase();
  const firstHit = tokens
    .map((token) => lowerText.indexOf(token.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  const center = firstHit ?? 0;
  const start = Math.max(0, center - Math.floor(MAX_SNIPPET_LENGTH / 3));
  const end = Math.min(normalizedText.length, start + MAX_SNIPPET_LENGTH);
  const snippet = normalizedText.slice(start, end).trim();

  return `${start > 0 ? "... " : ""}${snippet}${
    end < normalizedText.length ? " ..." : ""
  }`;
}

function phraseInText(text: string, phrase: string) {
  const normalizedPhrase = phrase.toLowerCase().trim();

  if (!normalizedPhrase) {
    return false;
  }

  const escaped = escapeRegExp(normalizedPhrase).replace(/\s+/g, "\\s+");
  const needsBoundary = /^[a-z0-9]/i.test(normalizedPhrase);
  const boundary = needsBoundary ? "\\b" : "";
  const pattern = new RegExp(`${boundary}${escaped}${boundary}`, "i");

  return pattern.test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "all",
  "and",
  "any",
  "are",
  "can",
  "code",
  "does",
  "for",
  "from",
  "have",
  "how",
  "into",
  "need",
  "not",
  "the",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
]);
