from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

RoundCount = Literal[3, 5]
RoundType = Literal["code", "describe"]
GameStatus = Literal["lobby", "active", "over"]
RoomErrorCode = Literal[
    "ROOM_NOT_FOUND",
    "GAME_IN_PROGRESS",
    "NAME_TAKEN",
    "NOT_HOST",
    "NOT_ENOUGH_PLAYERS",
    "INVALID_SYNC",
]


class PlayerPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    is_host: bool = Field(alias="isHost")


class RoundSeed(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt_text: str | None = Field(default=None, alias="promptText")
    starter_line: str | None = Field(default=None, alias="starterLine")
    from_player_name: str | None = Field(default=None, alias="fromPlayerName")
    received_content: str | None = Field(default=None, alias="receivedContent")


class SubmissionOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    player_id: str = Field(alias="playerId")
    player_name: str = Field(alias="playerName")
    content: str
    round_type: RoundType = Field(alias="roundType")


class ChainSegment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    round_num: int = Field(alias="roundNum")
    round_type: RoundType = Field(alias="roundType")
    author_id: str = Field(alias="authorId")
    author_name: str = Field(alias="authorName")
    content: str


class ChainOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    start_player_id: str = Field(alias="startPlayerId")
    start_player_name: str = Field(alias="startPlayerName")
    segments: list[ChainSegment]


# --- Client → server payloads ---


class RoomCreatePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    round_count: int = Field(alias="roundCount")

    @field_validator("name")
    @classmethod
    def name_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("blank name")
        return v.strip()[:32]

    @field_validator("round_count")
    @classmethod
    def round_count_ok(cls, v: int) -> int:
        if v not in (3, 5):
            raise ValueError("roundCount must be 3 or 5")
        return v


class RoomJoinPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    name: str

    @field_validator("name")
    @classmethod
    def name_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("blank name")
        return v.strip()[:32]

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper()[:6]


class GameSyncPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    room_id: str = Field(alias="roomId")
    player_id: str | None = Field(default=None, alias="playerId")


class RoundSubmitPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: str


# --- Scoring & code execution payloads ---


class ChainScore(BaseModel):
    """Per-chain semantic-similarity score returned by the AI judge."""

    model_config = ConfigDict(populate_by_name=True)

    chain_index: int = Field(alias="chainIndex")
    overall_score: float = Field(alias="overallScore")
    notes: str | None = None


class RevealElo(BaseModel):
    """Per-player ELO change shown on the reveal screen."""

    model_config = ConfigDict(populate_by_name=True)

    player_id: str = Field(alias="playerId")
    player_name: str = Field(alias="playerName")
    before: int
    after: int
    delta: int


class TestCase(BaseModel):
    """A single Judge0 test input/expected-output pair."""

    model_config = ConfigDict(populate_by_name=True)

    stdin: str
    expected_stdout: str = Field(alias="expectedStdout")


class TestResult(BaseModel):
    """Outcome of running a single test case through Judge0."""

    model_config = ConfigDict(populate_by_name=True)

    passed: bool
    actual_stdout: str = Field(alias="actualStdout")
    runtime_ms: int | None = Field(default=None, alias="runtimeMs")
    error: str | None = None


def outbound_event(event: str, data: dict[str, Any]) -> dict[str, Any]:
    """Wire format: camelCase keys in JSON objects."""
    return {"event": event, "data": data}


def camelize_model(m: BaseModel) -> dict[str, Any]:
    return m.model_dump(mode="json", by_alias=True)
