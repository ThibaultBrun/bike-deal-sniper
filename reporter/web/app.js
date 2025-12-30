// ==== CONFIG ====
const SUPABASE_URL = "https://fgwytagsmcjzrbjhcude.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Qo1qCBUJpKpF5nzOCKFmqw_TrfzU0Hp";

// ==== INIT ====
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ==== DOM ====
const el = (id) => document.getElementById(id);
const kpisEl = el("kpis");
const tbodyEl = el("tbody");

let chartSpend = null;
let chartProfit = null;
let chartCashflow = null;
let chartAll = null;

function euro(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}
function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  // tes champs sont des strings "123.98" / "-400"
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function yyyymm(d) {
  // d = "2025-12-10"
  if (!d) return "unknown";
  return d.slice(0, 7);
}

async function refreshAuthUI() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const logged = !!session?.user;
  el("btnLogout").classList.toggle("hidden", !logged);
  el("btnLogin").classList.toggle("hidden", logged);
  el("authState").textContent = logged
    ? `Connecté: ${session.user.email}`
    : "Non connecté";

  if (logged) {
    el("email").classList.add("hidden");
    el("password").classList.add("hidden");
  } else {
    el("email").classList.remove("hidden");
    el("password").classList.remove("hidden");
  }
}

async function login() {
  const email = el("email").value.trim();
  const password = el("password").value;
  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) alert(error.message);
  await refreshAuthUI();
  await loadAndRender();
}

async function logout() {
  await supabaseClient.auth.signOut();
  await refreshAuthUI();
  await loadAndRender();
}

async function fetchPurchases() {
  const { data, error } = await supabaseClient
    .from("purchases")
    .select(
      "id,order_date,resale_date,items_text,order_number,grand_total,resale_price,expected_resale_price,personal_use,delivery_date"
    )
    .or("personal_use.is.null,personal_use.eq.false")
    .order("order_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

function applyFilters(rows) {
  const q = el("q").value.trim().toLowerCase();
  const view = el("view").value; // all | sold | stock

  return rows.filter((r) => {
    const hay = `${r.items_text ?? ""} ${r.order_number ?? ""} ${
      r.vendor ?? ""
    }`.toLowerCase();
    if (q && !hay.includes(q)) return false;

    const sold =
      r.resale_price !== null &&
      r.resale_price !== undefined &&
      r.resale_price !== "";
    const stock = !sold;

    if (view === "sold" && !sold) return false;
    if (view === "stock" && !stock) return false;

    return true;
  });
}

function buildMonthlyCashflow(rows) {
  // rows déjà hors perso
  const spendByMonth = new Map();
  const gainsByMonth = new Map();

  for (const r of rows) {
    const cost = toNumber(r.grand_total) ?? 0;
    const mSpend = yyyymm(r.order_date);
    spendByMonth.set(mSpend, (spendByMonth.get(mSpend) ?? 0) + cost);

    const resale = toNumber(r.resale_price);
    if (resale !== null) {
      const mGain = yyyymm(r.resale_date || r.order_date);
      gainsByMonth.set(mGain, (gainsByMonth.get(mGain) ?? 0) + resale);
    }
  }

  const months = Array.from(
    new Set([...spendByMonth.keys(), ...gainsByMonth.keys()])
  )
    .filter((m) => m !== "unknown")
    .sort();

  return {
    months,
    spend: months.map((m) => spendByMonth.get(m) ?? 0),
    gains: months.map((m) => gainsByMonth.get(m) ?? 0),
  };
}

function renderCashflowChart(rows) {
  const s = buildWeeklyCashflowCumulative(rows);

  if (chartCashflow) chartCashflow.destroy();

  chartCashflow = new Chart(el("chartCashflow"), {
    type: "line",
    data: {
      labels: s.labels,
      datasets: [
        {
          label: "Cumul net (Gains - Dépenses)",
          data: s.cumulArr,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: false } },
    },
  });
}

function isoWeekKeyFromDate(d) {
  // d = Date
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const year = date.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

function weekLabelFromKey(weekKey) {
  const [y, w] = weekKey.split("-W");
  return `W${w} ${y}`;
}

function startOfISOWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // lundi
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function buildWeeklySeriesContinuous(rows) {
  // maps semaine -> montant
  const spend = new Map();
  const gains = new Map();

  // trouver min/max semaine
  let minWeekStart = null;
  let maxWeekStart = null;

  for (const r of rows) {
    const buyStart = startOfISOWeek(r.order_date);
    if (buyStart) {
      minWeekStart =
        !minWeekStart || buyStart < minWeekStart ? buyStart : minWeekStart;
      maxWeekStart =
        !maxWeekStart || buyStart > maxWeekStart ? buyStart : maxWeekStart;
      const cost = toNumber(r.grand_total) ?? 0;
      const key = isoWeekKeyFromDate(buyStart);
      spend.set(key, (spend.get(key) ?? 0) + cost);
    }

    const resale = toNumber(r.resale_price);
    if (resale !== null) {
      const sellStart = startOfISOWeek(r.resale_date || r.order_date);
      if (sellStart) {
        minWeekStart =
          !minWeekStart || sellStart < minWeekStart ? sellStart : minWeekStart;
        maxWeekStart =
          !maxWeekStart || sellStart > maxWeekStart ? sellStart : maxWeekStart;
        const key = isoWeekKeyFromDate(sellStart);
        gains.set(key, (gains.get(key) ?? 0) + resale);
      }
    }
  }

  if (!minWeekStart || !maxWeekStart) {
    return { labels: [], spendNeg: [], gainsPos: [], cumul: [] };
  }

  // liste continue de semaines (pas de trous)
  const keys = [];
  for (let d = new Date(minWeekStart); d <= maxWeekStart; d = addDays(d, 7)) {
    keys.push(isoWeekKeyFromDate(d));
  }

  const labels = keys.map(weekLabelFromKey);

  const spendPos = keys.map((k) => spend.get(k) ?? 0);
  const gainsPos = keys.map((k) => gains.get(k) ?? 0);
  const spendNeg = spendPos.map((v) => -v);

  // cumul net
  let acc = 0;
  const cumul = keys.map((_, i) => {
    acc += gainsPos[i] - spendPos[i];
    return acc;
  });

  return { labels, spendNeg, gainsPos, cumul };
}
function buildWeeklyCashflowCumulative(rows) {
  const spend = new Map(); // semaine -> €
  const gains = new Map(); // semaine -> €

  for (const r of rows) {
    const cost = toNumber(r.grand_total) ?? 0;
    const wkBuy = toISOWeekKey(r.order_date);
    if (wkBuy !== "unknown") spend.set(wkBuy, (spend.get(wkBuy) ?? 0) + cost);

    const resale = toNumber(r.resale_price);
    if (resale !== null) {
      const wkSell = toISOWeekKey(r.resale_date || r.order_date);
      if (wkSell !== "unknown")
        gains.set(wkSell, (gains.get(wkSell) ?? 0) + resale);
    }
  }

  const weeks = Array.from(new Set([...spend.keys(), ...gains.keys()])).sort();

  const labels = weeks.map(weekLabel);
  const spendArr = weeks.map((w) => spend.get(w) ?? 0);
  const gainsArr = weeks.map((w) => gains.get(w) ?? 0);

  // net hebdo + cumul
  const netArr = weeks.map((_, i) => gainsArr[i] - spendArr[i]);
  const cumulArr = [];
  let acc = 0;
  for (const n of netArr) {
    acc += n;
    cumulArr.push(acc);
  }

  return { labels, spendArr, gainsArr, netArr, cumulArr };
}
function toISOWeekKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "unknown";

  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // 1..7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // jeudi
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const year = date.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

function weekLabel(weekKey) {
  if (!weekKey || weekKey === "unknown") return "—";
  const [y, w] = weekKey.split("-W");
  return `W${w} ${y}`;
}

function transitValue(items) {
  return items
    .filter((i) => !i.delivery_date)
    .reduce((sum, i) => sum + (Number(i.grand_total) || 0), 0);
}

function computeKPIs(rowsAll) {
  const rows = rowsAll.map((r) => {
    const cost = toNumber(r.grand_total) ?? 0;
    const resale = toNumber(r.resale_price);
    const profit = resale !== null ? resale - cost : null;
    return { ...r, cost, resale, profit };
  });

  const totalSpent = rows.reduce((s, r) => s + (r.cost || 0), 0);

  const sold = rows.filter((r) => r.resale !== null && !r.personal_use);
  const totalResale = sold.reduce((s, r) => s + (r.resale || 0), 0);
  const totalProfit = sold.reduce((s, r) => s + (r.profit || 0), 0);

  const resaleOnly = rows.filter((r) => !r.personal_use);
  const stock = resaleOnly.filter((r) => r.resale === null);
  const stockValue = stock.reduce((s, r) => s + (r.cost || 0), 0);

  const personal = rows.filter((r) => r.personal_use);
  const personalSpent = personal.reduce((s, r) => s + (r.cost || 0), 0);
  const avgDaystoSell = avgDaysToSell(rows);
  const inTransitCount = countInTransit(rows);
  const inTransitValue = transitValue(rows);
  const avgTransitDaysValue = avgTransitDays(rows, { excludePersonal: true });
  const roi =
    sold.length > 0
      ? totalProfit /
        Math.max(
          1e-9,
          sold.reduce((s, r) => s + (r.cost || 0), 0)
        )
      : 0;

  // profit "si tout vendu" = réel si vendu, sinon estimé si dispo
  const totalProfitIfAllSold = rows.reduce((sum, r) => {
    if (r.personal_use) return sum;

    const cost = r.cost || 0;
    const real = r.resale; // déjà parsé en number dans ton code
    const expected = toNumber(r.expected_resale_price);

    if (real !== null) return sum + (real - cost);
    if (expected !== null) return sum + (expected - cost);

    return sum; // pas d'estimation -> on n'ajoute rien
  }, 0);

  // pour info: combien d'items non vendus sans estimation
  const missingExpectedCount = rows.reduce((c, r) => {
    if (r.personal_use) return c;
    const sold = r.resale !== null;
    const expected = toNumber(r.expected_resale_price);
    return !sold && expected === null ? c + 1 : c;
  }, 0);

  const turnoverReal = rows.reduce((sum, r) => {
    if (r.personal_use) return sum;
    const real = r.resale; // number ou null
    return real !== null ? sum + real : sum;
  }, 0);

  const turnoverEstimated = rows.reduce((sum, r) => {
    if (r.personal_use) return sum;

    const real = r.resale;
    const expected = toNumber(r.expected_resale_price);

    if (real !== null) return sum + real;
    if (expected !== null) return sum + expected;

    return sum; // pas d'estimation -> on n'ajoute rien
  }, 0);

  const missingExpectedTurnoverCount = rows.reduce((c, r) => {
    if (r.personal_use) return c;
    const sold = r.resale !== null;
    const expected = toNumber(r.expected_resale_price);
    return !sold && expected === null ? c + 1 : c;
  }, 0);

  return {
    rows,
    totalSpent,
    totalResale,
    totalProfit,
    roi,
    count: rows.length,
    soldCount: sold.length,
    stockCount: stock.length,
    stockValue,
    personalCount: personal.length,
    personalSpent,
    totalProfitIfAllSold,
    missingExpectedCount,
    turnoverReal,
    turnoverEstimated,
    missingExpectedTurnoverCount,
    avgDaystoSell,
    inTransitCount,
    inTransitValue,
    avgTransitDaysValue,
  };
}

function renderKPIs(k) {
  const cards = [
    {
      title: "trésorerie nette",
      value: euro(k.totalResale - k.totalSpent),
      sub: `${k.stockCount} produits en stock (+ ${euro(k.stockValue)})`,
    },
    {
      title: "Dépensé total",
      value: euro(k.totalSpent),
      sub: `${k.count} achats`,
    },
    {
      title: "Encaissé revente",
      value: euro(k.totalResale),
      sub: `${k.soldCount} vendus `,
    },
    {
      title: "Profit revente (réel)",
      value: euro(k.totalProfit),
      sub: `ROI: ${(k.roi * 100).toFixed(1)}%`,
    },
    {
      title: "Temps moyen de vente",
      value: k.avgDaystoSell !== null ? `${k.avgDaystoSell.toFixed(1)} j` : "—",
      sub: "Livraison → revente",
    },
    {
      title: "Produits en transit",
      value: euro(k.inTransitValue),
      sub: `${k.inTransitCount} produits en attente de réception`,
    },
    {
      title: "Temps moyen de transit",
      value:
        k.avgTransitDaysValue !== null ? `${k.avgTransitDaysValue.toFixed(1)} j` : "—",
      sub: "Commande → réception",
    },
    {
      title: "Stock (à revendre)",
      value: euro(k.stockValue),
      sub: `${k.stockCount} en stock`,
    },
    {
      title: "Chiffre d’affaires (réel)",
      value: euro(k.turnoverReal),
      sub: "Vendus (hors perso)",
    },
    {
      title: "Chiffre d’affaires (estimé)",
      value: euro(k.turnoverEstimated),
      sub:
        k.missingExpectedTurnoverCount > 0
          ? `${k.missingExpectedTurnoverCount} item(s) sans estimation`
          : "Estimations complètes",
    },

    {
      title: "Profit total (estimé)",
      value: euro(k.totalProfitIfAllSold),
      sub:
        k.missingExpectedCount > 0
          ? `${k.missingExpectedCount} item(s) sans estimation`
          : "Estimations complètes",
    },
  ];

  kpisEl.innerHTML = cards
    .map(
      (c) => `
    <div class="card">
      <div class="muted">${c.title}</div>
      <div class="kpi">${c.value}</div>
      <div class="muted">${c.sub}</div>
    </div>
  `
    )
    .join("");
}

function avgDaysToSell(items) {
  const sold = items.filter(
    (i) => !i.personal_use && i.delivery_date && i.resale_date
  );

  if (sold.length === 0) return null;

  const days = sold.map((i) => {
    const d1 = new Date(i.delivery_date);
    const d2 = new Date(i.resale_date);
    return (d2 - d1) / (1000 * 60 * 60 * 24);
  });

  return days.reduce((a, b) => a + b, 0) / days.length;
}

function countInTransit(items) {
  return items.filter((i) => !i.delivery_date).length;
}

function buildMonthlySeries(rows) {
  // Achats par mois (tous)
  const spendByMonth = new Map();
  for (const r of rows) {
    const m = yyyymm(r.order_date);
    spendByMonth.set(m, (spendByMonth.get(m) ?? 0) + (r.cost || 0));
  }

  // Profit par mois (vendus, hors perso) -> basé sur resale_date si dispo sinon order_date
  const profitByMonth = new Map();
  for (const r of rows) {
    if (r.personal_use) continue;
    if (r.resale === null) continue;
    const m = yyyymm(r.resale_date || r.order_date);
    profitByMonth.set(m, (profitByMonth.get(m) ?? 0) + (r.profit || 0));
  }

  const months = Array.from(
    new Set([...spendByMonth.keys(), ...profitByMonth.keys()])
  )
    .filter((m) => m !== "unknown")
    .sort();

  return {
    months,
    spend: months.map((m) => spendByMonth.get(m) ?? 0),
    profit: months.map((m) => profitByMonth.get(m) ?? 0),
  };
}

function renderAllChart(rows) {
  const s = buildWeeklySeriesContinuous(rows);

  if (chartAll) chartAll.destroy();

  chartAll = new Chart(el("chartAll"), {
    data: {
      labels: s.labels,
      datasets: [
        {
          type: "bar",
          label: "Dépenses",
          data: s.spendNeg, // négatif
          backgroundColor: "rgba(244, 143, 177, 0.75)", // pastel rouge/rose
          borderColor: "rgba(244, 143, 177, 1)",
          borderWidth: 1,
          stack: "cash",
          categoryPercentage: 0.6,
          barPercentage: 0.9,
        },
        {
          type: "bar",
          label: "Gains",
          data: s.gainsPos, // positif
          backgroundColor: "rgba(129, 199, 132, 0.75)", // pastel vert
          borderColor: "rgba(129, 199, 132, 1)",
          borderWidth: 1,
          stack: "cash",
          categoryPercentage: 0.6,
          barPercentage: 0.9,
        },
        {
          type: "line",
          label: "Cumul net",
          data: s.cumul,
          borderColor: "rgba(100, 181, 246, 1)", // pastel bleu
          backgroundColor: "rgba(100, 181, 246, 0.25)",
          tension: 0.2,
          pointRadius: 2,
          yAxisID: "y",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          ticks: {
            callback: (v) => new Intl.NumberFormat("fr-FR").format(v) + " €",
          },
        },
      },
    },
  });
}

function renderCharts(rows) {
  /* const s = buildMonthlySeries(rows);

  if (chartSpend) chartSpend.destroy();
  chartSpend = new Chart(el("chartSpend"), {
    type: "bar",
    data: { labels: s.months, datasets: [{ label: "Achats", data: s.spend }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  if (chartProfit) chartProfit.destroy();
  chartProfit = new Chart(el("chartProfit"), {
    type: "bar",
    data: { labels: s.months, datasets: [{ label: "Profit", data: s.profit }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });*/

  // renderCashflowChart(rows);
  renderAllChart(rows);
}

function avgTransitDays(items, { excludePersonal = false } = {}) {
  const now = new Date();

  const rows = items.filter(i => {
    if (!i.order_date) return false;
    if (excludePersonal && i.personal_use) return false;
    return true;
  });

  if (rows.length === 0) return null;

  const days = rows.map(i => {
    const start = new Date(i.order_date);
    const end = i.delivery_date ? new Date(i.delivery_date) : now;
    return (end - start) / 86400000; // ms → jours
  });

  return days.reduce((a, b) => a + b, 0) / days.length;
}

function renderTable(rows) {
  tbodyEl.innerHTML = rows
    .map((r) => {
      const profit = r.resale !== null ? r.resale - (r.cost || 0) : null;

      const safeTitle = (r.items_text ?? "").replaceAll('"', "'");

      return `
      <tr data-row-id="${r.id}">
        <td>${r.order_date ?? "—"}</td>

        <!-- Produit (editable) -->
        <td
          title="${safeTitle}"
          data-edit-field="items_text"
          data-id="${r.id}"
          class="editable"
        >${(r.items_text ?? "—").slice(0, 80)}${(r.items_text ?? "").length > 80 ? "…" : ""}</td>

        <td>${r.order_number ?? "—"}</td>

        <td class="right">${euro(r.cost)}</td>

        <!-- Livraison (editable) -->
        <td
          class="right editable"
          data-edit-field="delivery_date"
          data-id="${r.id}"
        >${r.delivery_date ?? "—"}</td>

        <!-- Estimation (editable) -->
        <td
          class="right editable"
          data-edit-field="expected_resale_price"
          data-id="${r.id}"
        >${r.expected_resale_price !== null ? euro(r.expected_resale_price) : "—"}</td>

        <!-- Vente (editable) -->
        <td
          class="right editable"
          data-edit-field="resale_price"
          data-id="${r.id}"
        >${r.resale !== null ? euro(r.resale) : "—"}</td>

        <!-- Date vente (editable) -->
        <td
          class="editable"
          data-edit-field="resale_date"
          data-id="${r.id}"
        >${r.resale_date ?? "—"}</td>

        <td class="right">${euro((toNumber(r.expected_resale_price) ?? 0) - (r.cost || 0))}</td>

        <td class="right">${profit !== null ? euro(profit) : "—"}</td>

      </tr>
    `;
    })
    .join("");

  // bouton existant
}


async function loadAndRender() {
  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session?.user) {
      // pas connecté => pas de data (si RLS)
      kpisEl.innerHTML = `<div class="card"><div class="muted">Connecte-toi pour voir tes données.</div></div>`;
      tbodyEl.innerHTML = "";
      if (chartSpend) chartSpend.destroy();
      if (chartProfit) chartProfit.destroy();
      return;
    }

    const data = await fetchPurchases();
    const filteredRaw = applyFilters(data);

    const k = computeKPIs(filteredRaw);
    renderKPIs(k);
    renderCharts(k.rows);
    renderTable(k.rows);
  } catch (e) {
    console.error(e);
    alert(e.message ?? String(e));
  }
}

async function editCell(td) {
  const id = td.dataset.id;
  const field = td.dataset.editField;

  // valeur actuelle affichée (on préfère relire depuis le dataset si tu veux)
  const currentText = td.textContent.trim();
  const current = currentText === "—" ? "" : currentText;

  // message par champ
  const labelByField = {
    items_text: "Produit (texte)",
    delivery_date: "Date de livraison (YYYY-MM-DD) (vide = pas reçu)",
    expected_resale_price: "Prix estimé (€) (vide = null)",
    resale_price: "Prix de vente (€) (vide = pas vendu)",
    resale_date: "Date de vente (YYYY-MM-DD) (vide = null)",
  };

  const msg = labelByField[field] ?? field;
  const raw = prompt(msg + " :", current);
  if (raw === null) return; // cancel

  const value = raw.trim();

  // validation light
  const isDateField = field === "delivery_date" || field === "resale_date";
  const isPriceField = field === "expected_resale_price" || field === "resale_price";

  if (isDateField && value !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    alert("Format attendu: YYYY-MM-DD");
    return;
  }

  if (isPriceField && value !== "") {
    const n = toNumber(value);
    if (n === null) {
      alert("Prix invalide.");
      return;
    }
  }

  const payload = {};
  payload[field] = value === "" ? null : (isPriceField ? String(toNumber(value)) : value);

  // cohérence : si on supprime le prix de vente => date vente = null
  if (field === "resale_price" && payload.resale_price === null) {
    payload.resale_date = null;
  }

  // cohérence : si on set une date de vente mais pas de prix -> tu peux choisir de refuser
  if (field === "resale_date") {
    // si on met une date, on peut exiger un prix déjà présent (sinon incohérent)
    // -> version soft: juste warning
    // (tu peux aussi bloquer si tu veux)
  }

  const { error } = await supabaseClient
    .from("purchases")
    .update(payload)
    .eq("id", id)
    .select("*");

  if (error) {
    alert("Erreur update: " + error.message);
    return;
  }

  await loadAndRender();
}


// ==== EVENTS ====
el("btnLogin").addEventListener("click", login);
el("btnLogout").addEventListener("click", logout);
el("btnReload").addEventListener("click", loadAndRender);
el("q").addEventListener("input", loadAndRender);
el("view").addEventListener("change", loadAndRender);
tbodyEl.addEventListener("contextmenu", (e) => {
  const td = e.target.closest("td[data-edit-field][data-id]");
  if (!td) return;

  e.preventDefault(); // bloque le menu clic droit navigateur
  editCell(td);
});

let hadTouch = false;
window.addEventListener("touchstart", () => (hadTouch = true), { passive: true });
let lastTap = { t: 0, td: null };

tbodyEl.addEventListener("click", (e) => {
  if (!hadTouch) return; // desktop => on laisse dblclick faire le job

  const td = e.target.closest("td[data-edit-field][data-id]");
  if (!td) return;

  const now = Date.now();
  const isDouble = lastTap.td === td && (now - lastTap.t) < 300;
  lastTap = { t: now, td };

  if (isDouble) editCell(td);
});


// bonus: double clic
tbodyEl.addEventListener("dblclick", (e) => {
  const td = e.target.closest("td[data-edit-field][data-id]");
  if (!td) return;
  editCell(td);
});

// ==== START ====
(async function init() {
  await refreshAuthUI();
  await loadAndRender();
})();
