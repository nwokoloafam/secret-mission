import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// A separate project/output directory prevents scheduler builds and deploys
// from selecting or overwriting the website's default Worker.
export default defineConfig({ plugins: [cloudflare()] });
