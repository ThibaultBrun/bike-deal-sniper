const SITE_NAME = "bike Deal Sniper";
const CONTACT_EMAIL = "bikedealsniper@gmail.com";

const TELEGRAM_CHANNEL_URL = "https://t.me/RCZ_watcher_mtb_fr";

// Supabase
const SUPABASE_URL = "https://fgwytagsmcjzrbjhcude.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Qo1qCBUJpKpF5nzOCKFmqw_TrfzU0Hp";
const TABLE_NAME = "deals";
const TOKEN_FIELD = "token";

const TOKEN_HEADER_NAME = "x-deal-token";

// =========================
//  INIT UI
// =========================
document.getElementById("siteName").textContent = SITE_NAME;
document.getElementById("year").textContent = new Date().getFullYear();


let searchQuery_ = "";
let sortMode_ = "discount_desc";
let hideSold_ = false;
let onlyStock0_ = false;



function getTokenFromUrl() {
  const qs = new URLSearchParams(window.location.search);
  let t = qs.get("token");
  if (!t && window.location.hash) {
    const h = window.location.hash.replace(/^#/, "");
    const hp = new URLSearchParams(h);
    t = hp.get("token");
  }
  return (t || "").trim() || null;
}

function renderRightNoToken() {
  const el = document.getElementById("rightPane");
  el.innerHTML = `
        <h3 class="subttl">Produits</h3>
        <p class="muted" style="margin:0; line-height:1.75; font-size:14px;">
          Ce site permet d’accéder aux <strong>deals RCZ en temps réel</strong> : prix, remises, codes promo et lien direct.
        </p>


        <div style="margin-top:12px;">
          <div class="muted" style="font-weight:700; margin-bottom:6px; font-size:13px;">Ce qu’on publie souvent :</div>
          <ul class="list">
            <li><strong>Freins</strong> (Magura/Shimano/Sram, kits avant/arrière, durites, adaptateurs)</li>
            <li><strong>Suspensions</strong> (FOX/ROCKSHOX/MANITOU)</li>
            <li><strong>Roues & pneus</strong> (DT Swiss/Crankbrothers/Mavic)</li>
            <li><strong>Transmission</strong> (SHimano/SRAM/Campgnolo)</li>
          </ul>
        </div>

      `;
}

function renderMissingTokenDeal() {
  const deal = document.getElementById("deal");
  deal.innerHTML = `
    <div class="row">
      <h3 class="dealTitle">Tous les deals du moment</h3>
      <span class="badge">Public</span>
    </div>
    <p class="desc">
      Abonne à la chaîne Telegram pour être notifié automatiquement des nouveaux deals en direct.
    </p>
    <a class="btn cta" href="${escapeAttr(TELEGRAM_CHANNEL_URL)}" target="_blank" rel="noopener">
      S’abonner sur Telegram →
    </a>
  `;
}
// =========================
//  DEAL RENDER
// =========================
function renderDeal(d) {
  const deal = document.getElementById("deal");

  const priceCurrent = (d.price_current != null) ? `${d.price_current} €` : "—";
  const priceOriginal = (d.price_original != null) ? `${d.price_original} €` : "";
  const discount = (d.prct_discount != null) ? `-${d.prct_discount}%` : "";

  const couponHTML = d.coupon_code
    ? `
      <div class="coupon">
        <div>
          <div class="muted" style="font-size:12px; margin-bottom:6px;">Code promo</div>
          <code id="coupon-code">${escapeHtml(d.coupon_code)}</code>
        </div>
        <button class="btnCopy" onclick="copyCoupon()">Copier</button>
      </div>
    `
    : "";

  const stockDelayN =
    (d.stock_delay != null && d.stock_delay !== "" && Number.isFinite(Number(d.stock_delay)))
      ? Number(d.stock_delay)
      : null;

  let deliveryHTML = "";
  if (stockDelayN != null) {
    const est = computeEstimatedDelivery(stockDelayN);
    if (stockDelayN === 0) {
      deliveryHTML = `
        <div class="metaRow">
          <span class="pill">⚡ En stock : <strong style="color:#111827;">expédition rapide</strong></span>
          <span class="pill">🚚 Livraison estimée : <strong style="color:#111827;">${escapeHtml(est.label)}</strong></span>
        </div>
      `;
    } else {
      deliveryHTML = `
        <div class="metaRow">
          <span class="pill">📦 Approvisionnement : <strong style="color:#111827;">${stockDelayN}j ouvrés</strong></span>
          <span class="pill">🚚 Livraison estimée : <strong style="color:#111827;">${escapeHtml(est.label)}</strong></span>
        </div>
      `;
    }
  }

  deal.innerHTML = `
    ${d.image ? `
      <div class="imgWrap deal ${d.available === false ? "isSold" : ""}">
        ${d.url
          ? `<a class="dealLink" href="${escapeAttr(d.url)}" target="_blank" rel="noopener noreferrer">`
          : ""
        }
          <img src="${escapeAttr(d.image)}" alt="${escapeAttr(d.title || 'Image produit')}">
          ${d.available === false ? `<div class="ribbonSold">VENDU</div>` : ""}
        ${d.url ? `</a>` : ""}
      </div>
    ` : ""}
    <div class="pad">
      <div class="row">
      ${d.url
        ? `<a class="dealTitleLink" href="${escapeAttr(d.url)}" target="_blank" rel="noopener noreferrer">
            <h3 class="dealTitle">${escapeHtml(d.title || "Deal")}</h3>
          </a>`
        : `<h3 class="dealTitle">${escapeHtml(d.title || "Deal")}</h3>`
      }
        ${discount ? `<span class="badge">${escapeHtml(discount)}</span>` : ""}
      </div>

      <div class="price">
        <div class="now">${escapeHtml(priceCurrent)}</div>
        ${priceOriginal ? `<div class="old">${escapeHtml(priceOriginal)}</div>` : ""}
      </div>

      ${couponHTML}

      ${deliveryHTML}

      <div class="desc">${escapeHtml(d.desc_ai_fr || "")} ${d.desc_rcz || ""}</div>

      ${d.url ? `
        <a class="btn cta" href="${escapeAttr(d.url)}" target="_blank" rel="noopener noreferrer">
          Voir l’offre →
        </a>` : ""}
    </div>
  `;
}
// =========================
//  FETCH DEAL
// =========================
async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (e) { }
  return { res, json, txt };
}

async function loadDeal(token) {
  const baseHeaders = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const right = document.getElementById("rightPane");
  if (right) right.innerHTML = `<div class="muted" style="font-size:13px;">Chargement des produits liés…</div>`;

  const urlA = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*`;
  const rA = await fetchJson(urlA, { ...baseHeaders, [TOKEN_HEADER_NAME]: token });

  if (rA.res.ok && Array.isArray(rA.json) && rA.json.length >= 1) {
    const deal = rA.json[0];
    renderDeal(deal);

    try {
      const siblings = await fetchRpcParams_(RPC_SAME_COUPON, { p_token: token });
      renderRightSameCoupon_(deal, siblings);
    } catch (e) {
      console.log("same coupon RPC error:", e);
      renderRightSameCoupon_(deal, []);
    }
    return;

  }



  if (TOKEN_FIELD) {
    const urlB = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*&${encodeURIComponent(TOKEN_FIELD)}=eq.${encodeURIComponent(token)}`;
    const rB = await fetchJson(urlB, baseHeaders);

    if (rB.res.ok && Array.isArray(rB.json) && rB.json.length >= 1) {
      renderDeal(rB.json[0]);
      return;
    }
  }

  const deal = document.getElementById("deal");
  deal.innerHTML = `
        <div class="row">
          <h3 class="dealTitle">Deal introuvable</h3>
          <span class="badge">Lien invalide</span>
        </div>
        <p class="desc">
          Ce lien ne correspond pas à un deal actif (token invalide, expiré, ou accès non autorisé).
          Abonne-toi à Telegram pour recevoir les liens à jour.
        </p>
        <a class="btn cta" href="${escapeAttr(TELEGRAM_CHANNEL_URL)}" target="_blank" rel="noopener">
          S’abonner sur Telegram →
        </a>
      `;
}

// =========================
//  COOKIES CONSENT
// =========================
const CONSENT_KEY = "consent_v1_clean";
const cookieEl = document.getElementById("cookie");

function openCookie() { cookieEl.style.display = "block"; }
function acceptCookies() {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ essential: true, analytics: true, ads: true, t: Date.now() }));
  cookieEl.style.display = "none";
  // Ici: charger analytics/ads uniquement si nécessaire + consentement
}
function rejectCookies() {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ essential: true, analytics: false, ads: false, t: Date.now() }));
  cookieEl.style.display = "none";
}

// =========================
//  COPIE
// =========================
function exampleUrl() {
  return `?token=COLLE_TON_TOKEN`;
}
function copyExample() { copyText(exampleUrl(), "Exemple copié"); }
function copyCoupon() {
  const el = document.getElementById("coupon-code");
  if (!el) return;
  copyText(el.textContent.trim(), "Code copié");
}
function copyText(text, _msg) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { }
    document.body.removeChild(ta);
  }
}

// =========================
//  Escape helpers
// =========================
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[m]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}


const RPC_ALL_PUBLIC = "get_all_deals_public";
function siteDealUrl_(token) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?token=${encodeURIComponent(token)}`;
}

const RPC_SAME_COUPON = "get_deals_public_same_coupon";


function fmtEur_(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return `${v} €`;
  return `${n.toFixed(2).replace(".", ",")} €`;
}

async function fetchRpc_(fnName) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  // RPC SQL sans paramètres => POST body {}
  const res = await fetch(url, { method: "POST", headers, body: "{}" });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (e) { }
  if (!res.ok) {
    throw new Error(`RPC ${fnName} failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return Array.isArray(json) ? json : [];
}

async function fetchRpcParams_(fnName, params) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(params || {}) });
  const txt = await res.text();

  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (e) {}

  if (!res.ok) {
    throw new Error(`RPC ${fnName} failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return Array.isArray(json) ? json : [];
}


let allDealsPublicCache_ = [];
let selectedItemTypes_ = new Set();

function normText_(v) {
  return (v || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normItemType_(v) {
  return (v == null)
    ? "autre"
    : String(v).trim().toLowerCase();
}
function prettyItemType_(type) {
  if (!type) return "Autre";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function itemTypeLabel_(type) {
  const t = normItemType_(type);
  return t || "Autre";
}

function sortDeals_(arr) {
  const out = [...arr];

  switch (sortMode_) {

    case "price_asc":
      out.sort((a, b) => (a.price_current || 0) - (b.price_current || 0));
      break;

    case "price_desc":
      out.sort((a, b) => (b.price_current || 0) - (a.price_current || 0));
      break;

    case "discount_asc":
      out.sort((a, b) => (a.prct_discount || 0) - (b.prct_discount || 0));
      break;

    case "discount_desc":
      out.sort((a, b) => (b.prct_discount || 0) - (a.prct_discount || 0));
      break;
  }

  return out;
}

function computeItemTypeStats_(arr) {
  const counts = new Map();     // key: normalized
  const labels = new Map();     // key: normalized → label affiché

  for (const d of arr) {
    const raw = d.item_type;
    const key = normItemType_(raw);

    if (!counts.has(key)) {
      counts.set(key, 0);
      // on garde le premier label rencontré
      labels.set(
        key,
        raw ? prettyItemType_(String(raw).trim().toLowerCase()) : "Autre"
      );
    }
    counts.set(key, counts.get(key) + 1);
  }

  const types = Array.from(counts.keys())
    .sort((a, b) => labels.get(a).localeCompare(labels.get(b), "fr", { sensitivity: "base" }));

  return { types, counts, labels };
}

function renderTypeFilters_(arr) {
  const el = document.getElementById("typeFilters");
  if (!el) return;

  const { types, counts, labels } = computeItemTypeStats_(arr);

  // pas de diversité => pas de barre
  if (types.length <= 1) {
    el.innerHTML = "";
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");

  el.innerHTML = types.map(t => {
    const isActive = selectedItemTypes_.has(t);
    const n = counts.get(t) || 0;
    const label = labels.get(t) || "Autre";

    return `
    <button type="button"
      class="filterBtn ${isActive ? "isActive" : ""}"
      data-type="${escapeAttr(t)}">
      ${escapeHtml(label)}
      <span class="count">${escapeHtml(String(n))}</span>
    </button>
  `;
  }).join("");
  if (!el.__bound) {
    el.addEventListener("click", (evt) => {
      const btn = evt.target?.closest?.("button[data-type]");
      if (!btn) return;
      const t = normItemType_(btn.getAttribute("data-type")) || "Autre";

      if (selectedItemTypes_.has(t)) selectedItemTypes_.delete(t);
      else selectedItemTypes_.add(t);

      renderTypeFilters_(allDealsPublicCache_);
      renderAllDealsPublicGrid_();
    });
    el.__bound = true;
  }
}

function filterDeals_(arr) {
  let out = arr;

  // 1) filtre type
  if (selectedItemTypes_ && selectedItemTypes_.size > 0) {
    out = out.filter(d => selectedItemTypes_.has(normItemType_(d.item_type) || "autre"));
  }

  // 2) filtre recherche sur title
  const q = normText_(searchQuery_);
  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean); // ["fox","performance","36"]
    out = out.filter(d => {
      const title = normText_(d.title);
      // Tous les mots doivent être présents
      return tokens.every(t => title.includes(t));
    });
  }
  if (hideSold_) {
    out = out.filter(d => d.available !== false);
  }
  if (onlyStock0_) {
    out = out.filter(d => Number(d.stock_delay) === 0);
  }


  return out;

}

function bindSearchInput_() {
  const input = document.getElementById("searchInput");
  if (!input || input.__bound) return;

  input.addEventListener("input", (e) => {
    searchQuery_ = e.target.value.trim();
    renderAllDealsPublicGrid_();
  });

  input.__bound = true;
}
function bindSortSelect_() {
  const sel = document.getElementById("sortSelect");
  if (!sel || sel.__bound) return;

  sel.addEventListener("change", (e) => {
    sortMode_ = e.target.value;
    renderAllDealsPublicGrid_();
  });

  sel.__bound = true;
}
function bindSoldFilterBtn_() {
  const btn = document.getElementById("soldFilterBtn");
  if (!btn || btn.__bound) return;

  btn.addEventListener("click", () => {
    hideSold_ = !hideSold_;
    btn.classList.toggle("isActive", hideSold_);
    renderAllDealsPublicGrid_();
  });

  btn.__bound = true;
}

function bindStockFilterBtn_() {
  const btn = document.getElementById("stockFilterBtn");
  if (!btn || btn.__bound) return;

  btn.addEventListener("click", () => {
    onlyStock0_ = !onlyStock0_;
    btn.classList.toggle("isActive", onlyStock0_);
    renderAllDealsPublicGrid_();
  });

  btn.__bound = true;
}

function filterDealsBySelectedTypes_(arr) {
  // rien coché => tout afficher
  if (!selectedItemTypes_ || selectedItemTypes_.size === 0) return arr;

  return arr.filter(d => {
    const t = normItemType_(d.item_type) || "Autre";
    return selectedItemTypes_.has(t);
  });
}

function renderAllDealsPublicGrid_() {
  const grid = document.getElementById("allDeals");
  const count = document.getElementById("allDealsCount");
  if (!grid) return;

  const total = allDealsPublicCache_.length;
  const filtered = filterDeals_(allDealsPublicCache_);
  const sorted = sortDeals_(filtered);

  if (count) {
    const hasTypeFilter = selectedItemTypes_ && selectedItemTypes_.size > 0;
    const hasSearch = !!normText_(searchQuery_);
    const hasSoldFilter = !!hideSold_;

    const hasAnyFilter = hasTypeFilter || hasSearch || hasSoldFilter;

    if (total === 0) {
      count.textContent = "0 deal";
    } else{
      // au moins un filtre => on affiche filtré / total
      count.textContent = `${filtered.length} deals`;
    }
  }

  if (total === 0) {
    grid.innerHTML = `<div class="muted" style="font-size:13px;">Aucun deal.</div>`;
    return;
  }

  grid.innerHTML = sorted.length
    ? sorted.map(d => renderGridDeal_(d)).join("")
    : `<div class="muted" style="font-size:13px;">Aucun deal.</div>`;
}

function renderMiniDeal_(d, { showDelay } = { showDelay: false }) {
  const dealUrl = siteDealUrl_(d.token);
  const discount = (d.prct_discount != null && d.prct_discount !== "") ? `-${d.prct_discount}%` : "";
  const delay = (showDelay && d.stock_delay != null && d.stock_delay !== "") ? String(d.stock_delay) : "";
  const delayN = delay ? Number(delay) : null;

  const tags = [];
  if (discount) tags.push(`<span class="tag good">${escapeHtml(discount)}</span>`);
  if (showDelay) {
    if (delayN === 0) tags.push(`<span class="tag stock">En stock</span>`);
    else if (Number.isFinite(delayN) && delayN > 0) tags.push(`<span class="tag warn">⏳ ${escapeHtml(delay)} j</span>`);
  } else {
    tags.push(`<span class="tag stock">En stock</span>`);
  }

  const sold = (d.available === false);

  return `
    <a class="miniDealLink" href="${escapeAttr(dealUrl)}" title="Ouvrir le deal">
      <div class="miniDeal ${sold ? "isSold" : ""}">
        <div class="imgWrap mini">
          ${d.image
            ? `<img src="${escapeAttr(d.image)}" alt="${escapeAttr(d.title || "Produit")}">`
            : `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="">`
          }
          ${sold ? `<div class="ribbonSold" style="top:8px; right:-52px; width:170px;">VENDU</div>` : ""}
        </div>

        <div class="miniMain">
          <p class="miniT">${escapeHtml(d.title || "Deal")}</p>
          <div class="miniMeta">
            ${tags.join("")}
            <span class="k">${escapeHtml(fmtEur_(d.price_current))}</span>
            ${d.price_original ? `<span style="text-decoration:line-through; color:#9ca3af;">${escapeHtml(fmtEur_(d.price_original))}</span>` : ""}
          </div>
        </div>
      </div>
    </a>
  `;
}


function renderGridDeal_(d) {
  const dealUrl = d.token ? siteDealUrl_(d.token) : null;
  const discount = (d.prct_discount != null && d.prct_discount !== "") ? `-${d.prct_discount}%` : "";
  const sold = (d.available === false);

  const delayN = (d.stock_delay != null && d.stock_delay !== "" && Number.isFinite(Number(d.stock_delay)))
    ? Number(d.stock_delay)
    : null;

  const tags = [];
  if (discount) tags.push(`<span class="tag good">${escapeHtml(discount)}</span>`);
  if (delayN === 0) tags.push(`<span class="tag stock">En stock</span>`);
  else if (delayN != null) tags.push(`<span class="tag warn">⏳ ${escapeHtml(String(delayN))} j ouvrés</span>`);
  if (sold) tags.push(`<span class="tag sold">Vendu</span>`);

  return `
  <article class="gridDeal ${sold ? "isSold" : ""}">
    <div class="gridImg">
      ${dealUrl
      ? `<a class="gridImgLink" href="${escapeAttr(dealUrl)}" aria-label="Ouvrir le deal">`
      : `<div class="gridImgLink isDisabled" aria-hidden="true">`
    }

      ${d.image
      ? `<img loading="lazy" src="${escapeAttr(d.image)}" alt="${escapeAttr(d.title || "Produit")}">`
      : `<div class="imgPh"></div>`
    }

      ${dealUrl ? `</a>` : `</div>`}

      ${sold ? `<div class="ribbonSold">VENDU</div>` : ""}
    </div>

    <div class="gridBody">
      <div class="gridTitle">${escapeHtml(d.title || "Deal")}</div>
      <div class="gridMeta">
        ${tags.join("")}
      </div>

      <div class="gridPrice">
        <span class="now">${escapeHtml(fmtEur_(d.price_current))}</span>
        ${d.price_original ? `<span class="old">${escapeHtml(fmtEur_(d.price_original))}</span>` : ""}
      </div>

      <div class="gridActions">
        ${dealUrl ? `<a class="btn ghost" href="${escapeAttr(dealUrl)}">Ouvrir</a>` : ""}
      </div>
    </div>
  </article>
`;
}
async function loadAllDealsPublic_() {
  const grid = document.getElementById("allDeals");
  const count = document.getElementById("allDealsCount");
  if (!grid) return;

  try {
    const all = await fetchRpc_(RPC_ALL_PUBLIC);
    allDealsPublicCache_ = Array.isArray(all) ? all : [];

    renderTypeFilters_(allDealsPublicCache_);
    renderAllDealsPublicGrid_();
    renderTypeFilters_(allDealsPublicCache_);
    bindSearchInput_();
    bindSortSelect_();
    bindSoldFilterBtn_()
    bindStockFilterBtn_();

    renderAllDealsPublicGrid_();
    const soldBtn = document.getElementById("soldFilterBtn");
    if (soldBtn) {
      const soldCount = allDealsPublicCache_.filter(d => d.available === false).length;
      soldBtn.innerHTML = `Masquer vendus <span class="count">${soldCount}</span>`;
    }
    const stockBtn = document.getElementById("stockFilterBtn");
    if (stockBtn) {
      const stock0Count = allDealsPublicCache_.filter(d => Number(d.stock_delay) === 0).length;
      stockBtn.innerHTML = `Prêt à éxpedier <span class="count">${stock0Count}</span>`;
    }


  } catch (e) {
    console.log("All deals error:", e);
    if (count) count.textContent = "Erreur de chargement";
    grid.innerHTML = `<div class="muted" style="font-size:13px;">Impossible de charger les deals.</div>`;
  }
}

/**
* Calcule la date de livraison estimée
* @param {number} stockDelayDays - délai d’approvisionnement en jours ouvrés
* @returns {{daysCalendar:number, date:Date, label:string}}
*/
function computeEstimatedDelivery(stockDelayDays) {
  const baseDays = 7;
  const daysCalendar = Math.round(baseDays + (stockDelayDays * 7 / 5));

  const now = new Date();
  const deliveryDate = new Date(now);
  deliveryDate.setDate(now.getDate() + daysCalendar);

  const label = deliveryDate.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });

  return {
    daysCalendar,
    date: deliveryDate,
    label
  };
}

function toggleAllDeals_(hasToken) {
  const header = document.getElementById("allDealsHeader");
  const grid = document.getElementById("allDeals");

  if (header) header.classList.toggle("hidden", hasToken);
  if (grid) grid.classList.toggle("hidden", hasToken);
  const filters = document.getElementById("typeFilters");
  if (filters) filters.classList.toggle("hidden", hasToken);

}


function renderRightSameCoupon_(currentDeal, siblings) {
  const el = document.getElementById("rightPane");
  if (!el) return;

  const code = currentDeal?.coupon_code ? String(currentDeal.coupon_code).trim() : "";

  if (!code) {
    el.innerHTML = `
      <h3 class="subttl">Panier groupé</h3>
      <p class="muted" style="margin:0; line-height:1.75; font-size:14px;">
        Aucun <strong>code promo</strong> sur ce deal.
      </p>
    `;
    return;
  }

  // On enlève le deal courant de la liste (optionnel)
  const others = (siblings || []).filter(d => d && d.token && d.token !== currentDeal.token);

  el.innerHTML = `
    <h3 class="subttl">Même code promo</h3>

    <p class="muted" style="margin:10px 0 0; line-height:1.75; font-size:14px;">
      Ajoute plusieurs produits avec le <strong>même code</strong> pour mutualiser les frais de port.
    </p>

    <div style="margin-top:12px;">
      <div class="muted" style="font-weight:800; margin-bottom:6px; font-size:13px;">
        Produits avec ce code :
      </div>

      <div class="miniList">
        ${
          others.length
            ? others.map(d => renderMiniDeal_(d, { showDelay: true })).join("")
            : `<div class="muted" style="font-size:13px;">Aucun autre produit trouvé avec ce code.</div>`
        }
      </div>
    </div>
  `;
}


// =========================
//  START
// =========================
(function init() {
  const token = getTokenFromUrl();
  toggleAllDeals_(!!token);

  if (!localStorage.getItem(CONSENT_KEY)) openCookie();

  if (!token) {
    renderMissingTokenDeal();
    renderRightNoToken();
    loadAllDealsPublic_();
  } else {
    loadDeal(token);
  }
})();
