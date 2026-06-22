/**
 * Entry point lokal: npm run dev
 * Mengaktifkan Playwright + Vite dev server (tidak dipakai di Vercel).
 */
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { app, registerPlaywrightCapture } from "./serverCore";

const PORT = Number(process.env.PORT || 3000);

registerPlaywrightCapture(async (targetUrl, opts) => {
  const mod = await import("./src/playwrightCapture");
  return mod.captureRealScreenshotWithPlaywright(targetUrl, opts);
});

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Dashboard Backend] Dev server: http://localhost:${PORT}`);
  });
}

startServer();
