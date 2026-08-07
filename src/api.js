const crypto = require("node:crypto");
const express = require("express");
const serverless = require("serverless-http");
const cors = require("cors");

const API_PATH = "/.netlify/functions/api";
const MAX_MESSAGE_LENGTH = 4096;
const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 60;
const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;

const parseAllowedOrigins = (value = "") =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const readConfig = (environment = process.env) => ({
  allowedOrigins: parseAllowedOrigins(environment.ALLOWED_ORIGINS),
  bridgeEnabled: environment.ENABLE_IN_MEMORY_BRIDGE === "true",
  bridgeToken: environment.BRIDGE_TOKEN || "",
  maxSessions: Number.parseInt(
    environment.MAX_BRIDGE_SESSIONS || `${DEFAULT_MAX_SESSIONS}`,
    10
  ),
  maxRequestsPerMinute: Number.parseInt(
    environment.MAX_REQUESTS_PER_MINUTE ||
      `${DEFAULT_MAX_REQUESTS_PER_MINUTE}`,
    10
  ),
  sessionTtlMs: Number.parseInt(
    environment.BRIDGE_SESSION_TTL_MS || `${DEFAULT_SESSION_TTL_MS}`,
    10
  ),
});

const tokensMatch = (providedToken, configuredToken) => {
  const provided = Buffer.from(providedToken);
  const configured = Buffer.from(configuredToken);

  return (
    provided.length === configured.length &&
    crypto.timingSafeEqual(provided, configured)
  );
};

const createApp = (config = readConfig()) => {
  const app = express();
  const router = express.Router();
  const messagesBySession = new Map();
  const maxSessions =
    Number.isSafeInteger(config.maxSessions) && config.maxSessions > 0
      ? config.maxSessions
      : DEFAULT_MAX_SESSIONS;
  const maxRequestsPerMinute =
    Number.isSafeInteger(config.maxRequestsPerMinute) &&
    config.maxRequestsPerMinute > 0
      ? config.maxRequestsPerMinute
      : DEFAULT_MAX_REQUESTS_PER_MINUTE;
  const sessionTtlMs =
    Number.isSafeInteger(config.sessionTtlMs) && config.sessionTtlMs > 0
      ? config.sessionTtlMs
      : DEFAULT_SESSION_TTL_MS;
  const now = config.now || Date.now;

  app.disable("x-powered-by");
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || config.allowedOrigins.includes(origin));
      },
    })
  );

  router.get("/", (_request, response) => {
    response.json({ status: "ok" });
  });

  router.use((request, response, next) => {
    if (!config.bridgeEnabled || !config.bridgeToken) {
      response.status(503).json({ error: "Bridge service is disabled" });
      return;
    }

    const authorization = request.get("Authorization") || "";
    const providedToken = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";

    if (!tokensMatch(providedToken, config.bridgeToken)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    const bridgeSession = request.get("X-Bridge-Session") || "";
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(bridgeSession)) {
      response.status(400).json({
        error: "X-Bridge-Session must contain 1 to 64 letters, numbers, underscores, or hyphens",
      });
      return;
    }

    const requestTime = now();
    for (const [sessionId, session] of messagesBySession) {
      if (requestTime - session.lastSeen > sessionTtlMs) {
        messagesBySession.delete(sessionId);
      }
    }

    let session = messagesBySession.get(bridgeSession);
    if (!session) {
      if (messagesBySession.size >= maxSessions) {
        response.status(503).json({ error: "Bridge session capacity reached" });
        return;
      }

      session = {
        lastSeen: requestTime,
        messages: {
          easyeyes: "",
          filename: "",
          matlab: "",
        },
        requestCount: 0,
        windowStartedAt: requestTime,
      };
      messagesBySession.set(bridgeSession, session);
    }

    if (requestTime - session.windowStartedAt >= 60_000) {
      session.requestCount = 0;
      session.windowStartedAt = requestTime;
    }

    if (session.requestCount >= maxRequestsPerMinute) {
      response.status(429).json({ error: "Too many bridge requests" });
      return;
    }

    session.lastSeen = requestTime;
    session.requestCount += 1;
    request.bridgeSession = bridgeSession;
    request.bridgeState = session;

    next();
  });

  router.use(express.json({ limit: "64kb", strict: true }));

  const registerMessageRoutes = (path, responseKey) => {
    router.post(path, (request, response) => {
      const message = request.body?.message;

      if (
        typeof message !== "string" ||
        message.length === 0 ||
        message.length > MAX_MESSAGE_LENGTH
      ) {
        response.status(400).json({
          error: `message must be a string between 1 and ${MAX_MESSAGE_LENGTH} characters`,
        });
        return;
      }

      const messages = request.bridgeState.messages;
      messages[responseKey] = message;
      response.json({ message });
    });

    router.get(path, (request, response) => {
      const messages = request.bridgeState.messages;
      response.json({ [responseKey]: messages[responseKey] });
    });
  };

  registerMessageRoutes("/easyeyes", "easyeyes");
  registerMessageRoutes("/filename", "filename");
  registerMessageRoutes("/matlab", "matlab");

  app.use(API_PATH, router);

  app.use((error, _request, response, next) => {
    if (error.type === "entity.too.large") {
      response.status(413).json({ error: "Request body is too large" });
      return;
    }

    if (error instanceof SyntaxError && error.status === 400) {
      response.status(400).json({ error: "Request body must be valid JSON" });
      return;
    }

    next(error);
  });

  return app;
};

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
module.exports.handler = serverless(app);
