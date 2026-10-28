/**
 * ============================================================
 * SETUP.GS - File Konfigurasi & Inisialisasi Awal
 * Aplikasi Web Al-Qur'an Simple
 * ============================================================
 *
 * File ini berisi semua fungsi yang diperlukan untuk:
 * - Membuat spreadsheet utama beserta semua sheet yang dibutuhkan
 * - Menyiapkan struktur kolom (header) pada setiap sheet
 * - Membuat akun admin default
 * - Membuat contoh pengumuman
 * - Mereset seluruh data (dengan proteksi konfirmasi)
 *
 * CARA PENGGUNAAN:
 * 1. Jalankan fungsi initialSetup() SEKALI saja saat pertama kali deploy
 * 2. Fungsi ini akan membuat semua sheet dan data awal yang diperlukan
 *
 * @author  Al-Qur'an Simple Team
 * @version 1.0
 */

// ============================================================
// KONSTANTA APLIKASI
// ============================================================

/** Nama spreadsheet utama yang akan dibuat */
var SPREADSHEET_NAME = "Al-Quran Simple - Database";

/** Key untuk menyimpan ID spreadsheet di PropertiesService */
var PROP_SPREADSHEET_ID = "QURAN_APP_SPREADSHEET_ID";

/** Key untuk flag konfirmasi reset data */
var PROP_CONFIRM_RESET = "confirmReset";

// ============================================================
// DEFINISI STRUKTUR SHEET
// Setiap sheet didefinisikan dengan nama dan daftar header kolom
// ============================================================

/**
 * Sheet "Users" - Menyimpan data pengguna aplikasi
 * Kolom:
 *  - userId        : ID unik pengguna (UUID)
 *  - email         : Alamat email pengguna (unik)
 *  - password      : Password yang sudah di-hash (SHA-256)
 *  - nama          : Nama lengkap pengguna
 *  - role          : Peran pengguna (pembaca / admin / pengajar)
 *  - avatarUrl     : URL foto profil pengguna
 *  - createdAt     : Tanggal & waktu pendaftaran
 *  - lastLogin     : Tanggal & waktu login terakhir
 */
var SHEET_USERS = {
  name: "Users",
  headers: ["userId", "email", "password", "nama", "role", "avatarUrl", "createdAt", "lastLogin"]
};

/**
 * Sheet "ReadingHistory" - Menyimpan riwayat bacaan Al-Qur'an pengguna
 * Kolom:
 *  - historyId      : ID unik riwayat bacaan
 *  - userId         : ID pengguna yang membaca
 *  - surahNumber    : Nomor surah (1-114)
 *  - surahName      : Nama surah
 *  - ayahFrom       : Ayat mulai dibaca
 *  - ayahTo         : Ayat terakhir dibaca
 *  - readAt         : Tanggal & waktu membaca
 *  - durationMinutes: Durasi membaca dalam menit
 */
var SHEET_READING_HISTORY = {
  name: "ReadingHistory",
  headers: ["historyId", "userId", "surahNumber", "surahName", "ayahFrom", "ayahTo", "readAt", "durationMinutes"]
};

/**
 * Sheet "Bookmarks" - Menyimpan penanda/bookmark ayat pengguna
 * Kolom:
 *  - bookmarkId : ID unik bookmark
 *  - userId     : ID pengguna pemilik bookmark
 *  - surahNumber: Nomor surah yang di-bookmark
 *  - ayahNumber : Nomor ayat yang di-bookmark
 *  - note       : Catatan singkat pada bookmark
 *  - createdAt  : Tanggal & waktu bookmark dibuat
 */
var SHEET_BOOKMARKS = {
  name: "Bookmarks",
  headers: ["bookmarkId", "userId", "surahNumber", "ayahNumber", "note", "createdAt"]
};

/**
 * Sheet "Notes" - Menyimpan catatan pengguna pada ayat tertentu
 * Kolom:
 *  - noteId      : ID unik catatan
 *  - userId      : ID pengguna pemilik catatan
 *  - surahNumber : Nomor surah terkait
 *  - ayahNumber  : Nomor ayat terkait
 *  - content     : Isi catatan
 *  - createdAt   : Tanggal & waktu catatan dibuat
 *  - updatedAt   : Tanggal & waktu catatan terakhir diubah
 */
var SHEET_NOTES = {
  name: "Notes",
  headers: ["noteId", "userId", "surahNumber", "ayahNumber", "content", "createdAt", "updatedAt"]
};

/**
 * Sheet "Settings" - Menyimpan preferensi/pengaturan tampilan pengguna
 * Kolom:
 *  - userId          : ID pengguna
 *  - fontSize        : Ukuran font (contoh: 18)
 *  - fontFamily      : Jenis font (contoh: "Amiri", "Scheherazade")
 *  - showLatin       : Tampilkan transliterasi latin (true/false)
 *  - showTranslation : Tampilkan terjemahan (true/false)
 *  - theme           : Tema tampilan (light/dark)
 *  - language        : Bahasa antarmuka (id/en)
 */
var SHEET_SETTINGS = {
  name: "Settings",
  headers: ["userId", "fontSize", "fontFamily", "showLatin", "showTranslation", "theme", "language", "selectedQori"]
};

/**
 * Sheet "Announcements" - Menyimpan pengumuman/informasi untuk pengguna
 * Kolom:
 *  - announcementId : ID unik pengumuman
 *  - title          : Judul pengumuman
 *  - content        : Isi pengumuman
 *  - imageUrl       : URL gambar pengumuman (opsional)
 *  - isActive       : Status aktif (TRUE/FALSE)
 *  - createdAt      : Tanggal & waktu pengumuman dibuat
 *  - expireAt       : Tanggal & waktu pengumuman kedaluwarsa
 */
var SHEET_ANNOUNCEMENTS = {
  name: "Announcements",
  headers: ["announcementId", "title", "content", "imageUrl", "isActive", "createdAt", "expireAt"]
};

/**
 * Sheet "Donations" - Menyimpan data donasi/infaq pengguna
 * Kolom:
 *  - donationId   : ID unik donasi
 *  - userId       : ID pengguna yang berdonasi
 *  - amount       : Jumlah donasi (dalam Rupiah)
 *  - method       : Metode pembayaran (QRIS, Transfer, dll.)
 *  - qrisImageUrl : URL gambar bukti QRIS (opsional)
 *  - status       : Status donasi (pending/confirmed/rejected)
 *  - createdAt    : Tanggal & waktu donasi dibuat
 */
var SHEET_DONATIONS = {
  name: "Donations",
  headers: ["donationId", "userId", "amount", "method", "qrisImageUrl", "status", "createdAt"]
};

/**
 * Sheet "AppConfig" - Menyimpan konfigurasi umum aplikasi (key-value)
 * Kolom:
 *  - key   : Nama konfigurasi
 *  - value : Nilai konfigurasi
 */
var SHEET_APP_CONFIG = {
  name: "AppConfig",
  headers: ["key", "value"]
};

/** Daftar semua definisi sheet untuk iterasi */
var ALL_SHEETS = [
  SHEET_USERS,
  SHEET_READING_HISTORY,
  SHEET_BOOKMARKS,
  SHEET_NOTES,
  SHEET_SETTINGS,
  SHEET_ANNOUNCEMENTS,
  SHEET_DONATIONS,
  SHEET_APP_CONFIG
];

// ============================================================
// KONFIGURASI DEFAULT APLIKASI
// Nilai-nilai ini akan dimasukkan ke sheet AppConfig
// ============================================================

var DEFAULT_APP_CONFIG = [
  { key: "appName",           value: "Al-Qur'an Simple" },
  { key: "appVersion",        value: "1.0" },
  { key: "qrisImageUrl",      value: "" },
  { key: "adminEmail",        value: "" },
  { key: "welcomeMessage",    value: "Selamat datang di Al-Qur'an Simple" },
  { key: "maxLoginAttempts",  value: "5" }
];


// ============================================================
// FUNGSI UTAMA
// ============================================================

/**
 * initialSetup()
 * ---------------------------------------------------------------
 * Fungsi utama untuk inisialisasi awal aplikasi.
 * Jalankan fungsi ini SEKALI saja saat pertama kali men-deploy aplikasi.
 *
 * Langkah-langkah yang dilakukan:
 * 1. Mendapatkan atau membuat spreadsheet utama
 * 2. Membuat semua sheet beserta header kolom
 * 3. Mengisi data konfigurasi default (AppConfig)
 * 4. Membuat akun admin default
 * 5. Membuat contoh pengumuman
 *
 * Setelah selesai, akan muncul log berisi URL spreadsheet
 * yang dapat diakses untuk melihat data.
 */
function initialSetup() {
  Logger.log("🚀 Memulai inisialisasi Al-Qur'an Simple...");
  Logger.log("================================================");

  // --- Langkah 1: Dapatkan atau buat spreadsheet utama ---
  var ss = getOrCreateSpreadsheet_();
  Logger.log("✅ Spreadsheet siap: " + ss.getUrl());

  // --- Langkah 2: Buat semua sheet dengan header ---
  Logger.log("\n📋 Membuat sheet-sheet yang diperlukan...");
  for (var i = 0; i < ALL_SHEETS.length; i++) {
    var sheetDef = ALL_SHEETS[i];
    createSheet_(sheetDef.name, sheetDef.headers);
    Logger.log("   ✅ Sheet '" + sheetDef.name + "' siap (" + sheetDef.headers.length + " kolom)");
  }

  // --- Langkah 3: Hapus sheet default "Sheet1" jika masih ada ---
  // Google Sheets selalu membuat sheet "Sheet1" secara otomatis saat spreadsheet baru dibuat.
  // Kita hapus karena tidak diperlukan.
  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet) {
    ss.deleteSheet(defaultSheet);
    Logger.log("   🗑️ Sheet default 'Sheet1' dihapus");
  }

  // --- Langkah 4: Isi data konfigurasi default ---
  Logger.log("\n⚙️ Mengisi konfigurasi default...");
  seedDefaultConfig_();
  Logger.log("   ✅ Konfigurasi default berhasil diisi");

  // --- Langkah 5: Buat akun admin default ---
  Logger.log("\n👤 Membuat akun admin default...");
  seedDefaultAdmin_();
  Logger.log("   ✅ Akun admin default berhasil dibuat");

  // --- Langkah 6: Buat contoh pengumuman ---
  Logger.log("\n📢 Membuat contoh pengumuman...");
  seedSampleAnnouncements_();
  Logger.log("   ✅ Contoh pengumuman berhasil dibuat");

  // --- Selesai ---
  Logger.log("\n================================================");
  Logger.log("🎉 Inisialisasi selesai!");
  Logger.log("📊 Buka spreadsheet di: " + ss.getUrl());
  Logger.log("================================================");
}


// ============================================================
// FUNGSI HELPER
// ============================================================

/**
 * getOrCreateSpreadsheet_()
 * ---------------------------------------------------------------
 * Mendapatkan spreadsheet utama yang sudah ada, atau membuat baru
 * jika belum ada. ID spreadsheet disimpan di PropertiesService
 * agar bisa diakses kembali tanpa perlu mencari ulang.
 *
 * Alur kerja:
 * 1. Cek apakah ID spreadsheet sudah tersimpan di PropertiesService
 * 2. Jika sudah ada, coba buka spreadsheet tersebut
 * 3. Jika belum ada atau tidak valid, buat spreadsheet baru
 * 4. Simpan ID spreadsheet baru ke PropertiesService
 *
 * @return {Spreadsheet} Objek Spreadsheet yang siap digunakan
 * @private
 */
function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty(PROP_SPREADSHEET_ID);

  // Coba buka spreadsheet yang sudah ada berdasarkan ID tersimpan
  if (ssId) {
    try {
      var existingSs = SpreadsheetApp.openById(ssId);
      // Verifikasi spreadsheet masih bisa diakses
      existingSs.getName();
      Logger.log("📂 Menggunakan spreadsheet yang sudah ada (ID: " + ssId + ")");
      return existingSs;
    } catch (e) {
      // Spreadsheet tidak ditemukan atau tidak bisa diakses
      // Lanjut ke pembuatan baru
      Logger.log("⚠️ Spreadsheet lama tidak ditemukan, membuat baru...");
    }
  }

  // Buat spreadsheet baru
  var newSs = SpreadsheetApp.create(SPREADSHEET_NAME);
  var newId = newSs.getId();

  // Simpan ID ke PropertiesService agar bisa diakses lagi nanti
  props.setProperty(PROP_SPREADSHEET_ID, newId);

  Logger.log("📝 Spreadsheet baru dibuat (ID: " + newId + ")");
  return newSs;
}


/**
 * createSheet_(sheetName, headers)
 * ---------------------------------------------------------------
 * Membuat sheet baru dengan nama dan header kolom yang diberikan.
 * Jika sheet dengan nama tersebut sudah ada, fungsi ini akan
 * melewatinya tanpa mengubah data yang sudah ada.
 *
 * Fitur tambahan:
 * - Header diberi format tebal (bold), warna latar, dan rata tengah
 * - Kolom pertama (biasanya ID) di-freeze agar selalu terlihat
 * - Baris header di-freeze agar selalu terlihat saat scroll
 *
 * @param {string}   sheetName - Nama sheet yang akan dibuat
 * @param {string[]} headers   - Array berisi nama-nama kolom header
 * @return {Sheet} Objek Sheet yang dibuat atau sudah ada
 * @private
 */
function createSheet_(sheetName, headers) {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);

  // Jika sheet sudah ada, langsung kembalikan tanpa mengubah apapun
  if (sheet) {
    Logger.log("   ℹ️ Sheet '" + sheetName + "' sudah ada, dilewati.");
    return sheet;
  }

  // Buat sheet baru
  sheet = ss.insertSheet(sheetName);

  // Tulis header pada baris pertama
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);

  // --- Format header agar mudah dibaca ---

  // Teks tebal (bold) untuk header
  headerRange.setFontWeight("bold");

  // Warna latar belakang header: hijau tua khas islami
  headerRange.setBackground("#1B5E20");

  // Warna teks header: putih agar kontras
  headerRange.setFontColor("#FFFFFF");

  // Rata tengah secara horizontal
  headerRange.setHorizontalAlignment("center");

  // Ukuran font header sedikit lebih besar
  headerRange.setFontSize(10);

  // --- Freeze baris dan kolom ---

  // Freeze baris pertama (header) agar tetap terlihat saat scroll ke bawah
  sheet.setFrozenRows(1);

  // Freeze kolom pertama (biasanya ID) agar tetap terlihat saat scroll ke kanan
  sheet.setFrozenColumns(1);

  // --- Atur lebar kolom otomatis ---
  // Sesuaikan lebar kolom berdasarkan isi header
  for (var i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
    // Tambahkan sedikit padding pada lebar kolom
    var currentWidth = sheet.getColumnWidth(i);
    sheet.setColumnWidth(i, currentWidth + 30);
  }

  return sheet;
}


/**
 * hashPassword_(plainPassword)
 * ---------------------------------------------------------------
 * Meng-hash password menggunakan algoritma SHA-256.
 * Menggunakan Utilities.computeDigest() bawaan Google Apps Script.
 *
 * Proses:
 * 1. Konversi password plain text ke byte array menggunakan SHA-256
 * 2. Konversi setiap byte ke format hexadecimal (2 digit)
 * 3. Gabungkan semua hex menjadi satu string hash
 *
 * @param {string} plainPassword - Password dalam bentuk plain text
 * @return {string} Hash SHA-256 dalam format hexadecimal (64 karakter)
 * @private
 */
function hashPassword_(plainPassword) {
  // Hitung digest SHA-256 dari password
  var rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    plainPassword,
    Utilities.Charset.UTF_8
  );

  // Konversi byte array ke string hexadecimal
  var hashStr = "";
  for (var i = 0; i < rawHash.length; i++) {
    var byte = rawHash[i];
    // Pastikan byte bernilai positif (0-255)
    if (byte < 0) {
      byte += 256;
    }
    // Konversi ke hex dengan padding nol di depan jika perlu
    var hexByte = byte.toString(16);
    if (hexByte.length === 1) {
      hexByte = "0" + hexByte;
    }
    hashStr += hexByte;
  }

  return hashStr;
}


/**
 * generateUUID_()
 * ---------------------------------------------------------------
 * Membuat UUID (Universally Unique Identifier) v4 secara acak.
 * Digunakan sebagai ID unik untuk setiap record di database.
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * - '4' menandakan versi UUID v4
 * - 'y' adalah salah satu dari: 8, 9, a, atau b
 *
 * @return {string} UUID v4 dalam format standar (36 karakter)
 * @private
 */
function generateUUID_() {
  var template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


/**
 * getCurrentTimestamp_()
 * ---------------------------------------------------------------
 * Mendapatkan timestamp saat ini dalam format ISO 8601.
 * Digunakan untuk mengisi kolom createdAt, updatedAt, dll.
 *
 * Contoh output: "2024-01-15T10:30:00.000Z"
 *
 * @return {string} Timestamp dalam format ISO 8601
 * @private
 */
function getCurrentTimestamp_() {
  return new Date().toISOString();
}


// ============================================================
// FUNGSI SEED DATA
// ============================================================

/**
 * seedDefaultConfig_()
 * ---------------------------------------------------------------
 * Mengisi sheet AppConfig dengan konfigurasi default aplikasi.
 * Hanya mengisi jika sheet AppConfig masih kosong (belum ada data).
 *
 * Konfigurasi yang diisi:
 * - appName          : Nama aplikasi
 * - appVersion       : Versi aplikasi
 * - qrisImageUrl     : URL gambar QRIS untuk donasi
 * - adminEmail       : Email administrator
 * - welcomeMessage   : Pesan selamat datang
 * - maxLoginAttempts : Maksimal percobaan login yang gagal
 *
 * @private
 */
function seedDefaultConfig_() {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_APP_CONFIG.name);

  if (!sheet) {
    Logger.log("   ⚠️ Sheet AppConfig tidak ditemukan. Jalankan initialSetup() terlebih dahulu.");
    return;
  }

  // Cek apakah sudah ada data (selain header)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    Logger.log("   ℹ️ AppConfig sudah memiliki data, dilewati.");
    return;
  }

  // Siapkan data konfigurasi dalam bentuk array 2D
  var configData = [];
  for (var i = 0; i < DEFAULT_APP_CONFIG.length; i++) {
    configData.push([DEFAULT_APP_CONFIG[i].key, DEFAULT_APP_CONFIG[i].value]);
  }

  // Tulis semua konfigurasi sekaligus (lebih efisien daripada satu per satu)
  sheet.getRange(2, 1, configData.length, 2).setValues(configData);
}


/**
 * seedDefaultAdmin_()
 * ---------------------------------------------------------------
 * Membuat akun admin default yang bisa digunakan untuk login
 * pertama kali ke aplikasi.
 *
 * Detail akun default:
 * - Email    : admin@quran.app
 * - Password : admin123 (disimpan dalam bentuk hash SHA-256)
 * - Nama     : Administrator
 * - Role     : admin
 *
 * ⚠️ PENTING: Segera ganti password admin setelah login pertama!
 *
 * Fungsi ini tidak akan membuat akun duplikat jika email
 * admin@quran.app sudah terdaftar di sheet Users.
 *
 * @private
 */
function seedDefaultAdmin_() {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_USERS.name);

  if (!sheet) {
    Logger.log("   ⚠️ Sheet Users tidak ditemukan. Jalankan initialSetup() terlebih dahulu.");
    return;
  }

  // Cek apakah admin sudah ada
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    // Ambil semua data email untuk pengecekan duplikat
    var emailColumn = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < emailColumn.length; i++) {
      if (emailColumn[i][0] === "admin@quran.app") {
        Logger.log("   ℹ️ Akun admin default sudah ada, dilewati.");
        return;
      }
    }
  }

  // Data akun admin default
  var adminData = [
    generateUUID_(),                    // userId
    "admin@quran.app",                  // email
    hashPassword_("admin123"),          // password (hashed SHA-256)
    "Administrator",                    // nama
    "admin",                            // role
    "",                                 // avatarUrl (kosong)
    getCurrentTimestamp_(),              // createdAt
    ""                                  // lastLogin (belum pernah login)
  ];

  // Tulis data admin ke baris berikutnya
  sheet.appendRow(adminData);

  Logger.log("   👤 Akun admin default dibuat:");
  Logger.log("      Email    : admin@quran.app");
  Logger.log("      Password : admin123");
  Logger.log("      ⚠️ Segera ganti password setelah login pertama!");
}


/**
 * seedSampleAnnouncements_()
 * ---------------------------------------------------------------
 * Membuat 3 contoh pengumuman untuk mendemonstrasikan fitur
 * pengumuman di aplikasi.
 *
 * Pengumuman yang dibuat:
 * 1. Selamat Datang - Pengumuman pembukaan aplikasi
 * 2. Fitur Baru - Informasi tentang fitur bookmark & catatan
 * 3. Tips Membaca - Keutamaan membaca Al-Qur'an
 *
 * Fungsi ini hanya akan mengisi data jika sheet Announcements
 * masih kosong (belum ada pengumuman).
 *
 * @private
 */
function seedSampleAnnouncements_() {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_ANNOUNCEMENTS.name);

  if (!sheet) {
    Logger.log("   ⚠️ Sheet Announcements tidak ditemukan. Jalankan initialSetup() terlebih dahulu.");
    return;
  }

  // Cek apakah sudah ada pengumuman
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    Logger.log("   ℹ️ Pengumuman sudah ada, dilewati.");
    return;
  }

  var now = getCurrentTimestamp_();

  // Hitung tanggal kedaluwarsa: 30 hari dari sekarang
  var expireDate = new Date();
  expireDate.setDate(expireDate.getDate() + 30);
  var expireAt = expireDate.toISOString();

  // Hitung tanggal kedaluwarsa: 90 hari dari sekarang (untuk pengumuman jangka panjang)
  var longExpireDate = new Date();
  longExpireDate.setDate(longExpireDate.getDate() + 90);
  var longExpireAt = longExpireDate.toISOString();

  // Data 3 contoh pengumuman
  var announcements = [
    [
      generateUUID_(),                                                        // announcementId
      "🎉 Selamat Datang di Al-Qur'an Simple!",                              // title
      "Alhamdulillah, aplikasi Al-Qur'an Simple kini hadir untuk memudahkan " +
        "Anda dalam membaca dan mempelajari Al-Qur'an. Semoga aplikasi ini " +
        "menjadi wasilah kebaikan bagi kita semua. Jazakumullahu khairan!",   // content
      "",                                                                      // imageUrl
      "TRUE",                                                                  // isActive
      now,                                                                     // createdAt
      longExpireAt                                                             // expireAt
    ],
    [
      generateUUID_(),                                                        // announcementId
      "📌 Fitur Baru: Bookmark & Catatan",                                    // title
      "Kini Anda bisa menandai ayat favorit dengan fitur Bookmark dan " +
        "menambahkan catatan pribadi pada setiap ayat. Fitur ini membantu " +
        "Anda dalam proses hafalan dan tadabbur Al-Qur'an.",                  // content
      "",                                                                      // imageUrl
      "TRUE",                                                                  // isActive
      now,                                                                     // createdAt
      expireAt                                                                 // expireAt
    ],
    [
      generateUUID_(),                                                        // announcementId
      "💡 Tips: Keutamaan Membaca Al-Qur'an",                                // title
      "Rasulullah ﷺ bersabda: \"Bacalah Al-Qur'an, karena sesungguhnya " +
        "Al-Qur'an akan datang pada hari kiamat sebagai pemberi syafaat " +
        "bagi para pembacanya.\" (HR. Muslim). Mari kita rutinkan membaca " +
        "Al-Qur'an setiap hari!",                                            // content
      "",                                                                      // imageUrl
      "TRUE",                                                                  // isActive
      now,                                                                     // createdAt
      longExpireAt                                                             // expireAt
    ]
  ];

  // Tulis semua pengumuman sekaligus
  sheet.getRange(2, 1, announcements.length, announcements[0].length).setValues(announcements);

  Logger.log("   📢 " + announcements.length + " contoh pengumuman berhasil dibuat.");
}


// ============================================================
// FUNGSI RESET DATA
// ============================================================

/**
 * resetAllData()
 * ---------------------------------------------------------------
 * Menghapus SEMUA data di seluruh sheet (kecuali header).
 *
 * ⚠️ PERINGATAN: Fungsi ini akan menghapus semua data secara PERMANEN!
 *
 * Mekanisme proteksi keamanan (2 langkah):
 * ---
 * Langkah 1 - Panggil resetAllData() pertama kali:
 *   → Sistem akan menyimpan flag "confirmReset" di PropertiesService
 *   → Data BELUM dihapus
 *   → Muncul pesan konfirmasi di log
 *
 * Langkah 2 - Panggil resetAllData() KEDUA kalinya (dalam 60 detik):
 *   → Sistem mendeteksi flag konfirmasi sudah ada
 *   → SEMUA data akan dihapus
 *   → Flag konfirmasi dihapus
 *
 * Jika tidak dipanggil dalam 60 detik, flag akan kedaluwarsa
 * dan proses harus diulang dari Langkah 1.
 */
function resetAllData() {
  var props = PropertiesService.getScriptProperties();
  var confirmFlag = props.getProperty(PROP_CONFIRM_RESET);

  // --- Langkah 1: Cek apakah ini panggilan pertama (belum ada konfirmasi) ---
  if (!confirmFlag) {
    // Simpan timestamp konfirmasi
    props.setProperty(PROP_CONFIRM_RESET, new Date().getTime().toString());

    Logger.log("⚠️ ================================================");
    Logger.log("⚠️ PERINGATAN: RESET SEMUA DATA");
    Logger.log("⚠️ ================================================");
    Logger.log("⚠️ Anda akan menghapus SEMUA data di aplikasi.");
    Logger.log("⚠️ Tindakan ini TIDAK BISA dibatalkan!");
    Logger.log("⚠️");
    Logger.log("⚠️ Untuk mengkonfirmasi, jalankan resetAllData()");
    Logger.log("⚠️ sekali lagi dalam waktu 60 detik.");
    Logger.log("⚠️ ================================================");
    return;
  }

  // --- Langkah 2: Verifikasi konfirmasi masih berlaku (dalam 60 detik) ---
  var confirmTime = parseInt(confirmFlag, 10);
  var currentTime = new Date().getTime();
  var elapsedSeconds = (currentTime - confirmTime) / 1000;

  if (elapsedSeconds > 60) {
    // Konfirmasi sudah kedaluwarsa
    props.deleteProperty(PROP_CONFIRM_RESET);
    Logger.log("⏰ Konfirmasi reset sudah kedaluwarsa (lebih dari 60 detik).");
    Logger.log("   Jalankan resetAllData() lagi untuk memulai proses konfirmasi ulang.");
    return;
  }

  // --- Konfirmasi valid, lanjutkan penghapusan data ---
  Logger.log("🗑️ Menghapus semua data...");

  var ss = getOrCreateSpreadsheet_();

  for (var i = 0; i < ALL_SHEETS.length; i++) {
    var sheetName = ALL_SHEETS[i].name;
    var sheet = ss.getSheetByName(sheetName);

    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        // Hapus semua baris data (baris 2 hingga baris terakhir), sisakan header
        sheet.deleteRows(2, lastRow - 1);
        Logger.log("   🗑️ Sheet '" + sheetName + "' - " + (lastRow - 1) + " baris data dihapus");
      } else {
        Logger.log("   ℹ️ Sheet '" + sheetName + "' sudah kosong");
      }
    } else {
      Logger.log("   ⚠️ Sheet '" + sheetName + "' tidak ditemukan");
    }
  }

  // Hapus flag konfirmasi setelah reset berhasil
  props.deleteProperty(PROP_CONFIRM_RESET);

  Logger.log("\n✅ Semua data berhasil dihapus!");
  Logger.log("   Jalankan initialSetup() untuk mengisi ulang data awal.");
}


// ============================================================
// FUNGSI UTILITAS TAMBAHAN
// ============================================================

/**
 * getSpreadsheetUrl()
 * ---------------------------------------------------------------
 * Fungsi bantuan untuk mendapatkan URL spreadsheet utama.
 * Berguna untuk debugging dan pengecekan manual.
 *
 * @return {string} URL spreadsheet atau pesan error
 */
function getSpreadsheetUrl() {
  try {
    var ss = getOrCreateSpreadsheet_();
    var url = ss.getUrl();
    Logger.log("📊 URL Spreadsheet: " + url);
    return url;
  } catch (e) {
    Logger.log("❌ Gagal mendapatkan URL: " + e.message);
    return "Error: " + e.message;
  }
}


/**
 * checkSetupStatus()
 * ---------------------------------------------------------------
 * Memeriksa status inisialisasi aplikasi.
 * Menampilkan informasi apakah semua sheet sudah dibuat
 * dan berapa banyak data yang ada di setiap sheet.
 *
 * Berguna untuk debugging dan memastikan setup berjalan dengan benar.
 */
function checkSetupStatus() {
  Logger.log("📋 Status Inisialisasi Al-Qur'an Simple");
  Logger.log("================================================");

  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty(PROP_SPREADSHEET_ID);

  if (!ssId) {
    Logger.log("❌ Spreadsheet belum dibuat. Jalankan initialSetup() terlebih dahulu.");
    return;
  }

  try {
    var ss = SpreadsheetApp.openById(ssId);
    Logger.log("✅ Spreadsheet ditemukan: " + ss.getName());
    Logger.log("   URL: " + ss.getUrl());
    Logger.log("");

    // Cek setiap sheet
    for (var i = 0; i < ALL_SHEETS.length; i++) {
      var sheetDef = ALL_SHEETS[i];
      var sheet = ss.getSheetByName(sheetDef.name);

      if (sheet) {
        var lastRow = sheet.getLastRow();
        var dataRows = lastRow > 1 ? lastRow - 1 : 0; // Kurangi 1 untuk header
        var status = dataRows > 0 ? "📊 " + dataRows + " data" : "📭 Kosong";
        Logger.log("   ✅ " + sheetDef.name + " - " + status);
      } else {
        Logger.log("   ❌ " + sheetDef.name + " - Belum dibuat");
      }
    }

  } catch (e) {
    Logger.log("❌ Gagal membuka spreadsheet: " + e.message);
    Logger.log("   Coba jalankan initialSetup() untuk membuat ulang.");
  }

  Logger.log("\n================================================");
}
