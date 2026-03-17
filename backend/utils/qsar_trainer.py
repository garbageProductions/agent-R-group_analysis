"""
QSAR model trainer for REINVENT4 scoring integration.
Trains a RandomForestRegressor on Morgan fingerprints.
No LLM involved — pure sklearn.
"""

import logging
from pathlib import Path
from typing import Dict, List, Any

import joblib
import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score

logger = logging.getLogger(__name__)

CV_FOLDS = 5
MIN_SAMPLES = 10
MIN_R2 = -1.0
FP_RADIUS = 2
FP_NBITS = 2048


class QSARTrainingFailed(Exception):
    """Raised when QSAR training cannot produce a usable model."""


class QSARTrainer:
    """
    Trains a RandomForestRegressor QSAR model and exports it for use
    as a REINVENT4 predictive_property scoring component.
    """

    def train(
        self,
        smiles: List[str],
        activity: List[float],
        output_dir: Path,
    ) -> Dict[str, Any]:
        """
        Train a QSAR model and export it.

        Args:
            smiles:      List of SMILES strings (training set)
            activity:    Corresponding activity values (same length)
            output_dir:  Directory to write qsar_model.pkl

        Returns:
            {model_path, cv_r2, scoring_component_config}

        Raises:
            QSARTrainingFailed: if dataset is too small or model quality is insufficient
        """
        if len(smiles) < MIN_SAMPLES:
            raise QSARTrainingFailed(
                f"Too few training samples: {len(smiles)} < {MIN_SAMPLES} required"
            )

        X = self._smiles_to_fingerprints(smiles)
        y = np.array(activity, dtype=float)

        model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
        cv_scores = cross_val_score(model, X, y, cv=CV_FOLDS, scoring="r2")
        cv_r2 = float(np.mean(cv_scores))

        if cv_r2 < MIN_R2:
            raise QSARTrainingFailed(
                f"R2 too low for reliable scoring: cv_r2={cv_r2:.3f} < {MIN_R2} threshold"
            )

        # Fit on full dataset before export
        model.fit(X, y)

        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        model_path = output_dir / "qsar_model.pkl"
        joblib.dump(model, model_path)
        logger.info(f"QSAR model saved to {model_path} (cv_r2={cv_r2:.3f})")

        scoring_component_config = {
            "name": "qsar_activity",
            "model_path": str(model_path),
            "weight": 0.6,
            "type": "predictive_property",
        }

        return {
            "model_path": model_path,
            "cv_r2": cv_r2,
            "scoring_component_config": scoring_component_config,
        }

    def _smiles_to_fingerprints(self, smiles: List[str]) -> np.ndarray:
        fps = []
        for smi in smiles:
            mol = Chem.MolFromSmiles(smi)
            if mol is None:
                fps.append(np.zeros(FP_NBITS, dtype=np.uint8))
                continue
            fp = AllChem.GetMorganFingerprintAsBitVect(mol, FP_RADIUS, nBits=FP_NBITS)
            fps.append(np.array(fp, dtype=np.uint8))
        return np.vstack(fps)
