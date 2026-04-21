import { NextResponse } from "next/server";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type LatexRequest = {
  boardTitle?: string;
  boardTexts?: string[];
  snapshot?: string | null;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: LatexRequest;

  try {
    body = (await request.json()) as LatexRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const boardTitle = typeof body.boardTitle === "string" ? body.boardTitle : "";
  const boardTexts = Array.isArray(body.boardTexts)
    ? body.boardTexts.filter((value): value is string => typeof value === "string")
    : [];
  const snapshot = typeof body.snapshot === "string" ? body.snapshot : null;

  if (!snapshot && boardTitle.trim().length === 0 && boardTexts.length === 0) {
    return NextResponse.json(
      { error: "Add some board content before transcribing to LaTeX." },
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
      model: "gpt-4.1-mini",
      max_output_tokens: 900,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You transcribe whiteboard content into clean, copyable LaTeX. Preserve mathematical meaning, symbols, superscripts, subscripts, fractions, matrices, Greek letters, and multi-line derivations. If the board contains ordinary prose, format it as clean LaTeX text or itemized lists. Use environments like align* only when helpful. Return only valid LaTeX content with no markdown fences, no commentary, and no surrounding explanation.",
            },
          ],
        },
        {
          role: "user",
          content: snapshot
            ? [
                {
                  type: "input_text",
                  text: [
                    `Board title: ${boardTitle.trim() || "(untitled)"}`,
                    boardTexts.length > 0
                      ? `Detected board text:\n- ${boardTexts.join("\n- ")}`
                      : "Detected board text: none",
                    "Transcribe every readable written element from the board into formatted LaTeX. Resolve handwriting where possible. If a fragment is uncertain, make the best-faith transcription and keep the output usable as LaTeX.",
                  ].join("\n"),
                },
                {
                  type: "input_image",
                  image_url: snapshot,
                },
              ]
            : [
                {
                  type: "input_text",
                  text: [
                    `Board title: ${boardTitle.trim() || "(untitled)"}`,
                    boardTexts.length > 0
                      ? `Detected board text:\n- ${boardTexts.join("\n- ")}`
                      : "Detected board text: none",
                    "Convert the written content into formatted LaTeX.",
                  ].join("\n"),
                },
              ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "latex_transcription",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              latex: {
                type: "string",
                description:
                  "The final clean LaTeX transcription of the readable whiteboard content.",
              },
            },
            required: ["latex"],
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

  let parsed: { latex?: string };

  try {
    parsed = JSON.parse(content) as { latex?: string };
  } catch {
    return NextResponse.json(
      { error: "The AI returned an unexpected format." },
      { status: 502 },
    );
  }

  const latex = typeof parsed.latex === "string" ? parsed.latex.trim() : "";

  if (!latex) {
    return NextResponse.json(
      { error: "The LaTeX transcription was empty." },
      { status: 502 },
    );
  }

  return NextResponse.json({ latex });
}
