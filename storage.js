/* storage.js  —  LAPISAN DATA
 *
 * Semua akses data aplikasi lewat objek DataStore di bawah ini.
 * Mode cloud memakai Supabase bila dikonfigurasi; tanpa konfigurasi, aplikasi
 * tetap memakai localStorage di perangkat ini.
 *
 * Semua fungsi bersifat async (mengembalikan Promise) agar sama dengan Supabase.
 * Jika gagal, fungsi melempar Error dengan pesan berbahasa Indonesia.
 */
(function () {
  var DB_KEY = 'habit_tracker_db_v1';
  var SESSION_KEY = 'habit_tracker_session_v1';

  /* ---------- alat bantu internal ---------- */

  function emptyDb() {
    return { users: [], habits: [], completions: [] };
  }

  function loadDb() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      var db = raw ? JSON.parse(raw) : emptyDb();
      db.users = db.users || [];
      db.habits = db.habits || [];
      db.completions = db.completions || [];
      return db;
    } catch (e) {
      throw new Error('Data di perangkat ini tidak bisa dibaca.');
    }
  }

  function saveDb(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      throw new Error('Gagal menyimpan. Penyimpanan perangkat mungkin penuh atau diblokir.');
    }
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function randomSalt() {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return Math.random().toString(36).slice(2);
  }

  // Hash kata sandi (SHA-256 + salt). Hanya untuk mode lokal.
  // Hash kata sandi hanya dipakai oleh mode lokal.
  async function hashPassword(password, salt) {
    var text = salt + ':' + password;
    if (window.crypto && crypto.subtle) {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    }
    return 'plain:' + text; // cadangan jika browser tidak mendukung crypto.subtle
  }

  function localToday() {
    return window.HT.today();
  }

  function publicUser(u) {
    return { id: u.id, username: u.username, email: u.email };
  }

  function sessionUserId() {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch (e) {
      return null;
    }
  }

  function requireUser(db) {
    var id = sessionUserId();
    var user = db.users.find(function (u) { return u.id === id; });
    if (!user) throw new Error('Sesi login berakhir. Silakan masuk kembali.');
    return user;
  }

  function cleanName(name) {
    var n = String(name || '').replace(/\s+/g, ' ').trim();
    if (!n) throw new Error('Nama kebiasaan tidak boleh kosong.');
    if (n.length > 60) throw new Error('Nama kebiasaan maksimal 60 karakter.');
    return n;
  }

  function checkDuplicateName(db, userId, name, exceptId) {
    var lower = name.toLowerCase();
    var dup = db.habits.some(function (h) {
      return h.ownerId === userId && h.id !== exceptId && h.name.toLowerCase() === lower;
    });
    if (dup) throw new Error('Kebiasaan dengan nama itu sudah ada.');
  }

  function checkDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Tanggal tidak valid.');
    if (date > localToday()) throw new Error('Tidak bisa menandai tanggal yang belum tiba.');
  }

  /* ---------- Supabase ---------- */

  function cloudEnabled() { return !!window.supabaseClient; }

  function cloud() {
    if (!cloudEnabled()) throw new Error('Supabase belum dikonfigurasi. Isi supabase-config.js terlebih dahulu.');
    return window.supabaseClient;
  }

  function throwCloud(error) {
    if (error) throw new Error(error.message || 'Permintaan ke Supabase gagal.');
  }

  function cloudUser(user) {
    if (!user) return null;
    return { id: user.id, username: (user.user_metadata && user.user_metadata.username) || user.email, email: user.email };
  }

  function fromCloudHabit(h) {
    return { id: h.id, ownerId: h.owner_id, name: h.name, status: h.status, createdAt: h.created_at };
  }

  /* ---------- API yang dipakai aplikasi ---------- */

  var DataStore = {
    // Otomatis cloud setelah URL dan anon key di supabase-config.js diisi.
    // Data lokal lama tidak dihapus dan tetap tersedia bila konfigurasi belum diisi.
    get mode() { return cloudEnabled() ? 'cloud' : 'local'; },

    /* ===== AKUN ===== */

    // Daftar akun baru, langsung masuk jika konfirmasi email tidak diwajibkan.
    // SUPABASE: supabase.auth.signUp({ email, password, options: { data: { username } } })
    register: async function (input) {
      var username = String(input.username || '').trim();
      var email = String(input.email || '').trim().toLowerCase();
      var password = String(input.password || '');

      if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) {
        throw new Error('Username 3–20 karakter: huruf, angka, titik, atau garis bawah.');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Format email tidak valid.');
      }
      if (password.length < 8) {
        throw new Error('Kata sandi minimal 8 karakter.');
      }

      if (cloudEnabled()) {
        var result = await cloud().auth.signUp({
          email: email,
          password: password,
          options: { data: { username: username } }
        });
        throwCloud(result.error);
        if (!result.data.session) {
          throw new Error('Akun dibuat. Periksa email Anda untuk mengonfirmasi akun, lalu masuk dengan email dan kata sandi.');
        }
        localStorage.setItem(SESSION_KEY, result.data.user.id); // cache kecil; sesi asli dikelola Supabase di localStorage
        return cloudUser(result.data.user);
      }

      var db = loadDb();
      if (db.users.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) {
        throw new Error('Username sudah dipakai.');
      }
      if (db.users.some(function (u) { return u.email === email; })) {
        throw new Error('Email sudah terdaftar.');
      }

      var salt = randomSalt();
      var user = {
        id: uid(),
        username: username,
        email: email,
        salt: salt,
        passwordHash: await hashPassword(password, salt),
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      saveDb(db);
      localStorage.setItem(SESSION_KEY, user.id);
      return publicUser(user);
    },

    // Mode lokal masuk dengan username; mode cloud masuk dengan email.
    login: async function (input) {
      var username = String(input.username || '').trim().toLowerCase();
      var password = String(input.password || '');
      if (cloudEnabled()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
          throw new Error('Pada mode Supabase, masukkan email Anda untuk masuk.');
        }
        var result = await cloud().auth.signInWithPassword({ email: username, password: password });
        throwCloud(result.error);
        localStorage.setItem(SESSION_KEY, result.data.user.id);
        return cloudUser(result.data.user);
      }
      var db = loadDb();
      var user = db.users.find(function (u) { return u.username.toLowerCase() === username; });
      var hash = user ? await hashPassword(password, user.salt) : null;
      if (!user || hash !== user.passwordHash) {
        throw new Error('Username atau kata sandi salah.');
      }
      localStorage.setItem(SESSION_KEY, user.id);
      return publicUser(user);
    },

    // Keluar.
    // SUPABASE: supabase.auth.signOut()
    logout: async function () {
      if (cloudEnabled()) {
        var result = await cloud().auth.signOut();
        throwCloud(result.error);
      }
      localStorage.removeItem(SESSION_KEY);
    },

    // Pengguna yang sedang login (atau null). Dipanggil saat aplikasi dibuka.
    // SUPABASE: supabase.auth.getSession() — sesi tetap aktif otomatis.
    getUser: async function () {
      if (cloudEnabled()) {
        var result = await cloud().auth.getUser();
        if (result.error || !result.data.user) return null;
        localStorage.setItem(SESSION_KEY, result.data.user.id);
        return cloudUser(result.data.user);
      }
      var db = loadDb();
      var id = sessionUserId();
      var user = db.users.find(function (u) { return u.id === id; });
      return user ? publicUser(user) : null;
    },

    /* ===== KEBIASAAN ===== */
    // Bentuk data: { id, ownerId, name, createdAt, status: 'active' | 'archived' }

    // SUPABASE: supabase.from('habits').select('*').order('created_at')
    listHabits: async function () {
      if (cloudEnabled()) {
        var result = await cloud().from('habits').select('id, owner_id, name, status, created_at').order('created_at');
        throwCloud(result.error);
        return result.data.map(fromCloudHabit);
      }
      var db = loadDb();
      var user = requireUser(db);
      return db.habits
        .filter(function (h) { return h.ownerId === user.id; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; })
        .map(function (h) { return Object.assign({}, h); });
    },

    // SUPABASE: supabase.from('habits').insert({ name }).select().single()
    addHabit: async function (name) {
      if (cloudEnabled()) {
        name = cleanName(name);
        var result = await cloud().from('habits').insert({ name: name }).select('id, owner_id, name, status, created_at').single();
        throwCloud(result.error);
        return fromCloudHabit(result.data);
      }
      var db = loadDb();
      var user = requireUser(db);
      name = cleanName(name);
      checkDuplicateName(db, user.id, name, null);
      var habit = {
        id: uid(),
        ownerId: user.id,
        name: name,
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      db.habits.push(habit);
      saveDb(db);
      return Object.assign({}, habit);
    },

    // SUPABASE: supabase.from('habits').update({ name }).eq('id', id)
    renameHabit: async function (id, name) {
      if (cloudEnabled()) {
        name = cleanName(name);
        var result = await cloud().from('habits').update({ name: name }).eq('id', id).select('id, owner_id, name, status, created_at').single();
        throwCloud(result.error);
        return fromCloudHabit(result.data);
      }
      var db = loadDb();
      var user = requireUser(db);
      var habit = db.habits.find(function (h) { return h.id === id && h.ownerId === user.id; });
      if (!habit) throw new Error('Kebiasaan tidak ditemukan.');
      name = cleanName(name);
      checkDuplicateName(db, user.id, name, id);
      habit.name = name;
      saveDb(db);
      return Object.assign({}, habit);
    },

    // status: 'active' atau 'archived'
    // SUPABASE: supabase.from('habits').update({ status }).eq('id', id)
    setHabitStatus: async function (id, status) {
      if (status !== 'active' && status !== 'archived') throw new Error('Status tidak valid.');
      if (cloudEnabled()) {
        var result = await cloud().from('habits').update({ status: status }).eq('id', id).select('id, owner_id, name, status, created_at').single();
        throwCloud(result.error);
        return fromCloudHabit(result.data);
      }
      var db = loadDb();
      var user = requireUser(db);
      var habit = db.habits.find(function (h) { return h.id === id && h.ownerId === user.id; });
      if (!habit) throw new Error('Kebiasaan tidak ditemukan.');
      habit.status = status;
      saveDb(db);
      return Object.assign({}, habit);
    },

    // Hapus kebiasaan beserta seluruh riwayatnya.
    // SUPABASE: supabase.from('habits').delete().eq('id', id)
    //           (riwayat ikut terhapus jika tabel completions memakai "on delete cascade")
    deleteHabit: async function (id) {
      if (cloudEnabled()) {
        var result = await cloud().from('habits').delete().eq('id', id);
        throwCloud(result.error);
        return;
      }
      var db = loadDb();
      var user = requireUser(db);
      var exists = db.habits.some(function (h) { return h.id === id && h.ownerId === user.id; });
      if (!exists) throw new Error('Kebiasaan tidak ditemukan.');
      db.habits = db.habits.filter(function (h) { return h.id !== id; });
      db.completions = db.completions.filter(function (c) { return c.habitId !== id; });
      saveDb(db);
    },

    /* ===== RIWAYAT PENYELESAIAN ===== */
    // Bentuk data: { habitId, date: 'YYYY-MM-DD' }

    listCompletions: async function () {
      if (cloudEnabled()) {
        var result = await cloud().from('completions').select('habit_id, date');
        throwCloud(result.error);
        return result.data.map(function (c) { return { habitId: c.habit_id, date: c.date }; });
      }
      var db = loadDb();
      var user = requireUser(db);
      return db.completions
        .filter(function (c) { return c.userId === user.id; })
        .map(function (c) { return { habitId: c.habitId, date: c.date }; });
    },

    // Tandai (done=true) atau batalkan (done=false). Aman dipanggil berulang:
    // tidak pernah membuat catatan ganda untuk kebiasaan + tanggal yang sama.
    setCompletion: async function (habitId, date, done) {
      checkDate(date);
      if (cloudEnabled()) {
        var userResult = await cloud().auth.getUser();
        throwCloud(userResult.error);
        if (!userResult.data.user) throw new Error('Sesi login berakhir. Silakan masuk kembali.');
        var result;
        if (done) {
          result = await cloud().from('completions').upsert(
            { user_id: userResult.data.user.id, habit_id: habitId, date: date },
            { onConflict: 'user_id,habit_id,date' }
          );
        } else {
          result = await cloud().from('completions').delete().eq('habit_id', habitId).eq('date', date);
        }
        throwCloud(result.error);
        return { habitId: habitId, date: date, done: !!done };
      }
      var db = loadDb();
      var user = requireUser(db);
      var habit = db.habits.find(function (h) { return h.id === habitId && h.ownerId === user.id; });
      if (!habit) throw new Error('Kebiasaan tidak ditemukan.');

      var others = db.completions.filter(function (c) {
        return !(c.habitId === habitId && c.date === date);
      });
      if (done) {
        others.push({
          id: uid(),
          userId: user.id,
          habitId: habitId,
          date: date,
          createdAt: new Date().toISOString()
        });
      }
      db.completions = others;
      saveDb(db);
      return { habitId: habitId, date: date, done: !!done };
    }
  };

  if (typeof window !== 'undefined') window.DataStore = DataStore;
  if (typeof module !== 'undefined') module.exports = DataStore;
})();
