"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type DrawMode = "draw" | "erase";

type Point = {
  x: number;
  y: number;
};

type Stroke = {
  id: string;
  color: string;
  size: number;
  mode: DrawMode;
  points: Point[];
};

type BoardCard = {
  id: string;
  text: string;
  x: number;
  y: number;
  source: "ai" | "manual";
};

type Note = {
  id: string;
  title: string;
  strokes: Stroke[];
  cards: BoardCard[];
  updatedAt: string;
};

const STORAGE_KEY = "writespace.notes.v1";
const AI_KEY_STORAGE = "writespace.deepseek.key.v1";
const CANVAS_BACKGROUND = "#ffffff";
const PALETTE = ["#182536", "#2f6fed", "#0f9d7a", "#f29f05", "#d95d39"];
const DEFAULT_COLOR = PALETTE[0];
const DEFAULT_SIZE = 8;
const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createEmptyNote(index: number) {
  return {
    id: createId(),
    title: `Note ${index}`,
    strokes: [],
    cards: [],
    updatedAt: nowIso(),
  } satisfies Note;
}

function normalizeNote(value: Partial<Note>, index: number): Note {
  const title =
    typeof value.title === "string" ? value.title : `Note ${index + 1}`;

  return {
    id: typeof value.id === "string" ? value.id : createId(),
    title,
    strokes: Array.isArray(value.strokes)
      ? value.strokes.map((stroke) => ({
          id: typeof stroke.id === "string" ? stroke.id : createId(),
          color: typeof stroke.color === "string" ? stroke.color : DEFAULT_COLOR,
          size: typeof stroke.size === "number" ? stroke.size : DEFAULT_SIZE,
          mode: stroke.mode === "erase" ? "erase" : "draw",
          points: Array.isArray(stroke.points)
            ? stroke.points.filter(
                (point): point is Point =>
                  typeof point?.x === "number" && typeof point?.y === "number",
              )
            : [],
        }))
      : [],
    cards: Array.isArray(value.cards)
      ? value.cards
          .filter((card) => typeof card === "object" && card !== null)
          .map((card, cardIndex) => ({
            id: typeof card.id === "string" ? card.id : createId(),
            text:
              typeof card.text === "string" && card.text.trim().length > 0
                ? card.text
                : `Idea ${cardIndex + 1}`,
            x: typeof card.x === "number" ? card.x : 24,
            y: typeof card.y === "number" ? card.y : 24,
            source: card.source === "manual" ? "manual" : "ai",
          }))
      : [],
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
  };
}

function getStrokeColor(stroke: Stroke) {
  return stroke.mode === "erase" ? CANVAS_BACKGROUND : stroke.color;
}

function applyBrushStyle(
  context: CanvasRenderingContext2D,
  stroke: Pick<Stroke, "color" | "mode" | "size">,
) {
  const color = getStrokeColor(stroke as Stroke);

  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = stroke.size;
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) {
    return;
  }

  applyBrushStyle(context, stroke);

  if (stroke.points.length === 1) {
    const [point] = stroke.points;
    context.beginPath();
    context.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  stroke.points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
      return;
    }

    context.lineTo(point.x, point.y);
  });
  context.stroke();
}

function paintCanvas(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  context.clearRect(0, 0, width, height);
  context.fillStyle = CANVAS_BACKGROUND;
  context.fillRect(0, 0, width, height);

  strokes.forEach((stroke) => {
    drawStroke(context, stroke);
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatUpdatedAt(value: string) {
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

function compactIdeaText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildCardTexts(value: string) {
  const lines = value
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  return lines
    .slice(0, 4)
    .map((line) => (line.length > 180 ? `${line.slice(0, 177)}...` : line));
}

function buildStormContext(note: Note) {
  const title = note.title.trim();
  const manualCards = note.cards
    .map((card) => card.text.trim())
    .filter((text) => text.length > 0);

  return {
    title,
    manualCards,
    canAnalyze: title.length > 0 || manualCards.length > 0,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
  const [brushColor, setBrushColor] = useState(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_SIZE);
  const [mode, setMode] = useState<DrawMode>("draw");
  const [isHydrated, setIsHydrated] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiError, setAiError] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? null;
  const orderedNotes = [...notes].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const savedAiKey = window.localStorage.getItem(AI_KEY_STORAGE);

    if (typeof savedAiKey === "string") {
      setAiApiKey(savedAiKey);
    }

    if (!stored) {
      const firstNote = createEmptyNote(1);
      setNotes([firstNote]);
      setActiveNoteId(firstNote.id);
      setIsHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as {
        notes?: Partial<Note>[];
        activeNoteId?: string;
      };
      const normalizedNotes = Array.isArray(parsed.notes)
        ? parsed.notes.map(normalizeNote)
        : [];

      if (normalizedNotes.length === 0) {
        const firstNote = createEmptyNote(1);
        setNotes([firstNote]);
        setActiveNoteId(firstNote.id);
      } else {
        const savedActiveId =
          typeof parsed.activeNoteId === "string" ? parsed.activeNoteId : "";
        const nextActiveId = normalizedNotes.some(
          (note) => note.id === savedActiveId,
        )
          ? savedActiveId
          : normalizedNotes[0].id;

        setNotes(normalizedNotes);
        setActiveNoteId(nextActiveId);
      }
    } catch {
      const firstNote = createEmptyNote(1);
      setNotes([firstNote]);
      setActiveNoteId(firstNote.id);
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notes, activeNoteId }),
    );
  }, [activeNoteId, isHydrated, notes]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(AI_KEY_STORAGE, aiApiKey.trim());
  }, [aiApiKey, isHydrated]);

  useEffect(() => {
    if (!isHydrated || notes.length === 0) {
      return;
    }

    if (!notes.some((note) => note.id === activeNoteId)) {
      setActiveNoteId(notes[0].id);
    }
  }, [activeNoteId, isHydrated, notes]);

  useEffect(() => {
    const board = boardRef.current;
    const canvas = canvasRef.current;

    if (!board || !canvas) {
      return;
    }

    const resizeCanvas = () => {
      const bounds = board.getBoundingClientRect();

      if (bounds.width === 0 || bounds.height === 0) {
        return;
      }

      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(bounds.width * ratio);
      canvas.height = Math.floor(bounds.height * ratio);
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;

      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintCanvas(canvas, activeNote?.strokes ?? []);
    };

    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(board);

    return () => {
      observer.disconnect();
    };
  }, [activeNote?.strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    paintCanvas(canvas, activeNote?.strokes ?? []);
  }, [activeNote]);

  useEffect(() => {
    setAiResponse("");
    setAiError("");
  }, [activeNoteId]);

  function updateActiveNote(
    updater: (note: Note) => Note,
    fallbackTitle = notes.length + 1,
  ) {
    if (!activeNote) {
      const nextNote = createEmptyNote(fallbackTitle);
      const updated = updater(nextNote);
      setNotes([updated]);
      setActiveNoteId(updated.id);
      return;
    }

    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.id === activeNote.id ? updater(note) : note,
      ),
    );
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextTitle = event.target.value;

    updateActiveNote((note) => ({
      ...note,
      title: nextTitle,
      updatedAt: nowIso(),
    }));
  }

  function handleNewNote() {
    const nextNote = createEmptyNote(notes.length + 1);
    setNotes([nextNote, ...notes]);
    setActiveNoteId(nextNote.id);
  }

  function addCardsToActiveNote(texts: string[], source: BoardCard["source"]) {
    const cleanedTexts = texts.map(compactIdeaText).filter((text) => text.length > 0);

    if (cleanedTexts.length === 0) {
      return;
    }

    updateActiveNote((note) => {
      const nextCards = cleanedTexts.map((text, index) => {
        const cardIndex = note.cards.length + index;
        const column = cardIndex % 2;
        const row = Math.floor(cardIndex / 2);

        return {
          id: createId(),
          text,
          x: 28 + column * 250,
          y: 28 + row * 152,
          source,
        } satisfies BoardCard;
      });

      return {
        ...note,
        cards: [...note.cards, ...nextCards],
        updatedAt: nowIso(),
      };
    });
  }

  function handleDeleteNote(noteId: string) {
    const remainingNotes = notes.filter((note) => note.id !== noteId);

    if (remainingNotes.length === 0) {
      const replacement = createEmptyNote(1);
      setNotes([replacement]);
      setActiveNoteId(replacement.id);
      return;
    }

    setNotes(remainingNotes);

    if (noteId === activeNoteId) {
      setActiveNoteId(remainingNotes[0].id);
    }
  }

  function handleUndo() {
    if (!activeNote || activeNote.strokes.length === 0) {
      return;
    }

    updateActiveNote((note) => ({
      ...note,
      strokes: note.strokes.slice(0, -1),
      updatedAt: nowIso(),
    }));
  }

  function handleClearCanvas() {
    if (!activeNote || activeNote.strokes.length === 0) {
      return;
    }

    updateActiveNote((note) => ({
      ...note,
      strokes: [],
      updatedAt: nowIso(),
    }));
  }

  function handleExportPng() {
    if (!activeNote) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    const filename = slugify(activeNote.title.trim() || "writespace-note");

    link.href = canvas.toDataURL("image/png");
    link.download = `${filename}.png`;
    link.click();
  }

  function handleDeleteCard(cardId: string) {
    if (!activeNote) {
      return;
    }

    updateActiveNote((note) => ({
      ...note,
      cards: note.cards.filter((card) => card.id !== cardId),
      updatedAt: nowIso(),
    }));
  }

  async function handleStorm() {
    if (!activeNote) {
      setAiError("Open a note before using Storm.");
      return;
    }

    const trimmedKey = aiApiKey.trim();
    const context = buildStormContext(activeNote);

    if (trimmedKey.length === 0) {
      setAiError("Add a DeepSeek API key to use Storm.");
      return;
    }

    if (!context.canAnalyze) {
      setAiError("Name the note or pin some board text so Storm has context.");
      return;
    }

    setIsAiLoading(true);
    setAiError("");

    try {
      const response = await fetch(DEEPSEEK_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${trimmedKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.6,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content:
                "You are Storm, an AI layer inside a whiteboard app. Infer the topic from the note context and provide concise, relevant information the user would want on a whiteboard. Respond with short bullet sections titled Topic read, Relevant information, Key questions, and Useful next steps.",
            },
            {
              role: "user",
              content: [
                `Note title: ${context.title || "(untitled)"}`,
                context.manualCards.length > 0
                  ? `Board text:\n- ${context.manualCards.join("\n- ")}`
                  : "Board text: none",
                `Stroke count: ${activeNote.strokes.length}`,
                "Interpret what this whiteboard is about and add useful context.",
              ].join("\n"),
            },
          ],
        }),
      });

      const payload = (await response.json()) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string | null } }>;
      };

      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? "The AI request failed. Try again.",
        );
      }

      const content = payload.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("The AI response was empty.");
      }

      setAiResponse(content);
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "The AI request failed.",
      );
    } finally {
      setIsAiLoading(false);
    }
  }

  function handlePinAiResponse() {
    addCardsToActiveNote(buildCardTexts(aiResponse), "ai");
  }

  function getCanvasPoint(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): Point | null {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();

    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!activeNote) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const point = getCanvasPoint(event);
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!point || !context) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    const nextStroke: Stroke = {
      id: createId(),
      color: brushColor,
      size: brushSize,
      mode,
      points: [point],
    };

    activeStrokeRef.current = nextStroke;
    drawStroke(context, nextStroke);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const activeStroke = activeStrokeRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getCanvasPoint(event);

    if (!activeStroke || !context || !point) {
      return;
    }

    const previousPoint = activeStroke.points[activeStroke.points.length - 1];
    activeStroke.points.push(point);

    applyBrushStyle(context, activeStroke);
    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function commitStroke() {
    const activeStroke = activeStrokeRef.current;

    if (!activeStroke) {
      return;
    }

    activeStrokeRef.current = null;

    updateActiveNote((note) => ({
      ...note,
      strokes: [
        ...note.strokes,
        {
          ...activeStroke,
          points: activeStroke.points.map((point) => ({ ...point })),
        },
      ],
      updatedAt: nowIso(),
    }));
  }

  function releaseStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    commitStroke();
  }

  const activeTitle = activeNote
    ? activeNote.title.trim() || "Untitled note"
    : "Loading note";
  const activeUpdatedAt = activeNote ? formatUpdatedAt(activeNote.updatedAt) : "";
  const strokeCount = activeNote?.strokes.length ?? 0;

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="panel hero-panel">
          <div className="brand-block">
            <h1>WriteSpace</h1>
          </div>
        </header>

        <header className="panel toolbar">
          <div className="toolbar-cluster">
            <span className="toolbar-label">Tool</span>
            <div className="segmented-control">
              <button
                className={mode === "draw" ? "segment-active" : ""}
                onClick={() => setMode("draw")}
              >
                Pen
              </button>
              <button
                className={mode === "erase" ? "segment-active" : ""}
                onClick={() => setMode("erase")}
              >
                Eraser
              </button>
            </div>
          </div>

          <div className="toolbar-cluster">
            <span className="toolbar-label">Color</span>
            <div className="swatches">
              {PALETTE.map((color) => (
                <button
                  key={color}
                  className={`swatch${brushColor === color ? " swatch-active" : ""}`}
                  onClick={() => {
                    setBrushColor(color);
                    setMode("draw");
                  }}
                  style={{ "--swatch-color": color } as CSSProperties}
                  aria-label={`Select ${color} brush`}
                />
              ))}
            </div>
          </div>

          <div className="toolbar-cluster brush-cluster">
            <label className="toolbar-label" htmlFor="brush-size">
              Brush
            </label>
            <input
              id="brush-size"
              className="brush-slider"
              min={2}
              max={28}
              step={1}
              type="range"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
            <span className="brush-size">{brushSize}px</span>
          </div>

          <div className="toolbar-actions">
            <button className="ghost-button" onClick={handleUndo}>
              Undo
            </button>
            <button className="ghost-button" onClick={handleClearCanvas}>
              Clear
            </button>
            <button className="primary-button" onClick={handleExportPng}>
              Export PNG
            </button>
          </div>
        </header>

        <div className="panel board-panel">
          <div className="board-header">
            <div>
              <p className="eyebrow">Whiteboard</p>
              <h2>{activeTitle}</h2>
            </div>
            <div className="board-status">
              <span>{strokeCount} strokes</span>
              <span>{activeUpdatedAt}</span>
            </div>
          </div>

          <div className="board-surface" ref={boardRef}>
            <canvas
              ref={canvasRef}
              className="board-canvas"
              onPointerCancel={releaseStroke}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={releaseStroke}
            />
            <div className="board-overlay">
              {activeNote?.cards.map((card) => (
                <article
                  className={`idea-card idea-card-${card.source}`}
                  key={card.id}
                  style={{ left: `${card.x}px`, top: `${card.y}px` }}
                >
                  <button
                    className="idea-card-delete"
                    aria-label="Remove board note"
                    onClick={() => handleDeleteCard(card.id)}
                  >
                    Remove
                  </button>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>
            <div className="board-hint">
              Draw with mouse, touch, or pen. Export the board any time as a
              PNG.
            </div>
          </div>
        </div>
      </section>

      <aside className="panel bottom-dock">
        <div className="brand-block">
          <p className="eyebrow">Workspace</p>
          <h3>Notes</h3>
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="note-title">
            Current note
          </label>
          <input
            id="note-title"
            className="title-input"
            type="text"
            value={activeNote?.title ?? ""}
            onChange={handleTitleChange}
            placeholder="Name this note"
          />
        </div>

        <div className="sidebar-actions">
          <button className="primary-button" onClick={handleNewNote}>
            New note
          </button>
        </div>

        <div className="notes-head">
          <span>Saved notes</span>
          <span>{notes.length}</span>
        </div>

        <div className="note-list">
          {orderedNotes.map((note) => {
            const isActive = note.id === activeNoteId;

            return (
              <div
                className={`note-card${isActive ? " note-card-active" : ""}`}
                key={note.id}
              >
                <button
                  className="note-open"
                  onClick={() => setActiveNoteId(note.id)}
                >
                  <span className="note-title">
                    {note.title.trim() || "Untitled note"}
                  </span>
                  <span className="note-meta">
                    {note.strokes.length} strokes · {formatUpdatedAt(note.updatedAt)}
                  </span>
                </button>
                <button
                  className="note-delete"
                  aria-label={`Delete ${note.title.trim() || "Untitled note"}`}
                  onClick={() => handleDeleteNote(note.id)}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>

        <section className="ai-panel">
          <div className="ai-panel-head">
            <p className="eyebrow">Storm</p>
            <h3>Context reader</h3>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="ai-api-key">
              API key
            </label>
            <input
              id="ai-api-key"
              className="title-input"
              type="password"
              value={aiApiKey}
              onChange={(event) => setAiApiKey(event.target.value)}
              placeholder="Stored only in this browser"
            />
          </div>

          <div className="ai-actions">
            <button
              className="primary-button"
              onClick={handleStorm}
              disabled={isAiLoading}
            >
              {isAiLoading ? "Reading..." : "Storm"}
            </button>
            <button
              className="ghost-button"
              onClick={handlePinAiResponse}
              disabled={aiResponse.trim().length === 0}
            >
              Pin storm notes
            </button>
          </div>

          {aiError ? <p className="ai-error">{aiError}</p> : null}

          <div className="ai-response">
            <p className="field-label">Response</p>
            <pre>
              {aiResponse ||
                "Storm reads the note title and any pinned board text, then returns relevant information."}
            </pre>
          </div>

          <p className="ai-footnote">
            Storm uses the current note as context. The API key stays in local
            browser storage so it does not get published in the GitHub Pages
            bundle.
          </p>
        </section>
      </aside>
    </main>
  );
}
