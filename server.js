const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Global status od Volumio uređaja
let volumioStatus = {
    online: false,
    volume: 0,
    status: "stop",
    uri: "",
    track: "",
    artist: "",
    lastUpdate: null
};

// Kada se Volumio Agent spoji
io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    // Klijent kaže da je on PI AGENT
    socket.on("identify_pi", () => {
        volumioStatus.online = true;
        volumioStatus.lastUpdate = new Date();
        socket.join("pi");
        console.log("Volumio AGENT ONLINE");
    });

    // Primamo status od Volumio Agenta
    socket.on("pi_status", (data) => {
        volumioStatus = { ...volumioStatus, ...data, online: true, lastUpdate: new Date() };
        io.emit("dashboard_status", volumioStatus);
    });

    // Dashboard šalje komande → prosljeđujemo tylko Volumio Agentu
    socket.on("dashboard_command", (cmd) => {
        io.to("pi").emit("pi_command", cmd);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

// fallback REST endpoint
app.get("/status", (req, res) => {
    res.json(volumioStatus);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log("Cloud server running on port", PORT);
});
