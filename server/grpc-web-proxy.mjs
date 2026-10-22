// A minimal gRPC-Web -> gRPC proxy, so the browser console can talk to an
// unmodified UmaDB server. Browsers can't speak native gRPC (HTTP/2 trailers),
// so requests arrive as gRPC-Web over HTTP/1.1 and are forwarded to UmaDB over
// HTTP/2. Message frames are identical in both protocols and are piped through
// untouched; only the trailers need converting into a gRPC-Web trailer frame.
//
// Configuration (environment variables):
//   UMADB_URL      UmaDB server, default http://127.0.0.1:50051 (https:// for TLS)
//   UMADB_CA_CERT  PEM file to trust for TLS, e.g. a self-signed server certificate
//   UMADB_API_KEY  API key to send when the browser didn't send its own

import fs from "node:fs";
import http2 from "node:http2";

const SERVICE_PREFIXES = ["/umadb.v1.DCB/", "/grpc.health.v1.Health/"];

// Request headers worth forwarding upstream. Everything else is either
// HTTP/1-specific or gRPC-Web-specific.
const FORWARD_HEADERS = ["authorization", "grpc-timeout", "grpc-accept-encoding", "grpc-encoding"];

// UmaDB puts an encoded umadb.v1.ErrorResponse in grpc-status-details-bin, but
// gRPC-Web clients expect a google.rpc.Status there and fail to decode it,
// hiding the real error. grpc-status and grpc-message carry the same information.
const DROPPED_RESPONSE_HEADERS = new Set(["grpc-status-details-bin", "content-length"]);

const GRPC_STATUS_UNAVAILABLE = 14;
const GRPC_STATUS_UNIMPLEMENTED = 12;
const GRPC_STATUS_UNKNOWN = 2;

/**
 * Creates a Connect/Express-style middleware `(req, res, next)` that proxies
 * gRPC-Web requests for UmaDB's services and passes anything else to `next`.
 */
export function createGrpcWebProxy({
  target = process.env.UMADB_URL || "http://127.0.0.1:50051",
  caCertPath = process.env.UMADB_CA_CERT,
  apiKey = process.env.UMADB_API_KEY,
} = {}) {
  const ca = caCertPath ? fs.readFileSync(caCertPath) : undefined;
  let session = null;

  function getSession() {
    if (session && !session.closed && !session.destroyed) return session;
    const s = http2.connect(target, ca ? { ca } : {});
    s.on("error", () => {}); // Surfaced per-stream; just drop the session.
    s.on("close", () => {
      if (session === s) session = null;
    });
    s.on("goaway", () => {
      if (session === s) session = null;
    });
    session = s;
    return s;
  }

  function middleware(req, res, next) {
    const path = (req.url || "").split("?")[0];
    if (!SERVICE_PREFIXES.some((p) => path.startsWith(p))) return next();
    const contentType = String(req.headers["content-type"] || "");
    if (req.method !== "POST" || !contentType.startsWith("application/grpc-web")) return next();
    if (contentType.startsWith("application/grpc-web-text")) {
      sendTrailersOnly(res, GRPC_STATUS_UNIMPLEMENTED, "grpc-web-text is not supported; use binary gRPC-Web");
      return;
    }

    const headers = {
      ":method": "POST",
      ":path": path,
      "content-type": "application/grpc+proto",
      te: "trailers",
    };
    for (const name of FORWARD_HEADERS) {
      if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    }
    if (apiKey && !headers.authorization) headers.authorization = `Bearer ${apiKey}`;

    let upstream;
    try {
      upstream = getSession().request(headers);
    } catch (err) {
      sendTrailersOnly(res, GRPC_STATUS_UNAVAILABLE, `cannot reach UmaDB at ${target}: ${err.message}`);
      return;
    }

    let finished = false;

    upstream.on("response", (upstreamHeaders) => {
      const status = Number(upstreamHeaders[":status"]);
      if (status !== 200) {
        finished = true;
        upstream.close(http2.constants.NGHTTP2_CANCEL);
        sendTrailersOnly(
          res,
          status === 404 ? GRPC_STATUS_UNIMPLEMENTED : GRPC_STATUS_UNKNOWN,
          `unexpected HTTP ${status} from UmaDB at ${target}`,
        );
        return;
      }
      const out = { "content-type": "application/grpc-web+proto" };
      for (const [name, value] of Object.entries(upstreamHeaders)) {
        if (name.startsWith(":") || name === "content-type" || DROPPED_RESPONSE_HEADERS.has(name)) continue;
        out[name] = value;
      }
      res.writeHead(200, out);
      res.flushHeaders();
    });

    upstream.on("data", (chunk) => {
      if (!finished) res.write(chunk);
    });

    upstream.on("trailers", (trailers) => {
      if (!finished && res.headersSent) res.write(trailerFrame(trailers));
    });

    upstream.on("end", () => {
      if (finished) return;
      finished = true;
      res.end();
    });

    upstream.on("error", (err) => {
      if (finished) return;
      finished = true;
      const message = `UmaDB at ${target}: ${err.message}`;
      if (res.headersSent) {
        res.end(trailerFrame({ "grpc-status": String(GRPC_STATUS_UNAVAILABLE), "grpc-message": message }));
      } else {
        sendTrailersOnly(res, GRPC_STATUS_UNAVAILABLE, message);
      }
    });

    // The browser went away (e.g. a subscription was stopped): cancel upstream.
    res.on("close", () => {
      if (!finished) {
        finished = true;
        upstream.close(http2.constants.NGHTTP2_CANCEL);
      }
    });

    req.pipe(upstream);
  }

  return { middleware, target };
}

/** Encodes trailers as a gRPC-Web trailer frame: flag 0x80, 4-byte length, HTTP/1-style header block. */
function trailerFrame(trailers) {
  let block = "";
  for (const [name, value] of Object.entries(trailers)) {
    if (name.startsWith(":") || DROPPED_RESPONSE_HEADERS.has(name)) continue;
    for (const v of Array.isArray(value) ? value : [value]) block += `${name}: ${v}\r\n`;
  }
  const body = Buffer.from(block, "utf8");
  const frame = Buffer.alloc(5 + body.length);
  frame[0] = 0x80;
  frame.writeUInt32BE(body.length, 1);
  body.copy(frame, 5);
  return frame;
}

function sendTrailersOnly(res, code, message) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(200, {
    "content-type": "application/grpc-web+proto",
    "grpc-status": String(code),
    "grpc-message": encodeURIComponent(message),
  });
  res.end();
}

/** Vite plugin that serves the proxy from both `vite` (dev) and `vite preview`. */
export function umadbGrpcWebProxy(options) {
  const proxy = createGrpcWebProxy(options);
  const install = (server) => {
    server.middlewares.use(proxy.middleware);
    server.httpServer?.once("listening", () => {
      server.config.logger.info(`  ➜  UmaDB:   proxying gRPC-Web to ${proxy.target}`);
    });
  };
  // Install from the returned post-hook, not directly: Vite adds its CORS and
  // host-check (DNS rebinding) middlewares after configureServer runs, and the
  // proxy must sit behind them since it can attach UMADB_API_KEY to requests.
  return {
    name: "umadb-grpc-web-proxy",
    configureServer: (server) => () => install(server),
    configurePreviewServer: (server) => () => install(server),
  };
}
