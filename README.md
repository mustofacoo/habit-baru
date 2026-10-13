# Habit Tracker (Vue + PWA)

Aplikasi pencatat kebiasaan harian. Tanpa instalasi rumit: tidak ada Node, npm, atau build.
Vue dan font Montserrat sudah ada di dalam folder, jadi aplikasi juga jalan offline.

## Isi folder

| File | Fungsi |
|---|---|
| `index.html` | Susunan tampilan |
| `style.css` | Warna dan gaya (warna ada di bagian `:root` paling atas) |
| `app.js` | Logika tampilan |
| `storage.js` | Lapisan data: localStorage sebagai mode cadangan atau Supabase bila dikonfigurasi |
| `supabase-config.js` | Tempat mengisi URL project dan anon/publishable key Supabase |
| `supabase-schema.sql` | Tabel, keamanan RLS, dan trigger profil untuk dijalankan sekali di Supabase |
| `utils.js` | Perhitungan tanggal lokal dan streak |
| `sw.js`, `manifest.webmanifest`, `icons/` | Bagian PWA (bisa dipasang di layar utama) |
| `vendor/`, `fonts/` | Vue dan Montserrat |

## 1. Mencoba di komputer

Aplikasi harus dibuka lewat server kecil (tidak bisa dengan klik dua kali pada `index.html`).

**Cara termudah (jika ada Python):** buka terminal/CMD di dalam folder ini, lalu jalankan:

```
python -m http.server 8000
```

Buka `http://localhost:8000` di browser.

**Alternatif:** di VS Code pasang ekstensi *Live Server*, klik kanan `index.html` → *Open with Live Server*.

## 2. Menaruhnya online (gratis) agar bisa dibuka dari HP

Karena hanya berisi file statis, cukup di-upload ke salah satu layanan ini:

- **Netlify**: buka app.netlify.com/drop, lalu seret seluruh folder ini ke halaman itu. Selesai, Anda mendapat alamat `https://...netlify.app`.
- **GitHub Pages** atau **Cloudflare Pages**: juga gratis.

Alamat harus **https** supaya aplikasi bisa dipasang sebagai PWA (hosting di atas otomatis https).

## 3. Memasang di HP

- **Android (Chrome):** menu ⋮ → *Instal aplikasi* / *Tambahkan ke layar utama*.
- **iPhone (Safari):** tombol Bagikan → *Tambahkan ke Layar Utama*.
- **Komputer (Chrome/Edge):** ikon pasang di kolom alamat.

## 4. Setelah mengubah file

Jika Anda mengedit file aplikasi, buka `sw.js` dan naikkan `VERSI` (`'v1'` → `'v2'`) sebelum meng-upload ulang, agar HP pengguna mengambil versi terbaru.

## Yang perlu Anda ketahui tentang mode lokal sekarang

- Akun dan data tersimpan **hanya di browser perangkat itu**. Belum ada sinkronisasi antarperangkat dan belum benar-benar "banyak pengguna online". Itu baru terwujud setelah pindah ke Supabase.
- Beberapa akun di satu browser bisa dibuat dan datanya terpisah, tetapi ini hanya untuk uji coba.
- Reset kata sandi tidak tersedia di aplikasi. Pengguna perlu menghubungi admin bila membutuhkan perubahan kata sandi.
- Menghapus data browser (cache/site data) akan menghapus semua data lokal.
- Jangan memakai kata sandi asli Anda yang penting pada mode lokal.

## Menghubungkan Supabase

1. Buat project di [Supabase](https://supabase.com). Di **Authentication → Providers**, aktifkan Email. Untuk pengujian cepat Anda dapat mematikan *Confirm email*; untuk produksi biarkan aktif dan siapkan template email. Reset kata sandi dilakukan admin dari Supabase Dashboard, bukan dari aplikasi.
2. Buka **SQL Editor**, buat query baru, lalu tempel dan jalankan seluruh isi `supabase-schema.sql`. File ini membuat tabel `profiles`, `habits`, dan `completions`, termasuk Row Level Security (RLS), sehingga tiap akun hanya dapat melihat maupun mengubah datanya sendiri.
3. Di **Project Settings → API**, salin *Project URL* dan **anon/publishable key** ke `supabase-config.js`. Jangan pernah memakai atau memasukkan `service_role key` ke aplikasi browser.
4. Di **Authentication → URL Configuration**, isi *Site URL* dengan alamat aplikasi, lalu tambahkan URL yang sama ke *Redirect URLs*. Saat pengembangan, tambahkan juga `http://localhost:8000`.
5. Naikkan file ke hosting HTTPS. Setelah konfigurasi diisi, mode aplikasi otomatis menjadi `cloud`.

Pada mode Supabase, pengguna mendaftar dengan username, email, dan kata sandi. Masuk dilakukan menggunakan **email** dan kata sandi karena Supabase Auth mengautentikasi dengan email. Username tetap tersimpan pada profil dan ditampilkan di aplikasi.

Sesi Supabase memakai localStorage browser (`persistSession: true`), sehingga perangkat yang sudah login tidak perlu login lagi sampai pengguna menekan **Keluar**, sesi kedaluwarsa, atau data situs browser dihapus. Database localStorage lama tidak dihapus; ia tetap sebagai cadangan data lama, tetapi data baru di mode cloud disimpan di Supabase. Aplikasi mematok `@supabase/supabase-js` ke versi `2.117.3` agar deployment tidak berubah diam-diam ketika versi baru dirilis.
