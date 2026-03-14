"""
Chat API route — WebSocket endpoint for the conversational chemistry agent.

Protocol (JSON over WebSocket):
  Client → Server:
    {"type": "message", "content": "..."} — send a message
    {"type": "file", "filename": "...", "content": "<base64>"}  — upload a file
    {"type": "clear"}  — clear session

  Server → Client:
    {"type": "upload_ack", "filename": "...", "num_molecules": 42, "property_columns": [...]}
    {"type": "tool_start", "tool": "...", "input_summary": "..."}
    {"type": "tool_result", "tool": "...", "summary": "...", "data": {...}}
    {"type": "tool_error", "tool": "...", "error": "..."}
    {"type": "response", "content": "..."}
    {"type": "done"}
    {"type": "error", "content": "..."}

Persistence:
  All chats are saved to data/chats/{session_id}.json after every turn.
  History can be listed, loaded, pinned, renamed, and deleted via REST endpoints.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from backend.agents.chat_agent import run_chat_turn, parse_uploaded_file

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Persistence ────────────────────────────────────────────────────────────────
# data/chats/ lives two levels above backend/api/routes/
CHATS_DIR = Path(__file__).resolve().parents[3] / "data" / "chats"
CHATS_DIR.mkdir(parents=True, exist_ok=True)


def _chat_path(session_id: str) -> Path:
    """Sanitize session_id and return its JSON path."""
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_.")[:80]
    return CHATS_DIR / f"{safe}.json"


def _load_chat_file(session_id: str) -> Optional[dict]:
    p = _chat_path(session_id)
    if not p.exists():
        return None
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return None


def _save_chat(session_id: str, state: dict) -> None:
    """Persist display messages + metadata to disk after each turn."""
    session_data    = state.get("session_data", {})
    display_messages = state.get("display_messages", [])
    meta             = state.get("meta", {})

    # Auto-generate title from first user message
    title = meta.get("title", "")
    if not title:
        for m in display_messages:
            if m.get("role") == "user" and m.get("content"):
                t = m["content"].strip()
                title = (t[:57] + "…") if len(t) > 57 else t
                break
    title = title or "Untitled chat"

    now      = datetime.now(timezone.utc).isoformat()
    existing = _load_chat_file(session_id) or {}

    # Save molecule data for small datasets (≤ 500 compounds); metadata-only for larger
    smiles = session_data.get("smiles", [])
    if smiles and len(smiles) <= 500:
        saved_session = {
            k: session_data[k]
            for k in ("smiles", "labels", "properties", "filename",
                      "num_molecules", "num_valid", "property_columns", "errors")
            if k in session_data
        }
    else:
        saved_session = {
            k: session_data[k]
            for k in ("filename", "num_molecules", "property_columns")
            if k in session_data
        }

    chat = {
        "id":              session_id,
        "title":           title,
        "created_at":      existing.get("created_at", now),
        "updated_at":      now,
        "pinned":          existing.get("pinned", False),
        "molecule_file":   session_data.get("filename", ""),
        "num_molecules":   session_data.get("num_molecules", 0),
        "property_columns": session_data.get("property_columns", []),
        "display_messages": display_messages,
        "api_history":     state.get("history", []),
        "session_data":    saved_session,
    }

    p = _chat_path(session_id)
    try:
        with open(p, "w") as f:
            json.dump(chat, f, default=str, ensure_ascii=False, indent=2)
        # Update in-memory meta so title is stable
        state["meta"] = {**meta, "title": title, "created_at": chat["created_at"]}
        logger.debug(f"Saved chat {session_id} ({len(display_messages)} display messages)")
    except Exception as e:
        logger.error(f"Failed to save chat {session_id}: {e}")


# ── In-memory session cache ────────────────────────────────────────────────────
_chat_sessions: dict = {}


def _get_or_restore_session(session_id: str) -> dict:
    """Return in-memory session, restoring from disk on cache miss."""
    if session_id in _chat_sessions:
        return _chat_sessions[session_id]
    saved = _load_chat_file(session_id)
    if saved:
        state = {
            "history":          saved.get("api_history", []),
            "session_data":     saved.get("session_data", {}),
            "display_messages": saved.get("display_messages", []),
            "meta": {
                "title":      saved.get("title", ""),
                "created_at": saved.get("created_at"),
            },
        }
        logger.info(
            f"Restored session {session_id} from disk "
            f"({len(state['display_messages'])} msgs)"
        )
    else:
        state = {"history": [], "session_data": {}, "display_messages": [], "meta": {}}
    _chat_sessions[session_id] = state
    return state


# ── REST: history endpoints ────────────────────────────────────────────────────

@router.get("/chat/history")
async def list_chat_history():
    """List all saved chats (metadata only — no messages)."""
    chats = []
    for p in sorted(CHATS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            with open(p) as f:
                d = json.load(f)
            chats.append({
                "id":           d.get("id", p.stem),
                "title":        d.get("title", "Untitled"),
                "created_at":   d.get("created_at"),
                "updated_at":   d.get("updated_at"),
                "pinned":       d.get("pinned", False),
                "molecule_file": d.get("molecule_file", ""),
                "num_molecules": d.get("num_molecules", 0),
                "num_messages":  len([
                    m for m in d.get("display_messages", [])
                    if m.get("role") in ("user", "assistant")
                ]),
            })
        except Exception:
            pass
    return {"chats": chats}


@router.get("/chat/history/{session_id}")
async def get_chat(session_id: str):
    """
    Get a specific saved chat (with display messages).
    Also restores it to the in-memory session cache so the WebSocket can pick it up.
    """
    saved = _load_chat_file(session_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Restore to in-memory so tools work on WS reconnect
    if session_id not in _chat_sessions:
        _chat_sessions[session_id] = {
            "history":          saved.get("api_history", []),
            "session_data":     saved.get("session_data", {}),
            "display_messages": saved.get("display_messages", []),
            "meta": {
                "title":      saved.get("title", ""),
                "created_at": saved.get("created_at"),
            },
        }

    # Return everything except the raw api_history (large, not needed by UI)
    return {k: v for k, v in saved.items() if k != "api_history"}


class ChatPatchBody(BaseModel):
    pinned: Optional[bool] = None
    title: Optional[str]   = None


@router.patch("/chat/history/{session_id}")
async def patch_chat(session_id: str, body: ChatPatchBody):
    """Update chat metadata: pin/unpin or rename."""
    saved = _load_chat_file(session_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Chat not found")

    if body.pinned is not None:
        saved["pinned"] = body.pinned
    if body.title is not None:
        saved["title"] = body.title.strip() or saved["title"]

    p = _chat_path(session_id)
    with open(p, "w") as f:
        json.dump(saved, f, default=str, ensure_ascii=False, indent=2)

    # Keep in-memory meta in sync
    if session_id in _chat_sessions:
        _chat_sessions[session_id]["meta"]["title"] = saved.get("title", "")

    return {"ok": True, "id": session_id, "pinned": saved["pinned"], "title": saved["title"]}


@router.delete("/chat/history/{session_id}")
async def delete_chat(session_id: str):
    """Permanently delete a saved chat."""
    p = _chat_path(session_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Chat not found")
    p.unlink()
    _chat_sessions.pop(session_id, None)
    return {"ok": True, "id": session_id}


# ── WebSocket heartbeat ────────────────────────────────────────────────────────

async def _heartbeat(ws: WebSocket, stop: asyncio.Event, interval: int = 15) -> None:
    """
    Send a periodic keep-alive ping to the client while the agent is running.

    Without this, browsers and reverse proxies close idle WebSocket connections
    after 30-60 seconds — exactly what causes the 'agent timed out' symptom.
    The frontend silently ignores 'heartbeat' messages.
    """
    while not stop.is_set():
        try:
            await ws.send_text(json.dumps({"type": "heartbeat"}))
        except Exception:
            break
        # Wait `interval` seconds OR until stop is signalled — whichever comes first
        try:
            await asyncio.wait_for(asyncio.shield(stop.wait()), timeout=interval)
        except asyncio.TimeoutError:
            pass  # normal — interval elapsed, send another ping


# ── WebSocket ──────────────────────────────────────────────────────────────────

@router.websocket("/chat/ws/{session_id}")
async def chat_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for conversational chat with the chemistry agent.
    session_id isolates each browser tab's conversation.
    """
    await websocket.accept()
    logger.info(f"Chat WS connected: {session_id}")

    state = _get_or_restore_session(session_id)

    async def send(data: dict):
        """Send a message to the client, swallowing connection errors."""
        try:
            await websocket.send_text(json.dumps(data, default=str))
        except Exception:
            pass

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await send({"type": "error", "content": "Invalid JSON"})
                continue

            msg_type = msg.get("type")

            # ── File upload ──────────────────────────────────────────────────
            if msg_type == "file":
                filename    = msg.get("filename", "upload")
                content_b64 = msg.get("content", "")
                logger.info(f"[chat {session_id}] File upload: {filename}")

                result = parse_uploaded_file(filename, content_b64)
                if "error" in result:
                    await send({"type": "error", "content": f"File parse error: {result['error']}"})
                    continue

                state["session_data"].update(result)

                # Record as system message in display log
                state.setdefault("display_messages", []).append({
                    "role":      "system",
                    "content":   (
                        f"📄 Loaded {result['num_molecules']} molecules from \"{filename}\""
                        + (f" · Properties: {', '.join(result['property_columns'])}"
                           if result.get("property_columns") else "")
                    ),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                _save_chat(session_id, state)

                await send({
                    "type":            "upload_ack",
                    "filename":        filename,
                    "num_molecules":   result["num_molecules"],
                    "num_valid":       result["num_valid"],
                    "property_columns": result["property_columns"],
                    "errors":          result.get("errors", []),
                })

            # ── Chat message ─────────────────────────────────────────────────
            elif msg_type == "message":
                content = msg.get("content", "").strip()
                if not content:
                    continue

                logger.info(f"[chat {session_id}] User: {content[:80]}")

                now = datetime.now(timezone.utc).isoformat()

                # Record user message
                state.setdefault("display_messages", []).append({
                    "role":      "user",
                    "content":   content,
                    "timestamp": now,
                })

                # Create placeholder for this assistant turn
                asst_record: dict = {
                    "role":      "assistant",
                    "content":   "",
                    "toolCalls": [],
                    "timestamp": None,
                }
                state["display_messages"].append(asst_record)

                # ── send wrapper: forwards events AND records them ───────────
                # _rec is bound by default-arg so each closure captures the right record
                async def send_and_record(data: dict, _rec: dict = asst_record):
                    await send(data)
                    t = data.get("type")
                    if t == "tool_start":
                        _rec["toolCalls"].append({
                            "tool":         data.get("tool"),
                            "inputSummary": data.get("input_summary"),
                            "isRunning":    False,
                            "summary":      None,
                            "data":         None,
                            "error":        None,
                        })
                    elif t in ("tool_result", "tool_error"):
                        # Update the last matching tool call
                        for tc in reversed(_rec["toolCalls"]):
                            if tc["tool"] == data.get("tool"):
                                tc["summary"] = data.get("summary") or data.get("error")
                                tc["data"]    = data.get("data")
                                tc["error"]   = data.get("error") if t == "tool_error" else None
                                break
                    elif t == "synthesis_start":
                        # Opus upgrade card — treated like a final pseudo-tool-call
                        _rec["toolCalls"].append({
                            "tool":         "synthesize",
                            "inputSummary": f"Generating comprehensive analysis with {data.get('model', 'Opus')}",
                            "isRunning":    True,
                            "summary":      None,
                            "data":         None,
                            "error":        None,
                        })
                    elif t == "partial_response":
                        # Accumulate streaming text chunks in real time
                        _rec["content"] = (_rec.get("content") or "") + data.get("content", "")
                    elif t == "response":
                        # Final complete text overwrites any partial chunks
                        _rec["content"]   = data.get("content", "")
                        _rec["timestamp"] = datetime.now(timezone.utc).isoformat()
                        # Mark the synthesize card complete if present
                        for tc in _rec["toolCalls"]:
                            if tc["tool"] == "synthesize" and tc["isRunning"]:
                                tc["isRunning"] = False
                                tc["summary"]   = "analysis complete"
                                break
                    elif t == "done":
                        # ── Auto-save on turn completion ─────────────────────
                        if not _rec.get("timestamp"):
                            _rec["timestamp"] = datetime.now(timezone.utc).isoformat()
                        _save_chat(session_id, state)

                # ── Start heartbeat so WS stays alive during long Claude calls ──
                stop_hb = asyncio.Event()
                hb_task = asyncio.create_task(_heartbeat(websocket, stop_hb, interval=15))

                try:
                    state["history"] = await run_chat_turn(
                        message=content,
                        history=state["history"],
                        session_data=state["session_data"],
                        send=send_and_record,
                    )
                finally:
                    stop_hb.set()
                    hb_task.cancel()
                    try:
                        await hb_task
                    except asyncio.CancelledError:
                        pass

            # ── Clear session ────────────────────────────────────────────────
            elif msg_type == "clear":
                state["history"]          = []
                state["session_data"]     = {}
                state["display_messages"] = []
                state["meta"]             = {}
                await send({"type": "done"})

            else:
                await send({"type": "error", "content": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        logger.info(f"Chat WS disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Chat WS error ({session_id}): {e}", exc_info=True)
        try:
            await websocket.close()
        except Exception:
            pass
