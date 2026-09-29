import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works on GitHub Pages (project sub-path) and from disk.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
