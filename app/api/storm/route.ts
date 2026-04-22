import { NextResponse } from "next/server";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type StormRequest = {
  boardTitle?: string;
  boardTexts?: string[];
  latexOutput?: string;
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

  let body: StormRequest;

  try {
    body = (await request.json()) as StormRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const boardTitle = typeof body.boardTitle === "string" ? body.boardTitle : "";
  const boardTexts = Array.isArray(body.boardTexts)
    ? body.boardTexts.filter((value): value is string => typeof value === "string")
    : [];
  const latexOutput =
    typeof body.latexOutput === "string" ? body.latexOutput.trim() : "";
  const snapshot = typeof body.snapshot === "string" ? body.snapshot : null;

  if (
    !snapshot &&
    latexOutput.length === 0 &&
    boardTitle.trim().length === 0 &&
    boardTexts.length === 0
  ) {
    return NextResponse.json(
      { error: "Add some board content before using Storm." },
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
      model: "gpt-4.1-nano",
      max_output_tokens: 220,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are Storm, an AI layer inside a whiteboard app. When given a LaTeX transcription, interpret the math or notation and provide the most useful direct answer, result, or takeaway in one short sticky note. Prefer solving the problem or stating the conclusion over describing the page. If the content is not a solvable problem, explain the key meaning of the expression or notation concisely. Only fall back to describing visible marks when the content is too unclear to interpret.",
            },
          ],
        },
        {
          role: "user",
          content: snapshot
            ? latexOutput
              ? [
                  {
                    type: "input_text",
                    text: [
                      `Board title: ${boardTitle.trim() || "(untitled)"}`,
                      boardTexts.length > 0
                        ? `Existing manual board text:\n- ${boardTexts.join("\n- ")}`
                        : "Existing manual board text: none",
                      `LaTeX transcription:\n${latexOutput}`,
                      "Interpret the LaTeX transcription and return one short sticky note with the direct answer, result, or most useful takeaway. Do not summarize the whole page or talk about handwriting unless the content is too unclear to interpret.",
                    ].join("\n"),
                  },
                ]
              : [
                {
                  type: "input_text",
                  text: [
                    `Board title: ${boardTitle.trim() || "(untitled)"}`,
                    boardTexts.length > 0
                      ? `Existing manual board text:\n- ${boardTexts.join("\n- ")}`
                      : "Existing manual board text: none",
                    "Analyze the attached whiteboard snapshot. Use the visible writing to identify the topic, then return one sticky note with an interesting or useful fact about that topic itself. Do not say things like 'the visible word' or describe what is written unless the handwriting is too unclear to infer any topic.",
                  ].join("\n"),
                },
                {
                  type: "input_image",
                  image_url: snapshot,
                },
              ]
            : latexOutput
              ? [
                  {
                    type: "input_text",
                    text: [
                      `Board title: ${boardTitle.trim() || "(untitled)"}`,
                      boardTexts.length > 0
                        ? `Existing manual board text:\n- ${boardTexts.join("\n- ")}`
                        : "Existing manual board text: none",
                      `LaTeX transcription:\n${latexOutput}`,
                      "Interpret the LaTeX transcription and return one short sticky note with the direct answer, result, or most useful takeaway. Do not summarize the whole page.",
                    ].join("\n"),
                  },
                ]
              : [
                {
                  type: "input_text",
                  text: [
                    `Board title: ${boardTitle.trim() || "(untitled)"}`,
                    boardTexts.length > 0
                      ? `Existing manual board text:\n- ${boardTexts.join("\n- ")}`
                      : "Existing manual board text: none",
                    "Use the board text to identify the topic, then return one sticky note with an interesting or useful fact about that topic itself. Do not describe the wording unless the board is too unclear to infer a topic.",
                  ].join("\n"),
                },
              ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "storm_answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: {
                type: "string",
                description:
                  "A concise sticky note with the direct answer, result, or most useful interpretation of the board content.",
              },
            },
            required: ["answer"],
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

  let parsed: { answer?: string };

  try {
    parsed = JSON.parse(content) as { answer?: string };
  } catch {
    return NextResponse.json(
      { error: "The AI returned an unexpected format." },
      { status: 502 },
    );
  }

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";

  if (!answer) {
    return NextResponse.json(
      { error: "Storm did not return an answer." },
      { status: 502 },
    );
  }

  return NextResponse.json({ answer });
}
