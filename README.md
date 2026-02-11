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

## Documentation Map

- Full local Docker and production runtime guide: `DOCKER.md`
- Frontend-only Vite details: `static/README.md`

## Project Structure

- `server/`: API, routes, and Mongo models
- `static/`: frontend app
- `tools/photo_ingest/`: ingestion utility
