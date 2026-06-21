import { io } from "socket.io-client";

// Connect dynamically to the API server running on port 9002
const socketUrl = typeof window !== "undefined" 
  ? `http://${window.location.hostname}:9002` 
  : "http://localhost:9002";

export const socket = io(socketUrl, {
  autoConnect: false,
});
