"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CODE_FAMILIES,
  CODE_SETTINGS_STORAGE_KEY,
  DEFAULT_CODE_SELECTIONS,
  getCodeDocumentsByFamily,
  normalizeCodeSelections,
} from "../../lib/code-catalog";

export default function SettingsPage() {
  const [selections, setSelections] = useState(DEFAULT_CODE_SELECTIONS);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const storedSettings = window.localStorage.getItem(CODE_SETTINGS_STORAGE_KEY);

    if (storedSettings) {
      try {
        setSelections(normalizeCodeSelections(JSON.parse(storedSettings)));
      } catch {
        setSelections(DEFAULT_CODE_SELECTIONS);
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(
      CODE_SETTINGS_STORAGE_KEY,
      JSON.stringify(selections),
    );
  }, [isHydrated, selections]);

  function handleSelection(familyId: string, documentId: string) {
    setSelections((currentSelections) =>
      normalizeCodeSelections({
        ...currentSelections,
        [familyId]: documentId,
      }),
    );
  }

  function handleReset() {
    setSelections(DEFAULT_CODE_SELECTIONS);
  }

  return (
    <main className="settings-shell">
      <section className="settings-panel">
        <header className="settings-header">
          <div className="brand-block">
            <div>
              <h1>Settings</h1>
              <span>Source versions</span>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={handleReset}
            >
              Reset
            </button>
            <Link className="secondary-link" href="/">
              Chat
            </Link>
          </div>
        </header>

        <div className="settings-list" aria-label="Source version settings">
          {CODE_FAMILIES.map((family) => {
            const documents = getCodeDocumentsByFamily(family.id);
            const selectedDocumentId =
              selections[family.id] ?? documents[0]?.id ?? "";

            return (
              <label className="settings-row" key={family.id}>
                <span>
                  <strong>{family.label}</strong>
                  <small>{documents[0]?.codeLabel ?? family.label}</small>
                </span>
                <select
                  value={selectedDocumentId}
                  onChange={(event) =>
                    handleSelection(family.id, event.target.value)
                  }
                >
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.optionLabel}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </section>
    </main>
  );
}
