import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { umadbGrpcWebProxy } from "./server/grpc-web-proxy.mjs";

// UmaDB speaks native gRPC only, so both `vite` and `vite preview` translate the
// console's gRPC-Web calls into gRPC. Point them at a server with UMADB_URL
// (default http://127.0.0.1:50051); see server/grpc-web-proxy.mjs for more options.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "UMADB_");
  return {
    plugins: [
      react(),
      umadbGrpcWebProxy({
        target: env.UMADB_URL,
        caCertPath: env.UMADB_CA_CERT,
        apiKey: env.UMADB_API_KEY,
      }),
    ],
  };
});
