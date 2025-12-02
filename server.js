import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// memory state
let devices = {};

// HTTP server
const server = http.createServer(app);

// MAIN WS SERVER (for devices)
const deviceWSS = new WebSocketServer({ noServer: true });

// DASHBOARD WS SERVER
const dashboardWSS = new WebSocketServer({ noServer: true });

// Upgrade handler
server.on("upgrade", (req, socket, head) => {
    // BLOCK Render health checks (they break WS)
    if (req.headers["user-agent"]?.includes("Render")) {
        socket.destroy();
        return;
    }

    const pathname = req.url.split("?")[0];

    if (pathname === "/devices") {
        deviceWSS.handleUpgrade(req, socket, head, (ws) => {
            deviceWSS.emit("connection", ws, req);
        });
    } else if (pathname === "/dashboard") {
        dashboardWSS.handleUpgrade(req, socket, head, (ws) => {
            dashboardWSS.emit("connection", ws, req);
        });
    } else {
        socket.destroy(); // reject unknown WS
    }
});

// DEVICE WS HANDLING
deviceWSS.on("connection", (ws, req) => {
    const params = new URLSearchParams(req.url.split("?")[1]);
    const id = params.get("id");

    if (!id) {
        ws.close();
        return;
    }

    if (!devices[id]) devices[id] = {};
    devices[id].socket = ws;
    devices[id].state = { online: true, lastUpdate: Date.now() };

    console.log("Device connected:", id);
    broadcastDashboard();

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);
        devices[id].state = {
            ...devices[id].state,
            ...data,
            online: true,
            lastUpdate: Date.now()
        };
        broadcastDashboard();
    });

    ws.on("close", () => {
        console.log("Device disconnected:", id);
        devices[id].state.online = false;
        broadcastDashboard();
    });
});

// DASHBOARD WS HANDLING
let dashboards = [];

dashboardWSS.on("connection", (ws) => {
    dashboards.push(ws);
    console.log("Dashboard connected");

    ws.send(JSON.stringify({ type: "devices", devices }));

    ws.on("close", () => {
        dashboards = dashboards.filter(c => c !== ws);
    });
});

function broadcastDashboard() {
    const payload = JSON.stringify({ type: "devices", devices });
    dashboards.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
}

// API COMMAND ROUTE
app.post("/device/:id/cmd", (req, res) => {
    const id = req.params.id;
    const cmd = req.body;

    if (!devices[id] || !devices[id].socket || devices[id].socket.readyState !== WebSocket.OPEN) {
        return res.json({ ok: false, error: "device offline" });
    }

    devices[id].socket.send(JSON.stringify({ type: "cmd", cmd }));
    return res.json({ ok: true });
});

// START SERVER
server.listen(process.env.PORT || 8080, () => {
    console.log("Cloud server running on port 8080");
});

// 🩸 Heartbeat – REQUIRED on Render
setInterval(() => {
    for (const id in devices) {
        const ws = devices[id].socket;
        if (!ws || ws.readyState !== WebSocket.OPEN) continue;
        ws.ping();
    }
}, 10000);
