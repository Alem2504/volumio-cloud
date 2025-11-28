// =========================================
// CLOUD AUDIO CONTROL SERVER (Render-ready)
// =========================================

const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.json());
app.use(cors());

// Device connections: deviceId → ws
let devices = {};

// Device states: deviceId → { status, stream, volume, lastSeen }
let deviceState = {};


// =========================================
// 1. BASIC ENDPOINT
// =========================================
app.get("/", (req, res) => {
    res.json({ ok: true, message: "Cloud audio server running." });
});


// =========================================
// 2. RETURN CONNECTED DEVICES
// =========================================
app.get("/devices", (req, res) => {
    res.json({
        count: Object.keys(devices).length,
        devices: Object.keys(devices)
    });
});


// =========================================
// 3. SEND COMMAND TO A DEVICE
// =========================================
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


// =========================================
// 4. GET DEVICE STATUS
// =========================================
app.get("/device/:id/status", (req, res) => {
    const id = req.params.id;

    if (!deviceState[id]) {
        return res.json({ ok: false, error: "Device not found" });
    }

    res.json({
        id,
        online: Date.now() - deviceState[id].lastSeen < 10000,
        ...deviceState[id]
    });
});


// =========================================
// 5. START SERVER (Express + WS on same port)
// =========================================

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
    console.log("HTTP + WebSocket server running on port", PORT);
});


// =========================================
// 6. WEBSOCKET SERVER (DEVICE CONNECTIONS)
// =========================================

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
    const deviceId = uuidv4();
    devices[deviceId] = ws;

    // Initialize state
    deviceState[deviceId] = {
        status: "unknown",
        stream: null,
        volume: null,
        lastSeen: Date.now()
    };

    console.log("Device connected:", deviceId);

    // When device sends message to cloud
    ws.on("message", raw => {
        try {
            const data = JSON.parse(raw);

            // Device heartbeats
            if (data.deviceId) {
                deviceState[data.deviceId] = {
                    status: data.status || "unknown",
                    stream: data.stream || null,
                    volume: data.volume ?? null,
                    lastSeen: Date.now()
                };
                return;
            }

            // For debugging raw messages
            console.log(`[${deviceId}]`, data);

        } catch (err) {
            console.log("Invalid WS message:", raw.toString());
        }
    });

    // When device disconnects
    ws.on("close", () => {
        delete devices[deviceId];
        delete deviceState[deviceId];
        console.log("Device disconnected:", deviceId);
    });
});
