# WHS Code Lookup

A Next.js chat interface for asking questions across selected WHS code source
files. Each chat is locked to the source file the user selects, and answers cite the
matching file locator/page from the configured retrieval index.

## Requirements

- Node.js 22
- `OPENAI_API_KEY`
- Licensed source PDFs supplied locally. Do not commit copyrighted source PDFs
  or generated indexes.
- `pdftotext` for building indexes from PDFs.

## Local Setup

```bash
npm install
```

Build a source index:

```bash
CODE_DOCUMENT_ID=ipc-2021-commentary \
CODE_SOURCE_PATH="/path/to/2021_ipc_commentary_1st_ptg.pdf" \
npm run index:codes
```

The indexer writes `data/code/index/<document-id>.json` and copies the PDF to
`public/code-pdf/<document-id>.pdf` for the in-app source viewer. Both paths are
ignored by git.

The existing NEC section indexer is still available and writes to the shared
`data/code/index` folder:

```bash
NEC_EDITION=2023 NEC_SOURCE_PATH="/path/to/2023 nec.pdf" npm run index:nec
```

Run the app:

```bash
OPENAI_API_KEY=... npm run dev
```

Use `/settings` to choose the active version for each code family. In the chat
composer, choose the source file from the Source dropdown before asking. Follow-up
messages stay locked to that file.

## Environment

- `OPENAI_API_KEY`: required for `/api/chat`
- `OPENAI_MODEL`: optional, defaults to `gpt-4.1-mini`
- `OPENAI_TITLE_MODEL`: optional, defaults to `gpt-4.1-mini`
- `CODE_DOCUMENT_ID`: source id used by `npm run index:codes`
- `CODE_SOURCE_PATH`: source `.pdf` or `.txt` path used by `npm run index:codes`
- `CODE_INDEX_PATH`: optional output path for `npm run index:codes`
- `CODE_COPY_PDF`: set to `false` to skip copying PDFs into `public/code-pdf`
- `CODE_INDEX_BASE_URL`: optional HTTPS base URL for deployed JSON indexes
- `CODE_INDEX_URL_<DOCUMENT_ID>`: optional per-document HTTPS index URL, with
  non-alphanumeric id characters replaced by underscores and uppercased
- `CODE_INDEX_BEARER_TOKEN`: optional bearer token sent when fetching remote
  code indexes

## API

`POST /api/chat`

```json
{
  "documentId": "ipc-2021-commentary",
  "messages": [
    { "role": "user", "content": "How should plumbing vents terminate?" }
  ]
}
```

`documentId` is required. The browser sends the selected source file id for the
first message and keeps sending the same id on follow-up messages so the chat
stays file-specific.

## Deployment

Deploy on Vercel or another Node-capable host. GitHub Pages is not suitable
because the chat route needs server-side secrets and access to retrieval
indexes.

For Vercel, either deploy from a workspace containing generated indexes or set
`CODE_INDEX_BASE_URL` / `CODE_INDEX_URL_<DOCUMENT_ID>` to fetch indexes from
private storage. After changing environment variables, redeploy the project.
