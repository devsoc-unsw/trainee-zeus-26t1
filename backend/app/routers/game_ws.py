from fastapi import APIRouter, WebSocket

from app.game.manager import hub

router = APIRouter(tags=["game"])


@router.websocket("/ws/game")
async def game_websocket(websocket: WebSocket) -> None:
    await hub.handle_connection(websocket)
