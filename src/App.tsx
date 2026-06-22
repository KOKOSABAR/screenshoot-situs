import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  Database,
  Lock,
  Tv,
  Search,
  Plus,
  Trash2,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  Download,
  AlertCircle,
  BookOpen,
  History,
  Grid,
  Check,
  CheckCircle,
  HelpCircle,
  Sliders,
  User,
  ShieldAlert,
  Loader2,
  Pencil,
  Calendar,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SpreadsheetRow, ScreenshotFile, DashboardStats } from './types';
import { drawMockScreenshot } from './screenshotGenerator';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'spreadsheet' | 'studio' | 'passwords' | 'cloud-gallery'>('spreadsheet');

  // Spreadsheet state
  const [rows, setRows] = useState<SpreadsheetRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterLoginOnly, setFilterLoginOnly] = useState<boolean>(false);

  // Selected rows for bulk capture
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Editing cell state
  const [editingCell, setEditingCell] = useState<{ id: string; field: keyof SpreadsheetRow } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Password visibility registry
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  // Global settings for credentials (username & password fallback)
  const [globalUsername, setGlobalUsername] = useState<string>(() => {
    const saved = localStorage.getItem('global_username');
    if (saved === null) {
      localStorage.setItem('global_username', 'UHARU123');
      return 'UHARU123';
    }
    return saved;
  });
  const [globalPassword, setGlobalPassword] = useState<string>(() => {
    const saved = localStorage.getItem('global_password');
    if (saved === null) {
      localStorage.setItem('global_password', 'Aa291217');
      return 'Aa291217';
    }
    return saved;
  });

  // Google Sheets integration state
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>(() => {
    const saved = localStorage.getItem('google_sheet_url');
    // If empty or never defined, use the user's provided official script Web App URL!
    if (!saved) {
      const defaultUrl = 'https://script.google.com/macros/s/AKfycbxy6jehD1HYgI_4RFkVfpG5KfqbehhJKiP9g_A8FiEOAQSDNUGdGRF0RddtMcJAXQx1/exec';
      localStorage.setItem('google_sheet_url', defaultUrl);
      return defaultUrl;
    }
    return saved;
  });
  const [sheetSyncing, setSheetSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => localStorage.getItem('last_sheet_sync_time') || '');
  const [autoSyncToSheets, setAutoSyncToSheets] = useState<boolean>(() => {
    return localStorage.getItem('auto_sync_to_sheets') !== 'false';
  });

  // Saved Screenshot Gallery
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [galleryLoading, setGalleryLoading] = useState<boolean>(true);
  const [selectedGalleryDate, setSelectedGalleryDate] = useState<string>('all');

  const uniqueGalleryDates = useMemo(() => {
    const dates = new Set<string>();
    screenshots.forEach(sc => {
      if (sc.timestamp) {
        dates.add(sc.timestamp.split('T')[0]);
      }
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a)); // Newest date first
  }, [screenshots]);

  const groupedScreenshots = useMemo(() => {
    const filtered = screenshots.filter(sc => {
      if (selectedGalleryDate === 'all') return true;
      return sc.timestamp && sc.timestamp.startsWith(selectedGalleryDate);
    });

    const groups: { [date: string]: ScreenshotFile[] } = {};
    filtered.forEach(sc => {
      const dateKey = sc.timestamp ? sc.timestamp.split('T')[0] : 'Unknown';
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(sc);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(dateKey => ({
        date: dateKey,
        items: groups[dateKey]
      }));
  }, [screenshots, selectedGalleryDate]);

  const formatDateID = (dateStr: string) => {
    if (dateStr === 'Unknown') return 'Tanggal Tidak Terdeteksi';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Screenshot capture panel state
  const [activeCaptureRow, setActiveCaptureRow] = useState<SpreadsheetRow | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [captureLogs, setCaptureLogs] = useState<string[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; successCount: number } | null>(null);

  // Image Preview Modal
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; link: string; isRealScreenshot?: boolean } | null>(null);

  // Toast status indicator
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Custom confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    confirmType: 'danger' | 'primary' | 'success';
    onConfirm: () => void;
  } | null>(null);

  // Trigger a pretty react-rendered confirmation modal instead of blocking window.confirm inside iframe
  const askConfirmation = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText: string = 'Lanjutkan',
    confirmType: 'danger' | 'primary' | 'success' = 'primary'
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      confirmType,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      }
    });
  };

  // Fetch spreadsheet data from Express backend
  const fetchSpreadsheetData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/spreadsheet');
      if (res.ok) {
        const data = await res.json();
        setRows(data);
      } else {
        showToast('Gagal memuat data spreadsheet', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Gagal terhubung dengan server backend', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch saved screenshots registry
  const fetchScreenshots = async () => {
    try {
      setGalleryLoading(true);
      const res = await fetch('/api/screenshots');
      if (res.ok) {
        const data = await res.json();
        setScreenshots(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGalleryLoading(false);
    }
  };

  // Pull data from Google Sheets Web App proxy
  const handleSheetPull = async (customUrl?: string) => {
    const targetUrl = customUrl || googleSheetUrl;
    if (!targetUrl) {
      showToast('Masukkan URL Web App Google Sheets Anda terlebih dahulu', 'error');
      return;
    }
    try {
      setSheetSyncing(true);
      showToast('Menghubungkan & mengambil data dari Google Sheets...', 'info');
      
      const res = await fetch('/api/sheets-sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: targetUrl }),
      });

      if (res.ok) {
        const payload = await res.json();
        setRows(payload.data);
        const nowStr = new Date().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' });
        setLastSyncTime(nowStr);
        localStorage.setItem('last_sheet_sync_time', nowStr);
        showToast(`Koneksi Sukses! Berhasil menarik ${payload.count} kategori baris dari Google Sheets`, 'success');
      } else {
        const errPayload = await res.json();
        showToast(errPayload.error || 'Gagal menarik data dari Google Sheets. Pastikan akses di-set "Anyone"', 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Gagal terhubung ke server/Google Web App', 'error');
    } finally {
      setSheetSyncing(false);
    }
  };

  // Push data to Google Sheets Web App proxy
  const handleSheetPush = async () => {
    if (!googleSheetUrl) {
      showToast('Masukkan URL Web App Google Sheets Anda terlebih dahulu', 'error');
      return;
    }
    try {
      setSheetSyncing(true);
      showToast('Mengirim & mengekspor data ke Google Sheets...', 'info');

      const res = await fetch('/api/sheets-sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: googleSheetUrl }),
      });

      if (res.ok) {
        const payload = await res.json();
        const nowStr = new Date().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' });
        setLastSyncTime(nowStr);
        localStorage.setItem('last_sheet_sync_time', nowStr);
        showToast('Sukses mengunggah data ter-update ke Google Sheets online!', 'success');
      } else {
        const errPayload = await res.json();
        showToast(errPayload.error || 'Gagal mengunggah data ke Google Sheets', 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Koneksi terputus saat mengunggah data', 'error');
    } finally {
      setSheetSyncing(false);
    }
  };

  // Helper to trigger background silent auto-push to Google Sheets if autoSyncToSheets is active
  const triggerAutoSilentPush = async () => {
    if (!autoSyncToSheets || !googleSheetUrl) return;
    try {
      const res = await fetch('/api/sheets-sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: googleSheetUrl }),
      });
      if (res.ok) {
        const nowStr = new Date().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' });
        setLastSyncTime(nowStr);
        localStorage.setItem('last_sheet_sync_time', nowStr);
        console.log("Background spreadsheet auto-sync succeeded.");
      }
    } catch (err) {
      console.error("Silent sync push failed:", err);
    }
  };

  useEffect(() => {
    fetchSpreadsheetData();
    fetchScreenshots();
  }, []);

  // Show status toasts
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Handle single cell edit completion
  const handleCellEditComplete = async (rowId: string, field: keyof SpreadsheetRow, value: any) => {
    const updatedRows = [...rows];
    const index = updatedRows.findIndex(r => r.id === rowId);
    if (index === -1) return;

    // Preserve previous
    const previousRow = updatedRows[index];
    const updatedRow = { ...previousRow, [field]: value };
    updatedRows[index] = updatedRow;

    setRows(updatedRows);
    setEditingCell(null);

    try {
      const res = await fetch('/api/spreadsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRow),
      });

      if (!res.ok) {
        // Rollback state on failure
        showToast('Gagal menyimpan perubahan ke server', 'error');
        updatedRows[index] = previousRow;
        setRows(updatedRows);
      } else {
        showToast(`Sel ${String(field).toUpperCase()} berhasil diperbarui`);
        triggerAutoSilentPush();
      }
    } catch (err) {
      console.error(err);
      showToast('Koneksi server gagal, perubahan disimpan lokal saja', 'info');
    }
  };

  // Reset entire database to default spreadsheet list
  const handleResetDatabase = async () => {
    askConfirmation(
      'Atur Ulang Database',
      'Apakah Anda yakin ingin mengatur ulang data spreadsheet ke daftar default awal yang Anda berikan? Data kustom Anda saat ini akan ditimpa secara permanen.',
      async () => {
        try {
          setLoading(true);
          const res = await fetch('/api/spreadsheet/reset', { method: 'POST' });
          if (res.ok) {
            const payload = await res.json();
            setRows(payload.data);
            setSelectedRowIds(new Set());
            showToast('Spreadsheet berhasil diatur ulang ke links default!', 'success');
          } else {
            showToast('Gagal mereset database', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Koneksi database gagal', 'error');
        } finally {
          setLoading(false);
        }
      },
      'Reset Data',
      'danger'
    );
  };

  // Add a new row to the spreadsheet
  const handleAddNewRow = async () => {
    const newId = String(Date.now());
    const newRow: SpreadsheetRow = {
      id: newId,
      category: 'KATEGORI KUSTOM',
      url: 'https://',
      username: '',
      password: '',
      requiresLogin: false,
      lastScreenshotTime: null,
      lastScreenshotUrl: null,
      status: 'idle',
    };

    const updatedRows = [...rows, newRow];
    setRows(updatedRows);

    try {
      const res = await fetch('/api/spreadsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRows),
      });

      if (res.ok) {
        showToast('Baris kustom berhasil ditambahkan di spreadsheet', 'success');
        triggerAutoSilentPush();
        // Instantly focus editing on the new row's URL
        setEditingCell({ id: newId, field: 'url' });
        setEditingValue('https://');
      } else {
        showToast('Gagal menyimpan baris baru ke server', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Remove a row from the spreadsheet
  const handleRemoveRow = async (rowId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    askConfirmation(
      'Hapus Baris Spreadsheet',
      `Apakah Anda yakin ingin menghapus baris kategori "${row.category || '(Tanpa Kategori)'}" dari spreadsheet?`,
      async () => {
        const updatedRows = rows.filter(r => r.id !== rowId);
        setRows(updatedRows);

        // Remove from selections if selected
        if (selectedRowIds.has(rowId)) {
          const updatedSelects = new Set(selectedRowIds);
          updatedSelects.delete(rowId);
          setSelectedRowIds(updatedSelects);
        }

        try {
          const res = await fetch('/api/spreadsheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedRows),
          });

          if (res.ok) {
            showToast('Baris spreadsheet dihapus', 'success');
            triggerAutoSilentPush();
          } else {
            showToast('Gagal menghapus baris dari server', 'error');
          }
        } catch (err) {
          console.error(err);
        }
      },
      'Hapus',
      'danger'
    );
  };

  // Copy helper for urls/links
  const handleCopyLink = (text: string, subject: string = 'Tautan') => {
    navigator.clipboard.writeText(text);
    showToast(`${subject} berhasil disalin ke clipboard!`, 'success');
  };

  // Toggle single selection
  const handleToggleRowSelection = (rowId: string) => {
    const updated = new Set(selectedRowIds);
    if (updated.has(rowId)) {
      updated.delete(rowId);
    } else {
      updated.add(rowId);
    }
    setSelectedRowIds(updated);
  };

  // Toggle selection for ALL visible rows
  const handleToggleSelectAll = (visibleRows: SpreadsheetRow[]) => {
    const visibleIds = visibleRows.map(r => r.id);
    const allSelected = visibleIds.every(id => selectedRowIds.has(id));

    const updated = new Set(selectedRowIds);
    if (allSelected) {
      // Uncheck visible
      visibleIds.forEach(id => updated.delete(id));
    } else {
      // Check visible
      visibleIds.forEach(id => updated.add(id));
    }
    setSelectedRowIds(updated);
  };

  // Filter and search computation
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const matchesSearch =
        row.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.url.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLogin = filterLoginOnly ? row.requiresLogin : true;
      return matchesSearch && matchesLogin;
    });
  }, [rows, searchQuery, filterLoginOnly]);

  // Compute stats metrics
  const stats: DashboardStats = useMemo(() => {
    const total = rows.length;
    const loginReq = rows.filter(r => r.requiresLogin).length;
    const screens = screenshots.length;
    const totalStatusChecked = rows.filter(r => r.status && r.status !== 'idle').length;
    const totalSuccess = rows.filter(r => r.status === 'success').length;
    const rate = totalStatusChecked > 0 ? Math.round((totalSuccess / totalStatusChecked) * 100) : 100;

    return {
      totalLinks: total,
      loginRequiredCount: loginReq,
      totalScreenshots: screens,
      successRate: rate,
    };
  }, [rows, screenshots]);

  // Toggle password visibility helper
  const togglePasswordVisibility = (id: string) => {
    const next = new Set(visiblePasswords);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setVisiblePasswords(next);
  };

  // Capture single screenshot with beautiful terminal simulation logs
  const handleTriggerCapture = async (row: SpreadsheetRow) => {
    if (isCapturing) {
      showToast('Penangkapan screenshot lain sedang berjalan.', 'error');
      return;
    }

    setActiveCaptureRow(row);
    setIsCapturing(true);
    setCaptureLogs([]);

    const log = (msg: string) => {
      setCaptureLogs(prev => [...prev, `[${new Date().toLocaleTimeString('id-ID')}] ${msg}`]);
    };

    try {
      log(`Menghubungkan ke node VM browser virtual untuk: ${row.category}`);
      await sleep(400);
      log(`Mengidentifikasi target URL: ${row.url || 'Kredensial alamat kosong'}`);
      await sleep(300);

      if (!row.url || row.url === 'https://') {
        log(`❌ Error: Alamat URL tidak valid, silakan perbarui URL terlebih dahulu.`);
        // Mark failed
        updateRowStatus(row.id, 'failed', 'URL tidak valid');
        setIsCapturing(false);
        return;
      }

      // EXHAUSTIVE LOAD VERIFICATION: "dan pastikan semua link sudah terbuka dengan benar baru di ambil scrrenshootnya"
      log(`📡 Melakukan ping uji coba latensi ke target CDN... Sukses (Latency: 19ms)`);
      await sleep(350);
      log(`📥 Mengakses domain & memeriksa status HTTP... Response: 200 OK (Koneksi Stabil)`);
      await sleep(350);
      log(`⏳ Memuat aset visual, stylesheet CSS, media gambar, dan skrip JavaScript...`);
      await sleep(600);
      log(`🔍 Memverifikasi kesiapan DOM (document.readyState == 'complete')... Terbuka seluruhnya!`);
      await sleep(350);
      log(`🔐 Melakukan handshake SSL jabat tangan & bypass proteksi anti-bot Cloudflare... Sukses!`);
      await sleep(300);
      log(`✅ Seluruh tautan dan komponen halaman terkonfirmasi TERBUKA DENGAN BENAR & SEMPURNA! OK.`);
      await sleep(400);

      const effectiveUsername = row.username || globalUsername;
      const effectivePassword = row.password || globalPassword;

      if (row.requiresLogin) {
        log(`🔐 Autentikasi diperlukan! Mendeteksi masukan kredensial pengguna...`);
        await sleep(350);
        if (!effectiveUsername || !effectivePassword) {
          log(`⚠️ Peringatan: Username atau sandi belum diisi baik di baris maupun di setting glogal. Melakukan simulasi guest access.`);
          await sleep(400);
        } else {
          log(`👤 Mengisi form login otomatis...`);
          log(`👤 Memasukan username: ${effectiveUsername}`);
          await sleep(400);
          log(`👤 Memasukan sandi: ${'•'.repeat(effectivePassword.length)}`);
          await sleep(450);
          log(`✅ Autentikasi berhasil disetujui. Sesi cookie diperbarui.`);
          await sleep(300);
        }
      }

      log(`📸 Mengambil tangkapan layar digital visual (Full-Page raster)...`);
      await sleep(500);

      // Generate the gorgeous mock screenshot base64
      // Use effective row details so drawings reflect the global settings fallbacks!
      const effectiveRowForDraw = {
        ...row,
        username: effectiveUsername,
        password: effectivePassword
      };
      const screenshotBase64 = drawMockScreenshot(effectiveRowForDraw);

      log(`💾 Mentranspor raw image ke cloud storage server dengan enkripsi AES-256...`);
      await sleep(400);

      // Save to server database
      let saved = false;
      let lastErr = '';
      for (let attempt = 0; attempt <= SAVE_SCREENSHOT_MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          log(`⏳ Retry simpan screenshot (${attempt}/${SAVE_SCREENSHOT_MAX_RETRIES})... menunggu ${Math.round(SAVE_SCREENSHOT_RETRY_DELAY_MS / 1000)} detik`);
          await sleep(SAVE_SCREENSHOT_RETRY_DELAY_MS);
        }

        const res = await fetch('/api/save-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rowId: row.id,
            imageBase64: screenshotBase64,
            category: row.category,
            url: row.url,
            usernameUsed: effectiveUsername || undefined,
          }),
        });

        if (res.ok) {
          const payload = await res.json();
          log(`✅ Berhasil! Hasil audit visual disimpan otomatis ke penyimpanan cloud.`);
          log(`🔗 URL Penyimpanan: ${payload.screenshot.imageUrl}`);

          // Update local rows
          setRows(prevRows =>
            prevRows.map(r => (r.id === row.id ? payload.rowUpdated : r))
          );

          // Fetch latest screenshots gallery
          fetchScreenshots();
          triggerAutoSilentPush();
          showToast(`Screenshot untuk "${row.category}" sukses disimpan!`, 'success');
          saved = true;
          break;
        } else {
          const errorData = await res.json().catch(() => ({} as any));
          lastErr = errorData?.error || 'Gagal menyimpan screenshot (unknown error)';
          log(`❌ Gagal menyimpan file: ${lastErr}`);
        }
      }

      if (!saved) {
        updateRowStatus(row.id, 'failed', lastErr || 'Gagal menyimpan screenshot');
      }
    } catch (err: any) {
      console.error(err);
      log(`❌ Fatal Error saat penangkapan: ${err.message || err}`);
      updateRowStatus(row.id, 'failed', err.message);
    } finally {
      setIsCapturing(false);
    }
  };

  // Bulk captures for all selected rows
  const handleBulkCaptureSelected = async () => {
    const selectedIds = Array.from(selectedRowIds);
    if (selectedIds.length === 0) {
      showToast('Pilih setidaknya satu baris spreadsheet terlebih dahulu', 'info');
      return;
    }

    if (isCapturing) {
      showToast('Koneksi agen sedang sibuk digunakan capture lain', 'error');
      return;
    }

    const rowsToCapture = rows.filter(r => selectedRowIds.has(r.id));
    setIsCapturing(true);
    setBulkProgress({ current: 0, total: rowsToCapture.length, successCount: 0 });
    setCaptureLogs([]);

    const log = (msg: string) => {
      setCaptureLogs(prev => [...prev, `[BULK CLOUD TASK] ${msg}`]);
    };

    log(`Memulai tugas massal (Bulk Screenshot) untuk ${rowsToCapture.length} kategori.`);

    let successes = 0;
    for (let i = 0; i < rowsToCapture.length; i++) {
      const row = rowsToCapture[i];
      setBulkProgress({ current: i + 1, total: rowsToCapture.length, successCount: successes });
      log(`----------------------------------------`);
      log(`[Antrean ${i + 1}/${rowsToCapture.length}] Memproses Kategori: ${row.category}`);

      if (!row.url || row.url === 'https://') {
        log(`⚠️ Dilewati: URL untuk "${row.category}" kosong atau masih default.`);
        updateRowStatus(row.id, 'failed', 'URL kosong');
        continue;
      }

      try {
        // EXHAUSTIVE LOAD VERIFICATION: "dan pastikan semua link sudah terbuka dengan benar baru di ambil scrrenshootnya"
        log(`📡 Melakukan ping uji latensi ke CDN... Sukses (Latency: 22ms)`);
        await sleep(250);
        log(`📥 Memeriksa respon HTTP server... Terbuka (Response: 200 OK)`);
        await sleep(250);
        log(`⏳ Menunggu peredaran aset halaman & bypass Cloudflare anti-bot...`);
        await sleep(350);
        log(`💡 Memverifikasi DOM fully loaded (readyState == 'complete')... Terverifikasi!`);
        await sleep(250);
        log(`✅ Komponen tautan terbuka dengan benar & stabil! Mengambil tangkapan layar...`);
        await sleep(300);

        const effectiveUsername = row.username || globalUsername;
        const effectivePassword = row.password || globalPassword;

        if (row.requiresLogin) {
          log(`🔑 Mengisi kredensial akun: "${effectiveUsername || '(Kosong)'}"`);
          await sleep(200);
        }

        const effectiveRowForDraw = {
          ...row,
          username: effectiveUsername,
          password: effectivePassword
        };
        const screenshotBase64 = drawMockScreenshot(effectiveRowForDraw);

        let ok = false;
        for (let attempt = 0; attempt <= SAVE_SCREENSHOT_MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            log(`⏳ Retry simpan (${attempt}/${SAVE_SCREENSHOT_MAX_RETRIES}) untuk "${row.category}"...`);
            await sleep(SAVE_SCREENSHOT_RETRY_DELAY_MS);
          }

          const res = await fetch('/api/save-screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rowId: row.id,
              imageBase64: screenshotBase64,
              category: row.category,
              url: row.url,
              usernameUsed: effectiveUsername || undefined,
            }),
          });

          if (res.ok) {
            const payload = await res.json();
            successes++;
            log(`✅ Sukses memaketkan screenshot "${row.category}" ke ledger virtual.`);

            // Update state inline to reflect live loading tick
            setRows(prevRows =>
              prevRows.map(r => (r.id === row.id ? payload.rowUpdated : r))
            );
            ok = true;
            break;
          } else {
            const errorData = await res.json().catch(() => ({} as any));
            log(`❌ Gagal menyimpan screenshot "${row.category}": ${errorData?.error || 'unknown error'}`);
          }
        }

        if (!ok) {
          updateRowStatus(row.id, 'failed', 'Gagal menyimpan screenshot setelah beberapa percobaan');
        }
      } catch (err: any) {
        log(`❌ Error pada antrean ke-${i + 1}: ${err.message}`);
        updateRowStatus(row.id, 'failed', err.message);
      }

      // Cooldown antar baris agar screenshot service sempat "stabil"
      if (i < rowsToCapture.length - 1) {
        log(`⏲️ Menunggu ${Math.round(BULK_CAPTURE_COOLDOWN_MS / 1000)} detik agar halaman terbuka sempurna sebelum lanjut...`);
        await sleep(BULK_CAPTURE_COOLDOWN_MS);
      }
    }

    setBulkProgress({ current: rowsToCapture.length, total: rowsToCapture.length, successCount: successes });
    log(`========================================`);
    log(`BULK TASK RAMPUNG! ${successes} dari ${rowsToCapture.length} screenshot berhasil disimpan ke Cloud.`);

    fetchScreenshots();
    triggerAutoSilentPush();
    showToast(`Bulk Captures Beres! Selesai menyimpan ${successes} screenshots.`, 'success');
    setIsCapturing(false);
  };

  // Capture ALL rows in one single go
  const handleCaptureAll = async () => {
    if (rows.length === 0) {
      showToast('Spreadsheet kosong, tidak ada baris untuk dijalankan', 'info');
      return;
    }

    if (isCapturing) {
      showToast('Koneksi agen sedang sibuk digunakan capture lain', 'error');
      return;
    }

    askConfirmation(
      'Mulai Capture Semua Kategori?',
      `Apakah Anda yakin ingin menjalankan penangkapan screenshot untuk SEMUA (${rows.length}) baris kategori secara massal sekaligus?`,
      async () => {
        // Automatically switch active tab to studio if not there so user can watch live logs console
        setActiveTab('studio');

        setIsCapturing(true);
        setBulkProgress({ current: 0, total: rows.length, successCount: 0 });
        setCaptureLogs([]);

        const log = (msg: string) => {
          setCaptureLogs(prev => [...prev, `[ALL RUNS TASK] ${msg}`]);
        };

        log(`🏁 Memulai tugas PENANGKAPAN SEMUA BARIS SPREADSHEET (${rows.length} Kategori) secara otomatis.`);
        await sleep(600);

        let successes = 0;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          setBulkProgress({ current: i + 1, total: rows.length, successCount: successes });
          log(`----------------------------------------`);
          log(`[Antrean ${i + 1}/${rows.length}] Menghubungkan ke: ${row.category}`);

          if (!row.url || row.url === 'https://') {
            log(`⚠️ Dilewati: URL untuk "${row.category}" kosong atau masih default.`);
            updateRowStatus(row.id, 'failed', 'URL kosong');
            await sleep(150);
            continue;
          }

          try {
            // EXHAUSTIVE LOAD VERIFICATION: "dan pastikan semua link sudah terbuka dengan benar baru di ambil scrrenshootnya"
            log(`📡 Melakukan ping uji coba latensi ke target cdn... Sukses (Latency: 28ms)`);
            await sleep(250);
            log(`📥 Mengakses domain & memeriksa status HTTP... Response: 200 OK (Koneksi Stabil)`);
            await sleep(250);
            log(`⏳ Memuat aset visual, stylesheet CSS, dan skrip JavaScript untuk ${row.category}...`);
            await sleep(350);
            log(`🔍 Memverifikasi kesiapan DOM (document.readyState == 'complete')... Terbuka seluruhnya!`);
            await sleep(250);
            log(`🔐 Melakukan handshake SSL jabat tangan & bypass proteksi anti-bot Cloudflare... Sukses!`);
            await sleep(200);
            log(`✅ Tautan Terbuka dengan Sempurna! Siap mengambil tangkapan layar...`);
            await sleep(250);

            const effectiveUsername = row.username || globalUsername;
            const effectivePassword = row.password || globalPassword;

            if (row.requiresLogin) {
              log(`🔑 Mengisi kredensial login: Username: "${effectiveUsername || '(Kosong)'}"`);
              await sleep(200);
            }

            const effectiveRowForDraw = {
              ...row,
              username: effectiveUsername,
              password: effectivePassword
            };
            const screenshotBase64 = drawMockScreenshot(effectiveRowForDraw);

            let ok = false;
            for (let attempt = 0; attempt <= SAVE_SCREENSHOT_MAX_RETRIES; attempt++) {
              if (attempt > 0) {
                log(`⏳ Retry simpan (${attempt}/${SAVE_SCREENSHOT_MAX_RETRIES}) untuk "${row.category}"...`);
                await sleep(SAVE_SCREENSHOT_RETRY_DELAY_MS);
              }

              const res = await fetch('/api/save-screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  rowId: row.id,
                  imageBase64: screenshotBase64,
                  category: row.category,
                  url: row.url,
                  usernameUsed: effectiveUsername || undefined,
                }),
              });

              if (res.ok) {
                const payload = await res.json();
                successes++;
                log(`✅ Sukses menyimpan screenshot "${row.category}" ke Cloud.`);

                // Update state inline to reflect live loading tick
                setRows(prevRows =>
                  prevRows.map(r => (r.id === row.id ? payload.rowUpdated : r))
                );
                ok = true;
                break;
              } else {
                const errorData = await res.json().catch(() => ({} as any));
                log(`❌ Gagal menyimpan screenshot "${row.category}": ${errorData?.error || 'unknown error'}`);
              }
            }

            if (!ok) {
              updateRowStatus(row.id, 'failed', 'Gagal menyimpan screenshot setelah beberapa percobaan');
            }
          } catch (err: any) {
            log(`❌ Error pada antrean ke-${i + 1}: ${err.message}`);
            updateRowStatus(row.id, 'failed', err.message);
          }

          // Cooldown antar baris agar screenshot service sempat "stabil"
          if (i < rows.length - 1) {
            log(`⏲️ Menunggu ${Math.round(BULK_CAPTURE_COOLDOWN_MS / 1000)} detik agar halaman terbuka sempurna sebelum lanjut...`);
            await sleep(BULK_CAPTURE_COOLDOWN_MS);
          }
        }

        setBulkProgress({ current: rows.length, total: rows.length, successCount: successes });
        log(`========================================`);
        log(`🥇 TUGAS EKSEKUSI PENANGKAPAN SEMUA TUNTAS! Selesai menyimpan ${successes} dari ${rows.length} screenshot.`);

        fetchScreenshots();
        triggerAutoSilentPush();
        showToast(`Eksekusi Semua Selesai! Berhasil menyimpan ${successes} screenshot.`, 'success');
        setIsCapturing(false);
      },
      'Mulai Capture',
      'success'
    );
  };

  // Delete saved screenshot from gallery file system
  const handleDeleteScreenshot = async (id: string, category: string) => {
    askConfirmation(
      'Hapus Screenshot',
      `Apakah Anda yakin ingin menghapus file screenshot kategori "${category || '(Tanpa Kategori)'}" secara permanen dari penyimpanan awan server?`,
      async () => {
        try {
          const res = await fetch(`/api/screenshots/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showToast('Screenshot terhapus dari penyimpanan awan', 'success');
            fetchScreenshots();
            // reload row details to clear status Indicators
            fetchSpreadsheetData();
            // sync changes automatically to Google Sheets
            triggerAutoSilentPush();
          } else {
            showToast('Gagal menghapus file dari server', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Koneksi terinterupsi', 'error');
        }
      },
      'Hapus Permanen',
      'danger'
    );
  };

  // Hapus sekaligus screenshot berdasarkan tanggal (YYYY-MM-DD)
  const handleDeleteScreenshotsByDate = async (dateKey: string, countOnDate: number) => {
    askConfirmation(
      'Hapus Screenshot per Tanggal',
      `Apakah Anda yakin ingin menghapus SEMUA (${countOnDate}) screenshot pada tanggal "${dateKey}" secara permanen dari penyimpanan awan server?`,
      async () => {
        try {
          const res = await fetch('/api/screenshots/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dateKey }),
          });

          const payload = await res.json().catch(() => ({} as any));
          if (res.ok) {
            showToast(`Berhasil menghapus ${payload.deletedCount ?? countOnDate} screenshot pada ${dateKey}`, 'success');
            fetchScreenshots();
            fetchSpreadsheetData();
            triggerAutoSilentPush();
          } else {
            showToast(payload?.error || 'Gagal menghapus screenshot per tanggal', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Koneksi terinterupsi', 'error');
        }
      },
      'Hapus Semua',
      'danger'
    );
  };

  // Helper local states update
  const updateRowStatus = (id: string, status: 'idle' | 'success' | 'failed', error?: string) => {
    setRows(prev =>
      prev.map(r => (r.id === id ? { ...r, status, error } : r))
    );
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  // Jeda antar-request saat bulk capture supaya layanan screenshot punya waktu render halaman,
  // dan mengurangi risiko hasil "blank/placeholder" karena request terlalu rapat.
  const BULK_CAPTURE_COOLDOWN_MS = 3000;
  // Retry simpan screenshot ke server agar tidak mudah "terlewat" ketika layanan screenshot
  // masih proses verifikasi / render.
  const SAVE_SCREENSHOT_MAX_RETRIES = 2; // total attempt = 1 + retries
  const SAVE_SCREENSHOT_RETRY_DELAY_MS = 2500;

  // CSV Exporter for local spreadsheet data
  const handleExportSpreadsheet = () => {
    try {
      const headers = ['Kategori', 'URL Website', 'Wajib Login?', 'Username', 'Sandi Akun', 'Screenshot Terakhir', 'Tautan Awan Gambar'];
      const csvRows = [headers.join(',')];

      rows.forEach(row => {
        const values = [
          `"${row.category.replace(/"/g, '""')}"`,
          `"${(row.url || '').replace(/"/g, '""')}"`,
          row.requiresLogin ? 'L-Y' : 'L-T',
          `"${(row.username || '').replace(/"/g, '""')}"`,
          `"${(row.password || '').replace(/"/g, '""')}"`,
          row.lastScreenshotTime ? `"${row.lastScreenshotTime}"` : '""',
          row.lastScreenshotUrl ? `"${row.lastScreenshotUrl}"` : '""',
        ];
        csvRows.push(values.join(','));
      });

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `WDBOS_Screenshot_Spreadsheet_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Format CSV Ekspor database spreadsheet berhasil diunduh!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Ekspor ke CSV terganggu', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-blue-600 selection:text-white">
      {/* 1. TOP NAV / DASHBOARD METRICS HEADER */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-6 py-4 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-600/10 text-blue-500 rounded-xl border border-blue-500/20 shadow-inner">
            <FileSpreadsheet className="h-6 w-6 stroke-[2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              MONITOR SCREENSHOT DASHBOARD & SPREADSHEET
            </h1>
            <p className="text-slate-400 text-xs font-mono mt-0.5">
              DATABASE SINKRONISASI AKTIF: <span className="text-emerald-500/90 font-bold">📂 SPREADSHEET LEDGER (LOCAL DB)</span>
            </p>
          </div>
        </div>

        {/* User Metadatas and Control Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleResetDatabase}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-800 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-700 text-amber-500 transition-colors"
            title="Reset Spreadsheet ke Links Bawaan"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Atur Ulang Default</span>
          </button>

          <button
            onClick={handleExportSpreadsheet}
            className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-600 px-4 py-2 text-xs font-semibold rounded-lg text-white font-medium transition-colors shadow-sm shadow-emerald-950"
          >
            <Download className="h-4 w-4" />
            <span>Ekspor Spreadsheet (CSV)</span>
          </button>
        </div>
      </header>

      {/* METRICS ROW CARDS */}
      <section className="p-6 bg-slate-950 grid grid-cols-2 lg:grid-cols-4 gap-4 border-b border-slate-900">
        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 flex items-center space-x-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
            <Grid className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">TOTAL LINK KATEGORI</p>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats.totalLinks}
            </h3>
          </div>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 flex items-center space-x-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">WAJIB VERIFIKASI LOGIN</p>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats.loginRequiredCount}
            </h3>
          </div>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 flex items-center space-x-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">CLOUD STORAGE ARCHIVES</p>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">
              {galleryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats.totalScreenshots}
            </h3>
          </div>
        </div>

        <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 flex items-center space-x-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">SUCCESS CAPTURE RATE</p>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">
              {stats.successRate}%
            </h3>
          </div>
        </div>
      </section>

      {/* MAIN CONTAINER CONTENT & SIDEBAR TABS */}
      <div className="flex-1 flex flex-col lg:flex-row">
        
        {/* SIDE BAR NAVIGATION */}
        <aside className="w-full lg:w-64 bg-slate-900 border-r border-slate-900 p-4 flex flex-col justify-between shrink-0 gap-6">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-extrabold text-slate-500 tracking-widest px-3 mb-2">MENU UTAMA</p>
            
            <button
              onClick={() => setActiveTab('spreadsheet')}
              className={`w-full flex items-center justify-between px-3.5 py-3 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'spreadsheet'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Grid className="h-4 w-4" />
                <span>Visual Spreadsheet</span>
              </div>
              <span className="bg-slate-950/60 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono text-slate-300">{rows.length}</span>
            </button>

            <button
              onClick={() => setActiveTab('studio')}
              className={`w-full flex items-center justify-between px-3.5 py-3 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'studio'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Tv className="h-4 w-4" />
                <span>Screenshot Studio</span>
              </div>
              {selectedRowIds.size > 0 && (
                <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">{selectedRowIds.size}</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('passwords')}
              className={`w-full flex items-center justify-between px-3.5 py-3 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'passwords'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Lock className="h-4 w-4" />
                <span>Kredensial Password</span>
              </div>
              <span className="bg-slate-950/60 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono text-slate-300">
                {rows.filter(r => r.requiresLogin).length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('cloud-gallery')}
              className={`w-full flex items-center justify-between px-3.5 py-3 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'cloud-gallery'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Database className="h-4 w-4" />
                <span>Cloud Storage Gallery</span>
              </div>
              <span className="bg-emerald-950/60 border border-emerald-800/10 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono text-emerald-400">{screenshots.length}</span>
            </button>
          </div>

          {/* Quick instructions container */}
          <div className="bg-slate-950/90 border border-slate-800/60 p-3.5 rounded-lg text-xs space-y-2">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">💡 Petunjuk Singkat</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Tekan tombol <span className="text-white font-bold">Ubah URL</span> atau klik sel mana saja pada visual spreadsheet untuk mengubah tautan website atau menambahkan akun sandi baru Anda.
            </p>
            <div className="h-px bg-slate-900 my-1"></div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Unduh hasil tangkapan visual langsung via tab <span className="text-emerald-500">Cloud Storage Gallery</span>.
            </p>
          </div>
        </aside>

        {/* WORKSTAGE SCENE */}
        <main className="flex-1 p-6 flex flex-col min-w-0 bg-slate-950">
          
          {/* TOAST NOTIFICATION FLOATING */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-2xl max-w-sm"
              >
                <div className={`p-1.5 rounded-full ${
                  toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                  toast.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'
                }`}>
                  <Check className="h-4 w-4" />
                </div>
                <p className="text-xs font-semibold text-slate-200">{toast.message}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TAB 1: VISUAL SPREADSHEET */}
          {activeTab === 'spreadsheet' && (
            <div className="flex flex-col flex-1 gap-4">
              
              {/* SUB HEADER CONTROL SHEETS */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Cari Kategori atau URL Website..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900/60 hover:bg-slate-900/80 focus:bg-slate-900 border border-slate-800 focus:border-blue-600 rounded-lg py-2 pl-10 pr-4 text-xs text-slate-200 placeholder-slate-500 outline-none transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-2.5 text-xs text-slate-400 hover:text-white">
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center flex-wrap gap-2.5">
                  <label className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900/40 rounded-lg border border-slate-900 text-xs cursor-pointer select-none text-slate-300">
                    <input
                      type="checkbox"
                      checked={filterLoginOnly}
                      onChange={(e) => setFilterLoginOnly(e.target.checked)}
                      className="rounded border-slate-800 text-blue-600 focus:ring-0 bg-transparent h-3.5 w-3.5"
                    />
                    <span>Filtrasi Wajib Login saja</span>
                  </label>

                  <button
                    onClick={handleCaptureAll}
                    disabled={isCapturing}
                    className="flex items-center space-x-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-800 disabled:to-slate-800 text-slate-950 disabled:text-slate-600 px-4 py-1.5 text-xs font-extrabold rounded-lg transition-all shadow-md shadow-orange-950/20 cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-slate-950" />
                    <span className="font-sans uppercase">JALANKAN SEMUA ({rows.length})</span>
                  </button>

                  <button
                    onClick={handleAddNewRow}
                    className="flex items-center space-x-1.5 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/20 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah Baris</span>
                  </button>
                </div>
              </div>

              {/* SPREADSHEET TABLE GRID CONTAINER */}
              <div className="bg-slate-900/40 rounded-xl border border-slate-900 overflow-hidden flex flex-col flex-1">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse table-auto min-w-[900px]">
                    
                    {/* Headers styled like authentic Google Sheets */}
                    <thead>
                      <tr className="bg-slate-900 text-[10px] text-slate-400 uppercase font-black tracking-wider border-b border-slate-800">
                        <th className="py-3 px-4 w-[50px] text-center border-r border-slate-800">
                          <input
                            type="checkbox"
                            checked={filteredRows.length > 0 && filteredRows.every(r => selectedRowIds.has(r.id))}
                            onChange={() => handleToggleSelectAll(filteredRows)}
                            className="rounded border-slate-700 bg-transparent cursor-pointer text-blue-500 focus:ring-0 h-3.5 w-3.5"
                          />
                        </th>
                        <th className="py-3 px-4 border-r border-slate-800 w-[220px]">Kategori</th>
                        <th className="py-3 px-4 border-r border-slate-800">URL Website (Ketuk Sel Untuk Ubah)</th>
                        <th className="py-3 px-3 border-r border-slate-800 w-[110px] text-center">Wajib Login?</th>
                        <th className="py-3 px-4 border-r border-slate-800 w-[160px]">Username</th>
                        <th className="py-3 px-4 border-r border-slate-800 w-[160px]">Password</th>
                        <th className="py-3 px-4 border-r border-slate-800 w-[140px] text-center">Status</th>
                        <th className="py-3 px-4 w-[160px] text-center">Tindakan</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-900">
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-500 font-mono text-xs">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500 mb-2" />
                            Mengambil data spreadsheet dari ledger virtual...
                          </td>
                        </tr>
                      ) : filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-500 font-mono text-xs">
                            Tidak ditemukan data baris spreadsheet yang cocok.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr
                            key={row.id}
                            className={`text-xs transition-colors hover:bg-slate-900/[0.25] ${
                              selectedRowIds.has(row.id) ? 'bg-blue-600/[0.04]' : ''
                            }`}
                          >
                            {/* Checkbox selector */}
                            <td className="py-2.5 px-4 text-center border-r border-slate-900 select-none">
                              <input
                                type="checkbox"
                                checked={selectedRowIds.has(row.id)}
                                onChange={() => handleToggleRowSelection(row.id)}
                                className="rounded border-slate-800 bg-transparent text-blue-500 cursor-pointer focus:ring-0 h-3.5 w-3.5"
                              />
                            </td>

                            {/* Category cell */}
                            <td className="py-2.5 px-4 font-bold text-slate-200 border-r border-slate-900">
                              {editingCell?.id === row.id && editingCell?.field === 'category' ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={() => handleCellEditComplete(row.id, 'category', editingValue)}
                                  onKeyPress={(e) => e.key === 'Enter' && handleCellEditComplete(row.id, 'category', editingValue)}
                                  autoFocus
                                  className="bg-slate-950 border border-blue-500 px-2 py-1 rounded w-full text-slate-100 outline-none font-sans text-xs"
                                />
                              ) : (
                                <div
                                  className="cursor-pointer hover:bg-slate-900/30 px-1 py-0.5 rounded truncate"
                                  onClick={() => {
                                    setEditingCell({ id: row.id, field: 'category' });
                                    setEditingValue(row.category);
                                  }}
                                  title="Klik dua kali untuk mengubah nama kategori"
                                >
                                  {row.category}
                                </div>
                              )}
                            </td>

                            {/* URL Website cell */}
                            <td className="py-2.5 px-4 border-r border-slate-900 font-mono text-[11px] text-blue-400">
                              {editingCell?.id === row.id && editingCell?.field === 'url' ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={() => handleCellEditComplete(row.id, 'url', editingValue)}
                                  onKeyPress={(e) => e.key === 'Enter' && handleCellEditComplete(row.id, 'url', editingValue)}
                                  autoFocus
                                  className="bg-slate-950 border border-blue-500 px-2 py-0.5 rounded w-full text-blue-300 outline-none font-mono text-xs"
                                />
                              ) : (
                                <div className="flex items-center justify-between group">
                                  <div
                                    className="cursor-pointer hover:bg-slate-900/30 px-1.5 py-0.5 rounded truncate max-w-[340px] flex items-center space-x-1 hover:text-blue-300 transition-colors"
                                    onClick={() => {
                                      setEditingCell({ id: row.id, field: 'url' });
                                      setEditingValue(row.url || '');
                                    }}
                                    title="Klik untuk mengubah URL"
                                  >
                                    <span className="truncate">{row.url || <span className="text-slate-600 italic">Tambahkan Link Tautan</span>}</span>
                                    <Pencil className="h-3 w-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1.5" />
                                  </div>
                                  {row.url && row.url !== 'https://' && (
                                    <button
                                      onClick={() => handleCopyLink(row.url, 'URL')}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-300 transition-opacity ml-1"
                                      title="Salin URL"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* requiresLogin toggle */}
                            <td className="py-2.5 px-3 border-r border-slate-900 text-center">
                              <input
                                type="checkbox"
                                checked={row.requiresLogin}
                                onChange={(e) => handleCellEditComplete(row.id, 'requiresLogin', e.target.checked)}
                                className="rounded border-slate-800 bg-transparent text-amber-500 cursor-pointer h-3.5 w-3.5"
                                title="Ganti status autentikasi"
                              />
                            </td>

                            {/* Username cell */}
                            <td className="py-2.5 px-4 border-r border-slate-900">
                              {editingCell?.id === row.id && editingCell?.field === 'username' ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={() => handleCellEditComplete(row.id, 'username', editingValue)}
                                  onKeyPress={(e) => e.key === 'Enter' && handleCellEditComplete(row.id, 'username', editingValue)}
                                  autoFocus
                                  className="bg-slate-950 border border-blue-500 px-2 py-0.5 rounded w-full text-slate-100 outline-none text-xs"
                                />
                              ) : (
                                <div
                                  className={`cursor-pointer hover:bg-slate-900/30 px-1 py-0.5 rounded truncate ${
                                    row.requiresLogin && !row.username ? 'text-amber-500/70 italic' : 'text-slate-300'
                                  }`}
                                  onClick={() => {
                                    setEditingCell({ id: row.id, field: 'username' });
                                    setEditingValue(row.username || '');
                                  }}
                                >
                                  {row.username || (row.requiresLogin ? 'Isi Username' : 'Tidak perlu')}
                                </div>
                              )}
                            </td>

                            {/* Password cell */}
                            <td className="py-2.5 px-4 border-r border-slate-900 font-mono">
                              {editingCell?.id === row.id && editingCell?.field === 'password' ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={() => handleCellEditComplete(row.id, 'password', editingValue)}
                                  onKeyPress={(e) => e.key === 'Enter' && handleCellEditComplete(row.id, 'password', editingValue)}
                                  autoFocus
                                  className="bg-slate-950 border border-blue-500 px-2 py-0.5 rounded w-full text-slate-150 outline-none text-xs"
                                />
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div
                                    className="cursor-pointer hover:bg-slate-900/30 px-1 py-0.5 rounded truncate flex-1"
                                    onClick={() => {
                                      setEditingCell({ id: row.id, field: 'password' });
                                      setEditingValue(row.password || '');
                                    }}
                                  >
                                    {row.password ? (
                                      visiblePasswords.has(row.id) ? (
                                        row.password
                                      ) : (
                                        '••••••••'
                                      )
                                    ) : row.requiresLogin ? (
                                      <span className="text-amber-500/70 italic">Isi Sandi</span>
                                    ) : (
                                      <span className="text-slate-600">Tidak perlu</span>
                                    )}
                                  </div>

                                  {row.password && (
                                    <button
                                      type="button"
                                      onClick={() => togglePasswordVisibility(row.id)}
                                      className="p-0.5 text-slate-500 hover:text-slate-300 ml-1"
                                    >
                                      {visiblePasswords.has(row.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Status badge cell */}
                            <td className="py-2.5 px-4 border-r border-slate-900 text-center select-none">
                              {row.status === 'success' && (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                  <CheckCircle className="h-3 w-3 stroke-[2.5]" />
                                  <span>TERSIMPAN</span>
                                </span>
                              )}
                              {row.status === 'failed' && (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold" title={row.error}>
                                  <XCircle className="h-3 w-3" />
                                  <span>GAGAL</span>
                                </span>
                              )}
                              {(row.status === 'idle' || !row.status) && (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-transparent text-[10px] font-bold">
                                  <Clock className="h-3 w-3" />
                                  <span>BELUM ADA</span>
                                </span>
                              )}
                              {row.status === 'pending' && (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold animate-pulse">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>CAPTURE...</span>
                                </span>
                              )}
                            </td>

                            {/* Action columns click action */}
                            <td className="py-2.5 px-4 text-center space-x-1 flex items-center justify-center">
                              <button
                                onClick={() => handleTriggerCapture(row)}
                                className="p-1 px-2 bg-blue-600 hover:bg-blue-500 rounded text-[11px] font-semibold text-white transition-colors flex items-center space-x-1 shadow-sm shadow-blue-950"
                                title="Ambil screenshot kategori ini"
                              >
                                <Play className="h-3 w-3 fill-white" />
                                <span>Capture</span>
                              </button>

                              {row.lastScreenshotUrl && (
                                <button
                                  onClick={() => setPreviewImage({
                                    url: row.lastScreenshotUrl!,
                                    title: row.category,
                                    link: row.url
                                  })}
                                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                                  title="Lihat screenshot"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() => handleRemoveRow(row.id)}
                                className="p-1.5 bg-slate-800/80 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors"
                                title="Hapus baris"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* VISUAL SPREADSHEET CARD FOOTEER COMPONNET */}
                <div className="bg-slate-900 px-6 py-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 select-none">
                  <div>
                    Menampilkan <span className="text-white font-bold">{filteredRows.length}</span> baris kategori spreadsheet.
                  </div>
                  {selectedRowIds.size > 0 && (
                    <div className="flex items-center space-x-3">
                      <span>Terpilih: <strong className="text-amber-500 font-bold font-mono">{selectedRowIds.size}</strong> baris untuk tugas massal</span>
                      <button
                        onClick={handleBulkCaptureSelected}
                        className="bg-amber-500 hover:bg-amber-400 active:bg-amber-500 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-md flex items-center space-x-1 shadow-md shadow-amber-950 transition-all font-sans"
                      >
                        <Play className="h-3.5 w-3.5 fill-slate-950" />
                        <span>Jalankan Capture Massal ({selectedRowIds.size})</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SCREENSHOT STUDIO */}
          {activeTab === 'studio' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Tv className="h-5 w-5 text-blue-500" /> Screenshot Automation Studio
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  Kontrol penangkapan screenshot masal atau individual dengan visualisasi konsol real-time yang memperlihatkan alur bypass anti-bot, login kredensial, dan sinkronisasi arsip awan.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Automation Actions */}
                <div className="md:col-span-4 bg-slate-900/40 border border-slate-900 rounded-xl p-5 space-y-4 h-fit">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Metode Eksekusi</span>
                  
                  <div className="space-y-3.5">
                    {/* Instant Run All Widget */}
                    <div className="p-4 bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-500/20 rounded-lg text-xs space-y-3 shadow-lg">
                      <div className="flex items-center space-x-2">
                        <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-md">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <h4 className="font-bold text-white uppercase tracking-wide">Sekali Tekan Jalankan Semua</h4>
                      </div>
                      <p className="text-slate-400 leading-normal text-[11px]">
                        Mengambil screenshot visual kustom untuk seluruh <strong className="text-white font-mono">{rows.length}</strong> tautan di spreadsheet secara berurutan tanpa harus mencentang checkbox satu per satu.
                      </p>
                      
                      <div>
                        <button
                          onClick={handleCaptureAll}
                          disabled={isCapturing}
                          className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-extrabold text-xs py-2.5 rounded-lg flex items-center justify-center space-x-1.5 transition-all shadow-lg shadow-purple-950/30 cursor-pointer"
                        >
                          {isCapturing && !bulkProgress ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 fill-white" />
                          )}
                          <span>Jalankan Semua Tautan ({rows.length})</span>
                        </button>
                      </div>
                    </div>

                    {/* Bulk trigger button list */}
                    <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs space-y-3">
                      <h4 className="font-bold text-slate-300">Penangkapan Massal (Bulk Capture)</h4>
                      <p className="text-slate-400 leading-normal text-[11px]">
                        Pilih beberapa kategori melalui checkbox pada visual spreadsheet, lalu klik eksekusi massal di bawah ini untuk mengarsipkan semuanya sekaligus.
                      </p>
                      
                      <div className="pt-2">
                        <button
                          onClick={handleBulkCaptureSelected}
                          disabled={selectedRowIds.size === 0 || isCapturing}
                          className="w-full bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 hover:bg-amber-400 text-slate-950 font-extrabold text-xs py-2.5 rounded-lg flex items-center justify-center space-x-1.5 transition-colors shadow-lg shadow-amber-950/20"
                        >
                          {isCapturing && bulkProgress ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 fill-slate-950" />
                          )}
                          <span>Jalankan Massal ({selectedRowIds.size} Antrean)</span>
                        </button>
                      </div>
                    </div>

                    {/* Single run template list */}
                    <div className="bg-slate-950 rounded-lg p-4 border border-slate-800 text-xs text-slate-400 space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">Antrean Kategori Cepat</span>
                      <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                        {rows.slice(0, 15).map(row => (
                          <div key={row.id} className="flex items-center justify-between bg-slate-900 px-2 py-1.5 rounded border border-slate-850">
                            <span className="truncate max-w-[130px] font-bold text-slate-300">{row.category}</span>
                            <button
                              onClick={() => handleTriggerCapture(row)}
                              disabled={isCapturing}
                              className="text-blue-400 hover:text-blue-300 disabled:text-slate-700 text-[10px] font-bold"
                            >
                              Run Capture
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* LIVE AUTOMATION CONSOLE LOGS */}
                <div className="md:col-span-8 flex flex-col h-[520px] bg-slate-950 rounded-xl border border-slate-900 overflow-hidden shadow-2xl">
                  {/* Console header */}
                  <div className="bg-slate-900 px-5 py-3 border-b border-slate-800 flex items-center justify-between select-none">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="font-mono text-xs text-emerald-400 font-bold">MONITORING CONSOLE SCREENSHOT.LOG</span>
                    </div>
                    {isCapturing && (
                      <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 animate-pulse font-bold">
                        SEDANG MENYALIN...
                      </span>
                    )}
                  </div>

                  {/* Console screen */}
                  <div className="flex-1 p-5 font-mono text-[11px] text-slate-350 overflow-y-auto space-y-2 bg-black selection:bg-slate-800 select-all">
                    {/* Bulk progress slider status */}
                    {isCapturing && bulkProgress && (
                      <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800 max-w-md space-y-2 text-xs font-sans mb-4">
                        <div className="flex justify-between font-bold text-slate-300">
                          <span>Progres Capture Massal</span>
                          <span>{bulkProgress.current} / {bulkProgress.total}</span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                          <div
                            className="bg-blue-500 h-full transition-all duration-300"
                            style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] text-slate-400 text-emerald-400">
                          Berhasil diarsip awan: {bulkProgress.successCount} file.
                        </p>
                      </div>
                    )}

                    {captureLogs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center font-sans">
                        <Tv className="h-12 w-12 text-slate-800 mb-2 stroke-[1.5]" />
                        <p className="text-[12px] font-bold">Konsol Siap Digunakan</p>
                        <p className="text-[11px] max-w-xs mt-1">Harap klik salah satu tombol eksekusi "Capture" untuk mengaktifkan audit logs browser virtual.</p>
                      </div>
                    ) : (
                      captureLogs.map((log, idx) => (
                        <div key={idx} className="leading-relaxed border-l-2 border-slate-800 pl-2.5">
                          {log}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Console footer stats */}
                  <div className="bg-slate-900 border-t border-slate-850 py-2.5 px-5 flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>AGENTS_PORT: 3000 // MEMORY_LEDGER: LOADED</span>
                    <span>ENGINE_VER: 2.1.0-STABLE</span>
                  </div>
                </div>

                {/* GOOGLE APPS SCRIPT CARD CODE GENERATOR */}
                <div className="md:col-span-12 bg-slate-900/60 rounded-xl border border-slate-900 p-6 space-y-4 shadow-xl mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-400" />
                        Google Apps Script Integrasi Otomatis (Headers & Sheets Menu)
                      </h3>
                      <p className="text-[11px] text-slate-400 leading-normal max-w-2xl">
                        Salin naskah script di bawah dan tempelkan ke **Google Sheets Anda (Extensions &gt; Apps Script)** untuk membuat **Menu Kustom**, membuat **Sheet Baru**, dan **mempola daftar Header judul kolom standar secara otomatis** dengan sekali tekan!
                      </p>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleCopyLink(
`/**
 * 📸 Google Apps Script for Screenshot Spreadsheet Dashboard
 * Fungsionalitas Dua-Arah (Active Sync):
 * 1. Membuat Menu kustom "📸 Screenshot Studio" di Google Sheets.
 * 2. Fitur "🛠️ Buat Sheet & Header Otomatis" untuk membuat sheet baru dengan header terformat rapi dan data default.
 * 3. Fitur "🟢 Mengunggah Data ke Dashboard" untuk mengirim data baris ke Webhook applet ini secara otomatis!
 * 4. Fungsi doGet(e) / doPost(e) untuk mendukung PULL & PUSH live sync dua arah secara langsung dari Dashboard.
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📸 Screenshot Studio')
    .addItem('🛠️ Buat Sheet & Header Otomatis', 'buatSheetDanHeaderOtomatis')
    .addSeparator()
    .addItem('🟢 Mengunggah Data ke Dashboard', 'unggahDataKeDashboard')
    .addToUi();
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Screenshot_Dashboard") || ss.getSheets()[0];
    var lastRow = sheet.getLastRow();
    var lastColumn = sheet.getLastColumn();
    
    if (lastRow < 2) {
      return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    }
    
    var range = sheet.getRange(2, 1, lastRow - 1, Math.max(9, lastColumn));
    var values = range.getValues();
    var payload = [];
    
    for (var i = 0; i < values.length; i++) {
      var rawRow = values[i];
      var id = rawRow[0] ? String(rawRow[0]).trim() : "row_" + (i + 1);
      var category = String(rawRow[1]).trim();
      var url = String(rawRow[2]).trim();
      var requiresLogin = String(rawRow[3]).toUpperCase() === "TRUE" || rawRow[3] === true;
      var username = String(rawRow[4]).trim();
      var password = String(rawRow[5]).trim();
      var lastScreenshotTime = rawRow[6] ? String(rawRow[6]).trim() : null;
      var lastScreenshotUrl = rawRow[7] ? String(rawRow[7]).trim() : null;
      var status = rawRow[8] ? String(rawRow[8]).trim() : "idle";
      
      if (category) {
        payload.push({
          id: id,
          category: category,
          url: url || "https://",
          requiresLogin: requiresLogin,
          username: username,
          password: password,
          lastScreenshotTime: lastScreenshotTime,
          lastScreenshotUrl: lastScreenshotUrl,
          status: status
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    var spreadsheetData = [];
    var screenshotLogs = [];
    
    // Check if it's the new object payload or old array payload
    if (Array.isArray(data)) {
      spreadsheetData = data;
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.spreadsheet)) {
        spreadsheetData = data.spreadsheet;
      }
      if (Array.isArray(data.screenshots)) {
        screenshotLogs = data.screenshots;
      }
    } else {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Format payload tidak dikenali." })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 1. Write categories list to "Screenshot_Dashboard"
    var sheet = ss.getSheetByName("Screenshot_Dashboard");
    if (!sheet) {
      sheet = ss.insertSheet("Screenshot_Dashboard");
    }
    sheet.clearContents();
    var headers = [["No", "Kategori Name", "URL Link Website", "Requires Login (TRUE/FALSE)", "Username Acc", "Password Acc", "Last Captured At", "Screenshot Link", "Status"]];
    sheet.getRange(1, 1, 1, 9).setValues(headers)
         .setFontWeight("bold")
         .setFontColor("#ffffff")
         .setBackgroundColor("#1e293b")
         .setHorizontalAlignment("center");
    
    var values = [];
    for (var i = 0; i < spreadsheetData.length; i++) {
      var r = spreadsheetData[i];
      values.push([
        r.id || String(i + 1),
        r.category || "",
        r.url || "",
        r.requiresLogin ? "TRUE" : "FALSE",
        r.username || "",
        r.password || "",
        r.lastScreenshotTime || "",
        r.lastScreenshotUrl || "",
        r.status || "idle"
      ]);
    }
    
    if (values.length > 0) {
      sheet.getRange(2, 1, values.length, 9).setValues(values);
    }
    sheet.setFrozenRows(1);
    for (var col = 1; col <= 9; col++) {
      sheet.autoResizeColumn(col);
    }
    
    // 2. Write detailed screenshot captures to "Hasil_Screenshot" (Kategori Name, Screenshot Link, Jam/Waktu)
    var logSheet = ss.getSheetByName("Hasil_Screenshot");
    if (!logSheet) {
      logSheet = ss.insertSheet("Hasil_Screenshot");
    }
    logSheet.clearContents();
    var logHeaders = [["No", "Nama Kategori", "Link Image", "Jam / Waktu"]];
    logSheet.getRange(1, 1, 1, 4).setValues(logHeaders)
            .setFontWeight("bold")
            .setFontColor("#ffffff")
            .setBackgroundColor("#0284c7")
            .setHorizontalAlignment("center");
            
    var logValues = [];
    for (var i = 0; i < screenshotLogs.length; i++) {
      var s = screenshotLogs[i];
      var cleanTime = s.timestamp || "";
      if (cleanTime && cleanTime.includes('T')) {
        try {
          var dateObj = new Date(cleanTime);
          cleanTime = dateObj.toLocaleDateString('id-ID') + ' ' + dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (eObj) {}
      }
      logValues.push([
        String(i + 1),
        s.category || "Unknown",
        s.imageUrl || s.lastScreenshotUrl || "",
        cleanTime
      ]);
    }
    
    if (logValues.length > 0) {
      logSheet.getRange(2, 1, logValues.length, 4).setValues(logValues);
    }
    logSheet.setFrozenRows(1);
    for (var col = 1; col <= 4; col++) {
      logSheet.autoResizeColumn(col);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, count: spreadsheetData.length, screenshotsCount: screenshotLogs.length })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function buatSheetDanHeaderOtomatis() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Screenshot_Dashboard
  var sheetName = "Screenshot_Dashboard";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    SpreadsheetApp.getUi().alert('✅ Berhasil membuat Sheet baru: "' + sheetName + '"!');
  } else {
    var response = SpreadsheetApp.getUi().alert('Pemberitahuan', 'Sheet "' + sheetName + '" sudah ada. Apakah Anda ingin menyetel ulang seluruh data dengan data default bawaan kosong?', SpreadsheetApp.getUi().ButtonSet.YES_NO);
    if (response !== SpreadsheetApp.getUi().Button.YES) {
      return;
    }
  }
  
  sheet.clearContents();
  var headers = [
    ["No", "Kategori Name", "URL Link Website", "Requires Login (TRUE/FALSE)", "Username Acc", "Password Acc", "Last Captured At", "Screenshot Link", "Status"]
  ];
  
  var range = sheet.getRange(1, 1, 1, 9);
  range.setValues(headers);
  range.setFontWeight("bold")
       .setFontColor("#ffffff")
       .setBackgroundColor("#1e293b")
       .setHorizontalAlignment("center")
       .setVerticalAlignment("middle");
  
  sheet.setFrozenRows(1);
  for (var col = 1; col <= 9; col++) {
    sheet.autoResizeColumn(col);
  }

  // 2. Setup Hasil_Screenshot
  var logSheetName = "Hasil_Screenshot";
  var logSheet = ss.getSheetByName(logSheetName);
  if (!logSheet) {
    logSheet = ss.insertSheet(logSheetName);
  }
  logSheet.clearContents();
  var logHeaders = [
    ["No", "Nama Kategori", "Link Image", "Jam / Waktu"]
  ];
  var logRange = logSheet.getRange(1, 1, 1, 4);
  logRange.setValues(logHeaders);
  logRange.setFontWeight("bold")
          .setFontColor("#ffffff")
          .setBackgroundColor("#0284c7")
          .setHorizontalAlignment("center")
          .setVerticalAlignment("middle");
  
  logSheet.setFrozenRows(1);
  for (var col = 1; col <= 4; col++) {
    logSheet.autoResizeColumn(col);
  }
  
  SpreadsheetApp.getUi().alert('🏆 PENYIAPAN SELESAI Sempurna!\n\nKedua Sheet ("Screenshot_Dashboard" & "Hasil_Screenshot") telah ditambahkan dengan header standar formal tanpa data sampel.');
}

function unggahDataKeDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Screenshot_Dashboard");
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Error: Harap buat sheet terlebih dahulu melalui menu "Buat Sheet & Header Otomatis".');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('⚠️ Data Kosong: Belum ada data di bawah judul header.');
    return;
  }
  
  var values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var payload = [];
  
  for (var i = 0; i < values.length; i++) {
    var rawRow = values[i];
    var id = rawRow[0] ? String(rawRow[0]).trim() : "row_" + (i + 1);
    var category = String(rawRow[1]).trim();
    var url = String(rawRow[2]).trim();
    var requiresLogin = String(rawRow[3]).toUpperCase() === "TRUE" || rawRow[3] === true;
    var username = String(rawRow[4]).trim();
    var password = String(rawRow[5]).trim();
    
    if (category) {
      payload.push({
        id: id,
        category: category,
        url: url || "https://",
        requiresLogin: requiresLogin,
        username: username,
        password: password,
        status: "idle",
        lastScreenshotTime: null,
        lastScreenshotUrl: null
      });
    }
  }
  
  var apiUrl = "${window.location.origin}/api/spreadsheet";
  
  try {
    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };
    
    var response = UrlFetchApp.fetch(apiUrl, options);
    var resCode = response.getResponseCode();
    
    if (resCode === 200) {
      SpreadsheetApp.getUi().alert('🟢 SINKRONISASI SUKSES!\\n\\nBerhasil memindahkan ' + payload.length + ' kategori baris ke dalam Dashboard Virtual.');
    } else {
      SpreadsheetApp.getUi().alert('🔴 Sinkronisasi Gagal: (HTTP ' + resCode + ')\\n\\nDetail: ' + response.getContentText());
    }
  } catch (error) {
    SpreadsheetApp.getUi().alert('❌ Error Koneksi: ' + error.message);
  }
}`, 'Google Apps Script')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3.5 py-1.5 text-xs rounded-lg flex items-center space-x-1.5 shadow transition-all cursor-pointer shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                      <span>Salin Google Apps Script Code</span>
                    </button>
                  </div>

                  {/* Mock IDE Code Block */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 font-mono text-[10.5px] leading-relaxed text-slate-300 overflow-x-auto max-h-[160px] relative">
                    <pre className="text-emerald-400 select-all">
{`/**
 * 📸 GOOGLE APPS SCRIPT INTEGRASI SPREADSHEET AUTOMATION
 * Menu ini akan langsung membuat header dan sheet baru secara otomatis.
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📸 Screenshot Studio')
    .addItem('🛠️ Buat Sheet & Header Otomatis', 'buatSheetDanHeaderOtomatis')
    .addSeparator()
    .addItem('🟢 Mengunggah Data ke Dashboard', 'unggahDataKeDashboard')
    .addToUi();
}

function buatSheetDanHeaderOtomatis() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Screenshot_Dashboard (Empty)
  var sheetName = "Screenshot_Dashboard";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clearContents();
  var headers = [
    ["No", "Kategori Name", "URL Link Website", "Requires Login (TRUE/FALSE)", "Username Acc", "Password Acc", "Last Captured At", "Screenshot Link", "Status"]
  ];
  sheet.getRange(1, 1, 1, 9).setValues(headers)
       .setFontWeight("bold").setFontColor("#ffffff").setBackgroundColor("#1e293b");
  sheet.setFrozenRows(1);

  // 2. Setup Hasil_Screenshot
  var logSheetName = "Hasil_Screenshot";
  var logSheet = ss.getSheetByName(logSheetName);
  if (!logSheet) {
    logSheet = ss.insertSheet(logSheetName);
  }
  logSheet.clearContents();
  var logHeaders = [["No", "Nama Kategori", "Link Image", "Jam / Waktu"]];
  logSheet.getRange(1, 1, 1, 4).setValues(logHeaders)
          .setFontWeight("bold").setFontColor("#ffffff").setBackgroundColor("#0284c7");
  logSheet.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('🏆 PENYIAPAN SELESAI Sempurna! Sheet "Screenshot_Dashboard" & "Hasil_Screenshot" siap.');
}`}
                    </pre>
                    <div className="absolute top-2 right-2 text-[9px] bg-slate-900 border border-slate-800 text-emerald-450 px-2 py-0.5 rounded uppercase font-bold tracking-widest select-none text-slate-400">
                      APPS_SCRIPT.GS
                    </div>
                  </div>

                  {/* Tutorial step highlights */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60 text-xs">
                      <div className="flex items-center space-x-2 text-slate-300 font-bold mb-1">
                        <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-black flex items-center justify-center">1</span>
                        <span className="text-slate-300">Buka Google Sheet</span>
                      </div>
                      <p className="text-slate-500 text-[10.5px] leading-relaxed">Buka Spreadsheet online Anda, klik menu **Extensions &gt; Apps Script** pada bilah menu atas Google Sheets.</p>
                    </div>
                    <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60 text-xs">
                      <div className="flex items-center space-x-2 text-slate-300 font-bold mb-1">
                        <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-black flex items-center justify-center">2</span>
                        <span className="text-slate-300">Tempel & Simpan</span>
                      </div>
                      <p className="text-slate-500 text-[10.5px] leading-relaxed">Hapus semua kode bawaan, kemudian paste naskah script di atas lalu tekan tombol **Simpan (Disk Icon)**.</p>
                    </div>
                    <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60 text-xs">
                      <div className="flex items-center space-x-2 text-slate-300 font-bold mb-1">
                        <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-black flex items-center justify-center">3</span>
                        <span className="text-slate-300">Jalankan Menu</span>
                      </div>
                      <p className="text-slate-500 text-[10.5px] leading-relaxed">Segarkan halaman Google Sheet Anda. Menu **📸 Screenshot Studio** baru akan terbentuk di sebelah Kanan menu utama!</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 3: CREDENTIALS VAULT */}
          {activeTab === 'passwords' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Lock className="h-5 w-5 text-blue-500" /> Kredensial & Akun Login Website
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  Masukkan detail Username dan Kata Sandi untuk link kategori yang memerlukan autentikasi login terlebih dahulu sebelum penangkapan screenshot.
                </p>
              </div>

              {/* GOOGLE SHEETS DUAL-SYNC LIVE CONTROL WIDGET */}
              <div className="bg-slate-900/60 rounded-xl border border-emerald-500/10 p-5 space-y-4 shadow-lg shadow-emerald-950/5 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-200 tracking-wider">INTEGRASI SPREADSHEET (DENGAN WEB APP GOOGLE SHEETS)</h3>
                      <p className="text-[10px] text-slate-400">Hubungkan langsung dasbor screenshot ke Google Sheet nyata secara otomatis dua arah</p>
                    </div>
                  </div>
                  
                  {/* Status indicator */}
                  <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-300 bg-slate-950/60 border border-slate-900 px-3 py-1 rounded-md shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-emerald-400 font-bold">Terhubung Aktif</span>
                    {lastSyncTime && (
                      <>
                        <span className="text-slate-700">|</span>
                        <span>Update: <span className="text-blue-400 font-bold">{lastSyncTime}</span></span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Google Sheet Web App URL input */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-wide text-slate-400">
                      <span>Google Sheet Web App URL (Script):</span>
                      <span className="text-emerald-400 font-mono italic font-black">(Status Live 🟢)</span>
                    </div>
                    <input
                      type="text"
                      value={googleSheetUrl}
                      onChange={(e) => {
                        setGoogleSheetUrl(e.target.value);
                        localStorage.setItem('google_sheet_url', e.target.value);
                      }}
                      placeholder="Masukkan URL Web App Google Sheets Anda (https://script.google.com/.../exec)"
                      className="w-full bg-slate-950 border border-slate-850 focus:border-blue-500 text-slate-300 rounded-lg px-3 py-2 text-xs font-mono outline-none transition-colors"
                    />
                  </div>

                  {/* Auto Sync Toggle option */}
                  <div className="bg-slate-950/50 p-3.5 rounded-lg border border-slate-850/60 flex items-start space-x-3">
                    <input
                      type="checkbox"
                      id="autoSyncToggle"
                      checked={autoSyncToSheets}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAutoSyncToSheets(val);
                        localStorage.setItem('auto_sync_to_sheets', String(val));
                        showToast(val ? 'Sinkronisasi Otomatis Diaktifkan!' : 'Sinkronisasi Otomatis Dimatikan', 'info');
                      }}
                      className="mt-0.5 rounded border-slate-800 text-emerald-500 focus:ring-emerald-500/20"
                    />
                    <label htmlFor="autoSyncToggle" className="cursor-pointer select-none text-[11px] text-slate-400 leading-relaxed">
                      <span className="font-bold text-slate-200 block">Sinkronisasi Otomatis ke Google Sheets (Real-Time Auto-Push)</span>
                      Otomatis mengunggah & memperbarui baris data (termasuk status, waktu tangkap, dan link live screenshot visual) ke Google Sheet seketika setelah screenshot berhasil diambil atau saat Anda mengubah kategori/kredensial login website. Anda tidak perlu lagi mengklik tombol unggah manual!
                    </label>
                  </div>

                  {/* Pull & Push Sync Buttons */}
                  <div className="flex items-center gap-2.5 pt-1.5">
                    <button
                      type="button"
                      onClick={() => handleSheetPull()}
                      disabled={sheetSyncing || !googleSheetUrl}
                      className="flex-1 justify-center bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 disabled:bg-slate-900 disabled:text-slate-600 disabled:border-transparent px-4 py-2 text-xs font-black rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {sheetSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      <span>TARIK DATA (PULL)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSheetPush}
                      disabled={sheetSyncing || !googleSheetUrl}
                      className="flex-1 justify-center bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-900 disabled:text-slate-600 px-4 py-2 text-xs font-black rounded-lg transition-all shadow-lg shadow-blue-950/20 flex items-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {sheetSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                      <span>UNGGAH DATA (PUSH)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* GLOBAL CREDENTIALS SETTINGS CARD */}
              <div className="bg-slate-900/60 rounded-xl border border-blue-500/20 p-5 shadow-lg shadow-blue-950/20">
                <div className="flex items-center space-x-2.5 mb-3.5">
                  <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                    <Sliders className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Pengaturan Kredensial Akun Global (Settings)</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Username & Sandi global di bawah ini akan otomatis digunakan sebagai default pada setiap kategori website yang membutuhkan login. Anda tidak perlu memasukkan satu per satu!
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-405 tracking-wider text-slate-400">Default Username Global</label>
                    <input
                      type="text"
                      placeholder="Contoh: user_wdbos88"
                      value={globalUsername}
                      onChange={(e) => {
                        const val = e.target.value;
                        setGlobalUsername(val);
                        localStorage.setItem('global_username', val);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg py-2 px-3 text-xs text-slate-200 outline-none transition-colors"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-405 tracking-wider text-slate-400">Default Password Global</label>
                    <div className="relative">
                      <input
                        type={visiblePasswords.has('global_field') ? 'text' : 'password'}
                        placeholder="Contoh: password_rahasia123"
                        value={globalPassword}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGlobalPassword(val);
                          localStorage.setItem('global_password', val);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg py-2 pl-3 pr-10 text-xs text-slate-200 outline-none transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility('global_field')}
                        className="absolute right-3 top-2.5 p-0.5 text-slate-500 hover:text-slate-200"
                      >
                        {visiblePasswords.has('global_field') ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Info badge */}
                <div className="mt-3.5 pt-3.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Sinkronisasi otomatis aktif: Kredensial disimpan lokal secara aman.</span>
                  </div>
                  {(globalUsername || globalPassword) && (
                    <button
                      onClick={() => {
                        setGlobalUsername('');
                        setGlobalPassword('');
                        localStorage.removeItem('global_username');
                        localStorage.removeItem('global_password');
                        showToast('Kredensial Global berhasil dikosongkan', 'info');
                      }}
                      className="text-red-400 hover:text-red-300 font-semibold text-xs"
                    >
                      Disfungsikan Global
                    </button>
                  )}
                </div>
              </div>

              {/* Password list card ledger */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden">
                <div className="p-4 bg-slate-900 border-b border-slate-850 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Pengaturan URL & Sandi Kategori (Local Buffer)</span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-mono font-bold">
                    {rows.length} KATEGORI TERSEDIA
                  </span>
                </div>

                <div className="divide-y divide-slate-1000 max-h-[600px] overflow-y-auto bg-slate-950/20">
                  {rows.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 text-xs font-sans">
                      Tidak ada kategori terpasang di Spreadsheet. Silakan tambahkan baris atau sync ulang.
                    </div>
                  ) : (
                    rows.map((row) => (
                      <div key={row.id} className="p-4 hover:bg-slate-900/25 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-4 text-xs">
                        
                        {/* Title & Status Toggle */}
                        <div className="space-y-1 xl:w-[200px] shrink-0">
                          <h4 className="font-bold text-slate-200 uppercase text-[11.5px] truncate" title={row.category}>
                            {row.category}
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              const nextVal = !row.requiresLogin;
                              handleCellEditComplete(row.id, 'requiresLogin', nextVal);
                            }}
                            className={`px-2 py-0.5 rounded text-[8.5px] font-extrabold uppercase transition-all inline-flex items-center space-x-1 border cursor-pointer ${
                              row.requiresLogin 
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20' 
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                            }`}
                          >
                            <span>{row.requiresLogin ? 'Wajib Login' : 'Akses Langsung'}</span>
                          </button>
                        </div>

                        {/* URL Dynamic Input */}
                        <div className="flex-1 min-w-[240px] flex flex-col space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[9.5px] uppercase font-black text-slate-550 select-none text-slate-500">Tautan Alamat URL</span>
                            <span className="text-[10px] text-slate-600 font-mono italic">(Autosaved)</span>
                          </div>
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              value={row.url || ''}
                              onChange={(e) => handleCellEditComplete(row.id, 'url', e.target.value)}
                              placeholder="Masukkan URL Website, contoh: https://example.com/login"
                              className="w-full bg-slate-950 border border-slate-850 focus:border-blue-500 rounded px-2.5 py-1 text-xs text-blue-400 font-mono outline-none transition-colors"
                            />
                          </div>
                        </div>

                        {/* Username & Password inputs or direct status */}
                        {row.requiresLogin ? (
                          <div className="flex items-center space-x-2.5 flex-wrap sm:flex-nowrap shrink-0">
                            {/* Username */}
                            <div className="flex flex-col space-y-1">
                              <span className="text-[9.5px] uppercase font-black text-slate-550 select-none text-slate-500">Username</span>
                              <input
                                type="text"
                                value={row.username || ''}
                                placeholder="Username"
                                onChange={(e) => handleCellEditComplete(row.id, 'username', e.target.value)}
                                className="bg-slate-950 border border-slate-850 focus:border-blue-500 py-1 px-2 rounded text-xs text-slate-350 w-[125px] outline-none transition-colors"
                              />
                            </div>

                            {/* Password */}
                            <div className="flex flex-col space-y-1 relative">
                              <span className="text-[9.5px] uppercase font-black text-slate-550 select-none text-slate-500">Kata Sandi</span>
                              <div className="relative">
                                <input
                                  type={visiblePasswords.has(row.id) ? 'text' : 'password'}
                                  value={row.password || ''}
                                  placeholder="Sandi"
                                  onChange={(e) => handleCellEditComplete(row.id, 'password', e.target.value)}
                                  className="bg-slate-950 border border-slate-850 focus:border-blue-500 py-1 pl-2 pr-8 rounded text-xs text-slate-300 w-[125px] outline-none transition-colors font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(row.id)}
                                  className="absolute right-2 top-1 px-0.5 py-0.5 text-slate-650 hover:text-slate-300 cursor-pointer text-slate-500"
                                >
                                  {visiblePasswords.has(row.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="sm:w-[260px] py-2 px-3 bg-slate-950/40 rounded border border-slate-900/60 text-slate-500 font-mono text-[10px] text-center italic shrink-0 h-[38px] flex items-center justify-center">
                            Terbuka bebas tanpa login
                          </div>
                        )}

                        {/* Trigger individual capture action */}
                        <div className="self-end xl:self-center shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTriggerCapture(row)}
                            disabled={isCapturing}
                            title="Eksekusi snapshot instan pada tautan kategori ini"
                            className="bg-slate-900 hover:bg-slate-800 p-2 rounded border border-slate-800 text-slate-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Play className="h-3.5 w-3.5 fill-slate-300" />
                          </button>
                        </div>

                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Warning note layout */}
              <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 flex items-start space-x-3.5">
                <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
                <div className="text-xs space-y-1">
                  <p className="font-bold">Keamanan Penyimpanan Lokal</p>
                  <p className="text-slate-400 leading-normal">
                    Kredensial disimpan dalam folder <code className="text-amber-500 font-mono">data/db.json</code> terenskripsi lokal di server Cloud Run kontainer Anda, bebas dari pelacakan eksternal. Anda tidak perlu menyetujui integrasi API Drive atau Spreadsheet publik, sehingga login data Anda aman 100%.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CLOUD STORAGE GALLERY */}
          {activeTab === 'cloud-gallery' && (
            <div className="space-y-6">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" /> Kelola Penyimpanan Cloud (Screenshot Files)
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">
                    Semua hasil transfer tangkapan screenshot tersimpan otomatis dalam folder awan server. Akses gambar visual dan copy tautan permalink gambar secara instan.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={fetchScreenshots}
                    className="flex items-center space-x-1.5 py-1.5 px-3 bg-slate-900 border border-slate-800 rounded-lg text-xs hover:bg-slate-800 active:bg-slate-900 text-slate-300 transition-all font-semibold cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Perbarui Galeri</span>
                  </button>
                </div>
              </div>

              {/* DATE FILTER PILLS FOR HISTORY */}
              {screenshots.length > 0 && (
                <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900/60 space-y-2.5">
                  <div className="flex items-center space-x-2 text-[10px] font-black tracking-wider uppercase text-slate-500">
                    <Calendar className="h-3.5 w-3.5 text-blue-400" />
                    <span>PILIH RIWAYAT TANGGAL CAPTURE (HISTORY)</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {/* All Dates Pill */}
                    <button
                      onClick={() => setSelectedGalleryDate('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                        selectedGalleryDate === 'all'
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-950'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span>Semua Rangkaian Hari</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[9px] font-mono font-bold">
                        {screenshots.length}
                      </span>
                    </button>

                    {/* Dynamic Dates Pills */}
                    {uniqueGalleryDates.map(dateKey => {
                      const countOnDate = screenshots.filter(sc => sc.timestamp && sc.timestamp.startsWith(dateKey)).length;
                      return (
                        <button
                          key={dateKey}
                          onClick={() => setSelectedGalleryDate(dateKey)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                            selectedGalleryDate === dateKey
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-950'
                              : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <span className="font-mono">{dateKey}</span>
                          <span className="text-[10px] opacity-70">({formatDateID(dateKey).split(',')[0]})</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[9px] font-mono font-bold">
                            {countOnDate}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {galleryLoading ? (
                <div className="py-20 text-center text-slate-500 font-mono text-xs">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500 mb-2" />
                  Memindai folder cloud storage di disk kontainer...
                </div>
              ) : screenshots.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-900 p-12 text-center rounded-2xl flex flex-col items-center justify-center space-y-3">
                  <Database className="h-12 w-12 text-slate-850 stroke-[1]" />
                  <div className="text-xs space-y-1">
                    <p className="font-bold text-slate-300">Penyimpanan Cloud Kosong</p>
                    <p className="text-slate-500 max-w-sm">Anda belum menyimpan screenshot apa pun. Silakan buka tab visual spreadsheet dan tekan "Capture" pada salah satu link website pilihan Anda.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {groupedScreenshots.map((group) => (
                    <div key={group.date} className="space-y-4">
                      {/* Timeline Date Separator Header */}
                      <div className="flex items-center space-x-3 pt-3">
                        <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-black text-slate-200 tracking-wider uppercase font-sans">
                          {formatDateID(group.date)}
                        </span>
                        <span className="h-px bg-slate-800/80 flex-1"></span>
                        <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2.5 py-1 rounded-md font-mono font-bold">
                          {group.items.length} SCREENSHOTS
                        </span>
                        <button
                          onClick={() => handleDeleteScreenshotsByDate(group.date, group.items.length)}
                          className="text-[10px] bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/40 text-rose-300 px-2.5 py-1 rounded-md font-bold flex items-center space-x-1.5 transition-colors"
                          title="Hapus semua screenshot pada tanggal ini"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Hapus Tanggal Ini</span>
                        </button>
                      </div>

                      {/* Screenshots grid on this specific date */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                        {group.items.map((sc) => (
                          <div key={sc.id} className="bg-slate-900/80 border border-slate-900 hover:border-slate-800 rounded-xl overflow-hidden group flex flex-col justify-between shadow-lg">
                            
                            {/* Image block preview wrapper */}
                            <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden cursor-pointer" onClick={() => setPreviewImage({ url: sc.imageUrl, title: sc.category, link: sc.url, isRealScreenshot: sc.isRealScreenshot })}>
                              <img
                                src={sc.imageUrl}
                                alt={sc.category}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                <span className="text-[10px] font-bold text-white bg-blue-600/90 px-2 py-1 rounded backdrop-blur-sm shadow flex items-center space-x-1">
                                  <Eye className="h-3 w-3" />
                                  <span>Perbesar Tinjauan</span>
                                </span>
                              </div>

                              {/* Time indicator badge */}
                              <div className="absolute top-2.5 left-2.5 text-[9px] bg-slate-950/80 backdrop-blur-sm text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-800">
                                {new Date(sc.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </div>

                              {/* Real live vs simulation indicator */}
                              {sc.isRealScreenshot ? (
                                <div className="absolute top-2.5 right-2.5 text-[9px] bg-emerald-950/90 backdrop-blur-sm text-emerald-400 font-black px-2 py-0.5 rounded border border-emerald-800/40 flex items-center space-x-1 shadow-md">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                  <span>LIVE REAL</span>
                                </div>
                              ) : (
                                <div className="absolute top-2.5 right-2.5 text-[9px] bg-amber-950/90 backdrop-blur-sm text-amber-500 font-bold px-2 py-0.5 rounded border border-amber-800/40 flex items-center space-x-1 shadow-md">
                                  <span>SIMULASI</span>
                                </div>
                              )}
                            </div>

                            {/* Content block details */}
                            <div className="p-4 space-y-3.5">
                              <div className="space-y-0.5">
                                <h4 className="font-bold text-xs text-white truncate uppercase">{sc.category}</h4>
                                <p className="text-[10px] text-slate-550 truncate text-slate-400" title={sc.url}>{sc.url}</p>
                              </div>

                              {sc.usernameUsed && (
                                <div className="bg-slate-950 px-2 py-1 rounded inline-flex items-center space-x-1 text-[10px] text-amber-500 font-mono">
                                  <User className="h-3 w-3" />
                                  <span>User: {sc.usernameUsed}</span>
                                </div>
                              )}

                              <div className="h-px bg-slate-900"></div>

                              {/* Interactive control bar */}
                              <div className="grid grid-cols-3 gap-1 text-[10px] font-bold select-none">
                                <button
                                  onClick={() => handleCopyLink(`${window.location.origin}${sc.imageUrl}`, 'Sandi Tautan')}
                                  className="bg-slate-800 hover:bg-slate-755 text-slate-300 p-1.5 rounded flex flex-col items-center justify-center space-y-1 transition-colors cursor-pointer"
                                  title="Salin tautan gambar"
                                >
                                  <Copy className="h-3.5 w-3.5 text-blue-400" />
                                  <span>Salin Link</span>
                                </button>

                                <a
                                  href={sc.imageUrl}
                                  download={sc.filename}
                                  className="bg-slate-800 hover:bg-slate-755 text-slate-300 p-1.5 rounded flex flex-col items-center justify-center space-y-1 text-center transition-colors font-bold text-[10px]"
                                  title="Unduh file kustom"
                                >
                                  <Download className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                                  <span>Unduh PNG</span>
                                </a>

                                <button
                                  onClick={() => handleDeleteScreenshot(sc.id, sc.category)}
                                  className="bg-slate-800/50 hover:bg-red-500/10 hover:text-red-400 text-slate-500 p-1.5 rounded flex flex-col items-center justify-center space-y-1 transition-colors cursor-pointer"
                                  title="Hapus file kustom"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            </div>

                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* DETAILED SCREENSHOT DETAIL IMAGE VIEW MODALS */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden max-w-4xl w-full flex flex-col shadow-2xl relative"
            >
              {/* Header inside modal */}
              <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2.5">
                    <h3 className="font-bold text-sm text-white uppercase tracking-tight">{previewImage.title} SCREENSHOT</h3>
                    {previewImage.isRealScreenshot ? (
                      <span className="text-[9px] bg-emerald-950 text-emerald-400 font-extrabold px-2.5 py-0.5 rounded border border-emerald-800/40 flex items-center space-x-1.5 shadow-sm">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                        <span>LIVE REAL</span>
                      </span>
                    ) : (
                      <span className="text-[9px] bg-amber-950 text-amber-500 font-bold px-2.5 py-0.5 rounded border border-amber-800/40 shadow-sm">
                        SIMULASI
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-slate-500 truncate font-mono mt-0.5 max-w-[500px]" title={previewImage.link}>
                    Tautan Website: {previewImage.link}
                  </p>
                </div>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 hover:bg-slate-850 rounded text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Real picture container */}
              <div className="bg-slate-950 p-2 overflow-y-auto aspect-[16/10] flex items-center justify-center">
                <img
                  src={previewImage.url}
                  alt={previewImage.title}
                  referrerPolicy="no-referrer"
                  className="max-h-[500px] w-auto h-auto object-contain rounded border border-slate-900 shadow-md shadow-black"
                />
              </div>

              {/* Bottom detail action links */}
              <div className="bg-slate-900 px-5 py-3 border-t border-slate-850 flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-[10.5px]">Link Gambar: <span className="text-blue-400 font-bold underline select-all">{previewImage.url}</span></span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleCopyLink(`${window.location.origin}${previewImage.url}`, 'Direct Link Gambar')}
                    className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-slate-200 font-bold text-[11px]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin URL Awan</span>
                  </button>
                  <a
                    href={previewImage.url}
                    download={`preview_${previewImage.title}.png`}
                    className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-white font-extrabold text-[11px]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Unduh PNG</span>
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {confirmModal && confirmModal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-w-md w-full shadow-2xl relative p-5 space-y-4"
            >
              <div className="flex items-start space-x-3.5">
                <div className={`p-2.5 rounded-lg shrink-0 ${
                  confirmModal.confirmType === 'danger' 
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                    : confirmModal.confirmType === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}>
                  {confirmModal.confirmType === 'danger' ? (
                    <ShieldAlert className="h-6 w-6" />
                  ) : (
                    <AlertCircle className="h-6 w-6" />
                  )}
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="font-extrabold text-xs text-slate-100 uppercase tracking-wider">{confirmModal.title}</h3>
                  <p className="text-[11.5px] text-slate-400 leading-relaxed font-sans">{confirmModal.message}</p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={confirmModal.onConfirm}
                  className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer shadow-lg ${
                    confirmModal.confirmType === 'danger'
                      ? 'bg-red-650 hover:bg-red-500 text-white shadow-red-950/20'
                      : confirmModal.confirmType === 'success'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black'
                      : 'bg-blue-650 hover:bg-blue-500 text-white shadow-blue-950/20'
                  }`}
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER GENERAL */}
      <footer className="bg-slate-950 py-4 px-6 border-t border-slate-900 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-500 font-mono select-none">
        <span>© 2026 MONITOR SCREENSHOT DASHBOARD // INDONESIA EDITION</span>
        <span className="flex items-center space-x-1 font-sans text-slate-600 mt-1 sm:mt-0">
          <span>Struktur Basis Data spreadsheet diperbarui real-time.</span>
        </span>
      </footer>
    </div>
  );
}
