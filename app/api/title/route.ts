import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";

type TitleMessage = {
  role?: unknown;
  content?: unknown;
};

type TitleRequest = {
  messages?: unknown;
};

type TitleResponse = {
  title?: unknown;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: TitleRequest;

  try {
    body = (await request.json()) as TitleRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = normalizeMessages(body.messages);

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "Send at least one message to name a chat." },
      { status: 400 },
    );
  }

  const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TITLE_MODEL?.trim() || DEFAULT_MODEL,
      max_output_tokens: 80,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "Name a saved NEC chat.",
                "Return a concise, specific title with 2 to 6 words.",
                "Do not use quotes, punctuation at the end, or generic titles like New Chat.",
                "Prefer code-topic wording such as GFCI Kitchen Receptacles or Service Disconnect Location.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: messages
                .slice(0, 4)
                .map((message) => `${message.role}: ${message.content}`)
                .join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "chat_title",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: {
                type: "string",
                description: "A concise saved-chat title.",
              },
            },
            required: ["title"],
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
      { error: payload.error?.message ?? "The title request failed." },
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

  let parsed: TitleResponse;

  try {
    parsed = JSON.parse(content) as TitleResponse;
  } catch {
    return NextResponse.json(
      { error: "The AI returned an unexpected title format." },
      { status: 502 },
    );
  }

  const title = cleanTitle(parsed.title);

  if (!title) {
    return NextResponse.json(
      { error: "The generated title was empty." },
      { status: 502 },
    );
  }

  return NextResponse.json({ title });
}

function normalizeMessages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((message: TitleMessage) => {
      const role = message?.role === "assistant" ? "assistant" : "user";
      const content =
        typeof message?.content === "string" ? message.content.trim() : "";

      return { role, content };
    })
    .filter((message) => message.content.length > 0)
    .slice(-6);
}

function cleanTitle(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 64);
}
