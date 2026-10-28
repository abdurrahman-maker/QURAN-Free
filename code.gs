/**
 * ============================================================
 * AL-QUR'AN SIMPLE - Google Apps Script Backend
 * ============================================================
 * Aplikasi Web Al-Qur'an sederhana berbasis Google Apps Script.
 * Menyediakan fitur membaca Al-Qur'an, bookmark, catatan,
 * riwayat bacaan, dan panel admin.
 *
 * Sumber Data Al-Qur'an: https://equran.id/api/v2
 * Penyimpanan Data: Google Spreadsheet
 * ============================================================
 */

// ============================================================
// KONFIGURASI GLOBAL
// ============================================================

/**
 * ID Spreadsheet yang digunakan sebagai database.
 * Ganti dengan ID spreadsheet Anda sendiri.
 */
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';

/**
 * Nama-nama sheet yang digunakan dalam spreadsheet.
 */
const SHEET_NAMES = {
  USERS: 'Users',
  READING_HISTORY: 'ReadingHistory',
  BOOKMARKS: 'Bookmarks',
  NOTES: 'Notes',
  USER_SETTINGS: 'UserSettings',
  ANNOUNCEMENTS: 'Announcements',
  DONATIONS: 'Donations',
  APP_CONFIG: 'AppConfig'
};

/**
 * Total ayat dalam Al-Qur'an (untuk perhitungan khatam).
 */
const TOTAL_AYAHS_QURAN = 6236;

/**
 * Durasi cache dalam detik (6 jam).
 */
const CACHE_DURATION = 21600;

/**
 * URL dasar API equran.id.
 */
const EQURAN_API_BASE = 'https://equran.id/api/v2';


// ============================================================
// 1. WEB APP ENTRY POINTS
// ============================================================

/**
 * Handler untuk request GET — menampilkan halaman HTML utama.
 * @param {Object} e - Event object dari Google Apps Script.
 * @returns {HtmlOutput} Halaman HTML aplikasi.
 */
function doGet(e) {
  try {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Al-Qur\'an Simple')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  } catch (error) {
    Logger.log('Error pada doGet: ' + error.message);
    return HtmlService.createHtmlOutput('<h1>Terjadi Kesalahan</h1><p>' + error.message + '</p>');
  }
}

/**
 * Handler untuk request POST — menerima dan merutekan request API.
 * Semua request dikirim sebagai JSON dengan field 'action' untuk routing.
 * @param {Object} e - Event object yang berisi postData.
 * @returns {TextOutput} Response JSON.
 */
function doPost(e) {
  try {
    // Parse data JSON dari request body
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;

    // Validasi: pastikan action tersedia
    if (!action) {
      return sendJsonResponse_({ success: false, error: 'Parameter action tidak ditemukan.' });
    }

    // Routing berdasarkan action menggunakan switch
    switch (action) {
      // --- Autentikasi ---
      case 'login':
        return sendJsonResponse_(handleLogin(requestData));
      case 'register':
        return sendJsonResponse_(handleRegister(requestData));
      case 'logout':
        return sendJsonResponse_(handleLogout(requestData));

      // --- Data Al-Qur'an ---
      case 'getSurahList':
        return sendJsonResponse_(getSurahList());
      case 'getSurahDetail':
        return sendJsonResponse_(getSurahDetail(requestData.surahNumber));
      case 'searchAyah':
        return sendJsonResponse_(searchAyah(requestData.keyword));
      case 'getJuzList':
        return sendJsonResponse_(getJuzList());

      // --- Riwayat & Progres Bacaan ---
      case 'saveReadingProgress':
        return sendJsonResponse_(saveReadingProgress(requestData));
      case 'getReadingHistory':
        return sendJsonResponse_(getReadingHistory(requestData.userId));
      case 'getReadingStats':
        return sendJsonResponse_(getReadingStats(requestData.userId));
      case 'getMonthlyReadingChart':
        return sendJsonResponse_(getMonthlyReadingChart(requestData.userId));

      // --- Bookmark ---
      case 'addBookmark':
        return sendJsonResponse_(addBookmark(requestData));
      case 'removeBookmark':
        return sendJsonResponse_(removeBookmark(requestData));
      case 'getBookmarks':
        return sendJsonResponse_(getBookmarks(requestData.userId));

      // --- Catatan ---
      case 'addNote':
        return sendJsonResponse_(addNote(requestData));
      case 'getNotes':
        return sendJsonResponse_(getNotes(requestData.userId));
      case 'deleteNote':
        return sendJsonResponse_(deleteNote(requestData));

      // --- Pengaturan Pengguna ---
      case 'getUserSettings':
        return sendJsonResponse_(getUserSettings(requestData.userId));
      case 'saveUserSettings':
        return sendJsonResponse_(saveUserSettings(requestData));

      // --- Pengumuman ---
      case 'getActiveAnnouncements':
        return sendJsonResponse_(getActiveAnnouncements());
      case 'createAnnouncement':
        return sendJsonResponse_(createAnnouncement(requestData));
      case 'updateAnnouncement':
        return sendJsonResponse_(updateAnnouncement(requestData));
      case 'deleteAnnouncement':
        return sendJsonResponse_(deleteAnnouncement(requestData));

      // --- Donasi / QRIS ---
      case 'getQrisImage':
        return sendJsonResponse_(getQrisImage());
      case 'updateQrisImage':
        return sendJsonResponse_(updateQrisImage(requestData));
      case 'recordDonation':
        return sendJsonResponse_(recordDonation(requestData));

      // --- Admin Dashboard ---
      case 'getAdminStats':
        return sendJsonResponse_(getAdminStats());
      case 'getAllUsers':
        return sendJsonResponse_(getAllUsers());
      case 'updateUserRole':
        return sendJsonResponse_(updateUserRole(requestData));

      // --- Action tidak dikenal ---
      default:
        return sendJsonResponse_({ success: false, error: 'Action tidak dikenal: ' + action });
    }
  } catch (error) {
    Logger.log('Error pada doPost: ' + error.message);
    return sendJsonResponse_({ success: false, error: 'Terjadi kesalahan server: ' + error.message });
  }
}


// ============================================================
// 2. FUNGSI AUTENTIKASI
// ============================================================

/**
 * Menangani proses login pengguna.
 * Memverifikasi email dan password, lalu membuat session token.
 * @param {Object} data - Objek berisi email dan password.
 * @returns {Object} Hasil login dengan data user dan token.
 */
function handleLogin(data) {
  try {
    const { email, password } = data;

    // Validasi input
    if (!email || !password) {
      return { success: false, error: 'Email dan password harus diisi.' };
    }

    // Cari pengguna di sheet Users
    const sheet = getSheet_(SHEET_NAMES.USERS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];

    // Cari index kolom yang diperlukan
    const emailIdx = headers.indexOf('email');
    const passwordIdx = headers.indexOf('password');
    const idIdx = headers.indexOf('id');
    const nameIdx = headers.indexOf('name');
    const roleIdx = headers.indexOf('role');
    const createdAtIdx = headers.indexOf('createdAt');

    // Cari user berdasarkan email
    let userRow = null;
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][emailIdx] === email.toLowerCase().trim()) {
        userRow = allData[i];
        break;
      }
    }

    // Jika user tidak ditemukan
    if (!userRow) {
      return { success: false, error: 'Email atau password salah.' };
    }

    // Verifikasi password
    const hashedPassword = hashPassword_(password);
    if (userRow[passwordIdx] !== hashedPassword) {
      return { success: false, error: 'Email atau password salah.' };
    }

    // Buat session token
    const token = generateToken_();
    const userId = userRow[idIdx];

    // Simpan session ke CacheService (berlaku 6 jam)
    const cache = CacheService.getScriptCache();
    const sessionData = JSON.stringify({
      userId: userId,
      email: userRow[emailIdx],
      name: userRow[nameIdx],
      role: userRow[roleIdx],
      loginAt: new Date().toISOString()
    });
    cache.put('session_' + token, sessionData, CACHE_DURATION);

    // Kembalikan data user tanpa password
    return {
      success: true,
      message: 'Login berhasil.',
      user: {
        id: userId,
        name: userRow[nameIdx],
        email: userRow[emailIdx],
        role: userRow[roleIdx],
        createdAt: userRow[createdAtIdx]
      },
      token: token
    };
  } catch (error) {
    Logger.log('Error handleLogin: ' + error.message);
    return { success: false, error: 'Gagal login: ' + error.message };
  }
}

/**
 * Menangani proses registrasi pengguna baru.
 * Role default: 'pembaca'. Bisa juga mendaftar sebagai 'pengajar'.
 * @param {Object} data - Objek berisi name, email, password, dan role (opsional).
 * @returns {Object} Hasil registrasi.
 */
function handleRegister(data) {
  try {
    const { name, email, password, role } = data;

    // Validasi input
    if (!name || !email || !password) {
      return { success: false, error: 'Nama, email, dan password harus diisi.' };
    }

    // Validasi format email sederhana
    if (!email.includes('@') || !email.includes('.')) {
      return { success: false, error: 'Format email tidak valid.' };
    }

    // Validasi panjang password minimal 6 karakter
    if (password.length < 6) {
      return { success: false, error: 'Password minimal 6 karakter.' };
    }

    // Validasi role (hanya pembaca atau pengajar yang diperbolehkan saat registrasi)
    const allowedRoles = ['pembaca', 'pengajar'];
    const userRole = (role && allowedRoles.includes(role.toLowerCase())) ? role.toLowerCase() : 'pembaca';

    // Cek apakah email sudah terdaftar
    const sheet = getSheet_(SHEET_NAMES.USERS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const emailIdx = headers.indexOf('email');

    for (let i = 1; i < allData.length; i++) {
      if (allData[i][emailIdx] === email.toLowerCase().trim()) {
        return { success: false, error: 'Email sudah terdaftar.' };
      }
    }

    // Buat ID unik untuk user baru
    const userId = generateId_();
    const hashedPassword = hashPassword_(password);
    const now = new Date().toISOString();

    // Tambahkan baris baru ke sheet
    sheet.appendRow([
      userId,
      name.trim(),
      email.toLowerCase().trim(),
      hashedPassword,
      userRole,
      now,   // createdAt
      now    // updatedAt
    ]);

    // Buat pengaturan default untuk user baru
    const settingsSheet = getSheet_(SHEET_NAMES.USER_SETTINGS);
    settingsSheet.appendRow([
      generateId_(),
      userId,
      16,         // fontSize default
      'LPMQ',    // fontFamily default (font Al-Qur'an LPMQ)
      true,       // showLatin
      true,       // showTranslation
      'light',    // theme
      now         // updatedAt
    ]);

    return {
      success: true,
      message: 'Registrasi berhasil. Silakan login.',
      user: {
        id: userId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: userRole,
        createdAt: now
      }
    };
  } catch (error) {
    Logger.log('Error handleRegister: ' + error.message);
    return { success: false, error: 'Gagal registrasi: ' + error.message };
  }
}

/**
 * Menangani proses logout — menghapus session dari cache.
 * @param {Object} data - Objek berisi token.
 * @returns {Object} Hasil logout.
 */
function handleLogout(data) {
  try {
    const { token } = data;

    if (!token) {
      return { success: false, error: 'Token tidak ditemukan.' };
    }

    // Hapus session dari cache
    const cache = CacheService.getScriptCache();
    cache.remove('session_' + token);

    return { success: true, message: 'Logout berhasil.' };
  } catch (error) {
    Logger.log('Error handleLogout: ' + error.message);
    return { success: false, error: 'Gagal logout: ' + error.message };
  }
}

/**
 * Memvalidasi session token.
 * Mengecek apakah token masih berlaku di CacheService.
 * @param {string} token - Session token yang akan divalidasi.
 * @returns {Object|null} Data session jika valid, null jika tidak valid.
 * @private
 */
function validateSession_(token) {
  try {
    if (!token) return null;

    const cache = CacheService.getScriptCache();
    const sessionData = cache.get('session_' + token);

    if (!sessionData) return null;

    return JSON.parse(sessionData);
  } catch (error) {
    Logger.log('Error validateSession_: ' + error.message);
    return null;
  }
}

/**
 * Meng-hash password menggunakan SHA-256.
 * @param {string} password - Password yang akan di-hash.
 * @returns {string} Hash password dalam format hexadecimal.
 * @private
 */
function hashPassword_(password) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  // Konversi byte array ke string hexadecimal
  return rawHash.map(function(byte) {
    // Pastikan byte bernilai positif (0-255)
    const v = (byte < 0) ? byte + 256 : byte;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

/**
 * Menghasilkan token unik untuk session menggunakan UUID.
 * @returns {string} Token unik.
 * @private
 */
function generateToken_() {
  return Utilities.getUuid();
}


// ============================================================
// 3. FUNGSI DATA AL-QUR'AN (API Eksternal)
// ============================================================

/**
 * Mengambil daftar semua 114 surah dari API equran.id.
 * Menggunakan CacheService untuk menyimpan data selama 6 jam.
 * @returns {Object} Daftar surah.
 */
function getSurahList() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'surah_list';

    // Cek cache terlebih dahulu
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return { success: true, data: JSON.parse(cachedData) };
    }

    // Ambil data dari API
    const response = UrlFetchApp.fetch(EQURAN_API_BASE + '/surat', {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });

    if (response.getResponseCode() !== 200) {
      return { success: false, error: 'Gagal mengambil daftar surah dari API.' };
    }

    const apiData = JSON.parse(response.getContentText());
    const surahList = apiData.data || [];

    // Simpan ke cache (6 jam)
    // CacheService memiliki batas 100KB per item, jadi kita simpan versi ringkas
    const compactList = surahList.map(function(s) {
      return {
        nomor: s.nomor,
        nama: s.nama,
        namaLatin: s.namaLatin,
        jumlahAyat: s.jumlahAyat,
        tempatTurun: s.tempatTurun,
        arti: s.arti,
        deskripsi: s.deskripsi
      };
    });

    cache.put(cacheKey, JSON.stringify(compactList), CACHE_DURATION);

    return { success: true, data: compactList };
  } catch (error) {
    Logger.log('Error getSurahList: ' + error.message);
    return { success: false, error: 'Gagal mengambil daftar surah: ' + error.message };
  }
}

/**
 * Mengambil detail surah beserta ayat-ayatnya dari API equran.id.
 * @param {number} surahNumber - Nomor surah (1-114).
 * @returns {Object} Detail surah dengan ayat-ayatnya.
 */
function getSurahDetail(surahNumber) {
  try {
    // Validasi nomor surah
    if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
      return { success: false, error: 'Nomor surah tidak valid (1-114).' };
    }

    const cache = CacheService.getScriptCache();
    const cacheKey = 'surah_detail_' + surahNumber;

    // Cek cache terlebih dahulu
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return { success: true, data: JSON.parse(cachedData) };
    }

    // Ambil data dari API
    const response = UrlFetchApp.fetch(EQURAN_API_BASE + '/surat/' + surahNumber, {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });

    if (response.getResponseCode() !== 200) {
      return { success: false, error: 'Gagal mengambil detail surah dari API.' };
    }

    const apiData = JSON.parse(response.getContentText());
    const surahDetail = apiData.data || {};

    // Simpan ke cache (6 jam)
    // Catatan: data surah detail bisa besar, kita coba simpan
    try {
      cache.put(cacheKey, JSON.stringify(surahDetail), CACHE_DURATION);
    } catch (cacheError) {
      // Jika data terlalu besar untuk cache, abaikan saja
      Logger.log('Data surah ' + surahNumber + ' terlalu besar untuk cache: ' + cacheError.message);
    }

    return { success: true, data: surahDetail };
  } catch (error) {
    Logger.log('Error getSurahDetail: ' + error.message);
    return { success: false, error: 'Gagal mengambil detail surah: ' + error.message };
  }
}

/**
 * Mencari ayat berdasarkan kata kunci dalam terjemahan.
 * Menggunakan API equran.id untuk pencarian.
 * @param {string} keyword - Kata kunci pencarian.
 * @returns {Object} Hasil pencarian ayat.
 */
function searchAyah(keyword) {
  try {
    // Validasi input
    if (!keyword || keyword.trim().length < 3) {
      return { success: false, error: 'Kata kunci pencarian minimal 3 karakter.' };
    }

    const encodedKeyword = encodeURIComponent(keyword.trim());

    // Gunakan endpoint pencarian dari equran.id
    // Catatan: API equran.id v2 tidak memiliki endpoint pencarian resmi,
    // sehingga kita lakukan pencarian manual dari data surah yang sudah ada
    // atau gunakan endpoint yang tersedia.
    // Strategi: fetch semua surah satu per satu (dengan cache) lalu filter.
    // Untuk efisiensi, kita batasi pencarian dan gunakan pendekatan cache bertahap.

    const results = [];
    const lowKeyword = keyword.trim().toLowerCase();

    // Iterasi setiap surah untuk mencari di terjemahan
    // Untuk performa, kita batasi jumlah hasil maksimal 50
    const MAX_RESULTS = 50;

    for (let surahNum = 1; surahNum <= 114; surahNum++) {
      if (results.length >= MAX_RESULTS) break;

      try {
        const surahResult = getSurahDetail(surahNum);
        if (surahResult.success && surahResult.data && surahResult.data.ayat) {
          const ayahs = surahResult.data.ayat;
          for (let j = 0; j < ayahs.length; j++) {
            if (results.length >= MAX_RESULTS) break;

            const ayah = ayahs[j];
            // Cari di terjemahan (apiData biasanya memiliki field 'tpiIndonesia' atau 'apiIndonesia')
            const translation = (ayah.tpiIndonesia || ayah.tpiIndonesia || '').toLowerCase();
            if (translation.includes(lowKeyword)) {
              results.push({
                surahNumber: surahNum,
                surahName: surahResult.data.namaLatin,
                ayahNumber: ayah.nomorAyat,
                arabText: ayah.tpipirab || ayah.tpipirab || '',
                translation: ayah.tpiIndonesia || '',
                latin: ayah.tpiLatin || ''
              });
            }
          }
        }
      } catch (fetchError) {
        // Lewati surah yang gagal di-fetch, lanjutkan ke surah berikutnya
        Logger.log('Gagal fetch surah ' + surahNum + ' saat pencarian: ' + fetchError.message);
        continue;
      }
    }

    return {
      success: true,
      keyword: keyword.trim(),
      totalResults: results.length,
      data: results
    };
  } catch (error) {
    Logger.log('Error searchAyah: ' + error.message);
    return { success: false, error: 'Gagal mencari ayat: ' + error.message };
  }
}

/**
 * Mengembalikan data pemetaan Juz ke Surah.
 * Data hardcoded untuk semua 30 juz Al-Qur'an.
 * Setiap juz memiliki informasi surah dan ayat awal-akhir.
 * @returns {Object} Daftar 30 juz beserta pemetaannya.
 */
function getJuzList() {
  try {
    const juzData = [
      { juz: 1,  startSurah: 1,  startAyah: 1,   endSurah: 2,  endAyah: 141,  name: 'Alif Lam Mim' },
      { juz: 2,  startSurah: 2,  startAyah: 142,  endSurah: 2,  endAyah: 252,  name: 'Sayaqul' },
      { juz: 3,  startSurah: 2,  startAyah: 253,  endSurah: 3,  endAyah: 92,   name: 'Tilkar Rusul' },
      { juz: 4,  startSurah: 3,  startAyah: 93,   endSurah: 4,  endAyah: 23,   name: 'Lan Tanalul' },
      { juz: 5,  startSurah: 4,  startAyah: 24,   endSurah: 4,  endAyah: 147,  name: 'Wal Muhsanat' },
      { juz: 6,  startSurah: 4,  startAyah: 148,  endSurah: 5,  endAyah: 81,   name: 'La Yuhibbullah' },
      { juz: 7,  startSurah: 5,  startAyah: 82,   endSurah: 6,  endAyah: 110,  name: 'Wa Idza Sami\'u' },
      { juz: 8,  startSurah: 6,  startAyah: 111,  endSurah: 7,  endAyah: 87,   name: 'Wa Lau Annana' },
      { juz: 9,  startSurah: 7,  startAyah: 88,   endSurah: 8,  endAyah: 40,   name: 'Qalal Mala\'u' },
      { juz: 10, startSurah: 8,  startAyah: 41,   endSurah: 9,  endAyah: 92,   name: 'Wa\'lamu' },
      { juz: 11, startSurah: 9,  startAyah: 93,   endSurah: 11, endAyah: 5,    name: 'Ya\'tadzirun' },
      { juz: 12, startSurah: 11, startAyah: 6,    endSurah: 12, endAyah: 52,   name: 'Wa Ma Min Dabbah' },
      { juz: 13, startSurah: 12, startAyah: 53,   endSurah: 14, endAyah: 52,   name: 'Wa Ma Ubarri\'u' },
      { juz: 14, startSurah: 15, startAyah: 1,    endSurah: 16, endAyah: 128,  name: 'Rubama' },
      { juz: 15, startSurah: 17, startAyah: 1,    endSurah: 18, endAyah: 74,   name: 'Subhanallazi' },
      { juz: 16, startSurah: 18, startAyah: 75,   endSurah: 20, endAyah: 135,  name: 'Qal Alam' },
      { juz: 17, startSurah: 21, startAyah: 1,    endSurah: 22, endAyah: 78,   name: 'Iqtaraba' },
      { juz: 18, startSurah: 23, startAyah: 1,    endSurah: 25, endAyah: 20,   name: 'Qad Aflaha' },
      { juz: 19, startSurah: 25, startAyah: 21,   endSurah: 27, endAyah: 55,   name: 'Wa Qalallazina' },
      { juz: 20, startSurah: 27, startAyah: 56,   endSurah: 29, endAyah: 45,   name: 'Amman Khalaq' },
      { juz: 21, startSurah: 29, startAyah: 46,   endSurah: 33, endAyah: 30,   name: 'Utlu Ma Uhiya' },
      { juz: 22, startSurah: 33, startAyah: 31,   endSurah: 36, endAyah: 27,   name: 'Wa Man Yaqnut' },
      { juz: 23, startSurah: 36, startAyah: 28,   endSurah: 39, endAyah: 31,   name: 'Wa Mali' },
      { juz: 24, startSurah: 39, startAyah: 32,   endSurah: 41, endAyah: 46,   name: 'Faman Azlamu' },
      { juz: 25, startSurah: 41, startAyah: 47,   endSurah: 45, endAyah: 37,   name: 'Ilaihi Yuraddu' },
      { juz: 26, startSurah: 46, startAyah: 1,    endSurah: 51, endAyah: 30,   name: 'Ha Mim' },
      { juz: 27, startSurah: 51, startAyah: 31,   endSurah: 57, endAyah: 29,   name: 'Qala Fama Khatbukum' },
      { juz: 28, startSurah: 58, startAyah: 1,    endSurah: 66, endAyah: 12,   name: 'Qad Sami\'a' },
      { juz: 29, startSurah: 67, startAyah: 1,    endSurah: 77, endAyah: 50,   name: 'Tabarakallazi' },
      { juz: 30, startSurah: 78, startAyah: 1,    endSurah: 114, endAyah: 6,   name: '\'Amma Yatasa\'alun' }
    ];

    return { success: true, data: juzData };
  } catch (error) {
    Logger.log('Error getJuzList: ' + error.message);
    return { success: false, error: 'Gagal mengambil daftar juz: ' + error.message };
  }
}


// ============================================================
// 4. RIWAYAT BACAAN & PROGRES
// ============================================================

/**
 * Menyimpan progres bacaan pengguna.
 * @param {Object} data - Objek berisi userId, surahNumber, ayahFrom, ayahTo, duration.
 * @returns {Object} Hasil penyimpanan.
 */
function saveReadingProgress(data) {
  try {
    const { userId, surahNumber, ayahFrom, ayahTo, duration } = data;

    // Validasi input
    if (!userId || !surahNumber) {
      return { success: false, error: 'userId dan surahNumber harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.READING_HISTORY);
    const now = new Date().toISOString();
    const id = generateId_();

    // Hitung jumlah ayat yang dibaca
    const ayahCount = (ayahTo || ayahFrom || 1) - (ayahFrom || 1) + 1;

    // Tambahkan baris baru ke sheet
    sheet.appendRow([
      id,
      userId,
      surahNumber,
      ayahFrom || 1,
      ayahTo || ayahFrom || 1,
      ayahCount,
      duration || 0,  // durasi dalam menit
      now             // timestamp
    ]);

    return {
      success: true,
      message: 'Progres bacaan berhasil disimpan.',
      data: {
        id: id,
        surahNumber: surahNumber,
        ayahFrom: ayahFrom || 1,
        ayahTo: ayahTo || ayahFrom || 1,
        ayahCount: ayahCount,
        duration: duration || 0,
        timestamp: now
      }
    };
  } catch (error) {
    Logger.log('Error saveReadingProgress: ' + error.message);
    return { success: false, error: 'Gagal menyimpan progres: ' + error.message };
  }
}

/**
 * Mengambil riwayat bacaan pengguna.
 * Mengembalikan 50 entri terakhir secara default.
 * @param {string} userId - ID pengguna.
 * @returns {Object} Riwayat bacaan pengguna.
 */
function getReadingHistory(userId) {
  try {
    if (!userId) {
      return { success: false, error: 'userId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.READING_HISTORY);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');

    // Filter berdasarkan userId
    const history = [];
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] === userId) {
        history.push({
          id: allData[i][headers.indexOf('id')],
          surahNumber: allData[i][headers.indexOf('surahNumber')],
          ayahFrom: allData[i][headers.indexOf('ayahFrom')],
          ayahTo: allData[i][headers.indexOf('ayahTo')],
          ayahCount: allData[i][headers.indexOf('ayahCount')],
          duration: allData[i][headers.indexOf('duration')],
          timestamp: allData[i][headers.indexOf('timestamp')]
        });
      }
    }

    // Urutkan berdasarkan timestamp terbaru dan ambil 50 terakhir
    history.sort(function(a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    return {
      success: true,
      data: history.slice(0, 50),
      totalRecords: history.length
    };
  } catch (error) {
    Logger.log('Error getReadingHistory: ' + error.message);
    return { success: false, error: 'Gagal mengambil riwayat bacaan: ' + error.message };
  }
}

/**
 * Menghitung statistik bacaan pengguna secara komprehensif.
 * Termasuk: total surah dibaca, total ayat, total durasi, progres khatam, dan statistik bulanan.
 * @param {string} userId - ID pengguna.
 * @returns {Object} Statistik bacaan.
 */
function getReadingStats(userId) {
  try {
    if (!userId) {
      return { success: false, error: 'userId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.READING_HISTORY);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');
    const surahNumberIdx = headers.indexOf('surahNumber');
    const ayahFromIdx = headers.indexOf('ayahFrom');
    const ayahToIdx = headers.indexOf('ayahTo');
    const ayahCountIdx = headers.indexOf('ayahCount');
    const durationIdx = headers.indexOf('duration');
    const timestampIdx = headers.indexOf('timestamp');

    // Kumpulkan semua data bacaan user
    let totalAyahs = 0;
    let totalDuration = 0;
    const uniqueSurahs = new Set();
    const uniqueAyahs = new Set(); // Untuk menghitung progres khatam (ayat unik)
    const monthlyData = {};

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let thisMonthAyahs = 0;
    let thisMonthDuration = 0;

    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] !== userId) continue;

      const surahNum = allData[i][surahNumberIdx];
      const ayahFrom = allData[i][ayahFromIdx];
      const ayahTo = allData[i][ayahToIdx];
      const ayahCount = allData[i][ayahCountIdx] || 0;
      const duration = allData[i][durationIdx] || 0;
      const timestamp = new Date(allData[i][timestampIdx]);

      totalAyahs += ayahCount;
      totalDuration += duration;
      uniqueSurahs.add(surahNum);

      // Tandai setiap ayat unik yang sudah dibaca (untuk progres khatam)
      for (let ayah = ayahFrom; ayah <= ayahTo; ayah++) {
        uniqueAyahs.add(surahNum + ':' + ayah);
      }

      // Statistik bulanan
      const monthKey = timestamp.getFullYear() + '-' + ('0' + (timestamp.getMonth() + 1)).slice(-2);
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { ayahs: 0, duration: 0, sessions: 0 };
      }
      monthlyData[monthKey].ayahs += ayahCount;
      monthlyData[monthKey].duration += duration;
      monthlyData[monthKey].sessions += 1;

      // Statistik bulan ini
      if (timestamp.getMonth() === currentMonth && timestamp.getFullYear() === currentYear) {
        thisMonthAyahs += ayahCount;
        thisMonthDuration += duration;
      }
    }

    // Hitung progres khatam (persentase ayat unik yang sudah dibaca)
    const khatamProgress = Math.round((uniqueAyahs.size / TOTAL_AYAHS_QURAN) * 10000) / 100;

    return {
      success: true,
      data: {
        totalSurahsRead: uniqueSurahs.size,
        totalAyahsRead: totalAyahs,
        uniqueAyahsRead: uniqueAyahs.size,
        totalDurationMinutes: totalDuration,
        totalDurationFormatted: formatDuration_(totalDuration),
        khatamProgress: khatamProgress,
        khatamProgressFraction: uniqueAyahs.size + '/' + TOTAL_AYAHS_QURAN,
        thisMonth: {
          ayahs: thisMonthAyahs,
          duration: thisMonthDuration,
          durationFormatted: formatDuration_(thisMonthDuration)
        },
        monthlyBreakdown: monthlyData
      }
    };
  } catch (error) {
    Logger.log('Error getReadingStats: ' + error.message);
    return { success: false, error: 'Gagal mengambil statistik: ' + error.message };
  }
}

/**
 * Mengambil data bacaan 12 bulan terakhir untuk ditampilkan di chart.
 * @param {string} userId - ID pengguna.
 * @returns {Object} Data bulanan untuk chart.
 */
function getMonthlyReadingChart(userId) {
  try {
    if (!userId) {
      return { success: false, error: 'userId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.READING_HISTORY);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');
    const ayahCountIdx = headers.indexOf('ayahCount');
    const durationIdx = headers.indexOf('duration');
    const timestampIdx = headers.indexOf('timestamp');

    // Buat array 12 bulan terakhir
    const now = new Date();
    const months = [];
    const monthLabels = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
    ];

    // Inisialisasi 12 bulan terakhir
    const chartData = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      const label = monthLabels[d.getMonth()] + ' ' + d.getFullYear();
      chartData[key] = { label: label, ayahs: 0, duration: 0, sessions: 0 };
      months.push(key);
    }

    // Isi data dari sheet
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] !== userId) continue;

      const timestamp = new Date(allData[i][timestampIdx]);
      const monthKey = timestamp.getFullYear() + '-' + ('0' + (timestamp.getMonth() + 1)).slice(-2);

      if (chartData[monthKey]) {
        chartData[monthKey].ayahs += (allData[i][ayahCountIdx] || 0);
        chartData[monthKey].duration += (allData[i][durationIdx] || 0);
        chartData[monthKey].sessions += 1;
      }
    }

    // Konversi ke array untuk chart
    const labels = [];
    const ayahsData = [];
    const durationData = [];
    const sessionsData = [];

    months.forEach(function(key) {
      labels.push(chartData[key].label);
      ayahsData.push(chartData[key].ayahs);
      durationData.push(chartData[key].duration);
      sessionsData.push(chartData[key].sessions);
    });

    return {
      success: true,
      data: {
        labels: labels,
        ayahs: ayahsData,
        duration: durationData,
        sessions: sessionsData
      }
    };
  } catch (error) {
    Logger.log('Error getMonthlyReadingChart: ' + error.message);
    return { success: false, error: 'Gagal mengambil data chart: ' + error.message };
  }
}


// ============================================================
// 5. BOOKMARK & CATATAN
// ============================================================

/**
 * Menambahkan bookmark untuk surah dan ayat tertentu.
 * @param {Object} data - Objek berisi userId, surahNumber, ayahNumber, surahName.
 * @returns {Object} Hasil penambahan bookmark.
 */
function addBookmark(data) {
  try {
    const { userId, surahNumber, ayahNumber, surahName } = data;

    // Validasi input
    if (!userId || !surahNumber) {
      return { success: false, error: 'userId dan surahNumber harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.BOOKMARKS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');
    const surahNumIdx = headers.indexOf('surahNumber');
    const ayahNumIdx = headers.indexOf('ayahNumber');

    // Cek apakah bookmark sudah ada
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] === userId &&
          allData[i][surahNumIdx] === surahNumber &&
          allData[i][ayahNumIdx] === (ayahNumber || 1)) {
        return { success: false, error: 'Bookmark sudah ada.' };
      }
    }

    // Tambahkan bookmark baru
    const id = generateId_();
    const now = new Date().toISOString();

    sheet.appendRow([
      id,
      userId,
      surahNumber,
      ayahNumber || 1,
      surahName || '',
      now
    ]);

    return {
      success: true,
      message: 'Bookmark berhasil ditambahkan.',
      data: {
        id: id,
        surahNumber: surahNumber,
        ayahNumber: ayahNumber || 1,
        surahName: surahName || '',
        createdAt: now
      }
    };
  } catch (error) {
    Logger.log('Error addBookmark: ' + error.message);
    return { success: false, error: 'Gagal menambahkan bookmark: ' + error.message };
  }
}

/**
 * Menghapus bookmark berdasarkan ID atau kombinasi surah+ayat.
 * @param {Object} data - Objek berisi bookmarkId atau (userId, surahNumber, ayahNumber).
 * @returns {Object} Hasil penghapusan.
 */
function removeBookmark(data) {
  try {
    const { bookmarkId, userId, surahNumber, ayahNumber } = data;

    const sheet = getSheet_(SHEET_NAMES.BOOKMARKS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idIdx = headers.indexOf('id');
    const userIdIdx = headers.indexOf('userId');
    const surahNumIdx = headers.indexOf('surahNumber');
    const ayahNumIdx = headers.indexOf('ayahNumber');

    // Cari baris yang akan dihapus (dari bawah ke atas agar index tidak bergeser)
    for (let i = allData.length - 1; i >= 1; i--) {
      let match = false;

      if (bookmarkId) {
        // Hapus berdasarkan ID
        match = (allData[i][idIdx] === bookmarkId);
      } else if (userId && surahNumber) {
        // Hapus berdasarkan kombinasi userId + surahNumber + ayahNumber
        match = (allData[i][userIdIdx] === userId &&
                 allData[i][surahNumIdx] === surahNumber &&
                 allData[i][ayahNumIdx] === (ayahNumber || 1));
      }

      if (match) {
        sheet.deleteRow(i + 1); // +1 karena sheet index mulai dari 1
        return { success: true, message: 'Bookmark berhasil dihapus.' };
      }
    }

    return { success: false, error: 'Bookmark tidak ditemukan.' };
  } catch (error) {
    Logger.log('Error removeBookmark: ' + error.message);
    return { success: false, error: 'Gagal menghapus bookmark: ' + error.message };
  }
}

/**
 * Mengambil semua bookmark milik pengguna tertentu.
 * @param {string} userId - ID pengguna.
 * @returns {Object} Daftar bookmark.
 */
function getBookmarks(userId) {
  try {
    if (!userId) {
      return { success: false, error: 'userId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.BOOKMARKS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');

    const bookmarks = [];
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] === userId) {
        bookmarks.push({
          id: allData[i][headers.indexOf('id')],
          surahNumber: allData[i][headers.indexOf('surahNumber')],
          ayahNumber: allData[i][headers.indexOf('ayahNumber')],
          surahName: allData[i][headers.indexOf('surahName')],
          createdAt: allData[i][headers.indexOf('createdAt')]
        });
      }
    }

    // Urutkan berdasarkan waktu ditambahkan (terbaru dulu)
    bookmarks.sort(function(a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return { success: true, data: bookmarks };
  } catch (error) {
    Logger.log('Error getBookmarks: ' + error.message);
    return { success: false, error: 'Gagal mengambil bookmark: ' + error.message };
  }
}

/**
 * Menambahkan atau memperbarui catatan untuk ayat tertentu.
 * Jika catatan untuk ayat tersebut sudah ada, maka akan diperbarui.
 * @param {Object} data - Objek berisi userId, surahNumber, ayahNumber, noteText.
 * @returns {Object} Hasil penambahan/pembaruan catatan.
 */
function addNote(data) {
  try {
    const { userId, surahNumber, ayahNumber, noteText } = data;

    // Validasi input
    if (!userId || !surahNumber || !ayahNumber) {
      return { success: false, error: 'userId, surahNumber, dan ayahNumber harus diisi.' };
    }

    if (!noteText || noteText.trim() === '') {
      return { success: false, error: 'Teks catatan tidak boleh kosong.' };
    }

    const sheet = getSheet_(SHEET_NAMES.NOTES);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');
    const surahNumIdx = headers.indexOf('surahNumber');
    const ayahNumIdx = headers.indexOf('ayahNumber');
    const noteTextIdx = headers.indexOf('noteText');
    const updatedAtIdx = headers.indexOf('updatedAt');

    const now = new Date().toISOString();

    // Cek apakah catatan untuk ayat ini sudah ada, jika ya maka update
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] === userId &&
          allData[i][surahNumIdx] === surahNumber &&
          allData[i][ayahNumIdx] === ayahNumber) {
        // Update catatan yang sudah ada
        sheet.getRange(i + 1, noteTextIdx + 1).setValue(noteText.trim());
        sheet.getRange(i + 1, updatedAtIdx + 1).setValue(now);

        return {
          success: true,
          message: 'Catatan berhasil diperbarui.',
          data: {
            id: allData[i][headers.indexOf('id')],
            surahNumber: surahNumber,
            ayahNumber: ayahNumber,
            noteText: noteText.trim(),
            updatedAt: now
          }
        };
      }
    }

    // Tambahkan catatan baru
    const id = generateId_();
    sheet.appendRow([
      id,
      userId,
      surahNumber,
      ayahNumber,
      noteText.trim(),
      now,  // createdAt
      now   // updatedAt
    ]);

    return {
      success: true,
      message: 'Catatan berhasil ditambahkan.',
      data: {
        id: id,
        surahNumber: surahNumber,
        ayahNumber: ayahNumber,
        noteText: noteText.trim(),
        createdAt: now,
        updatedAt: now
      }
    };
  } catch (error) {
    Logger.log('Error addNote: ' + error.message);
    return { success: false, error: 'Gagal menambahkan catatan: ' + error.message };
  }
}

/**
 * Mengambil semua catatan milik pengguna tertentu.
 * @param {string} userId - ID pengguna.
 * @returns {Object} Daftar catatan.
 */
function getNotes(userId) {
  try {
    if (!userId) {
      return { success: false, error: 'userId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.NOTES);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');

    const notes = [];
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] === userId) {
        notes.push({
          id: allData[i][headers.indexOf('id')],
          surahNumber: allData[i][headers.indexOf('surahNumber')],
          ayahNumber: allData[i][headers.indexOf('ayahNumber')],
          noteText: allData[i][headers.indexOf('noteText')],
          createdAt: allData[i][headers.indexOf('createdAt')],
          updatedAt: allData[i][headers.indexOf('updatedAt')]
        });
      }
    }

    // Urutkan berdasarkan waktu update terbaru
    notes.sort(function(a, b) {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return { success: true, data: notes };
  } catch (error) {
    Logger.log('Error getNotes: ' + error.message);
    return { success: false, error: 'Gagal mengambil catatan: ' + error.message };
  }
}

/**
 * Menghapus catatan berdasarkan ID.
 * @param {Object} data - Objek berisi noteId dan userId.
 * @returns {Object} Hasil penghapusan.
 */
function deleteNote(data) {
  try {
    const { noteId, userId } = data;

    if (!noteId) {
      return { success: false, error: 'noteId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.NOTES);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idIdx = headers.indexOf('id');
    const userIdIdx = headers.indexOf('userId');

    // Cari dan hapus catatan (dari bawah ke atas)
    for (let i = allData.length - 1; i >= 1; i--) {
      if (allData[i][idIdx] === noteId) {
        // Pastikan catatan milik user yang bersangkutan
        if (userId && allData[i][userIdIdx] !== userId) {
          return { success: false, error: 'Anda tidak memiliki akses untuk menghapus catatan ini.' };
        }
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Catatan berhasil dihapus.' };
      }
    }

    return { success: false, error: 'Catatan tidak ditemukan.' };
  } catch (error) {
    Logger.log('Error deleteNote: ' + error.message);
    return { success: false, error: 'Gagal menghapus catatan: ' + error.message };
  }
}


// ============================================================
// 6. PENGATURAN PENGGUNA
// ============================================================

/**
 * Mengambil pengaturan pengguna.
 * Jika belum ada, kembalikan pengaturan default.
 * @param {string} userId - ID pengguna.
 * @returns {Object} Pengaturan pengguna.
 */
function getUserSettings(userId) {
  try {
    if (!userId) {
      return { success: false, error: 'userId harus diisi.' };
    }

    // Pengaturan default
    const defaultSettings = {
      fontSize: 16,
      fontFamily: 'LPMQ',
      showLatin: true,
      showTranslation: true,
      theme: 'light',
      selectedQori: '05'
    };

    const sheet = getSheet_(SHEET_NAMES.USER_SETTINGS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');

    // Cari pengaturan user
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] === userId) {
        return {
          success: true,
          data: {
            fontSize: allData[i][headers.indexOf('fontSize')] || defaultSettings.fontSize,
            fontFamily: allData[i][headers.indexOf('fontFamily')] || defaultSettings.fontFamily,
            showLatin: allData[i][headers.indexOf('showLatin')] !== false,
            showTranslation: allData[i][headers.indexOf('showTranslation')] !== false,
            theme: allData[i][headers.indexOf('theme')] || defaultSettings.theme,
            selectedQori: (headers.indexOf('selectedQori') !== -1 ? allData[i][headers.indexOf('selectedQori')] : null) || defaultSettings.selectedQori
          }
        };
      }
    }

    // Jika tidak ditemukan, kembalikan default
    return { success: true, data: defaultSettings };
  } catch (error) {
    Logger.log('Error getUserSettings: ' + error.message);
    return { success: false, error: 'Gagal mengambil pengaturan: ' + error.message };
  }
}

/**
 * Menyimpan pengaturan pengguna.
 * @param {Object} data - Objek berisi userId dan pengaturan (fontSize, fontFamily, showLatin, showTranslation, theme, selectedQori).
 * @returns {Object} Hasil penyimpanan.
 */
function saveUserSettings(data) {
  try {
    const { userId, fontSize, fontFamily, showLatin, showTranslation, theme, selectedQori } = data;

    if (!userId) {
      return { success: false, error: 'userId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.USER_SETTINGS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const userIdIdx = headers.indexOf('userId');
    const now = new Date().toISOString();

    // Pastikan header selectedQori ada jika belum ada
    if (headers.indexOf('selectedQori') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('selectedQori');
      headers.push('selectedQori');
    }

    // Cari pengaturan yang sudah ada
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][userIdIdx] === userId) {
        // Update pengaturan yang ada
        const rowNum = i + 1;
        if (fontSize !== undefined) sheet.getRange(rowNum, headers.indexOf('fontSize') + 1).setValue(fontSize);
        if (fontFamily !== undefined) sheet.getRange(rowNum, headers.indexOf('fontFamily') + 1).setValue(fontFamily);
        if (showLatin !== undefined) sheet.getRange(rowNum, headers.indexOf('showLatin') + 1).setValue(showLatin);
        if (showTranslation !== undefined) sheet.getRange(rowNum, headers.indexOf('showTranslation') + 1).setValue(showTranslation);
        if (theme !== undefined) sheet.getRange(rowNum, headers.indexOf('theme') + 1).setValue(theme);
        if (selectedQori !== undefined) sheet.getRange(rowNum, headers.indexOf('selectedQori') + 1).setValue(selectedQori);
        sheet.getRange(rowNum, headers.indexOf('updatedAt') + 1).setValue(now);

        return { success: true, message: 'Pengaturan berhasil disimpan.' };
      }
    }

    // Jika belum ada, buat baru
    sheet.appendRow([
      generateId_(),
      userId,
      fontSize || 16,
      fontFamily || 'LPMQ',
      showLatin !== undefined ? showLatin : true,
      showTranslation !== undefined ? showTranslation : true,
      theme || 'light',
      now
    ]);

    return { success: true, message: 'Pengaturan berhasil disimpan.' };
  } catch (error) {
    Logger.log('Error saveUserSettings: ' + error.message);
    return { success: false, error: 'Gagal menyimpan pengaturan: ' + error.message };
  }
}


// ============================================================
// 7. PENGUMUMAN & BANNER
// ============================================================

/**
 * Mengambil pengumuman yang masih aktif (belum kedaluwarsa).
 * @returns {Object} Daftar pengumuman aktif.
 */
function getActiveAnnouncements() {
  try {
    const sheet = getSheet_(SHEET_NAMES.ANNOUNCEMENTS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];

    const now = new Date();
    const announcements = [];

    for (let i = 1; i < allData.length; i++) {
      const isActive = allData[i][headers.indexOf('isActive')];
      const expiryDate = allData[i][headers.indexOf('expiryDate')];

      // Tampilkan hanya yang aktif dan belum kedaluwarsa
      if (isActive === true || isActive === 'true' || isActive === 'TRUE') {
        // Jika ada tanggal kedaluwarsa, cek apakah sudah lewat
        if (expiryDate && new Date(expiryDate) < now) {
          continue; // Lewati pengumuman yang sudah kedaluwarsa
        }

        announcements.push({
          id: allData[i][headers.indexOf('id')],
          title: allData[i][headers.indexOf('title')],
          content: allData[i][headers.indexOf('content')],
          type: allData[i][headers.indexOf('type')] || 'info', // info, warning, success, danger
          expiryDate: expiryDate || null,
          createdAt: allData[i][headers.indexOf('createdAt')]
        });
      }
    }

    // Urutkan berdasarkan waktu terbaru
    announcements.sort(function(a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return { success: true, data: announcements };
  } catch (error) {
    Logger.log('Error getActiveAnnouncements: ' + error.message);
    return { success: false, error: 'Gagal mengambil pengumuman: ' + error.message };
  }
}

/**
 * Membuat pengumuman baru (hanya admin).
 * @param {Object} data - Objek berisi userId (admin), title, content, type, expiryDate.
 * @returns {Object} Hasil pembuatan pengumuman.
 */
function createAnnouncement(data) {
  try {
    const { userId, title, content, type, expiryDate } = data;

    // Cek apakah user adalah admin
    if (!isAdmin_(userId)) {
      return { success: false, error: 'Akses ditolak. Hanya admin yang dapat membuat pengumuman.' };
    }

    if (!title || !content) {
      return { success: false, error: 'Judul dan konten harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.ANNOUNCEMENTS);
    const id = generateId_();
    const now = new Date().toISOString();

    sheet.appendRow([
      id,
      title.trim(),
      content.trim(),
      type || 'info',
      true,              // isActive
      expiryDate || '',   // tanggal kedaluwarsa (opsional)
      userId,            // createdBy
      now,               // createdAt
      now                // updatedAt
    ]);

    return {
      success: true,
      message: 'Pengumuman berhasil dibuat.',
      data: { id: id, title: title.trim(), createdAt: now }
    };
  } catch (error) {
    Logger.log('Error createAnnouncement: ' + error.message);
    return { success: false, error: 'Gagal membuat pengumuman: ' + error.message };
  }
}

/**
 * Memperbarui pengumuman yang sudah ada (hanya admin).
 * @param {Object} data - Objek berisi userId, announcementId, dan field yang ingin diperbarui.
 * @returns {Object} Hasil pembaruan.
 */
function updateAnnouncement(data) {
  try {
    const { userId, announcementId, title, content, type, isActive, expiryDate } = data;

    // Cek apakah user adalah admin
    if (!isAdmin_(userId)) {
      return { success: false, error: 'Akses ditolak. Hanya admin yang dapat memperbarui pengumuman.' };
    }

    if (!announcementId) {
      return { success: false, error: 'announcementId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.ANNOUNCEMENTS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idIdx = headers.indexOf('id');
    const now = new Date().toISOString();

    for (let i = 1; i < allData.length; i++) {
      if (allData[i][idIdx] === announcementId) {
        const rowNum = i + 1;

        if (title !== undefined) sheet.getRange(rowNum, headers.indexOf('title') + 1).setValue(title.trim());
        if (content !== undefined) sheet.getRange(rowNum, headers.indexOf('content') + 1).setValue(content.trim());
        if (type !== undefined) sheet.getRange(rowNum, headers.indexOf('type') + 1).setValue(type);
        if (isActive !== undefined) sheet.getRange(rowNum, headers.indexOf('isActive') + 1).setValue(isActive);
        if (expiryDate !== undefined) sheet.getRange(rowNum, headers.indexOf('expiryDate') + 1).setValue(expiryDate);
        sheet.getRange(rowNum, headers.indexOf('updatedAt') + 1).setValue(now);

        return { success: true, message: 'Pengumuman berhasil diperbarui.' };
      }
    }

    return { success: false, error: 'Pengumuman tidak ditemukan.' };
  } catch (error) {
    Logger.log('Error updateAnnouncement: ' + error.message);
    return { success: false, error: 'Gagal memperbarui pengumuman: ' + error.message };
  }
}

/**
 * Menghapus pengumuman (hanya admin).
 * @param {Object} data - Objek berisi userId dan announcementId.
 * @returns {Object} Hasil penghapusan.
 */
function deleteAnnouncement(data) {
  try {
    const { userId, announcementId } = data;

    // Cek apakah user adalah admin
    if (!isAdmin_(userId)) {
      return { success: false, error: 'Akses ditolak. Hanya admin yang dapat menghapus pengumuman.' };
    }

    if (!announcementId) {
      return { success: false, error: 'announcementId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.ANNOUNCEMENTS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idIdx = headers.indexOf('id');

    for (let i = allData.length - 1; i >= 1; i--) {
      if (allData[i][idIdx] === announcementId) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Pengumuman berhasil dihapus.' };
      }
    }

    return { success: false, error: 'Pengumuman tidak ditemukan.' };
  } catch (error) {
    Logger.log('Error deleteAnnouncement: ' + error.message);
    return { success: false, error: 'Gagal menghapus pengumuman: ' + error.message };
  }
}


// ============================================================
// 8. DONASI / QRIS
// ============================================================

/**
 * Mengambil URL gambar QRIS aktif dari AppConfig.
 * @returns {Object} URL gambar QRIS.
 */
function getQrisImage() {
  try {
    const sheet = getSheet_(SHEET_NAMES.APP_CONFIG);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const keyIdx = headers.indexOf('key');
    const valueIdx = headers.indexOf('value');

    for (let i = 1; i < allData.length; i++) {
      if (allData[i][keyIdx] === 'qris_image_url') {
        return { success: true, data: { qrisImageUrl: allData[i][valueIdx] } };
      }
    }

    return { success: true, data: { qrisImageUrl: '' } };
  } catch (error) {
    Logger.log('Error getQrisImage: ' + error.message);
    return { success: false, error: 'Gagal mengambil gambar QRIS: ' + error.message };
  }
}

/**
 * Memperbarui URL gambar QRIS (hanya admin).
 * @param {Object} data - Objek berisi userId dan qrisImageUrl.
 * @returns {Object} Hasil pembaruan.
 */
function updateQrisImage(data) {
  try {
    const { userId, qrisImageUrl } = data;

    // Cek apakah user adalah admin
    if (!isAdmin_(userId)) {
      return { success: false, error: 'Akses ditolak. Hanya admin yang dapat memperbarui QRIS.' };
    }

    if (!qrisImageUrl) {
      return { success: false, error: 'URL gambar QRIS harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.APP_CONFIG);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const keyIdx = headers.indexOf('key');
    const valueIdx = headers.indexOf('value');
    const now = new Date().toISOString();

    // Cari dan update jika sudah ada
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][keyIdx] === 'qris_image_url') {
        sheet.getRange(i + 1, valueIdx + 1).setValue(qrisImageUrl);
        sheet.getRange(i + 1, headers.indexOf('updatedAt') + 1).setValue(now);
        return { success: true, message: 'URL gambar QRIS berhasil diperbarui.' };
      }
    }

    // Jika belum ada, buat baru
    sheet.appendRow([
      generateId_(),
      'qris_image_url',
      qrisImageUrl,
      'URL gambar QRIS untuk halaman donasi',
      now,
      now
    ]);

    return { success: true, message: 'URL gambar QRIS berhasil disimpan.' };
  } catch (error) {
    Logger.log('Error updateQrisImage: ' + error.message);
    return { success: false, error: 'Gagal memperbarui QRIS: ' + error.message };
  }
}

/**
 * Mencatat entri donasi baru.
 * @param {Object} data - Objek berisi userId (opsional), donorName, amount, message.
 * @returns {Object} Hasil pencatatan donasi.
 */
function recordDonation(data) {
  try {
    const { userId, donorName, amount, message } = data;

    if (!donorName && !userId) {
      return { success: false, error: 'Nama donatur atau userId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.DONATIONS);
    const id = generateId_();
    const now = new Date().toISOString();

    sheet.appendRow([
      id,
      userId || '',
      donorName || 'Anonim',
      amount || 0,
      message || '',
      'pending',  // status: pending, confirmed, cancelled
      now
    ]);

    return {
      success: true,
      message: 'Donasi berhasil dicatat. Jazakallah khairan.',
      data: {
        id: id,
        donorName: donorName || 'Anonim',
        amount: amount || 0,
        status: 'pending',
        createdAt: now
      }
    };
  } catch (error) {
    Logger.log('Error recordDonation: ' + error.message);
    return { success: false, error: 'Gagal mencatat donasi: ' + error.message };
  }
}


// ============================================================
// 9. ADMIN DASHBOARD
// ============================================================

/**
 * Mengambil statistik untuk dashboard admin.
 * Termasuk: total pengguna, total bacaan hari ini, pengguna aktif minggu ini, surah terpopuler.
 * @returns {Object} Statistik admin.
 */
function getAdminStats() {
  try {
    const now = new Date();
    const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    // Hitung 7 hari yang lalu
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // --- Total Pengguna ---
    const usersSheet = getSheet_(SHEET_NAMES.USERS);
    const usersData = usersSheet.getDataRange().getValues();
    const totalUsers = Math.max(0, usersData.length - 1); // Kurangi header

    // Hitung berdasarkan role
    const roleHeaders = usersData[0];
    const roleIdx = roleHeaders.indexOf('role');
    let adminCount = 0, pembacaCount = 0, pengajarCount = 0;
    for (let i = 1; i < usersData.length; i++) {
      const role = usersData[i][roleIdx];
      if (role === 'admin') adminCount++;
      else if (role === 'pengajar') pengajarCount++;
      else pembacaCount++;
    }

    // --- Statistik Bacaan ---
    const readingSheet = getSheet_(SHEET_NAMES.READING_HISTORY);
    const readingData = readingSheet.getDataRange().getValues();
    const readingHeaders = readingData[0];
    const tsIdx = readingHeaders.indexOf('timestamp');
    const ruserIdIdx = readingHeaders.indexOf('userId');
    const rsurahIdx = readingHeaders.indexOf('surahNumber');

    let readingsToday = 0;
    const activeUsersThisWeek = new Set();
    const surahReadCount = {};

    for (let i = 1; i < readingData.length; i++) {
      const timestamp = new Date(readingData[i][tsIdx]);
      const dateStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd');

      // Bacaan hari ini
      if (dateStr === todayStr) {
        readingsToday++;
      }

      // Pengguna aktif minggu ini
      if (timestamp >= weekAgo) {
        activeUsersThisWeek.add(readingData[i][ruserIdIdx]);
      }

      // Hitung surah terpopuler
      const surahNum = readingData[i][rsurahIdx];
      surahReadCount[surahNum] = (surahReadCount[surahNum] || 0) + 1;
    }

    // Top 10 surah terpopuler
    const topSurahs = Object.keys(surahReadCount)
      .map(function(surah) { return { surahNumber: parseInt(surah), count: surahReadCount[surah] }; })
      .sort(function(a, b) { return b.count - a.count; })
      .slice(0, 10);

    // --- Total Donasi ---
    let totalDonations = 0;
    try {
      const donationSheet = getSheet_(SHEET_NAMES.DONATIONS);
      const donationData = donationSheet.getDataRange().getValues();
      totalDonations = Math.max(0, donationData.length - 1);
    } catch (e) {
      // Sheet donasi belum ada
    }

    return {
      success: true,
      data: {
        totalUsers: totalUsers,
        usersByRole: {
          admin: adminCount,
          pembaca: pembacaCount,
          pengajar: pengajarCount
        },
        readingsToday: readingsToday,
        activeUsersThisWeek: activeUsersThisWeek.size,
        totalDonations: totalDonations,
        topSurahs: topSurahs,
        generatedAt: now.toISOString()
      }
    };
  } catch (error) {
    Logger.log('Error getAdminStats: ' + error.message);
    return { success: false, error: 'Gagal mengambil statistik admin: ' + error.message };
  }
}

/**
 * Mengambil daftar semua pengguna (hanya admin).
 * @returns {Object} Daftar semua pengguna.
 */
function getAllUsers() {
  try {
    const sheet = getSheet_(SHEET_NAMES.USERS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];

    const users = [];
    for (let i = 1; i < allData.length; i++) {
      users.push({
        id: allData[i][headers.indexOf('id')],
        name: allData[i][headers.indexOf('name')],
        email: allData[i][headers.indexOf('email')],
        role: allData[i][headers.indexOf('role')],
        createdAt: allData[i][headers.indexOf('createdAt')],
        updatedAt: allData[i][headers.indexOf('updatedAt')]
      });
    }

    // Urutkan berdasarkan waktu registrasi terbaru
    users.sort(function(a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return { success: true, data: users, total: users.length };
  } catch (error) {
    Logger.log('Error getAllUsers: ' + error.message);
    return { success: false, error: 'Gagal mengambil daftar pengguna: ' + error.message };
  }
}

/**
 * Mengubah role pengguna (hanya admin).
 * @param {Object} data - Objek berisi adminUserId, targetUserId, dan newRole.
 * @returns {Object} Hasil perubahan role.
 */
function updateUserRole(data) {
  try {
    const { adminUserId, targetUserId, newRole } = data;

    // Cek apakah user adalah admin
    if (!isAdmin_(adminUserId)) {
      return { success: false, error: 'Akses ditolak. Hanya admin yang dapat mengubah role.' };
    }

    // Validasi role
    const allowedRoles = ['pembaca', 'pengajar', 'admin'];
    if (!newRole || !allowedRoles.includes(newRole.toLowerCase())) {
      return { success: false, error: 'Role tidak valid. Pilihan: pembaca, pengajar, admin.' };
    }

    if (!targetUserId) {
      return { success: false, error: 'targetUserId harus diisi.' };
    }

    const sheet = getSheet_(SHEET_NAMES.USERS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idIdx = headers.indexOf('id');
    const roleIdx = headers.indexOf('role');
    const updatedAtIdx = headers.indexOf('updatedAt');
    const now = new Date().toISOString();

    for (let i = 1; i < allData.length; i++) {
      if (allData[i][idIdx] === targetUserId) {
        sheet.getRange(i + 1, roleIdx + 1).setValue(newRole.toLowerCase());
        sheet.getRange(i + 1, updatedAtIdx + 1).setValue(now);

        return {
          success: true,
          message: 'Role berhasil diubah menjadi ' + newRole.toLowerCase() + '.',
          data: { userId: targetUserId, newRole: newRole.toLowerCase() }
        };
      }
    }

    return { success: false, error: 'Pengguna tidak ditemukan.' };
  } catch (error) {
    Logger.log('Error updateUserRole: ' + error.message);
    return { success: false, error: 'Gagal mengubah role: ' + error.message };
  }
}


// ============================================================
// 10. FUNGSI HELPER
// ============================================================

/**
 * Mengambil sheet berdasarkan nama dari spreadsheet yang sudah dikonfigurasi.
 * Jika sheet belum ada, akan dibuat secara otomatis dengan header yang sesuai.
 * @param {string} sheetName - Nama sheet.
 * @returns {Sheet} Objek sheet.
 * @private
 */
function getSheet_(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);

  // Jika sheet belum ada, buat dengan header yang sesuai
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);

    // Tentukan header berdasarkan nama sheet
    const headersMap = {
      'Users': ['id', 'name', 'email', 'password', 'role', 'createdAt', 'updatedAt'],
      'ReadingHistory': ['id', 'userId', 'surahNumber', 'ayahFrom', 'ayahTo', 'ayahCount', 'duration', 'timestamp'],
      'Bookmarks': ['id', 'userId', 'surahNumber', 'ayahNumber', 'surahName', 'createdAt'],
      'Notes': ['id', 'userId', 'surahNumber', 'ayahNumber', 'noteText', 'createdAt', 'updatedAt'],
      'UserSettings': ['id', 'userId', 'fontSize', 'fontFamily', 'showLatin', 'showTranslation', 'theme', 'updatedAt'],
      'Announcements': ['id', 'title', 'content', 'type', 'isActive', 'expiryDate', 'createdBy', 'createdAt', 'updatedAt'],
      'Donations': ['id', 'userId', 'donorName', 'amount', 'message', 'status', 'createdAt'],
      'AppConfig': ['id', 'key', 'value', 'description', 'createdAt', 'updatedAt']
    };

    const headers = headersMap[sheetName];
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      // Format header: tebal dan warna latar
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#4a86c8')
        .setFontColor('#ffffff');

      // Bekukan baris pertama
      sheet.setFrozenRows(1);
    }
  }

  return sheet;
}

/**
 * Menghasilkan ID unik menggunakan UUID.
 * @returns {string} ID unik.
 * @private
 */
function generateId_() {
  return Utilities.getUuid();
}

/**
 * Memformat tanggal ke format Indonesia (dd MMMM yyyy).
 * @param {Date|string} date - Tanggal yang akan diformat.
 * @returns {string} Tanggal dalam format Indonesia.
 * @private
 */
function formatDate_(date) {
  try {
    const d = (typeof date === 'string') ? new Date(date) : date;

    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = ('0' + d.getHours()).slice(-2);
    const minutes = ('0' + d.getMinutes()).slice(-2);

    return day + ' ' + month + ' ' + year + ' ' + hours + ':' + minutes;
  } catch (error) {
    return String(date);
  }
}

/**
 * Memformat durasi dalam menit menjadi string yang mudah dibaca.
 * Contoh: 125 menit -> "2 jam 5 menit"
 * @param {number} minutes - Durasi dalam menit.
 * @returns {string} Durasi yang diformat.
 * @private
 */
function formatDuration_(minutes) {
  if (!minutes || minutes <= 0) return '0 menit';

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) return mins + ' menit';
  if (mins === 0) return hours + ' jam';
  return hours + ' jam ' + mins + ' menit';
}

/**
 * Mengecek apakah pengguna memiliki role admin.
 * @param {string} userId - ID pengguna yang akan dicek.
 * @returns {boolean} True jika admin, false jika bukan.
 * @private
 */
function isAdmin_(userId) {
  try {
    if (!userId) return false;

    const sheet = getSheet_(SHEET_NAMES.USERS);
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idIdx = headers.indexOf('id');
    const roleIdx = headers.indexOf('role');

    for (let i = 1; i < allData.length; i++) {
      if (allData[i][idIdx] === userId) {
        return allData[i][roleIdx] === 'admin';
      }
    }

    return false;
  } catch (error) {
    Logger.log('Error isAdmin_: ' + error.message);
    return false;
  }
}

/**
 * Mengirim response dalam format JSON melalui ContentService.
 * Semua response API menggunakan fungsi ini untuk konsistensi.
 * @param {Object} data - Data yang akan dikirim sebagai JSON.
 * @returns {TextOutput} Response JSON.
 * @private
 */
function sendJsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// FUNGSI INISIALISASI & SETUP
// ============================================================

/**
 * Fungsi untuk menginisialisasi spreadsheet dan semua sheet yang dibutuhkan.
 * Jalankan fungsi ini sekali saat pertama kali setup.
 * Akan membuat semua sheet yang diperlukan beserta header-nya.
 */
function initializeDatabase() {
  try {
    // Pastikan SPREADSHEET_ID sudah diset
    if (!SPREADSHEET_ID) {
      // Buat spreadsheet baru jika belum ada
      const ss = SpreadsheetApp.create('Al-Quran Simple - Database');
      const newId = ss.getId();

      // Simpan ID ke Script Properties
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', newId);

      Logger.log('Spreadsheet baru dibuat dengan ID: ' + newId);
      Logger.log('URL: ' + ss.getUrl());
    }

    // Buat semua sheet yang diperlukan (getSheet_ akan membuat otomatis jika belum ada)
    const sheetNames = Object.values(SHEET_NAMES);
    sheetNames.forEach(function(name) {
      getSheet_(name);
      Logger.log('Sheet "' + name + '" siap.');
    });

    // Buat user admin default jika belum ada
    const usersSheet = getSheet_(SHEET_NAMES.USERS);
    const usersData = usersSheet.getDataRange().getValues();

    if (usersData.length <= 1) {
      // Belum ada user, buat admin default
      const adminId = generateId_();
      const now = new Date().toISOString();
      usersSheet.appendRow([
        adminId,
        'Administrator',
        'admin@alquran.app',
        hashPassword_('admin123'),
        'admin',
        now,
        now
      ]);
      Logger.log('User admin default dibuat. Email: admin@alquran.app, Password: admin123');
      Logger.log('PENTING: Segera ganti password admin setelah login pertama!');
    }

    // Tambahkan config default QRIS jika belum ada
    const configSheet = getSheet_(SHEET_NAMES.APP_CONFIG);
    const configData = configSheet.getDataRange().getValues();
    const now = new Date().toISOString();

    if (configData.length <= 1) {
      configSheet.appendRow([
        generateId_(),
        'qris_image_url',
        '',
        'URL gambar QRIS untuk donasi',
        now,
        now
      ]);
      configSheet.appendRow([
        generateId_(),
        'app_name',
        'Al-Qur\'an Simple',
        'Nama aplikasi',
        now,
        now
      ]);
      configSheet.appendRow([
        generateId_(),
        'app_version',
        '1.0.0',
        'Versi aplikasi',
        now,
        now
      ]);
    }

    Logger.log('Database berhasil diinisialisasi!');
    return { success: true, message: 'Database berhasil diinisialisasi.' };
  } catch (error) {
    Logger.log('Error initializeDatabase: ' + error.message);
    return { success: false, error: 'Gagal inisialisasi database: ' + error.message };
  }
}
