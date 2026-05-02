import { NextResponse } from "next/server";
import {
  getNecEdition,
  buildNecSectionUrl,
  loadNecSections,
  retrieveNecSections,
  type NecCitation,
} from "../../../lib/nec";

export const runtime = "nodejs";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1";

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

type ChatRequest = {
  messages?: unknown;
  edition?: unknown;
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
      { error: "Ask a NEC question before sending chat." },
      { status: 400 },
    );
  }

  const edition = getNecEdition(
    typeof body.edition === "string" ? body.edition : undefined,
  );

  let matches;

  try {
    const sections = await loadNecSections(edition);
    matches = retrieveNecSections(sections, latestQuestion);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the NEC retrieval index.",
      },
      { status: 503 },
    );
  }

  if (matches.length === 0) {
    return NextResponse.json({
      answer:
        "I do not have enough relevant NEC context in the licensed index to answer that. Ask with a specific section, article, equipment type, location, voltage, occupancy, and installation condition.",
      citations: [],
    });
  }

  const allowedCitations = matches.map(({ edition, section, title, page }) => ({
    edition,
    section,
    title,
    page,
    url: buildNecSectionUrl({ edition, section }),
  }));

  const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
      max_output_tokens: 900,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You answer questions about NFPA 70, the National Electrical Code.",
                "Use only the retrieved NEC context provided by the server.",
                "Every substantive answer must cite exact NEC sections from the provided context, using the edition and section number.",
                "Do not cite sections that are not in the provided context.",
                "If the provided context does not support an answer, say that clearly and ask for the missing details.",
                "Mention when the answer may depend on local amendments, AHJ interpretation, listing instructions, equipment labeling, occupancy, voltage, wiring method, or installation conditions.",
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
                `Requested NEC edition: ${edition}`,
                "Conversation:",
                messages
                  .slice(-8)
                  .map((message) => `${message.role}: ${message.content}`)
                  .join("\n"),
                "",
                "Retrieved NEC context:",
                matches
                  .map((match, index) =>
                    [
                      `[${index + 1}] NEC ${match.edition} ${match.section}${match.title ? ` - ${match.title}` : ""}`,
                      match.snippet,
                    ].join("\n"),
                  )
                  .join("\n\n"),
                "",
                "Return a direct answer and the citations you used.",
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "nec_chat_answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: {
                type: "string",
                description:
                  "The NEC answer, summarized in original wording, including section references in prose.",
              },
              citations: {
                type: "array",
                description:
                  "Only the retrieved NEC sections actually used to answer.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    edition: { type: "string" },
                    section: { type: "string" },
                    title: { type: "string" },
                  },
                  required: ["edition", "section", "title"],
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

  return NextResponse.json({ answer, citations });
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
  allowedCitations: NecCitation[],
  answer: string,
) {
  const allowed = new Map(
    allowedCitations.map((citation) => [
      `${citation.edition}:${citation.section}`.toLowerCase(),
      citation,
    ]),
  );
  const seen = new Set<string>();
  const citations: NecCitation[] = [];

  if (Array.isArray(value)) {
    value.forEach((citation) => {
      if (!citation || typeof citation !== "object") {
        return;
      }

      const candidate = citation as Record<string, unknown>;
      const edition = String(candidate.edition ?? "").trim();
      const section = String(candidate.section ?? "").trim();
      addCitation(edition, section);
    });
  }

  allowedCitations.forEach((citation) => {
    const sectionPattern = new RegExp(
      `\\b${escapeRegExp(citation.section)}(?:\\([A-Za-z0-9]+\\))*\\b`,
      "i",
    );

    if (sectionPattern.test(answer)) {
      addCitation(citation.edition, citation.section);
    }
  });

  return citations;

  function addCitation(edition: string, section: string) {
    const key = `${edition}:${section}`.toLowerCase();
    const allowedCitation = allowed.get(key);

    if (!allowedCitation || seen.has(key)) {
      return;
    }

    seen.add(key);
    citations.push(allowedCitation);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
