/*
 * Salin URL Project dan anon/publishable key dari Supabase Dashboard:
 * Project Settings -> API. Anon key memang aman dipasang di aplikasi browser;
 * jangan pernah memasukkan service_role key di sini.
 */
window.SUPABASE_CONFIG = {
  url: 'https://sbblhyihjlttkawljhru.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiYmxoeWloamx0dGthd2xqaHJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NjczNzUsImV4cCI6MjEwNzQ0MzM3NX0.DRk4Fg3sznxJROx_daVL1UwA-JfVz90udqWV8W7AR7w'
};

window.supabaseClient = null;
if (window.supabase &&
    window.SUPABASE_CONFIG.url.indexOf('https://') === 0 &&
    window.SUPABASE_CONFIG.anonKey.indexOf('PASTE_') !== 0) {
  window.supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
}
