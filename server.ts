import express from "express";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { INITIAL_SPREADSHEET_DATA } from "./src/data";
import { SpreadsheetRow, ScreenshotFile } from "./src/types";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_VERCEL = Boolean(process.env.VERCEL);

// Vercel serverless: hanya /tmp yang bisa ditulis. Di lokal tetap pakai ./data
function getDataDir() {
  return IS_VERCEL
    ? path.join(os.tmpdir(), "screenshot-dashboard-data")
    : path.join(process.cwd(), "data");
}

// -----------------------------------------------------------------------------
// Screenshot capture tuning
// -----------------------------------------------------------------------------
// Banyak layanan screenshot pihak ketiga akan mengembalikan gambar "placeholder"
// jika halaman belum selesai render. Nilai ini menambah waktu tunggu & retry
// agar peluang dapat screenshot "siap" lebih tinggi.
const MICROLINK_WAIT_FOR_MS = Number(
  process.env.MICROLINK_WAIT_FOR_MS || (IS_VERCEL ? 6000 : 10000)
);
const MICROLINK_MAX_RETRIES = Number(
  process.env.MICROLINK_MAX_RETRIES || (IS_VERCEL ? 1 : 2)
);
const MICROLINK_RETRY_DELAY_MS = Number(process.env.MICROLINK_RETRY_DELAY_MS || 2500);
const MIN_REAL_SCREENSHOT_BYTES = Number(process.env.MIN_REAL_SCREENSHOT_BYTES || 12_000); // heuristik sederhana

// Playwright (real browser) capture: ini cara paling mendekati "website terbuka sempurna".
// Tujuannya: hindari screenshot halaman verifikasi Cloudflare/anti-bot seperti contoh user.
const PLAYWRIGHT_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 60_000);
const PLAYWRIGHT_MAX_RETRIES = Number(process.env.PLAYWRIGHT_MAX_RETRIES || 1); // total attempt = 1 + retries
const PLAYWRIGHT_COOLDOWN_MS = Number(process.env.PLAYWRIGHT_COOLDOWN_MS || 4000);
const PLAYWRIGHT_EXTRA_STABLE_WAIT_MS = Number(process.env.PLAYWRIGHT_EXTRA_STABLE_WAIT_MS || 2500);

async function captureRealScreenshotWithPlaywright(targetUrl: string): Promise<Buffer> {
  // Playwright sengaja tidak di-bundle ke Vercel (terlalu berat). Lokal pakai localDev.ts.
  throw new Error("Playwright tidak tersedia di runtime ini");
}

// Middleware to parse incoming bodies with increased size limit for base64 screenshots
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Directories (lazy init agar aman di Vercel cold start)
const DATA_DIR = getDataDir();
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const DB_FILE = path.join(DATA_DIR, "db.json");

let DISK_STORAGE_OK = true;
let DISK_STORAGE_ERR = "";

function ensureDataDirs() {
  if (!DISK_STORAGE_OK) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
  } catch (e: any) {
    // Jika runtime tidak mengizinkan filesystem (atau /tmp tidak bisa ditulis),
    // jangan bikin semua endpoint 500. Kita fallback ke penyimpanan memori.
    DISK_STORAGE_OK = false;
    DISK_STORAGE_ERR = e?.message || String(e);
    console.error("[Storage] Filesystem tidak tersedia, fallback ke memori:", DISK_STORAGE_ERR);
  }
}

ensureDataDirs();

async function persistScreenshotFile(
  filename: string,
  imageBuffer: Buffer
): Promise<{ imageUrl: string; filename: string }> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`screenshots/${filename}`, imageBuffer, {
      access: "public",
      contentType: "image/png",
    });
    return { imageUrl: blob.url, filename };
  }

  // Fallback 1: simpan ke disk (lokal atau /tmp)
  if (DISK_STORAGE_OK) {
    ensureDataDirs();
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    fs.writeFileSync(filepath, imageBuffer);
    // Di Vercel, lebih aman expose lewat endpoint API (bukan rewrite /screenshots)
    // karena konfigurasi static route bisa berbeda-beda.
    return {
      imageUrl: IS_VERCEL ? `/api/screenshot-file/${encodeURIComponent(filename)}` : `/screenshots/${filename}`,
      filename,
    };
  }

  // Fallback 2: jika disk tidak tersedia, kirim sebagai data URL agar UI tetap bisa tampil.
  // Catatan: Ini tidak persisten; untuk produksi disarankan aktifkan Vercel Blob Storage.
  const dataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  return { imageUrl: dataUrl, filename };
}

// Ensure database file exists
function loadDatabase(): { spreadsheet: SpreadsheetRow[]; screenshots: ScreenshotFile[] } {
  ensureDataDirs();
  if (!DISK_STORAGE_OK) {
    // Tanpa disk: jalankan dengan default data (non-persisten) supaya API tidak 500.
    return { spreadsheet: INITIAL_SPREADSHEET_DATA, screenshots: [] };
  }
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      // Basic integrity checks
      if (Array.isArray(parsed.spreadsheet)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("Load DB error, falling back:", err);
  }

  const defaultDb = { spreadsheet: INITIAL_SPREADSHEET_DATA, screenshots: [] };
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf-8");
  } catch (e: any) {
    DISK_STORAGE_OK = false;
    DISK_STORAGE_ERR = e?.message || String(e);
    console.error("[Storage] Gagal menulis DB, fallback ke memori:", DISK_STORAGE_ERR);
  }
  return defaultDb;
}

function saveDatabase(data: { spreadsheet: SpreadsheetRow[]; screenshots: ScreenshotFile[] }) {
  ensureDataDirs();
  if (!DISK_STORAGE_OK) return;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e: any) {
    DISK_STORAGE_OK = false;
    DISK_STORAGE_ERR = e?.message || String(e);
    console.error("[Storage] Gagal menyimpan DB, fallback ke memori:", DISK_STORAGE_ERR);
  }
}

// Serve Screenshots Directory statically
app.use("/screenshots", express.static(SCREENSHOTS_DIR));

// Serve single screenshot file via API (utama untuk Vercel ketika storage menggunakan /tmp)
app.get("/api/screenshot-file/:filename", (req, res) => {
  try {
    if (!DISK_STORAGE_OK) return res.status(404).send("Storage tidak tersedia");
    const filename = String(req.params.filename || "");
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).send("Nama file tidak valid");
    }
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).send("File tidak ditemukan");
    const buf = fs.readFileSync(filepath);
    res.setHeader("Content-Type", "image/png");
    res.send(buf);
  } catch (e: any) {
    res.status(500).send(e?.message || "Gagal membaca file");
  }
});

// -----------------------------------------------------------------------------
// API ENDPOINTS
// -----------------------------------------------------------------------------

// Health Check API
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    mode: process.env.NODE_ENV || "development",
    platform: IS_VERCEL ? "vercel" : "node",
    storage: process.env.BLOB_READ_WRITE_TOKEN
      ? "vercel-blob"
      : IS_VERCEL
        ? (DISK_STORAGE_OK ? "tmp" : "memory")
        : "local-disk",
    dataDir: DATA_DIR,
    diskStorageOk: DISK_STORAGE_OK,
    diskStorageErr: DISK_STORAGE_ERR || undefined,
  });
});

// Load Spreadsheet Data
app.get("/api/spreadsheet", (req, res) => {
  const db = loadDatabase();
  res.json(db.spreadsheet);
});

// Update single cell or the entire spreadsheet array
app.post("/api/spreadsheet", (req, res) => {
  try {
    const updatedRows = req.body;
    const db = loadDatabase();

    if (Array.isArray(updatedRows)) {
      db.spreadsheet = updatedRows;
    } else if (updatedRows && updatedRows.id) {
      const index = db.spreadsheet.findIndex(row => row.id === updatedRows.id);
      if (index !== -1) {
        db.spreadsheet[index] = { ...db.spreadsheet[index], ...updatedRows };
      }
    }
    saveDatabase(db);
    res.json({ success: true, count: db.spreadsheet.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sync pulling from Google Apps Script Web App
app.post("/api/sheets-sync/pull", async (req, res) => {
  try {
    const { webAppUrl } = req.body;
    if (!webAppUrl || !webAppUrl.startsWith("https://script.google.com/")) {
      return res.status(400).json({ error: "URL Web App Google Apps Script tidak valid." });
    }

    console.log(`[Sync Pull] Fetching from Google Sheets Web App: ${webAppUrl}`);
    const response = await fetch(webAppUrl);
    if (!response.ok) {
      throw new Error(`Google Apps Script returned status ${response.status}`);
    }
    
    const sheetData = await response.json();
    if (!Array.isArray(sheetData)) {
      throw new Error("Format data yang dikembalikan oleh Google Apps Script bukan Array.");
    }

    if (sheetData.length === 0) {
      throw new Error("Google spreadsheet Anda kosong atau tidak berisi baris data. Penarikan data dibatalkan secara cerdas agar tidak menghapus daftar kategori aktif Anda.");
    }

    // Merge/sync with local database
    const db = loadDatabase();
    
    // We want to map and update spreadsheet rows but preserve any screenshot images
    // if local has them. Or if the Google Sheet has screenshot links, use them.
    db.spreadsheet = sheetData.map((row: any) => {
      // Find existing row locally
      const existing = db.spreadsheet.find(r => r.id === row.id || r.category === row.category);
      return {
        id: row.id || `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        category: row.category || "Tanpa Kategori",
        url: row.url || "https://",
        requiresLogin: !!row.requiresLogin,
        username: row.username || "",
        password: row.password || "",
        lastScreenshotTime: row.lastScreenshotTime || (existing ? existing.lastScreenshotTime : null),
        lastScreenshotUrl: row.lastScreenshotUrl || (existing ? existing.lastScreenshotUrl : null),
        status: row.status || (existing ? existing.status : "idle")
      };
    });

    saveDatabase(db);
    res.json({ success: true, count: db.spreadsheet.length, data: db.spreadsheet });
  } catch (error: any) {
    console.error("[Sync Pull Error]:", error);
    res.status(500).json({ error: error.message || "Gagal menarik data dari Google Sheets. Pastikan Web App diset ke 'Anyone'." });
  }
});

// Sync pushing to Google Apps Script Web App
app.post("/api/sheets-sync/push", async (req, res) => {
  try {
    const { webAppUrl } = req.body;
    if (!webAppUrl || !webAppUrl.startsWith("https://script.google.com/")) {
      return res.status(400).json({ error: "URL Web App Google Apps Script tidak valid." });
    }

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const origin = `${protocol}://${host}`;

    const db = loadDatabase();
    // Convert any relative screenshot paths to full absolute URLs so Google Sheets displays clickable links
    const rowsToPush = db.spreadsheet.map(row => {
      let finalUrl = row.lastScreenshotUrl;
      if (finalUrl && finalUrl.startsWith('/screenshots/')) {
        finalUrl = `${origin}${finalUrl}`;
      }
      return {
        ...row,
        lastScreenshotUrl: finalUrl
      };
    });

    // Prepare all screenshot gallery logs with fully-qualified URLs for the second Sheet
    const screenshotsToPush = (db.screenshots || []).map(sc => {
      let finalUrl = sc.imageUrl;
      if (finalUrl && finalUrl.startsWith('/screenshots/')) {
        finalUrl = `${origin}${finalUrl}`;
      }
      return {
        category: sc.category || "Unknown",
        imageUrl: finalUrl,
        timestamp: sc.timestamp
      };
    });

    console.log(`[Sync Push] Pushing ${rowsToPush.length} rows and ${screenshotsToPush.length} screenshots to Google Sheets Web App: ${webAppUrl}`);
    
    const payload = {
      spreadsheet: rowsToPush,
      screenshots: screenshotsToPush
    };

    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Google Sheets Web App responded with status: ${response.status}`);
    }

    const resJson = await response.json();
    res.json({ success: true, response: resJson });
  } catch (error: any) {
    console.error("[Sync Push Error]:", error);
    res.status(500).json({ error: error.message || "Gagal mengirim data ke Google Sheets" });
  }
});

// Reset Spreadsheet to Default initial fields
app.post("/api/spreadsheet/reset", (req, res) => {
  try {
    const db = loadDatabase();
    db.spreadsheet = INITIAL_SPREADSHEET_DATA;
    saveDatabase(db);
    res.json({ success: true, data: db.spreadsheet });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all saved screenshots catalog
app.get("/api/screenshots", (req, res) => {
  const db = loadDatabase();
  res.json(db.screenshots);
});

// Save a screenshot (attempts real screenshot capture from URL, fallback to high-fidelity simulator base64 if fails)
app.post("/api/save-screenshot", async (req, res) => {
  try {
    const { rowId, imageBase64, category, url, usernameUsed } = req.body;
    if (!rowId) {
      return res.status(400).json({ error: "Missing rowId in request data" });
    }

    let imageBuffer: Buffer | null = null;
    let usedRealScreenshot = false;
    let fetchErrorMsg = "";

    // 1. ATTEMPT REAL LIVESTREAM SCREENSHOT FROM URL
    if (url && url !== "https://" && url.startsWith("http")) {
      console.log(`[Real Screenshot Capture] Attempting to fetch real live screenshot for URL: ${url}`);

      // 1A. Primary: REAL BROWSER via Playwright (lebih sesuai "website terbuka sempurna")
      try {
        for (let attempt = 0; attempt <= PLAYWRIGHT_MAX_RETRIES; attempt++) {
          try {
            console.log(`[Playwright Capture] attempt ${attempt + 1}/${PLAYWRIGHT_MAX_RETRIES + 1} for: ${url}`);
            const buf = await captureRealScreenshotWithPlaywright(url);
            imageBuffer = buf;
            usedRealScreenshot = true;
            console.log(`[Playwright Capture] SUCCESS real browser capture for: ${url} (${buf.length} bytes)`);
            break;
          } catch (e: any) {
            const msg = e?.message || String(e);
            fetchErrorMsg = `Playwright: ${msg}`;
            console.warn(`[Playwright Capture] Attempt failed:`, msg);
            if (attempt < PLAYWRIGHT_MAX_RETRIES) {
              await new Promise(r => setTimeout(r, PLAYWRIGHT_COOLDOWN_MS));
              continue;
            }
            throw e;
          }
        }
      } catch (err: any) {
        // fetchErrorMsg sudah diisi di loop per-attempt
        console.warn(`[Playwright Capture] FAILED:`, fetchErrorMsg || err?.message || err);
      }
      
      // 1B. Secondary: Microlink (jika Playwright gagal)
      if (!usedRealScreenshot) {
        try {
          for (let attempt = 0; attempt <= MICROLINK_MAX_RETRIES; attempt++) {
            const waitFor = MICROLINK_WAIT_FOR_MS + attempt * 3000; // naikkan waitFor di tiap retry
            const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url&meta=false&waitFor=${waitFor}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // max 20s/attempt

            console.log(`[Real Screenshot Capture] Microlink attempt ${attempt + 1}/${MICROLINK_MAX_RETRIES + 1} (waitFor=${waitFor}ms)`);
            const response = await fetch(microlinkUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
              const contentType = response.headers.get("content-type") || "";
              if (contentType.includes("image")) {
                const arrayBuffer = await response.arrayBuffer();
                const buf = Buffer.from(arrayBuffer);

                // Heuristik: jika terlalu kecil seringnya placeholder/blank
                if (buf.length >= MIN_REAL_SCREENSHOT_BYTES) {
                  imageBuffer = buf;
                  usedRealScreenshot = true;
                  console.log(`[Real Screenshot Capture] SUCCESS real capture via Microlink for: ${url} (${buf.length} bytes)`);
                  break;
                } else {
                  fetchErrorMsg = `Gambar terlalu kecil/placeholder (${buf.length} bytes)`;
                  console.warn(`[Real Screenshot Capture] Microlink returned small image: ${buf.length} bytes`);
                }
              } else {
                fetchErrorMsg = "Format respon bukan berkas gambar";
                console.warn(`[Real Screenshot Capture] Microlink response does not contain image. Status: ${response.status}`);
              }
            } else {
              fetchErrorMsg = `HTTP status ${response.status}`;
              console.warn(`[Real Screenshot Capture] Microlink status error: ${response.status}`);
            }

            if (!usedRealScreenshot && attempt < MICROLINK_MAX_RETRIES) {
              await new Promise(r => setTimeout(r, MICROLINK_RETRY_DELAY_MS));
            }
          }
        } catch (err: any) {
          console.warn(`[Real Screenshot Capture] Microlink failed:`, err.message || err);
          fetchErrorMsg = fetchErrorMsg ? `${fetchErrorMsg} | Microlink: ${err.message || String(err)}` : (err.message || String(err));
        }
      }

      // Try Thum.io as a powerful fallback for screenshots if Microlink failed or hit limitation
      if (!usedRealScreenshot) {
        console.log(`[Real Screenshot Capture] Trying alternative fallback Thum.io for: ${url}`);
        try {
          const thumioUrl = `https://image.thum.io/get/width/1280/crop/800/maxAge/1/${url}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds max wait
          
          const response = await fetch(thumioUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buf = Buffer.from(arrayBuffer);
            if (buf.length >= MIN_REAL_SCREENSHOT_BYTES) {
              imageBuffer = buf;
              usedRealScreenshot = true;
              console.log(`[Real Screenshot Capture] SUCCESS real capture via Thum.io for: ${url} (${buf.length} bytes)`);
            } else {
              fetchErrorMsg = `${fetchErrorMsg} | Thum.io: gambar terlalu kecil/placeholder (${buf.length} bytes)`;
              console.warn(`[Real Screenshot Capture] Thum.io returned small image: ${buf.length} bytes`);
            }
          } else {
            console.warn(`[Real Screenshot Capture] Thum.io responded with status error: ${response.status}`);
            fetchErrorMsg = `${fetchErrorMsg} | Thum.io HTTP ${response.status}`;
          }
        } catch (err: any) {
          console.warn(`[Real Screenshot Capture] Thum.io failed:`, err.message || err);
          fetchErrorMsg = `${fetchErrorMsg} | Thum.io: ${err.message || String(err)}`;
        }
      }
    }

    // 2. FALLBACK TO GENERATED GRAPHICAL SIMULATOR IF REAL CAPTURE TIMED OUT OR WAS BLOCKED
    if (!usedRealScreenshot) {
      console.log(`[Real Screenshot Capture] Falling back to pre-drawn browser canvas wrapper due to: ${fetchErrorMsg || "URL tidak valid"}`);
      if (!imageBase64) {
        return res.status(400).json({ error: `Gagal mengambil screenshot riil: ${fetchErrorMsg || "URL kosong"}` });
      }

      const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ error: "Format gambar simulator fallback tidak valid" });
      }
      imageBuffer = Buffer.from(matches[2], "base64");
    }

    if (!imageBuffer) {
      return res.status(500).json({ error: "Internal processing error: Gagal membuat buffer berkas gambar." });
    }

    const timestamp = Date.now();
    const filename = `screenshot_${rowId}_${timestamp}.png`;

    let imageUrl: string;
    try {
      const saved = await persistScreenshotFile(filename, imageBuffer);
      imageUrl = saved.imageUrl;
    } catch (writeErr: any) {
      console.error("[Screenshot Save] Gagal menulis berkas:", writeErr);
      return res.status(500).json({
        error: IS_VERCEL
          ? `Gagal menyimpan screenshot di Vercel: ${writeErr?.message || "filesystem error"}. Aktifkan Vercel Blob Storage untuk penyimpanan permanen.`
          : writeErr?.message || "Gagal menulis berkas screenshot ke disk",
      });
    }

    const host = req.get("host") || "localhost:3000";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const origin = `${protocol}://${host}`;
    const absoluteImageUrl = imageUrl.startsWith("http")
      ? imageUrl
      : `${origin}${imageUrl}`;

    const db = loadDatabase();

    // Create screenshot record with new isRealScreenshot indicator
    const newScreenshot: ScreenshotFile = {
      id: `sc_${timestamp}`,
      rowId,
      category: category || "Unknown",
      url: url || "",
      timestamp: new Date().toISOString(),
      imageUrl,
      filename,
      usernameUsed: usernameUsed || undefined,
      isRealScreenshot: usedRealScreenshot
    };

    db.screenshots.push(newScreenshot);

    // Update state in matching row
    const index = db.spreadsheet.findIndex(row => row.id === rowId);
    if (index !== -1) {
      db.spreadsheet[index].lastScreenshotTime = newScreenshot.timestamp;
      db.spreadsheet[index].lastScreenshotUrl = absoluteImageUrl; // store fully-qualified clickable absolute URL
      db.spreadsheet[index].status = "success";
    }

    saveDatabase(db);

    res.json({
      success: true,
      screenshot: newScreenshot,
      rowUpdated: index !== -1 ? db.spreadsheet[index] : null,
      isRealScreenshot: usedRealScreenshot
    });
  } catch (error: any) {
    console.error("Screenshot saving error:", error);
    res.status(500).json({ error: error.message });
  }
});

function refreshRowAfterScreenshotChanges(db: { spreadsheet: SpreadsheetRow[]; screenshots: ScreenshotFile[] }, rowId: string) {
  const remainingForId = (db.screenshots || []).filter(sc => sc.rowId === rowId);
  const rowIdx = db.spreadsheet.findIndex(row => row.id === rowId);
  if (rowIdx === -1) return;

  if (remainingForId.length > 0) {
    // Pastikan ambil yang terbaru (timestamp ISO, tapi kita pakai urutan array + sort sebagai aman)
    const newest = remainingForId
      .slice()
      .sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""))[remainingForId.length - 1];
    db.spreadsheet[rowIdx].lastScreenshotTime = newest.timestamp;
    // NOTE: field ini di proyek sudah campur absolute/relative. Kita pertahankan perilaku lama
    // agar tidak merusak data lama; UI memakai registry screenshots untuk preview.
    db.spreadsheet[rowIdx].lastScreenshotUrl = newest.imageUrl;
    db.spreadsheet[rowIdx].status = "success";
  } else {
    db.spreadsheet[rowIdx].lastScreenshotTime = null;
    db.spreadsheet[rowIdx].lastScreenshotUrl = null;
    db.spreadsheet[rowIdx].status = "idle";
  }
}

// Bulk delete screenshots by dateKey (YYYY-MM-DD)
app.post("/api/screenshots/bulk-delete", (req, res) => {
  try {
    const { dateKey } = req.body || {};
    if (!dateKey || typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({ error: "dateKey tidak valid. Contoh: 2026-06-22" });
    }

    const db = loadDatabase();
    const toDelete = (db.screenshots || []).filter(sc => (sc.timestamp || "").startsWith(dateKey));
    if (toDelete.length === 0) {
      return res.json({ success: true, deletedCount: 0, dateKey });
    }

    // Hapus file fisik
    for (const item of toDelete) {
      const filepath = path.join(SCREENSHOTS_DIR, item.filename);
      if (filepath && fs.existsSync(filepath)) {
        try {
          fs.unlinkSync(filepath);
        } catch (e) {
          // lanjut hapus yang lain
        }
      }
    }

    // Remove from array
    db.screenshots = (db.screenshots || []).filter(sc => !(sc.timestamp || "").startsWith(dateKey));

    // Refresh row states for affected rows
    const affectedRowIds = Array.from(new Set(toDelete.map(x => x.rowId).filter(Boolean)));
    for (const rowId of affectedRowIds) {
      refreshRowAfterScreenshotChanges(db, rowId);
    }

    saveDatabase(db);
    res.json({ success: true, deletedCount: toDelete.length, dateKey });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete specific screenshot
app.delete("/api/screenshots/:id", (req, res) => {
  try {
    const id = req.params.id;
    const db = loadDatabase();
    const itemIndex = db.screenshots.findIndex(sc => sc.id === id);

    if (itemIndex === -1) {
      return res.status(404).json({ error: "Screenshot file not found" });
    }

    const item = db.screenshots[itemIndex];
    const filepath = path.join(SCREENSHOTS_DIR, item.filename);

    // Delete physically from disk if exists
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Remove from array
    db.screenshots.splice(itemIndex, 1);

    // Update row state if it was the last screenshot for that row
    refreshRowAfterScreenshotChanges(db, item.rowId);

    saveDatabase(db);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -----------------------------------------------------------------------------
// VITE OR STATIC SERVING MIDDLEWARE
// -----------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite Dev Mode setup
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Static Asset serves
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Dashboard Backend] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Dashboard Backend] Data directory: ${DATA_DIR}`);
  });
}

export { app };

// Di Vercel, server dijalankan lewat api/index.ts (serverless), bukan listen()
if (!IS_VERCEL) {
  startServer();
}
