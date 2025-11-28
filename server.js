// =====================
// CLOUD AUDIO CONTROL SERVER (Render-ready)
// =====================

const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.json());
app.use(cors());

// Devices registry: deviceId → ws
let devices = {};


// =====================
// 1. EXPRESS SERVER (HTTP API)
// =====================

app.get("/", (req, res) => {
    res.json({ ok: true, message: "Cloud audio server running." });
});

// List all connected devices
app.get("/devices", (req, res) => {
    res.json({
        count: Object.keys(devices).length,
        devices: Object.keys(devices)
    });
});

// Send command to device
app.post("/send/:id", (req, res) => {
    const id = req.params.id;

    if (!devices[id]) {
        return res.json({ ok: false, error: "Device not connected" });
    }

    try {
        devices[id].send(JSON.stringify(req.body));
    } catch (err) {
        return res.json({ ok: false, error: "Send failed" });
    }

    res.json({ ok: true, sent: req.body });
});


// =====================
// 2. COMBINED SERVER (Express + WebSocket)
//    Render requires ONE PORT ONLY
// =====================

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
    console.log("HTTP + WebSocket server running on port", PORT);
});


// =====================
// 3. WEBSOCKET SERVER
// =====================

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
    const deviceId = uuidv4();
    devices[deviceId] = ws;

    console.log("Device connected:", deviceId);

    // When device sends something to cloud
    ws.on("message", msg => {
        try {
            const data = JSON.parse(msg);
            console.log(`[${deviceId}]`, data);
        } catch (e) {
            console.log("Invalid message:", msg.toString());
        }
    });

    // If device disconnects
    ws.on("close", () => {
        delete devices[deviceId];
        console.log("Device disconnected:", deviceId);
    });
});
