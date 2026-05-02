#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const edition = process.env.NEC_EDITION?.trim() || "2023";
const sourcePath = resolvePath(
  process.env.NEC_SOURCE_PATH?.trim() ||
    `data/nec/source/nec-${edition}.txt`,
);
const outputPath = resolvePath(
  process.env.NEC_INDEX_PATH?.trim() || `data/nec/index/nec-${edition}.json`,
);

const sectionPattern =
  /(?:^|\n)\s*(?<section>\d{3}(?:\.\d+)?(?:\([A-Za-z0-9]+\))*)\s+(?<title>[^\n]+)\n(?<body>[\s\S]*?)(?=\n\s*\d{3}(?:\.\d+)?(?:\([A-Za-z0-9]+\))*\s+[^\n]+\n|$)/g;

try {
  const rawText = await readSourceText(sourcePath);
  const normalizedText = rawText
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/\u00a0/g, " ");
  const sections = [];

  for (const match of normalizedText.matchAll(sectionPattern)) {
    const section = match.groups?.section?.trim();
    const title = cleanLine(match.groups?.title ?? "");
    const text = cleanBody(match.groups?.body ?? "");

    if (!section || !title || !text || shouldSkipSection(section, title, text)) {
      continue;
    }

    sections.push({
      edition,
      section,
      title,
      text,
    });
  }

  if (sections.length === 0) {
    throw new Error(
      [
        "No sections were parsed from the licensed source.",
        "Expected plain text blocks shaped like:",
        "210.8 Ground-Fault Circuit-Interrupter Protection for Personnel",
        "<section text>",
      ].join("\n"),
    );
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify({ edition, generatedAt: new Date().toISOString(), sections }, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Indexed ${sections.length} NEC ${edition} sections to ${outputPath}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function readSourceText(value) {
  if (value.toLowerCase().endsWith(".pdf")) {
    const { stdout } = await execFileAsync(
      "pdftotext",
      [value, "-"],
      { maxBuffer: 128 * 1024 * 1024 },
    );

    return stdout;
  }

  return fs.readFile(value, "utf8");
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

function cleanLine(value) {
  return value
    .replace(/Copyright.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBody(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !isBoilerplateLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shouldSkipSection(section, title, text) {
  if (!/^\d{3}(?:\.\d+)?(?:\([A-Za-z0-9]+\))*$/.test(section)) {
    return true;
  }

  if (/^\d{4}\s+Edition$/i.test(title)) {
    return true;
  }

  return text.length < 20;
}

function isBoilerplateLine(value) {
  return (
    value.length === 0 ||
    /^Copyright/i.test(value) ||
    /^For inquiries contact/i.test(value) ||
    /^EDUFIRE\.IR/i.test(value) ||
    /^Telegram:/i.test(value) ||
    /^NATIONAL ELECTRICAL CODE/i.test(value) ||
    /^NFPA 70/i.test(value) ||
    /^\d{4} Edition$/i.test(value) ||
    /^\d{2}-\d+\s*$/.test(value)
  );
}
