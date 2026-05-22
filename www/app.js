const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.enableClosingConfirmation?.(); }
const initData = tg?.initData || "";

// ===== Détection du contexte =====
const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform?.());
const isTelegram = !!tg && !!initData;

// Base URL du serveur (en mode standalone, lue depuis localStorage)
let API_BASE = "";
if (isCapacitor || !isTelegram) {
  API_BASE = localStorage.getItem("server_url") || "";
}

function setApiBase(url) {
  url = (url || "").replace(/\/+$/, "");
  API_BASE = url;
  localStorage.setItem("server_url", url);
}

// ===== Écran de setup 1er lancement =====
async function showSetupScreen() {
  const screen = document.getElementById("setup-screen");
  if (!screen) return;
  screen.classList.remove("hidden");
  document.getElementById("main").style.display = "none";
  document.getElementById("tabs")?.style && (document.getElementById("tabs").style.display = "none");
  if (API_BASE) document.getElementById("setup-url").value = API_BASE;

  document.getElementById("setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = document.getElementById("setup-url").value.trim();
    const err = document.getElementById("setup-error");
    err.classList.add("hidden");
    if (!/^https:\/\//.test(url)) {
      err.textContent = "L'URL doit commencer par https://";
      err.classList.remove("hidden");
      return;
    }
    const clean = url.replace(/\/+$/, "");
    try {
      const r = await fetch(clean + "/api/health", { headers: { "Accept": "application/json" } });
      if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`);
      setApiBase(clean);
      screen.classList.add("hidden");
      document.getElementById("main").style.display = "";
      const tabs = document.getElementById("tabs");
      if (tabs) tabs.style.display = "";
      loadDiscover();
    } catch (e2) {
      err.textContent = "Connexion impossible: " + e2.message;
      err.classList.remove("hidden");
    }
  }, { once: true });
}

// Déclencher le setup si on est hors Telegram et qu'aucune URL n'est sauvée
if (!isTelegram && !API_BASE) {
  document.addEventListener("DOMContentLoaded", showSetupScreen);
}

// ============== HELPERS ==============

function toast(msg, kind = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + kind;
  setTimeout(() => el.className = "toast " + kind, 2200);
}
function haptic(kind = "success") { tg?.HapticFeedback?.notificationOccurred?.(kind); }
function hapticLight() { tg?.HapticFeedback?.impactOccurred?.("light"); }

async function api(path, options = {}) {
  const url = API_BASE ? (API_BASE + path) : path;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(initData ? { "X-Telegram-Init-Data": initData } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const PLATS = {
  vinted: { emoji: "🟢", name: "Vinted" },
  leboncoin: { emoji: "🔵", name: "Leboncoin" },
};

const ACCENTS = ["--accent-1", "--accent-2", "--accent-3", "--accent-4", "--accent-5", "--accent-6"];
function accentFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(${ACCENTS[h % ACCENTS.length]})`;
}

function iconFor(keyword) {
  const k = (keyword || "").toLowerCase();
  const rules = [
    [/\b(iphone|samsung|pixel|xiaomi|huawei|smartphone|phone|mobile)\b/, "📱"],
    [/\b(airpods|écouteurs|ecouteurs|casque|bose|sennheiser|jbl|airpod)\b/, "🎧"],
    [/\b(ps5|ps4|xbox|switch|nintendo|console|playstation|manette)\b/, "🎮"],
    [/\b(macbook|laptop|portable|thinkpad|dell|hp|asus|surface)\b/, "💻"],
    [/\b(rtx|gtx|gpu|carte graphique|cpu|ryzen|i7|i9|ssd|ram)\b/, "🖥️"],
    [/\b(camera|appareil photo|canon|nikon|sony alpha|fuji|leica|gopro)\b/, "📷"],
    [/\b(velo|vélo|bike|btwin|trek|specialized|gravel)\b/, "🚴"],
    [/\b(ipad|tablette|tablet|galaxy tab)\b/, "📲"],
    [/\b(watch|montre|garmin|fitbit|apple watch)\b/, "⌚"],
    [/\b(tv|téléviseur|televiseur|écran|ecran|moniteur)\b/, "📺"],
    [/\b(drone|dji|mavic)\b/, "🚁"],
    [/\b(jordan|nike|adidas|sneakers|baskets|stussy|supreme)\b/, "👟"],
    [/\b(vêtement|vetement|veste|manteau|jean|pull|chemise)\b/, "👕"],
  ];
  for (const [rx, emoji] of rules) if (rx.test(k)) return emoji;
  return "🎯";
}

function openListing(a) {
  hapticLight();
  // Marque automatiquement comme "Vu" si pas encore d'action
  if (!a.status || a.status === "new") {
    patchAlert(a.ts, { status: "seen" }).catch(() => {});
  }
  const url = a.url;
  if (!url) return;
  // Préférer l'ouverture externe (navigateur système)
  if (tg?.openLink) {
    tg.openLink(url, { try_instant_view: false });
  } else {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      // Bloqué par popup blocker → fallback
      location.href = url;
    }
  }
}

function timeAgo(ts) {
  const d = Math.max(1, Math.floor(Date.now() / 1000) - ts);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}min`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}j`;
}

// ============== PARSE URL (paste import) ==============

function parseListingUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("vinted")) {
      // Vinted: search URL ?search_text=... ou item URL avec slug
      const q = u.searchParams.get("search_text");
      if (q) return { keyword: q, platform: "vinted", source: "search" };
      // Item URL: /items/123-xxx-yyy → on prend les segments après l'ID
      const m = u.pathname.match(/\/items\/\d+-(.+?)(?:\?|$)/);
      if (m) {
        const slug = decodeURIComponent(m[1]).replace(/-/g, " ");
        return { keyword: slug, platform: "vinted", source: "item" };
      }
      return null;
    }
    if (u.hostname.includes("leboncoin")) {
      const q = u.searchParams.get("text");
      if (q) return { keyword: q, platform: "leboncoin", source: "search" };
      // /ad/categorie/12345 ou /v/.../12345 — pas de mot-clé exploitable
      const segs = u.pathname.split("/").filter(Boolean);
      if (segs.length >= 2) {
        // Le slug d'annonce est souvent en avant-dernier
        const slug = segs[segs.length - 2];
        if (slug && isNaN(parseInt(slug))) {
          return { keyword: slug.replace(/-/g, " "), platform: "leboncoin", source: "item" };
        }
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

// ============== STATE ==============

let cachedWatchlists = [];
let cachedDiscover = [];
let activeDiscoverFilter = "all";
let activeSort = "recent";
let priceFilter = { min: 0, max: null };
let searchQuery = "";
let knownAlertTs = new Set();  // pour détecter les nouvelles annonces

let watchlistFilter = null;  // si défini, filtre le feed Plans

function gotoDiscoverFor(watchlistName) {
  watchlistFilter = watchlistName;
  // Switch onglet vers Plans
  document.querySelector('nav#tabs button[data-target="discover"]').click();
  // Reset les chips à "all" et applique le filtre
  document.querySelectorAll("#discover-chips .chip").forEach(c => {
    c.classList.toggle("active", c.dataset.filter === "all");
  });
  activeDiscoverFilter = "all";
  // Ajoute un chip dynamique pour le filtre actif
  showWatchlistFilterChip(watchlistName);
  renderDiscover();
}

function showWatchlistFilterChip(name) {
  let chip = document.getElementById("active-wl-chip");
  if (!chip) {
    chip = document.createElement("div");
    chip.id = "active-wl-chip";
    chip.className = "active-wl-chip";
    const chips = document.getElementById("discover-chips");
    chips.parentElement.insertBefore(chip, chips.nextSibling);
  }
  chip.innerHTML = `<span>🎯 Filtre: <b>${escapeHtml(name)}</b></span> <button>✕</button>`;
  chip.querySelector("button").addEventListener("click", () => {
    watchlistFilter = null;
    chip.remove();
    renderDiscover();
    hapticLight();
  });
}

// ============== ONGLETS ==============

document.querySelectorAll("nav#tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    document.querySelectorAll("nav#tabs button").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.dataset.tab === target));
    hapticLight();
    if (target === "discover") loadDiscover();
    if (target === "watchlists") loadWatchlists();
    if (target === "stats") loadStats();
    if (target === "settings") loadSettings();
  });
});

// ============== HEALTH PILL ==============

let _lastHealthFail = false;
async function refreshHealth() {
  try {
    const h = await api("/api/health");
    _lastHealthFail = false;
    const pill = document.getElementById("health-pill");
    if (!pill) return;
    const dot = pill.querySelector(".pulse");
    const txt = pill.querySelector(".pill-text");
    if (h.bot_alive) {
      dot.classList.remove("offline");
      txt.textContent = h.last_poll_ts ? `En ligne · il y a ${timeAgo(h.last_poll_ts)}` : "En ligne";
    } else {
      dot.classList.add("offline");
      txt.textContent = "Bot hors-ligne";
    }
  } catch (e) {
    // ignore les flash réseau ponctuels
    if (_lastHealthFail) {
      const pill = document.getElementById("health-pill");
      if (pill) {
        pill.querySelector(".pulse")?.classList.add("offline");
        pill.querySelector(".pill-text").textContent = "Hors-ligne";
      }
    }
    _lastHealthFail = true;
  }
}

// ============== DÉCOUVRIR ==============

document.querySelectorAll("#discover-chips .chip").forEach(c => {
  c.addEventListener("click", () => {
    document.querySelectorAll("#discover-chips .chip").forEach(x => x.classList.toggle("active", x === c));
    activeDiscoverFilter = c.dataset.filter;
    hapticLight();
    renderDiscover();
  });
});

document.getElementById("sort-select").addEventListener("change", (e) => {
  activeSort = e.target.value;
  renderDiscover();
});

function filterAndSort() {
  const now = Math.floor(Date.now() / 1000);
  const today0 = now - 86400;
  const five = now - 300;

  let list = cachedDiscover.filter(a => {
    if (priceFilter.min > 0 && a.price < priceFilter.min) return false;
    if (priceFilter.max != null && a.price > priceFilter.max) return false;
    if (watchlistFilter && a.watchlist !== watchlistFilter) return false;
    switch (activeDiscoverFilter) {
      case "today": return a.ts >= today0;
      case "new5": return a.ts >= five;
      case "deal": return a.below_market_pct >= 10;
      case "vinted": return a.platform === "vinted";
      case "leboncoin": return a.platform === "leboncoin";
      case "starred": return a.starred;
      default: return true;
    }
  });

  switch (activeSort) {
    case "price-asc": list.sort((a, b) => a.price - b.price); break;
    case "price-desc": list.sort((a, b) => b.price - a.price); break;
    case "deal": list.sort((a, b) => (b.below_market_pct || 0) - (a.below_market_pct || 0)); break;
    default: list.sort((a, b) => b.ts - a.ts); break;
  }
  return list;
}

let cachedPollInterval = 60;

function renderDiscover(animateNew = false) {
  const container = document.getElementById("discover");
  const list = filterAndSort();
  const now = Math.floor(Date.now() / 1000);

  if (!cachedDiscover.length) {
    container.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">🕒</div>Aucune annonce détectée pour l'instant.<br><small>Le bot scanne toutes les ${cachedPollInterval}s. Reviens dans une minute.</small></div>`;
    return;
  }
  if (!list.length) {
    container.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">📭</div>Rien pour ce filtre</div>`;
    return;
  }
  container.innerHTML = "";
  list.forEach(a => {
    const div = document.createElement("div");
    div.className = "discover-card";
    if (animateNew && !knownAlertTs.has(a.ts)) div.classList.add("is-new");
    if (a.status === "missed") div.style.opacity = "0.55";

    const img = a.image
      ? `<img src="${escapeHtml(a.image)}" alt="" onerror="this.parentElement.innerHTML='<div class=noimg>📦</div>'">`
      : `<div class="noimg">📦</div>`;

    const isRecent = (now - a.ts) <= 300;
    const newBadge = isRecent ? '<span class="discover-new-badge">⚡ NEW</span>' : "";

    let dealTag = "";
    if (a.below_market_pct >= 30) dealTag = `<span class="discover-deal-tag fire">🔥 -${a.below_market_pct}% marché</span>`;
    else if (a.below_market_pct >= 10) dealTag = `<span class="discover-deal-tag">📉 -${a.below_market_pct}% marché</span>`;
    else if (a.discount_pct >= 30) dealTag = `<span class="discover-deal-tag fire">🔥 -${a.discount_pct}%</span>`;

    let statusTag = "";
    if (a.status === "bought") statusTag = '<span class="discover-status-tag bought">Acheté</span>';
    else if (a.status === "missed") statusTag = '<span class="discover-status-tag missed">Raté</span>';
    else if (a.status === "seen") statusTag = '<span class="discover-status-tag">Vu</span>';

    const marketPrice = a.market_price && a.below_market_pct > 0
      ? `<span class="discover-market">${Math.round(a.market_price)}€</span>`
      : "";

    div.innerHTML = `
      <div class="discover-img">
        ${img}
        <span class="discover-plat-badge">${PLATS[a.platform]?.emoji || ""} ${PLATS[a.platform]?.name || ""}</span>
        ${newBadge}
        <button class="discover-star-toggle ${a.starred ? 'active' : ''}" data-act="star" aria-label="Favori">★</button>
        <button class="discover-menu-toggle" data-act="menu" aria-label="Menu">⋯</button>
        ${dealTag}
        ${statusTag}
      </div>
      <div class="discover-body">
        <div class="discover-title">${escapeHtml(a.title)}</div>
        <div class="discover-price-row">
          <span class="discover-price">${Number(a.price).toFixed(0)}€</span>
          ${marketPrice}
        </div>
        <div class="discover-meta">${escapeHtml(a.watchlist || "")} · il y a ${timeAgo(a.ts)}${a.location ? " · 📍" + escapeHtml(a.location) : ""}</div>
      </div>
    `;
    // Click sur la card = ouvre l'annonce direct
    div.addEventListener("click", (e) => {
      if (e.target.closest("[data-act=star]") || e.target.closest("[data-act=menu]")) return;
      openListing(a);
    });
    // Long-press = menu (mobile)
    let pressTimer = null;
    div.addEventListener("touchstart", (e) => {
      if (e.target.closest("button")) return;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        haptic("warning");
        openSheet(a);
      }, 450);
    }, { passive: true });
    div.addEventListener("touchend", () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
    div.addEventListener("touchmove", () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });

    div.querySelector("[data-act=star]").addEventListener("click", async (e) => {
      e.stopPropagation();
      hapticLight();
      await patchAlert(a.ts, { starred: !a.starred });
    });
    div.querySelector("[data-act=menu]").addEventListener("click", (e) => {
      e.stopPropagation();
      hapticLight();
      openSheet(a);
    });
    container.appendChild(div);
  });

  // Mémorise les ts vus
  cachedDiscover.forEach(a => knownAlertTs.add(a.ts));
}

async function loadDiscover({ silent = false } = {}) {
  const container = document.getElementById("discover");
  try {
    const [d, stats, h] = await Promise.all([
      api("/api/discover?limit=120"),
      api("/api/stats"),
      api("/api/health"),
    ]);

    // Détecte les nouvelles annonces (par ts) pour notif
    const previousTs = new Set(cachedDiscover.map(a => a.ts));
    const fresh = d.listings.filter(a => !previousTs.has(a.ts));

    cachedDiscover = d.listings;
    cachedPollInterval = h.poll_interval || 60;
    const deals = d.listings.filter(a => a.below_market_pct >= 10).length;
    document.getElementById("hs-today").textContent = stats.today_count || 0;
    document.getElementById("hs-deals").textContent = deals;
    document.getElementById("hs-total").textContent = stats.total_alerts || 0;

    if (silent && fresh.length && previousTs.size > 0) {
      // Notifie sans repeindre tout: bouton flottant "↑ X nouvelles"
      showNewToast(fresh.length);
      pingTitle(fresh.length);
    } else {
      renderDiscover(true);
    }
    refreshHealth();
  } catch (e) {
    if (!silent) {
      container.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">⚠️</div>Erreur: ${escapeHtml(e.message)}<br><small>Ouvre cette page depuis Telegram.</small></div>`;
    }
  }
}

// Notif "↑ X nouvelles annonces" en haut
let _newToastCount = 0;
function showNewToast(count) {
  _newToastCount += count;
  const el = document.getElementById("new-toast");
  el.classList.remove("hidden");
  el.classList.add("show");
  document.getElementById("new-toast-count").textContent = _newToastCount;
}
document.getElementById("new-toast").addEventListener("click", () => {
  _newToastCount = 0;
  document.getElementById("new-toast").classList.remove("show");
  document.getElementById("new-toast").classList.add("hidden");
  haptic("success");
  // Refresh + scroll up + animation flashIn
  renderDiscover(true);
  window.scrollTo({ top: 0, behavior: "smooth" });
  resetTitle();
});

// Title flash (favicon "(N) Deals Bot")
const _origTitle = document.title;
function pingTitle(count) {
  document.title = `(${_newToastCount}) ${_origTitle}`;
}
function resetTitle() { document.title = _origTitle; }

// ============== PRICE FILTER MODAL ==============

const priceModal = document.getElementById("price-modal");
document.getElementById("price-filter-btn").addEventListener("click", () => {
  document.getElementById("pr-min").value = priceFilter.min || 0;
  document.getElementById("pr-max").value = priceFilter.max || "";
  priceModal.classList.remove("hidden");
});
document.getElementById("price-modal-close").addEventListener("click", () => priceModal.classList.add("hidden"));
priceModal.addEventListener("click", (e) => { if (e.target === priceModal) priceModal.classList.add("hidden"); });
document.getElementById("pr-reset").addEventListener("click", () => {
  priceFilter = { min: 0, max: null };
  document.getElementById("price-range-label").textContent = "Tous";
  document.getElementById("price-filter-btn").classList.remove("active");
  priceModal.classList.add("hidden");
  renderDiscover();
});
document.getElementById("pr-apply").addEventListener("click", () => {
  const mn = parseFloat(document.getElementById("pr-min").value) || 0;
  const mx = document.getElementById("pr-max").value ? parseFloat(document.getElementById("pr-max").value) : null;
  priceFilter = { min: mn, max: mx };
  const label = `${mn}€ - ${mx ?? "∞"}€`;
  document.getElementById("price-range-label").textContent = (mn === 0 && mx == null) ? "Tous" : label;
  document.getElementById("price-filter-btn").classList.toggle("active", !(mn === 0 && mx == null));
  priceModal.classList.add("hidden");
  renderDiscover();
  hapticLight();
});

// ============== WATCHLISTS ==============

function watchlistMatchesSearch(w, q) {
  if (!q) return true;
  return (w.name + " " + w.keyword).toLowerCase().includes(q.toLowerCase());
}

function renderWatchlists() {
  const container = document.getElementById("watchlists");
  const items = cachedWatchlists.filter(w => watchlistMatchesSearch(w, searchQuery));
  if (!cachedWatchlists.length) {
    container.innerHTML = `<div class="empty"><div class="big">📭</div>Aucune watchlist<br><small>Appuie sur + en bas à droite</small></div>`;
    return;
  }
  if (!items.length) {
    container.innerHTML = `<div class="empty"><div class="big">🔍</div>Aucun résultat</div>`;
    return;
  }
  container.innerHTML = "";
  items.forEach(w => {
    const realIdx = cachedWatchlists.indexOf(w);
    const div = document.createElement("div");
    div.className = "watchlist-item" + (w.paused ? " paused" : "");
    div.style.setProperty("--accent", accentFor(w.name));
    const plats = (w.platforms || []).map(p => PLATS[p]?.emoji || "").join(" ");
    const excl = (w.excluded_keywords || []);
    const loc = w.location_filter ? ` · 📍 ${escapeHtml(w.location_filter)}` : "";
    const exclHtml = excl.length ? `<div class="wl-excluded">🚫 ${escapeHtml(excl.slice(0, 4).join(", "))}${excl.length > 4 ? "…" : ""}</div>` : "";
    const todayCount = cachedCounts[w.name] || 0;
    const countBadge = todayCount > 0
      ? `<span class="wl-count-badge" title="alertes aujourd'hui">+${todayCount}</span>`
      : "";
    div.innerHTML = `
      <div class="wl-icon" style="background:${accentFor(w.name)}">${iconFor(w.keyword)}</div>
      <div class="wl-info">
        <div class="wl-name">${escapeHtml(w.name)} ${countBadge} ${w.paused ? '<span class="wl-paused-badge">pause</span>' : ''}</div>
        <div class="wl-meta">"${escapeHtml(w.keyword)}" · <b>${w.min_price || 0}€–${w.max_price}€</b> · ${plats}${loc}</div>
        ${exclHtml}
      </div>
      <div class="wl-actions">
        <button class="icon-btn" data-idx="${realIdx}" data-act="toggle">${w.paused ? '▶️' : '⏸️'}</button>
        <button class="icon-btn" data-idx="${realIdx}" data-act="edit">✏️</button>
        <button class="icon-btn delete" data-idx="${realIdx}" data-act="delete">✕</button>
      </div>
    `;
    // Click sur la card (pas les boutons) → ouvre Plans filtré
    div.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      gotoDiscoverFor(w.name);
    });
    container.appendChild(div);
  });
  container.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const act = btn.dataset.act;
      hapticLight();
      if (act === "toggle") togglePause(idx);
      else if (act === "edit") openModal(cachedWatchlists[idx], idx);
      else if (act === "delete") deleteWatchlist(idx);
    });
  });
}

async function togglePause(idx) {
  try {
    const res = await api(`/api/watchlists/${idx}/toggle`, { method: "POST" });
    cachedWatchlists = res.watchlists;
    renderWatchlists();
    haptic("success");
  } catch (e) { toast("Erreur: " + e.message, "error"); }
}

async function deleteWatchlist(idx) {
  const ask = (cb) => tg?.showConfirm ? tg.showConfirm("Supprimer cette watchlist ?", cb) : cb(confirm("Supprimer ?"));
  ask(async (ok) => {
    if (!ok) return;
    try {
      const res = await api(`/api/watchlists/${idx}`, { method: "DELETE" });
      cachedWatchlists = res.watchlists;
      renderWatchlists();
      toast("Supprimée", "success");
      haptic("warning");
    } catch (e) { toast("Erreur: " + e.message, "error"); }
  });
}

let cachedCounts = {};

async function loadWatchlists() {
  try {
    const [wl, counts] = await Promise.all([
      api("/api/watchlists"),
      api("/api/watchlists/counts").catch(() => ({})),
    ]);
    cachedWatchlists = wl.watchlists;
    cachedCounts = counts || {};
    renderWatchlists();
  } catch (e) {
    document.getElementById("watchlists").innerHTML =
      `<div class="empty"><div class="big">⚠️</div>Erreur: ${escapeHtml(e.message)}</div>`;
  }
}

const searchInput = document.getElementById("search");
searchInput.addEventListener("input", (e) => { searchQuery = e.target.value; renderWatchlists(); });

// ============== MODALE WATCHLIST ==============

const modal = document.getElementById("modal");
const form = document.getElementById("watchlist-form");

function openModal(wl = null, idx = -1) {
  document.getElementById("modal-title").textContent = wl ? "✏️ Modifier" : "✨ Nouvelle watchlist";
  form.reset();
  form.idx.value = idx;
  if (wl) {
    form.name.value = wl.name;
    form.keyword.value = wl.keyword;
    form.min_price.value = wl.min_price || 0;
    form.max_price.value = wl.max_price;
    form.location_filter.value = wl.location_filter || "";
    form.excluded_keywords.value = (wl.excluded_keywords || []).join(", ");
    form.querySelectorAll('input[name="platforms"]').forEach(cb => {
      cb.checked = (wl.platforms || []).includes(cb.value);
    });
  } else {
    form.min_price.value = 0;
    form.querySelectorAll('input[name="platforms"]').forEach(cb => cb.checked = true);
  }
  modal.classList.remove("hidden");
}

function closeModal() { modal.classList.add("hidden"); }
document.getElementById("add-btn").addEventListener("click", () => { openModal(); hapticLight(); });
document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

// Paste import (lien Vinted/LBC → watchlist auto)
document.getElementById("paste-btn").addEventListener("click", async () => {
  hapticLight();
  let txt = "";
  try {
    txt = await navigator.clipboard.readText();
  } catch {
    const v = prompt("Colle ici une URL Vinted ou Leboncoin :");
    if (!v) return;
    txt = v;
  }
  const parsed = parseListingUrl(txt.trim());
  if (!parsed) {
    toast("URL non reconnue (Vinted/Leboncoin uniquement)", "error");
    haptic("error");
    return;
  }
  // Pré-remplit
  form.name.value = parsed.keyword.split(/\s+/).slice(0, 3).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
  form.keyword.value = parsed.keyword;
  form.querySelectorAll('input[name="platforms"]').forEach(cb => {
    cb.checked = (cb.value === parsed.platform);
  });
  form.max_price.focus();
  toast(`✓ Mot-clé extrait : "${parsed.keyword}"`, "success");
  haptic("success");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  const data = new FormData(form);
  const idx = parseInt(data.get("idx"), 10);
  const platforms = Array.from(form.querySelectorAll('input[name="platforms"]:checked')).map(el => el.value);
  const excluded = String(data.get("excluded_keywords") || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const payload = {
    name: data.get("name"),
    keyword: data.get("keyword"),
    min_price: parseFloat(data.get("min_price") || "0"),
    max_price: parseFloat(data.get("max_price")),
    platforms,
    location_filter: data.get("location_filter") || "",
    excluded_keywords: excluded,
  };
  try {
    const url = idx >= 0 ? `/api/watchlists/${idx}` : "/api/watchlists";
    const method = idx >= 0 ? "PUT" : "POST";
    const res = await api(url, { method, body: JSON.stringify(payload) });
    cachedWatchlists = res.watchlists;
    renderWatchlists();
    closeModal();
    toast(idx >= 0 ? "Modifiée" : "✨ Ajoutée", "success");
    haptic("success");
  } catch (err) {
    toast("Erreur: " + err.message, "error");
    haptic("error");
  } finally {
    btn.disabled = false;
  }
});

// ============== BOTTOM SHEET ==============

const sheet = document.getElementById("alert-sheet");
let sheetAlert = null;

function openSheet(alert) {
  sheetAlert = alert;
  document.getElementById("sheet-title").textContent = alert.title || "Action";
  document.getElementById("sheet-star-icon").textContent = alert.starred ? "⭐" : "☆";
  document.getElementById("sheet-star-text").textContent = alert.starred ? "Retirer des favoris" : "Ajouter aux favoris";
  sheet.classList.remove("hidden");
  hapticLight();
}
function closeSheet() { sheet.classList.add("hidden"); sheetAlert = null; }

document.getElementById("sheet-close").addEventListener("click", closeSheet);
sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

async function patchAlert(ts, patch) {
  try {
    const res = await api(`/api/alerts/${ts}`, { method: "PATCH", body: JSON.stringify(patch) });
    const i = cachedDiscover.findIndex(a => a.ts === ts);
    if (i >= 0) cachedDiscover[i] = { ...cachedDiscover[i], ...res.alert };
    renderDiscover();
    haptic("success");
  } catch (e) { toast("Erreur: " + e.message, "error"); }
}

document.querySelectorAll(".sheet-btn").forEach(b => {
  b.addEventListener("click", async () => {
    if (!sheetAlert) return;
    const act = b.dataset.act;
    const ts = sheetAlert.ts;
    closeSheet();
    if (act === "open") {
      openListing(sheetAlert);
    } else if (act === "toggle-star") {
      await patchAlert(ts, { starred: !sheetAlert.starred });
      toast(sheetAlert.starred ? "Retiré des favoris" : "⭐ Ajouté aux favoris", "success");
    } else if (act.startsWith("status-")) {
      const status = act.replace("status-", "");
      await patchAlert(ts, { status });
      const labels = { bought: "🛒 Acheté", missed: "❌ Raté", seen: "👁️ Vu", new: "↩️ Réinitialisé" };
      toast(labels[status] || "OK", "success");
    }
  });
});

// ============== STATS ==============

function renderChart(days) {
  const max = Math.max(1, ...days);
  const w = 100 / days.length;
  const dayLabels = ["−6j", "−5j", "−4j", "−3j", "−2j", "Hier", "Auj."];
  const bars = days.map((v, i) => {
    const h = Math.max(2, (v / max) * 80);
    return `
      <div class="chart-bar-wrap" title="${v} alertes">
        <div class="chart-bar" style="height:${h}%; background: ${v > 0 ? 'var(--grad-button)' : 'var(--bg-elev2)'}"></div>
        <div class="chart-bar-val">${v || ""}</div>
        <div class="chart-bar-label">${dayLabels[i]}</div>
      </div>`;
  }).join("");
  return `<div class="chart">${bars}</div>`;
}

async function loadStats() {
  const container = document.getElementById("stats-detail");
  container.innerHTML = '<div class="empty">Chargement...</div>';
  try {
    const [s, ch] = await Promise.all([
      api("/api/stats"),
      api("/api/chart").catch(() => ({ days: [0,0,0,0,0,0,0] })),
    ]);
    const chartHtml = `<div class="card-modern"><h3>📈 7 derniers jours</h3>${renderChart(ch.days)}</div>`;
    let bestHtml = "";
    if (s.best_deal) {
      const bd = s.best_deal;
      bestHtml = `
        <div class="card-modern" style="background:linear-gradient(135deg, var(--accent-4), var(--accent-5)); border:none; color:white">
          <h3 style="color:rgba(255,255,255,0.85)">🏆 Meilleur deal</h3>
          <div style="font-weight:600; font-size:15px; margin-bottom:6px">${escapeHtml(bd.title)}</div>
          <div style="font-size:32px; font-weight:800">-${bd.discount_pct}%<span style="font-size:18px; font-weight:500; margin-left:8px">à ${Number(bd.price).toFixed(0)}€</span></div>
          <div style="font-size:12px; opacity:0.9; margin-top:6px">${escapeHtml(bd.watchlist)} · ${PLATS[bd.platform]?.emoji || ""} ${bd.platform}</div>
        </div>`;
    }
    const byWlEntries = Object.entries(s.alerts_by_watchlist || {}).sort((a, b) => b[1] - a[1]);
    const byWlMax = Math.max(1, ...byWlEntries.map(e => e[1]));
    const byWl = byWlEntries.map(([k, v]) => `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(k)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v / byWlMax * 100).toFixed(1)}%"></div></div>
        <div class="bar-count">${v}</div>
      </div>`).join("") || '<div class="empty" style="padding:8px">Aucune alerte</div>';
    const total = s.total_alerts || 1;
    const v = s.alerts_by_platform?.vinted || 0;
    const l = s.alerts_by_platform?.leboncoin || 0;
    container.innerHTML = `
      ${chartHtml}
      <div class="stat-cards">
        <div class="stat-card accent"><div class="stat-card-label">Total alertes</div><div class="stat-card-value">${s.total_alerts || 0}</div><div class="stat-card-sub">depuis le début</div></div>
        <div class="stat-card"><div class="stat-card-label">Aujourd'hui</div><div class="stat-card-value">${s.today_count || 0}</div><div class="stat-card-sub">${s.week_count || 0} cette semaine</div></div>
        <div class="stat-card"><div class="stat-card-label">⭐ Favoris</div><div class="stat-card-value">${s.starred_count || 0}</div><div class="stat-card-sub">sauvegardées</div></div>
        <div class="stat-card"><div class="stat-card-label">Items vus</div><div class="stat-card-value">${(s.vinted_seen || 0) + (s.leboncoin_seen || 0)}</div><div class="stat-card-sub">V:${s.vinted_seen || 0} · L:${s.leboncoin_seen || 0}</div></div>
      </div>
      ${bestHtml}
      <div class="card-modern">
        <h3>Par plateforme</h3>
        <div class="bar-row"><div class="bar-label">🟢 Vinted</div><div class="bar-track"><div class="bar-fill" style="width:${(v / total * 100).toFixed(0)}%"></div></div><div class="bar-count">${v}</div></div>
        <div class="bar-row"><div class="bar-label">🔵 Leboncoin</div><div class="bar-track"><div class="bar-fill" style="width:${(l / total * 100).toFixed(0)}%"></div></div><div class="bar-count">${l}</div></div>
      </div>
      <div class="card-modern"><h3>Par watchlist</h3>${byWl}</div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty"><div class="big">⚠️</div>Erreur: ${escapeHtml(e.message)}</div>`;
  }
}

// ============== RÉGLAGES ==============

async function loadSettings() {
  try {
    const r = await api("/api/settings");
    const f = document.getElementById("settings-form");
    f.poll_interval.value = r.poll_interval || 60;
    f.miniapp_url.value = r.miniapp_url || "";
    const qh = r.settings.quiet_hours || {};
    f.quiet_enabled.checked = !!qh.enabled;
    f.quiet_start.value = qh.start || "00:00";
    f.quiet_end.value = qh.end || "08:00";
    const af = r.settings.anti_flood || {};
    f.af_enabled.checked = af.enabled !== false;
    f.af_threshold.value = af.threshold || 10;
    f.af_window.value = af.window_minutes || 5;
    f.send_photos.checked = r.settings.send_photos !== false;
    f.vinted_enabled.checked = r.settings.vinted_enabled !== false;
    f.default_excluded.value = (r.settings.default_excluded_keywords || []).join(", ");
  } catch (e) { toast("Erreur: " + e.message, "error"); }
}

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    poll_interval: parseInt(f.poll_interval.value, 10),
    miniapp_url: f.miniapp_url.value,
    quiet_hours: { enabled: f.quiet_enabled.checked, start: f.quiet_start.value, end: f.quiet_end.value },
    anti_flood: { enabled: f.af_enabled.checked, threshold: parseInt(f.af_threshold.value, 10), window_minutes: parseInt(f.af_window.value, 10) },
    send_photos: f.send_photos.checked,
    vinted_enabled: f.vinted_enabled.checked,
    default_excluded_keywords: f.default_excluded.value.split(",").map(s => s.trim()).filter(Boolean),
  };
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
    toast("✅ Réglages enregistrés", "success");
    haptic("success");
  } catch (err) { toast("Erreur: " + err.message, "error"); }
});

document.getElementById("clear-alerts-btn").addEventListener("click", () => {
  const ask = (cb) => tg?.showConfirm ? tg.showConfirm("Vider tout l'historique ?", cb) : cb(confirm("Vider ?"));
  ask(async (ok) => {
    if (!ok) return;
    try {
      await api("/api/alerts?confirm=yes", { method: "DELETE" });
      toast("Historique vidé", "success");
      cachedDiscover = [];
      renderDiscover();
    } catch (e) { toast("Erreur: " + e.message, "error"); }
  });
});

// ============== PULL TO REFRESH ==============

let ptrStart = 0;
let ptrTriggered = false;

document.addEventListener("touchstart", (e) => {
  if (window.scrollY > 0) return;
  if (!document.querySelector('.tab[data-tab="discover"]').classList.contains("active")) return;
  ptrStart = e.touches[0].clientY;
  ptrTriggered = false;
}, { passive: true });

document.addEventListener("touchmove", (e) => {
  if (!ptrStart) return;
  const dy = e.touches[0].clientY - ptrStart;
  if (dy > 80 && !ptrTriggered) {
    ptrTriggered = true;
    hapticLight();
    document.body.classList.add("refreshing");
    loadDiscover().finally(() => {
      setTimeout(() => document.body.classList.remove("refreshing"), 400);
    });
  }
}, { passive: true });

document.addEventListener("touchend", () => { ptrStart = 0; });

// ============== INIT + LIVE LOOP ==============

loadDiscover();
setInterval(refreshHealth, 20000);

// Refresh silencieux toutes les 25s quand on est sur Plans
setInterval(() => {
  const onPlans = document.querySelector('.tab[data-tab="discover"]').classList.contains("active");
  if (onPlans) loadDiscover({ silent: true });
}, 25000);

// Reset le titre / toast quand on revient sur la page
window.addEventListener("focus", resetTitle);
