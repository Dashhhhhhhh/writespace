export type CodeFamily = {
  id: string;
  label: string;
};

export type CodeDocument = {
  id: string;
  familyId: string;
  familyLabel: string;
  codeLabel: string;
  name: string;
  edition: string;
  optionLabel: string;
  indexPath: string;
  pdfUrl: string;
  aliases: string[];
  isDefault?: boolean;
};

export const CODE_SETTINGS_STORAGE_KEY = "whs-code.settings.v1";

export const CODE_DOCUMENTS = [
  {
    id: "nec-2023",
    familyId: "nec",
    familyLabel: "National Electrical Code",
    codeLabel: "NEC",
    name: "National Electrical Code",
    edition: "2023",
    optionLabel: "2023 NEC",
    indexPath: "data/code/index/nec-2023.json",
    pdfUrl: "/code-pdf/nec-2023.pdf",
    aliases: [
      "nec",
      "nfpa 70",
      "electrical code",
      "electrical",
      "wiring",
      "branch circuit",
      "feeder",
      "service disconnect",
      "grounding",
      "bonding",
      "receptacle",
      "gfci",
      "afci",
      "conduit",
      "breaker",
    ],
    isDefault: true,
  },
  {
    id: "nec-2017-handbook",
    familyId: "nec",
    familyLabel: "National Electrical Code",
    codeLabel: "NEC",
    name: "National Electrical Code Handbook",
    edition: "2017",
    optionLabel: "2017 NEC Handbook",
    indexPath: "data/code/index/nec-2017-handbook.json",
    pdfUrl: "/code-pdf/nec-2017-handbook.pdf",
    aliases: [
      "nec",
      "nfpa 70",
      "electrical code",
      "electrical",
      "wiring",
      "branch circuit",
      "feeder",
      "service disconnect",
      "grounding",
      "bonding",
      "receptacle",
      "gfci",
      "afci",
      "conduit",
      "breaker",
    ],
  },
  {
    id: "nfpa-72-2016",
    familyId: "nfpa-72",
    familyLabel: "Fire Alarm and Signaling",
    codeLabel: "NFPA 72",
    name: "National Fire Alarm and Signaling Code Handbook",
    edition: "2016",
    optionLabel: "2016 NFPA 72 Handbook",
    indexPath: "data/code/index/nfpa-72-2016.json",
    pdfUrl: "/code-pdf/nfpa-72-2016.pdf",
    aliases: [
      "nfpa 72",
      "fire alarm",
      "signaling",
      "notification appliance",
      "initiating device",
      "smoke detector",
      "alarm",
      "supervising station",
      "horn strobe",
    ],
    isDefault: true,
  },
  {
    id: "nfpa-99-2005",
    familyId: "nfpa-99",
    familyLabel: "Health Care Facilities",
    codeLabel: "NFPA 99",
    name: "Health Care Facilities Code",
    edition: "2005",
    optionLabel: "2005 NFPA 99",
    indexPath: "data/code/index/nfpa-99-2005.json",
    pdfUrl: "/code-pdf/nfpa-99-2005.pdf",
    aliases: [
      "nfpa 99",
      "health care",
      "healthcare",
      "hospital",
      "medical gas",
      "patient care",
      "essential electrical system",
      "gas vacuum",
    ],
    isDefault: true,
  },
  {
    id: "nfpa-13-2007",
    familyId: "nfpa-13",
    familyLabel: "Sprinkler Systems",
    codeLabel: "NFPA 13",
    name: "Installation of Sprinkler Systems",
    edition: "2007",
    optionLabel: "2007 NFPA 13",
    indexPath: "data/code/index/nfpa-13-2007.json",
    pdfUrl: "/code-pdf/nfpa-13-2007.pdf",
    aliases: [
      "nfpa 13",
      "sprinkler",
      "fire sprinkler",
      "automatic sprinkler",
      "waterflow",
      "hazard classification",
      "design density",
    ],
    isDefault: true,
  },
  {
    id: "iecc-2021-commentary",
    familyId: "iecc",
    familyLabel: "Energy Conservation Code",
    codeLabel: "IECC",
    name: "International Energy Conservation Code Commentary",
    edition: "2021",
    optionLabel: "2021 IECC Commentary",
    indexPath: "data/code/index/iecc-2021-commentary.json",
    pdfUrl: "/code-pdf/iecc-2021-commentary.pdf",
    aliases: [
      "iecc",
      "energy conservation",
      "energy code",
      "building envelope",
      "insulation",
      "air leakage",
      "lighting power",
      "commercial energy",
      "residential energy",
    ],
    isDefault: true,
  },
  {
    id: "ifgc-2021-commentary",
    familyId: "ifgc",
    familyLabel: "Fuel Gas Code",
    codeLabel: "IFGC",
    name: "International Fuel Gas Code Commentary",
    edition: "2021",
    optionLabel: "2021 IFGC Commentary",
    indexPath: "data/code/index/ifgc-2021-commentary.json",
    pdfUrl: "/code-pdf/ifgc-2021-commentary.pdf",
    aliases: [
      "ifgc",
      "fuel gas",
      "gas piping",
      "gas appliance",
      "combustion air",
      "venting",
      "gas pressure",
      "fuel-fired",
    ],
    isDefault: true,
  },
  {
    id: "imc-2021-commentary",
    familyId: "imc",
    familyLabel: "Mechanical Code",
    codeLabel: "IMC",
    name: "International Mechanical Code Commentary",
    edition: "2021",
    optionLabel: "2021 IMC Commentary",
    indexPath: "data/code/index/imc-2021-commentary.json",
    pdfUrl: "/code-pdf/imc-2021-commentary.pdf",
    aliases: [
      "imc",
      "mechanical code",
      "mechanical",
      "hvac",
      "ventilation",
      "duct",
      "exhaust",
      "grease duct",
      "dryer exhaust",
    ],
    isDefault: true,
  },
  {
    id: "ipc-2021-commentary",
    familyId: "ipc",
    familyLabel: "Plumbing Code",
    codeLabel: "IPC",
    name: "International Plumbing Code Commentary",
    edition: "2021",
    optionLabel: "2021 IPC Commentary",
    indexPath: "data/code/index/ipc-2021-commentary.json",
    pdfUrl: "/code-pdf/ipc-2021-commentary.pdf",
    aliases: [
      "ipc",
      "plumbing code",
      "plumbing",
      "drainage",
      "sanitary",
      "water supply",
      "fixture",
      "trap",
      "vent stack",
      "backflow",
    ],
    isDefault: true,
  },
  {
    id: "ashrae-90-1-2019",
    familyId: "ashrae-90-1",
    familyLabel: "ASHRAE 90.1",
    codeLabel: "ASHRAE 90.1",
    name: "Energy Standard for Buildings Except Low-Rise Residential Buildings",
    edition: "2019",
    optionLabel: "2019 ASHRAE 90.1",
    indexPath: "data/code/index/ashrae-90-1-2019.json",
    pdfUrl: "/code-pdf/ashrae-90-1-2019.pdf",
    aliases: [
      "ashrae 90.1",
      "90.1",
      "energy standard",
      "building envelope",
      "lighting power",
      "hvac efficiency",
      "low-rise residential",
    ],
    isDefault: true,
  },
  {
    id: "ashrae-90-1-2016",
    familyId: "ashrae-90-1",
    familyLabel: "ASHRAE 90.1",
    codeLabel: "ASHRAE 90.1",
    name: "Energy Standard for Buildings Except Low-Rise Residential Buildings",
    edition: "2016",
    optionLabel: "2016 ASHRAE 90.1",
    indexPath: "data/code/index/ashrae-90-1-2016.json",
    pdfUrl: "/code-pdf/ashrae-90-1-2016.pdf",
    aliases: [
      "ashrae 90.1",
      "90.1",
      "energy standard",
      "building envelope",
      "lighting power",
      "hvac efficiency",
      "low-rise residential",
    ],
  },
  {
    id: "asme-elevator-uploaded",
    familyId: "asme-elevator",
    familyLabel: "Elevator Code",
    codeLabel: "ASME Elevator",
    name: "ASME Elevator Code",
    edition: "Uploaded PDF",
    optionLabel: "Uploaded ASME Elevator PDF",
    indexPath: "data/code/index/asme-elevator-uploaded.json",
    pdfUrl: "/code-pdf/asme-elevator-uploaded.pdf",
    aliases: [
      "asme elevator",
      "elevator code",
      "elevator",
      "escalator",
      "lift",
      "hoistway",
      "machine room",
      "car enclosure",
    ],
    isDefault: true,
  },
] satisfies CodeDocument[];

export const CODE_FAMILIES = Array.from(
  CODE_DOCUMENTS.reduce((families, document) => {
    if (!families.has(document.familyId)) {
      families.set(document.familyId, {
        id: document.familyId,
        label: document.familyLabel,
      });
    }

    return families;
  }, new Map<string, CodeFamily>()).values(),
);

export const DEFAULT_CODE_SELECTIONS = CODE_FAMILIES.reduce<Record<string, string>>(
  (selections, family) => {
    const documents = getCodeDocumentsByFamily(family.id);
    const defaultDocument =
      documents.find((document) => document.isDefault) ?? documents[0];

    if (defaultDocument) {
      selections[family.id] = defaultDocument.id;
    }

    return selections;
  },
  {},
);

export function getCodeDocument(documentId: string): CodeDocument | null {
  return CODE_DOCUMENTS.find((document) => document.id === documentId) ?? null;
}

export function buildCodeDocumentViewerUrl(documentId: string) {
  return `/sources/${encodeURIComponent(documentId)}`;
}

export function buildCodeSourceUrl(documentId: string, locator: string) {
  return `${buildCodeDocumentViewerUrl(documentId)}/${encodeURIComponent(locator)}`;
}

export function getCodeDocumentsByFamily(familyId: string): CodeDocument[] {
  return CODE_DOCUMENTS.filter((document) => document.familyId === familyId);
}

export function getCodeDocumentLabel(document: Pick<CodeDocument, "codeLabel" | "edition">) {
  return `${document.codeLabel} ${document.edition}`.trim();
}

export function normalizeCodeSelections(value: unknown) {
  const selections = { ...DEFAULT_CODE_SELECTIONS };

  if (!value || typeof value !== "object") {
    return selections;
  }

  Object.entries(value as Record<string, unknown>).forEach(
    ([familyId, documentId]) => {
      if (typeof documentId !== "string") {
        return;
      }

      const document = getCodeDocument(documentId);

      if (document?.familyId === familyId) {
        selections[familyId] = document.id;
      }
    },
  );

  return selections;
}

export function getSelectedCodeDocuments(selections: unknown) {
  const normalizedSelections = normalizeCodeSelections(selections);

  return CODE_FAMILIES.map((family) => {
    const selectedDocument = getCodeDocument(normalizedSelections[family.id]);
    return selectedDocument ?? getCodeDocumentsByFamily(family.id)[0] ?? null;
  }).filter((document): document is CodeDocument => document !== null);
}
