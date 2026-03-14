"""
Tool: scaffold_tree  [ADDITIONAL AGENT]
Builds a hierarchical Murcko scaffold decomposition tree.
Shows scaffold frequencies, property distributions, and abstraction levels.
Useful for understanding scaffold diversity and navigating chemical space.
"""

import logging
from collections import defaultdict, Counter
from typing import List, Optional, Dict, Any

from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors
from rdkit.Chem.Scaffolds import MurckoScaffold

logger = logging.getLogger(__name__)


def _get_murcko(mol) -> Optional[str]:
    try:
        s = MurckoScaffold.GetScaffoldForMol(mol)
        return Chem.MolToSmiles(s) if s else None
    except Exception:
        return None


def _get_generic_murcko(mol) -> Optional[str]:
    try:
        s = MurckoScaffold.GetScaffoldForMol(mol)
        if s:
            g = MurckoScaffold.MakeScaffoldGeneric(s)
            return Chem.MolToSmiles(g) if g else None
    except Exception:
        return None


def _remove_one_ring(scaffold_smiles: str) -> Optional[str]:
    """
    Progressively strip terminal rings to build scaffold hierarchy.
    Returns parent scaffold (one ring removed) or None if no further simplification.
    """
    try:
        mol = Chem.MolFromSmiles(scaffold_smiles)
        if mol is None:
            return None
        ring_info = mol.GetRingInfo()
        if ring_info.NumRings() <= 1:
            return None

        # Find terminal ring atoms (ring atoms with all bonds within the ring or to non-ring atoms)
        atom_rings = ring_info.AtomRings()
        ring_atoms_sets = [set(r) for r in atom_rings]

        for ring_atoms in atom_rings:
            ring_set = set(ring_atoms)
            # Count how many atoms in this ring are in other rings
            shared_with_other = sum(
                1 for other in ring_atoms_sets
                if other != ring_set and ring_set & other
            )
            # A terminal ring shares atoms with at most 1 other ring system
            if shared_with_other <= 1:
                # Try removing these atoms
                em = Chem.RWMol(mol)
                # Remove terminal ring atoms (those not in any other ring)
                atoms_to_remove = sorted(
                    [a for a in ring_atoms if not any(a in other for other in ring_atoms_sets if other != ring_set)],
                    reverse=True,
                )
                for atom_idx in atoms_to_remove:
                    em.RemoveAtom(atom_idx)
                try:
                    parent = em.GetMol()
                    Chem.SanitizeMol(parent)
                    s = MurckoScaffold.GetScaffoldForMol(parent)
                    if s and s.GetNumHeavyAtoms() > 0:
                        return Chem.MolToSmiles(s)
                except Exception:
                    pass
    except Exception:
        pass
    return None


def _scaffold_properties(scaffold_smiles: str) -> Dict[str, Any]:
    mol = Chem.MolFromSmiles(scaffold_smiles)
    if mol is None:
        return {}
    return {
        "num_heavy_atoms": mol.GetNumHeavyAtoms(),
        "num_rings": rdMolDescriptors.CalcNumRings(mol),
        "num_aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(mol),
        "molecular_weight": round(Descriptors.MolWt(mol), 2),
        "logp": round(Descriptors.MolLogP(mol), 2),
    }


def build_scaffold_tree(
    smiles_list: List[str],
    labels: Optional[List[str]] = None,
    properties: Optional[Dict[str, List[float]]] = None,
    include_generics: bool = True,
    max_tree_depth: int = 4,
) -> Dict[str, Any]:
    """
    Build a Murcko scaffold hierarchy for a compound set.

    Args:
        smiles_list:      Input SMILES
        labels:           Molecule identifiers
        properties:       {prop_name: [values]} for property distribution per scaffold
        include_generics: Also compute generic (atom-agnostic) scaffolds
        max_tree_depth:   Maximum levels of scaffold abstraction

    Returns:
        dict with keys:
          - num_molecules
          - num_unique_scaffolds
          - scaffold_tree: hierarchical scaffold nodes
          - scaffold_list: flat list of all scaffolds sorted by frequency
          - generic_scaffolds: generic scaffold distribution
          - scaffold_property_profiles: property stats per scaffold
    """
    result: Dict[str, Any] = {
        "num_molecules": 0,
        "num_unique_scaffolds": 0,
        "scaffold_tree": [],
        "scaffold_list": [],
        "generic_scaffolds": {},
        "scaffold_property_profiles": {},
        "error": None,
    }

    if labels is None:
        labels = [f"Mol_{i}" for i in range(len(smiles_list))]

    # Parse molecules and compute scaffolds
    mol_records = []
    scaffold_to_mols: Dict[str, List[int]] = defaultdict(list)
    generic_counter: Counter = Counter()

    for i, smi in enumerate(smiles_list):
        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            continue
        scaffold = _get_murcko(mol)
        if scaffold is None:
            scaffold = "__acyclic__"
        generic = _get_generic_murcko(mol) if include_generics else None

        mol_records.append({
            "idx": i,
            "smiles": smi,
            "label": labels[i],
            "scaffold": scaffold,
            "generic_scaffold": generic,
        })
        scaffold_to_mols[scaffold].append(i)
        if generic:
            generic_counter[generic] += 1

    result["num_molecules"] = len(mol_records)
    result["num_unique_scaffolds"] = len(scaffold_to_mols)

    # Flat scaffold list with frequency
    scaffold_list = []
    for scaffold, mol_indices in sorted(scaffold_to_mols.items(), key=lambda x: -len(x[1])):
        props = _scaffold_properties(scaffold) if scaffold != "__acyclic__" else {}
        scaffold_entry: Dict[str, Any] = {
            "scaffold_smiles": scaffold,
            "count": len(mol_indices),
            "fraction": round(len(mol_indices) / max(result["num_molecules"], 1), 4),
            "molecule_indices": mol_indices,
            "molecule_labels": [labels[i] for i in mol_indices if i < len(labels)],
            **props,
        }

        # Property distributions per scaffold
        if properties:
            prop_profiles: Dict[str, Any] = {}
            for prop_name, prop_vals in properties.items():
                vals = [prop_vals[i] for i in mol_indices if i < len(prop_vals) and prop_vals[i] is not None]
                if vals:
                    mean = sum(vals) / len(vals)
                    prop_profiles[prop_name] = {
                        "mean": round(mean, 4),
                        "min": round(min(vals), 4),
                        "max": round(max(vals), 4),
                        "n": len(vals),
                    }
            scaffold_entry["property_profiles"] = prop_profiles

        scaffold_list.append(scaffold_entry)

    result["scaffold_list"] = scaffold_list

    # Generic scaffold distribution
    result["generic_scaffolds"] = {
        s: c for s, c in generic_counter.most_common(30)
    }

    # Build scaffold hierarchy tree (simple parent-child by ring stripping)
    nodes_by_scaffold: Dict[str, Dict] = {
        s["scaffold_smiles"]: {**s, "children": [], "parent": None, "depth": 0}
        for s in scaffold_list
        if s["scaffold_smiles"] != "__acyclic__"
    }

    # Assign parents
    for scaffold_smi, node in nodes_by_scaffold.items():
        parent_smi = _remove_one_ring(scaffold_smi)
        if parent_smi and parent_smi in nodes_by_scaffold:
            node["parent"] = parent_smi
            nodes_by_scaffold[parent_smi]["children"].append(scaffold_smi)

    # Find roots (no parent in our scaffold set)
    roots = [s for s, n in nodes_by_scaffold.items() if n["parent"] is None]

    def build_node(scaffold_smi: str, depth: int) -> Dict:
        node = nodes_by_scaffold[scaffold_smi]
        node["depth"] = depth
        return {
            "scaffold_smiles": scaffold_smi,
            "count": node["count"],
            "fraction": node["fraction"],
            "depth": depth,
            "num_rings": node.get("num_rings"),
            "children": [
                build_node(child, depth + 1)
                for child in node["children"]
                if depth < max_tree_depth
            ],
        }

    result["scaffold_tree"] = [build_node(r, 0) for r in sorted(roots, key=lambda s: -nodes_by_scaffold[s]["count"])]

    return result
