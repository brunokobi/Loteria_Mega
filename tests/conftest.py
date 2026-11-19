import numpy as np
import pandas as pd
import pytest

from megasena.data import COLS


def make_draws(n_draws=250, seed=0):
    """DataFrame sintetico no formato do CSV real (DrawDate + Ball1..Ball6)."""
    rng = np.random.RandomState(seed)
    balls = np.array([np.sort(rng.choice(np.arange(1, 61), 6, replace=False))
                      for _ in range(n_draws)])
    df = pd.DataFrame(balls, columns=COLS)
    df.insert(0, 'DrawDate', pd.date_range('2000-01-01', periods=n_draws, freq='3D')
              .strftime('%Y-%m-%d 00:00:00'))
    return df


@pytest.fixture
def draws():
    return make_draws()
