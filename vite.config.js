import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const tfnswApiKey = env.TFNSW_API_KEY || env.VITE_TFNSW_API_KEY;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/gtfs-static": {
          target: "https://api.transport.nsw.gov.au/v1/gtfs/schedule",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/gtfs-static/, ""),
          headers: tfnswApiKey
            ? {
                Authorization: `apikey ${tfnswApiKey}`,
              }
            : undefined,
        },
        "/api/gtfs": {
          target: "https://api.transport.nsw.gov.au/v1/gtfs",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/gtfs/, ""),
          headers: tfnswApiKey
            ? {
                Authorization: `apikey ${tfnswApiKey}`,
              }
            : undefined,
        },
      },
    },
  };
});
