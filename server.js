import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clients = {};  // { deviceId: wsClient }

wss.on("connection", ws => {
    ws.on("message", msg => {
        let data = JSON.parse(msg);

        if (data.type === "register") {
            clients[data.deviceId] = ws;
            console.log("Device registered:", data.deviceId);
        }

        if (data.type === "status") {
            // update status in memory or DB
            clients[data.deviceId].lastStatus = data.payload;
        }
    });

    ws.on("close", () => {
        for (let id in clients) {
            if (clients[id] === ws) delete clients[id];
        }
    });
});

// REST API – send command to specific Pi
app.post("/device/:id/cmd", (req, res) => {
    const id = req.params.id;
    const cmd = req.body;

    if (!clients[id]) return res.status(404).json({ error: "Device offline" });

    clients[id].send(JSON.stringify({ type: "cmd", cmd }));
    res.json({ ok: true });
});

server.listen(3000, () => console.log("Cloud running"));
