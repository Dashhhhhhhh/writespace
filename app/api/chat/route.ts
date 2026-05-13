import { NextResponse } from "next/server";
import {
  getCodeDocument,
  getCodeDocumentLabel,
} from "../../../lib/code-catalog";
import {
  loadCodeChunks,
  retrieveCodeChunks,
  toCodeCitation,
  type CodeCitation,
} from "../../../lib/code-index";

export const runtime = "nodejs";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

type ChatRequest = {
  messages?: unknown;
  documentId?: unknown;
};

type ChatAnswer = {
  answer?: unknown;
  citations?: unknown;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = normalizeMessages(body.messages);
  const latestQuestion = [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.content.trim();

  if (!latestQuestion) {
    return NextResponse.json(
      { error: "Ask a code question before sending chat." },
      { status: 400 },
    );
  }

  const requestedDocumentId =
    typeof body.documentId === "string" ? body.documentId.trim() : "";
  const selectedDocument = requestedDocumentId
    ? getCodeDocument(requestedDocumentId)
    : null;

  if (!selectedDocument) {
    return NextResponse.json(
      { error: "Select a source file before asking." },
      { status: 400 },
    );
  }

  let matches;

  try {
    const chunks = await loadCodeChunks(selectedDocument);
    matches = retrieveCodeChunks(chunks, latestQuestion);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the WHS code retrieval indexes.",
      },
      { status: 503 },
    );
  }

  const responseDocument = {
    id: selectedDocument.id,
    label: getCodeDocumentLabel(selectedDocument),
    codeLabel: selectedDocument.codeLabel,
    edition: selectedDocument.edition,
  };

  if (matches.length === 0) {
    return NextResponse.json({
      answer: `I searched ${responseDocument.label}, but I do not have enough relevant context in that file to answer. Ask with a specific section, system, occupancy, location, and installation condition.`,
      citations: [],
      document: responseDocument,
    });
  }

  const allowedCitations = matches.map(toCodeCitation);

  const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
      max_output_tokens: 500,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You answer questions about WHS code documents.",
                "Use only the retrieved context from the selected source file provided by the server.",
                "This chat is locked to one source file; do not blend requirements from other codes or editions.",
                "Every substantive answer must cite exact locators from the provided context, using the code label, edition, and locator.",
                "If the retrieved context supports an answer, include at least one citation object for the exact locator that supports it.",
                "Do not cite source files or locators that are not in the provided context.",
                "If the provided context does not support an answer, say that clearly and ask for the missing details.",
                "Keep the answer concise: usually 2 to 4 short sentences, or up to 4 bullets only when it improves clarity.",
                "Do not restate the user's question, add introductions, or include broad background.",
                "Mention dependencies like local amendments, AHJ interpretation, listing instructions, equipment labeling, occupancy, voltage, wiring method, or installation conditions only when directly relevant.",
                "Summarize requirements in your own words. Do not quote long excerpts.",
                "This is technical code assistance, not legal advice.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Selected source file: ${responseDocument.label}`,
                "Conversation:",
                messages
                  .slice(-8)
                  .map((message) => `${message.role}: ${message.content}`)
                  .join("\n"),
                "",
                "Retrieved context:",
                matches
                  .map((match, index) =>
                    [
                      `[${index + 1}] ${match.documentLabel} ${match.locator}${
                        match.title ? ` - ${match.title}` : ""
                      }${match.page ? ` (PDF page ${match.page})` : ""}`,
                      match.snippet,
                    ].join("\n"),
                  )
                  .join("\n\n"),
                "",
                "Return a concise direct answer and the citations you used. If you answer the question, citations must not be empty.",
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "whs_code_chat_answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: {
                type: "string",
                description:
                  "The code answer, summarized in original wording, including source locators in prose.",
              },
              citations: {
                type: "array",
                description:
                  "Only the retrieved source locators actually used to answer.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    documentId: { type: "string" },
                    locator: { type: "string" },
                    title: { type: "string" },
                  },
                  required: ["documentId", "locator", "title"],
                },
              },
            },
            required: ["answer", "citations"],
          },
        },
      },
    }),
  });

  const payload = (await openAiResponse.json()) as {
    error?: { message?: string };
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  if (!openAiResponse.ok) {
    return NextResponse.json(
      { error: payload.error?.message ?? "The AI request failed. Try again." },
      { status: openAiResponse.status },
    );
  }

  const content = (
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text" && typeof item.text === "string")
      ?.text ??
    ""
  ).trim();

  if (!content) {
    return NextResponse.json(
      { error: "The AI response was empty." },
      { status: 502 },
    );
  }

  let parsed: ChatAnswer;

  try {
    parsed = JSON.parse(content) as ChatAnswer;
  } catch {
    return NextResponse.json(
      { error: "The AI returned an unexpected format." },
      { status: 502 },
    );
  }

  const answer =
    typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const citations = normalizeCitations(
    parsed.citations,
    allowedCitations,
    answer,
  );

  if (!answer) {
    return NextResponse.json(
      { error: "The AI response was empty." },
      { status: 502 },
    );
  }

  return NextResponse.json({ answer, citations, document: responseDocument });
}

function normalizeMessages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((message: ChatMessage) => {
      const role = message?.role === "assistant" ? "assistant" : "user";
      const content =
        typeof message?.content === "string" ? message.content.trim() : "";

      return { role, content };
    })
    .filter((message) => message.content.length > 0)
    .slice(-12);
}

function normalizeCitations(
  value: unknown,
  allowedCitations: CodeCitation[],
  answer: string,
) {
  const allowed = new Map(
    allowedCitations.map((citation) => [
      `${citation.documentId}:${citation.locator}`.toLowerCase(),
      citation,
    ]),
  );
  const seen = new Set<string>();
  const citations: CodeCitation[] = [];

  if (Array.isArray(value)) {
    value.forEach((citation) => {
      if (!citation || typeof citation !== "object") {
        return;
      }

      const candidate = citation as Record<string, unknown>;
      const documentId = String(candidate.documentId ?? "").trim();
      const locator = String(candidate.locator ?? "").trim();
      addCitation(documentId, locator);
    });
  }

  const normalizedAnswer = answer.toLowerCase();

  allowedCitations.forEach((citation) => {
    if (
      normalizedAnswer.includes(citation.locator.toLowerCase()) ||
      (citation.section &&
        normalizedAnswer.includes(citation.section.toLowerCase()))
    ) {
      addCitation(citation.documentId, citation.locator);
    }
  });

  if (citations.length === 0 && !isUnsupportedAnswer(answer)) {
    addCitation(
      allowedCitations[0]?.documentId ?? "",
      allowedCitations[0]?.locator ?? "",
    );
  }

  return citations;

  function addCitation(documentId: string, locator: string) {
    const key = `${documentId}:${locator}`.toLowerCase();
    const allowedCitation = allowed.get(key);

    if (!allowedCitation || seen.has(key)) {
      return;
    }

    seen.add(key);
    citations.push(allowedCitation);
  }
}

function isUnsupportedAnswer(answer: string) {
  const normalizedAnswer = answer.toLowerCase();

  return (
    normalizedAnswer.includes("do not have enough") ||
    normalizedAnswer.includes("does not provide enough") ||
    normalizedAnswer.includes("not enough relevant context") ||
    normalizedAnswer.includes("provided context does not support") ||
    normalizedAnswer.includes("ask for the missing details")
  );
}
