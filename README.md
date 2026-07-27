# Couple Spending

Offline-first shared spending tracker for two-person households.

## Local development

```bash
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm install
npm run dev
```

Production builds run with `npm run build`. Local checks are `npm test` and
`npm run lint`.

## MVP deployment

The `main` branch deploys automatically to GitHub Pages through
`.github/workflows/deploy-pages.yml`. The deployment requires these GitHub
repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The production site path is `/couple-spending/`; the workflow sets the Vite
base path and creates the SPA fallback required by GitHub Pages.
