"""Shared pytest fixtures for REINVENT4 tests."""

import csv
import io
from pathlib import Path

import pytest


SAMPLE_SMILES = [
    "O=C(Cc1ccccc1)Nc1ccccc1",
    "O=C(Cc1ccc(F)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(Cl)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(Br)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(C)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(OC)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(CF)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(CN)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(CC)cc1)Nc1ccccc1",
    "O=C(Cc1ccc(CF)cc1)Nc1ccc(F)cc1",
    "O=C(Cc1ccc(Cl)cc1)Nc1ccc(Cl)cc1",
    "O=C(Cc1ccc(Br)cc1)Nc1ccc(F)cc1",
]

SAMPLE_ACTIVITY = [6.0, 6.8, 7.2, 7.1, 6.5, 6.3, 6.9, 6.1, 6.4, 7.5, 7.3, 7.0]


@pytest.fixture
def sample_smiles():
    return SAMPLE_SMILES.copy()


@pytest.fixture
def sample_activity():
    return SAMPLE_ACTIVITY.copy()


@pytest.fixture
def tmp_output_dir(tmp_path):
    out = tmp_path / "reinvent_output"
    out.mkdir()
    return out


@pytest.fixture
def sample_csv_path():
    return Path(__file__).parent / "fixtures" / "sample_reinvent4_output.csv"
