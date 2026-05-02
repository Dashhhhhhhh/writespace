# NEC Chat

A Next.js chat interface for asking questions about NFPA 70, the National
Electrical Code. The app answers from a local licensed NEC retrieval index and
returns section citations with each supported answer.

## Requirements

- Node.js 22
- `OPENAI_API_KEY`
- A licensed NEC text source supplied locally. Do not commit copyrighted NEC
  source text or generated indexes.

## Local setup

```bash
npm install
```

Place licensed source at:

```text
data/nec/source/nec-2023.txt
```

The indexer accepts a `.pdf` source when `pdftotext` is installed, or a plain
text source shaped like:

```text
210.8 Ground-Fault Circuit-Interrupter Protection for Personnel
Section text...
```

Build the local index:

```bash
NEC_EDITION=2023 NEC_SOURCE_PATH="/path/to/2023 nec.pdf" npm run index:nec
```

Run the app:

```bash
OPENAI_API_KEY=... npm run dev
```

## Environment

- `OPENAI_API_KEY`: required for `/api/chat`
- `OPENAI_MODEL`: optional, defaults to `gpt-4.1`
- `NEC_EDITION`: optional, defaults to `2023`
- `NEC_SOURCE_PATH`: optional source path for `npm run index:nec`
- `NEC_INDEX_PATH`: optional local index path for both indexing and chat retrieval
- `NEC_INDEX_URL`: optional HTTPS URL for the generated index in deployed/serverless environments
- `NEC_INDEX_BEARER_TOKEN`: optional bearer token sent when fetching `NEC_INDEX_URL`

By default, chat loads `data/nec/index/nec-2023.json`. The repository ignores
that generated index so it is not pushed to git. The included `.vercelignore`
allows Vercel CLI deployments to upload the generated index while continuing to
exclude licensed source PDFs and secrets.

## API

`POST /api/chat`

```json
{
  "edition": "2023",
  "messages": [
    { "role": "user", "content": "Where is GFCI required in dwelling kitchens?" }
  ]
}
```

Response:

```json
{
  "answer": "Answer text with NEC section references.",
  "citations": [
    { "edition": "2023", "section": "210.8(A)", "title": "..." }
  ]
}
```

## Deployment

Deploy on Vercel or another Node-capable host. GitHub Pages is not suitable for
this app because the chat route needs server-side secrets and access to the
licensed retrieval index.

For Vercel, either deploy from a workspace containing
`data/nec/index/nec-2023.json`, or set these project environment variables to
fetch the index from private storage:

```text
OPENAI_API_KEY=...
NEC_EDITION=2023
NEC_INDEX_URL=https://your-private-storage.example/nec-2023.json # optional
NEC_INDEX_BEARER_TOKEN=... # optional, only with NEC_INDEX_URL
```

After changing environment variables, redeploy the project.
