// =========================================
// CLOUD AUDIO CONTROL SERVER (FINAL VERSION)
// =========================================

const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.json());
app.use(cors());

// WebSocket connections: deviceId → ws
let devices = {};

// Last known state per device: deviceId → {}
let deviceState = {};


// =========================================
// BASIC ROUTES
// =========================================

app.get("/", (req, res) => {
    res.json({ ok: true, message: "Cloud server online." });
});

app.get("/devices", (req, res) => {
    res.json({
        online: Object.keys(devices),
        knownDevices: Object.keys(deviceState)
    });
});

app.get("/state", (req, res) => {
    res.json(deviceState);
});

// SEND COMMAND TO DEVICE
app.post("/send/:id", (req, res) => {
    const id = req.params.id;

    if (!devices[id]) {
        return res.json({ ok: false, error: "Device not connected" });
    }

    try {
        devices[id].send(JSON.stringify(req.body));
        return res.json({ ok: true, sent: req.body });
    } catch (err) {
        return res.json({ ok: false, error: err.message });
    }
});


// =========================================
// SERVER + WEBSOCKETS
// =========================================

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log("Cloud server running on port", PORT);
});

const wss = new WebSocketServer({ server });


// =========================================
// WEBSOCKET HANDLER
// =========================================

wss.on("connection", ws => {
    let boundId = null; // Assigned AFTER agent sends its ID

    console.log("Client connected (waiting for deviceId)...");

    ws.on("message", raw => {
        let data = {};

        try {
            data = JSON.parse(raw);
        } catch {
            console.log("Invalid message:", raw.toString());
            return;
        }

        // Agent handshake (deviceId)
        if (data.deviceId) {
            boundId = data.deviceId;

            devices[boundId] = ws;

            if (!deviceState[boundId]) {
                deviceState[boundId] = {};
            }

            deviceState[boundId].online = true;
            deviceState[boundId].lastSeen = Date.now();

            // Store status fields if present
            if (data.status !== undefined) deviceState[boundId].status = data.status;
            if (data.stream !== undefined) deviceState[boundId].stream = data.stream;
            if (data.volume !== undefined) deviceState[boundId].volume = data.volume;

            console.log("Device registered:", boundId);
            return;
        }

        if (!boundId) {
            console.log("Ignoring message (no deviceId yet)");
            return;
        }

        // Update status
        deviceState[boundId] = {
            ...deviceState[boundId],
            ...data,
            lastSeen: Date.now(),
            online: true
        };
    });

    ws.on("close", () => {
        if (boundId) {
            console.log("Device disconnected:", boundId);
            deviceState[boundId].online = false;
            delete devices[boundId];
        }
    });
});
