// =========================================
// CLOUD AUDIO CONTROL SERVER (FINAL-CLEAN)
// Supports:
// - WebSocket device registration
// - Persistent device state memory
// - Command forwarding
// - /devices, /state, /send
// =========================================

const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");

const app = express();
app.use(express.json());
app.use(cors());

// Active device websocket connections
let devices = {}; // deviceId → ws

// Device state memory (survives reconnect)
let deviceState = {}; // deviceId → { status, stream, volume, lastSeen, online }


// =========================================
// BASIC ROUTES
// =========================================

// Test route
app.get("/", (req, res) => {
    res.json({ ok: true, message: "Cloud audio server running." });
});

// Return list of devices
app.get("/devices", (req, res) => {
    res.json({
        ok: true,
        online: Object.keys(devices),         // devices currently connected
        knownDevices: Object.keys(deviceState) // devices that ever sent state
    });
});

// Full state for dashboard
app.get("/state", (req, res) => {
    res.json(deviceState);
});

// Send command to a device
app.post("/send/:id", (req, res) => {
    const id = req.params.id;

    if (!devices[id]) {
        return res.json({ ok: false, error: "Device not connected" });
    }

    try {
        devices[id].send(JSON.stringify(req.body));
        res.json({ ok: true, sent: req.body });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});


// =========================================
// START SERVER (HTTP + WS on same port)
// =========================================

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
    console.log(`Cloud server running on port ${PORT}`);
});

// Create WebSocket server
const wss = new WebSocketServer({ server });


// =========================================
// WEBSOCKET DEVICE HANDLING
// =========================================

wss.on("connection", ws => {
    let boundId = null;

    console.log("New WS connection — waiting for deviceId...");

    ws.on("message", raw => {
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            console.log("Invalid WS message:", raw.toString());
            return;
        }

        // =====================================================
        // 1. DEVICE HANDSHAKE — first message MUST send deviceId
        // =====================================================
        if (data.deviceId) {
            boundId = data.deviceId;

            devices[boundId] = ws; // map deviceId → ws

            if (!deviceState[boundId]) {
                deviceState[boundId] = {};
            }

            deviceState[boundId].online = true;
            deviceState[boundId].lastSeen = Date.now();

            // Write optional fields
            if (data.status !== undefined) deviceState[boundId].status = data.status;
            if (data.stream !== undefined) deviceState[boundId].stream = data.stream;
            if (data.volume !== undefined) deviceState[boundId].volume = data.volume;

            console.log("Device registered:", boundId);
            return;
        }

        // If still no deviceId — ignore everything
        if (!boundId) {
            console.log("Ignoring message until deviceId is provided.");
            return;
        }

        // =====================================================
        // 2. DEVICE UPDATES (heartbeat, status, stream, volume)
        // =====================================================
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
