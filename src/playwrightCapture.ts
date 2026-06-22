import type { Page } from "playwright";

export type PlaywrightCaptureOptions = {
  timeoutMs: number;
  extraStableWaitMs: number;
  minBytes: number;
};

const BLOCKED_PAGE_PATTERNS: RegExp[] = [
  /performing security verification/i,
  /checking your browser/i,
  /verify you are human/i,
  /attention required/i,
  /cloudflare/i,
  /\bverifying\.\.\.\b/i,
];

async function waitForPromoPopup(page: Page) {
  await page.waitForTimeout(1200);
  const popupHints = [
    '[class*="popup" i]',
    '[class*="modal" i]',
    '[class*="mask" i]',
    '[class*="overlay" i]',
    '[class*="announce" i]',
    '[class*="promo" i]',
    '[role="dialog"]',
    ".layui-layer",
    ".swal2-container",
    ".mask-close",
  ];
  for (const sel of popupHints) {
    try {
      await page.locator(sel).first().waitFor({ state: "visible", timeout: 2500 });
      console.log(`[Playwright Capture] Popup terdeteksi: ${sel}`);
      await page.waitForTimeout(600);
      return;
    } catch {}
  }
}

type CloseTarget = { x: number; y: number; reason: string };

async function findModalCloseTarget(page: Page): Promise<CloseTarget | null> {
  return page.evaluate(() => {
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;

    const isVisible = (el: Element) => {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const rectOf = (el: Element) => (el as HTMLElement).getBoundingClientRect();
    const centerOf = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

    const looksLikeCloseText = (text: string) => /^[x×✕✖]$|^close$|^tutup$/i.test(text.trim());

    const elementLooksLikeCloseButton = (el: Element) => {
      if (!isVisible(el)) return false;
      const r = rectOf(el);
      if (r.width > 80 || r.height > 80) return false;

      const aria = (el as HTMLElement).getAttribute("aria-label") || "";
      const id = (el as HTMLElement).id || "";
      const cls = (el as HTMLElement).className ? String((el as HTMLElement).className) : "";
      const text = ((el as HTMLElement).innerText || "").trim();
      const title = (el as HTMLElement).getAttribute("title") || "";
      const st = window.getComputedStyle(el);
      const isCircle =
        st.borderRadius.includes("50%") ||
        (parseFloat(st.borderRadius) >= Math.min(r.width, r.height) / 2 - 2 && r.width <= 60);

      return (
        /close|tutup|dismiss|cancel|mask-close|popup-close|btn-close|icon-close/i.test(aria + id + cls + title) ||
        looksLikeCloseText(text) ||
        (isCircle && r.width <= 55 && r.top <= vh * 0.35) ||
        (el.tagName === "IMG" && /close|tutup|x\.png|icon.*x/i.test((el as HTMLImageElement).src || ""))
      );
    };

    const overlayCandidates = Array.from(document.querySelectorAll("div,section,aside,article")).filter((el) => {
      if (!isVisible(el)) return false;
      const r = rectOf(el);
      const area = r.width * r.height;
      if (area < vw * vh * 0.18) return false;
      const st = window.getComputedStyle(el);
      const posOk = st.position === "fixed" || st.position === "absolute";
      if (!posOk) return false;
      const z = parseInt(st.zIndex || "0", 10);
      const id = (el as HTMLElement).id || "";
      const cls = (el as HTMLElement).className ? String((el as HTMLElement).className) : "";
      const role = (el as HTMLElement).getAttribute("role") || "";
      const centered = r.left < vw * 0.75 && r.right > vw * 0.25 && r.top < vh * 0.85;
      const looksLikeOverlay =
        z >= 500 ||
        /modal|popup|mask|overlay|backdrop|dialog|lightbox|announce|promo|layer/i.test(id + cls) ||
        /dialog/i.test(role);
      return centered && (looksLikeOverlay || z >= 100);
    });

    overlayCandidates.sort((a, b) => {
      const ra = rectOf(a);
      const rb = rectOf(b);
      const za = parseInt(window.getComputedStyle(a).zIndex || "0", 10);
      const zb = parseInt(window.getComputedStyle(b).zIndex || "0", 10);
      return zb - za || rb.width * rb.height - ra.width * ra.height;
    });

    const modal = overlayCandidates[0] || null;

    const searchRoots: Element[] = modal
      ? [modal, modal.parentElement, modal.parentElement?.parentElement].filter(Boolean) as Element[]
      : [document.body];

    for (const root of searchRoots) {
      const closeEls = Array.from(root.querySelectorAll("button,a,div,span,i,img,svg")).filter(
        elementLooksLikeCloseButton
      );
      closeEls.sort((a, b) => rectOf(a).top - rectOf(b).top);
      if (closeEls.length > 0) {
        const c = centerOf(rectOf(closeEls[0]));
        return { x: c.x, y: c.y, reason: "close-button-in-modal" };
      }
    }

    const topCloseCandidates = Array.from(document.querySelectorAll("button,a,div,span,i,img")).filter((el) => {
      if (!isVisible(el)) return false;
      const r = rectOf(el);
      const inUpperBand = r.top >= 0 && r.top <= vh * 0.28;
      const inHorizontalBand = r.left >= vw * 0.42 && r.right <= vw * 0.82;
      const small = r.width <= 70 && r.height <= 70;
      return inUpperBand && inHorizontalBand && small && elementLooksLikeCloseButton(el);
    });
    if (topCloseCandidates.length > 0) {
      const c = centerOf(rectOf(topCloseCandidates[0]));
      return { x: c.x, y: c.y, reason: "top-center-close" };
    }

    if (modal) {
      const r = rectOf(modal);
      return {
        x: Math.min(r.right - 8, vw - 8),
        y: Math.max(r.top - 12, 12),
        reason: "modal-top-right-fallback",
      };
    }

    return null;
  });
}

async function forceHideBlockingOverlays(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    let did = false;

    const isVisible = (el: Element) => {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const nodes = Array.from(document.querySelectorAll("div,section,aside,article"));
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const r = (el as HTMLElement).getBoundingClientRect();
      const area = r.width * r.height;
      if (area < vw * vh * 0.22) continue;
      const st = window.getComputedStyle(el);
      if (st.position !== "fixed" && st.position !== "absolute") continue;
      const z = parseInt(st.zIndex || "0", 10);
      const id = (el as HTMLElement).id || "";
      const cls = (el as HTMLElement).className ? String((el as HTMLElement).className) : "";
      const role = (el as HTMLElement).getAttribute("role") || "";
      const looksLikeOverlay =
        z >= 500 ||
        /modal|popup|mask|overlay|backdrop|dialog|lightbox|announce|promo|layer/i.test(id + cls) ||
        /dialog/i.test(role) ||
        (st.backgroundColor.includes("rgba") && area >= vw * vh * 0.35);

      if (!looksLikeOverlay) continue;
      (el as HTMLElement).style.setProperty("display", "none", "important");
      (el as HTMLElement).style.setProperty("pointer-events", "none", "important");
      (el as HTMLElement).style.setProperty("visibility", "hidden", "important");
      did = true;
    }

    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
    return did;
  });
}

async function isLargeOverlayStillVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const nodes = Array.from(document.querySelectorAll("div,section,aside"));
    for (const el of nodes) {
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) continue;
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width * r.height < vw * vh * 0.28) continue;
      if (st.position !== "fixed" && st.position !== "absolute") continue;
      const z = parseInt(st.zIndex || "0", 10);
      const cls = (el as HTMLElement).className ? String((el as HTMLElement).className) : "";
      if (z >= 500 || /modal|popup|mask|overlay|dialog|promo|announce/i.test(cls)) return true;
    }
    return false;
  });
}

async function closeObstructivePopups(page: Page) {
  page.removeAllListeners("dialog");
  page.on("dialog", async (dialog) => {
    try {
      console.log(`[Playwright Capture] Dismissing dialog: ${dialog.type()} "${dialog.message()?.slice(0, 80)}"`);
      await dialog.dismiss();
    } catch {}
  });

  await waitForPromoPopup(page);

  const closeSelectors = [
    ".mask-close",
    '[class*="mask-close" i]',
    '[class*="popup-close" i]',
    '[class*="btn-close" i]',
    '[class*="icon-close" i]',
    '[class*="close-btn" i]',
    '[class*="closeBtn" i]',
    'img[alt="close" i]',
    'img[src*="close" i]',
    "div.close",
    "div.close img",
    "span.close",
    "i.close",
    'button[aria-label="Close"]',
    'button[aria-label*="close" i]',
    '[aria-label*="close" i]',
    '[role="dialog"] [class*="close" i]',
    '[role="dialog"] button',
    ".close",
    ".modal-close",
    ".popup-close",
    ".mfp-close",
    ".fancybox-close-small",
    ".swal2-close",
    ".layui-layer-close",
    'button:has-text("Close")',
    'button:has-text("Tutup")',
    'button:has-text("TUTUP")',
    'button:has-text("Nanti")',
    'button:has-text("Lewati")',
    'button:has-text("Skip")',
  ];

  for (let round = 0; round < 5; round++) {
    let clickedAny = false;

    const closeTarget = await findModalCloseTarget(page);
    if (closeTarget) {
      console.log(
        `[Playwright Capture] Klik tutup popup (${closeTarget.reason}) di (${Math.round(closeTarget.x)}, ${Math.round(closeTarget.y)})`
      );
      await page.mouse.click(closeTarget.x, closeTarget.y).catch(() => {});
      clickedAny = true;
      await page.waitForTimeout(800);
    }

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);

    for (const sel of ["text=×", "text=✕", "text=X"]) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click({ timeout: 1200, force: true }).catch(() => {});
        clickedAny = true;
        await page.waitForTimeout(500);
      }
    }

    for (const sel of closeSelectors) {
      const loc = page.locator(sel).first();
      if (!(await loc.isVisible().catch(() => false))) continue;
      await loc.click({ timeout: 1200, force: true }).catch(() => {});
      clickedAny = true;
      await page.waitForTimeout(500);
    }

    const stillBlocked = await isLargeOverlayStillVisible(page);
    if (stillBlocked) {
      console.log("[Playwright Capture] Popup masih terlihat, paksa sembunyikan overlay...");
      const forced = await forceHideBlockingOverlays(page);
      if (forced) clickedAny = true;
      await page.waitForTimeout(500);
    }

    const stillBlockedAfter = await isLargeOverlayStillVisible(page);
    if (!stillBlockedAfter) {
      console.log("[Playwright Capture] Popup berhasil ditutup, lanjut screenshot.");
      break;
    }

    if (clickedAny) {
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(700);
      continue;
    }

    break;
  }
}

export async function captureRealScreenshotWithPlaywright(
  targetUrl: string,
  opts: PlaywrightCaptureOptions
): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "id-ID",
    });

    await context.addInitScript(() => {
      // @ts-ignore
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(opts.timeoutMs);
    page.setDefaultNavigationTimeout(opts.timeoutMs);

    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: opts.timeoutMs }).catch(() => {});
    await page.waitForTimeout(opts.extraStableWaitMs);
    await closeObstructivePopups(page);

    for (let round = 0; round < 3; round++) {
      const bodyText = (await page.textContent("body").catch(() => "")) || "";
      const isBlocked = BLOCKED_PAGE_PATTERNS.some((re) => re.test(bodyText));
      if (!isBlocked) break;

      const waitMs = 8000 + round * 4000;
      console.log(`[Playwright Capture] Detected verification/blocked page. Waiting ${waitMs}ms then re-check...`);
      await page.waitForTimeout(waitMs);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: opts.timeoutMs }).catch(() => {});
      await page.waitForTimeout(1500);
      await closeObstructivePopups(page);
    }

    const finalBodyText = (await page.textContent("body").catch(() => "")) || "";
    if (BLOCKED_PAGE_PATTERNS.some((re) => re.test(finalBodyText))) {
      throw new Error("Halaman masih tertahan verifikasi Cloudflare/anti-bot, tidak aman untuk discreenshot.");
    }

    await closeObstructivePopups(page);
    if (await isLargeOverlayStillVisible(page)) {
      console.warn("[Playwright Capture] Overlay masih ada sebelum screenshot, paksa hide sekali lagi...");
      await forceHideBlockingOverlays(page);
      await page.waitForTimeout(500);
    }

    const buf = (await page.screenshot({ fullPage: true, type: "png" })) as Buffer;
    if (!buf || buf.length < opts.minBytes) {
      throw new Error(`Screenshot real terlalu kecil/placeholder (${buf?.length || 0} bytes)`);
    }
    return buf;
  } finally {
    await browser.close().catch(() => {});
  }
}
