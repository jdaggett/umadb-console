# umadb-ui

A browser console for [UmaDB](https://umadb.io), the event store built for Dynamic
Consistency Boundaries. Built with React, TypeScript and Vite, it works with any stock UmaDB
server: the browser makes gRPC-Web calls using [Connect](https://connectrpc.com/) clients
generated from UmaDB's protobuf API (`proto/v1/umadb.proto`), and a small proxy in this
package (`server/grpc-web-proxy.mjs`) forwards them to UmaDB over native gRPC.

Requires Node.js 20 or later and a running UmaDB server (e.g. `cargo install umadb`).

```
browser ──gRPC-Web (HTTP/1.1)──▶ vite / vite preview + proxy ──gRPC (HTTP/2)──▶ umadb
```

## Features

| Page            | RPC                    | What it does                                                                                                   |
| --------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Overview**    | `Head`, `Read`, Health | Shows server status, health, head position, append rate, the most common types and tags, and the latest events. |
| **Event Store** | `Read`                 | Pages through the log newest- or oldest-first, filters with DCB queries, jumps to a position, and inspects each event (JSON tree, raw, hex or base64 data, plus metadata, UUID and tracking info). Click a type or tag to filter by it. |
| **Live**        | `Subscribe`            | Streams events from now, from the beginning, or after a position, with optional filtering.                      |
| **Append**      | `Append`               | Builds multi-event atomic appends with tags, JSON or text data, UUIDs and metadata. Supports DCB append conditions (`fail_if_events_match` and `after`) and tracking info. |
| **Tracking**    | `GetTrackingInfo`      | Keeps a list of upstream sources and shows each one's recorded position.                                         |
| **Connection**  | `Head`, Health         | Sets the API key (stored in this browser only) and tests the connection.                                         |

## Running

Start UmaDB as usual, then start the console:

```sh
umadb --db-path ./uma.db

npm install
npm run dev                                   # http://localhost:5173
```

For a production build, run `npm run build && npm run preview`. `vite preview` serves `dist/`
and includes the same proxy. Add `-- --host` to listen on all interfaces.

### Configuration

The proxy reads these environment variables (from the shell or a `.env` file):

| Variable        | Default                  | Purpose                                                                 |
| --------------- | ------------------------ | ----------------------------------------------------------------------- |
| `UMADB_URL`     | `http://127.0.0.1:50051` | UmaDB server. Use `https://…` if the server runs with `--tls-cert`.      |
| `UMADB_CA_CERT` | system roots             | PEM file to trust, e.g. a self-signed server certificate.               |
| `UMADB_API_KEY` | none                     | API key to send when the browser hasn't entered one on the Connection page. |

```sh
UMADB_URL=https://localhost:50051 UMADB_CA_CERT=./server.pem npm run dev
```

If the server runs with `--api-key` and `UMADB_API_KEY` isn't set, enter the key on the
**Connection** page. It is sent as `authorization: Bearer <key>`.

## Regenerating protobuf code

The generated TypeScript in `src/gen` is committed. The `.proto` files in `proto/` are
copies (see `proto/README.md`); after updating them, run:

```sh
npm run generate
```
