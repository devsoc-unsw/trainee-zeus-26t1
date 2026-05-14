import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))


@pytest.fixture(autouse=True)
def _reset_game_hub():
    """Isolate WebSocket game state between tests."""
    from app.game.manager import hub

    hub.reset_for_tests()
    yield
    hub.reset_for_tests()
