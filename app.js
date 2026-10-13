/* app.js — logika tampilan (Vue 3).
 * Semua data diambil/disimpan lewat window.DataStore (file storage.js).
 */
(function () {
  var createApp = Vue.createApp, ref = Vue.ref, reactive = Vue.reactive, computed = Vue.computed;
  var onMounted = Vue.onMounted, onBeforeUnmount = Vue.onBeforeUnmount;
  var HT = window.HT;
  var store = window.DataStore;

  var MONTHS_ID = 'id-ID';

  createApp({
    setup: function () {
      /* ---------- state ---------- */
      var ready = ref(false);
      var user = ref(null);
      var mode = ref(store.mode);

      // login / daftar
      var authMode = ref('login');
      var form = reactive({ username: '', email: '', password: '' });
      var authError = ref('');
      var authInfo = ref('');
      var authBusy = ref(false);

      // data
      var habits = ref([]);
      var doneMap = ref({});      // { "habitId|YYYY-MM-DD": true }
      var pending = ref({});      // kunci yang sedang disimpan
      var loading = ref(false);
      var loadError = ref('');

      // tampilan
      var tab = ref('today');
      var today = ref(HT.today());
      var selectedDate = ref(today.value);
      var cal = reactive({ y: new Date().getFullYear(), m: new Date().getMonth() });
      var newName = ref('');
      var adding = ref(false);
      var editing = ref(null);
      var confirmDel = ref(null);
      var toast = reactive({ text: '', type: 'info' });
      var toastTimer = null;

      /* ---------- alat bantu ---------- */
      function key(habitId, date) { return habitId + '|' + date; }
      function isDone(habitId, date) { return !!doneMap.value[key(habitId, date)]; }
      function isPending(habitId, date) { return !!pending.value[key(habitId, date)]; }

      function showToast(text, type) {
        toast.text = text;
        toast.type = type || 'info';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.text = ''; }, 3500);
      }

      function errText(e, fallback) {
        return (e && e.message) ? e.message : fallback;
      }

      /* ---------- data ---------- */
      function resetData() {
        habits.value = [];
        doneMap.value = {};
        pending.value = {};
        loadError.value = '';
      }

      async function loadData() {
        loading.value = true;
        loadError.value = '';
        try {
          var results = await Promise.all([store.listHabits(), store.listCompletions()]);
          habits.value = results[0];
          var map = {};
          results[1].forEach(function (c) { map[key(c.habitId, c.date)] = true; });
          doneMap.value = map;
        } catch (e) {
          loadError.value = errText(e, 'Data gagal dimuat.');
        } finally {
          loading.value = false;
        }
      }

      async function init() {
        try {
          user.value = await store.getUser();
          if (user.value) await loadData();
        } catch (e) {
          user.value = null;
        }
        ready.value = true;
      }

      /* ---------- akun ---------- */
      function setAuthMode(m) {
        authMode.value = m;
        authError.value = '';
        authInfo.value = '';
      }

      async function submitAuth() {
        if (authBusy.value) return;
        authError.value = '';
        authInfo.value = '';
        authBusy.value = true;
        try {
          if (authMode.value === 'login') {
            user.value = await store.login({ username: form.username, password: form.password });
          } else if (authMode.value === 'register') {
            user.value = await store.register({ username: form.username, email: form.email, password: form.password });
          }
          // berhasil masuk
          form.password = '';
          tab.value = 'today';
          resetData();
          await loadData();
        } catch (e) {
          authError.value = errText(e, 'Terjadi kesalahan. Coba lagi.');
        } finally {
          authBusy.value = false;
        }
      }

      async function logout() {
        try { await store.logout(); } catch (e) { /* abaikan */ }
        user.value = null;
        resetData();
        form.username = ''; form.email = ''; form.password = '';
        setAuthMode('login');
      }

      /* ---------- kebiasaan ---------- */
      var activeHabits = computed(function () {
        return habits.value.filter(function (h) { return h.status === 'active'; });
      });
      var archivedHabits = computed(function () {
        return habits.value.filter(function (h) { return h.status === 'archived'; });
      });

      async function addHabit() {
        if (adding.value) return;
        adding.value = true;
        try {
          var h = await store.addHabit(newName.value);
          habits.value = habits.value.concat([h]);
          newName.value = '';
          showToast('Kebiasaan ditambahkan.');
        } catch (e) {
          showToast(errText(e, 'Gagal menambah kebiasaan.'), 'error');
        } finally {
          adding.value = false;
        }
      }

      function openEdit(h) {
        editing.value = { id: h.id, name: h.name, status: h.status, error: '', busy: false };
      }

      function replaceHabit(updated) {
        habits.value = habits.value.map(function (h) { return h.id === updated.id ? updated : h; });
      }

      async function saveEdit() {
        var e = editing.value;
        if (!e || e.busy) return;
        e.busy = true; e.error = '';
        try {
          replaceHabit(await store.renameHabit(e.id, e.name));
          editing.value = null;
          showToast('Nama diperbarui.');
        } catch (err) {
          e.error = errText(err, 'Gagal menyimpan.');
          e.busy = false;
        }
      }

      async function toggleArchive() {
        var e = editing.value;
        if (!e || e.busy) return;
        e.busy = true; e.error = '';
        try {
          var next = e.status === 'active' ? 'archived' : 'active';
          replaceHabit(await store.setHabitStatus(e.id, next));
          editing.value = null;
          showToast(next === 'archived' ? 'Kebiasaan diarsipkan.' : 'Kebiasaan diaktifkan kembali.');
        } catch (err) {
          e.error = errText(err, 'Gagal menyimpan.');
          e.busy = false;
        }
      }

      function askDelete() {
        if (!editing.value) return;
        confirmDel.value = { id: editing.value.id, name: editing.value.name, busy: false };
        editing.value = null;
      }

      async function doDelete() {
        var c = confirmDel.value;
        if (!c || c.busy) return;
        c.busy = true;
        try {
          await store.deleteHabit(c.id);
          habits.value = habits.value.filter(function (h) { return h.id !== c.id; });
          var map = {};
          Object.keys(doneMap.value).forEach(function (k) {
            if (k.indexOf(c.id + '|') !== 0) map[k] = true;
          });
          doneMap.value = map;
          confirmDel.value = null;
          showToast('Kebiasaan dihapus.');
        } catch (err) {
          c.busy = false;
          confirmDel.value = null;
          showToast(errText(err, 'Gagal menghapus.'), 'error');
        }
      }

      /* ---------- centang / batal centang ---------- */
      // Tampilan baru berubah SETELAH penyimpanan dikonfirmasi oleh DataStore.
      async function toggle(habit, date) {
        if (date > today.value) return;                 // tidak boleh tanggal masa depan
        var k = key(habit.id, date);
        if (pending.value[k]) return;                   // cegah ketukan ganda
        var want = !isDone(habit.id, date);
        pending.value = Object.assign({}, pending.value, (function () { var o = {}; o[k] = true; return o; })());
        try {
          var res = await store.setCompletion(habit.id, date, want);
          var map = Object.assign({}, doneMap.value);
          if (res.done) map[k] = true; else delete map[k];
          doneMap.value = map;
        } catch (e) {
          showToast(errText(e, 'Perubahan gagal disimpan. Coba lagi.'), 'error');
        } finally {
          var p = Object.assign({}, pending.value);
          delete p[k];
          pending.value = p;
        }
      }

      /* ---------- halaman Hari Ini ---------- */
      var todayLabel = computed(function () {
        return HT.parse(today.value).toLocaleDateString(MONTHS_ID, {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
      });

      var greeting = computed(function () {
        var h = new Date().getHours();
        if (h < 11) return 'Selamat pagi';
        if (h < 15) return 'Selamat siang';
        if (h < 18) return 'Selamat sore';
        return 'Selamat malam';
      });

      var todayDone = computed(function () {
        return activeHabits.value.filter(function (h) { return isDone(h.id, today.value); }).length;
      });

      var percent = computed(function () {
        var total = activeHabits.value.length;
        return total ? Math.round((todayDone.value / total) * 100) : 0;
      });

      function streakOf(h) {
        return HT.streak(function (d) { return isDone(h.id, d); }, today.value);
      }
      function streakText(h) {
        var n = streakOf(h);
        return n > 0 ? 'Streak ' + n + ' hari' : 'Belum ada streak';
      }
      function totalOf(h) {
        var prefix = h.id + '|';
        return Object.keys(doneMap.value).filter(function (k) {
          return k.indexOf(prefix) === 0 && k.slice(prefix.length) <= today.value;
        }).length;
      }

      /* ---------- halaman Riwayat ---------- */
      var weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

      var monthLabel = computed(function () {
        return new Date(cal.y, cal.m, 1).toLocaleDateString(MONTHS_ID, { month: 'long', year: 'numeric' });
      });

      var canNext = computed(function () {
        var now = new Date();
        return cal.y < now.getFullYear() || (cal.y === now.getFullYear() && cal.m < now.getMonth());
      });

      function prevMonth() {
        if (cal.m === 0) { cal.m = 11; cal.y -= 1; } else { cal.m -= 1; }
      }
      function nextMonth() {
        if (!canNext.value) return;
        if (cal.m === 11) { cal.m = 0; cal.y += 1; } else { cal.m += 1; }
      }

      function doneCountOn(date) {
        return activeHabits.value.filter(function (h) { return isDone(h.id, date); }).length;
      }

      var cells = computed(function () {
        var first = new Date(cal.y, cal.m, 1);
        var offset = (first.getDay() + 6) % 7;           // minggu dimulai hari Senin
        var daysInMonth = new Date(cal.y, cal.m + 1, 0).getDate();
        var total = activeHabits.value.length;
        var out = [];
        for (var i = 0; i < offset; i++) out.push(null);
        for (var d = 1; d <= daysInMonth; d++) {
          var date = cal.y + '-' + HT.pad(cal.m + 1) + '-' + HT.pad(d);
          var future = date > today.value;
          var c = future ? 0 : doneCountOn(date);
          var state = '';
          if (!future && total > 0) {
            if (c === total) state = 'all';
            else if (c > 0) state = 'some';
          }
          out.push({
            date: date, day: d, future: future, isToday: date === today.value, state: state,
            label: d + ' ' + monthLabel.value + (state === 'all' ? ', semua selesai' : state === 'some' ? ', sebagian selesai' : '')
          });
        }
        return out;
      });

      var selectedLabel = computed(function () {
        return HT.parse(selectedDate.value).toLocaleDateString(MONTHS_ID, {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
      });
      var selectedDoneList = computed(function () {
        return activeHabits.value.filter(function (h) { return isDone(h.id, selectedDate.value); });
      });
      var selectedTodoList = computed(function () {
        return activeHabits.value.filter(function (h) { return !isDone(h.id, selectedDate.value); });
      });

      function openHistory() {
        tab.value = 'history';
        var d = HT.parse(selectedDate.value);
        cal.y = d.getFullYear();
        cal.m = d.getMonth();
      }

      // Pesan singkat dihapus saat berpindah tab agar tidak menutupi isi halaman.
      Vue.watch(tab, function () { toast.text = ''; });

      /* ---------- pergantian hari ---------- */
      // Jika aplikasi dibiarkan terbuka melewati tengah malam, tanggal ikut diperbarui.
      function refreshToday() {
        var now = HT.today();
        if (now !== today.value) {
          var wasToday = selectedDate.value === today.value;
          today.value = now;
          if (wasToday) selectedDate.value = now;
        }
      }
      var timer = null;
      function onVisible() { if (!document.hidden) refreshToday(); }
      onMounted(function () {
        init();
        timer = setInterval(refreshToday, 30000);
        document.addEventListener('visibilitychange', onVisible);
      });
      onBeforeUnmount(function () {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
      });

      return {
        ready: ready, user: user, mode: mode,
        authMode: authMode, form: form, authError: authError, authInfo: authInfo, authBusy: authBusy,
        setAuthMode: setAuthMode, submitAuth: submitAuth, logout: logout,
        habits: habits, activeHabits: activeHabits, archivedHabits: archivedHabits,
        loading: loading, loadError: loadError, loadData: loadData,
        tab: tab, today: today, selectedDate: selectedDate,
        newName: newName, adding: adding, addHabit: addHabit,
        editing: editing, openEdit: openEdit, saveEdit: saveEdit, toggleArchive: toggleArchive,
        confirmDel: confirmDel, askDelete: askDelete, doDelete: doDelete,
        toast: toast,
        isDone: isDone, isPending: isPending, toggle: toggle,
        todayLabel: todayLabel, greeting: greeting, todayDone: todayDone, percent: percent,
        streakText: streakText, totalOf: totalOf,
        weekdays: weekdays, monthLabel: monthLabel, canNext: canNext, cells: cells,
        prevMonth: prevMonth, nextMonth: nextMonth,
        selectedLabel: selectedLabel, selectedDoneList: selectedDoneList, selectedTodoList: selectedTodoList,
        openHistory: openHistory
      };
    }
  }).mount('#app');

  /* ---------- PWA: daftarkan service worker ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* abaikan */ });
    });
  }
})();
