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

const pageMarkerPattern = /@@PDF_PAGE:(\d+)@@/g;
const sectionPattern =
  /(?:^|\n)\s*(?<section>\d{3}(?:\.\d+)?(?:\([A-Za-z0-9]+\))*)\s+(?<title>[^\n]+)\n(?<body>[\s\S]*?)(?=\n\s*\d{3}(?:\.\d+)?(?:\([A-Za-z0-9]+\))*\s+[^\n]+\n|$)/g;

try {
  const rawText = await readSourceText(sourcePath);
  const normalizedText = addPageMarkers(rawText)
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\u00ad\n/g, "")
    .replace(/\u00ad/g, "");
  const sections = [];

  for (const match of normalizedText.matchAll(sectionPattern)) {
    const section = match.groups?.section?.trim();
    const title = cleanTitle(cleanLine(match.groups?.title ?? ""));
    const text = cleanSectionText(section ?? "", cleanBody(match.groups?.body ?? ""));
    const page = getPageForOffset(normalizedText, match.index ?? 0);

    if (!section || !title || !text || shouldSkipSection(section, title, text)) {
      continue;
    }

    sections.push({
      edition,
      section,
      title,
      text,
      page,
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

function addPageMarkers(value) {
  if (!sourcePath.toLowerCase().endsWith(".pdf")) {
    return value;
  }

  return value
    .split("\f")
    .map((page, index) => `\n@@PDF_PAGE:${index + 1}@@\n${page}`)
    .join("\n");
}

function getPageForOffset(value, offset) {
  let page = 1;
  let match;

  pageMarkerPattern.lastIndex = 0;

  while ((match = pageMarkerPattern.exec(value))) {
    if (match.index > offset) {
      break;
    }

    page = Number(match[1]);
  }

  return page;
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

function cleanLine(value) {
  return normalizeOcrText(value)
    .replace(/Copyright.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBody(value) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !isBoilerplateLine(line))
    .map(normalizeOcrText);

  return joinWrappedLines(lines)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanSectionText(section, value) {
  if (section === "210.8") {
    return cleanSection2108(value);
  }

  return value;
}

function cleanSection2108(value) {
  let text = value;

  if (/^ance with 210\.8\(A\)/.test(text)) {
    text = `A listed Class A GFCI shall provide protection in accordance with 210.8(A)${text.slice(
      "ance with 210.8(A)".length,
    )}`;
  }

  text = text
    .replace(/Informational:s\\ote:/g, "Informational Note:")
    .replace(/\bacccs\.wlr l y buildings\b/gi, "accessory buildings")
    .replace(/\bsimilar usc\b/gi, "similar use")
    .replace(/\barc installed\b/gi, "are installed")
    .replace(/\baccesibk\b/gi, "accessible")
    .replace(/\bmf!\s*\.supplied\b/g, "are supplied")
    .replace(/\bdP\.dicated\b/gi, "dedicated")
    .replace(/\bmul vessel\b/gi, "and vessel")
    .replace(/\b11scejJtack\b/gi, "receptacle")
    .replace(/\b\.mpplying\b/gi, " supplying")
    .replace(/\bJle\/s0Ul1Umtly\b/gi, "permanently")
    .replace(/\bsecurit_ls\b/gi, "security")
    .replace(/\bJmmitled\b/gi, "permitted")
    .replace(/\bcircuitinterrupterJnvtection\b/gi, "circuit-interrupter protection")
    .replace(/\bcomJJatibk\b/gi, "compatible")
    .replace(/\bweight-\.mpporting\b/gi, "weight-supporting")
    .replace(/\binsta\/H\.dfor\b/gi, "installed for")
    .replace(/\bJIUIpose\b/gi, "purpose")
    .replace(/\bsuJJpm·ting\b/gi, "supporting")
    .replace(/\bluminailf!\b/gi, "luminaire")
    .replace(/\bceiling-\.m\.pended Jan\b/gi, "ceiling-suspended fan")
    .replace(/\bceiling-\.msJroded Jan\b/gi, "ceiling-suspended fan")
    .replace(/\bgmundfault\b/gi, "ground-fault")
    .replace(/\bcirruit\b/gi, "circuit")
    .replace(/\bgrmeral-purpo\.sils\b/gi, "general-purpose")
    .replace(/\bluminai11s\b/gi, "luminaire")
    .replace(/\bm·\b/g, "or");

  text = text.replace(
    /\(1\)\n\(2\)\n\(3\)\n\(4\)\nBathrooms[\s\S]*?Indoor damp and wet locations/,
    [
      "(1) Bathrooms",
      "(2) Garages and accessory buildings that have a floor located at or below grade level not intended as habitable rooms and limited to storage areas, work areas, and areas of similar use",
      "(3) Outdoors",
      "(4) Crawl spaces at or below grade level",
      "(5) Basements",
      "(6) Kitchens",
      "(7) Areas with sinks and permanent provisions for food preparation, beverage preparation, or cooking",
      "(8) Sinks where receptacles are installed within 1.8 m (6 ft) from the top inside edge of the bowl of the sink",
      "(9) Boathouses",
      "(10) Bathtubs or shower stalls where receptacles are installed within 1.8 m (6 ft) of the outside edge of the bathtub or shower stall",
      "(11) Laundry areas",
      "(12) Indoor damp and wet locations",
    ].join("\n"),
  );

  text = text
    .replace(
      /Exception No\. 3:[\s\S]*?Exception No\. 4:/,
      [
        "Exception No. 3: Listed weight-supporting ceiling receptacles utilized in combination with compatible weight-supporting attachment fittings installed for the purpose of supporting a ceiling luminaire or ceiling-suspended fan shall be permitted to omit ground-fault circuit-interrupter protection. If a general-purpose convenience receptacle is integral to the ceiling luminaire or ceiling-suspended fan, GFCI protection shall be provided.",
        "Exception No. 4:",
      ].join("\n"),
    )
    .replace(
      /Exception No\. 4:[\s\S]*?Informational Note: See 760\.41/,
      [
        "Exception No. 4: Factory-installed receptacles that are not readily accessible and are mounted internally to bathroom exhaust fan assemblies shall not require GFCI protection unless required by the installation instructions or listing.",
        "Informational Note: See 760.41",
      ].join("\n"),
    )
    .replace(/requirement•/g, "requirements")
    .replace(/\blire alarm systems\b/gi, "fire alarm systems")
    .replace(/\bfire alarm systems\b/gi, "fire alarm systems");

  return text;
}

function cleanTitle(value) {
  return normalizeOcrText(value)
    .replace(/\bInterruptels?\b/gi, "Interrupter")
    .replace(/\bPerson(?:nel)?\b.*$/i, "Personnel")
    .trim();
}

function joinWrappedLines(lines) {
  const output = [];

  for (const line of lines) {
    const previous = output[output.length - 1];

    if (
      previous &&
      shouldJoinWithPrevious(previous, line)
    ) {
      output[output.length - 1] = `${previous} ${line}`.replace(/\s+/g, " ");
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function shouldJoinWithPrevious(previous, line) {
  if (!line || !previous) {
    return false;
  }

  if (/^\(?\d+\)?$/.test(previous) || /^\(?\d+\)?$/.test(line)) {
    return false;
  }

  if (/^[A-Z]\)|^Exception\b|^Informational Note\b|^Table\b/.test(line)) {
    return false;
  }

  if (
    previous.length < 44 &&
    /^[A-Z][A-Za-z\s-]+$/.test(previous) &&
    /^[A-Z]/.test(line)
  ) {
    return false;
  }

  if (/[.:;]$/.test(previous)) {
    return false;
  }

  return /^[a-z0-9(]/i.test(line);
}

function normalizeOcrText(value) {
  let text = value
    .replace(/\u00ad/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\\./g, "")
    .replace(/\\-/g, "-")
    .replace(/"/g, "w")
    .replace(/'/g, "s")
    .replace(/�/g, "");

  const replacements = [
    [/\bClasi\.wl\b/gi, "Class"],
    [/\bCla[si]\.?\s*l\b/gi, "Class"],
    [/\bGFCI\s+shall\s+provide\b/gi, "GFCI shall provide"],
    [/\bGF\\?\.?J\b/gi, "GFCI"],
    [/\bAFCJ\b/gi, "AFCI"],
    [/\bInterruptels?\b/gi, "Interrupter"],
    [/\bprmide[ds]?\b/gi, "provide"],
    [/\bprmid(ed|es|e|ing)?\b/gi, "provid$1"],
    [/\bprmidcd\b/gi, "provided"],
    [/\baccorclance\b/gi, "accordance"],
    [/\baccorcl\b/gi, "accord"],
    [/\baccord\s*\n?\s*ance\b/gi, "accordance"],
    [/\bancc\b/gi, "ance"],
    [/\bwithoul\b/gi, "without"],
    [/\bitltoul\b/gi, "without"],
    [/\bwitltoul\b/gi, "without"],
    [/\bl\\itlt\b/gi, "with"],
    [/\bwid1\b/gi, "with"],
    [/\btl1c\b/gi, "the"],
    [/\btltc\b/gi, "the"],
    [/\btllc\b/gi, "the"],
    [/\bthc\b/gi, "the"],
    [/\bsinglc\b/gi, "single"],
    [/\bsinglcphawlc\b/gi, "single-phase"],
    [/\bpha(?:w|s)?lc\b/gi, "phase"],
    [/\bcircuitwl\b/gi, "circuits"],
    [/\bvoltwl\b/gi, "volts"],
    [/\baw?l\b/g, "as"],
    [/\blcs\.?s?l?\b/gi, "less"],
    [/\blesswl\b/gi, "less"],
    [/\bacccs\.wliblc\b/gi, "accessible"],
    [/\bacccs\.wlr\s+l y\b/gi, "accessory"],
    [/\bacccs\.si\b/gi, "access"],
    [/\bacc(?:c|e)s\.?s?ible\b/gi, "accessible"],
    [/\bmcawlurcd\b/gi, "measured"],
    [/\bmeaw?lur(?:c|e)d\b/gi, "measured"],
    [/\btltal\b/gi, "that"],
    [/\bimcnded\b/gi, "intended"],
    [/\bimcndcd\b/gi, "intended"],
    [/\bstorage arcaw?l\b/gi, "storage areas"],
    [/\bwork arcaw?l\b/gi, "work areas"],
    [/\barcaw?l\b/gi, "areas"],
    [/\bBaw?lCmcnlw?l\b/gi, "Basements"],
    [/\bprov(?:i|l)Sions\b/g, "provisions"],
    [/\bSink\.?w?l\b/gi, "Sinks"],
    [/\bLaunclrv\b/gi, "Laundry"],
    [/\bLaunclry\b/gi, "Laundry"],
    [/\bRecefJtacles\b/gi, "Receptacles"],
    [/\b11smiily\b/gi, "readily"],
    [/\b11'?miily\b/gi, "readily"],
    [/\btwt\b/gi, "not"],
    [/\b1wt\b/gi, "not"],
    [/\bmf!\b/g, "are"],
    [/\bmpplied\b/gi, "supplied"],
    [/\blnunclt cirruit\b/gi, "branch circuit"],
    [/\bD\.?dicated\b/gi, "dedicated"],
    [/\be!?P?ctric\b/gi, "electric"],
    [/\bstww-melting\b/gi, "snow-melting"],
    [/\bpiJ.?eline\b/gi, "pipeline"],
    [/\bequiJ\d*ent\b/gi, "equipment"],
    [/\bslmU\b/gi, "shall"],
    [/\bshaU\b/g, "shall"],
    [/\binstalkd\b/gi, "installed"],
    [/\baccmrlana\b/gi, "accordance"],
    [/\baJ1plicabk\b/gi, "applicable"],
    [/\bcejJtack\b/gi, "receptacle"],
    [/\bJle\/?0Ul1Umtly\b/gi, "permanently"],
    [/\bpermanentl_l'\b/gi, "permanently"],
    [/\bsy\.?tem\b/gi, "system"],
    [/\bJmmit(?:t)?ed\b/gi, "permitted"],
    [/\bgmmulfault\b/gi, "ground-fault"],
    [/\bintermJJter\b/gi, "interrupter"],
    [/\bJnvtection\b/gi, "protection"],
    [/\bweighl-sliJ1porting\b/gi, "weight-supporting"],
    [/\b11'?Cejltacks\b/gi, "receptacles"],
    [/\butiliZP\.?d\b/gi, "utilized"],
    [/\bimtallation\b/gi, "installation"],
    [/\breiling\b/gi, "ceiling"],
    [/\bJllvvided\b/gi, "provided"],
    [/\bExceptiun\b/gi, "Exception"],
    [/\btlmt\b/gi, "that"],
    [/\btln?c\b/gi, "the"],
    [/\bwmJily\b/gi, "readily"],
    [/\bibk\b/gi, "ible"],
    [/\bbatlnvom\b/gi, "bathroom"],
    [/\bexhaust Jan\b/gi, "exhaust fan"],
    [/\b11'-f\[Uire\b/gi, "require"],
    [/\b11'qui11'd\b/gi, "required"],
    [/\bi\.nstmctions\b/gi, "instructions"],
    [/\bimtallation\b/gi, "installation"],
    [/\bli\.?ting\b/gi, "listing"],
    [/\bscnicc\b/gi, "service"],
    [/\bscr\.?icc\b/gi, "service"],
    [/\bdisconncct\b/gi, "disconnect"],
    [/\bdisconnccti\b/gi, "disconnects"],
    [/\bmeans\s+shall\b/gi, "means shall"],
    [/\bclcfinccl\b/gi, "defined"],
    [/\bpcnnittccl\b/gi, "permitted"],
    [/\bfollo(?:w|m)ing\b/gi, "following"],
    [/\barc installed\b/gi, "are installed"],
    [/\barc supplied\b/gi, "are supplied"],
    [/\barc located\b/gi, "are located"],
    [/\barc used\b/gi, "are used"],
    [/\boutwliclc\b/gi, "outside"],
    [/\bbatlnub\b/gi, "bathtub"],
    [/\bscction\b/gi, "section"],
    [/\bscparate\b/gi, "separate"],
    [/\bbasiCd\b/gi, "based"],
    [/\bcalwity\b/gi, "cavity"],
    [/\bhalwing\b/gi, "having"],
    [/\bdasi\.siificd\b/gi, "classified"],
    [/\bdasi\.siilicd\b/gi, "classified"],
    [/\bchasic\b/gi, "chase"],
    [/\bplasitcr\b/gi, "plaster"],
    [/\bmasionrv\b/gi, "masonry"],
    [/\bwshere\b/gi, "where"],
    [/\bw1M\b/g, "NM"],
    [/\bwsMC\b/g, "NMC"],
    [/\bCode\b/g, "Code"],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\b12:>-volt\b/g, "125-volt")
    .replace(/\b125-volt\b/g, "125-volt")
    .replace(/\b1 \.8 m\b/g, "1.8 m")
    .replace(/\b1 50\b/g, "150")
    .replace(/\b1 25\b/g, "125")
    .replace(/\b1 000\b/g, "1000")
    .replace(/\b1 500\b/g, "1500")
    .replace(/\(\s*1\s+0\s*\)/g, "(10)")
    .replace(/\(\s*1\s+1\s*\)/g, "(11)")
    .replace(/\(\s*1\s+2\s*\)/g, "(12)")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
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
    /^@@PDF_PAGE:\d+@@$/.test(value) ||
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
