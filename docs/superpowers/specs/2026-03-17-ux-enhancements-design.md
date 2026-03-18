# UX Enhancement Package — Design Spec
**Date:** 2026-03-17
**Status:** Approved

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
  - Molecule grid: SVGs rendered via RDKit, embedded as inline SVG strings (up to first 50 molecules to keep report size manageable)
  - Dataset stats: property columns, value distributions (simple inline `<table>`)
  - R-group decomposition: core SMARTS, frequency table
  - MMP transforms: top transforms table
  - Activity cliffs: cliff pairs table with SALI scores
  - Generative results (if present): top molecules + iteration history
  - All styling via a single inline `<style>` block — dark theme, no CDN
- SVGs are re-generated at report time (not cached from session) at 200×160

**Modified: `backend/api/routes/analyze.py`**
- In `_run_pipeline()`, after `_results[sid] = {"status": "complete", "results": pipeline_results}` (currently around line 100), add a report-write block. At this point `session_data` is already in scope as the return value from `get_session_data(sid)`:
  ```python
  try:
      from backend.utils.report_generator import ReportGenerator
      from pathlib import Path
      reports_dir = Path("data/reports")
      reports_dir.mkdir(parents=True, exist_ok=True)
      html = ReportGenerator().generate(session_data, pipeline_results)
      (reports_dir / f"{sid}.html").write_text(html, encoding="utf-8")
  except Exception:
      logger.warning("Failed to write HTML report for session %s", sid, exc_info=True)
  ```
- Failure to write the report must NOT fail the analysis — the `try/except` ensures this.

**New file: `backend/api/routes/reports.py`**
- Router prefix: `/reports`, tags: `["reports"]`
- `GET /reports/` — list all reports:
  - Scans `data/reports/*.html`; if directory does not exist, returns `[]`
  - Returns `[{session_id, filename, size_bytes, modified_at}]` sorted newest first
  - `modified_at` as ISO-8601 string from `os.path.getmtime`
- `GET /reports/{session_id}` — serve the report:
  - Reads `data/reports/{session_id}.html`
  - Returns `Response(content=html, media_type="text/html")`
  - 404 if file not found

**Modified: `backend/main.py`**
- Import and register the new `reports` router with `app.include_router(reports.router, prefix="/api")`.

### Frontend

**Modified: `frontend/src/api.js`**
- Add `getReportUrl(sessionId)` → returns `"/api/reports/" + sessionId` (direct link to serve HTML)
- Add `listReports()` → `GET /api/reports/`

**Modified: `frontend/src/pages/ResultsPage.jsx`**
- Add "⬇ Download Report" button in the panel header actions area (next to existing DotMenu)
- Clicking opens `getReportUrl(sessionId)` in a new tab: `window.open(url, '_blank')`
- Add a "📋 History" icon button that opens a `ReportsHistoryModal`

**New file: `frontend/src/components/ReportsHistoryModal.jsx`**
- Simple modal listing past reports from `listReports()`
- Each row: session ID (truncated to 8 chars), date/time, "Open" link that opens the report in a new tab
- Dismiss behavior: closes on overlay click, close button (✕), or Escape key
- Triggered by the History button on ResultsPage

### Testing
- Unit: `ReportGenerator.generate()` with a minimal fixture (dict with `smiles`, `labels`, `property_columns` keys and a `results` dict) returns a string containing `<!DOCTYPE html`
- Unit: `generate()` with empty `results` dict does not throw
- Integration: `POST /analyze/start` on a test session → poll until complete → `GET /api/reports/{id}` returns 200 with `Content-Type: text/html`

---

## 2. SAR Data Input Pathway

### Goal
Users whose structure file contains no numeric property columns can upload a separate activity CSV. The ConfigPage SAR section shows an amber warning when no properties are present, with a direct link to add activity data.

### Backend

**Modified: `backend/utils/file_parsers.py`**
- New function `parse_activity_csv(content: str, existing_labels: list[str]) -> tuple[list[str], dict[str, list]]`
  - Reads CSV; auto-detects the label column (first non-numeric column, or column explicitly named `id`, `name`, `label`, or `smiles`)
  - Validates: at least one numeric column required; raises `ValueError` with a descriptive message if not
  - Matches CSV rows to `existing_labels` by exact match (then case-insensitive). Rows with no match are silently skipped; unmatched `existing_labels` get `None` for each new property
  - Row-count mismatch: if the CSV has a different number of rows than `existing_labels`, returns 400 with the message `"Activity CSV has {n} rows but session has {m} molecules; counts must match or CSV must include label column for matching"` — this validation happens in the endpoint, not inside `parse_activity_csv`
  - Returns column-oriented `(new_property_columns: list[str], new_properties: dict[str, list])` — matching the existing `properties` shape in `_sessions` (`Dict[str, List[Any]]`, one entry per column, values indexed by molecule position)

**Modified: `backend/api/routes/upload.py`**
- New endpoint `POST /upload/activity`:
  - Form fields: `session_id: str`, `file: UploadFile`
  - Validates session exists (raises 404 if not)
  - Decodes file content (UTF-8 with Latin-1 fallback, same as main upload)
  - Validates CSV row count vs. session molecule count if CSV has no label column (see above)
  - Calls `parse_activity_csv(content, session["labels"])`
  - On `ValueError`: raises `HTTPException(status_code=400, detail=str(e))`
  - On success: merges `new_property_columns` into `_sessions[sid]["property_columns"]` and `new_properties` into `_sessions[sid]["properties"]`
  - Returns updated `DatasetPreview` (same Pydantic model, now with updated `property_columns` and `sample_svgs` from cache)

**Modified: `frontend/src/api.js`**
- Add `uploadActivityFile(sessionId, file)`:
  - Posts `multipart/form-data` with `session_id` and `file` to `POST /api/upload/activity`
  - Returns the updated `DatasetPreview` response

### Frontend

**Modified: `frontend/src/pages/UploadPage.jsx`**
- After successful structure upload (`uploadResult` is set), render an optional "Activity Data" section below the molecule preview:
  - Header: "＋ Add Activity Data (optional)" with a collapse toggle
  - Collapsed by default; user clicks to expand
  - When expanded: small dropzone accepting `.csv` only
  - On file drop/select: calls `uploadActivityFile`, updates `uploadResult` state in the parent (`App.jsx` via the existing `onComplete`-style callback or by lifting `setUploadResult`)
  - On success: shows green "✓ Activity data loaded · N properties" confirmation and collapses
  - On error: shows inline error message in the same red-border style as the main upload error

**Modified: `frontend/src/pages/ConfigPage.jsx`**
- In the SAR Configuration panel, check `uploadResult.property_columns.length === 0`:
  - If true: render an amber warning block above the property selector:
    ```
    ⚠ No Activity Data
    SAR analysis requires numeric activity columns (pIC50, Ki, etc.).
    [← Add Activity Data]
    ```
  - "← Add Activity Data" button calls `onBackToUpload()` prop
  - The "Property of Interest" dropdown is disabled (opacity 0.4, pointer-events none) when no columns exist

**Modified: `frontend/src/App.jsx`**
- Add `onBackToUpload` callback: calls `setStep('upload')` while preserving `uploadResult` (session_id and molecule data remain intact; user can add activity data then re-proceed to config)
- Pass `onBackToUpload` to `ConfigPage`
- Note: App.jsx also receives changes from Feature 3 (side panel state); those changes are additive and must be applied after Feature 2's changes to avoid conflicts.

### Testing
- Unit: `parse_activity_csv` with a 3-column CSV (label, pIC50, Ki) and matching `existing_labels` returns correct column-oriented dict
- Unit: `parse_activity_csv` raises `ValueError` when no numeric columns are present
- Integration: `POST /api/upload/activity` with valid CSV → `GET /api/upload/session/{id}` shows updated `property_columns`

---

## 3. Collapsible Data Side Panel

### Goal
A sortable molecule table with mini SVG thumbnails available as a persistent sidebar on UploadPage and ConfigPage. State persists across page navigation within the session.

### Architecture

Requires one new backend endpoint to serve individual molecule SVGs before analysis runs (the existing `GET /results/{sessionId}/svg/{i}` endpoint requires a completed analysis). The panel uses `sample_svgs` from the upload response for the first 8 molecules without fetching, and the new endpoint for the rest.

**Required backend addition in `backend/api/routes/upload.py`:**
- New endpoint: `GET /upload/session/{session_id}/svg/{mol_index}`
  - Query params: `width: int = 48`, `height: int = 36`
  - Gets SMILES from `_sessions[sid]["smiles"][mol_index]`
  - Calls `mol_to_svg(smiles, width=width, height=height)`
  - Returns SVG response (`media_type="image/svg+xml"`)
  - 404 if index out of range

### Frontend

**New file: `frontend/src/components/DataSidePanel.jsx`**
- Props:
  - `sessionId: string` — used to build SVG fetch URLs
  - `labels: string[]` — **full labels array** from `_sessions[sid]["labels"]` (all molecules, not just the sample 8); passed from `App.jsx` state which holds the full `uploadResult`
  - `propertyColumns: string[]`
  - `numMolecules: number`
  - `isOpen: boolean`
  - `onToggle: () => void`
- Rendering:
  - Fixed-position panel, `right: 0`, `top: 0`, `height: 100vh`, `z-index: 100` (above page content, below any modal at z-index 200+)
  - Width: 340px when `isOpen`, 20px when closed (just the toggle tab)
  - CSS `width` transition: 200ms ease
  - Toggle tab: cyan (#00c4d4) vertical strip with "TABLE" label (rotated text), always visible at right edge
  - When open: header with title "Dataset Table" + search input + close (✕) button; scrollable table body; footer showing count + sort info
- Table columns: `#` | Structure (48×36 img tag, src from SVG endpoint) | Label | one column per `propertyColumns`
- Sorting: click column header toggles ascending/descending; active sort column shows ↑/↓ indicator; `#` column restores original index order
- Search: controlled input filters rows by label substring, case-insensitive
- SVG lazy loading: `IntersectionObserver` watches each table row; SVG `src` set to empty string until row enters viewport, then set to the endpoint URL. First 8 rows use `sample_svgs` from `uploadResult` directly (inline SVG or data URI) to avoid fetching. On fetch failure (non-200 or network error): show a 48×36 gray placeholder `div`, do not retry.
- `sample_svgs` are passed as an additional prop `sampleSvgs: string[]` (from `uploadResult.sample_svgs`)

**Modified: `frontend/src/App.jsx`** (apply after Feature 2 changes)
- Add `sidePanelOpen: boolean` state, default `false`
- Add `onToggleSidePanel` handler toggling `sidePanelOpen`
- Render `<DataSidePanel>` at App root level (sibling of the page content div), conditionally rendered when `uploadResult` is not null. Pass: `sessionId={uploadResult.session_id}`, `labels={uploadResult.sample_labels}` — NOTE: `uploadResult.sample_labels` only contains the first 8 labels. To display all molecules, App.jsx must store and pass the full label list. The `POST /api/upload/` response includes `sample_labels` (first 8 only). The full labels are not currently returned by the API. See the **API change** below.
- Note: `sessionStorage` currently caches `uploadData`. After Feature 2 adds activity columns, the cache will be updated because `uploadActivityFile` returns a new `DatasetPreview` and the caller updates `uploadResult` state, which triggers the existing `sessionStorage` effect.

**Required API change for full labels:**
- `backend/api/routes/upload.py` — modify `DatasetPreview` to include `all_labels: list[str]` (the full label list, not just sample)
- The `POST /api/upload/` response adds `all_labels: dataset.labels` (all molecules)
- `DataSidePanel` receives `labels={uploadResult.all_labels}`
- `numMolecules` prop is therefore redundant with `labels.length` — remove it; derive count from `labels.length`

**Modified: `frontend/src/api.js`**
- Add `getSvgUrl(sessionId, index, width=48, height=36)` → returns `/api/upload/session/${sessionId}/svg/${index}?width=${width}&height=${height}`

### Testing
- Unit: sort function correctly sorts numeric columns ascending/descending
- Unit: sort function correctly sorts string columns case-insensitively
- Manual: panel opens/closes, state (open/closed, sort column, search text) survives navigation from UploadPage → ConfigPage → back to UploadPage

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
- Returns `None` on any failure (invalid SMILES, embedding failure, MMFF failure)

**Modified: `backend/api/routes/upload.py`**
- New endpoint `GET /upload/session/{session_id}/mol3d/{mol_index}`:
  - Gets SMILES from `_sessions[sid]["smiles"][mol_index]`; raises 404 if index out of range
  - Calls `mol_to_3d_sdf(smiles)`
  - On success: returns `Response(content=sdf_str, media_type="chemical/x-mdl-sdfile")`
  - On failure (`None` returned): returns HTTP 422 with `{"detail": "3D coordinate generation failed for this molecule"}`
- The endpoint is synchronous; 3D generation typically takes < 200ms per molecule

### Frontend

**New file: `frontend/src/components/MolStarViewer.jsx`**
- Props: `sdfUrl: string | null`, `height: number` (caller passes `320` for UploadPage context)
- Loads Mol\* **pinned to a specific version** from CDN via dynamic `<script>` injection in `useEffect`:
  ```
  https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.js
  ```
  - Pin to `3.45.0` (or the latest `3.x` stable at implementation time — verify before committing). Do NOT use `@latest`.
  - Also load the accompanying CSS: `molstar@3.45.0/build/viewer/molstar.css`
- Renders a `<div ref={viewerRef}>` container sized to `width: "100%"`, `height: props.height`
- Initializes viewer once script+CSS load:
  ```js
  const viewer = await molstar.Viewer.create(viewerRef.current, {
    layoutIsExpanded: false,
    layoutShowControls: false,
    layoutShowSequence: false,
    layoutShowLog: false,
  })
  ```
- When `sdfUrl` changes and is non-null: fetch the SDF text, then load via:
  ```js
  await viewer.loadStructureFromData(sdfText, 'mol', { representationParams: { type: 'ball-and-stick' } })
  ```
  - Note: Mol\* 3.x uses `loadStructureFromData(data, format, options)` where `format = 'mol'` handles SDF/MOL. Verify the exact API call against the pinned version during implementation; fall back to `loadStructureFromUrl` if `loadStructureFromData` is unavailable.
- States:
  - `loading` — spinner while script loads or SDF is fetching
  - `error` — shows inline message "3D structure unavailable" if fetch returns 422 or script fails to load
  - `ready` — Mol\* viewer rendered and interactive
- Surface toggle button: calls `viewer.plugin.managers.structure.component.updateRepresentationsTheme(...)` or equivalent in the pinned version; verify exact API at implementation time
- Cleanup on unmount: `viewer.plugin.dispose()`

**Modified: `frontend/src/pages/UploadPage.jsx`**
- When `uploadResult` is set, render a collapsible "⬡ 3D Viewer" section below the 2D molecule grid
- Default state: **collapsed** (users who don't need 3D skip it; avoids loading Mol\* CDN script until explicitly opened)
- When expanded, layout:
  - Two-column on viewport width ≥ 900px: left column 200px (scrollable 2D card list), right column (flex-1, min-width 0) holds `<MolStarViewer height={320} />`
  - Single-column stacked on narrower viewports
- `selected3dIndex` state (default: `0`, auto-selects first molecule)
- Clicking a 2D card sets `selected3dIndex`; the selected card gets a cyan border highlight
- `sdfUrl` passed to viewer: `getMol3dUrl(sessionId, selected3dIndex)` from `api.js`
- The 2D card list shows all molecules (uses `all_labels` from Feature 3's API change); SVGs use `sample_svgs` for first 8, then `getSvgUrl` for the rest — consistent with the side panel approach

**Modified: `frontend/src/api.js`**
- Add `getMol3dUrl(sessionId, index)` → returns `/api/upload/session/${sessionId}/mol3d/${index}`

### Testing
- Unit: `mol_to_3d_sdf("c1ccccc1")` returns a non-None string containing `$$$$`
- Unit: `mol_to_3d_sdf("not_a_smiles")` returns `None`
- Integration: `GET /api/upload/session/{id}/mol3d/0` after uploading a valid SDF returns 200 with `Content-Type: chemical/x-mdl-sdfile`
- Integration: `GET /api/upload/session/{id}/mol3d/0` for a molecule with a macrocycle or unusual structure returns 422 gracefully

---

## Cross-Cutting Concerns

### `data/reports/` directory
- Created automatically on first use in `ReportGenerator` caller (with `mkdir(parents=True, exist_ok=True)`)
- Add `data/reports/` to the **root `.gitignore`** file — reports should not be committed to git

### App.jsx change sequencing
- Feature 2 adds `onBackToUpload` callback and passes it to `ConfigPage`
- Feature 3 adds `sidePanelOpen` state, `onToggleSidePanel` handler, and renders `<DataSidePanel>` at root
- Feature 3 also adds `all_labels` to the upload response and state
- These changes to `App.jsx` must be applied sequentially (Feature 2 first, then Feature 3) to avoid conflicts

### `sessionStorage` cache consistency
- `App.jsx` currently caches `uploadData` (= `uploadResult`) in `sessionStorage`
- After Feature 2, when `uploadActivityFile` returns an updated `DatasetPreview`, the caller updates `uploadResult` state in `App.jsx`, which automatically triggers the existing `sessionStorage` effect — no extra work needed

### Error handling philosophy
- Report generation failure: log warning, do NOT fail the analysis response
- 3D coord generation failure: return 422, frontend shows "3D not available" message
- Activity CSV parse failure: return 400 with descriptive error message
- Side panel SVG fetch failure: show gray placeholder square, do not retry

### Build order rationale
1. **SAR pathway first** — highest user value, validates the secondary upload pattern
2. **Side panel second** — mostly pure frontend after the one new SVG endpoint
3. **HTML reports third** — isolated new file (`ReportGenerator`), no frontend-backend coupling changes
4. **Mol\* viewer last** — new CDN dependency, 3D coordinate generation, most integration risk

### Out of scope
- Project-level persistence (multiple sessions grouped into a named "project") — future work
- Real-time collaborative viewing
- Export formats other than HTML (PDF, JSON)
- Mol\* viewer in ResultsPage (UploadPage only for now)
- Mol\* viewer for generated molecules in GeneratedMoleculesPanel
