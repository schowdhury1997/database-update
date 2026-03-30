# Database Update - Development Guide

## What This Is

A macOS desktop app for condensing large (80+ GB) MySQL dump files by selectively removing INSERT data for specific tables, then optionally importing into a local Dockerized MySQL instance. Can download `.sql.gz` dumps from AWS S3. Built with **Tauri v2** (Rust backend + React/TypeScript frontend).

## Commands

```bash
npm run tauri dev      # Development with HMR (starts Vite + Rust)
npm run tauri build    # Production build (.app in src-tauri/target/release/bundle/macos/)
npx tsc --noEmit       # TypeScript type check only
cd src-tauri && cargo test   # Run Rust unit tests
cd src-tauri && cargo check  # Fast Rust compilation check
```

## Architecture

**Tauri v2** — Rust backend exposes commands via `#[tauri::command]`, frontend calls them with `invoke()`. Progress updates stream from Rust to React via Tauri events (`app.emit("progress", &event)`).

### Rust Backend (`src-tauri/src/`)

| Module | Purpose |
|--------|---------|
| `commands.rs` | All 20 `#[tauri::command]` handlers — the bridge layer between frontend and backend modules |
| `parser.rs` | mysqldump line classification (CREATE TABLE, INSERT INTO, LOCK/UNLOCK, FK detection) and tuple parsing state machine |
| `scanner.rs` | Full sequential scan of .sql files — extracts tables, columns, FKs, size/row estimates |
| `fk_graph.rs` | Directed FK dependency graph with transitive ancestor resolution |
| `condenser.rs` | Streaming condenser with rolling buffers for "last N rows" support |
| `extractor.rs` | Gzip decompression with progress tracking via CountingReader |
| `s3.rs` | S3 download with resume support, credential resolution (.env file priority, then AWS profile chain) |
| `docker.rs` | Pre-flight checks, Rust-streamed SQL import to Docker MySQL with progress tracking, definer override (`replace_definer`) |
| `templates.rs` | Template CRUD — JSON files in `~/Library/Application Support/database-update/templates/` |
| `scheduler.rs` | macOS launchd plist generation for scheduled tasks |
| `cli.rs` | CLI argument parsing for headless execution (used by scheduled tasks) |
| `progress.rs` | `ProgressTracker` — rate-limited event emission (every 2s or N bytes) |
| `error.rs` | `AppError` enum with `thiserror` + `Serialize` for frontend consumption |

### React Frontend (`src/`)

**State management**: App.tsx owns all navigation and pipeline state. No external state library — state flows down via props. Screen transitions are controlled by a single `screen` state variable of type `AppScreen`.

**Pages** (in `src/pages/`): Home, S3Download, Scanning, Configure, Execute, Templates, Schedules

**Components** (in `src/components/`): Layout (sidebar + content wrapper), Sidebar (icon nav), ProgressBar, TableRow, DatabaseConfig

**Hooks** (in `src/hooks/`): `useProgress` (listens to Tauri "progress" events), `useTauriCommand` (generic invoke wrapper), `useTemplates` (template CRUD)

## Key Business Logic

### Table Actions
Every table gets one of three actions during condensing:
- **IncludeAll** (default) — all INSERT data passes through unchanged
- **ExcludeData** — INSERT statements are dropped, DDL (CREATE TABLE) is kept
- **IncludeLastN(n)** — a rolling buffer keeps the last N tuples from the end of the dump

### FK Constraint Enforcement
When a user checks a table, all tables it transitively references via foreign keys are force-included with all rows (locked in UI with lock icon). The graph is built from `CONSTRAINT ... FOREIGN KEY ... REFERENCES` in CREATE TABLE blocks.

### Tuple Parsing State Machine
The most complex parsing logic. Splits `VALUES (a,'b'),(c,'d');` into individual tuples while handling: nested parentheses in strings, backslash escapes (`\'`), doubled-quote escapes (`''`), and `_binary` literals. Located in `parser.rs::parse_tuples()`.

### Credential Resolution
1. `.env` file at `~/Library/Application Support/database-update/.env` (priority)
2. AWS profile from `~/.aws/credentials` (user-selectable in UI)
3. If neither works, show clear error message

### Docker Import
Streams SQL file through Rust directly into `docker compose -f '{compose}' exec -T {service} mysql {database}` via piped stdin. Progress is tracked by bytes read from the file (no external dependencies like `pv`). MySQL stderr is captured in a dedicated thread and surfaced as warnings on success or included in error messages on failure. When no definer override is set, uses raw 8MB chunk streaming for maximum throughput; with definer override, streams line-by-line to apply replacements.

### Definer Override
Optionally replaces `DEFINER=`user`@`host`` in SQL views, triggers, and procedures during both condensing and direct import. Configured in the Docker Import Settings UI with user and host fields (defaults to `root@localhost`). Persisted in templates. The `replace_definer()` function in `docker.rs` handles the string replacement efficiently without regex.

## Style Guidelines

### UI Spacing — Critical Rule
**Always use explicit `style={{ }}` with pixel values for padding, margin, and gap.** Do NOT rely on Tailwind spacing utilities (`px-8`, `gap-3`, `py-4`, etc.) for layout spacing — they produce values that are too tight for this desktop app. Tailwind classes are fine for colors, borders, flexbox, rounded corners, transitions, and text styling.

Spacing reference values used throughout the app:
- Page header: `padding: 40px 48px 20px 48px`
- Content area horizontal padding: `48px`
- Card internal padding: `32px`
- Between form fields: `marginBottom: 24px`
- Between card list items: `gap: 14px`
- Button padding: `12px 24px`
- Tab buttons: `padding: 16px 20px` with `gap: 8px` between tabs
- Table rows: `padding: 12px 24px, gap: 18px`
- Input fields: `10px 14px` (set globally in CSS)

### Color System (defined in `src/styles/globals.css` via `@theme`)
- 4 background tiers: `bg-primary` (#1a1a1e) > `bg-secondary` (#222226) > `bg-tertiary` (#2a2a2e) > `bg-elevated` (#2e2e33)
- 3 text tiers: `text-primary` (bright) > `text-secondary` (muted) > `text-tertiary` (dim)
- Accent: `accent` (#4a9eff), Success: `success` (#3dd68c), Error: `error` (#f06060), Warning: `warning` (#f0c040)
- Muted semantic variants (`accent-muted`, `success-muted`, etc.) for subtle backgrounds

### Icons
Use `lucide-react` exclusively. Import individual icons. Typical sizes: 15-17px in buttons, 20-22px in cards/step indicators, 28-32px in empty states.

### Typography
- Page titles: `fontSize: 24, fontWeight: 600`
- Section headers: `fontSize: 16, fontWeight: 500`
- Body/buttons: `fontSize: 13-14`
- Labels: `fontSize: 12-13, fontWeight: 500`
- Mono text: class `mono` (SF Mono/Menlo, 12px) — used for file paths, table names, S3 URIs
- Category labels: `fontSize: 11`, uppercase, `tracking-wider`, `text-text-tertiary`

### Component Patterns
- Cards: `bg-bg-secondary rounded-xl border border-border-default` + padding via style
- Buttons (primary): `bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-sm`
- Buttons (secondary): `bg-bg-tertiary hover:bg-bg-hover border border-border-default rounded-lg text-text-secondary`
- Empty states: centered layout with 72px icon container, title, description text
- Hover-reveal actions: `opacity-0 group-hover:opacity-100 transition-opacity` on parent with `group` class
- Segmented controls: `bg-bg-tertiary rounded-lg` container with `bg-bg-elevated shadow-sm` for active segment

## Data Flow: Full Pipeline

```
S3 Download (.sql.gz) → Gzip Extract (.sql) → Scan (table/FK/size extraction)
→ User configures tables → Condense (streaming filter + optional definer override) → Docker Import (Rust-streamed to mysql)
```

Each phase emits `ProgressEvent` via Tauri events. Frontend listens with `useProgress` hook.

## File Persistence

All app data lives in `~/Library/Application Support/database-update/`:
- `templates/*.json` — saved table configurations
- `schedules.json` — scheduled task metadata
- `preferences.json` — download directory, recent files/URIs
- `.env` — optional AWS credentials (user-created)

## Adding a New Tauri Command

1. Implement the function in the appropriate Rust module
2. Add the `#[tauri::command]` wrapper in `commands.rs`
3. Register it in the `generate_handler![]` macro in `lib.rs`
4. Add the TypeScript types in `src/types/index.ts`
5. Call with `invoke<ReturnType>("command_name", { params })` from React

## Test File

`trekker_prod-2025-12-17.sql` (~54MB, ~80 tables) is a reference mysqldump used for testing. It contains FKs, `_binary` literals, views, conditional comments, and long INSERT lines.
