"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Role = "user" | "assistant";

type Citation = {
  edition: string;
  section: string;
  title?: string;
  url?: string;
  page?: number;
};

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  citations?: Citation[];
};

type Conversation = {
  id: string;
  title: string;
  titleGenerated?: boolean;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

type StoredConversations = {
  activeConversationId?: unknown;
  conversations?: unknown;
};

const STORAGE_KEY = "nec-chat.messages.v1";
const CONVERSATIONS_STORAGE_KEY = "nec-chat.conversations.v1";
const DEFAULT_EDITION = "2023";
const EXAMPLE_QUESTIONS = [
  {
    label: "Kitchen GFCI",
    question: "Where are GFCI receptacles required in dwelling unit kitchens?",
  },
  {
    label: "Service disconnects",
    question: "What does the NEC require for service disconnect location?",
  },
  {
    label: "Damp locations",
    question: "Can NM cable be installed in a damp location?",
  },
];

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createConversation(messages: ChatMessage[] = []): Conversation {
  const timestamp = nowIso();

  return {
    id: createId(),
    title: buildConversationTitle(messages),
    titleGenerated: false,
    messages,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const title = firstUserMessage?.content.trim().replace(/\s+/g, " ") ?? "";

  if (!title) {
    return "New chat";
  }

  return title.length > 56 ? `${title.slice(0, 53)}...` : title;
}

function formatConversationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
              const page = Number(citationCandidate.page);

              if (!edition || !section) {
                return null;
              }

              return {
                edition,
                section,
                title: title || undefined,
                url: url || undefined,
                page: Number.isFinite(page) && page > 0 ? page : undefined,
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

function normalizeConversations(value: unknown): Conversation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((conversation): Conversation | null => {
      if (!conversation || typeof conversation !== "object") {
        return null;
      }

      const candidate = conversation as Record<string, unknown>;
      const messages = normalizeMessages(candidate.messages);
      const id = typeof candidate.id === "string" ? candidate.id : createId();
      const title =
        typeof candidate.title === "string" && candidate.title.trim()
          ? candidate.title.trim()
          : buildConversationTitle(messages);
      const createdAt =
        typeof candidate.createdAt === "string" ? candidate.createdAt : nowIso();
      const updatedAt =
        typeof candidate.updatedAt === "string" ? candidate.updatedAt : createdAt;

      return {
        id,
        title,
        titleGenerated: candidate.titleGenerated === true,
        messages,
        createdAt,
        updatedAt,
      };
    })
    .filter((conversation): conversation is Conversation => conversation !== null)
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [draft, setDraft] = useState("");
  const [edition, setEdition] = useState(DEFAULT_EDITION);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    conversations[0] ??
    null;
  const messages = activeConversation?.messages ?? [];
  const sortedConversations = [...conversations].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() -
      new Date(left.updatedAt).getTime(),
  );
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
    const storedConversations = window.localStorage.getItem(
      CONVERSATIONS_STORAGE_KEY,
    );

    if (storedConversations) {
      try {
        const parsed = JSON.parse(storedConversations) as StoredConversations;
        const normalizedConversations = normalizeConversations(
          parsed.conversations,
        );
        const savedActiveId =
          typeof parsed.activeConversationId === "string"
            ? parsed.activeConversationId
            : "";
        const activeId = normalizedConversations.some(
          (conversation) => conversation.id === savedActiveId,
        )
          ? savedActiveId
          : normalizedConversations[0]?.id;

        if (normalizedConversations.length > 0) {
          setConversations(normalizedConversations);
          setActiveConversationId(activeId ?? normalizedConversations[0].id);
        } else {
          const conversation = createConversation();
          setConversations([conversation]);
          setActiveConversationId(conversation.id);
        }
      } catch {
        const conversation = createConversation();
        setConversations([conversation]);
        setActiveConversationId(conversation.id);
      }

      setIsHydrated(true);
      return;
    }

    const storedMessages = window.localStorage.getItem(STORAGE_KEY);

    if (storedMessages) {
      try {
        const migratedMessages = normalizeMessages(JSON.parse(storedMessages));
        const conversation = createConversation(migratedMessages);
        setConversations([conversation]);
        setActiveConversationId(conversation.id);
      } catch {
        const conversation = createConversation();
        setConversations([conversation]);
        setActiveConversationId(conversation.id);
      }
    } else {
      const conversation = createConversation();
      setConversations([conversation]);
      setActiveConversationId(conversation.id);
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(
      CONVERSATIONS_STORAGE_KEY,
      JSON.stringify({ conversations, activeConversationId }),
    );
  }, [activeConversationId, conversations, isHydrated]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, isLoading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  async function sendMessage() {
    const question = draft.trim();

    if (!question || isLoading) {
      return;
    }

    const conversation = activeConversation ?? createConversation();
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: question,
    };
    const nextMessages = [...conversation.messages, userMessage];
    const nextTitle = conversation.titleGenerated
      ? conversation.title
      : buildConversationTitle(nextMessages);

    setActiveConversationId(conversation.id);
    upsertConversation({
      ...conversation,
      title: nextTitle,
      titleGenerated: conversation.titleGenerated ?? false,
      messages: nextMessages,
      updatedAt: nowIso(),
    });

    if (!conversation.titleGenerated) {
      void generateConversationTitle(conversation.id, nextMessages);
    }

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

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: answer,
        citations: Array.isArray(payload.citations) ? payload.citations : [],
      };

      const answeredMessages = [...nextMessages, assistantMessage];

      upsertConversation({
        ...conversation,
        title: nextTitle,
        titleGenerated: conversation.titleGenerated ?? false,
        messages: answeredMessages,
        updatedAt: nowIso(),
      });

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

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void sendMessage();
  }

  function handleExample(question: string) {
    setDraft(question);
  }

  function handleNewChat() {
    const conversation = createConversation();

    setConversations((currentConversations) => [
      conversation,
      ...currentConversations,
    ]);
    setActiveConversationId(conversation.id);
    setDraft("");
    setError("");
  }

  function handleSelectConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    setDraft("");
    setError("");
  }

  function handleDeleteConversation(conversationId: string) {
    setConversations((currentConversations) => {
      const remainingConversations = currentConversations.filter(
        (conversation) => conversation.id !== conversationId,
      );

      if (remainingConversations.length === 0) {
        const replacement = createConversation();
        setActiveConversationId(replacement.id);
        return [replacement];
      }

      if (conversationId === activeConversationId) {
        setActiveConversationId(remainingConversations[0].id);
      }

      return remainingConversations;
    });
  }

  function handleClear() {
    if (!activeConversation) {
      return;
    }

    upsertConversation({
      ...activeConversation,
      title: "New chat",
      titleGenerated: false,
      messages: [],
      updatedAt: nowIso(),
    });
    setError("");
    setDraft("");
  }

  function upsertConversation(nextConversation: Conversation) {
    setConversations((currentConversations) => {
      const exists = currentConversations.some(
        (conversation) => conversation.id === nextConversation.id,
      );
      const nextConversations = exists
        ? currentConversations.map((conversation) =>
            conversation.id === nextConversation.id
              ? mergeConversation(conversation, nextConversation)
              : conversation,
          )
        : [nextConversation, ...currentConversations];

      return nextConversations.sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      );
    });
  }

  function mergeConversation(
    currentConversation: Conversation,
    nextConversation: Conversation,
  ) {
    const shouldPreserveGeneratedTitle =
      currentConversation.titleGenerated === true &&
      nextConversation.titleGenerated !== true &&
      nextConversation.messages.length >= currentConversation.messages.length &&
      nextConversation.messages.length > 0;

    if (!shouldPreserveGeneratedTitle) {
      return nextConversation;
    }

    return {
      ...nextConversation,
      title: currentConversation.title,
      titleGenerated: true,
    };
  }

  async function generateConversationTitle(
    conversationId: string,
    titleMessages: ChatMessage[],
  ) {
    try {
      const response = await fetch("/api/title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: titleMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      const payload = (await response.json()) as {
        title?: unknown;
      };
      const title =
        typeof payload.title === "string" ? payload.title.trim() : "";

      if (!response.ok || !title) {
        return;
      }

      setConversations((currentConversations) =>
        currentConversations
          .map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  title,
                  titleGenerated: true,
                }
              : conversation,
          )
          .sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() -
              new Date(left.updatedAt).getTime(),
          ),
      );
    } catch {
      // The fallback title is already useful enough if naming fails.
    }
  }

  return (
    <main className="app-shell">
      <section className="chat-shell">
        <header className="app-header">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true">
              NEC
            </div>
            <div>
              <h1>NEC</h1>
              <span>{activeConversation?.title ?? "New chat"}</span>
            </div>
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
          <aside className="history-panel" aria-label="Saved chats">
            <div className="history-header">
              <span>Chats</span>
              <button
                className="new-chat-button"
                type="button"
                onClick={handleNewChat}
              >
                New
              </button>
            </div>

            <div className="history-list">
              {sortedConversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;

                return (
                  <div
                    className={`history-item${isActive ? " history-item-active" : ""}`}
                    key={conversation.id}
                  >
                    <button
                      className="history-open"
                      type="button"
                      onClick={() => handleSelectConversation(conversation.id)}
                    >
                      <span>{conversation.title}</span>
                      <small>{formatConversationTime(conversation.updatedAt)}</small>
                    </button>
                    <button
                      className="history-delete"
                      type="button"
                      aria-label={`Delete ${conversation.title}`}
                      onClick={() => handleDeleteConversation(conversation.id)}
                    >
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="chat-panel" aria-label="NEC">
            <div className="message-list">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-mark" aria-hidden="true">
                    70
                  </div>
                  <h2>Ask NEC</h2>
                  <div className="example-list" aria-label="Example questions">
                    {EXAMPLE_QUESTIONS.map((example) => (
                      <button
                        className="example-button"
                        key={example.label}
                        type="button"
                        onClick={() => handleExample(example.question)}
                      >
                        {example.label}
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
                      {message.role === "assistant" ? "NEC" : "You"}
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
                  <div className="message-meta">NEC</div>
                  <p>Checking the index...</p>
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
                onKeyDown={handleDraftKeyDown}
                placeholder="Ask about a NEC requirement..."
                rows={1}
              />
              <button className="primary-button" type="submit" disabled={!canSend}>
                {isLoading ? "..." : "Send"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
