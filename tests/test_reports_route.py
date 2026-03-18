"""Tests for GET /reports/ and GET /reports/{session_id}."""
import os
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)
REPORTS_DIR = Path("data/reports")


@pytest.fixture(autouse=True)
def clean_reports(tmp_path, monkeypatch):
    """Redirect report writes to tmp_path so tests don't pollute data/reports/."""
    monkeypatch.setattr(
        "backend.api.routes.reports.REPORTS_DIR",
        tmp_path / "reports",
    )  # use default raising=True so a misspelled attribute path causes an explicit failure
    (tmp_path / "reports").mkdir()
    yield tmp_path / "reports"


def _write_report(reports_dir: Path, session_id: str, content: str = "<html>test</html>"):
    (reports_dir / f"{session_id}.html").write_text(content)


def test_list_reports_returns_200(clean_reports):
    resp = client.get("/api/reports/")
    assert resp.status_code == 200


def test_list_reports_empty_list_when_no_reports(clean_reports):
    resp = client.get("/api/reports/")
    assert resp.json() == []


def test_list_reports_includes_written_report(clean_reports):
    _write_report(clean_reports, "session-abc")
    resp = client.get("/api/reports/")
    body = resp.json()
    assert any(r["session_id"] == "session-abc" for r in body)


def test_list_reports_sorted_newest_first(clean_reports):
    _write_report(clean_reports, "old-session", "<html>old</html>")
    import time; time.sleep(0.01)
    _write_report(clean_reports, "new-session", "<html>new</html>")
    body = client.get("/api/reports/").json()
    assert body[0]["session_id"] == "new-session"


def test_get_report_returns_200(clean_reports):
    _write_report(clean_reports, "report-001")
    resp = client.get("/api/reports/report-001")
    assert resp.status_code == 200


def test_get_report_content_type_is_html(clean_reports):
    _write_report(clean_reports, "report-002")
    resp = client.get("/api/reports/report-002")
    assert "text/html" in resp.headers["content-type"]


def test_get_report_returns_html_content(clean_reports):
    _write_report(clean_reports, "report-003", "<html><body>hello</body></html>")
    resp = client.get("/api/reports/report-003")
    assert "<html>" in resp.text


def test_get_report_404_when_not_found(clean_reports):
    resp = client.get("/api/reports/nonexistent-session")
    assert resp.status_code == 404
