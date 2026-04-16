# WriteSpace Whiteboard

A static Next.js whiteboard for quick sketch notes on GitHub Pages.

## Features

- Freehand drawing with pen and eraser tools
- Adjustable brush size and color palette
- Multiple saved notes stored in browser `localStorage`
- Snapshot copies for versioning a board before edits
- PNG export for sharing or archiving a board
- Static export configured for GitHub Pages under `/writespace/`

## Local development

```bash
npm install
npm run dev
```

## Production export

```bash
npm run build
```

The repository already includes a GitHub Actions workflow that publishes the
static `out/` export to GitHub Pages when `main` is pushed.
