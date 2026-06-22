import { SpreadsheetRow } from './types';

// Helper to draw a modern mock website onto a canvas based on category and credentials
export function drawMockScreenshot(
  row: SpreadsheetRow,
  width: number = 1024,
  height: number = 768
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const catLower = row.category.toLowerCase();
  const dateStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  // Base background (modern dark casino / dashboard look)
  let primaryColor = '#0f172a'; // Slate-900
  let secondaryColor = '#1e293b'; // Slate-800
  let accentColor = '#3b82f6'; // Blue-500
  let themeName = 'General Portal';

  if (catLower.includes('slot')) {
    primaryColor = '#12041c'; // Deep violet
    secondaryColor = '#240a36'; // Rich purple
    accentColor = '#f59e0b'; // Gold
    themeName = 'Slot Gacor Hub';
  } else if (catLower.includes('live game') || catLower.includes('casino') || catLower.includes('baccarat')) {
    primaryColor = '#1c0505'; // Dark crimison
    secondaryColor = '#360c0c'; // Red-900
    accentColor = '#ef4444'; // Red-500
    themeName = 'Live Casino VIP';
  } else if (catLower.includes('deposit') || catLower.includes('qris') || catLower.includes('withdrawal')) {
    primaryColor = '#061a14'; // Emerald dark
    secondaryColor = '#0b2b20'; // Teal dark-800
    accentColor = '#10b981'; // Emerald-500
    themeName = 'Safe Payment Vault';
  } else if (catLower.includes('prediksi') || catLower.includes('bola') || catLower.includes('togel')) {
    primaryColor = '#0b1624'; // Navy-900
    secondaryColor = '#15293d'; // Navy-800
    accentColor = '#6366f1'; // Indigo-500
    themeName = 'Prediksi & Togel Analytics';
  } else if (catLower.includes('youtube') || catLower.includes('facebook') || catLower.includes('telegram') || catLower.includes('whatsapp') || catLower.includes('livechat') || catLower.includes('social') || catLower.includes('hubungi') || catLower.includes('twitter')) {
    primaryColor = '#090d16'; // Very dark
    secondaryColor = '#161e2e'; // Chat background slate
    accentColor = '#06b6d4'; // Cyan-500
    themeName = 'Social & Customer Chat';
  }

  // Draw background gradient
  const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, height);
  grad.addColorStop(0, secondaryColor);
  grad.addColorStop(1, primaryColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 1. Draw Simulated Browser Frame (Mock Chrome Wrapper)
  ctx.fillStyle = '#0b0f19'; // Browser header bar
  ctx.fillRect(0, 0, width, 55);

  // Chrome dots
  ctx.fillStyle = '#ef4444'; // Red dot
  ctx.beginPath(); ctx.arc(20, 27, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eab308'; // Yellow dot
  ctx.beginPath(); ctx.arc(38, 27, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#22c55e'; // Green dot
  ctx.beginPath(); ctx.arc(56, 27, 6, 0, Math.PI * 2); ctx.fill();

  // URL input field
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(85, 12, width - 250, 31);
  ctx.fillStyle = '#64748b';
  ctx.font = '13px monospace';
  ctx.fillText('🔒 https://', 95, 32);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '13px "Courier New", monospace';
  ctx.fillText(row.url || 'wdbos90.com/direct', 170, 32);

  // Connection Indicator Tag
  ctx.fillStyle = '#10b981';
  ctx.fillRect(width - 150, 15, 130, 25);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SECURE SSL (200)', width - 85, 31);
  ctx.textAlign = 'left';

  // 2. Draw Content Grid based on categories
  // Side banner representing categories or status panel
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.fillRect(25, 80, width - 50, height - 105);

  // Top header in mock portal
  ctx.fillStyle = accentColor;
  ctx.fillRect(50, 100, width - 100, 60);

  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(row.category.toUpperCase(), 75, 138);

  ctx.fillStyle = '#f1f5f9';
  ctx.shadowBlur = 0; // reset
  ctx.font = '14px sans-serif';
  ctx.fillText(`Dirender secara otomatis pada: ${dateStr}`, width - 420, 136);

  // Middle Body content simulation
  if (catLower.includes('slot') || catLower.includes('game')) {
    // Render SLOT Interface
    drawSlotGacor(ctx, width, height, accentColor, row);
  } else if (catLower.includes('deposit') || catLower.includes('withdrawal') || catLower.includes('qris')) {
    // Render PAYMENT Interface
    drawPaymentVault(ctx, width, height, accentColor, row);
  } else if (catLower.includes('prediksi') || catLower.includes('bola') || catLower.includes('togel')) {
    // Render ANALYTICS predictions
    drawPredictions(ctx, width, height, accentColor, row);
  } else if (catLower.includes('youtube') || catLower.includes('facebook') || catLower.includes('twitter') || catLower.includes('instagram')) {
    // Render Social Media channel layout
    drawSocialMedia(ctx, width, height, accentColor, row);
  } else if (catLower.includes('livechat') || catLower.includes('whatsapp') || catLower.includes('telegram') || catLower.includes('hubungi')) {
    // Render MESSENGER chat threads
    drawMessengerChat(ctx, width, height, accentColor, row);
  } else {
    // Render standard login portal or status panel
    drawStandardPortal(ctx, width, height, accentColor, row);
  }

  // Common credentials overlay if login required
  if (row.requiresLogin) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(50, height - 120, width - 100, 75);

    // Lock icon indicator
    ctx.fillStyle = '#fbbf24'; // orange yellow
    ctx.fillRect(70, height - 100, 4, 35);
    ctx.beginPath();
    ctx.arc(85, height - 85, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('🔑 SESI LOGIN AKTIF (AUTHENTICATED)', 115, height - 95);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`USERNAME TERDAFTAR: "${row.username || 'faisalsabary99'}"`, 115, height - 73);
    ctx.fillText(`ENCRYPTED KEY: ${row.password ? '•'.repeat(row.password.length) : '(Kredensial Kosong)'}`, 520, height - 73);
  }

  // 3. AUTO-CLOUD SAVED Ribbon Overlay (proved save to spreadsheet)
  ctx.save();
  ctx.translate(width - 120, 130);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#22c55e'; // Bright green
  ctx.fillRect(-150, -15, 300, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLOUD ARCHIVED', 0, 4);
  ctx.restore();

  // Subtle watermarked server metadata
  ctx.fillStyle = '#475569';
  ctx.font = '10px monospace';
  ctx.fillText(`HOST SERVICE: CLOUD-RUN INGRESS  |  DATABASE TYPE: SPREADSHEET LEDGER  |  SSL VERIFIED`, 70, height - 15);

  return canvas.toDataURL('image/png');
}

// -----------------------------------------------------------------------------
// PRIVATE SIMULATION CARD TEMPLATES
// -----------------------------------------------------------------------------

function drawSlotGacor(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, row: SpreadsheetRow) {
  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('🎰 WDBOS ONLINE SLOT & SPIN HUB', 70, 205);

  // Draws dynamic slot cards
  const cardNames = ['Gates of Gatotkaca', 'Mahjong Ways 2', 'Sweet Bonanza Jackpot', 'Starlight Princess'];
  const winRates = ['98.4%', '97.8%', '95.6%', '98.9%'];
  const colors = ['#f59e0b', '#22c55e', '#ec4899', '#3b82f6'];

  for (let i = 0; i < 4; i++) {
    const x = 70 + (i * 225);
    const y = 230;
    const cardW = 210;
    const cardH = 260;

    // Card frame shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(x + 5, y + 5, cardW, cardH);

    // Card frame
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cardW, cardH);

    // Mock slot icon layout
    ctx.fillStyle = colors[i] + '33';
    ctx.fillRect(x + 10, y + 15, cardW - 20, 110);

    // Spin wheels
    ctx.fillStyle = '#ffffff';
    ctx.font = '32px sans-serif';
    ctx.fillText('🍒 💎 👑', x + 35, y + 80);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(cardNames[i], x + 15, y + 150);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText('STATUS: GACOR PARAH', x + 15, y + 175);

    // Winrate tag
    ctx.fillStyle = colors[i];
    ctx.fillRect(x + 15, y + 200, cardW - 30, 35);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`RTP: ${winRates[i]}`, x + 50, y + 223);
  }

  // Big Jackpot Alert Banner
  ctx.fillStyle = '#2e1049';
  ctx.fillRect(70, 510, w - 140, 70);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1;
  ctx.strokeRect(70, 510, w - 140, 70);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('👑 GLOBAL JACKPOT METER: RP 8,421,955,302', w / 2 - 250, 552);
}

function drawPaymentVault(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, row: SpreadsheetRow) {
  // Deposit QRIS, credit, or USDT address mock up
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('💳 BANKING SYSTEM & SCAN QRIS DEPOSIT INSTAN', 70, 205);

  // Left side: Mock QRIS code
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(100, 240, 220, 220);

  // QR blocks
  ctx.fillStyle = '#000000';
  ctx.fillRect(115, 255, 60, 60);
  ctx.fillRect(245, 255, 60, 60);
  ctx.fillRect(115, 385, 60, 60);
  // center decoration
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(190, 330, 40, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('QRIS', 198, 354);

  ctx.fillStyle = '#0f172a';
  ctx.font = '11px monospace';
  ctx.fillText('Scan QRIS untuk Deposit otomatis', 105, 490);

  // Right side: Banking Details list
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(360, 240, 560, 220);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('PILIHAN TRANSFER BANK TERSEDIA (SELALU ONLINE)', 390, 275);

  const banks = ['BCA (Bank Central Asia) - Rek: 8295-XXX-XXX', 'Mandiri - Rek: 1221-00-XXXX-XX', 'E-Wallet (GOPAY, OVO, DANA) - Telp: 0812-XXXX-XXXX'];
  ctx.font = '14px monospace';
  ctx.fillStyle = '#cbd5e1';
  for (let i = 0; i < banks.length; i++) {
    ctx.fillText(`• ${banks[i]}`, 390, 315 + (i * 35));
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('ONLINE', 830, 315 + (i * 35));
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px monospace';
  }

  // Security notes
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(360, 480, 560, 50);
  ctx.fillStyle = '#b45309';
  ctx.font = '13px sans-serif';
  ctx.fillText('⚠️ Harap pastikan nama rekening deposit sudah sesuai sebelum melakukan transaksi.', 375, 510);
}

function drawPredictions(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, row: SpreadsheetRow) {
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('⚽ PREDIKSI SKOR BOLA JITU & DRAW TOGEL ANALYTICS', 70, 205);

  // Predictions soccer table
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(70, 230, 410, 260);

  ctx.fillStyle = accent;
  ctx.fillRect(70, 230, 410, 35);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('PREDIKSI PERTANDINGAN HARI INI', 85, 252);

  const games = [
    { teams: 'ITALIA vs SPANYOL', pick: 'Prediksi: SPANYOL Win (Odds 1.8)', confidence: '92%' },
    { teams: 'JERMAN vs HONGARIA', pick: 'Prediksi: OVER 2.5 (Odds 1.55)', confidence: '88%' },
    { teams: 'PORTUGAL vs TURKI', pick: 'Prediksi: PORTUGAL Win (Odds 1.40)', confidence: '95%' },
  ];

  ctx.font = '12px monospace';
  for (let i = 0; i < games.length; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(games[i].teams, 85, 292 + (i * 65));
    ctx.fillStyle = '#acb9ca';
    ctx.fillText(games[i].pick, 85, 312 + (i * 65));

    // stamp confidence
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(400, 280 + (i * 65), 60, 20);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(`${games[i].confidence} Jitu`, 408, 294 + (i * 65));
    ctx.font = '12px monospace';
  }

  // Togel results table
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(510, 230, 440, 260);

  ctx.fillStyle = '#6366f1';
  ctx.fillRect(510, 230, 440, 35);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('LIVE DRAW TOGEL TERBARU', 525, 252);

  const pasaran = [
    { nama: 'SINGAPORE (SGP)', tanggal: '21 Juni 2026', nomor: '8 4 6 1' },
    { nama: 'HONGKONG (HK)', tanggal: '21 Juni 2026', nomor: '0 9 2 5' },
    { nama: 'SYDNEY (SDY)', tanggal: '21 Juni 2026', nomor: '4 7 1 3' },
  ];

  for (let i = 0; i < pasaran.length; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(pasaran[i].nama, 525, 290 + (i * 65));
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(pasaran[i].tanggal, 525, 307 + (i * 65));

    // Big draw balls
    const balls = pasaran[i].nomor.split(' ');
    for (let j = 0; j < balls.length; j++) {
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(750 + (j * 40), 295 + (i * 65), 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(balls[j], 745 + (j * 40), 300 + (i * 65));
    }
  }

  // Disclaimer analytical board
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(70, 510, w - 140, 55);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.fillText('Info: Data Prediksi di atas disinkronisasi setiap 10 menit menggunakan algoritma analisis pasar berakurasi tinggi.', 90, 542);
}

function drawSocialMedia(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, row: SpreadsheetRow) {
  // Simulated YouTube / Facebook Channel page
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`📢 RESMI SALURAN INFORMASI MEDIA SOSIAL - ${row.category}`, 70, 205);

  // Profile Banner
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(70, 230, w - 140, 100);

  // Profile Avatar circle mock
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(130, 330, 45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '36px sans-serif';
  ctx.fillText(row.category.substring(0, 2).toUpperCase(), 110, 343);

  // Names & subscriber metrics
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`WDBOS Official Channel (${row.category})`, 190, 360);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px monospace';
  ctx.fillText('@WDBOS_OFFICIAL  •  120.400 Pengikut Aktif  •  84 Postingan Tersebar', 190, 385);

  // Horizontal separator line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(70, 415); ctx.lineTo(w - 70, 415); ctx.stroke();

  // Social feed placeholder items
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(70, 430, 380, 140);
  ctx.fillRect(470, 430, 440, 140);

  // Social Item 1 details
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Promo Tebak Skor Juara Euro 2026!', 85, 460);
  ctx.fillStyle = '#a855f7';
  ctx.fillRect(85, 475, 110, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('Dibuat: 2 Jam Lalu', 93, 490);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText('Ikuti dan menangkan hadiah saldo gratis jutaan rupiah.', 85, 520);
  ctx.fillText('Bagikan ke teman Anda sekarang juga!', 85, 540);

  // Social Item 2 details
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Informasi Domain Alternatif WDBOS90 Bebas Blokir', 485, 460);
  ctx.fillStyle = '#d946ef';
  ctx.fillRect(485, 475, 130, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('DOMAIN SINKRONISASI', 493, 490);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px monospace';
  ctx.fillText('Domain aktif: wdbos90.com, randomtechhub.com, dsb', 485, 522);
}

function drawMessengerChat(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, row: SpreadsheetRow) {
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`💬 CHAT INTEGRATED CUSTOMER SUPPORT - ${row.category}`, 70, 205);

  // Left chat lobby list
  ctx.fillStyle = '#111827';
  ctx.fillRect(70, 230, 230, 310);

  ctx.fillStyle = '#1f2937';
  ctx.fillRect(70, 230, 230, 45);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('ROOM CONVERSATIONS', 85, 258);

  const rooms = ['🔴 LIVE SUPPORT JP', '🟢 WhatsApp Agent', '🟡 Telegram Bot 24H'];
  ctx.font = '12px sans-serif';
  for (let i = 0; i < rooms.length; i++) {
    ctx.fillStyle = i === 0 ? '#1e293b' : 'transparent';
    if (i === 0) ctx.fillRect(70, 275 + (i * 45), 230, 45);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(rooms[i], 85, 303 + (i * 45));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath(); ctx.moveTo(70, 320 + (i * 45)); ctx.lineTo(300, 320 + (i * 45)); ctx.stroke();
  }

  // Right message bubbles main pane
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(315, 230, 595, 310);

  // Header support agent
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(315, 230, 595, 45);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('🤵 CUSTOMER SERVICE WDBOS - AGENT #418 (ONLINE)', 335, 258);

  // Bullets conversation simulation
  // Agent bubble
  ctx.fillStyle = '#111827';
  ctx.fillRect(335, 295, 420, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText('Hallo selamat datang di pusat pengaduan dan bantuan WDBOS.', 350, 318);
  ctx.fillText('Ada yang bisa kami bantu hari ini bosku? Silahkan beri masukan Anda.', 350, 338);

  // User bubble response
  ctx.fillStyle = accent;
  ctx.fillRect(470, 375, 420, 60);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Halo bos! Saya ingin menanyakan perihal deposit via QRIS yang', 485, 398);
  ctx.fillText('sedang tertunda, apakah bisa dilakukan pengecekan otomatis?', 485, 418);

  // Chat footer text input
  ctx.fillStyle = '#111827';
  ctx.fillRect(315, 495, 595, 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText('Tulis pesan Anda disini ke customer representatif kami...', 335, 523);
}

function drawStandardPortal(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, row: SpreadsheetRow) {
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('🖥️ PORTAL DIGITAL LAYANAN ANGGOTA UTAMA', 70, 205);

  // Left banner: General specs and welcome text
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(70, 230, 500, 240);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('Selamat Datang di WDBOS!', 100, 275);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px sans-serif';
  ctx.fillText('Nikmati kenyamanan bermain dengan link terpercaya dan aman.', 100, 310);
  ctx.fillText('Kami menyediakan transaksi super cepat, cashback mingguan,', 100, 330);
  ctx.fillText('bantuan layanan pelanggan nonstop 24 jam setiap harinya.', 100, 350);

  ctx.fillStyle = accent;
  ctx.fillRect(100, 385, 170, 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('HUBUNGI AGEN RESMI', 122, 409);

  // Right portal login widgets
  ctx.fillStyle = '#111827';
  ctx.fillRect(590, 230, w - 660, 240);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('MASUK KE AKUN ANDA', 615, 270);

  // Draw two empty inputs representation
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;

  ctx.strokeRect(615, 295, 220, 32);
  ctx.fillStyle = '#475569';
  ctx.font = '12px monospace';
  ctx.fillText('Username / No HP', 625, 315);

  ctx.strokeRect(615, 345, 220, 32);
  ctx.fillText('Password Akun', 625, 365);

  // Login button
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(615, 395, 220, 35);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('SAYA SETUJU & LOGIN', 660, 417);
}
