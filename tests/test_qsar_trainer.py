"""Unit tests for QSARTrainer."""

import numpy as np
import pytest
from pathlib import Path
from unittest.mock import patch

from backend.utils.qsar_trainer import QSARTrainer, QSARTrainingFailed


class TestQSARTrainerHappyPath:
    """Happy path tests mock cross_val_score to avoid dependency on dataset size."""

    @pytest.fixture(autouse=True)
    def mock_cv(self):
        with patch("backend.utils.qsar_trainer.cross_val_score",
                   return_value=np.array([0.40, 0.35, 0.38, 0.42, 0.37])) as m:
            yield m

    def test_train_returns_model_path(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert "model_path" in result
        assert Path(result["model_path"]).exists()

    def test_model_path_is_pkl(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert str(result["model_path"]).endswith(".pkl")

    def test_train_returns_cv_r2(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert "cv_r2" in result
        assert isinstance(result["cv_r2"], float)
        assert -1.0 <= result["cv_r2"] <= 1.0

    def test_train_returns_scoring_component_config(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert "scoring_component_config" in result
        cfg = result["scoring_component_config"]
        assert "model_path" in cfg
        assert "weight" in cfg
        assert "name" in cfg

    def test_scoring_config_model_path_matches_model_file(self, sample_smiles, sample_activity, tmp_output_dir):
        trainer = QSARTrainer()
        result = trainer.train(sample_smiles, sample_activity, tmp_output_dir)
        assert result["scoring_component_config"]["model_path"] == str(result["model_path"])

    def test_cv_called_with_correct_folds(self, mock_cv, sample_smiles, sample_activity, tmp_output_dir):
        QSARTrainer().train(sample_smiles, sample_activity, tmp_output_dir)
        mock_cv.assert_called_once()
        _, kwargs = mock_cv.call_args
        assert kwargs.get("cv") == 5
        assert kwargs.get("scoring") == "r2"


class TestQSARTrainerFallback:
    def test_raises_when_too_few_samples(self, tmp_output_dir):
        trainer = QSARTrainer()
        few_smiles = ["O=C(Cc1ccccc1)Nc1ccccc1"] * 5
        few_activity = [6.0] * 5
        with pytest.raises(QSARTrainingFailed) as exc_info:
            trainer.train(few_smiles, few_activity, tmp_output_dir)
        assert "too few" in str(exc_info.value).lower()

    def test_raises_when_low_r2(self, tmp_output_dir):
        trainer = QSARTrainer()
        # Identical SMILES → zero variance in features → R² will be ~0
        smiles = ["O=C(Cc1ccccc1)Nc1ccccc1"] * 15
        activity = list(range(15))  # Random activity, no FP signal
        with pytest.raises(QSARTrainingFailed) as exc_info:
            trainer.train(smiles, activity, tmp_output_dir)
        assert "r2" in str(exc_info.value).lower()
