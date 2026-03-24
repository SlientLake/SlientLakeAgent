// frontend/static/chat.js
// Real-time chat room UI

const CHAT_API = window.API_BASE || 'http://localhost:18789';

let ws = null;
let currentRoomId = null;

function connectWebSocket(roomId) {
    if (ws) {
        ws.close();
        ws = null;
    }
    currentRoomId = roomId;

    const clientId = 'human-' + Math.random().toString(36).substr(2, 8);
    try {
        ws = new WebSocket(`ws://localhost:18789/ws?client_id=${clientId}&room_id=${roomId}`);

        ws.onopen = () => {
            console.log('[Chat] WebSocket connected to room:', roomId);
            appendMessage('system', 'System', 'Connected to room: ' + roomId);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                appendMessage(
                    data.sender_id || 'agent',
                    data.sender_id || 'Agent',
                    data.content || JSON.stringify(data)
                );
            } catch (e) {
                appendMessage('system', 'Raw', event.data);
            }
        };

        ws.onclose = () => {
            appendMessage('system', 'System', 'Disconnected from room');
        };

        ws.onerror = (err) => {
            console.error('[Chat] WebSocket error:', err);
        };
    } catch (e) {
        console.warn('[Chat] WebSocket not available');
    }
}

function appendMessage(type, sender, content) {
    const list = document.getElementById('message-list');
    if (!list) return;

    const div = document.createElement('div');
    div.className = 'message' + (type === 'human' ? ' human' : '');
    div.innerHTML = `
        <div class="sender">${escapeHtml(sender)}</div>
        <div class="bubble">${escapeHtml(content)}</div>
    `;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    appendMessage('human', 'You', content);
    input.value = '';

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'human_intervention',
            content: content,
            sender_id: 'human',
        }));
    } else {
        // Fallback: HTTP POST
        const roomId = currentRoomId || 'broadcast';
        fetch(`${CHAT_API}/api/v1/rooms/${roomId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, sender_id: 'human', type: 'human_intervention' }),
        }).catch(e => console.warn('Failed to send message:', e));
    }
}

async function loadRooms() {
    try {
        const res = await fetch(`${CHAT_API}/api/v1/rooms`);
        if (!res.ok) return;
        const data = await res.json();
        const rooms = data.rooms || [];
        if (rooms.length > 0) {
            connectWebSocket(rooms[0].id);
            loadMessages(rooms[0].id);
        }
    } catch (e) {
        console.warn('[Chat] Failed to load rooms:', e);
    }
}

async function loadMessages(roomId) {
    try {
        const res = await fetch(`${CHAT_API}/api/v1/rooms/${roomId}/messages?limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        const list = document.getElementById('message-list');
        if (!list) return;
        list.innerHTML = '';
        (data.messages || []).forEach(msg => {
            appendMessage(
                msg.sender_id || 'agent',
                msg.sender_id || 'Agent',
                msg.content || ''
            );
        });
    } catch (e) {
        console.warn('[Chat] Failed to load messages:', e);
    }
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Allow Enter key to send
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chat-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});
