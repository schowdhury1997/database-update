# Database Update

A macOS desktop application for condensing large (80+ GB) MySQL dump files by selectively removing INSERT data for specific tables, then optionally importing the result into a local Dockerized MySQL instance. Can also download `.sql.gz` dump files directly from AWS S3.

Built with **Tauri v2** (Rust backend + React/TypeScript frontend) for native performance with a modern dark-themed UI.

## Prerequisites

- **Rust** (via [rustup](https://rustup.rs/))
- **Node.js** v18+ (via [nvm](https://github.com/nvm-sh/nvm) recommended)
- **Docker Desktop** (for MySQL import functionality)
- **pv** (`brew install pv`) — used for import progress tracking
- **AWS CLI** (optional, for configuring AWS credentials)

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd database-update

# Install frontend dependencies
npm install
```

### AWS Configuration (for S3 downloads)

Configure AWS credentials using one of two methods:

**Option 1: `.env` file** (takes priority)

Create `~/Library/Application Support/database-update/.env`:
```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJalrX...
AWS_REGION=us-east-1
```

**Option 2: AWS profiles**

Configure via `~/.aws/credentials` using the AWS CLI:
```bash
aws configure --profile myprofile
```

## Running in Development

```bash
npm run tauri dev
```

This starts both the Vite dev server (frontend HMR) and the Rust backend.

## Building for Distribution

```bash
npm run tauri build
```

Produces a `.app` bundle in `src-tauri/target/release/bundle/macos/`.

## Usage

### Selecting a Source File

- **Local file**: Click "Select SQL File" to pick a `.sql` dump file
- **S3 download**: Enter an S3 URI (e.g., `s3://bucket/path/file.sql.gz`), select your AWS profile, and click "Download & Process"

### Configuring Tables

After scanning, you'll see all tables with their estimated sizes and row counts:

- **Checked** = include all INSERT data (default)
- **Unchecked** = exclude INSERT data (DDL is always kept)
- **Row limit** = keep only the last N rows (rolling buffer from end of dump)
- **FK-locked** (lock icon) = automatically included because another checked table has a foreign key dependency on it

### Condensing and Importing

- **Condense Only**: Creates a condensed `.sql` file
- **Run SQL Only**: Imports any `.sql` file into Docker MySQL (not limited to condensed files)
- **Condense & Run**: Condenses then imports in one step

### Templates

Save your table configurations as reusable templates. Templates store:
- Table inclusion/exclusion settings and row limits
- Database name, Docker Compose path, service name
- S3 URI and AWS profile (for scheduled downloads)

Export/import templates as JSON to share with team members.

### Scheduling

Schedule automated runs using macOS `launchd`:
- **Daily** or **Weekly** recurring tasks
- **One-time** scheduled runs
- Full pipeline support: S3 Download -> Extract -> Condense -> Import

Scheduled tasks run without the app open and send macOS notifications on completion.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Docker not running | Start Docker Desktop |
| `pv` not installed | `brew install pv` |
| AWS credentials invalid | Check `.env` file at `~/Library/Application Support/database-update/.env` or run `aws configure` |
| S3 access denied | Verify your credentials have `s3:GetObject` permission on the bucket |
| Container not found | Ensure MySQL container is running: `docker compose up -d mysql` |

## Architecture

- **Backend**: Rust (via Tauri) — streaming file processing, S3 downloads, gzip extraction
- **Frontend**: React + TypeScript + Tailwind CSS — dark-themed UI
- **Performance**: Streams 80GB+ files with <100MB memory usage

## Future Enhancements

- Direct MySQL connection support (host/port/user/password, non-Docker)
- Parallel condensing via memory-mapped file sections
- Incremental schema update detection
- S3 bucket browsing
