import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

let port = 5000;

// ── Message Types (what clients send to the server) ──
type SignalMessage =
    | { type: "join"; roomId: string; userId: string }
    | { type: "chat"; message: string }
    | { type: "offer"; sdp: RTCSessionDescriptionInit }
    | { type: "answer"; sdp: RTCSessionDescriptionInit }
    | { type: "ice-candidate"; candidate: RTCIceCandidateInit };

// ── Per-connection metadata ──
interface ClientMeta {
    roomId: string;
    userId: string;
}

// ── Core data structures ──

// Given a connection, what room/user is it? (needed on disconnect cleanup)
const clientMeta: Map<WebSocket, ClientMeta> = new Map();

// Given a room, who's in it? (needed for fast, scoped broadcast)
const roomClients: Map<string, Set<WebSocket>> = new Map();

function removeClientFromCurrentRoom(ws: WebSocket){
    const meta = clientMeta.get(ws);
    if(!meta){
        return;
    }

    const room = roomClients.get(meta.roomId);
    room?.delete(ws);
    if(room?.size === 0){
        roomClients.delete(meta.roomId);
    }
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({server});

wss.on("connection", (ws, req) => {
    console.log(`got client request from ${req.socket.remoteAddress}`);
    ws.on("message", (data) => {
        console.log(`received message from client ${data}`);
        
        let msg: SignalMessage;
        try {
            msg = JSON.parse(data.toString());
        } catch (err) {
            console.error("failed to parse message:", err);
            ws.send(JSON.stringify({ type: "error", message: "invalid JSON" }));
            return;
        }
        if(msg.type === "join"){
            // if this socket was already in a room, leave it first
            // (handles reconnect / room-switch without leaking membership)
            removeClientFromCurrentRoom(ws);

            clientMeta.set(ws, {roomId: msg.roomId, userId: msg.userId});
            console.log(`${msg.userId} joined room ${msg.roomId}`);
            if(!roomClients.has(msg.roomId)){
                roomClients.set(msg.roomId, new Set());
            }
            roomClients.get(msg.roomId)!.add(ws);
            console.log(`total users in room: ${roomClients.get(msg.roomId)?.size}`)
            return;
        }

        if(msg.type === "chat") {
            const senderMeta = clientMeta.get(ws);
            if(!senderMeta) {
                if(ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "error", message: "join a room before sending chat" }));
                }
                return;
            }     

            const room = roomClients.get(senderMeta.roomId);
            console.log(`sending message to total users: ${room?.size}`)
            room?.forEach((client) => {
                if(client !== ws && client.readyState === WebSocket.OPEN){
                    client.send(JSON.stringify({ type: "chat", from: senderMeta.userId, message: msg.message }));
                }
            })
        }
        if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice-candidate") {
            const senderMeta = clientMeta.get(ws);
            if (!senderMeta) {
                ws.send(JSON.stringify({ type: "error", message: "join a room before signaling" }));
                return;
            }

            const room = roomClients.get(senderMeta.roomId);
            room?.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ ...msg, from: senderMeta.userId }));
                }
            });
        }
    })
    ws.on("close", () => {
        const meta = clientMeta.get(ws);
        if (meta) {
            const room = roomClients.get(meta.roomId);
            room?.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "peer-left", userId: meta.userId }));
                }
            });
        }

        removeClientFromCurrentRoom(ws);
        clientMeta.delete(ws);
        console.log("client disconnected");
    })
    ws.on("error", (err) => {
        console.error("websocket error:", err);
    });
});

app.get('/health', (req, res) => {
    res.json({status: 'ok'});
})

server.listen(port, () => {
    console.log(`http + websocket server listening on port: ${port}`);
})