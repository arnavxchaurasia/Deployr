require("dotenv").config();
const app = require("./app");
const { Server } = require("socket.io");
const { initKafkaConsumer } = require("./services/kafkaService");
const socketUtil = require("./utils/socket");
const http = require("http");

const PORT = 9000;
const SOCKET_PORT = 9002;

// ---------------- Express (API) ----------------
const apiServer = http.createServer(app);
apiServer.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});

// ---------------- Socket.io ----------------
const socketServer = http.createServer();
const io = new Server(socketServer, {
  cors: { origin: "*" },
});

io.on("connection", socket => {
  socket.on("subscribe", payload => {
    const deploymentId = typeof payload === "string" ? payload : payload?.deploymentId;
    if (!deploymentId) return;

    socket.join(deploymentId);
    console.log(`Socket ${socket.id} subscribed to ${deploymentId}`);
  });

  socket.on("subscribe_user", userId => {
    if (!userId) return;
    socket.join(`user:${userId}`);
    console.log(`Socket ${socket.id} subscribed to user:${userId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

socketServer.listen(SOCKET_PORT, () => {
  console.log(`Socket server running on http://localhost:${SOCKET_PORT}`);
});

// Initialize socket util singleton
socketUtil.init(io);

// ---------------- Kafka Consumer ----------------
initKafkaConsumer(io).catch(err => {
  console.error("Failed to initialize Kafka consumer:", err);
});
