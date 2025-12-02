import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Svi uređaji i njihovo stanje
let devices = {};  // deviceId -> { socket, state }

// WebSocket server
const wss = new WebSocketServer({ noServer: true });

// Kad se RPi poveže
wss.on("connection", (ws, req) => {
    const deviceId = new URL(req.url, "http://localhost").searchParams.get("id");
    console.log("Device connected:", deviceId);

    devices[deviceId] = {
        socket: ws,
        state: { online: true, lastUpdate: Date.now() }
    };

    ws.on("message", msg => {
        const data = JSON.parse(msg);
        devices[deviceId].state = {
            ...devices[deviceId].state,
            ...data,
            online: true,
            lastUpdate: Date.now()
        };

        // Broadcast dashboard update
        broadcastDashboard();
    });

    ws.on("close", () => {
        console.log("Device disconnected:", deviceId);
        devices[deviceId].state.online = false;
        broadcastDashboard();
    });
});

// HTTP → WebSocket upgrade
const server = app.listen(8080, () => console.log("Cloud server running on port 8080"));
server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
        wss.emit("connection", ws, req);
    });
});

// Dashboard WebSocket
let dashboardClients = [];

const dashboardWSS = new WebSocketServer({ server, path: "/dashboard" });

dashboardWSS.on("connection", (ws) => {
    console.log("Dashboard connected");
    dashboardClients.push(ws);

    ws.send(JSON.stringify({ type: "devices", devices }));

    ws.on("close", () => {
        dashboardClients = dashboardClients.filter(c => c !== ws);
    });
});

function broadcastDashboard() {
    const payload = JSON.stringify({ type: "devices", devices });

    dashboardClients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
}

// API za slanje komandi uređaju
app.post("/device/:id/cmd", (req, res) => {
    const id = req.params.id;
    const cmd = req.body;

    if (!devices[id] || devices[id].socket.readyState !== WebSocket.OPEN) {
        return res.json({ ok: false, error: "device offline" });
    }

    devices[id].socket.send(JSON.stringify({ type: "cmd", cmd }));
    return res.json({ ok: true });
});
