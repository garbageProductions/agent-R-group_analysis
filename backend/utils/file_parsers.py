"""
File parsers for SDF, CSV, and plain SMILES uploads.
Returns a unified ParsedDataset object.
"""

import csv
import io
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)


@dataclass
class ParsedDataset:
    smiles: List[str] = field(default_factory=list)
    labels: List[str] = field(default_factory=list)
    properties: Dict[str, List[Any]] = field(default_factory=dict)
    num_molecules: int = 0
    num_valid: int = 0
    source_format: str = "unknown"
    property_columns: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def _parse_sdf(content: str) -> ParsedDataset:
    """Parse SDF file content."""
    from rdkit import Chem
    from rdkit.Chem import PandasTools
    import pandas as pd

    ds = ParsedDataset(source_format="sdf")

    try:
        supplier = Chem.SDMolSupplier()
        supplier.SetData(content.encode() if isinstance(content, str) else content)

        property_cols_set: set = set()
        records = []
        for i, mol in enumerate(supplier):
            if mol is None:
                ds.errors.append(f"Molecule {i} could not be parsed (skipped)")
                continue

            from rdkit import Chem as _Chem
            smi = _Chem.MolToSmiles(mol)
            label = mol.GetProp("_Name") if mol.HasProp("_Name") else f"Mol_{i}"
            props = {}
            for prop_name in mol.GetPropNames():
                if prop_name.startswith("_"):
                    continue
                try:
                    props[prop_name] = float(mol.GetProp(prop_name))
                except (ValueError, TypeError):
                    props[prop_name] = mol.GetProp(prop_name)
                property_cols_set.add(prop_name)

            records.append({"smiles": smi, "label": label, "props": props})

        ds.smiles = [r["smiles"] for r in records]
        ds.labels = [r["label"] for r in records]
        ds.property_columns = sorted(property_cols_set)

        for col in ds.property_columns:
            ds.properties[col] = [r["props"].get(col) for r in records]

        ds.num_molecules = len(supplier) if hasattr(supplier, '__len__') else len(records)
        ds.num_valid = len(records)

    except Exception as e:
        ds.errors.append(f"SDF parsing error: {e}")
        logger.error(f"SDF parse error: {e}", exc_info=True)

    return ds


def _parse_csv(content: str) -> ParsedDataset:
    """
    Parse CSV with a SMILES column.
    Looks for columns named 'smiles', 'SMILES', 'Smiles', 'canonical_smiles'.
    First non-SMILES string column is treated as label.
    All numeric columns are treated as properties.
    """
    from rdkit import Chem

    ds = ParsedDataset(source_format="csv")

    try:
        reader = csv.DictReader(io.StringIO(content))
        rows = list(reader)
        if not rows:
            ds.errors.append("CSV is empty")
            return ds

        headers = list(rows[0].keys())

        # Find SMILES column
        smiles_col = None
        for candidate in ["smiles", "SMILES", "Smiles", "canonical_smiles", "Canonical_SMILES"]:
            if candidate in headers:
                smiles_col = candidate
                break
        if smiles_col is None:
            # Try first column
            smiles_col = headers[0]
            logger.warning(f"No SMILES column found by name; using first column: {smiles_col}")

        # Find label column
        label_col = None
        for candidate in ["id", "ID", "name", "Name", "compound_id", "mol_id", "label"]:
            if candidate in headers and candidate != smiles_col:
                label_col = candidate
                break

        # Identify property columns (numeric)
        prop_cols = []
        for h in headers:
            if h == smiles_col or h == label_col:
                continue
            # Check if first non-empty value is numeric
            for row in rows:
                val = row.get(h, "").strip()
                if val:
                    try:
                        float(val)
                        prop_cols.append(h)
                    except ValueError:
                        pass
                    break

        # Parse rows
        for i, row in enumerate(rows):
            smi = row.get(smiles_col, "").strip()
            if not smi:
                continue
            mol = Chem.MolFromSmiles(smi)
            if mol is None:
                ds.errors.append(f"Row {i}: invalid SMILES '{smi}'")
                continue
            ds.smiles.append(Chem.MolToSmiles(mol))
            ds.labels.append(
                row.get(label_col, f"Mol_{i}").strip() if label_col else f"Mol_{i}"
            )
            for col in prop_cols:
                val_str = row.get(col, "").strip()
                try:
                    ds.properties.setdefault(col, []).append(float(val_str))
                except (ValueError, TypeError):
                    ds.properties.setdefault(col, []).append(None)

        ds.num_molecules = len(rows)
        ds.num_valid = len(ds.smiles)
        ds.property_columns = prop_cols

    except Exception as e:
        ds.errors.append(f"CSV parsing error: {e}")
        logger.error(f"CSV parse error: {e}", exc_info=True)

    return ds


def _parse_smiles(content: str) -> ParsedDataset:
    """
    Parse a plain SMILES file (one SMILES per line, optionally with name).
    Format: SMILES [whitespace] [name]
    """
    from rdkit import Chem

    ds = ParsedDataset(source_format="smiles")

    for i, line in enumerate(content.splitlines()):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        smi = parts[0]
        label = parts[1] if len(parts) > 1 else f"Mol_{i}"

        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            ds.errors.append(f"Line {i}: invalid SMILES '{smi}'")
            ds.num_molecules += 1
            continue

        ds.smiles.append(Chem.MolToSmiles(mol))
        ds.labels.append(label)
        ds.num_molecules += 1

    ds.num_valid = len(ds.smiles)
    return ds


def parse_upload(content: str, filename: str) -> ParsedDataset:
    """
    Auto-detect and parse uploaded file.

    Args:
        content:  File content as string
        filename: Original filename (used to detect format)

    Returns:
        ParsedDataset with smiles, labels, properties
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "sdf" or ext == "mol":
        return _parse_sdf(content)
    elif ext == "csv":
        return _parse_csv(content)
    elif ext in ("smi", "smiles", "txt"):
        return _parse_smiles(content)
    else:
        # Try to auto-detect
        stripped = content.strip()
        if "$$$$" in stripped or "V2000" in stripped or "V3000" in stripped:
            return _parse_sdf(content)
        elif "," in stripped.split("\n")[0]:
            return _parse_csv(content)
        else:
            return _parse_smiles(content)


def parse_activity_csv(
    content: str,
    existing_labels: List[str],
) -> "tuple[List[str], Dict[str, List[Any]]]":
    """
    Parse a CSV of activity/property data and align it to existing session molecules.

    The CSV must have at least one numeric column (treated as a property) and
    one non-numeric column (treated as the molecule label/ID).

    Label matching: exact match first, then case-insensitive. Molecules in
    ``existing_labels`` that have no match in the CSV get ``None`` for every
    new property column.

    Args:
        content: Raw CSV text.
        existing_labels: Ordered list of molecule labels from the active session.

    Returns:
        ``(property_columns, properties)`` where ``properties`` is a
        column-keyed ``Dict[str, List[Any]]`` with one entry per column and
        values indexed by position in ``existing_labels``.

    Raises:
        ValueError: if the CSV is empty or contains no numeric columns.
    """
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    if not rows:
        raise ValueError("Activity CSV is empty")

    headers = list(rows[0].keys())

    # ── Detect label column ───────────────────────────────────────────────────
    label_col: Optional[str] = None
    for candidate in ["id", "ID", "name", "Name", "compound_id", "mol_id", "label", "smiles", "SMILES"]:
        if candidate in headers:
            label_col = candidate
            break

    if label_col is None:
        # Fall back to first column whose values are non-numeric
        for h in headers:
            for row in rows:
                val = row.get(h, "").strip()
                if val:
                    try:
                        float(val)
                    except ValueError:
                        label_col = h
                    break
            if label_col:
                break

    # ── Detect numeric (property) columns ────────────────────────────────────
    prop_cols: List[str] = []
    for h in headers:
        if h == label_col:
            continue
        # A column is considered numeric if ANY of its values can be parsed as float
        has_numeric = False
        for row in rows:
            val = row.get(h, "").strip()
            if val:
                try:
                    float(val)
                    has_numeric = True
                    break
                except ValueError:
                    pass
        if has_numeric:
            prop_cols.append(h)

    if not prop_cols:
        raise ValueError(
            f"No numeric property columns found in activity CSV. "
            f"Headers: {headers}. "
            f"Detected label column: {label_col!r}."
        )

    # ── Build label → values lookup from CSV ─────────────────────────────────
    csv_data: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        lbl = row.get(label_col, "").strip() if label_col else None
        if not lbl:
            continue
        entry: Dict[str, Any] = {}
        for col in prop_cols:
            val_str = row.get(col, "").strip()
            try:
                entry[col] = float(val_str)
            except (ValueError, TypeError):
                entry[col] = None
        csv_data[lbl] = entry

    csv_lower: Dict[str, Dict[str, Any]] = {k.lower(): v for k, v in csv_data.items()}

    # ── Align to existing_labels ──────────────────────────────────────────────
    properties: Dict[str, List[Any]] = {col: [] for col in prop_cols}
    for label in existing_labels:
        matched = csv_data.get(label) or csv_lower.get(label.lower())
        for col in prop_cols:
            properties[col].append(matched[col] if matched and col in matched else None)

    return prop_cols, properties
