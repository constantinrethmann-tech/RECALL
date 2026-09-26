# RECALL

Personal spaced-repetition flashcards (FSRS, like Anki), with pictures, synced between iPhone and laptop.
Installs as an app: Safari → Add to Home Screen on iPhone, Chrome/Edge → Install on Windows.
See [SPEC.md](SPEC.md) for what it does and the build phases.

- **App:** Next.js (static export) + TypeScript + Tailwind, hosted on GitHub Pages
- **Data:** Supabase (database, sign-in by email code, private picture storage). Row-level security: only you can see your data.
- **Scheduling:** [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (default parameters, learning steps 1m/10m, fuzz on)

## Run it on the laptop

Needs Node.js 24.

```bash
npm install
npm run dev
```

Open http://localhost:3000/recall/. `/recall/dev/review/` shows the review screen with sample cards and no database.

Other commands: `npm test` (logic tests), `npm run lint`, `npm run build` (static site in `out/`),
`npm run icons` (redraw app icons), `npm run sample` (rebuild `samples/recall-sample.zip`).

## Settings

`.env` holds the public settings (Supabase URL + publishable key, base path `/recall`). They are safe to commit:
they end up in the public website anyway, and your data is protected by row-level security, not by them.
Never commit the Supabase secret/service_role key or the database password; real secrets would go in
`.env.local`, which git ignores.

## Deploy

Every push to `main` builds and publishes the site through GitHub Actions
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) to https://constantinrethmann-tech.github.io/recall/.
One-time: repo **Settings → Pages → Source: GitHub Actions**.

## Database

Run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) once in Supabase → SQL Editor.
Sign-in email templates: [supabase/email-templates.md](supabase/email-templates.md).
Supabase → Authentication → URL Configuration: Site URL `https://constantinrethmann-tech.github.io/recall`,
Redirect URLs `https://constantinrethmann-tech.github.io/recall/**` and `http://localhost:3000/**`.

## Import format

A `.zip` with `cards.json` (format `recall-v1`, see SPEC.md) and an `images/` folder. Re-importing a card with
the same `id` updates its text and pictures but keeps its review progress. Pictures are shrunk to 1600px and stored
once even if they appear on several cards.
