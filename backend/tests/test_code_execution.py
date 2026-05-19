"""Tests for Judge0 stub (`app.game.code_execution`).

Full HTTP-mocked tests belong here when `run_code` is implemented.
See docs/superpowers/specs/2026-05-16-ai-judge-judge0-stubs.md.
"""

from __future__ import annotations

import asyncio

import pytest

from app.game.schemas import TestCase as JudgeTestCase
from app.game.code_execution import run_code


def test_run_code_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="run_code"):
        asyncio.run(
            run_code(
                "def f():\n    return 1",
                "python",
                [JudgeTestCase(stdin="", expectedStdout="1\n")],
            )
        )
