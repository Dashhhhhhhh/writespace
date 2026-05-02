"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";

type Citation = {
  edition: string;
  section: string;
  title?: string;
  url?: string;
};

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  citations?: Citation[];
};

const STORAGE_KEY = "nec-chat.messages.v1";
const DEFAULT_EDITION = "2023";
const EXAMPLE_QUESTIONS = [
  "Where are GFCI receptacles required in dwelling unit kitchens?",
  "What does the NEC require for service disconnect location?",
  "Can NM cable be installed in a damp location?",
];

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((message): ChatMessage | null => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const candidate = message as Record<string, unknown>;
      const role = candidate.role === "assistant" ? "assistant" : "user";
      const content =
        typeof candidate.content === "string" ? candidate.content.trim() : "";

      if (!content) {
        return null;
      }

      const citations = Array.isArray(candidate.citations)
        ? candidate.citations
            .map((citation): Citation | null => {
              if (!citation || typeof citation !== "object") {
                return null;
              }

              const citationCandidate = citation as Record<string, unknown>;
              const edition = String(citationCandidate.edition ?? "").trim();
              const section = String(citationCandidate.section ?? "").trim();
              const title = String(citationCandidate.title ?? "").trim();
              const url = String(citationCandidate.url ?? "").trim();

              if (!edition || !section) {
                return null;
              }

              return {
                edition,
                section,
                title: title || undefined,
                url: url || undefined,
              };
            })
            .filter((citation): citation is Citation => citation !== null)
        : undefined;

      return {
        id: typeof candidate.id === "string" ? candidate.id : createId(),
        role,
        content,
        citations,
      };
    })
    .filter((message): message is ChatMessage => message !== null);
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [edition, setEdition] = useState(DEFAULT_EDITION);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = draft.trim().length > 0 && !isLoading;
  const apiMessages = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        setMessages(normalizeMessages(parsed));
      } catch {
        setMessages([]);
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [isHydrated, messages]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, isLoading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = draft.trim();

    if (!question || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: question,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setDraft("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          edition,
          messages: [...apiMessages, { role: "user", content: question }],
        }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        citations?: Citation[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "The NEC chat request failed.");
      }

      const answer = payload.answer?.trim();

      if (!answer) {
        throw new Error("The NEC chat response was empty.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createId(),
          role: "assistant",
          content: answer,
          citations: Array.isArray(payload.citations) ? payload.citations : [],
        },
      ]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The NEC chat request failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleExample(question: string) {
    setDraft(question);
  }

  function handleClear() {
    setMessages([]);
    setError("");
    setDraft("");
  }

  return (
    <main className="app-shell">
      <section className="chat-shell">
        <header className="app-header">
          <div>
            <p className="eyebrow">NFPA 70 reference assistant</p>
            <h1>NEC Chat</h1>
          </div>

          <div className="header-actions" aria-label="Chat settings">
            <label className="edition-control">
              <span>Edition</span>
              <select
                value={edition}
                onChange={(event) => setEdition(event.target.value)}
              >
                <option value="2023">2023</option>
                <option value="2026">2026</option>
              </select>
            </label>
            <button className="secondary-button" type="button" onClick={handleClear}>
              Clear
            </button>
          </div>
        </header>

        <div className="content-grid">
          <aside className="reference-panel" aria-label="Reference guardrails">
            <h2>Answer Rules</h2>
            <p>
              Answers are constrained to the licensed NEC index configured on the
              server. If the matching sections are missing or inconclusive, the
              assistant should say so instead of guessing.
            </p>

            <div className="status-list">
              <div>
                <span className="status-dot" />
                <p>Cites exact NEC sections</p>
              </div>
              <div>
                <span className="status-dot" />
                <p>Summarizes instead of quoting long code text</p>
              </div>
              <div>
                <span className="status-dot" />
                <p>Flags AHJ, listing, and local amendment dependencies</p>
              </div>
            </div>
          </aside>

          <section className="chat-panel" aria-label="NEC chat">
            <div className="message-list">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <h2>Ask a question about the National Electrical Code.</h2>
                  <p>
                    Include the occupancy, location, equipment, wiring method,
                    voltage, and any section you already have.
                  </p>
                  <div className="example-list" aria-label="Example questions">
                    {EXAMPLE_QUESTIONS.map((question) => (
                      <button
                        className="example-button"
                        key={question}
                        type="button"
                        onClick={() => handleExample(question)}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    className={`message message-${message.role}`}
                    key={message.id}
                  >
                    <div className="message-meta">
                      {message.role === "assistant" ? "NEC Chat" : "You"}
                    </div>
                    <p>{message.content}</p>
                    {message.citations && message.citations.length > 0 ? (
                      <div className="citation-list" aria-label="Citations">
                        {message.citations.map((citation) => (
                          <a
                            className="citation-chip"
                            key={`${citation.edition}-${citation.section}`}
                            href={
                              citation.url ??
                              `/nec/${encodeURIComponent(citation.edition)}/${encodeURIComponent(citation.section)}`
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            NEC {citation.edition} {citation.section}
                            {citation.title ? ` · ${citation.title}` : ""}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              )}

              {isLoading ? (
                <article className="message message-assistant message-loading">
                  <div className="message-meta">NEC Chat</div>
                  <p>Checking the licensed NEC index...</p>
                </article>
              ) : null}

              <div ref={scrollRef} />
            </div>

            {error ? (
              <p className="error-message" role="alert">
                {error}
              </p>
            ) : null}

            <form className="composer" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="question">
                NEC question
              </label>
              <textarea
                id="question"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about a NEC requirement..."
                rows={3}
              />
              <button className="primary-button" type="submit" disabled={!canSend}>
                {isLoading ? "Searching..." : "Ask"}
              </button>
            </form>
          </section>
        </div>

        <footer className="app-footer">
          NEC Chat is technical assistance, not legal advice. Verify final
          interpretations with the authority having jurisdiction and the adopted
          local edition.
        </footer>
      </section>
    </main>
  );
}
