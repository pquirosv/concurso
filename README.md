# Photo Contest

Photo quiz application where players guess a photo by **year** or **city**. The project includes:

- API: Node.js + Express + MongoDB
- Frontend: Vue + Vite
- Ingest tool: Python script to import photos and metadata

## Quick Start (Docker Compose)

1. Clone the repository and enter it:
```bash
git clone <your-repo-url>
cd concurso
```

2. Create `.env` with absolute host paths:
```bash
SOURCE_DIR=/path/to/your/photos
PHOTOS_DIR=/path/to/your/photos_out
SESSION_COOKIE_SECRET=replace-with-a-long-random-secret
ADMIN_PASSWORD_HASH=replace-with-bcrypt-hash
CORS_ALLOWED_ORIGINS=your_web_page
```

3. Ensure both folders exist and place source images in `SOURCE_DIR`:
```bash
mkdir -p /path/to/your/photos /path/to/your/photos_out
```

4. Start the local stack:
```bash
docker compose up -d --build
```

5. Run ingestion (one-shot):
```bash
docker compose run --rm ingest
```

6. Open the app:
- `http://localhost:8080` (main entry through Nginx)

## Admin Authentication

- Admin UI routes:
  - `/admin/login`
  - `/admin` (protected)
- API auth endpoints:
  - `POST /api/admin/login`
  - `GET /api/admin/session`
  - `POST /api/admin/logout`


### Admin Photo API Contract

- Use Mongo `_id` as the only identity for edit/delete operations (`PATCH /api/admin/photos/:id`, `DELETE /api/admin/photos/:id`).
- Photo `name` is the immutable stored filename and cannot be changed through PATCH.
- Admin list/read/update responses include `_id` for table actions, while display fields remain `name`, `year`, and `city`.

Generate a bcrypt hash for `ADMIN_PASSWORD_HASH`:

```bash
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('your-admin-password', 10));"
```

`CORS_ALLOWED_ORIGINS` is the runtime allowlist (single value, comma-separated values, or list-style syntax like `['https://a.com','https://b.com']`).  
When `CORS_ALLOWED_ORIGINS` is empty or missing, the API falls back to hardcoded local origins (`http://localhost:8080` and `http://localhost:5173`).

Photo files must be served through `/api/photos/file/:name` so the API can enforce public/admin visibility. Do not expose `PHOTOS_DIR` directly from host Nginx with a `/fotos/` alias in production.

## Documentation Map

- Full local Docker and production runtime guide: [`DOCKER.md`](DOCKER.md)
- Frontend-only Vite details: [`static/README.md`](./static/README.md)

## Project Structure

- `server/`: API, routes, and Mongo models
- `static/`: frontend app
- `tools/photo_ingest/`: ingestion utility
