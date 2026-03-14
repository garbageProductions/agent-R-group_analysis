"""
Chat Agent — conversational agent with access to all R-group analysis tools.

Maintains conversation history, handles streaming responses, and can process
file uploads mid-conversation. This agent wraps every tool the pipeline uses
so users can chat their way through any analysis the GUI supports.
"""

import asyncio
import base64
import json
import logging
import os
from typing import Any, Callable, Dict, List, Optional

import anthropic

from backend.tools.standardize_molecule import standardize_molecules_batch
from backend.tools.detect_series_core import detect_series_core
from backend.tools.rgroup_decompose_series import rgroup_decompose_series
from backend.tools.rank_rgroup_vs_property import rank_rgroup_vs_property
from backend.tools.mine_mmp_transforms import mine_mmp_transforms
from backend.tools.enumerate_substituent_swaps import enumerate_substituent_swaps
from backend.tools.detect_activity_cliffs import detect_activity_cliffs
from backend.tools.scaffold_tree import build_scaffold_tree
from backend.tools.diversity_analysis import diversity_analysis
from backend.utils.file_parsers import parse_upload

logger = logging.getLogger(__name__)

# Two-model strategy:
#   TOOL_MODEL    — fast tool selection / execution routing (Sonnet)
#   SUMMARY_MODEL — high-quality final synthesis after all tools complete (Opus)
# When ≥1 tool was called, Sonnet's quick draft is discarded and Opus writes
# the final answer. For plain Q&A (no tools), Sonnet answers directly.
TOOL_MODEL    = "claude-sonnet-4-5"   # 3-4x faster, accurate tool routing
SUMMARY_MODEL = "claude-opus-4-6"     # highest quality scientific reasoning

MAX_TOKENS          = 4096   # adequate for tool selection; Opus uses same limit
MAX_TOOL_ITERATIONS = 12     # hard cap — prevents runaway loops
MAX_HISTORY_TURNS   = 8      # oldest turns pruned to stay within context window

SYSTEM_PROMPT = """You are the R-Group Analysis Chat Agent, an expert computational chemistry assistant built into the R-Group Analysis Suite.

You have access to nine specialized tools for molecular analysis:
1. **standardize** — Clean and normalize molecular representations (remove salts, normalize, calculate properties)
2. **detect_core** — Find common core SMARTS and recommend analysis strategy (R-group, scaffold-family, or MMP)
3. **rgroup_decompose** — Decompose a compound series into core + R-group substituents
4. **rank_sar** — Rank R-group substituents by their effect on a property (ANOVA, F-scores)
5. **mine_mmps** — Find matched molecular pairs and transformations with property effects
6. **enumerate_library** — Generate a virtual compound library by swapping substituents
7. **detect_cliffs** — Find activity cliffs using SALI (Structure-Activity Landscape Index)
8. **scaffold_tree** — Build a Murcko scaffold hierarchy and analyze scaffold diversity
9. **analyze_diversity** — Compute diversity metrics, MaxMin subset selection, and clustering

When a user uploads a file, molecules are loaded automatically and you can immediately reference them.
If the user asks for the same analysis the GUI pipeline does, run the relevant tools sequentially.

Guidelines:
- Always use tools to compute molecular results — never fabricate chemical data
- Summarize tool outputs in plain language before showing raw data
- When results are large, show the most important findings and offer to show more
- Suggest follow-up analyses that would be valuable
- Use SMILES notation when referring to molecules
- Format numerical results to 3 decimal places
- Be proactive: if you notice interesting patterns in results, mention them"""


# ─── Tool schemas (passed to Claude) ─────────────────────────────────────────

TOOLS = [
    {
        "name": "standardize",
        "description": "Standardize and normalize a list of SMILES strings. Removes salts, normalizes charges, and calculates basic molecular properties (MW, LogP, HBD, HBA, TPSA).",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles_list": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of SMILES strings to standardize"
                },
                "remove_salts": {"type": "boolean", "default": True},
                "normalize": {"type": "boolean", "default": True},
                "neutralize": {"type": "boolean", "default": True},
            },
            "required": ["smiles_list"],
        },
    },
    {
        "name": "detect_core",
        "description": "Detect the common core of a molecular series using MCS and Murcko scaffold analysis. Returns a recommended analysis strategy.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles_list": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of SMILES strings"
                },
                "mcs_timeout": {"type": "integer", "default": 10, "description": "MCS timeout in seconds"},
            },
            "required": ["smiles_list"],
        },
    },
    {
        "name": "rgroup_decompose",
        "description": "Decompose a molecular series into core + R-group substituents at each position.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles_list": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of SMILES strings"
                },
                "core_smarts": {"type": "string", "description": "Core SMARTS pattern (auto-detected if not provided)"},
                "labels": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional molecule labels"
                },
                "properties": {
                    "type": "object",
                    "description": "Optional dict of property arrays {property_name: [values...]}"
                },
            },
            "required": ["smiles_list"],
        },
    },
    {
        "name": "rank_sar",
        "description": "Rank R-group substituents by their effect on a molecular property using ANOVA.",
        "input_schema": {
            "type": "object",
            "properties": {
                "decomposition": {
                    "type": "object",
                    "description": "Decomposition result from rgroup_decompose tool"
                },
                "property_name": {"type": "string", "description": "Name of the property to rank against"},
                "higher_is_better": {"type": "boolean", "default": True},
                "min_count": {"type": "integer", "default": 2, "description": "Minimum substituent occurrences"},
            },
            "required": ["decomposition", "property_name"],
        },
    },
    {
        "name": "mine_mmps",
        "description": "Mine matched molecular pairs (MMPs) from a compound set to find property-changing structural transformations.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles_list": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "properties": {
                    "type": "object",
                    "description": "Property arrays {property_name: [values...]}"
                },
                "labels": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "max_fragment_heavy_atoms": {"type": "integer", "default": 13},
            },
            "required": ["smiles_list"],
        },
    },
    {
        "name": "enumerate_library",
        "description": "Generate a virtual compound library by swapping R-group substituents at each position.",
        "input_schema": {
            "type": "object",
            "properties": {
                "core_smarts": {"type": "string", "description": "Core SMARTS with attachment points"},
                "rgroup_library": {
                    "type": "object",
                    "description": "Dict of {position: [smiles_list]} for each R-group position"
                },
                "builtin_library_categories": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Built-in categories: aromatic, aliphatic, polar, halogens"
                },
                "max_compounds": {"type": "integer", "default": 1000},
                "constraints": {
                    "type": "object",
                    "description": "Property constraints {max_mw, max_logp, lipinski_only}"
                },
            },
            "required": ["core_smarts"],
        },
    },
    {
        "name": "detect_cliffs",
        "description": "Detect activity cliffs — pairs of structurally similar molecules with large activity differences. Uses SALI scoring.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles_list": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "activity_values": {
                    "type": "array",
                    "items": {"type": "number"},
                    "description": "Activity/property values for each molecule"
                },
                "labels": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "similarity_threshold": {"type": "number", "default": 0.7},
                "activity_diff_threshold": {"type": "number", "default": 1.0},
            },
            "required": ["smiles_list", "activity_values"],
        },
    },
    {
        "name": "scaffold_tree",
        "description": "Build a Murcko scaffold hierarchy showing how scaffolds relate, their frequencies, and generic scaffold counts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles_list": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "labels": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "properties": {
                    "type": "object",
                    "description": "Optional property arrays"
                },
            },
            "required": ["smiles_list"],
        },
    },
    {
        "name": "analyze_diversity",
        "description": "Compute chemical diversity metrics, select a maximally diverse subset (MaxMin), and cluster compounds by structural similarity.",
        "input_schema": {
            "type": "object",
            "properties": {
                "smiles_list": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "labels": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "n_diverse": {"type": "integer", "default": 10, "description": "Size of diverse subset to select"},
                "cluster_cutoff": {"type": "number", "default": 0.65},
            },
            "required": ["smiles_list"],
        },
    },
]


def _truncate_for_llm(data: Any, max_items: int = 20) -> Any:
    """Truncate large lists in tool results to avoid overloading context."""
    if isinstance(data, list) and len(data) > max_items:
        return data[:max_items] + [f"... ({len(data) - max_items} more items truncated)"]
    if isinstance(data, dict):
        return {k: _truncate_for_llm(v, max_items) for k, v in data.items()}
    return data


def _coerce_decomposition(raw: Any) -> List[Dict]:
    """
    Normalise the decomposition argument for rank_sar.

    Claude receives tool results as JSON strings and may pass them back
    in several forms:
      - the correct list of dicts                    → use as-is
      - the full rgroup_decompose result dict        → extract ["decomposition"]
      - a JSON-serialised string of either of above  → parse then apply rules above
    Also strips RDKit "None" strings (empty R-group positions) so they
    don't trip up rank_rgroup_vs_property.
    """
    import json as _json

    # 1. Unwrap JSON string
    if isinstance(raw, str):
        try:
            raw = _json.loads(raw)
        except (ValueError, _json.JSONDecodeError):
            return []

    # 2. If it's the full rgroup result dict, pull the inner list
    if isinstance(raw, dict):
        raw = raw.get("decomposition", [])

    if not isinstance(raw, list):
        return []

    # 3. Clean each record: skip non-dict entries, drop "None" R-group values
    clean = []
    for rec in raw:
        if not isinstance(rec, dict):
            continue
        clean_rec = {
            k: (None if v == "None" else v)
            for k, v in rec.items()
        }
        clean.append(clean_rec)
    return clean


def _prune_history(history: List[Dict]) -> List[Dict]:
    """
    Keep only the last MAX_HISTORY_TURNS real conversation turns to prevent
    context window overflow on long sessions.

    "Real" turns are messages where the user typed something (string content),
    not the tool-result turns injected by the agentic loop (list content).
    """
    real_user_idx = [
        i for i, m in enumerate(history)
        if m["role"] == "user" and isinstance(m.get("content"), str)
    ]
    if len(real_user_idx) <= MAX_HISTORY_TURNS:
        return history
    cutoff = real_user_idx[-MAX_HISTORY_TURNS]
    pruned = history[cutoff:]
    logger.info(f"History pruned: dropped {cutoff} old messages, kept {len(pruned)}")
    return pruned


def _execute_tool(name: str, tool_input: Dict[str, Any], session_data: Dict) -> Dict:
    """Execute a chat tool call. session_data holds molecules from uploads."""
    smiles = tool_input.get("smiles_list") or session_data.get("smiles", [])
    labels = tool_input.get("labels") or session_data.get("labels", [])
    props  = tool_input.get("properties") or session_data.get("properties", {})

    if name == "standardize":
        result = standardize_molecules_batch(
            smiles,
            remove_salts=tool_input.get("remove_salts", True),
            normalize=tool_input.get("normalize", True),
            neutralize=tool_input.get("neutralize", True),
        )
        # result already contains num_molecules, num_success, etc.
        return _truncate_for_llm(result)

    elif name == "detect_core":
        return detect_series_core(smiles, mcs_timeout=tool_input.get("mcs_timeout", 10))

    elif name == "rgroup_decompose":
        result = rgroup_decompose_series(
            smiles,
            core_smarts=tool_input.get("core_smarts"),
            labels=labels,
            properties=props,
        )
        # Truncate only the decomposition list for LLM context; keep metadata intact
        if isinstance(result.get("decomposition"), list):
            result["decomposition"] = _truncate_for_llm(result["decomposition"])
        return result

    elif name == "rank_sar":
        decomp = _coerce_decomposition(tool_input.get("decomposition", []))
        if not decomp:
            # Fall back: rebuild decomposition from session data + property
            prop_name = tool_input.get("property_name", "")
            rebuild = []
            session_props = session_data.get("properties", {})
            prop_vals = session_props.get(prop_name, [])
            for i, smi in enumerate(session_data.get("smiles", [])):
                rec = {
                    "original_smiles": smi,
                    "label": session_data.get("labels", [f"Mol_{i}"])[i]
                    if i < len(session_data.get("labels", [])) else f"Mol_{i}",
                }
                if i < len(prop_vals):
                    rec[prop_name] = prop_vals[i]
                rebuild.append(rec)
            decomp = rebuild

        return rank_rgroup_vs_property(
            decomp,
            property_name=tool_input["property_name"],
            higher_is_better=tool_input.get("higher_is_better", True),
            min_count=tool_input.get("min_count", 2),
        )

    elif name == "mine_mmps":
        return _truncate_for_llm(mine_mmp_transforms(
            smiles,
            properties=props,
            labels=labels,
            max_fragment_heavy_atoms=tool_input.get("max_fragment_heavy_atoms", 13),
        ))

    elif name == "enumerate_library":
        return _truncate_for_llm(enumerate_substituent_swaps(
            core_smarts=tool_input["core_smarts"],
            rgroup_library=tool_input.get("rgroup_library"),
            builtin_library_categories=tool_input.get("builtin_library_categories"),
            constraints=tool_input.get("constraints"),
            max_compounds=tool_input.get("max_compounds", 1000),
        ))

    elif name == "detect_cliffs":
        return _truncate_for_llm(detect_activity_cliffs(
            smiles,
            activity_values=tool_input["activity_values"],
            labels=labels,
            similarity_threshold=tool_input.get("similarity_threshold", 0.7),
            activity_diff_threshold=tool_input.get("activity_diff_threshold", 1.0),
        ))

    elif name == "scaffold_tree":
        return _truncate_for_llm(build_scaffold_tree(smiles, labels=labels, properties=props))

    elif name == "analyze_diversity":
        return diversity_analysis(
            smiles,
            labels=labels,
            n_diverse=tool_input.get("n_diverse", 10),
            cluster_cutoff=tool_input.get("cluster_cutoff", 0.65),
        )

    else:
        return {"error": f"Unknown tool: {name}"}


async def run_chat_turn(
    message: str,
    history: List[Dict],
    session_data: Dict,
    send: Callable,
) -> List[Dict]:
    """
    Two-model agentic loop:

    ┌─ TOOL PHASE ──────────────────────────────────────────────────────────┐
    │  claude-sonnet-4-5 (TOOL_MODEL)                                       │
    │  Non-streaming async create() — fast, never blocks the event loop.    │
    │  Runs for every iteration where Claude selects and calls a tool.      │
    │  Any brief intro text Sonnet emits before tool calls is forwarded     │
    │  to the client immediately.                                            │
    └───────────────────────────────────────────────────────────────────────┘
    ┌─ SYNTHESIS PHASE ──────────────────────────────────────────────────────┐
    │  claude-opus-4-6 (SUMMARY_MODEL) — only when ≥1 tool was called       │
    │  Streaming — client sees Opus write the analysis in real time.        │
    │  Sonnet's quick draft end_turn is silently discarded; Opus reads      │
    │  the full tool-result history and writes the definitive analysis.     │
    │                                                                        │
    │  For pure Q&A (0 tools called) Sonnet answers directly — no upgrade. │
    └───────────────────────────────────────────────────────────────────────┘
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    client  = anthropic.AsyncAnthropic(api_key=api_key, timeout=120.0)

    # Inject molecule context so Claude knows what data is loaded
    context_note = ""
    if session_data.get("smiles"):
        n         = len(session_data["smiles"])
        filename  = session_data.get("filename", "uploaded file")
        props     = list(session_data.get("properties", {}).keys())
        prop_note = f", properties: {', '.join(props)}" if props else ""
        context_note = (
            f"\n\n[CONTEXT: {n} molecules loaded from '{filename}'{prop_note}. "
            f"Use them in tool calls without providing smiles_list explicitly.]"
        )

    history.append({"role": "user", "content": message + context_note})
    history = _prune_history(history)

    tool_calls_total = 0   # counts every tool executed across all iterations
    iterations       = 0

    while iterations < MAX_TOOL_ITERATIONS:
        iterations += 1

        # ── TOOL PHASE: Sonnet (non-streaming, fast) ───────────────────────────
        assistant_content: List[Dict] = []
        text_parts:        List[str]  = []

        try:
            response = await client.messages.create(
                model=TOOL_MODEL,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=history,
            )
        except anthropic.APIStatusError as e:
            await send({"type": "error", "content": f"API error {e.status_code}: {e.message}"})
            return history
        except anthropic.APIConnectionError as e:
            await send({"type": "error", "content": f"Connection failed: {e}"})
            return history
        except anthropic.APITimeoutError:
            await send({"type": "error", "content": "Claude timed out — try a simpler request."})
            return history
        except Exception as e:
            logger.error(f"run_chat_turn error: {e}", exc_info=True)
            await send({"type": "error", "content": f"Unexpected error: {e}"})
            return history

        for block in response.content:
            if hasattr(block, "text"):
                text_parts.append(block.text)
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append({
                    "type": "tool_use", "id": block.id,
                    "name": block.name, "input": block.input,
                })

        history.append({"role": "assistant", "content": assistant_content})

        # ── end_turn: either upgrade to Opus or answer directly ────────────────
        if response.stop_reason == "end_turn":

            if tool_calls_total >= 1:
                # ── SYNTHESIS PHASE: Opus (streaming) ─────────────────────────
                # Discard Sonnet's quick draft — Opus reads the full tool-result
                # history and writes the definitive scientific analysis.
                history.pop()

                # Tell the frontend to render the "synthesizing" card
                await send({"type": "synthesis_start", "model": SUMMARY_MODEL})

                opus_content:    List[Dict] = []
                opus_text_parts: List[str]  = []

                try:
                    async with client.messages.stream(
                        model=SUMMARY_MODEL,
                        max_tokens=MAX_TOKENS,
                        system=SYSTEM_PROMPT,
                        # No tools — Opus synthesises only; no further tool calls
                        messages=history,
                    ) as stream:
                        async for chunk in stream.text_stream:
                            await send({"type": "partial_response", "content": chunk})
                        final_opus = await stream.get_final_message()

                    for block in final_opus.content:
                        if hasattr(block, "text"):
                            opus_text_parts.append(block.text)
                            opus_content.append({"type": "text", "text": block.text})

                except anthropic.APIStatusError as e:
                    await send({"type": "error", "content": f"Opus API error {e.status_code}: {e.message}"})
                    return history
                except anthropic.APITimeoutError:
                    await send({"type": "error", "content": "Opus synthesis timed out."})
                    return history
                except Exception as e:
                    logger.error(f"Opus synthesis error: {e}", exc_info=True)
                    await send({"type": "error", "content": f"Synthesis error: {e}"})
                    return history

                history.append({"role": "assistant", "content": opus_content})
                final_text = "".join(opus_text_parts)
                if final_text:
                    await send({"type": "response", "content": final_text})
                await send({"type": "done"})
                return history

            else:
                # ── Pure Q&A: Sonnet answers directly, no upgrade needed ───────
                # Forward any text Sonnet generated
                for t in text_parts:
                    if t.strip():
                        await send({"type": "partial_response", "content": t})
                final_text = "".join(text_parts)
                if final_text:
                    await send({"type": "response", "content": final_text})
                await send({"type": "done"})
                return history

        # ── tool_use: execute tools, loop back for next Sonnet decision ────────
        if response.stop_reason == "tool_use":

            # Forward any brief intro text Sonnet wrote before the tool call
            for t in text_parts:
                if t.strip():
                    await send({"type": "partial_response", "content": t})

            tool_results: List[Dict] = []

            for block in response.content:
                if block.type != "tool_use":
                    continue

                tool_calls_total += 1
                await send({
                    "type":          "tool_start",
                    "tool":          block.name,
                    "input_summary": _make_input_summary(block.name, block.input, session_data),
                })

                try:
                    result = await asyncio.get_event_loop().run_in_executor(
                        None, _execute_tool, block.name, block.input, session_data
                    )
                    result_str = json.dumps(result, default=str)
                    summary    = _make_result_summary(block.name, result)
                    await send({
                        "type": "tool_result", "tool": block.name,
                        "summary": summary, "data": result,
                    })
                except Exception as e:
                    logger.error(f"Tool {block.name} error: {e}", exc_info=True)
                    result_str = json.dumps({"error": str(e)})
                    await send({"type": "tool_error", "tool": block.name, "error": str(e)})

                tool_results.append({
                    "type": "tool_result", "tool_use_id": block.id, "content": result_str,
                })

            history.append({"role": "user", "content": tool_results})

        else:
            await send({"type": "done"})
            return history

    await send({
        "type":    "error",
        "content": f"Reached {MAX_TOOL_ITERATIONS} tool iterations — analysis may be incomplete.",
    })
    return history


def _make_input_summary(tool_name: str, tool_input: Dict, session_data: Dict) -> str:
    n_mols = len(tool_input.get("smiles_list") or session_data.get("smiles", []))
    summaries = {
        "standardize": f"Standardizing {n_mols} molecules",
        "detect_core": f"Detecting common core in {n_mols} molecules",
        "rgroup_decompose": f"Decomposing {n_mols} molecules" + (
            f" with core {tool_input.get('core_smarts', 'auto')}" if tool_input.get("core_smarts") else ""
        ),
        "rank_sar": f"Ranking substituents for property: {tool_input.get('property_name', '?')}",
        "mine_mmps": f"Mining MMP transforms in {n_mols} molecules",
        "enumerate_library": f"Enumerating virtual library from {tool_input.get('core_smarts', '?')}",
        "detect_cliffs": f"Detecting activity cliffs in {n_mols} molecules",
        "scaffold_tree": f"Building scaffold tree for {n_mols} molecules",
        "analyze_diversity": f"Analyzing diversity of {n_mols} molecules",
    }
    return summaries.get(tool_name, f"Running {tool_name}")


def _make_result_summary(tool_name: str, result: Any) -> str:
    # Only show error banner when there is an actual error value (not null/None)
    if isinstance(result, dict) and result.get("error"):
        return f"Error: {result['error']}"
    summaries = {
        "standardize": lambda r: f"{r.get('num_success', r.get('num_molecules', '?'))}/{r.get('num_molecules', '?')} molecules standardized",
        "detect_core": lambda r: (
            f"Core: {r.get('mcs_smarts', 'none')[:40]}…, "
            f"strategy: {r.get('recommended_approach', r.get('strategy', '?'))}, "
            f"coverage: {r.get('mean_mcs_coverage', r.get('mcs_coverage', 0)):.0%}"
        ),
        "rgroup_decompose": lambda r: (
            f"{r.get('num_decomposed', '?')}/{r.get('num_input', '?')} decomposed, "
            f"{len(r.get('rgroup_positions', []))} R-group positions"
        ),
        "rank_sar": lambda r: (
            f"Best substituent at {list(r.get('best_substituents', {}).keys())[0] if r.get('best_substituents') else '?'}: "
            f"{list(r.get('best_substituents', {}).values())[0] if r.get('best_substituents') else '?'}"
        ),
        "mine_mmps": lambda r: f"{r.get('num_pairs', '?')} MMP pairs found",
        "enumerate_library": lambda r: f"{r.get('num_enumerated', '?')} compounds enumerated",
        "detect_cliffs": lambda r: (
            f"{r.get('num_cliff_pairs', '?')} cliff pairs, "
            f"sensitivity: {r.get('cliff_sensitivity', '?')}"
        ),
        "scaffold_tree": lambda r: (
            f"{r.get('scaffold_tree', {}).get('num_unique_scaffolds', '?')} unique scaffolds"
        ),
        "analyze_diversity": lambda r: (
            f"Diversity score: {r.get('diversity_score', 0):.3f}, "
            f"{r.get('num_clusters', '?')} clusters"
        ),
    }
    fn = summaries.get(tool_name)
    try:
        return fn(result) if fn else f"{tool_name} completed"
    except Exception:
        return f"{tool_name} completed"


def parse_uploaded_file(filename: str, content_b64: str) -> Dict:
    """Parse a base64-encoded uploaded file into molecules."""
    content_bytes = base64.b64decode(content_b64)
    # parse_upload expects a str; decode bytes here so CSV/SMILES parsers work correctly
    try:
        content_str = content_bytes.decode("utf-8", errors="replace")
    except Exception:
        content_str = content_bytes  # SDF parser handles raw bytes via SetData
    try:
        parsed = parse_upload(content_str, filename)
        return {
            "smiles": parsed.smiles,
            "labels": parsed.labels,
            "properties": parsed.properties,
            "filename": filename,
            "num_molecules": len(parsed.smiles),
            "num_valid": parsed.num_valid,
            "property_columns": parsed.property_columns,
            "errors": parsed.errors,
        }
    except Exception as e:
        return {"error": str(e), "filename": filename}
