#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const documentId = process.env.CODE_DOCUMENT_ID?.trim();
const sourcePath = process.env.CODE_SOURCE_PATH?.trim();

if (!documentId || !sourcePath) {
  console.error(
    [
      "CODE_DOCUMENT_ID and CODE_SOURCE_PATH are required.",
      'Example: CODE_DOCUMENT_ID=ipc-2021-commentary CODE_SOURCE_PATH="/path/to/ipc.pdf" npm run index:codes',
    ].join("\n"),
  );
  process.exit(1);
}

const resolvedSourcePath = resolvePath(sourcePath);
const outputPath = resolvePath(
  process.env.CODE_INDEX_PATH?.trim() || `data/code/index/${documentId}.json`,
);
const publicPdfPath = resolvePath(
  process.env.CODE_PUBLIC_PDF_PATH?.trim() ||
    `public/code-pdf/${documentId}.pdf`,
);
const copyPdf =
  resolvedSourcePath.toLowerCase().endsWith(".pdf") &&
  process.env.CODE_COPY_PDF !== "false";

try {
  const rawText = await readSourceText(resolvedSourcePath);
  const chunks = buildPageChunks(rawText);

  if (chunks.length === 0) {
    throw new Error("No usable text chunks were parsed from the source.");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(
      {
        documentId,
        generatedAt: new Date().toISOString(),
        sourceName: path.basename(resolvedSourcePath),
        chunks,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (copyPdf) {
    await fs.mkdir(path.dirname(publicPdfPath), { recursive: true });
    await fs.copyFile(resolvedSourcePath, publicPdfPath);
  }

  console.log(
    `Indexed ${chunks.length} pages for ${documentId} to ${outputPath}${
      copyPdf ? ` and copied PDF to ${publicPdfPath}` : ""
    }`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function readSourceText(value) {
  if (value.toLowerCase().endsWith(".pdf")) {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", value, "-"], {
      maxBuffer: 512 * 1024 * 1024,
    });

    return stdout;
  }

  return fs.readFile(value, "utf8");
}

function buildPageChunks(value) {
  return value
    .split("\f")
    .map((pageText, index) => {
      const page = index + 1;
      const text = cleanPageText(pageText);

      if (text.length < 80) {
        return null;
      }

      return {
        documentId,
        locator: `Page ${page}`,
        title: findPageTitle(text),
        text,
        page,
      };
    })
    .filter((chunk) => chunk !== null);
}

function cleanPageText(value) {
  const lines = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u00ad\n/g, "")
    .replace(/\u00ad/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => !isBoilerplateLine(line.trim()));

  return lines
    .join("\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function findPageTitle(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const sectionHeading = lines.find((line) =>
    /^(?:[A-Z]?\d{1,4}(?:\.\d+)+(?:\([A-Za-z0-9]+\))*|SECTION\s+\d{2,4}|CHAPTER\s+\d{1,3}|TABLE\s+[A-Z0-9.]+)/i.test(
      line,
    ),
  );
  const title = sectionHeading ?? lines.find((line) => line.length > 8) ?? "";

  return title.replace(/\s+/g, " ").slice(0, 120);
}

function isBoilerplateLine(value) {
  return (
    value.length === 0 ||
    /^Copyright/i.test(value) ||
    /^For inquiries contact/i.test(value) ||
    /^Downloaded from/i.test(value) ||
    /^Telegram:/i.test(value) ||
    /^EDUFIRE\.IR/i.test(value) ||
    /^\d+\s*$/.test(value)
  );
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}
