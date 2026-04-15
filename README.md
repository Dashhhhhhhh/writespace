# Next.js GitHub Pages starter

This repository is configured to build a static Next.js site and deploy it to
GitHub Pages with GitHub Actions.

## Local development

```bash
npm install
npm run dev
```

## Deployment

1. Push this repository to GitHub.
2. In the repository settings, enable GitHub Pages and set the source to
   **GitHub Actions**.
3. Push to the `main` branch to trigger deployment.

The Next.js config derives the correct base path automatically on GitHub
Actions:

- `https://username.github.io/` repos deploy without a base path
- project repos deploy under `/<repo-name>/`
