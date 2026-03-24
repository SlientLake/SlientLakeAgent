# server/chat_server.py
"""
可视化聊天室 WebSocket 服务器
接收来自前端的消息，广播给聊天室内的所有连接客户端
"""
import json
import asyncio
from pathlib import Path
from typing import Dict, Set, Optional
from datetime import datetime
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse


app = FastAPI(title="SilentLake Chat Server")

# 连接管理
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}  # room_id -> connections

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = set()
        self.active_connections[room_id].add(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].discard(websocket)

    async def broadcast_to_room(self, room_id: str, message: dict, exclude: Optional[WebSocket] = None):
        if room_id not in self.active_connections:
            return
        dead = set()
        for connection in self.active_connections[room_id]:
            if connection == exclude:
                continue
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                dead.add(connection)
        for conn in dead:
            self.active_connections[room_id].discard(conn)


manager = ConnectionManager()


@app.websocket("/ws/chat/{room_id}")
async def chat_websocket(websocket: WebSocket, room_id: str):
    await manager.connect(websocket, room_id)

    # 发送欢迎消息
    await websocket.send_text(json.dumps({
        "type": "system",
        "content": f"Joined room: {room_id}",
        "timestamp": datetime.utcnow().isoformat(),
    }))

    # 发送历史消息
    history = _load_room_history(room_id)
    for msg in history[-50:]:
        await websocket.send_text(json.dumps(msg))

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            message["timestamp"] = datetime.utcnow().isoformat()
            message["room_id"] = room_id

            # 持久化
            _save_message(room_id, message)

            # 广播给房间内所有人
            await manager.broadcast_to_room(room_id, message)

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)


@app.get("/api/v1/rooms/{room_id}/messages")
async def get_room_messages(room_id: str, limit: int = 50):
    history = _load_room_history(room_id)
    return {"messages": history[-limit:], "room_id": room_id}


@app.get("/api/v1/rooms")
async def list_rooms():
    rooms_dir = Path("~/.openclaw/a2a/chatrooms").expanduser()
    rooms = []
    if rooms_dir.exists():
        for room_dir in rooms_dir.iterdir():
            if room_dir.is_dir():
                room_file = room_dir / "room.json"
                if room_file.exists():
                    with open(room_file) as f:
                        rooms.append(json.load(f))
                else:
                    rooms.append({"id": room_dir.name, "name": room_dir.name})
    return {"rooms": rooms}


@app.get("/")
async def index():
    frontend_path = Path(__file__).parent.parent / "frontend" / "index.html"
    if frontend_path.exists():
        return FileResponse(frontend_path)
    return HTMLResponse("<h1>SilentLake Dashboard</h1><p>Frontend not found.</p>")


# Mount static files
static_path = Path(__file__).parent.parent / "frontend" / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")


def _load_room_history(room_id: str) -> list:
    msg_dir = Path(f"~/.openclaw/a2a/chatrooms/{room_id}/messages").expanduser()
    messages = []
    if msg_dir.exists():
        for f in sorted(msg_dir.glob("*.json"))[-100:]:
            try:
                with open(f) as fh:
                    messages.append(json.load(fh))
            except Exception:
                pass
    return messages


def _save_message(room_id: str, message: dict):
    msg_dir = Path(f"~/.openclaw/a2a/chatrooms/{room_id}/messages").expanduser()
    msg_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    with open(msg_dir / f"{ts}.json", "w") as f:
        json.dump(message, f, ensure_ascii=False)


def start(host: str = "0.0.0.0", port: int = 18800):
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    start()
