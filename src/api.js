const crypto = require("node:crypto");
const express = require("express");
const serverless = require("serverless-http");
const cors = require("cors");

const API_PATH = "/.netlify/functions/api";
const MAX_MESSAGE_LENGTH = 4096;
const DEFAULT_MAX_SESSIONS = 100;

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

  app.disable("x-powered-by");
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || config.allowedOrigins.includes(origin));
      },
    })
  );
  app.use(express.json({ limit: "64kb", strict: true }));

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

    request.bridgeSession = bridgeSession;

    next();
  });

  const readSessionMessages = (bridgeSession) =>
    messagesBySession.get(bridgeSession) || {
      easyeyes: "",
      filename: "",
      matlab: "",
    };

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

      if (
        !messagesBySession.has(request.bridgeSession) &&
        messagesBySession.size >= maxSessions
      ) {
        response.status(503).json({ error: "Bridge session capacity reached" });
        return;
      }

      const messages = readSessionMessages(request.bridgeSession);
      messages[responseKey] = message;
      messagesBySession.set(request.bridgeSession, messages);
      response.json({ message });
    });

    router.get(path, (request, response) => {
      const messages = readSessionMessages(request.bridgeSession);
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
