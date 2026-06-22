import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Express } from "express";

let app: Express | null = null;
let bootError: string | null = null;

async function getApp(): Promise<Express> {
  if (bootError) throw new Error(bootError);
  if (app) return app;
  try {
    const mod = await import("../server");
    app = mod.app;
    if (!app) throw new Error("Express app tidak diekspor dari server.ts");
    return app;
  } catch (err: any) {
    bootError = err?.stack || err?.message || String(err);
    throw err;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const expressApp = await getApp();
    return expressApp(req, res);
  } catch (err: any) {
    console.error("[Vercel API boot error]", err);
    res.status(500).json({
      error: "API gagal boot",
      detail: err?.message || String(err),
      bootError,
    });
  }
}

export const config = {
  maxDuration: 60,
};
