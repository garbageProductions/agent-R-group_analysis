# UX Enhancement Package — Design Spec
**Date:** 2026-03-17
**Status:** Draft

## Overview

Four independent features that collectively make the pipeline more durable, more informative during the upload/config steps, and more interactive. They share no runtime dependencies and can be built and shipped in phases.

**Features:**
1. HTML Report Persistence — every pipeline run saved to `data/reports/`
2. SAR Data Input Pathway — separate activity CSV upload + config-page warning
3. Collapsible Data Side Panel — molecule table always accessible
4. Mol\* 3D Viewer — interactive WebGL viewer on UploadPage

---

## 1. HTML Report Persistence

### Goal
Every completed analysis auto-saves a fully self-contained HTML document to `data/reports/<session_id>.html`. Users can download it or browse history. Reports work offline with no external dependencies.

### Backend

**New file: `backend/utils/report_generator.py`**
- Class `ReportGenerator` with single public method `generate(session_data: dict, results: dict) -> str`
- Output: a single HTML string with all assets inlined
- Sections included:
  - Header: session ID, timestamp, molecule count, format
  - Molecule grid: SVGs rendered via RDKit, embedded as inline SVG strings
  - Dataset stats: property columns, value distributions (simple inline `<table>`)
  - R-group decomposition: core SMARTS, frequency table
  - MMP transforms: top transforms table
  - Activity cliffs: cliff pairs table with SALI scores
  - Generative results (if present): top molecules + iteration history
  - All styling via a single inline `<style>` block — dark theme, no CDN
- SVGs are re-generated at report time (not cached from session) at 200×160

**Modified: `backend/api/routes/analyze.py`**
- After setting `_results[sid] = {"status": "complete", "results": pipeline_results}`, call:
  ```python
  from backend.utils.report_generator import ReportGenerator
  from pathlib import Path
  reports_dir = Path("data/reports")
  reports_dir.mkdir(parents=True, exist_ok=True)
  html = ReportGenerator().generate(session_data, pipeline_results)
  (reports_dir / f"{sid}.html").write_text(html, encoding="utf-8")
  ```
- Failure to write the report must NOT fail the analysis — wrap in `try/except` with a log warning.

**New file: `backend/api/routes/reports.py`**
- Router prefix: `/reports`
- `GET /reports/` — list all reports:
  - Scans `data/reports/*.html`
  - Returns `[{session_id, filename, size_bytes, modified_at}]` sorted by newest first
- `GET /reports/{session_id}` — serve the report:
  - Reads `data/reports/{session_id}.html`
  - Returns `Response(content=html, media_type="text/html")`
  - 404 if file not found

**Modified: `backend/api/main.py`**
- Register the new `reports` router.

### Frontend

**Modified: `frontend/src/api.js`**
- Add `getReportUrl(sessionId)` → returns `"/reports/" + sessionId` (for direct link)
- Add `listReports()` → `GET /reports/`

**Modified: `frontend/src/pages/ResultsPage.jsx`**
- Add "⬇ Download Report" button in the panel header actions area (next to existing DotMenu)
- Clicking opens `getReportUrl(sessionId)` in a new tab: `window.open(url, '_blank')`
- Add a "📋 History" icon button that opens a `ReportsHistoryModal`

**New file: `frontend/src/components/ReportsHistoryModal.jsx`**
- Simple modal listing past reports from `listReports()`
- Each row: session ID (truncated), date, link to open in new tab
- Triggered by the History button on ResultsPage

### Testing
- Unit: `ReportGenerator.generate()` with a minimal fixture returns a string containing `<html`
- Unit: `generate()` with empty results does not throw
- Integration: `POST /analyze/start` on a test session → poll until complete → `GET /reports/{id}` returns 200 with HTML content-type

---

## 2. SAR Data Input Pathway

### Goal
Users whose structure file contains no numeric property columns can upload a separate activity CSV. The ConfigPage SAR section shows an amber warning when no properties are present, with a direct link to add activity data.

### Backend

**Modified: `backend/utils/file_parsers.py`**
- New function `parse_activity_csv(content: str, existing_labels: list[str]) -> tuple[list[str], list[dict]]`
  - Reads CSV; auto-detects the label column (first non-numeric column, or column named `id`/`name`/`label`/`smiles`)
  - Validates: at least one numeric column required
  - Fuzzy-matches CSV labels to `existing_labels` (exact match first, then case-insensitive)
  - Returns `(new_property_columns, updated_properties_list)` — one dict per molecule, matched by position in `existing_labels`; unmatched rows get `None` values

**Modified: `backend/api/routes/upload.py`**
- New endpoint `POST /upload/activity`:
  - Form fields: `session_id: str`, `file: UploadFile`
  - Validates session exists
  - Calls `parse_activity_csv(content, session["labels"])`
  - Merges new property columns into `_sessions[sid]["property_columns"]`
  - Merges property values into `_sessions[sid]["properties"]`
  - Returns updated `DatasetPreview` (same model, now with updated `property_columns`)
- New function in `api.js`: `uploadActivityFile(sessionId, file)`

### Frontend

**Modified: `frontend/src/pages/UploadPage.jsx`**
- After successful structure upload (`uploadResult` is set), render an optional "Activity Data" section below the molecule preview:
  - Header: "＋ Add Activity Data (optional)" with a collapse toggle
  - Collapsed by default; user clicks to expand
  - When expanded: small dropzone accepting `.csv` only
  - On file drop/select: calls `uploadActivityFile`, updates `uploadResult` state with the server response
  - On success: shows green "✓ Activity data loaded · N properties" confirmation and collapses
  - On error: shows inline error message

**Modified: `frontend/src/pages/ConfigPage.jsx`**
- In the SAR Configuration panel, check `uploadResult.property_columns.length === 0`:
  - If true: render an amber warning block above the property selector:
    ```
    ⚠ No Activity Data
    SAR analysis requires numeric activity columns (pIC50, Ki, etc.).
    [← Add Activity Data]  ← this button calls onBackToUpload()
    ```
  - The "Property of Interest" dropdown is disabled (grayed out) when no columns exist

**Modified: `frontend/src/App.jsx`**
- Add `onBackToUpload` callback that resets `step` to 1 while keeping `uploadResult.session_id`
- Pass `onBackToUpload` to `ConfigPage`

### Testing
- Unit: `parse_activity_csv` with a 3-row CSV returns correct property values
- Unit: `parse_activity_csv` raises `ValueError` when no numeric columns detected
- Integration: `POST /upload/activity` with valid CSV → session `property_columns` updated

---

## 3. Collapsible Data Side Panel

### Goal
A sortable molecule table with mini SVG thumbnails available as a persistent sidebar on UploadPage and ConfigPage. State persists across page navigation within the session.

### Architecture

Pure frontend — no new backend endpoints required. Uses the existing `GET /results/{sessionId}/svg/{i}?width=48&height=36` endpoint for thumbnails (note: this endpoint requires analysis to be complete; for the upload page, use `GET /upload/session/{id}/mol3d/{i}` — wait, that's 3D; the upload route already returns `sample_svgs` for the first 8. We need a broader endpoint).

**Required backend addition:**
- New endpoint in `upload.py`: `GET /upload/session/{session_id}/svg/{mol_index}?width=48&height=36`
  - Uses `mol_to_svg(smiles_list[mol_index], width, height)`
  - Returns SVG response
  - This enables the side panel to load thumbnails before analysis runs

### Frontend

**New file: `frontend/src/components/DataSidePanel.jsx`**
- Props:
  - `sessionId: string`
  - `labels: string[]`
  - `propertyColumns: string[]`
  - `numMolecules: number`
  - `isOpen: boolean`
  - `onToggle: () => void`
- Rendering:
  - Fixed-position panel, right: 0, top: 0, height: 100vh
  - Width: 340px when `isOpen`, 20px when closed (just the toggle tab)
  - Toggle tab: cyan vertical strip with "TABLE" label, always visible
  - When open: header with search input + close button, scrollable table body, footer with count
- Table columns: `#` | Structure (48×36 SVG) | Label | ...one column per `propertyColumns`
- Sorting: click any column header to sort ascending/descending; `#` column sorts by original index
- Search: filters by label substring (case-insensitive)
- SVG lazy loading: use `IntersectionObserver` — only fetch SVG when row enters viewport; show placeholder `div` until loaded
- SVG fetch: `GET /upload/session/{sessionId}/svg/{i}?width=48&height=36`; use the `sample_svgs` from `uploadResult` for the first 8 without fetching
- Transitions: CSS `width` transition 200ms ease for open/close
- Z-index: above page content, below any modals

**Modified: `frontend/src/App.jsx`**
- Add `sidePanelOpen: boolean` state, default `false`
- Add `onToggleSidePanel` handler
- Render `<DataSidePanel>` at App root level (outside page routing), conditionally when `uploadResult` is not null
- Pass `sidePanelOpen` and `onToggleSidePanel` down to pages that need a "TABLE" button in their header

### Testing
- Manual: panel opens/closes, survives navigation from UploadPage → ConfigPage
- Unit: sort logic for numeric and string columns

---

## 4. Mol\* 3D Viewer

### Goal
Interactive 3D molecular visualization embedded on UploadPage after file upload. Click any molecule in the 2D preview list to load its 3D conformation in the Mol\* WebGL viewer.

### Backend

**Modified: `backend/utils/mol_utils.py`**
- New function `mol_to_3d_sdf(smiles: str) -> Optional[str]`:
  ```python
  def mol_to_3d_sdf(smiles: str) -> Optional[str]:
      mol = Chem.MolFromSmiles(smiles)
      if mol is None:
          return None
      mol = Chem.AddHs(mol)
      result = AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
      if result != 0:
          return None
      AllChem.MMFFOptimizeMolecule(mol, maxIters=200)
      mol = Chem.RemoveHs(mol)
      return Chem.MolToMolBlock(mol)
  ```
- Returns `None` on any failure (invalid SMILES, embedding failure)

**Modified: `backend/api/routes/upload.py`**
- New endpoint `GET /upload/session/{session_id}/mol3d/{mol_index}`:
  - Gets SMILES from `_sessions[sid]["smiles"][mol_index]`
  - Calls `mol_to_3d_sdf(smiles)`
  - On success: returns `Response(content=sdf_str, media_type="chemical/x-mdl-sdfile")`
  - On failure: returns `Response(content="", status_code=422)` (422 = unprocessable — 3D generation failed)
- The endpoint is intentionally synchronous; 3D generation typically takes < 100ms per molecule

### Frontend

**New file: `frontend/src/components/MolStarViewer.jsx`**
- Props: `sdfUrl: string | null`, `height: number`
- Loads Mol\* from CDN via dynamic `<script>` injection in `useEffect`:
  ```
  https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.js
  ```
- Renders a `<div ref={viewerRef}>` container; initializes `molstar.Viewer.create(ref, {...})` once script loads
- When `sdfUrl` changes: calls `viewer.loadStructureFromUrl(sdfUrl, 'sdf')` and applies default representation (ball-and-stick)
- States: `loading` (spinner), `error` (inline message), `ready` (viewer)
- Default representation: Ball+Stick; Surface toggle button calls `viewer.plugin.builders.structure.representation.addRepresentation`
- Cleanup: destroys viewer on unmount

**Modified: `frontend/src/pages/UploadPage.jsx`**
- When `uploadResult` is set, render a new collapsible "3D Viewer" section below the molecule preview grid:
  - Layout: two columns (on screens > 900px), single column otherwise
    - Left column (200px): scrollable list of all molecules, same 2D SVG cards as current grid
    - Right column (remaining): `<MolStarViewer>` component
  - `selected3dIndex` state (default: `0`)
  - Clicking a 2D card sets `selected3dIndex`
  - `sdfUrl` passed to viewer: `/upload/session/{sessionId}/mol3d/{selected3dIndex}`
- The section has a collapse toggle ("⬡ 3D Viewer ▼") so users who don't need 3D can hide it
- Default state: collapsed (to keep the page fast for users who don't need 3D)

**Modified: `frontend/src/api.js`**
- Add `getMol3dUrl(sessionId, index)` → returns the endpoint path string

### Testing
- Unit: `mol_to_3d_sdf("c1ccccc1")` returns a non-None string containing `$$$$`
- Unit: `mol_to_3d_sdf("not_a_smiles")` returns `None`
- Integration: `GET /upload/session/{id}/mol3d/0` after uploading a valid SDF returns 200 with SDF content

---

## Cross-Cutting Concerns

### `data/reports/` directory
- Created automatically on first use (with `mkdir parents=True, exist_ok=True`)
- Add `data/reports/` to `.gitignore` — reports should not be committed

### Error handling philosophy
- Report generation failure: log warning, do NOT fail the analysis response
- 3D coord generation failure: return 422, frontend shows "3D not available" fallback
- Activity CSV parse failure: return 400 with descriptive error message
- Side panel SVG fetch failure: show gray placeholder square, do not retry

### Build order rationale
1. **SAR pathway first** — highest clinical value, tests the secondary upload pattern
2. **Side panel second** — pure frontend, no risk of breaking backend
3. **HTML reports third** — adds ReportGenerator (new file, isolated)
4. **Mol\* viewer last** — requires new CDN dep and 3D coordinate generation; most risk

### Out of scope
- Project-level persistence (multiple sessions grouped into a "project") — future work
- Real-time collaborative viewing
- Export formats other than HTML (PDF, JSON)
- Mol\* viewer in ResultsPage (UploadPage only for now)
