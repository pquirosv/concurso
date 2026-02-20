# Repository Guidelines

## Project Structure & Module Organization
- `server/`: Express API (`index.js`), routes in `server/routes/`, controllers in `server/controllers/`, Mongo helpers/models in `server/database.js` and `server/models/`.
- `static/`: Vue 3 + TypeScript frontend (`src/App.vue`, `src/main.ts`) built with Vite.
- `tools/photo_ingest/`: Python ingest utility (`photo_ingest/__main__.py`) that scans image folders, resizes photos, and writes metadata to MongoDB.
- Root runtime files: `docker-compose.yml`, `docker-compose.prod.yml`, `nginx.conf`, `README.md`, `DOCKER.md`.

## Build, Test, and Development Commands
- API dev server: `npm run dev` (runs `nodemon server/index.js` on port `3000`).
- Frontend dev server: `cd static && npm run dev` (Vite on `5173`).
- Frontend production build: `cd static && npm run build` (type-check + bundle to `static/dist`).
- Full local stack: `docker compose up -d --build` (nginx + frontend + api + mongo).
- Ingest photos: `docker compose run --rm ingest`.
- Production compose (backend services): `docker compose -f docker-compose.prod.yml up -d --build`.

## Coding Style & Naming Conventions
- Comment every function explaining what the function does in one line.
- Make it simple, also check if there are redundancies or code that is not used in order to delete it.
- Classes and layers as simple as possible that fullfil one specific function. Examples: separate business logic and controllers, one different class for pagination, etc.
- Match existing style: CommonJS in backend JS, Vue `<script setup>` in frontend, typed Python in ingest tool.
- Frontend CSS rule: unless strictly necessary, keep styles in `static/src/style.css` and avoid local `<style>` blocks inside `.vue` files.
- Use 2-space indentation for JS/TS/Vue and 4 spaces for Python.
- Prefer descriptive camelCase for variables/functions and kebab-case for file names where already used.
- Keep API route/controller naming aligned (`getYearPhoto`, `getCityPhoto`, etc.).
- Run `cd static && npm run build` before opening a PR to catch TS/Vue issues.

## Testing Guidelines
- Create tests for every new feature added even if the user don't ask for it.
- Validate changes with targeted manual checks on API endpoints under `/api/*` (for example `/api/year`, `/api/city`, `/api/photos/count`).
- Validate frontend quiz flow at `http://localhost:8080`.
- Validate ingest with a small sample via `docker compose run --rm ingest`.
- For new logic-heavy code, add tests when introducing a test framework.

## Commit & Pull Request Guidelines
- Commit messages in history are short, imperative, and scoped when useful (examples: `fix Markdown files`, `feat(db): add MongoDB indexes...`).
- Prefer: `<type>(optional-scope): concise summary` or a concise imperative sentence.
- PRs should include what changed and why.
- PRs should include manual verification steps/commands.
- PRs should include a linked issue when applicable.
- PRs should include screenshots for frontend/UI changes.

## Security & Configuration Tips
- Never commit secrets; keep environment values in local `.env`.
- `SOURCE_DIR` and `PHOTOS_DIR` must be absolute host paths and should exist before running ingest/compose workflows.

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file.

### Available skills
- vue: Use when editing `.vue` files, creating Vue 3 components/composables, or testing Vue code. (file: .agents/skills/vue/SKILL.md). There are a lot of references in .agents/skills/vue/references/.
