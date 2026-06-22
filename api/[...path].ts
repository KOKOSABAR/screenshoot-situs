import { app } from "../server";

// Catch-all agar semua route `/api/*` masuk ke Express app tanpa perlu rewrite khusus.
export default app;

export const config = {
  runtime: "nodejs20.x",
  maxDuration: 60,
};

