"use client";

import Link from "next/link";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildCodeSourceUrl,
  CODE_SETTINGS_STORAGE_KEY,
  DEFAULT_CODE_SELECTIONS,
  getCodeDocument,
  getCodeDocumentLabel,
  getSelectedCodeDocuments,
  normalizeCodeSelections,
  type CodeDocument,
} from "../lib/code-catalog";

type Role = "user" | "assistant";

type Citation = {
  documentId?: string;
  documentLabel?: string;
  codeLabel?: string;
  edition?: string;
  locator?: string;
  section?: string;
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
  documentId?: string;
  documentLabel?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

type StoredConversations = {
  activeConversationId?: unknown;
  conversations?: unknown;
};

const LEGACY_STORAGE_KEY = "nec-chat.messages.v1";
const LEGACY_CONVERSATIONS_STORAGE_KEY = "nec-chat.conversations.v1";
const CONVERSATIONS_STORAGE_KEY = "whs-code.conversations.v1";
const SELECTED_DOCUMENT_STORAGE_KEY = "whs-code.selected-document.v1";
const EXAMPLE_QUESTIONS_BY_FAMILY: Record<string, string[]> = {
  nec: [
    "Where are GFCI receptacles required in dwelling unit kitchens?",
    "When is a service disconnect required to be readily accessible?",
    "What are the working space requirements around electrical equipment?",
    "Where is AFCI protection required for dwelling unit branch circuits?",
  ],
  "nfpa-72": [
    "When are manual fire alarm boxes required?",
    "What are notification appliance requirements for public mode signaling?",
    "Where are smoke detectors required for fire alarm system initiation?",
    "What supervision is required for fire alarm initiating device circuits?",
  ],
  "nfpa-99": [
    "How are essential electrical system branches separated in health care facilities?",
    "When are medical gas zone valves required?",
    "What are the requirements for patient care vicinity receptacles?",
    "How are wet procedure locations classified for electrical safety?",
  ],
  "nfpa-13": [
    "How is sprinkler hazard classification determined?",
    "What are the spacing requirements for standard spray sprinklers?",
    "When are waterflow alarm devices required for sprinkler systems?",
    "What obstructions can affect sprinkler discharge patterns?",
  ],
  iecc: [
    "What are the commercial lighting control requirements?",
    "How are building envelope insulation requirements determined?",
    "When are economizers required for HVAC systems?",
    "What air leakage requirements apply to residential buildings?",
  ],
  ifgc: [
    "How is combustion air sized for fuel-fired appliances?",
    "What are the venting requirements for gas appliances?",
    "Where are gas appliance shutoff valves required?",
    "How is gas piping sized for connected appliance loads?",
  ],
  imc: [
    "What are commercial kitchen grease duct requirements?",
    "When is outdoor air ventilation required?",
    "How should dryer exhaust ducts be installed?",
    "What are the clearance requirements for mechanical equipment?",
  ],
  ipc: [
    "How should plumbing vents terminate above the roof?",
    "Where are cleanouts required in drainage piping?",
    "What are the trap seal requirements for plumbing fixtures?",
    "When is backflow protection required for potable water systems?",
  ],
  "ashrae-90-1": [
    "How are lighting power allowances determined?",
    "When are air economizers required?",
    "What building envelope requirements apply to exterior walls?",
    "How are HVAC equipment efficiency requirements determined?",
  ],
  "asme-elevator": [
    "What are the machine room requirements for elevators?",
    "When is emergency operation required for elevators?",
    "What are the requirements for hoistway door protection?",
    "How are elevator car enclosure requirements determined?",
  ],
};
const DEFAULT_EXAMPLE_QUESTIONS = [
  "What are the main requirements for this installation?",
  "Which section covers this condition?",
  "What exceptions apply to this requirement?",
  "What details should I verify with the AHJ?",
];
const DEFAULT_CHAT_DOCUMENT_ID =
  DEFAULT_CODE_SELECTIONS.nec ?? Object.values(DEFAULT_CODE_SELECTIONS)[0] ?? "";
const CHAT_INPUT_MAX_HEIGHT = 94;

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

function formatCitationLabel(citation: Citation) {
  const source =
    citation.documentLabel ??
    (citation.codeLabel && citation.edition
      ? `${citation.codeLabel} ${citation.edition}`
      : citation.edition
        ? `NEC ${citation.edition}`
        : "Source");
  const locator = citation.locator ?? citation.section ?? "";

  return locator ? `${source} ${locator}` : source;
}

function getDocumentLabel(document: Pick<CodeDocument, "familyLabel">) {
  return document.familyLabel;
}

function getExampleQuestions(document: CodeDocument | null) {
  if (!document) {
    return DEFAULT_EXAMPLE_QUESTIONS;
  }

  const examples =
    EXAMPLE_QUESTIONS_BY_FAMILY[document.familyId] ?? DEFAULT_EXAMPLE_QUESTIONS;

  return examples;
}

function resizeDraftInput(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  const nextHeight = Math.min(element.scrollHeight, CHAT_INPUT_MAX_HEIGHT);
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > CHAT_INPUT_MAX_HEIGHT ? "auto" : "hidden";
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
              const documentId = String(citationCandidate.documentId ?? "").trim();
              const documentLabel = String(
                citationCandidate.documentLabel ?? "",
              ).trim();
              const codeLabel = String(citationCandidate.codeLabel ?? "").trim();
              const edition = String(citationCandidate.edition ?? "").trim();
              const locator = String(citationCandidate.locator ?? "").trim();
              const section = String(citationCandidate.section ?? "").trim();
              const title = String(citationCandidate.title ?? "").trim();
              const url = String(citationCandidate.url ?? "").trim();
              const page = Number(citationCandidate.page);

              if ((!documentId || !locator) && (!edition || !section)) {
                return null;
              }

              return {
                documentId: documentId || undefined,
                documentLabel: documentLabel || undefined,
                codeLabel: codeLabel || undefined,
                edition: edition || undefined,
                locator: locator || undefined,
                section: section || undefined,
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
      const documentId =
        typeof candidate.documentId === "string" ? candidate.documentId : "";
      const documentLabel =
        typeof candidate.documentLabel === "string"
          ? candidate.documentLabel
          : "";

      return {
        id,
        title,
        titleGenerated: candidate.titleGenerated === true,
        documentId: getCodeDocument(documentId)?.id,
        documentLabel: documentLabel || undefined,
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
  const [codeSelections, setCodeSelections] = useState(DEFAULT_CODE_SELECTIONS);
  const [selectedDocumentId, setSelectedDocumentId] = useState(
    DEFAULT_CHAT_DOCUMENT_ID,
  );
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);

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
  const selectedDocuments = useMemo(
    () => getSelectedCodeDocuments(codeSelections),
    [codeSelections],
  );
  const activeDocument = activeConversation?.documentId
    ? getCodeDocument(activeConversation.documentId)
    : null;
  const sourceOptions =
    activeDocument &&
    !selectedDocuments.some((document) => document.id === activeDocument.id)
      ? [activeDocument, ...selectedDocuments]
      : selectedDocuments;
  const selectedDocument =
    activeDocument ??
    getCodeDocument(selectedDocumentId) ??
    sourceOptions[0] ??
    null;
  const selectedSourceId = selectedDocument?.id ?? "";
  const activeDocumentLabel =
    activeConversation?.documentLabel ??
    (selectedDocument ? getCodeDocumentLabel(selectedDocument) : "No source");
  const exampleQuestions = getExampleQuestions(selectedDocument);
  const isSourceLocked = Boolean(
    activeConversation?.documentId && activeConversation.messages.length > 0,
  );
  const isNewChatDisabled = Boolean(
    activeConversation && activeConversation.messages.length === 0,
  );
  const canSend = draft.trim().length > 0 && !isLoading && Boolean(selectedDocument);
  const apiMessages = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages],
  );

  useEffect(() => {
    const storedSettings = window.localStorage.getItem(CODE_SETTINGS_STORAGE_KEY);
    let nextSelections = DEFAULT_CODE_SELECTIONS;

    if (storedSettings) {
      try {
        nextSelections = normalizeCodeSelections(JSON.parse(storedSettings));
      } catch {
        nextSelections = DEFAULT_CODE_SELECTIONS;
      }
    }

    setCodeSelections(nextSelections);

    const storedDocumentId = window.localStorage.getItem(
      SELECTED_DOCUMENT_STORAGE_KEY,
    );
    const storedDocument = storedDocumentId
      ? getCodeDocument(storedDocumentId)
      : null;
    const defaultDocument = getSelectedCodeDocuments(nextSelections)[0] ?? null;

    setSelectedDocumentId(storedDocument?.id ?? defaultDocument?.id ?? "");

    const storedConversations =
      window.localStorage.getItem(CONVERSATIONS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_CONVERSATIONS_STORAGE_KEY);

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

    const storedMessages = window.localStorage.getItem(LEGACY_STORAGE_KEY);

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
    if (!isHydrated || selectedDocuments.length === 0) {
      return;
    }

    if (!selectedDocuments.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId(selectedDocuments[0].id);
    }
  }, [isHydrated, selectedDocumentId, selectedDocuments]);

  useEffect(() => {
    if (!isHydrated || !selectedDocumentId) {
      return;
    }

    window.localStorage.setItem(SELECTED_DOCUMENT_STORAGE_KEY, selectedDocumentId);
  }, [isHydrated, selectedDocumentId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, isLoading]);

  useLayoutEffect(() => {
    if (draftInputRef.current) {
      resizeDraftInput(draftInputRef.current);
    }
  }, [draft]);

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
    const sourceDocument = conversation.documentId
      ? getCodeDocument(conversation.documentId)
      : selectedDocument;

    if (!sourceDocument) {
      setError("Select a source file before asking.");
      return;
    }

    const sourceLabel = getCodeDocumentLabel(sourceDocument);
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
      documentId: sourceDocument.id,
      documentLabel: sourceLabel,
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
          documentId: sourceDocument.id,
          messages: [...apiMessages, { role: "user", content: question }],
        }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        citations?: Citation[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "The code lookup request failed.");
      }

      const answer = payload.answer?.trim();

      if (!answer) {
        throw new Error("The code lookup response was empty.");
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
        documentId: sourceDocument.id,
        documentLabel: sourceLabel,
        messages: answeredMessages,
        updatedAt: nowIso(),
      });

    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The code lookup request failed.",
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

  function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
    resizeDraftInput(event.target);
  }

  function handleExample(question: string) {
    setDraft(question);
  }

  function handleSourceChange(documentId: string) {
    const document = getCodeDocument(documentId);

    if (!document) {
      return;
    }

    setSelectedDocumentId(document.id);
    setError("");

    if (!activeConversation || activeConversation.messages.length > 0) {
      return;
    }

    setConversations((currentConversations) =>
      currentConversations.map((conversation) =>
        conversation.id === activeConversation.id
          ? {
              ...conversation,
              documentId: document.id,
              documentLabel: getCodeDocumentLabel(document),
            }
          : conversation,
      ),
    );
  }

  function handleNewChat() {
    if (activeConversation && activeConversation.messages.length === 0) {
      return;
    }

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
            <div>
              <h1>WHS Code Lookup</h1>
              <span>{activeConversation?.title ?? "New chat"}</span>
            </div>
          </div>

          <div className="header-actions" aria-label="Chat settings">
            <Link className="secondary-link" href="/settings">
              Settings
            </Link>
            <button
              className="secondary-button"
              type="button"
              onClick={handleNewChat}
              disabled={isNewChatDisabled}
            >
              New
            </button>
          </div>
        </header>

        <div className="content-grid">
          <aside className="history-panel" aria-label="Saved threads">
            <div className="history-header">
              <span>Threads</span>
              <button
                className="new-chat-button"
                type="button"
                onClick={handleNewChat}
                disabled={isNewChatDisabled}
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

          <section className="chat-panel" aria-label="WHS code lookup">
            <div className="message-list">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-mark" aria-hidden="true">
                    WHS
                  </div>
                  <h2>Code Lookup</h2>
                  <div className="example-list" aria-label="Example questions">
                    {exampleQuestions.map((question) => (
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
                      {message.role === "assistant" ? "WHS" : "You"}
                    </div>
                    <p>{message.content}</p>
                    {message.citations && message.citations.length > 0 ? (
                      <div className="citation-list" aria-label="Citations">
                        {message.citations.map((citation) => (
                          <a
                            className="citation-chip"
                            key={`${citation.documentId ?? citation.edition}-${citation.locator ?? citation.section}`}
                            href={
                              citation.url ??
                              (citation.documentId && citation.locator
                                ? buildCodeSourceUrl(
                                    citation.documentId,
                                    citation.locator,
                                  )
                                : `/nec/${encodeURIComponent(citation.edition ?? "")}/${encodeURIComponent(citation.section ?? "")}`)
                            }
                          >
                            {formatCitationLabel(citation)}
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
                  <div className="message-meta">WHS</div>
                  <p>Checking {activeDocumentLabel}...</p>
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
              <label className="source-select-control" htmlFor="source-file">
                <span>Source</span>
                <select
                  id="source-file"
                  value={selectedSourceId}
                  onChange={(event) => handleSourceChange(event.target.value)}
                  disabled={isLoading || isSourceLocked}
                >
                  {sourceOptions.map((document) => (
                    <option key={document.id} value={document.id}>
                      {getDocumentLabel(document)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sr-only" htmlFor="question">
                Code question
              </label>
              <textarea
                id="question"
                ref={draftInputRef}
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleDraftKeyDown}
                placeholder="Ask about a code requirement..."
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
