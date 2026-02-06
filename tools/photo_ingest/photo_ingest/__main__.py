import errno
import os
import re
import sys
import shutil
from pathlib import Path

from pymongo import MongoClient


IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".webp",
    ".heic",
    ".heif",
}

# Pick the database from the client default or fallback env name.
def resolve_database(client: MongoClient):
    db = client.get_default_database()
    if db is not None:
        return db
    return client[os.getenv("MONGODB_DB", "concurso")]


# Extract a YYYY year from an 8-digit date inside a filename.
def extract_year(filename: str):
    for match in re.finditer(r"(?<!\d)(\d{8})(?!\d)", filename):
        year = int(match.group(1)[:4])
        if year >= 1970:
            return year
    return None

# Check if a file has a supported image extension.
def is_image_file(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTENSIONS

# Ask whether to drop the collection (supports non-interactive env).
def prompt_drop_collection() -> bool:
    env_value = os.getenv("DROP_COLLECTION")
    if env_value is not None:
        return env_value.strip().lower() in ("1", "true", "y", "yes")
    if not sys.stdin.isatty():
        print("Non-interactive session: keeping existing records by default.")
        return False
    prompt = "Delete existing database records before ingest? (y)es/(n)o: "
    i = 0
    while i < 2:
        response = input(prompt).strip().lower()
        if response in ("y", "yes"):
            return True
        if response in ("n", "no"):
            return False
        # Only print "Please respond with (y)es or (n)o" after the first invalid attempt to avoid cluttering the prompt.
        if i == 0:
            print("Please respond with (y)es or (n)o. (Default will count as (y)es)")
        i += 1
    return True

# Locate repo root by searching for common project markers.
def find_repo_root() -> Path:
    markers = ("docker-compose.yml", ".env", ".git")
    for start in (Path.cwd(), Path(__file__).resolve()):
        for parent in (start, *start.parents):
            if any((parent / marker).exists() for marker in markers):
                return parent
    return Path.cwd()

# Parse a simple .env file into a dict (no expansion).
def load_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    data: dict[str, str] = {}
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        data[key.strip()] = value.strip().strip('"')
    return data

# Quote/escape values for writing back into .env.
def format_env_value(value: str) -> str:
    if value == "":
        return '""'
    if re.search(r'\s|#|"', value):
        return '"' + value.replace('"', '\\"') + '"'
    return value

# Merge updates into .env, preserving existing lines when possible.
def update_dotenv_file(path: Path, updates: dict[str, str]) -> None:
    lines: list[str] = []
    if path.exists():
        lines = path.read_text().splitlines()
    else:
        lines = [
            "# Local environment overrides",
        ]

    seen = set()
    updated_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            updated_lines.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in updates:
            updated_lines.append(f"{key}={format_env_value(updates[key])}")
            seen.add(key)
        else:
            updated_lines.append(line)

    for key, value in updates.items():
        if key not in seen:
            updated_lines.append(f"{key}={format_env_value(value)}")

    path.write_text("\n".join(updated_lines) + "\n")

# Normalize a user-provided path to an absolute Path.
def normalize_path(value: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    return path

# Check if a path can be created or written to.
def can_create_path(path: Path) -> bool:
    if path.exists():
        return os.access(path, os.W_OK | os.X_OK)
    return os.access(path.parent, os.W_OK | os.X_OK)

# Choose a default base directory with a writable fallback.
def default_photos_base_dir() -> Path:
    preferred = Path("/var/lib/concurso")
    if os.name != "nt" and can_create_path(preferred):
        return preferred
    return Path.home() / "concurso"

# Ensure a directory exists and is usable; report errors.
def ensure_directory(path: Path, label: str) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
    except PermissionError as exc:
        print(f"Permission error creating {label} at {path}: {exc}", file=sys.stderr)
        return False
    except OSError as exc:
        print(f"Failed to create {label} at {path}: {exc}", file=sys.stderr)
        return False
    if not path.is_dir():
        print(f"{label} is not a directory: {path}", file=sys.stderr)
        return False
    return True

# Prompt the user for a path, falling back to a default.
def prompt_for_path(var_name: str, default_path: Path) -> Path | None:
    attempts = 0
    while attempts < 3:
        response = input(f"{var_name} [default: {default_path}]: ").strip()
        chosen = default_path if response == "" else normalize_path(response)
        if ensure_directory(chosen, var_name):
            return chosen
        print(f"Please provide a different path for {var_name}.")
        attempts += 1
    return None

# Resolve PHOTOS_DIR, prompting if needed.
def resolve_photos_dir() -> Path | None:
    repo_root = find_repo_root()
    dotenv_path = repo_root / ".env"
    dotenv_values = load_dotenv(dotenv_path)

    source_value = os.getenv("PHOTOS_DIR") or dotenv_values.get("PHOTOS_DIR")
    updates: dict[str, str] = {}

    if not source_value:
        if not sys.stdin.isatty():
            print(
                "PHOTOS_DIR is required. Define it in the environment or in .env.",
                file=sys.stderr,
            )
            return None

        base_dir = default_photos_base_dir()
        default_source = base_dir / "fotos"

        if not source_value:
            chosen = prompt_for_path("PHOTOS_DIR", default_source)
            if chosen is None:
                return None
            source_value = str(chosen)
            updates["PHOTOS_DIR"] = source_value

        if updates:
            try:
                update_dotenv_file(dotenv_path, updates)
                print(f"Saved settings to {dotenv_path}")
            except OSError as exc:
                print(f"Warning: failed to write {dotenv_path}: {exc}", file=sys.stderr)

    source_dir = normalize_path(source_value)
    if not ensure_directory(source_dir, "PHOTOS_DIR"):
        return None
    return source_dir

# Yield files from a source directory, sorted for stability.
def iter_files(source_dir: Path):
    return (path for path in sorted(source_dir.rglob("*")) if path.is_file())

# Determine whether a path is a mount point (e.g., bind-mounted volume).
def is_mount_point(path: Path) -> bool:
    return os.path.ismount(path)

# Remove all contents of a directory, optionally keeping some paths.
def clear_directory(path: Path, keep: set[Path] | None = None) -> None:
    keep = keep or set()
    for child in path.iterdir():
        if child in keep:
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


# Main ingest flow: resolve dirs, ingest files, update DB.
def main() -> int:
    source_dir = resolve_photos_dir()
    if source_dir is None:
        return 1

    print(f"PHOTOS_DIR: {source_dir}")

    use_in_place = is_mount_point(source_dir)
    if use_in_place:
        temp_dir = source_dir / f".{source_dir.name}_tmp"
    else:
        temp_dir = source_dir.with_name(f"{source_dir.name}_tmp")

    if temp_dir.exists():
        print(f"Cleaning existing temp directory: {temp_dir}")
        shutil.rmtree(temp_dir)

    # Gather files to ingest (including files inside city-named folders).
    files = list(iter_files(source_dir))
    if not files:
        print(f"No files found in {source_dir}")
        return 0

    if not ensure_directory(temp_dir, "TEMP_PHOTOS_DIR"):
        return 1

    # Build documents for valid image files and prune non-image files.
    docs = []
    images_found = 0
    try:
        for file_path in files:
            if not is_image_file(file_path):
                print(f"Skipping non-image file: {file_path.name}")
                continue
            images_found += 1

            doc = {}
            relative_parts = file_path.relative_to(source_dir).parts
            city = None
            if len(relative_parts) >= 2 and file_path.parent.parent == source_dir:
                city = relative_parts[0]
                doc["city"] = city

            extracted_year = extract_year(file_path.name)
            if extracted_year is not None:
                doc["year"] = extracted_year

            new_name = file_path.name
            target_path = temp_dir / new_name
            if target_path.exists():
                print(f"Overwriting existing file: {target_path.name}")
            shutil.copy2(file_path, target_path)

            doc["name"] = new_name
            docs.append(doc)

        if images_found == 0:
            print("No image files found; PHOTOS_DIR will be replaced with an empty folder.")

        # Connect to MongoDB and select the target collection.
        mongo_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/concurso")
        client = MongoClient(mongo_uri)
        db = resolve_database(client)
        collection_name = os.getenv("PHOTOS_COLLECTION", "photos")
        collection = db[collection_name]
        drop_collection = prompt_drop_collection()

        if drop_collection:
            print(f"Dropping collection: {collection_name}")
            collection.drop()
        else:
            print(f"Appending to collection: {collection_name}")

        # Insert the documents if any were created.
        if docs:
            result = collection.insert_many(docs)
            print(f"Inserted {len(result.inserted_ids)} photos into {collection_name}.")

        if use_in_place:
            # Bind-mounted directories cannot be renamed; swap contents in place.
            clear_directory(source_dir, keep={temp_dir})
            for child in temp_dir.iterdir():
                shutil.move(str(child), source_dir / child.name)
            shutil.rmtree(temp_dir)
        else:
            # Swap directories on the same filesystem, restoring on failure.
            backup_dir = source_dir.with_name(f"{source_dir.name}_old")
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
            try:
                source_dir.rename(backup_dir)
                temp_dir.rename(source_dir)
            except OSError as exc:
                if exc.errno in (errno.EBUSY, errno.EXDEV):
                    clear_directory(source_dir)
                    for child in temp_dir.iterdir():
                        shutil.move(str(child), source_dir / child.name)
                    shutil.rmtree(temp_dir)
                else:
                    if not source_dir.exists() and backup_dir.exists():
                        backup_dir.rename(source_dir)
                    if temp_dir.exists():
                        shutil.rmtree(temp_dir)
                    raise
            else:
                if backup_dir.exists():
                    shutil.rmtree(backup_dir)
    except Exception as exc:
        print(f"Error during ingest: {exc}", file=sys.stderr)
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
