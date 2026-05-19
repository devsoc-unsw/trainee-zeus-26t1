from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any

from pydantic import ValidationError
from starlette.websockets import WebSocket, WebSocketDisconnect, WebSocketState

from app.db import game_repository
from app.game.prompts import fetch_random_prompt_text
from app.game.room import (
    DEFAULT_TIME_LIMITS,
    REVEAL_TO_OVER_SEC,
    STARTER_LINES,
    Room,
    Player,
    Submission,
    new_id,
    new_room_code,
    now_ms,
    round_type_for_num,
)
from app.game.schemas import (
    ChainScore,
    RevealElo,
    GameSyncPayload,
    RoomCreatePayload,
    RoomJoinPayload,
    RoundSeed,
    RoundSubmitPayload,
    outbound_event,
    camelize_model,
)

logger = logging.getLogger(__name__)


def _persist_async(fn: Any, *args: Any, **kwargs: Any) -> None:
    """Run a synchronous Supabase helper without blocking the event loop."""

    async def _run() -> None:
        try:
            await asyncio.to_thread(fn, *args, **kwargs)
        except Exception:  # noqa: BLE001
            logger.debug("persist_async %s", getattr(fn, "__name__", fn), exc_info=True)

    try:
        asyncio.get_running_loop().create_task(_run())
    except RuntimeError:
        try:
            fn(*args, **kwargs)
        except Exception:  # noqa: BLE001
            logger.debug("persist_sync %s", getattr(fn, "__name__", fn), exc_info=True)


async def _ws_send(ws: WebSocket, payload: dict[str, Any]) -> None:
    if ws.client_state != WebSocketState.CONNECTED:
        return
    await ws.send_json(payload)


class GameHub:
    """In-memory rooms + WebSocket routing (Project Planning socket spec)."""

    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        self._code_to_room: dict[str, str] = {}
        self._socket_ctx: dict[int, tuple[str, str]] = {}

    def _register_ctx(self, ws: WebSocket, room_id: str, player_id: str) -> None:
        self._socket_ctx[id(ws)] = (room_id, player_id)

    def _clear_ctx(self, ws: WebSocket) -> None:
        self._socket_ctx.pop(id(ws), None)

    def _ctx(self, ws: WebSocket) -> tuple[str, str] | None:
        return self._socket_ctx.get(id(ws))

    async def handle_connection(self, ws: WebSocket) -> None:
        await ws.accept()
        try:
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                ev = msg.get("event")
                data = msg.get("data") or {}
                if not isinstance(ev, str):
                    continue
                await self._dispatch(ws, ev, data)
        except WebSocketDisconnect:
            await self._on_disconnect(ws)
        except Exception:  # noqa: BLE001
            logger.exception("websocket loop error")
            await self._on_disconnect(ws)

    async def _dispatch(self, ws: WebSocket, event: str, data: dict[str, Any]) -> None:
        if event == "room:create":
            await self._room_create(ws, data)
        elif event == "room:join":
            await self._room_join(ws, data)
        elif event == "room:leave":
            await self._room_leave(ws)
        elif event == "game:start":
            await self._game_start(ws)
        elif event == "round:submit":
            await self._round_submit(ws, data)
        elif event == "game:sync":
            await self._game_sync(ws, data)
        elif event == "game:reset":
            await self._game_reset(ws)

    async def _emit_error(
        self, ws: WebSocket, code: str, message: str
    ) -> None:
        await _ws_send(ws, outbound_event("room:error", {"code": code, "message": message}))

    async def _broadcast(
        self, room: Room, event: str, payload: dict[str, Any], *, exclude: WebSocket | None = None
    ) -> None:
        body = outbound_event(event, payload)
        for p in room.players.values():
            if p.socket is None or p.socket is exclude:
                continue
            await _ws_send(p.socket, body)

    async def _send_room_updated(self, room: Room) -> None:
        await self._broadcast(
            room,
            "room:updated",
            {"players": room.public_players(), "hostId": room.host_id},
        )

    def _unique_code(self) -> str:
        for _ in range(64):
            c = new_room_code()
            if c not in self._code_to_room:
                return c
        return new_room_code() + "X"

    async def _room_create(self, ws: WebSocket, data: dict[str, Any]) -> None:
        if self._ctx(ws):
            return
        try:
            payload = RoomCreatePayload.model_validate(data)
        except ValidationError:
            await self._emit_error(
                ws,
                "ROOM_NOT_FOUND",
                "Invalid room:create (name must be non-empty, roundCount 3 or 5)",
            )
            return

        room_id = new_id()
        player_id = new_id()
        code = self._unique_code()
        host = Player(id=player_id, name=payload.name, is_host=True, socket=ws, connected=True)
        room = Room(
            id=room_id,
            code=code,
            host_id=player_id,
            players={player_id: host},
            player_order=[player_id],
            round_count=payload.round_count,
        )
        self._rooms[room_id] = room
        self._code_to_room[code] = room_id
        self._register_ctx(ws, room_id, player_id)

        await asyncio.to_thread(
            game_repository.persist_room_created,
            room_id,
            code,
            player_id,
            payload.name,
            payload.round_count,
            ws,
        )

        await _ws_send(
            ws,
            outbound_event(
                "room:created",
                {
                    "roomId": room_id,
                    "code": code,
                    "playerId": player_id,
                    "players": room.public_players(),
                },
            ),
        )

    async def _room_join(self, ws: WebSocket, data: dict[str, Any]) -> None:
        if self._ctx(ws):
            return
        try:
            payload = RoomJoinPayload.model_validate(data)
        except ValidationError:
            await self._emit_error(ws, "ROOM_NOT_FOUND", "Invalid room:join payload")
            return

        room_id = self._code_to_room.get(payload.code)
        if not room_id or room_id not in self._rooms:
            await self._emit_error(ws, "ROOM_NOT_FOUND", "No room with that code")
            return

        room = self._rooms[room_id]
        async with room.lock:
            if room.status != "lobby":
                await self._emit_error(ws, "GAME_IN_PROGRESS", "Cannot join an active game")
                return
            taken = any(p.name.lower() == payload.name.lower() for p in room.players.values())
            if taken:
                await self._emit_error(ws, "NAME_TAKEN", "That display name is already in use")
                return

            player_id = new_id()
            pl = Player(id=player_id, name=payload.name, is_host=False, socket=ws, connected=True)
            room.players[player_id] = pl
            room.player_order.append(player_id)

        self._register_ctx(ws, room_id, player_id)

        await asyncio.to_thread(
            game_repository.persist_player_joined,
            player_id,
            payload.name,
            room_id,
            False,
            ws,
        )

        await _ws_send(
            ws,
            outbound_event(
                "room:joined",
                {
                    "roomId": room_id,
                    "code": room.code,
                    "hostId": room.host_id,
                    "roundCount": room.round_count,
                    "playerId": player_id,
                    "players": room.public_players(),
                },
            ),
        )
        await self._send_room_updated(room)

    async def _room_leave(self, ws: WebSocket) -> None:
        ctx = self._ctx(ws)
        if not ctx:
            return
        room_id, player_id = ctx
        room = self._rooms.get(room_id)
        if not room:
            self._clear_ctx(ws)
            return
        async with room.lock:
            await self._remove_player(room, player_id)
        self._clear_ctx(ws)

    async def _remove_player(self, room: Room, player_id: str) -> None:
        old_host_id = room.host_id
        pl = room.players.pop(player_id, None)
        if pl and pl.socket:
            try:
                await pl.socket.close()
            except Exception:  # noqa: BLE001
                pass
        if player_id in room.player_order:
            room.player_order = [p for p in room.player_order if p != player_id]

        if not room.players:
            self._delete_room(room)
            return

        leaving_was_host = player_id == old_host_id
        if leaving_was_host:
            room.host_id = room.player_order[0]
        new_host_id = room.host_id

        if leaving_was_host:
            _persist_async(game_repository.persist_room_host, room.id, new_host_id)
        _persist_async(game_repository.persist_player_deleted, player_id)

        await self._send_room_updated(room)

    def _delete_room(self, room: Room) -> None:
        rid = room.id
        _persist_async(game_repository.persist_room_deleted, rid)
        self._code_to_room.pop(room.code, None)
        self._rooms.pop(room.id, None)
        if room.timer_task:
            room.timer_task.cancel()
        if room.over_task:
            room.over_task.cancel()

    async def _on_disconnect(self, ws: WebSocket) -> None:
        ctx = self._ctx(ws)
        if not ctx:
            return
        room_id, player_id = ctx
        room = self._rooms.get(room_id)
        self._clear_ctx(ws)
        if not room:
            return
        async with room.lock:
            pl = room.players.get(player_id)
            if pl:
                pl.socket = None
                pl.connected = False
            host_changed = False
            if room.host_id == player_id and room.players:
                others = [pid for pid in room.player_order if pid != player_id]
                if others:
                    room.host_id = others[0]
                    host_changed = True
            _persist_async(game_repository.persist_player_socket, player_id, None)
            if host_changed:
                _persist_async(game_repository.persist_room_host, room.id, room.host_id)
            await self._send_room_updated(room)

    async def _game_start(self, ws: WebSocket) -> None:
        ctx = self._ctx(ws)
        if not ctx:
            return
        room_id, player_id = ctx
        room = self._rooms.get(room_id)
        if not room:
            return
        async with room.lock:
            if player_id != room.host_id:
                await self._emit_error(ws, "NOT_HOST", "Only the host can start the game")
                return
            if len(room.players) < 3:
                await self._emit_error(ws, "NOT_ENOUGH_PLAYERS", "At least 3 players are required")
                return
            if room.status != "lobby":
                return

            order = list(room.player_order)
            random.shuffle(order)
            room.rotation_order = order
            room.prompt_text = fetch_random_prompt_text()
            room.starter_line = random.choice(STARTER_LINES)
            room.submissions.clear()
            room.ended_rounds.clear()
            room.reveal_chains = None
            room.reveal_scores = None
            room.reveal_elo = None
            room.current_round = 0
            room.status = "active"

        await asyncio.to_thread(
            game_repository.persist_room_state,
            room_id,
            status="active",
            current_round=0,
        )

        await self._broadcast(
            room,
            "game:started",
            {
                "roundCount": room.round_count,
                "timeLimits": DEFAULT_TIME_LIMITS,
            },
        )
        await self._begin_round(room, 1)

    async def _begin_round(self, room: Room, round_num: int) -> None:
        async with room.lock:
            if room.id not in self._rooms:
                return
            self._cancel_round_timer(room)
            rtype = round_type_for_num(round_num)
            room.current_round = round_num
            room.current_round_type = rtype
            room.round_started_at = time.monotonic()
            room.round_time_limit = DEFAULT_TIME_LIMITS["code" if rtype == "code" else "describe"]
            room.submitted_this_round.clear()
            if round_num not in room.submissions:
                room.submissions[round_num] = {}

            seeds: dict[str, dict[str, Any]] = {}
            for pid in room.rotation_order:
                seed = self._build_seed(room, pid, round_num, rtype)
                seeds[pid] = camelize_model(seed)

        _persist_async(
            game_repository.persist_room_state,
            room.id,
            status=room.status,
            current_round=round_num,
        )

        for pid in room.rotation_order:
            pl = room.players.get(pid)
            if not pl or not pl.socket:
                continue
            await _ws_send(
                pl.socket,
                outbound_event(
                    "round:begin",
                    {
                        "roundNum": round_num,
                        "roundType": rtype,
                        "timeLimit": room.round_time_limit,
                        "seed": seeds[pid],
                    },
                ),
            )

        async with room.lock:
            if room.timer_task:
                room.timer_task.cancel()
            room.timer_task = asyncio.create_task(self._round_timer(room, round_num))

    def _cancel_round_timer(self, room: Room) -> None:
        if room.timer_task:
            room.timer_task.cancel()
            room.timer_task = None

    async def _round_timer(self, room: Room, round_num: int) -> None:
        try:
            await asyncio.sleep(float(room.round_time_limit or 0))
            async with room.lock:
                if room.current_round != round_num or room.status != "active":
                    return
            await self._end_round(room, round_num)
        except asyncio.CancelledError:
            return

    def _build_seed(self, room: Room, player_id: str, rnd: int, rtype: str) -> RoundSeed:
        if rnd == 1 and rtype == "code":
            return RoundSeed(
                promptText=room.prompt_text,
                starterLine=room.starter_line,
                fromPlayerName=None,
                receivedContent=None,
            )
        upstream = room.upstream_id(player_id)
        if upstream is None:
            return RoundSeed()
        prev_entry = room.submissions.get(rnd - 1, {}).get(upstream)
        prev = prev_entry.content if prev_entry else ""
        uname = room.players[upstream].name
        return RoundSeed(
            fromPlayerName=uname,
            receivedContent=prev,
        )

    async def _round_submit(self, ws: WebSocket, data: dict[str, Any]) -> None:
        ctx = self._ctx(ws)
        if not ctx:
            return
        room_id, player_id = ctx
        room = self._rooms.get(room_id)
        if not room:
            return
        try:
            body = RoundSubmitPayload.model_validate(data)
        except ValidationError:
            return

        async with room.lock:
            if room.status != "active" or room.current_round <= 0:
                return
            if player_id in room.submitted_this_round:
                return
            rnd = room.current_round
            rtype = room.current_round_type or round_type_for_num(rnd)
            lang: str | None = None
            if rtype == "code":
                lang = body.language or "python"
            room.submissions.setdefault(rnd, {})[player_id] = Submission(
                content=body.content,
                language=lang,
            )
            room.submitted_this_round.add(player_id)
            total = len(room.submitted_this_round)
            total_players = len(room.rotation_order)

        pname = room.players[player_id].name
        await self._broadcast(
            room,
            "round:player_submitted",
            {
                "playerId": player_id,
                "playerName": pname,
                "submittedAt": now_ms(),
                "totalSubmitted": total,
                "totalPlayers": total_players,
            },
        )

        if total >= total_players:
            await self._end_round(room, rnd)

    async def _end_round(self, room: Room, round_num: int) -> None:
        async with room.lock:
            if room.current_round != round_num or room.status != "active":
                return
            if round_num in room.ended_rounds:
                return
            room.ended_rounds.add(round_num)
            self._cancel_round_timer(room)
            submissions = []
            rtype = round_type_for_num(round_num)
            for pid in room.rotation_order:
                p = room.players[pid]
                entry = room.submissions.get(round_num, {}).get(pid)
                submissions.append(
                    {
                        "playerId": pid,
                        "playerName": p.name,
                        "content": entry.content if entry else "",
                        "roundType": rtype,
                        "language": entry.language if entry and rtype == "code" else None,
                    }
                )
            next_r = round_num + 1 if round_num < room.round_count else None

        await self._broadcast(
            room,
            "round:ended",
            {
                "roundNum": round_num,
                "submissions": submissions,
                "nextRound": next_r,
            },
        )

        if next_r:
            await self._begin_round(room, next_r)
        else:
            await self._finish_game(room)

    async def _finish_game(self, room: Room) -> None:
        chains = self._chains_payload(room)
        scores = await self._score_chains_safe(chains)
        payload: dict[str, Any] = {"chains": chains}
        if scores is not None:
            payload["scores"] = [
                s.model_dump(mode="json", by_alias=True) for s in scores
            ]
            elo_reveal = self._compute_elo_reveal_safe(room, scores)
            if elo_reveal is not None:
                payload["elo"] = elo_reveal
        room.reveal_chains = chains
        room.reveal_scores = payload.get("scores")
        room.reveal_elo = payload.get("elo")

        await self._broadcast(room, "game:reveal", payload)

        # Persist game completion (best-effort, fire-and-forget).
        game_id = new_id()
        chain_score_rows = self._build_chain_score_rows(room, scores)
        _persist_async(
            game_repository.persist_game_completed,
            game_id,
            room.id,
            room.round_count,
            chain_score_rows,
        )
        if scores is not None:
            elo_updates = self._compute_elo_updates_safe(room, scores)
            if elo_updates:
                _persist_async(
                    game_repository.persist_elo_updates,
                    game_id,
                    elo_updates,
                )

        async def _over_delayed() -> None:
            rid = room.id
            rc = room.round_count
            await asyncio.sleep(REVEAL_TO_OVER_SEC)
            async with room.lock:
                room.status = "over"
            await asyncio.to_thread(
                game_repository.persist_room_state,
                rid,
                status="over",
                current_round=rc,
            )
            await self._broadcast(room, "game:over", {})

        async with room.lock:
            if room.over_task:
                room.over_task.cancel()
            room.over_task = asyncio.create_task(_over_delayed())

    async def _score_chains_safe(
        self, chains: list[dict[str, Any]]
    ) -> list[ChainScore] | None:
        """Best-effort scoring — never blocks the reveal.

        Lazy-imports `scoring` so a missing Gemini SDK doesn't crash
        the hub on module load. Catches NotImplementedError (stub state)
        and any runtime failure; logs and returns None.
        """
        try:
            from app.game.scoring import score_chain
            return await score_chain(chains)
        except NotImplementedError:
            logger.info("score_chain not implemented; reveal has no scores")
            return None
        except Exception:  # noqa: BLE001
            logger.warning("score_chain failed", exc_info=True)
            return None

    def _build_chain_score_rows(
        self,
        room: Room,
        scores: list[ChainScore] | None,
    ) -> list[dict[str, Any]] | None:
        """Join ChainScore + start_player_id (from rotation_order) into
        row dicts ready for game_scores. Returns None when scores is None
        so the caller can skip the insert."""
        if scores is None:
            return None
        n = len(room.rotation_order)
        rows: list[dict[str, Any]] = []
        for s in scores:
            idx = s.chain_index
            start_player_id = (
                room.rotation_order[idx] if 0 <= idx < n else None
            )
            rows.append(
                {
                    "chain_index": idx,
                    "start_player_id": start_player_id,
                    "overall_score": s.overall_score,
                    "notes": s.notes,
                }
            )
        return rows

    def _elo_players_from_scores(
        self, room: Room, scores: list[ChainScore]
    ) -> list[dict[str, Any]]:
        """One entry per chain starter with AI semantic score."""
        from app.game.elo import DEFAULT_ELO

        score_by = {s.chain_index: s.overall_score for s in scores}
        players: list[dict[str, Any]] = []
        for idx, pid in enumerate(room.rotation_order):
            if idx not in score_by:
                continue
            pl = room.players[pid]
            entry: dict[str, Any] = {
                "player_id": pid,
                "player_name": pl.name,
                "current_elo": DEFAULT_ELO,
                "chain_score": score_by[idx],
            }
            user_id = getattr(pl, "user_id", None)
            if user_id:
                stored = game_repository.get_user_elo(user_id)
                if stored is not None:
                    entry["current_elo"] = stored
                entry["user_id"] = user_id
            players.append(entry)
        return players

    def _compute_elo_reveal_safe(
        self, room: Room, scores: list[ChainScore]
    ) -> list[dict[str, Any]] | None:
        """ELO deltas for game:reveal (all chain starters in the room)."""
        try:
            from app.game.elo import compute_elo_changes

            players = self._elo_players_from_scores(room, scores)
            if not players:
                return None
            changes = compute_elo_changes(players)
            if not changes:
                return None
            reveal: list[dict[str, Any]] = []
            for row in changes:
                pid = row["player_id"]
                name = row.get("player_name") or room.players[pid].name
                reveal.append(
                    RevealElo(
                        player_id=pid,
                        player_name=name,
                        before=row["before"],
                        after=row["after"],
                        delta=row["delta"],
                    ).model_dump(mode="json", by_alias=True)
                )
            return reveal
        except Exception:  # noqa: BLE001
            logger.warning("elo reveal failed", exc_info=True)
            return None

    def _compute_elo_updates_safe(
        self,
        room: Room,
        scores: list[ChainScore],
    ) -> list[dict[str, Any]] | None:
        """Persistable ELO rows (players with user_id only)."""
        try:
            from app.game.elo import compute_elo_changes

            players = [
                p
                for p in self._elo_players_from_scores(room, scores)
                if p.get("user_id")
            ]
            if not players:
                return None
            return compute_elo_changes(players)
        except Exception:  # noqa: BLE001
            logger.warning("compute_elo_changes failed", exc_info=True)
            return None

    def _chains_payload(self, room: Room) -> list[dict[str, Any]]:
        n = len(room.rotation_order)
        out: list[dict[str, Any]] = []
        for s in range(n):
            segments: list[dict[str, Any]] = []
            for r in range(1, room.round_count + 1):
                author_id = room.rotation_order[(s + r - 1) % n]
                pl = room.players[author_id]
                rtype = round_type_for_num(r)
                entry = room.submissions.get(r, {}).get(author_id)
                content = entry.content if entry else ""
                segments.append(
                    {
                        "roundNum": r,
                        "roundType": rtype,
                        "authorId": author_id,
                        "authorName": pl.name,
                        "content": content,
                        "language": entry.language if entry and rtype == "code" else None,
                    }
                )
            start_id = room.rotation_order[s]
            start_name = room.players[start_id].name
            out.append(
                {
                    "startPlayerId": start_id,
                    "startPlayerName": start_name,
                    "segments": segments,
                }
            )
        return out

    async def _game_sync(self, ws: WebSocket, data: dict[str, Any]) -> None:
        try:
            payload = GameSyncPayload.model_validate(data)
        except ValidationError:
            await self._emit_error(ws, "INVALID_SYNC", "Invalid game:sync payload")
            return

        room = self._rooms.get(payload.room_id)
        if not room:
            await self._emit_error(ws, "ROOM_NOT_FOUND", "Room not found")
            return

        player_id = payload.player_id
        if not player_id or player_id not in room.players:
            await self._emit_error(ws, "INVALID_SYNC", "playerId required to resync")
            return

        pl = room.players[player_id]
        pl.socket = ws
        pl.connected = True
        self._register_ctx(ws, room.id, player_id)

        _persist_async(game_repository.persist_player_socket, player_id, ws)

        snap = self._game_state(room, player_id)
        await _ws_send(ws, outbound_event("game:state", snap))

    def _game_state(self, room: Room, player_id: str) -> dict[str, Any]:
        rnd = room.current_round
        rtype = room.current_round_type
        seed_dict: dict[str, Any] | None = None
        if room.status == "active" and rnd > 0 and rtype:
            seed = self._build_seed(room, player_id, rnd, rtype)
            seed_dict = camelize_model(seed)

        tr: int | None = None
        if room.status == "active" and room.round_started_at is not None and room.round_time_limit:
            elapsed = time.monotonic() - float(room.round_started_at)
            tr = max(0, int(room.round_time_limit - elapsed))

        submitted = player_id in room.submitted_this_round if rnd > 0 else False

        status = room.status
        if room.reveal_chains and room.status in ("active", "over"):
            status = "reveal" if room.status == "active" else "over"

        snap: dict[str, Any] = {
            "status": status,
            "roundNum": rnd,
            "roundType": rtype,
            "timeRemaining": tr,
            "seed": seed_dict,
            "submitted": submitted,
            "players": room.public_players(),
        }
        if room.reveal_chains:
            snap["chains"] = room.reveal_chains
            if room.reveal_scores is not None:
                snap["scores"] = room.reveal_scores
            if room.reveal_elo is not None:
                snap["elo"] = room.reveal_elo
        return snap

    async def _game_reset(self, ws: WebSocket) -> None:
        ctx = self._ctx(ws)
        if not ctx:
            return
        room_id, player_id = ctx
        room = self._rooms.get(room_id)
        if not room:
            return
        async with room.lock:
            if player_id != room.host_id:
                await self._emit_error(ws, "NOT_HOST", "Only the host can reset")
                return
            if room.status != "over":
                await self._emit_error(
                    ws,
                    "GAME_IN_PROGRESS",
                    "game:reset is only valid once the game has ended",
                )
                return
            room.status = "lobby"
            room.rotation_order.clear()
            room.submissions.clear()
            room.ended_rounds.clear()
            room.submitted_this_round.clear()
            room.current_round = 0
            room.current_round_type = None
            room.round_started_at = None
            room.round_time_limit = None
            room.prompt_text = ""
            room.starter_line = ""
            room.reveal_chains = None
            room.reveal_scores = None
            room.reveal_elo = None
            self._cancel_round_timer(room)
            if room.over_task:
                room.over_task.cancel()
                room.over_task = None

        _persist_async(
            game_repository.persist_room_state,
            room_id,
            status="lobby",
            current_round=0,
        )

        await self._send_room_updated(room)

    def reset_for_tests(self) -> None:
        for room in list(self._rooms.values()):
            if room.timer_task:
                room.timer_task.cancel()
            if room.over_task:
                room.over_task.cancel()
        self._rooms.clear()
        self._code_to_room.clear()
        self._socket_ctx.clear()


hub = GameHub()
