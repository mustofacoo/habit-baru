/* utils.js
 * Fungsi tanggal dan streak. Semua tanggal memakai KALENDER LOKAL pengguna
 * dengan format teks "YYYY-MM-DD" (misal "2026-10-13"), bukan UTC,
 * sehingga tidak bergeser karena zona waktu.
 */
(function () {
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // Date -> "YYYY-MM-DD" (kalender lokal)
  function fmt(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // "YYYY-MM-DD" -> Date (jam 00:00 lokal)
  function parse(s) {
    var p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  // Tanggal hari ini (lokal)
  function today() {
    return fmt(new Date());
  }

  // Geser tanggal sebanyak n hari (aman terhadap perubahan jam musim panas)
  function addDays(s, n) {
    var d = parse(s);
    d.setDate(d.getDate() + n);
    return fmt(d);
  }

  /* Streak = jumlah hari kalender berturut-turut kebiasaan diselesaikan.
   * - isDone(date) -> true/false
   * - Jika hari ini belum dicentang, streak tetap dihitung dari kemarin
   *   (hari ini masih bisa diselesaikan, jadi streak belum putus).
   * - Tanggal masa depan tidak pernah dihitung.
   */
  function streak(isDone, todayStr) {
    var d = isDone(todayStr) ? todayStr : addDays(todayStr, -1);
    var count = 0;
    // batas 3660 hari (10 tahun) agar tidak pernah loop tanpa akhir
    while (count < 3660 && isDone(d)) {
      count++;
      d = addDays(d, -1);
    }
    return count;
  }

  var HT = { pad: pad, fmt: fmt, parse: parse, today: today, addDays: addDays, streak: streak };

  if (typeof window !== 'undefined') window.HT = HT;
  if (typeof module !== 'undefined') module.exports = HT;
})();
