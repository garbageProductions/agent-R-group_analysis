"""
Tool: standardize_molecule
Cleans, normalizes, and computes properties for input SMILES.
Handles salt stripping, tautomer normalization, charge neutralization.
"""

import logging
from typing import List, Optional, Dict, Any

from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors, AllChem
from rdkit.Chem.MolStandardize import rdMolStandardize

logger = logging.getLogger(__name__)


def _get_inchikey(mol) -> Optional[str]:
    try:
        from rdkit.Chem.inchi import MolToInchi, InchiToInchiKey
        inchi = MolToInchi(mol)
        if inchi:
            return InchiToInchiKey(inchi)
    except Exception:
        pass
    try:
        return Chem.InchiToInchiKey(Chem.MolToInchi(mol))
    except Exception:
        return None


def standardize_molecule(
    smiles: str,
    remove_salts: bool = True,
    normalize: bool = True,
    neutralize: bool = True,
    compute_properties: bool = True,
) -> Dict[str, Any]:
    """
    Standardize a single molecule from SMILES.

    Returns:
        dict with keys: original_smiles, canonical_smiles, standardized_smiles,
        inchikey, molecular_formula, molecular_weight, num_heavy_atoms,
        num_rings, num_rotatable_bonds, logp, hbd, hba, tpsa,
        lipinski_pass, warnings, success, error
    """
    result: Dict[str, Any] = {
        "original_smiles": smiles,
        "canonical_smiles": None,
        "standardized_smiles": None,
        "inchikey": None,
        "molecular_formula": None,
        "molecular_weight": None,
        "num_heavy_atoms": None,
        "num_rings": None,
        "num_rotatable_bonds": None,
        "logp": None,
        "hbd": None,
        "hba": None,
        "tpsa": None,
        "lipinski_pass": None,
        "warnings": [],
        "success": False,
        "error": None,
    }

    if not smiles or not isinstance(smiles, str):
        result["error"] = "Empty or invalid SMILES input"
        return result

    try:
        mol = Chem.MolFromSmiles(smiles.strip())
        if mol is None:
            result["error"] = f"RDKit could not parse SMILES: {smiles}"
            return result

        result["canonical_smiles"] = Chem.MolToSmiles(mol)

        # --- Standardization pipeline ---
        try:
            if remove_salts:
                lfc = rdMolStandardize.LargestFragmentChooser()
                mol_frag = lfc.choose(mol)
                if Chem.MolToSmiles(mol_frag) != Chem.MolToSmiles(mol):
                    result["warnings"].append("Salt/fragment removed during standardization")
                mol = mol_frag

            if normalize:
                normalizer = rdMolStandardize.Normalizer()
                mol = normalizer.normalize(mol)

            if neutralize:
                uncharger = rdMolStandardize.Uncharger()
                mol_neutral = uncharger.uncharge(mol)
                if Chem.MolToSmiles(mol_neutral) != Chem.MolToSmiles(mol):
                    result["warnings"].append("Charge neutralized during standardization")
                mol = mol_neutral

            Chem.SanitizeMol(mol)
        except Exception as e:
            result["warnings"].append(f"Standardization step failed: {e}; using canonical SMILES")
            mol = Chem.MolFromSmiles(result["canonical_smiles"])

        result["standardized_smiles"] = Chem.MolToSmiles(mol)
        result["inchikey"] = _get_inchikey(mol)

        if compute_properties:
            result["molecular_formula"] = rdMolDescriptors.CalcMolFormula(mol)
            result["molecular_weight"] = round(Descriptors.MolWt(mol), 3)
            result["num_heavy_atoms"] = mol.GetNumHeavyAtoms()
            result["num_rings"] = rdMolDescriptors.CalcNumRings(mol)
            result["num_rotatable_bonds"] = rdMolDescriptors.CalcNumRotatableBonds(mol)
            result["logp"] = round(Descriptors.MolLogP(mol), 3)
            result["hbd"] = rdMolDescriptors.CalcNumHBD(mol)
            result["hba"] = rdMolDescriptors.CalcNumHBA(mol)
            result["tpsa"] = round(Descriptors.TPSA(mol), 3)
            result["lipinski_pass"] = (
                result["molecular_weight"] <= 500
                and result["logp"] <= 5
                and result["hbd"] <= 5
                and result["hba"] <= 10
            )

        result["success"] = True

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"Error standardizing '{smiles}': {e}", exc_info=True)

    return result


def standardize_molecules_batch(
    smiles_list: List[str],
    remove_salts: bool = True,
    normalize: bool = True,
    neutralize: bool = True,
    compute_properties: bool = True,
) -> Dict[str, Any]:
    """
    Standardize a batch of SMILES strings.

    Returns:
        dict with keys: results (list), num_molecules, num_success,
        num_failed, errors, success_rate
    """
    results = []
    errors = []

    for i, smiles in enumerate(smiles_list):
        res = standardize_molecule(
            smiles,
            remove_salts=remove_salts,
            normalize=normalize,
            neutralize=neutralize,
            compute_properties=compute_properties,
        )
        results.append(res)
        if not res["success"]:
            errors.append({"index": i, "smiles": smiles, "error": res["error"]})

    success_count = sum(1 for r in results if r["success"])

    return {
        "results": results,
        "num_molecules": len(smiles_list),
        "num_success": success_count,
        "num_failed": len(smiles_list) - success_count,
        "errors": errors,
        "success_rate": round(success_count / len(smiles_list), 4) if smiles_list else 0.0,
    }
