# core/agent_lifecycle.py
from enum import Enum
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict


class AgentStatus(Enum):
    CREATED = "created"
    STARTING = "starting"
    RUNNING = "running"
    BUSY = "busy"
    ERROR = "error"
    STOPPED = "stopped"


@dataclass
class AgentState:
    agent_id: str
    status: AgentStatus
    pid: Optional[int] = None
    port: Optional[int] = None
    started_at: Optional[datetime] = None
    last_heartbeat: Optional[datetime] = None
    error_message: Optional[str] = None
    current_task: Optional[str] = None


class AgentStateManager:
    """Global in-memory agent state store"""
    _states: Dict[str, AgentState] = {}

    @classmethod
    def get(cls, agent_id: str) -> AgentState:
        if agent_id not in cls._states:
            cls._states[agent_id] = AgentState(
                agent_id=agent_id,
                status=AgentStatus.CREATED,
            )
        return cls._states[agent_id]

    @classmethod
    def update(cls, agent_id: str, status: AgentStatus, **kwargs):
        state = cls.get(agent_id)
        state.status = status
        for k, v in kwargs.items():
            if hasattr(state, k):
                setattr(state, k, v)

    @classmethod
    def set_task(cls, agent_id: str, task: Optional[str]):
        state = cls.get(agent_id)
        state.current_task = task
        if task:
            state.status = AgentStatus.BUSY
        else:
            state.status = AgentStatus.RUNNING

    @classmethod
    def all_states(cls) -> Dict[str, AgentState]:
        return cls._states
