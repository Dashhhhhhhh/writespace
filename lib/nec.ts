import { promises as fs } from "node:fs";
import path from "node:path";

export type NecCitation = {
  edition: string;
  section: string;
  title?: string;
  url?: string;
};

export type NecSection = NecCitation & {
  text: string;
};

export type NecMatch = NecSection & {
  score: number;
  snippet: string;
};

type NecIndex = {
  edition?: string;
  sections?: unknown;
};

const DEFAULT_EDITION = "2023";
const MAX_SNIPPET_LENGTH = 700;
const MAX_RESULTS = 8;

export function getNecEdition(requestedEdition?: string) {
  const normalized =
    requestedEdition?.trim() || process.env.NEC_EDITION?.trim() || DEFAULT_EDITION;

  return normalized === "2026" ? "2026" : DEFAULT_EDITION;
}

export function getNecIndexPath(edition: string) {
  const configuredPath = process.env.NEC_INDEX_PATH?.trim();

  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
  }

  return path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "data",
    "nec",
    "index",
    `nec-${edition}.json`,
  );
}

export async function loadNecSections(edition: string) {
  const remoteIndexUrl = process.env.NEC_INDEX_URL?.trim();
  const indexSource = remoteIndexUrl || getNecIndexPath(edition);
  let rawIndex: string;

  if (remoteIndexUrl) {
    rawIndex = await fetchRemoteIndex(remoteIndexUrl);
  } else {
    try {
      rawIndex = await fs.readFile(/*turbopackIgnore: true*/ indexSource, "utf8");
    } catch (error) {
      const message =
        error instanceof Error && "code" in error && error.code === "ENOENT"
          ? `NEC index not found at ${indexSource}. Set NEC_INDEX_URL for Vercel or build a local licensed index before using chat.`
          : `Unable to read NEC index at ${indexSource}.`;

      throw new Error(message);
    }
  }

  let parsed: NecIndex | unknown[];

  try {
    parsed = JSON.parse(rawIndex) as NecIndex | unknown[];
  } catch {
    throw new Error(`NEC index at ${indexSource} is not valid JSON.`);
  }

  const sections = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.sections)
      ? parsed.sections
      : [];

  const fallbackEdition =
    !Array.isArray(parsed) && typeof parsed.edition === "string"
      ? parsed.edition
      : edition;

  const normalizedSections = sections
    .map((section): NecSection | null => {
      if (!section || typeof section !== "object") {
        return null;
      }

      const candidate = section as Record<string, unknown>;
      const sectionId = String(candidate.section ?? "").trim();
      const text = String(candidate.text ?? "").trim();

      if (!sectionId || !text) {
        return null;
      }

      const title = String(candidate.title ?? "").trim();
      const sectionEdition = String(candidate.edition ?? fallbackEdition).trim();

      return {
        edition: sectionEdition || edition,
        section: sectionId,
        title: title || undefined,
        text,
      };
    })
    .filter((section): section is NecSection => section !== null);

  if (normalizedSections.length === 0) {
    throw new Error(
      `NEC index at ${indexSource} does not contain any usable sections.`,
    );
  }

  return normalizedSections;
}

export async function findNecSection(edition: string, section: string) {
  const sections = await loadNecSections(edition);
  const normalizedSection = section.trim().toLowerCase();
  const exactMatch = sections.find(
    (candidate) => candidate.section.toLowerCase() === normalizedSection,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const parentSection = section.trim().replace(/\([A-Za-z0-9]+\).*$/, "");

  if (parentSection && parentSection !== section.trim()) {
    return (
      sections.find(
        (candidate) =>
          candidate.section.toLowerCase() === parentSection.toLowerCase(),
      ) ?? null
    );
  }

  return null;
}

export function buildNecSectionUrl(citation: Pick<NecCitation, "edition" | "section">) {
  return `/nec/${encodeURIComponent(citation.edition)}/${encodeURIComponent(
    citation.section,
  )}`;
}

async function fetchRemoteIndex(indexUrl: string) {
  let url: URL;

  try {
    url = new URL(indexUrl);
  } catch {
    throw new Error("NEC_INDEX_URL must be a valid absolute URL.");
  }

  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("NEC_INDEX_URL must use HTTPS unless it points to localhost.");
  }

  const bearerToken = process.env.NEC_INDEX_BEARER_TOKEN?.trim();
  const response = await fetch(url, {
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(
      `Unable to fetch NEC index from ${url.origin}${url.pathname}: HTTP ${response.status}.`,
    );
  }

  return response.text();
}

export function retrieveNecSections(
  sections: NecSection[],
  question: string,
  maxResults = MAX_RESULTS,
) {
  const tokens = tokenize(question);
  const sectionRefs = extractSectionRefs(question);
  const normalizedQuestion = question.toLowerCase();
  const isGfciQuestion = /\bgfci\b|ground[- ]fault/.test(normalizedQuestion);
  const isAfciQuestion = /\bafci\b|arc[- ]fault/.test(normalizedQuestion);

  const matches = sections
    .map((section) => {
      const searchableText = `${section.section} ${section.title ?? ""} ${section.text}`;
      const normalizedText = searchableText.toLowerCase();
      let score = 0;

      sectionRefs.forEach((ref) => {
        if (section.section.toLowerCase() === ref.toLowerCase()) {
          score += 60;
          return;
        }

        if (section.section.toLowerCase().startsWith(ref.toLowerCase())) {
          score += 25;
        }
      });

      if (isGfciQuestion && section.section.startsWith("210.8")) {
        score += 120;
      }

      if (isAfciQuestion && section.section.startsWith("210.12")) {
        score += 120;
      }

      tokens.forEach((token) => {
        if (token.length < 3) {
          return;
        }

        const titleHit = section.title?.toLowerCase().includes(token) ?? false;
        const sectionHit = section.section.toLowerCase().includes(token);
        const textHits = countOccurrences(normalizedText, token);

        score += textHits;

        if (titleHit) {
          score += 7;
        }

        if (sectionHit) {
          score += 10;
        }
      });

      return {
        ...section,
        score,
        snippet: buildSnippet(section.text, tokens),
      } satisfies NecMatch;
    })
    .filter((section) => section.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults);

  return matches;
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

function extractSectionRefs(value: string) {
  return Array.from(
    new Set(
      value.match(/\b\d{3}(?:\.\d+)?(?:\([A-Za-z0-9]+\))*\b/g) ?? [],
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
    .map((token) => lowerText.indexOf(token))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  const center = firstHit ?? 0;
  const start = Math.max(0, center - Math.floor(MAX_SNIPPET_LENGTH / 3));
  const end = Math.min(normalizedText.length, start + MAX_SNIPPET_LENGTH);
  const snippet = normalizedText.slice(start, end).trim();

  return `${start > 0 ? "... " : ""}${snippet}${end < normalizedText.length ? " ..." : ""}`;
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
  "nec",
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
