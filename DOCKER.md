# Docker Runtime Guide

Canonical runtime and deployment reference for this repository.
Project overview and high-level onboarding: `README.md`.

## Prerequisites

- Docker
- Docker Compose

## Local Development (Docker Compose)

### 1. Configure `.env`

Create `.env` in repo root:

```bash
SOURCE_DIR=/path/to/your/photos
PHOTOS_DIR=/path/to/your/photos_out
```

Use absolute host paths.

### 2. Prepare folders

```bash
mkdir -p /path/to/your/photos /path/to/your/photos_out
```

Put source images in `SOURCE_DIR`.

### 3. Start services

```bash
docker compose up -d --build
```

This starts:

- `nginx` (port `8080`)
- `frontend` (Vite, port `5173`)
- `api` (port `3000`)
- `mongo`

### 4. Run ingestion

```bash
docker compose run --rm ingest
```

Inside the ingest container:

- `SOURCE_DIR=/source`
- `PHOTOS_DIR=/photos`

Mapped from host:

- `${SOURCE_DIR}` -> `/source` (read-only)
- `${PHOTOS_DIR}` -> `/photos` (read-write)

### 5. Access URLs

- Main app (through Nginx): `http://localhost:8080`
- Optional direct Vite dev server: `http://localhost:5173`
- API through Nginx: `http://localhost:8080/api`

## Data and Mount Flow

- Source photos are read from host `SOURCE_DIR`.
- Ingest copies/normalizes files into host `PHOTOS_DIR`.
- Nginx serves photos from `PHOTOS_DIR` at `/fotos/`.
- Mongo data is persisted in the `mongo-data` Docker volume.

## Production (Current Setup)

Current production path is:

- host-managed Nginx for static/proxy concerns
- `docker-compose.prod.yml` for backend services

### Start production services

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This compose file includes only:

- `api`
- `mongo`
- `ingest`

There is no Nginx service in `docker-compose.prod.yml`.

### API exposure in production compose

- `api` is bound to `127.0.0.1:3000:3000`
- Host Nginx is expected to proxy to `http://127.0.0.1:3000`

### Reindex photos in production

```bash
docker compose -f docker-compose.prod.yml run --rm ingest
```

Ensure host folders for `SOURCE_DIR` and `PHOTOS_DIR` exist and are mounted correctly before running ingest.

## Notes

- The active photos collection is `photos`.
- `Dockerfile.nginx` is not part of the currently documented production flow.

