import pino from "pino";

// Initialize and export a Pino logger instance
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

export default logger;
