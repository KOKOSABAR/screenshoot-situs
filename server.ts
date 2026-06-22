import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { INITIAL_SPREADSHEET_DATA } from "./src/data";
import { SpreadsheetRow, ScreenshotFile } from "./src/types";
import { chromium } from "playwright";

const app = express();
const PORT = 3000;

// -----------------------------------------------------------------------------
// Screenshot capture tuning
// -----------------------------------------------------------------------------
// Banyak layanan screenshot pihak ketiga akan mengembalikan gambar "placeholder"
// jika halaman belum selesai render. Nilai ini menambah waktu tunggu & retry
// agar peluang dapat screenshot "siap" lebih tinggi.
const MICROLINK_WAIT_FOR_MS = Number(process.env.MICROLINK_WAIT_FOR_MS || 10000); // default 10s
const MICROLINK_MAX_RETRIES = Number(process.env.MICROLINK_MAX_RETRIES || 2); // total attempt = 1 + retries
const MICROLINK_RETRY_DELAY_MS = Number(process.env.MICROLINK_RETRY_DELAY_MS || 2500);
const MIN_REAL_SCREENSHOT_BYTES = Number(process.env.MIN_REAL_SCREENSHOT_BYTES || 12_000); // heuristik sederhana

// Playwright (real browser) capture: ini cara paling mendekati "website terbuka sempurna".
// Tujuannya: hindari screenshot halaman verifikasi Cloudflare/anti-bot seperti contoh user.
const PLAYWRIGHT_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 60_000);
const PLAYWRIGHT_MAX_RETRIES = Number(process.env.PLAYWRIGHT_MAX_RETRIES || 1); // total attempt = 1 + retries
const PLAYWRIGHT_COOLDOWN_MS = Number(process.env.PLAYWRIGHT_COOLDOWN_MS || 4000);
const PLAYWRIGHT_EXTRA_STABLE_WAIT_MS = Number(process.env.PLAYWRIGHT_EXTRA_STABLE_WAIT_MS || 2500);

const BLOCKED_PAGE_PATTERNS: RegExp[] = [
  /performing security verification/i,
  /checking your browser/i,
  /verify you are human/i,
  /attention required/i,
  /cloudflare/i,
  /\bverifying\.\.\.\b/i,
];

async function captureRealScreenshotWithPlaywright(targetUrl: string): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "id-ID",
    });

    // Stealth ringan: sembunyikan webdriver flag (tidak menjamin lolos, tapi membantu)
    await context.addInitScript(() => {
      // @ts-ignore
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PLAYWRIGHT_TIMEOUT_MS);

    // 1) Buka halaman
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    // 2) Tunggu jaringan relatif idle (jika terus streaming, ini bisa timeout dan kita lanjut)
    await page.waitForLoadState("networkidle", { timeout: PLAYWRIGHT_TIMEOUT_MS }).catch(() => {});
    // 3) Tambahan jeda kecil agar layout/render stabil
    await page.waitForTimeout(PLAYWRIGHT_EXTRA_STABLE_WAIT_MS);

    // 4) Deteksi halaman verifikasi (Cloudflare/anti-bot) dan coba menunggu beberapa kali
    for (let round = 0; round < 3; round++) {
      const bodyText = (await page.textContent("body").catch(() => "")) || "";
      const isBlocked = BLOCKED_PAGE_PATTERNS.some((re) => re.test(bodyText));
      if (!isBlocked) break;

      // Tunggu lebih lama, lalu coba reload (kadang challenge selesai setelah beberapa detik)
      const waitMs = 8000 + round * 4000;
      console.log(`[Playwright Capture] Detected verification/blocked page. Waiting ${waitMs}ms then re-check...`);
      await page.waitForTimeout(waitMs);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: PLAYWRIGHT_TIMEOUT_MS }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const finalBodyText = (await page.textContent("body").catch(() => "")) || "";
    if (BLOCKED_PAGE_PATTERNS.some((re) => re.test(finalBodyText))) {
      throw new Error("Halaman masih tertahan verifikasi Cloudflare/anti-bot, tidak aman untuk discreenshot.");
    }

    // 5) Screenshot
    const buf = (await page.screenshot({ fullPage: true, type: "png" })) as Buffer;
    if (!buf || buf.length < MIN_REAL_SCREENSHOT_BYTES) {
      throw new Error(`Screenshot real terlalu kecil/placeholder (${buf?.length || 0} bytes)`);
    }
    return buf;
  } finally {
    await browser.close().catch(() => {});
  }
}

// Middleware to parse incoming bodies with increased size limit for base64 screenshots
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Directories
const DATA_DIR = path.join(process.cwd(), "data");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Create directories if they do not exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Ensure database file exists
function loadDatabase(): { spreadsheet: SpreadsheetRow[]; screenshots: ScreenshotFile[] } {
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
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf-8");
  return defaultDb;
}

function saveDatabase(data: { spreadsheet: SpreadsheetRow[]; screenshots: ScreenshotFile[] }) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// Serve Screenshots Directory statically
app.use("/screenshots", express.static(SCREENSHOTS_DIR));

// -----------------------------------------------------------------------------
// API ENDPOINTS
// -----------------------------------------------------------------------------

// Health Check API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: process.env.NODE_ENV || "development" });
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
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    // Save actual file to server directory
    fs.writeFileSync(filepath, imageBuffer);

    // Dynamic imageUrl
    const imageUrl = `/screenshots/${filename}`;
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const origin = `${protocol}://${host}`;
    const absoluteImageUrl = `${origin}${imageUrl}`;

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
    console.log(`[Dashboard Backend] Persistent directories and database verified.`);
  });
}

startServer();
