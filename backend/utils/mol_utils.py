"""
Molecule utility functions: SVG generation, fingerprinting, property calculations.
"""

import logging
from typing import List, Optional, Dict, Any, Tuple

from rdkit import Chem
from rdkit.Chem import AllChem, Draw
from rdkit.Chem.Draw import rdMolDraw2D

logger = logging.getLogger(__name__)


def mol_to_svg(
    smiles: str,
    width: int = 250,
    height: int = 200,
    highlight_atoms: Optional[List[int]] = None,
    highlight_bonds: Optional[List[int]] = None,
) -> Optional[str]:
    """
    Render a molecule SMILES to an SVG string.
    """
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None
        AllChem.Compute2DCoords(mol)
        drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
        drawer.drawOptions().addStereoAnnotation = True
        if highlight_atoms or highlight_bonds:
            drawer.DrawMolecule(
                mol,
                highlightAtoms=highlight_atoms or [],
                highlightBonds=highlight_bonds or [],
            )
        else:
            drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        return drawer.GetDrawingText()
    except Exception as e:
        logger.error(f"SVG generation failed for {smiles}: {e}")
        return None


def mols_to_svg_grid(
    smiles_list: List[str],
    labels: Optional[List[str]] = None,
    mols_per_row: int = 4,
    mol_width: int = 200,
    mol_height: int = 150,
) -> Optional[str]:
    """
    Render multiple molecules as an SVG grid.
    """
    try:
        mols = []
        valid_labels = []
        for i, smi in enumerate(smiles_list):
            mol = Chem.MolFromSmiles(smi)
            if mol is not None:
                AllChem.Compute2DCoords(mol)
                mols.append(mol)
                valid_labels.append(labels[i] if labels and i < len(labels) else f"Mol_{i}")

        if not mols:
            return None

        n_rows = (len(mols) + mols_per_row - 1) // mols_per_row
        total_width = mols_per_row * mol_width
        total_height = n_rows * mol_height

        drawer = rdMolDraw2D.MolDraw2DSVG(total_width, total_height, mol_width, mol_height)
        drawer.DrawMolecules(mols, legends=valid_labels)
        drawer.FinishDrawing()
        return drawer.GetDrawingText()
    except Exception as e:
        logger.error(f"SVG grid generation failed: {e}")
        return None


def smiles_to_morgan_fp(
    smiles: str,
    radius: int = 2,
    nbits: int = 2048,
) -> Optional[Any]:
    """Return Morgan fingerprint bit vector or None."""
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None
        return AllChem.GetMorganFingerprintAsBitVect(mol, radius, nBits=nbits)
    except Exception:
        return None


def compute_2d_coords_for_smiles_list(smiles_list: List[str]) -> List[Optional[str]]:
    """
    Compute 2D coords and return canonical SMILES with embedded coords.
    Useful for downstream rendering.
    """
    result = []
    for smi in smiles_list:
        try:
            mol = Chem.MolFromSmiles(smi)
            if mol is not None:
                AllChem.Compute2DCoords(mol)
                result.append(Chem.MolToSmiles(mol))
            else:
                result.append(None)
        except Exception:
            result.append(None)
    return result
