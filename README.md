# nodejs-server

This repository contains an experimental in-memory message bridge between
EasyEyes and MATLAB. Its current deployment status and individual maintainer
are not confirmed. It must not be treated as a production multi-instance or
durable messaging service.

## Secure default

The mutable bridge routes return `503` unless the bridge is explicitly enabled
and a bearer token is configured. This prevents an accidental deployment from
exposing process-global messages publicly.

Set these environment variables to enable the bridge:

- `ENABLE_IN_MEMORY_BRIDGE=true`
- `BRIDGE_TOKEN`: a strong deployment secret sent as
  `Authorization: Bearer <token>`
- `ALLOWED_ORIGINS`: a comma-separated list of exact browser origins; omit it
  for server-to-server use
- `MAX_BRIDGE_SESSIONS`: maximum in-memory sessions; defaults to `100`
- `MAX_REQUESTS_PER_MINUTE`: per-session fixed-window limit; defaults to `60`
- `BRIDGE_SESSION_TTL_MS`: idle session expiry; defaults to `900000` (15
  minutes)

Every bridge request must also send an `X-Bridge-Session` value containing 1 to
64 letters, numbers, underscores, or hyphens. Messages are stored in separate
partitions selected by this value. A session identifier is not an access
control: any bearer-token holder can name any session. Idle sessions expire,
and session count and request rate are bounded. Request bodies use JSON in the
form `{ "message": "..." }`; messages are limited to 4096 characters and JSON
bodies to 64 KiB.

The token only protects this prototype; it does not provide user identity or
role-based authorization. Do not put `BRIDGE_TOKEN` in public browser code. A
public or multi-user deployment needs a reviewed identity model, rate limiting,
durable per-session storage with expiry, monitoring, and an identified owner.
The in-process limiter is only prototype containment; production needs an
upstream or identity-bound limit that also covers unauthenticated traffic.

## Routes

The Netlify function base path is `/.netlify/functions/api`.

- `GET /` is an unauthenticated health response.
- `GET|POST /easyeyes` reads or updates the EasyEyes message.
- `GET|POST /matlab` reads or updates the MATLAB message.
- `GET|POST /filename` reads or updates the filename message.

## Development

Use Node.js 24 LTS, as recorded in `.nvmrc`. The package also accepts Node.js
22 LTS for compatibility.

```sh
npm ci
npm test
npm run build
npm start
```

Netlify uses `src/` directly as its functions directory; the deprecated
`netlify-lambda` bundler is not required.
