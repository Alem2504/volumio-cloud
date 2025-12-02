import express from "express";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// DEVICE STORAGE
let devices = {};
let dashboards = [];

// HEALTH ENDPOINT (Render requires this!)
app.get("/health", (req, res) => res.send("ok"));

// Create HTTP server
const server = http.createServer(app);

// WebSocket servers
const deviceWSS = new WebSocketServer({ noServer: true });
const dashboardWSS = new WebSocketServer({ noServer: true });

// ----------------------------
// 🔥 UPGRADE HANDLER (Render-friendly)
// ----------------------------
server.on("upgrade", (req, socket, head) => {
    const pathname = req.url.split("?")[0];

    if (pathname === "/devices") {
        deviceWSS.handleUpgrade(req, socket, head, (ws) => {
            deviceWSS.emit("connection", ws, req);
        });

    } else if (pathname === "/dashboard") {
        dashboardWSS.handleUpgrade(req, socket, head, (ws) => {
            dashboardWSS.emit("connection", ws);
        });

    } else {
        socket.destroy();
    }
});

// ----------------------------
// 📡 DEVICE CONNECTION
// ----------------------------
deviceWSS.on("connection", (ws, req) => {
    const query = new URLSearchParams(req.url.split("?")[1]);
    const id = query.get("id");

    if (!id) {
        ws.close();
        return;
    }

    devices[id] = {
        socket: ws,
        state: { online: true, lastUpdate: Date.now() }
    };

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
        if (devices[id]) devices[id].state.online = false;
        broadcastDashboard();
    });
});

// ----------------------------
// 🖥 DASHBOARD CONNECTION
// ----------------------------
dashboardWSS.on("connection", (ws) => {
    console.log("Dashboard connected");
    dashboards.push(ws);

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

// ----------------------------
// 📮 API COMMANDS
// ----------------------------
app.post("/device/:id/cmd", (req, res) => {
    const id = req.params.id;

    if (!devices[id] || devices[id].socket.readyState !== WebSocket.OPEN) {
        return res.json({ ok: false, error: "device offline" });
    }

    devices[id].socket.send(JSON.stringify({ type: "cmd", cmd: req.body }));
    return res.json({ ok: true });
});

// ----------------------------
// 🚀 START SERVER
// ----------------------------
const PORT = process.env.PORT || 8080;
server.listen(PORT, () =>
    console.log(`Cloud server running on port ${PORT}`)
);

// ----------------------------
// ❤️ HEARTBEAT (Render requirement)
// ----------------------------
setInterval(() => {
    for (const id in devices) {
        const ws = devices[id].socket;
        if (ws && ws.readyState === WebSocket.OPEN) ws.ping();
    }
}, 10000);
