/** =============================
 *  Telegram RCZ Watcher (Apps Script)
 *  — Envoi d’images + caption HTML + boutons
 *  — Routing par catégories → multiples chat_id
 *  — Anti-flood (≈1 msg/s par chat) + retries
 * ==============================*/

// Mappe tes catégories vers les chats cibles
// (chaînes négatives pour channels/supergroups : ex. -1001234567890)
const CHAT_IDS = {
  "mtb_fr":    [-1002742932352],
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

// Formatte la légende (caption) d’un deal propre en HTML
function formatDealCaption_(deal) {
  // deal = { title, price_current, price_original, discount_pct, url, category, store, note }
  const priceNow = deal.price_current ? `€${Number(deal.price_current).toLocaleString('fr-FR', {minimumFractionDigits: 2})}` : '';
  const priceOld = deal.price_original ? `€${Number(deal.price_original).toLocaleString('fr-FR', {minimumFractionDigits: 2})}` : '';
  const pct = deal.discount_pct ? `(-${deal.discount_pct}%)` : '';
  const store = deal.store ? ` • ${escapeHtml_(deal.store)}` : '';
  const note  = deal.note ? `\n<i>${escapeHtml_(deal.note)}</i>` : '';

  return [
    `<b>${escapeHtml_(deal.title || 'Deal RCZ')}</b>`,
    priceNow && priceOld ? `<b>${priceNow}</b> <s>${priceOld}</s> ${pct}` : (priceNow ? `<b>${priceNow}</b>` : ''),
    `<code>#${(deal.category || 'autre')}</code>${store}`,
    note
  ].filter(Boolean).join('\n');
}

// Clavier inline (boutons)
function buildInlineKeyboard_(deal) {
  const buttons = [];
  if (deal.url) buttons.push({ text: 'Voir le deal', url: deal.url });
  if (deal.category) buttons.push({ text: `S’abonner: ${deal.category}`, callback_data: `follow:${deal.category}` });
  return [buttons]; // rangée unique
}

// Routing : renvoie la liste des chat_id pour une catégorie
function resolveChatIds_(category) {
  const key = (category || '').toLowerCase();
  return CHAT_IDS[key] || CHAT_IDS['default'] || [];
}

// Anti-flood : respecte ~1 msg/s / chat
function publishDealWithImage(deal) {
  // deal = { title, price_current, price_original, discount_pct, url, category, store, note, image }
  if (!deal || !deal.image) throw new Error('deal.image requis (URL publique ou file_id).');

  const chatIds = resolveChatIds_(deal.category);
  if (!chatIds.length) throw new Error('Aucun chat_id trouvé (voir CHAT_IDS).');

  const caption = formatDealCaption_(deal);
  const kb = buildInlineKeyboard_(deal);

  chatIds.forEach((chatId, idx) => {
    // Respecter 1s entre messages dans un même script (simple et efficace)
    if (idx > 0) Utilities.sleep(1100);
    const res = tgSendPhoto_(chatId, deal.image, caption, kb);
    // Optionnel: log id du message envoyé
    console.log(`Sent to ${chatId}: message_id=${res?.result?.message_id || res?.message_id}`);
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
    title: "Fourche Fox 36 Performance 29\" 160 mm",
    price_current: 389.99,
    price_original: 799.00,
    discount_pct: 51,
    url: "https://rcz-watcher.netlify.app?token=7biLhf9dLZXUioBIWUDH7MRzvqe1HDTyti42z6quqo6SKD4F2QRNj37k1XnB9J",
    category: "mtb_fr",
    store: "RCZ",
    note: "Quantités limitées – axe 15x110, offset 44.",
    image: "https://www.rczbikeshop.com/media/catalog/product/cache/f2c698138e349cde449cb65d1fa1bf9e/i/m/imagesge_1_2.jpg" // ou un file_id Telegram déjà connu
  };
  publishDealWithImage(deal);
}