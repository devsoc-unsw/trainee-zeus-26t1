from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any

from pydantic import ValidationError
from starlette.websockets import WebSocket, WebSocketDisconnect, WebSocketState

from app.game.prompts import fetch_random_prompt_text
from app.game.room import (
    DEFAULT_TIME_LIMITS,
    REVEAL_TO_OVER_SEC,
    STARTER_LINES,
    Room,
    Player,
    new_id,
    new_room_code,
    now_ms,
    round_type_for_num,
)
from app.game.schemas import (
    GameSyncPayload,
    RoomCreatePayload,
    RoomJoinPayload,
    RoundSeed,
    RoundSubmitPayload,
    outbound_event,
    camelize_model,
)

logger = logging.getLogger(__name__)


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

        if room.host_id == player_id:
            room.host_id = room.player_order[0]

        await self._send_room_updated(room)

    def _delete_room(self, room: Room) -> None:
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
            if room.host_id == player_id and room.players:
                others = [pid for pid in room.player_order if pid != player_id]
                if others:
                    room.host_id = others[0]
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
            room.current_round = 0
            room.status = "active"

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
        prev = room.submissions.get(rnd - 1, {}).get(upstream, "")
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
            room.submissions.setdefault(rnd, {})[player_id] = body.content
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
            for pid in room.rotation_order:
                p = room.players[pid]
                submissions.append(
                    {
                        "playerId": pid,
                        "playerName": p.name,
                        "content": room.submissions.get(round_num, {}).get(pid, ""),
                        "roundType": round_type_for_num(round_num),
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
        await self._broadcast(room, "game:reveal", {"chains": chains})

        async def _over_delayed() -> None:
            await asyncio.sleep(REVEAL_TO_OVER_SEC)
            async with room.lock:
                room.status = "over"
            await self._broadcast(room, "game:over", {})

        async with room.lock:
            if room.over_task:
                room.over_task.cancel()
            room.over_task = asyncio.create_task(_over_delayed())

    def _chains_payload(self, room: Room) -> list[dict[str, Any]]:
        n = len(room.rotation_order)
        out: list[dict[str, Any]] = []
        for s in range(n):
            segments: list[dict[str, Any]] = []
            for r in range(1, room.round_count + 1):
                author_id = room.rotation_order[(s + r - 1) % n]
                pl = room.players[author_id]
                content = room.submissions.get(r, {}).get(author_id, "")
                segments.append(
                    {
                        "roundNum": r,
                        "roundType": round_type_for_num(r),
                        "authorId": author_id,
                        "authorName": pl.name,
                        "content": content,
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

        return {
            "status": room.status,
            "roundNum": rnd,
            "roundType": rtype,
            "timeRemaining": tr,
            "seed": seed_dict,
            "submitted": submitted,
            "players": room.public_players(),
        }

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
            self._cancel_round_timer(room)
            if room.over_task:
                room.over_task.cancel()
                room.over_task = None

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
