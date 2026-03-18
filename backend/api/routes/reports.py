"""
Reports router: list and serve saved HTML pipeline reports.
Reports are stored in data/reports/<session_id>.html
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])

# Can be monkeypatched in tests
REPORTS_DIR = Path("data/reports")


@router.get("/")
async def list_reports():
    """
    List all saved HTML reports, sorted newest first.
    Returns an empty list if the reports directory does not exist.
    """
    if not REPORTS_DIR.exists():
        return []

    reports = []
    for path in REPORTS_DIR.glob("*.html"):
        session_id = path.stem
        stat = path.stat()
        reports.append({
            "session_id": session_id,
            "filename": path.name,
            "size_bytes": stat.st_size,
            "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        })

    reports.sort(key=lambda r: r["modified_at"], reverse=True)
    return reports


@router.get("/{session_id}")
async def get_report(session_id: str):
    """Serve the HTML report for the given session_id."""
    report_path = REPORTS_DIR / f"{session_id}.html"
    if not report_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No report found for session '{session_id}'",
        )
    html = report_path.read_text(encoding="utf-8")
    return Response(content=html, media_type="text/html")
