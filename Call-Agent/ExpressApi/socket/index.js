import { Server } from "socket.io";
import logger from "../utils/logger.js";
import jwt from "jsonwebtoken";
import config from "../config/index.js";

let io;

export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*", // Allow all origins for now, restricting in production recommended
            methods: ["GET", "POST"],
        },
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) {
            return next(new Error("Authentication error"));
        }
        jwt.verify(token, config.jwtSecret, (err, decoded) => {
            if (err) {
                return next(new Error("Authentication error"));
            }
            socket.user = decoded;
            next();
        });
    });

    io.on("connection", (socket) => {
        logger.info(`User connected via socket: ${socket.user.id}`);

        // Join a room specific to the user for private updates
        socket.join(socket.user.id);

        socket.on("disconnect", () => {
            logger.info(`User disconnected: ${socket.user.id}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};
