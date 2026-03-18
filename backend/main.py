"""
R-Group Analysis Suite — FastAPI Application Entry Point
"""

import logging
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Ensure backend package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.api.routes import upload, analyze, results, chat, reports

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

app = FastAPI(
    title="R-Group Analysis Suite",
    description=(
        "Computational chemistry agent suite for R-group decomposition, "
        "SAR analysis, MMP mining, activity cliff detection, and virtual library enumeration."
    ),
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(upload.router, prefix="/api")
app.include_router(analyze.router, prefix="/api")
app.include_router(results.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    # Verify RDKit is available
    try:
        from rdkit import Chem
        rdkit_ok = True
        rdkit_version = Chem.rdBase.rdkitVersion
    except ImportError:
        rdkit_ok = False
        rdkit_version = None

    api_key_set = bool(os.getenv("ANTHROPIC_API_KEY"))

    return {
        "status": "ok",
        "rdkit_available": rdkit_ok,
        "rdkit_version": rdkit_version,
        "anthropic_api_key_configured": api_key_set,
    }


@app.get("/api/tools")
async def list_tools():
    """List available analysis tools and agents."""
    return {
        "tools": [
            {"name": "standardize_molecule", "description": "Clean and normalize molecular representations"},
            {"name": "detect_series_core", "description": "Find common core and recommend analysis strategy"},
            {"name": "rgroup_decompose_series", "description": "Decompose compound series into core + R-groups"},
            {"name": "rank_rgroup_vs_property", "description": "SAR ranking of substituents by property"},
            {"name": "mine_mmp_transforms", "description": "Matched molecular pair transform mining"},
            {"name": "enumerate_substituent_swaps", "description": "Virtual library enumeration"},
            {"name": "detect_activity_cliffs", "description": "SALI-based activity cliff detection"},
            {"name": "build_scaffold_tree", "description": "Murcko scaffold hierarchy analysis"},
            {"name": "diversity_analysis", "description": "Chemical space diversity and MaxMin selection"},
        ],
        "agents": [
            {"name": "OrchestratorAgent", "role": "Pipeline coordinator and strategy selector"},
            {"name": "StandardizationAgent", "role": "Molecule cleaning and normalization"},
            {"name": "CoreDetectionAgent", "role": "Common core detection and strategy recommendation"},
            {"name": "DecompositionAgent", "role": "R-group decomposition and interpretation"},
            {"name": "SARAgent", "role": "Structure-activity relationship analysis"},
            {"name": "MMPAgent", "role": "Matched molecular pair analysis"},
            {"name": "EnumerationAgent", "role": "Virtual library generation"},
            {"name": "ActivityCliffAgent", "role": "Activity cliff detection and interpretation"},
            {"name": "ScaffoldAgent", "role": "Scaffold hierarchy and diversity analysis"},
            {"name": "ReportAgent", "role": "Final report and recommendation generation"},
        ],
    }


# Serve the built frontend (when running in production)
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    logger.info(f"Serving frontend from {frontend_dist}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
