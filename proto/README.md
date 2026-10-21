# Protocol definitions

- `v1/umadb.proto` is copied from UmaDB
  ([`umadb-proto/proto/v1/umadb.proto`](https://github.com/umadb-io/umadb/blob/main/umadb-proto/proto/v1/umadb.proto)),
  licensed under either of `LICENSE-MIT` or `LICENSE-APACHE` in this directory.
  When UmaDB's API changes, copy the new version here and run `npm run generate`.
- `grpc/health/v1/health.proto` is the subset of the standard
  [gRPC health checking protocol](https://github.com/grpc/grpc/blob/master/doc/health-checking.md)
  that the console uses.
