import http from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import app from "./app";
import { env } from "./config/env";
import { setSocketServer } from "./config/socket";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.CLIENT_URL,
    credentials: true
  }
});

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { id: number; role: string };
      socket.join(`role:${decoded.role}`);
      socket.join(`user:${decoded.id}`);
    } catch (_error) {
      // invalid token: keep anonymous socket for public health only
    }
  }

  socket.on("disconnect", () => {
    // no-op
  });
});

setSocketServer(io);

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${env.PORT}`);
});
