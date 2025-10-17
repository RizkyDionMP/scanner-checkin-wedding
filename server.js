const path = require('path');
const express = require('express');
const { google } = require('googleapis');
const creds = require('./creds.json');
const cors = require('cors');

const app = express();
const PORT = 3000;

// PENTING: Disable proxy untuk menghindari error "Invalid URL"
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

app.use(cors());
app.use(express.json());

// Serve file statis (HTML, CSS, JS) dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Handle favicon request
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/wedding_checkin.html'));
});

// ID Spreadsheet kamu
const SPREADSHEET_ID = '101ahLyMkMPswlUuQAQqsXMs5XJZHypcyPf0fiKPsL4w';

// Google Sheets API auth
let auth;
let sheets;

// Initialize Google Sheets
async function initGoogleSheets() {
  try {
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const authClient = await auth.getClient();
    sheets = google.sheets({ version: 'v4', auth: authClient });
    
    // Test connection dengan membaca spreadsheet
    const test = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    
    console.log('✓ Google Sheets API berhasil terhubung');
    console.log(`  Spreadsheet: "${test.data.properties.title}"`);
    return true;
  } catch (error) {
    console.error('✗ Error inisialisasi Google Sheets:');
    console.error('  Message:', error.message);
    if (error.code) console.error('  Code:', error.code);
    return false;
  }
}

// Check-in endpoint
app.post('/api/checkin', async (req, res) => {
  const { qrValue } = req.body;

  console.log(`\n[CHECK-IN REQUEST] QR Value: ${qrValue}`);

  // Validasi input
  if (!qrValue || qrValue.trim() === '') {
    return res.json({ success: false, message: 'QR code tidak valid' });
  }

  try {
    // Cek koneksi sheets
    if (!sheets) {
      const initialized = await initGoogleSheets();
      if (!initialized) {
        return res.status(500).json({ 
          success: false, 
          message: 'Gagal terhubung ke Google Sheets' 
        });
      }
    }

    // Baca data dari spreadsheet
    console.log('  → Membaca data dari spreadsheet...');
    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:E',
    });

    const rows = read.data.values;
    console.log(`  → Data ditemukan: ${rows ? rows.length : 0} baris`);

    // Validasi jika spreadsheet kosong
    if (!rows || rows.length === 0) {
      return res.json({ success: false, message: 'Data spreadsheet kosong' });
    }

    // Cari row berdasarkan QR code (kolom A)
    const qrValueTrimmed = qrValue.trim().toUpperCase();
    const rowIndex = rows.findIndex(row => {
      if (!row || !row[0]) return false;
      return row[0].toString().trim().toUpperCase() === qrValueTrimmed;
    });

    console.log(`  → Pencarian QR "${qrValueTrimmed}": ${rowIndex !== -1 ? 'DITEMUKAN' : 'TIDAK DITEMUKAN'}`);

    if (rowIndex === -1) {
      return res.json({ 
        success: false, 
        message: `QR code "${qrValue}" tidak ditemukan dalam database` 
      });
    }

    const currentRow = rows[rowIndex];
    const qrCode = currentRow[0] || '';
    const nama = currentRow[1] || 'Tanpa Nama';
    const instansi = currentRow[2] || 'Tanpa Instansi';
    const statusLama = currentRow[3] || '';
    const waktuLama = currentRow[4] || '';
    
    const rowNumber = rowIndex + 2;

    console.log(`  → Data tamu: ${nama} (${instansi})`);
    console.log(`  → Status saat ini: ${statusLama || 'Belum Hadir'}`);

    // Cek apakah sudah pernah check-in
    if (statusLama && statusLama.toLowerCase().includes('hadir')) {
      console.log(`  → Tamu sudah check-in sebelumnya pada ${waktuLama}`);
      return res.json({ 
        success: false, 
        message: `${nama} sudah check-in sebelumnya`,
        nama,
        instansi,
        status: statusLama,
        waktuCheckin: waktuLama || 'Tidak tercatat',
        sudahCheckin: true
      });
    }

    const timestamp = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Update status (kolom D) dan waktu (kolom E)
    console.log(`  → Mengupdate row ${rowNumber}...`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Sheet1!D${rowNumber}:E${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Hadir', timestamp]],
      },
    });

    console.log(`  ✓ Check-in berhasil: ${nama} pada ${timestamp}\n`);

    res.json({
      success: true,
      message: 'Check-in berhasil!',
      qrCode,
      nama,
      instansi,
      status: 'Hadir',
      waktuCheckin: timestamp
    });

  } catch (err) {
    console.error('  ✗ ERROR:', err.message);
    
    res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server',
      error: err.message
    });
  }
});

// Get status endpoint
app.get('/api/status/:qrValue', async (req, res) => {
  const { qrValue } = req.params;

  try {
    if (!sheets) {
      const initialized = await initGoogleSheets();
      if (!initialized) {
        return res.status(500).json({ 
          success: false, 
          message: 'Gagal terhubung ke Google Sheets' 
        });
      }
    }

    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:E',
    });

    const rows = read.data.values;
    if (!rows || rows.length === 0) {
      return res.json({ success: false, message: 'Data tidak ditemukan' });
    }

    const qrValueTrimmed = qrValue.trim().toUpperCase();
    const rowIndex = rows.findIndex(row => {
      if (!row || !row[0]) return false;
      return row[0].toString().trim().toUpperCase() === qrValueTrimmed;
    });

    if (rowIndex === -1) {
      return res.json({ success: false, message: 'QR tidak ditemukan' });
    }

    const currentRow = rows[rowIndex];
    res.json({
      success: true,
      qrCode: currentRow[0] || '',
      nama: currentRow[1] || '',
      instansi: currentRow[2] || '',
      status: currentRow[3] || 'Belum Hadir',
      waktu: currentRow[4] || ''
    });

  } catch (err) {
    console.error('Error /api/status:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: err.message 
    });
  }
});

// Get all guests endpoint
app.get('/api/guests', async (req, res) => {
  try {
    if (!sheets) {
      const initialized = await initGoogleSheets();
      if (!initialized) {
        return res.status(500).json({ 
          success: false, 
          message: 'Gagal terhubung ke Google Sheets' 
        });
      }
    }

    console.log('[GET GUESTS] Mengambil data tamu...');

    const read = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:E',
    });

    const rows = read.data.values || [];
    console.log(`[GET GUESTS] Ditemukan ${rows.length} tamu`);

    const guests = rows.map((row, index) => ({
      rowNumber: index + 2,
      qrCode: row[0] || '',
      nama: row[1] || '',
      instansi: row[2] || '',
      status: row[3] || 'Belum Hadir',
      waktu: row[4] || ''
    }));

    const hadirCount = guests.filter(g => 
      g.status && g.status.toLowerCase().includes('hadir')
    ).length;

    console.log(`[GET GUESTS] Hadir: ${hadirCount}/${guests.length}\n`);

    res.json({
      success: true,
      total: guests.length,
      hadir: hadirCount,
      guests
    });

  } catch (err) {
    console.error('[GET GUESTS] Error:', err.message);
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: err.message 
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`\n========================================`);
  console.log(`🎉 Wedding Check-in Server`);
  console.log(`========================================`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Spreadsheet ID: ${SPREADSHEET_ID}`);
  console.log(`========================================\n`);
  
  // Initialize Google Sheets on startup
  const initialized = await initGoogleSheets();
  
  if (!initialized) {
    console.log('⚠️  WARNING: Gagal menginisialisasi Google Sheets');
    console.log('   Pastikan:');
    console.log('   1. File creds.json ada dan valid');
    console.log('   2. Service account sudah di-share ke spreadsheet');
    console.log('   3. Spreadsheet ID benar\n');
  } else {
    console.log('✓ Server siap digunakan!\n');
  }
});