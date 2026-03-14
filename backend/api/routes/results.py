"""
Results routes: retrieve analysis results and generate molecule SVGs.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from backend.api.routes.analyze import _results
from backend.api.routes.upload import get_session_data
from backend.utils.mol_utils import mol_to_svg, mols_to_svg_grid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/results", tags=["results"])


@router.get("/{session_id}")
async def get_results(session_id: str):
    """Get the full analysis results for a session."""
    if session_id not in _results:
        raise HTTPException(status_code=404, detail="No results found for this session")

    result_data = _results[session_id]
    if result_data.get("status") != "complete":
        raise HTTPException(
            status_code=202,
            detail=f"Analysis status: {result_data.get('status', 'unknown')}"
        )

    return result_data["results"]


@router.get("/{session_id}/report")
async def get_report(session_id: str):
    """Get just the report section of analysis results."""
    results = _results.get(session_id, {}).get("results", {})
    report = results.get("report")
    if not report:
        raise HTTPException(status_code=404, detail="No report found")
    return report


@router.get("/{session_id}/svg/{mol_index}")
async def get_molecule_svg(
    session_id: str,
    mol_index: int,
    width: int = Query(250, ge=50, le=800),
    height: int = Query(200, ge=50, le=600),
):
    """Generate SVG for a specific molecule from the session."""
    session = get_session_data(session_id)
    smiles_list = session["smiles"]

    if mol_index < 0 or mol_index >= len(smiles_list):
        raise HTTPException(status_code=404, detail=f"Molecule index {mol_index} out of range")

    svg = mol_to_svg(smiles_list[mol_index], width=width, height=height)
    if not svg:
        raise HTTPException(status_code=500, detail="Failed to generate SVG")

    return Response(content=svg, media_type="image/svg+xml")


@router.get("/{session_id}/svg/smiles")
async def get_smiles_svg(
    session_id: str,
    smiles: str = Query(..., description="SMILES string to render"),
    width: int = Query(250, ge=50, le=800),
    height: int = Query(200, ge=50, le=600),
):
    """Generate SVG for an arbitrary SMILES string."""
    svg = mol_to_svg(smiles, width=width, height=height)
    if not svg:
        raise HTTPException(status_code=400, detail="Invalid SMILES or SVG generation failed")
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/{session_id}/grid")
async def get_molecule_grid(
    session_id: str,
    start: int = Query(0, ge=0),
    count: int = Query(20, ge=1, le=100),
    mols_per_row: int = Query(4, ge=1, le=8),
):
    """Generate an SVG grid of molecules from the session."""
    session = get_session_data(session_id)
    smiles_list = session["smiles"][start : start + count]
    labels = session["labels"][start : start + count]

    svg = mols_to_svg_grid(smiles_list, labels=labels, mols_per_row=mols_per_row)
    if not svg:
        raise HTTPException(status_code=500, detail="Failed to generate grid SVG")

    return Response(content=svg, media_type="image/svg+xml")


@router.get("/{session_id}/rgroup_table")
async def get_rgroup_table(session_id: str):
    """Get the R-group decomposition table as JSON."""
    results = _results.get(session_id, {}).get("results", {})
    decomp = results.get("rgroup_decomposition")
    if not decomp:
        raise HTTPException(status_code=404, detail="No R-group decomposition available")
    return {
        "core_smarts": decomp.get("core_smarts"),
        "core_smiles": decomp.get("core_smiles"),
        "columns": decomp.get("rgroup_columns", []),
        "rows": decomp.get("decomposition", []),
        "rgroup_frequency": decomp.get("rgroup_frequency", {}),
        "success_rate": decomp.get("success_rate"),
    }


@router.get("/{session_id}/mmp_transforms")
async def get_mmp_transforms(
    session_id: str,
    property_name: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
):
    """Get top MMP transforms, optionally filtered by property."""
    results = _results.get(session_id, {}).get("results", {})
    mmp = results.get("mmp_analysis")
    if not mmp:
        raise HTTPException(status_code=404, detail="No MMP analysis available")

    if property_name:
        top = mmp.get("top_transforms_by_property", {}).get(property_name, [])
    else:
        # Return all transforms sorted by count
        all_transforms = list(mmp.get("transforms", {}).values())
        all_transforms.sort(key=lambda t: t.get("count", 0), reverse=True)
        top = all_transforms

    return {
        "num_pairs": mmp.get("num_pairs"),
        "transforms": top[:limit],
        "property_names": mmp.get("property_names", []),
    }


@router.get("/{session_id}/activity_cliffs")
async def get_activity_cliffs(session_id: str, limit: int = Query(50, ge=1, le=500)):
    """Get activity cliff pairs."""
    results = _results.get(session_id, {}).get("results", {})
    cliffs = results.get("activity_cliffs")
    if not cliffs:
        raise HTTPException(status_code=404, detail="No activity cliff analysis available")

    return {
        "num_cliff_pairs": cliffs.get("num_cliff_pairs"),
        "sali_threshold": cliffs.get("sali_threshold"),
        "cliff_pairs": cliffs.get("cliff_pairs", [])[:limit],
        "landscape_stats": cliffs.get("activity_landscape_stats", {}),
        "llm_interpretation": cliffs.get("llm_interpretation"),
    }
