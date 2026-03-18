"""
Analysis routes: trigger the agent pipeline and stream progress via WebSocket.
"""

import asyncio
import json
import logging
import os
from typing import Literal, Optional

import anthropic
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from backend.agents.orchestrator import OrchestratorAgent
from backend.api.routes.upload import get_session_data, store_results

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analyze", tags=["analyze"])


class GenerativeConfig(BaseModel):
    scoring_mode: Literal["physico", "qsar", "both"] = "both"
    n_iterations: int = Field(default=5, ge=1, le=20)
    n_steps: int = Field(default=500, ge=100, le=5000)


class AnalysisRequest(BaseModel):
    session_id: str
    property_of_interest: Optional[str] = None
    core_smarts: Optional[str] = None
    run_enumeration: bool = False
    similarity_threshold: float = 0.7
    activity_diff_threshold: float = 1.0
    # Generative design fields:
    run_generative: bool = False
    generative_config: Optional[GenerativeConfig] = None


# Track running analyses
_running: dict = {}
_results: dict = {}


@router.post("/start")
async def start_analysis(request: AnalysisRequest):
    """
    Start the analysis pipeline for a session.
    Returns immediately; use WebSocket /analyze/ws/{session_id} for progress.
    """
    session_data = get_session_data(request.session_id)

    if request.session_id in _running:
        return {"status": "already_running", "session_id": request.session_id}

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY not set. Please configure your .env file.",
        )

    _running[request.session_id] = True
    _results[request.session_id] = {"status": "running", "progress": []}

    # Run in background
    asyncio.create_task(
        _run_pipeline(request, session_data, api_key)
    )

    return {"status": "started", "session_id": request.session_id}


async def _run_pipeline(request: AnalysisRequest, session_data: dict, api_key: str):
    """Background task: runs the full analysis pipeline."""
    sid = request.session_id
    progress_messages = []

    def progress_callback(event: dict):
        msg = event.get("message", "")
        progress_messages.append(msg)
        _results[sid]["progress"] = progress_messages.copy()
        logger.info(f"[Pipeline] {msg}")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        orchestrator = OrchestratorAgent(client, progress_callback=progress_callback)

        results = orchestrator.run_full_pipeline(
            smiles=session_data["smiles"],
            labels=session_data["labels"],
            properties=session_data["properties"],
            property_of_interest=request.property_of_interest,
            run_enumeration=request.run_enumeration,
            core_smarts=request.core_smarts,
            run_generative=request.run_generative,
            generative_config=request.generative_config,
        )

        _results[sid] = {
            "status": "complete",
            "results": results,
            "progress": progress_messages,
        }

        # ── Auto-save HTML report ────────────────────────────────────────────
        try:
            from backend.utils.report_generator import ReportGenerator
            from pathlib import Path
            reports_dir = Path("data/reports")
            reports_dir.mkdir(parents=True, exist_ok=True)
            report_html = ReportGenerator().generate(session_data, results)
            (reports_dir / f"{sid}.html").write_text(report_html, encoding="utf-8")
            logger.info("HTML report saved for session %s", sid)
        except Exception:
            logger.warning("Failed to write HTML report for session %s", sid, exc_info=True)

        store_results(sid, results)

    except Exception as e:
        logger.error(f"Pipeline error for session {sid}: {e}", exc_info=True)
        _results[sid] = {
            "status": "error",
            "error": str(e),
            "progress": progress_messages,
        }
    finally:
        _running.pop(sid, None)


@router.get("/status/{session_id}")
async def get_status(session_id: str):
    """Poll analysis status and progress messages."""
    if session_id not in _results:
        return {"status": "not_started"}
    r = _results[session_id]
    return {
        "status": r.get("status", "unknown"),
        "progress": r.get("progress", []),
        "error": r.get("error"),
        "has_results": "results" in r,
    }


@router.websocket("/ws/{session_id}")
async def websocket_progress(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time progress updates during analysis.
    Streams progress messages as JSON.
    """
    await websocket.accept()
    last_count = 0

    try:
        while True:
            result_data = _results.get(session_id, {})
            status = result_data.get("status", "not_started")
            progress = result_data.get("progress", [])

            # Send any new progress messages
            if len(progress) > last_count:
                new_msgs = progress[last_count:]
                for msg in new_msgs:
                    await websocket.send_json({"type": "progress", "message": msg})
                last_count = len(progress)

            # Send completion or error
            if status == "complete":
                await websocket.send_json({"type": "complete"})
                break
            elif status == "error":
                await websocket.send_json({
                    "type": "error",
                    "message": result_data.get("error", "Unknown error")
                })
                break

            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
