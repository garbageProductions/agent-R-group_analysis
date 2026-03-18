"""
Upload routes: handle file uploads and return parsed dataset previews.
"""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from backend.utils.file_parsers import parse_upload, parse_activity_csv
from backend.utils.mol_utils import mol_to_svg

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/upload", tags=["upload"])


class DatasetPreview(BaseModel):
    session_id: str
    num_molecules: int
    num_valid: int
    source_format: str
    property_columns: list
    sample_smiles: list
    sample_labels: list
    sample_svgs: list
    errors: list


# In-memory session store (replace with Redis/DB in production)
_sessions: dict = {}


@router.post("/", response_model=DatasetPreview)
async def upload_file(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
):
    """
    Upload an SDF, CSV, or SMILES file. Returns a dataset preview and session ID.
    """
    import uuid

    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        content = content_bytes.decode("latin-1")

    dataset = parse_upload(content, file.filename or "upload.sdf")

    if dataset.num_valid == 0:
        raise HTTPException(
            status_code=400,
            detail=f"No valid molecules found. Errors: {dataset.errors[:3]}",
        )

    sid = session_id or str(uuid.uuid4())

    # Store parsed dataset in session
    _sessions[sid] = {
        "smiles": dataset.smiles,
        "labels": dataset.labels,
        "properties": dataset.properties,
        "property_columns": dataset.property_columns,
        "source_format": dataset.source_format,
        "filename": file.filename,
        "analysis_results": None,
    }

    # Generate SVG previews for first 8 molecules
    sample_n = min(8, len(dataset.smiles))
    sample_svgs = []
    for smi in dataset.smiles[:sample_n]:
        svg = mol_to_svg(smi, width=180, height=140)
        sample_svgs.append(svg or "")

    return DatasetPreview(
        session_id=sid,
        num_molecules=dataset.num_molecules,
        num_valid=dataset.num_valid,
        source_format=dataset.source_format,
        property_columns=dataset.property_columns,
        sample_smiles=dataset.smiles[:sample_n],
        sample_labels=dataset.labels[:sample_n],
        sample_svgs=sample_svgs,
        errors=dataset.errors[:10],
    )


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Get stored session data."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = _sessions[session_id]
    return {
        "session_id": session_id,
        "num_molecules": len(session["smiles"]),
        "property_columns": session["property_columns"],
        "source_format": session["source_format"],
        "has_results": session["analysis_results"] is not None,
    }


def get_session_data(session_id: str) -> dict:
    """Internal helper to retrieve session data."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return _sessions[session_id]


def store_results(session_id: str, results: dict):
    """Internal helper to store analysis results."""
    if session_id in _sessions:
        _sessions[session_id]["analysis_results"] = results


@router.post("/activity", response_model=DatasetPreview)
async def upload_activity_file(
    session_id: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Upload a CSV of activity/property data to merge into an existing session.

    The CSV must have a label column matching the session's molecule labels
    and at least one numeric property column (e.g. pIC50, Ki, IC50).
    """
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        content = content_bytes.decode("latin-1")

    session = _sessions[session_id]

    try:
        new_cols, new_properties = parse_activity_csv(content, session["labels"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Merge new columns into session (add new; overwrite existing with same name)
    for col in new_cols:
        if col not in session["property_columns"]:
            session["property_columns"].append(col)
        session["properties"][col] = new_properties[col]

    # Build updated preview response
    sample_n = min(8, len(session["smiles"]))
    sample_svgs = []
    for smi in session["smiles"][:sample_n]:
        svg = mol_to_svg(smi, width=180, height=140)
        sample_svgs.append(svg or "")

    return DatasetPreview(
        session_id=session_id,
        num_molecules=len(session["smiles"]),
        num_valid=len(session["smiles"]),
        source_format=session["source_format"],
        property_columns=session["property_columns"],
        sample_smiles=session["smiles"][:sample_n],
        sample_labels=session["labels"][:sample_n],
        sample_svgs=sample_svgs,
        errors=[],
    )
