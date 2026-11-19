import numpy as np

from megasena.combinations import (
    balanced_samples,
    generate_balanced_game,
    generate_model_combinations,
)


def test_balanced_game_rules():
    for seed in range(200):
        game = generate_balanced_game(np.random.RandomState(seed))
        assert game == sorted(game)
        assert len(set(game)) == 6
        assert all(1 <= n <= 60 for n in game)
        assert 110 <= sum(game) <= 230
        assert 2 <= sum(1 for n in game if n % 2 == 0) <= 4
        assert sum(1 for a, b in zip(game, game[1:]) if b - a == 1) <= 1
        assert len({(n - 1) // 10 for n in game}) >= 3


def test_balanced_game_is_deterministic():
    a = generate_balanced_game(np.random.RandomState(7))
    b = generate_balanced_game(np.random.RandomState(7))
    assert a == b


def test_balanced_samples_unique():
    games = balanced_samples(n_games=10)
    assert len({tuple(g['numbers']) for g in games}) == 10
    assert all(g['even'] + g['odd'] == 6 for g in games)


def test_model_combinations():
    probs = np.linspace(0.05, 0.15, 60)
    games = generate_model_combinations(probs, n_games=30)
    assert len({tuple(nums) for nums, _ in games}) == 30
    scores = [round(s, 4) for _, s in games]
    assert scores == sorted(scores, reverse=True)
    for nums, s in games:
        assert np.isclose(s, probs[np.array(nums) - 1].mean())
