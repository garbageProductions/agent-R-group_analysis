"""Integration tests for POST /upload/activity endpoint."""
import io
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.api.routes.upload import _sessions

client = TestClient(app)


@pytest.fixture
def session_with_molecules():
    """Inject a session with 3 labelled molecules directly into _sessions."""
    sid = "test-activity-session-001"
    _sessions[sid] = {
        "smiles": ["c1ccccc1", "CC(=O)Oc1ccccc1C(=O)O", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"],
        "labels": ["mol1", "mol2", "mol3"],
        "properties": {},
        "property_columns": [],
        "source_format": "sdf",
        "filename": "test.sdf",
        "analysis_results": None,
    }
    yield sid
    _sessions.pop(sid, None)


def _csv_file(content: str, filename: str = "activity.csv"):
    return ("file", (filename, io.BytesIO(content.encode()), "text/csv"))


# ── Happy path ──────────────────────────────────────────────────────────────

def test_upload_activity_returns_200(session_with_molecules):
    csv_content = "id,pIC50\nmol1,8.4\nmol2,7.9\nmol3,6.8\n"
    resp = client.post(
        "/api/upload/activity",
        data={"session_id": session_with_molecules},
        files=[_csv_file(csv_content)],
    )
    assert resp.status_code == 200


def test_upload_activity_updates_property_columns(session_with_molecules):
    csv_content = "id,pIC50\nmol1,8.4\nmol2,7.9\nmol3,6.8\n"
    resp = client.post(
        "/api/upload/activity",
        data={"session_id": session_with_molecules},
        files=[_csv_file(csv_content)],
    )
    body = resp.json()
    assert "pIC50" in body["property_columns"]


def test_upload_activity_persists_to_session(session_with_molecules):
    csv_content = "id,pIC50\nmol1,8.4\nmol2,7.9\nmol3,6.8\n"
    client.post(
        "/api/upload/activity",
        data={"session_id": session_with_molecules},
        files=[_csv_file(csv_content)],
    )
    session = _sessions[session_with_molecules]
    assert "pIC50" in session["property_columns"]
    assert session["properties"]["pIC50"] == [8.4, 7.9, 6.8]


def test_upload_activity_returns_dataset_preview_shape(session_with_molecules):
    csv_content = "id,pIC50\nmol1,8.4\nmol2,7.9\nmol3,6.8\n"
    resp = client.post(
        "/api/upload/activity",
        data={"session_id": session_with_molecules},
        files=[_csv_file(csv_content)],
    )
    body = resp.json()
    assert "session_id" in body
    assert "num_molecules" in body
    assert "sample_labels" in body


# ── Error cases ─────────────────────────────────────────────────────────────

def test_upload_activity_404_on_missing_session():
    csv_content = "id,pIC50\nmol1,8.4\n"
    resp = client.post(
        "/api/upload/activity",
        data={"session_id": "nonexistent-session"},
        files=[_csv_file(csv_content)],
    )
    assert resp.status_code == 404


def test_upload_activity_400_on_no_numeric_columns(session_with_molecules):
    csv_content = "id,name\nmol1,compound_a\nmol2,compound_b\n"
    resp = client.post(
        "/api/upload/activity",
        data={"session_id": session_with_molecules},
        files=[_csv_file(csv_content)],
    )
    assert resp.status_code == 400
    assert "numeric" in resp.json()["detail"].lower()


def test_upload_activity_400_on_empty_csv(session_with_molecules):
    resp = client.post(
        "/api/upload/activity",
        data={"session_id": session_with_molecules},
        files=[_csv_file("")],
    )
    assert resp.status_code == 400
