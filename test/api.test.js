const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");

const { createApp } = require("../src/api");

const enabledConfig = {
  allowedOrigins: ["https://easyeyes.app"],
  bridgeEnabled: true,
  bridgeToken: "test-bridge-token",
};

const authorizedRequest = (app, method, path) =>
  request(app)
    [method](path)
    .set("Authorization", "Bearer test-bridge-token")
    .set("X-Bridge-Session", "session-a")
    .set("Origin", "https://easyeyes.app");

test("mutable bridge routes stay unavailable unless explicitly enabled", async () => {
  const app = createApp({
    allowedOrigins: [],
    bridgeEnabled: false,
    bridgeToken: "",
  });

  const response = await request(app).get("/.netlify/functions/api/easyeyes");

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: "Bridge service is disabled" });
});

test("enabled bridge routes require the configured bearer token", async () => {
  const app = createApp(enabledConfig);

  const response = await request(app)
    .get("/.netlify/functions/api/easyeyes")
    .set("Origin", "https://easyeyes.app");

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Unauthorized" });
});

test("configured origins receive CORS access and other origins do not", async () => {
  const app = createApp(enabledConfig);

  const allowedResponse = await authorizedRequest(
    app,
    "get",
    "/.netlify/functions/api/easyeyes"
  );
  const deniedResponse = await request(app)
    .get("/.netlify/functions/api/easyeyes")
    .set("Authorization", "Bearer test-bridge-token")
    .set("Origin", "https://attacker.example");

  assert.equal(
    allowedResponse.headers["access-control-allow-origin"],
    "https://easyeyes.app"
  );
  assert.equal(deniedResponse.headers["access-control-allow-origin"], undefined);
});

test("bridge messages must use the documented bounded JSON shape", async () => {
  const app = createApp(enabledConfig);

  const invalidResponse = await authorizedRequest(
    app,
    "post",
    "/.netlify/functions/api/easyeyes"
  ).send({ message: { nested: true } });
  const validResponse = await authorizedRequest(
    app,
    "post",
    "/.netlify/functions/api/easyeyes"
  ).send({ message: "calibration ready" });

  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(invalidResponse.body, {
    error: "message must be a string between 1 and 4096 characters",
  });
  assert.equal(validResponse.status, 200);
  assert.deepEqual(validResponse.body, { message: "calibration ready" });
});

test("one bridge session cannot read another session's messages", async () => {
  const app = createApp(enabledConfig);

  await authorizedRequest(app, "post", "/.netlify/functions/api/easyeyes").send({
    message: "session-a message",
  });
  const otherSessionResponse = await authorizedRequest(
    app,
    "get",
    "/.netlify/functions/api/easyeyes"
  ).set("X-Bridge-Session", "session-b");

  assert.equal(otherSessionResponse.status, 200);
  assert.deepEqual(otherSessionResponse.body, { easyeyes: "" });
});

test("the bridge rejects new sessions after its configured capacity", async () => {
  const app = createApp({ ...enabledConfig, maxSessions: 1 });

  await authorizedRequest(app, "post", "/.netlify/functions/api/easyeyes").send({
    message: "session-a message",
  });
  const response = await authorizedRequest(
    app,
    "post",
    "/.netlify/functions/api/easyeyes"
  )
    .set("X-Bridge-Session", "session-b")
    .send({ message: "session-b message" });

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { error: "Bridge session capacity reached" });
});

test("the bridge rate-limits repeated requests within one window", async () => {
  const app = createApp({
    ...enabledConfig,
    maxRequestsPerMinute: 1,
  });

  await authorizedRequest(app, "get", "/.netlify/functions/api/easyeyes");
  const response = await authorizedRequest(
    app,
    "get",
    "/.netlify/functions/api/easyeyes"
  );

  assert.equal(response.status, 429);
  assert.deepEqual(response.body, { error: "Too many bridge requests" });
});

test("expired sessions release capacity", async () => {
  let currentTime = 1_000;
  const app = createApp({
    ...enabledConfig,
    maxSessions: 1,
    now: () => currentTime,
    sessionTtlMs: 500,
  });

  await authorizedRequest(app, "post", "/.netlify/functions/api/easyeyes").send({
    message: "session-a message",
  });
  currentTime += 501;
  const response = await authorizedRequest(
    app,
    "post",
    "/.netlify/functions/api/easyeyes"
  )
    .set("X-Bridge-Session", "session-b")
    .send({ message: "session-b message" });

  assert.equal(response.status, 200);
});
