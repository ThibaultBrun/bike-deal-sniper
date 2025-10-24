/** =============================
 *  Telegram RCZ Watcher (Apps Script)
 *  — Envoi d’images + caption HTML + boutons
 *  — Routing par catégories → multiples chat_id
 *  — Anti-flood (≈1 msg/s par chat) + retries
 * ==============================*/

// Mappe tes catégories vers les chats cibles
// (chaînes négatives pour channels/supergroups : ex. -1001234567890)
const CHAT_IDS = {
  mtb: {
    fr: "-1002742932352",
    en: "-1003183690292",
    de: "-1003161099882",
    it: "-1003139844241",
    pt: "-1003186055556",
    es: "-1003125828603"
  }
};

function tgToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('TG_BOT_TOKEN');
  if (!t) throw new Error('TG_BOT_TOKEN manquant dans Script Properties.');
  return t;
}

function tgApiUrl_(method) {
  return `https://api.telegram.org/bot${tgToken_()}/${method}`;
}

// Envoi d’une photo par URL (caption en HTML, inline keyboard optionnel)
function tgSendPhoto_(chatId, photoUrl, captionHtml, inlineKeyboard=null) {
  const url = tgApiUrl_('sendPhoto');
  const payload = {
    chat_id: chatId,
    photo: photoUrl,            // URL publique ou file_id Telegram
    caption: captionHtml,       // HTML
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
    disable_notification: false
  };
  return httpPostJsonWithRetry_(url, payload);
}

// Petit helper JSON + retries/exponential backoff
function httpPostJsonWithRetry_(url, obj, maxRetry=5) {
  let wait = 400; // ms
  for (let i = 0; i < maxRetry; i++) {
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(obj),
        muteHttpExceptions: true
      });
      const code = res.getResponseCode();
      const body = res.getContentText();
      if (code >= 200 && code < 300) return JSON.parse(body);
      // Retry sur erreurs 429/5xx
      if (code === 429 || (code >= 500 && code < 600)) {
        Utilities.sleep(wait);
        wait = Math.min(wait * 2, 8000);
        continue;
      }
      throw new Error(`HTTP ${code}: ${body}`);
    } catch (e) {
      if (i === maxRetry - 1) throw e;
      Utilities.sleep(wait);
      wait = Math.min(wait * 2, 8000);
    }
  }
}

// Formatte la légende (caption) d’un deal propre en HTML, adaptée à la langue
function formatDealCaption_(deal, lang = "en") {
  // Sélection de la description AI selon la langue (fallback sur FR)
  const descKey = `desc_ai_${lang}`;
  const desc = deal[descKey] || deal.desc_ai_en || "";

  const priceNow = deal.price_current
    ? `€${Number(deal.price_current).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}`
    : "";
  const priceOld = deal.price_original
    ? `€${Number(deal.price_original).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}`
    : "";
  const pct = deal.discount_pct ? `(-${deal.discount_pct}%)` : "";
  const store = deal.store ? ` • ${escapeHtml_(deal.store)}` : "";
  const note = deal.note ? `\n<i>${escapeHtml_(deal.note)}</i>` : "";

  // Description IA (facultative)
  const descBlock = desc ? `\n${escapeHtml_(desc)}` : "";

  return [
    `<b>${escapeHtml_(deal.title || "Deal RCZ")}</b>`,
    priceNow && priceOld
      ? `<b>${priceNow}</b> <s>${priceOld}</s> ${pct}`
      : priceNow
      ? `<b>${priceNow}</b>`
      : "",
    `<code>#${deal.category || "autre"}</code>${store}`,
    descBlock,
    note,
  ]
    .filter(Boolean)
    .join("\n");
}

// === Clavier inline multilingue ===
function buildInlineKeyboard_(deal, lang = "en") {
  // Traductions
  const BTN_TEXTS = {
    viewDeal: {
      "fr": "Voir le deal",
      "en": "View deal",
      "es": "Ver la oferta",
      "de": "Angebot ansehen",
      "it": "Vedi l'offerta",
      "pt": "Ver o negócio",
      "ru": "Посмотреть предложение"
    }
  };

  // Texte localisé selon la langue
  const tView = BTN_TEXTS.viewDeal[lang] || BTN_TEXTS.viewDeal.fr;

  // Construction des boutons
  const buttons = [];
  if (deal.token)
    buttons.push({ text: tView, url: "https://rcz-watcher.netlify.app?token=" + deal.token });

  // Format attendu par Telegram (inline_keyboard)
  return [buttons]; // une seule rangée
}

// Routing : renvoie la liste des chat_id pour une catégorie
function resolveChatIds_(category) {
  const key = (category || '').toLowerCase();
  return CHAT_IDS[key] || CHAT_IDS['default'] || [];
}

function publishDealWithImage(c, deal) {
  if (!deal || !deal.image) throw new Error('deal.image requis (URL publique ou file_id).');

  const categoryChats = CHAT_IDS[c];
  if (!categoryChats) throw new Error(`Catégorie inconnue : ${c}`);

  const langs = Object.keys(categoryChats);
  if (!langs.length) throw new Error(`Aucun canal défini pour ${c}`);

  // 🔹 Pour chaque langue, on envoie le message adapté
  langs.forEach((lang, idx) => {
    const chatId = categoryChats[lang];
    if (!chatId) return; // sécurité : saute si id manquant

    // Respect du tempo anti-flood Telegram (~1 msg/s)
    if (idx > 0) Utilities.sleep(1100);

    // Sélection du texte approprié (desc_ai_lang s’il existe, sinon desc_ai_fr)
    const caption = formatDealCaption_(deal, lang);
    const kb = buildInlineKeyboard_(deal, lang);

    const res = tgSendPhoto_(chatId, deal.image, caption, kb);
    console.log(`✅ Envoyé à ${lang} (${chatId}) → message_id=${res?.result?.message_id || res?.message_id}`);
  });
}
// Utilitaire pour échapper le HTML
function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ==== EXEMPLE D’APPEL ==== */
function demo_publish_one_deal() {
  const deal = {
    id: 1,
    title: "Fourche Fox 36 Factory 29\" Grip2 160 mm Kashima",
    url: "https://rcz-watcher.netlify.app?token=7biLhf9dLZXUioBIWUDH7MRzvqe1HDTyti42z6quqo6SKD4F2QRNj37k1XnB9J",
    price_current: 699.99,
    price_original: 1350.00,
    coupon_code: null,
    category: "mtb_toto",
    item_type: "Fourche suspendue",
    desc_rcz: "La Fox 36 Factory 29\" Grip2 est une fourche d’enduro haut de gamme, rigide, sensible et ultra performante sur les terrains cassants.",
    desc_ai_fr: "Fourche d’enduro haut de gamme à cartouche Grip2, finition Kashima, idéale pour les riders exigeants en descente.",
    desc_ai_en: "High-end enduro fork with Grip2 cartridge and Kashima coating, ideal for aggressive trail and enduro riders.",
    desc_ai_es: "Horquilla de enduro de alta gama con cartucho Grip2 y recubrimiento Kashima, ideal para descensos exigentes.",
    desc_ai_it: "Forcella enduro di fascia alta con cartuccia Grip2 e finitura Kashima, perfetta per discese impegnative.",
    desc_ai_de: "Hochwertige Enduro-Gabel mit Grip2-Kartusche und Kashima-Beschichtung, perfekt für anspruchsvolle Trails.",
    desc_ai_ru: "Премиальная эндуро-вилка с картриджем Grip2 и покрытием Kashima, идеально подходит для агрессивных трасс.",
    desc_ai_pt: "Suspensão dianteira de enduro premium com cartucho Grip2 e acabamento Kashima, ideal para trilhas exigentes.",
    compatible_ai: "VTT, enduro, e-MTB",
    image: "https://www.rczbikeshop.com/media/catalog/product/cache/f2c698138e349cde449cb65d1fa1bf9e/f/o/fox36_factory_160_grip2_kashima_29.jpg",
    token: "7biLhf9dLZXUioBIWUDH7MRzvqe1HDTyti42z6quqo6SKD4F2QRNj37k1XnB9J",
    prct_discount: 48
  };

  publishDealWithImage("mtb",deal);
}