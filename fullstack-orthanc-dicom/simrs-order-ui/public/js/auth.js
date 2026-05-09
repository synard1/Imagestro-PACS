// auth.js - Authentication dan login functions
// =====================================================

// Implementasi login: kirim ke backend UI dan simpan token
async function login(e) {
  const { qs, toast, state } = window.Utils;
  
  try {
    e?.preventDefault?.();
  } catch {}
  const username = (qs("#username")?.value || "").trim();
  const password = qs("#password")?.value || "";
  const btn = qs("#btn-login");
  const statusEl = qs("#login-status");

  if (!username || !password) {
    if (statusEl) statusEl.textContent = "Isi username dan password";
    toast("Username dan password wajib diisi", "error");
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Login...";
    }
    if (statusEl) statusEl.textContent = "";

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || `Login gagal (${res.status})`);
    }
    const token = data?.access_token || data?.token;
    if (!token) throw new Error("Token tidak ditemukan dalam respon");

    // Simpan token dan update state
    localStorage.setItem("simrs_auth_token", token);
    state.token = token;

    if (statusEl) statusEl.textContent = "Login berhasil";
    toast("Login berhasil", "success");

    // Fetch lokasi setelah login
    try {
      // await fetchSatusehatLocations();
    } catch {}
  } catch (err) {
    console.error("Login error:", err);
    if (statusEl) statusEl.textContent = "Login gagal";
    toast("Login gagal: " + (err?.message || err), "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Login";
    }
  }
}

async function fetchConfig() {
  const { state, qs } = window.Utils;
  
  try {
    const res = await fetch("/config");
    const json = await res.json();
    state.gatewayBase = json.gateway_base || "http://103.42.117.19:8888";
    const gb = qs("#gateway_base");
    if (gb) gb.value = state.gatewayBase;
  } catch (e) {
    console.warn("Failed to get config", e);
  }
}

// Export functions
window.Auth = {
  login,
  fetchConfig
};