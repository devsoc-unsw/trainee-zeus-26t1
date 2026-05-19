# Per-round language picker — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development to run tasks in order.

**Goal:** Per-player language on code rounds through submit → reveal.

**Architecture:** `Submission` dataclass in backend room state; optional `language` on Pydantic payloads; shared `LanguagePicker` on frontend code pages.

**Tech stack:** FastAPI WebSocket hub, Next.js 16, CSS Modules.

---

### Task 1: Backend schemas + room storage

**Files:** `backend/app/game/schemas.py`, `backend/app/game/room.py`

- Add `Language` literal and fields on `RoundSubmitPayload`, `SubmissionOut`, `ChainSegment`.
- Add `Submission` dataclass; change `Room.submissions` to `dict[int, dict[str, Submission]]`.

### Task 2: GameHub wiring

**Files:** `backend/app/game/manager.py`

- Store `Submission` in `_round_submit`; read `.content` in `_build_seed`; emit `language` in `_end_round` and `_chains_payload`.

### Task 3: Tests + fixtures

**Files:** `backend/tests/conftest.py`, `test_game_ws.py`, `ws_workflow.py`, `test_scoring.py`

- Update fixtures to `Submission` objects; assert language on reveal; add cross-language test.

### Task 4: Frontend socket + LanguagePicker

**Files:** `frontend/src/lib/socket/round.js`, `useRound.js`, `components/game/LanguagePicker.jsx`

### Task 5: Wire editor, reimplement, reveal pages

**Files:** `frontend/src/app/editor/page.jsx`, `reimplement/page.jsx`, `reveal/page.jsx`

### Task 6: Docs

**Files:** `docs/API.md`, `backend/openapi.yaml`

### Task 7: Verify

```bash
cd backend && pytest -v
cd frontend && npm run build
```
