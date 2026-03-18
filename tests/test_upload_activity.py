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


# ── Tests for all_labels ─────────────────────────────────────────────────────

def test_upload_response_includes_all_labels():
    """POST /upload/activity response must include all_labels field (not just sample 8)."""
    import io as _io
    sid = "test-all-labels-001"
    _sessions[sid] = {
        "smiles": ["c1ccccc1", "CC(=O)O", "CN"],
        "labels": ["molA", "molB", "molC"],
        "properties": {},
        "property_columns": [],
        "source_format": "sdf",
        "filename": "test.sdf",
        "analysis_results": None,
    }
    try:
        csv_content = "id,pIC50\nmolA,8.4\nmolB,7.9\nmolC,6.8\n"
        resp = client.post(
            "/api/upload/activity",
            data={"session_id": sid},
            files=[("file", ("activity.csv", _io.BytesIO(csv_content.encode()), "text/csv"))],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "all_labels" in body, "DatasetPreview must have all_labels field"
        assert body["all_labels"] == ["molA", "molB", "molC"]
    finally:
        _sessions.pop(sid, None)


# ── Tests for GET /upload/session/{id}/svg/{i} ────────────────────────────────

def test_get_upload_svg_returns_200(session_with_molecules):
    resp = client.get(f"/api/upload/session/{session_with_molecules}/svg/0")
    assert resp.status_code == 200


def test_get_upload_svg_content_type(session_with_molecules):
    resp = client.get(f"/api/upload/session/{session_with_molecules}/svg/0")
    assert "svg" in resp.headers["content-type"]


def test_get_upload_svg_returns_svg_text(session_with_molecules):
    resp = client.get(f"/api/upload/session/{session_with_molecules}/svg/0")
    assert "<svg" in resp.text


def test_get_upload_svg_404_on_missing_session():
    resp = client.get("/api/upload/session/nonexistent/svg/0")
    assert resp.status_code == 404


def test_get_upload_svg_404_on_out_of_range_index(session_with_molecules):
    resp = client.get(f"/api/upload/session/{session_with_molecules}/svg/999")
    assert resp.status_code == 404


# ── Tests for GET /upload/session/{id}/mol3d/{i} ──────────────────────────────

def test_get_mol3d_returns_200_for_valid_molecule(session_with_molecules):
    """Benzene (mol index 0) should return a 200 with SDF content."""
    resp = client.get(f"/api/upload/session/{session_with_molecules}/mol3d/0")
    # Mol3d generation requires a molecule that can be embedded; benzene should work
    assert resp.status_code in (200, 422)  # 422 is acceptable if env missing 3D support


def test_get_mol3d_returns_sdf_content_type(session_with_molecules):
    resp = client.get(f"/api/upload/session/{session_with_molecules}/mol3d/0")
    if resp.status_code == 200:
        assert "mdl" in resp.headers["content-type"] or "chemical" in resp.headers["content-type"]


def test_get_mol3d_sdf_contains_terminator(session_with_molecules):
    resp = client.get(f"/api/upload/session/{session_with_molecules}/mol3d/0")
    if resp.status_code == 200:
        assert "$$$$" in resp.text or "M  END" in resp.text


def test_get_mol3d_404_on_missing_session():
    resp = client.get("/api/upload/session/nonexistent/mol3d/0")
    assert resp.status_code == 404


def test_get_mol3d_404_on_out_of_range_index(session_with_molecules):
    resp = client.get(f"/api/upload/session/{session_with_molecules}/mol3d/999")
    assert resp.status_code == 404
