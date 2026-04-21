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
  latexOutput: string;
  updatedAt: string;
};

const STORAGE_KEY = "writespace.notes.v1";
const CANVAS_BACKGROUND = "#ffffff";
const PALETTE = ["#182536", "#2f6fed", "#0f9d7a", "#f29f05", "#d95d39"];
const DEFAULT_COLOR = PALETTE[0];
const DEFAULT_SIZE = 8;

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
    title: `Board ${index}`,
    strokes: [],
    cards: [],
    latexOutput: "",
    updatedAt: nowIso(),
  } satisfies Note;
}

function normalizeNote(value: Partial<Note>, index: number): Note {
  const title =
    typeof value.title === "string" ? value.title : `Board ${index + 1}`;

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
    latexOutput:
      typeof value.latexOutput === "string" ? value.latexOutput : "",
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

function paintStrokes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: Stroke[],
) {
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

function buildStormCardsFromJson(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      sticky_note?: string;
    };
    const notes = [parsed.sticky_note];

    return notes
      .slice(0, 1)
      .map((note) => compactIdeaText(note ?? ""))
      .filter((text) => text.length > 0);
  } catch {
    return [];
  }
}

function buildStormContext(note: Note) {
  const title = note.title.trim();
  const boardTexts = note.cards
    .filter((card) => card.source === "manual")
    .map((card) => card.text.trim())
    .filter((text) => text.length > 0);

  return {
    title,
    boardTexts,
    canAnalyze: title.length > 0 || boardTexts.length > 0,
  };
}

function buildLatexContext(note: Note) {
  const title = note.title.trim();
  const boardTexts = note.cards
    .map((card) => card.text.trim())
    .filter((text) => text.length > 0);

  return {
    title,
    boardTexts,
    canAnalyze: title.length > 0 || boardTexts.length > 0,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const dragRef = useRef<{
    cardId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
  const [brushColor, setBrushColor] = useState(DEFAULT_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_SIZE);
  const [mode, setMode] = useState<DrawMode>("draw");
  const [isHydrated, setIsHydrated] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [aiError, setAiError] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [latexError, setLatexError] = useState("");
  const [isLatexLoading, setIsLatexLoading] = useState(false);
  const [isLatexCopied, setIsLatexCopied] = useState(false);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? null;
  const orderedNotes = [...notes].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

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
    setLatexError("");
    setIsLatexCopied(false);
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

  function addAiCards(texts: string[]) {
    const cleanedTexts = texts.map(compactIdeaText).filter((text) => text.length > 0);

    if (cleanedTexts.length === 0) {
      return;
    }

    updateActiveNote((note) => {
      const nextCards = cleanedTexts.slice(0, 1).map((text, index) => {
        const aiCount = note.cards.filter((card) => card.source === "ai").length;
        const cardIndex = aiCount + index;
        const column = cardIndex % 2;
        const row = Math.floor(cardIndex / 2);

        return {
          id: createId(),
          text,
          x: 28 + column * 250,
          y: 28 + row * 152,
          source: "ai",
        };
      }) as BoardCard[];

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

  function buildBoardSnapshot(note: Note, includeAiCards = false) {
    const board = boardRef.current;

    if (!board) {
      return null;
    }

    const width = Math.max(800, Math.floor(board.clientWidth));
    const height = Math.max(480, Math.floor(board.clientHeight));
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    paintStrokes(context, width, height, note.strokes);

    note.cards
      .filter((card) => includeAiCards || card.source === "manual")
      .forEach((card) => {
        context.fillStyle = "rgba(255, 247, 210, 0.96)";
        context.strokeStyle = "rgba(24, 37, 54, 0.1)";
        context.lineWidth = 1;
        context.beginPath();
        context.roundRect(card.x, card.y, 220, 120, 18);
        context.fill();
        context.stroke();

        context.fillStyle = "#182536";
        context.font = "600 24px Avenir Next, sans-serif";
        const words = card.text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = "";

        words.forEach((word) => {
          const candidate = currentLine.length > 0 ? `${currentLine} ${word}` : word;

          if (context.measureText(candidate).width > 180 && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = word;
            return;
          }

          currentLine = candidate;
        });

        if (currentLine.length > 0) {
          lines.push(currentLine);
        }

        lines.slice(0, 4).forEach((line, index) => {
          context.fillText(line, card.x + 18, card.y + 38 + index * 26);
        });
      });

    return canvas.toDataURL("image/png");
  }

  function handleCardPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    card: BoardCard,
  ) {
    const board = boardRef.current;

    if (!board) {
      return;
    }

    const bounds = board.getBoundingClientRect();

    dragRef.current = {
      cardId: card.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left - card.x,
      offsetY: event.clientY - bounds.top - card.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCardPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragRef.current;
    const board = boardRef.current;
    const active = activeNote;

    if (!dragState || dragState.pointerId !== event.pointerId || !board || !active) {
      return;
    }

    const bounds = board.getBoundingClientRect();
    const nextX = Math.max(12, event.clientX - bounds.left - dragState.offsetX);
    const nextY = Math.max(12, event.clientY - bounds.top - dragState.offsetY);

    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.id !== active.id
          ? note
          : {
              ...note,
              cards: note.cards.map((card) =>
                card.id === dragState.cardId
                  ? { ...card, x: nextX, y: nextY }
                  : card,
              ),
            },
      ),
    );
  }

  function handleCardPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;

    updateActiveNote((note) => ({
      ...note,
      updatedAt: nowIso(),
    }));
  }

  async function handleStorm() {
    if (!activeNote) {
      setAiError("Open a board before using Storm.");
      return;
    }

    const context = buildStormContext(activeNote);
    const snapshot = buildBoardSnapshot(activeNote);

    if (!snapshot && !context.canAnalyze) {
      setAiError("Add some board content before using Storm.");
      return;
    }

    setIsAiLoading(true);
    setAiError("");

    try {
      const response = await fetch("/api/storm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          boardTitle: context.title,
          boardTexts: context.boardTexts,
          snapshot,
        }),
      });

      const payload = (await response.json()) as {
        error?: { message?: string };
        content?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error?.message ??
            (typeof payload.error === "string"
              ? payload.error
              : "The AI request failed. Try again."),
        );
      }

      const content = (payload.content ?? "").trim();

      if (!content) {
        throw new Error("The AI response was empty.");
      }

      setAiResponse(content);
      const nextCards = buildStormCardsFromJson(content);

      if (nextCards.length === 0) {
        throw new Error("Storm returned an unexpected format.");
      }

      addAiCards(nextCards);
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "The AI request failed.",
      );
    } finally {
      setIsAiLoading(false);
    }
  }

  async function handleTranscribeLatex() {
    if (!activeNote) {
      setLatexError("Open a board before transcribing to LaTeX.");
      return;
    }

    const context = buildLatexContext(activeNote);
    const snapshot = buildBoardSnapshot(activeNote, true);

    if (!snapshot && !context.canAnalyze) {
      setLatexError("Add some board content before transcribing to LaTeX.");
      return;
    }

    setIsLatexLoading(true);
    setLatexError("");
    setIsLatexCopied(false);

    try {
      const response = await fetch("/api/latex", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          boardTitle: context.title,
          boardTexts: context.boardTexts,
          snapshot,
        }),
      });

      const payload = (await response.json()) as {
        error?: { message?: string } | string;
        latex?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error && typeof payload.error === "object"
            ? payload.error.message ?? "The LaTeX transcription failed."
            : typeof payload.error === "string"
              ? payload.error
              : "The LaTeX transcription failed.",
        );
      }

      const latex = (payload.latex ?? "").trim();

      if (!latex) {
        throw new Error("The LaTeX transcription was empty.");
      }

      updateActiveNote((note) => ({
        ...note,
        latexOutput: latex,
        updatedAt: nowIso(),
      }));
    } catch (error) {
      setLatexError(
        error instanceof Error
          ? error.message
          : "The LaTeX transcription failed.",
      );
    } finally {
      setIsLatexLoading(false);
    }
  }

  async function handleCopyLatex() {
    const latex = activeNote?.latexOutput.trim() ?? "";

    if (!latex) {
      return;
    }

    try {
      await navigator.clipboard.writeText(latex);
      setIsLatexCopied(true);
    } catch {
      setLatexError("Copy failed. Select and copy the LaTeX manually.");
    }
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
    ? activeNote.title.trim() || "Untitled board"
    : "Loading board";
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
            <button
              className="primary-button"
              onClick={handleStorm}
              disabled={isAiLoading}
            >
              {isAiLoading ? "Storming..." : "Storm"}
            </button>
            <button
              className="secondary-button"
              onClick={handleTranscribeLatex}
              disabled={isLatexLoading}
            >
              {isLatexLoading ? "Transcribing..." : "Transcribe LaTeX"}
            </button>
          </div>

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
                  onPointerDown={(event) => handleCardPointerDown(event, card)}
                  onPointerMove={handleCardPointerMove}
                  onPointerUp={handleCardPointerUp}
                  onPointerCancel={handleCardPointerUp}
                >
                  <button
                    className="idea-card-delete"
                    aria-label="Remove board note"
                    onPointerDown={(event) => event.stopPropagation()}
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
        <div className="field-block">
          <label className="field-label" htmlFor="note-title">
            Current board
          </label>
          <input
            id="note-title"
            className="title-input"
            type="text"
            value={activeNote?.title ?? ""}
            onChange={handleTitleChange}
            placeholder="Name this board"
          />
        </div>

        <div className="sidebar-actions">
          <button className="primary-button" onClick={handleNewNote}>
            New board
          </button>
        </div>

        <div className="notes-head">
          <span>Saved boards</span>
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
                    {note.title.trim() || "Untitled board"}
                  </span>
                  <span className="note-meta">
                    {note.strokes.length} strokes · {formatUpdatedAt(note.updatedAt)}
                  </span>
                </button>
                <button
                  className="note-delete"
                  aria-label={`Delete ${note.title.trim() || "Untitled board"}`}
                  onClick={() => handleDeleteNote(note.id)}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>

        {aiError ? <p className="ai-error">{aiError}</p> : null}
      </aside>

      <section className="panel latex-panel">
        <div className="latex-panel-header">
          <div>
            <p className="eyebrow">LaTeX</p>
            <h2>Board transcription</h2>
          </div>
          <button
            className="ghost-button"
            onClick={handleCopyLatex}
            disabled={!activeNote?.latexOutput.trim()}
          >
            {isLatexCopied ? "Copied" : "Copy LaTeX"}
          </button>
        </div>

        <p className="latex-panel-copy">
          Generate a cleaned LaTeX version of the current board, then copy it
          directly from here.
        </p>

        {latexError ? <p className="ai-error">{latexError}</p> : null}

        <div className="latex-output">
          {activeNote?.latexOutput.trim() ? (
            <pre>
              <code>{activeNote.latexOutput}</code>
            </pre>
          ) : (
            <p className="latex-empty">
              No LaTeX yet. Use <strong>Transcribe LaTeX</strong> to convert the
              current board into copyable LaTeX.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
