const { google } = require('googleapis');

const SPREADSHEET_ID = '101ahLyMkMPswlUuQAQqsXMs5XJZHypcyPf0fiKPsL4w';

// Simpan auth global biar tidak diinisialisasi ulang setiap request
let sheets;

async function initSheets() {
  if (sheets) return sheets;

  const creds = JSON.parse(process.env.GOOGLE_CREDS);

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  sheets = google.sheets({ version: 'v4', auth: client });
  return sheets;
}

module.exports = async (req, res) => {
  const method = req.method.toUpperCase();

  try {
    const sheets = await initSheets();

    // ============ POST /api/checkin ============
    if (method === 'POST') {
      const { qrValue } = req.body || {};

      if (!qrValue || qrValue.trim() === '') {
        return res.status(400).json({ success: false, message: 'QR code tidak valid' });
      }

      const read = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A2:E',
      });

      const rows = read.data.values || [];
      const qrValueTrimmed = qrValue.trim().toUpperCase();

      const rowIndex = rows.findIndex(row =>
        row[0]?.toString().trim().toUpperCase() === qrValueTrimmed
      );

      if (rowIndex === -1) {
        return res.json({ success: false, message: `QR code "${qrValue}" tidak ditemukan` });
      }

      const currentRow = rows[rowIndex];
      const nama = currentRow[1] || 'Tanpa Nama';
      const instansi = currentRow[2] || 'Tanpa Instansi';
      const statusLama = currentRow[3] || '';
      const waktuLama = currentRow[4] || '';
      const rowNumber = rowIndex + 2;

      if (statusLama.toLowerCase().includes('hadir')) {
        return res.json({
          success: false,
          message: `${nama} sudah check-in sebelumnya`,
          nama,
          instansi,
          status: statusLama,
          waktuCheckin: waktuLama || 'Tidak tercatat',
          sudahCheckin: true,
        });
      }

      const timestamp = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!D${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Hadir', timestamp]] },
      });

      return res.json({
        success: true,
        message: 'Check-in berhasil!',
        qrCode: qrValue,
        nama,
        instansi,
        status: 'Hadir',
        waktuCheckin: timestamp,
      });
    }

    // ============ GET /api/checkin?qr=XXXX ============
    if (method === 'GET') {
      const qrValue = req.query.qr;
      if (!qrValue) return res.status(400).json({ success: false, message: 'QR tidak disertakan' });

      const read = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A2:E',
      });

      const rows = read.data.values || [];
      const qrValueTrimmed = qrValue.trim().toUpperCase();

      const rowIndex = rows.findIndex(row =>
        row[0]?.toString().trim().toUpperCase() === qrValueTrimmed
      );

      if (rowIndex === -1) {
        return res.json({ success: false, message: 'QR tidak ditemukan' });
      }

      const currentRow = rows[rowIndex];
      return res.json({
        success: true,
        qrCode: currentRow[0],
        nama: currentRow[1],
        instansi: currentRow[2],
        status: currentRow[3] || 'Belum Hadir',
        waktu: currentRow[4] || '',
      });
    }

    // ============ METHOD LAIN ============
    res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
  } catch (err) {
    console.error('Error API Checkin:', err.message);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
