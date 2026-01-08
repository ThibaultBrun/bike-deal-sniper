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
    // en: "-1003183690292",
    //de: "-1003161099882",
    //it: "-1003139844241",
    //pt: "-1003186055556",
    //es: "-1003125828603"
  }
};


class Telegram {


  tgToken_() {
    const t = PropertiesService.getScriptProperties().getProperty('TG_BOT_TOKEN');
    if (!t) throw new Error('TG_BOT_TOKEN manquant dans Script Properties.');
    return t;
  }

  tgApiUrl_(method) {
    return `https://api.telegram.org/bot${TELEGRAM.tgToken_()}/${method}`;
  }

  // Envoi d’une photo par URL (caption en HTML, inline keyboard optionnel)
  tgSendPhoto_(chatId, photoUrl, captionHtml, inlineKeyboard = null) {
    const url = TELEGRAM.tgApiUrl_('sendPhoto');
    const payload = {
      chat_id: chatId,
      photo: photoUrl,            // URL publique ou file_id Telegram
      caption: captionHtml,       // HTML
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
      disable_notification: false
    };
    return TELEGRAM.httpPostJsonWithRetry_(url, payload);
  }

  // Petit helper JSON + retries/exponential backoff
  httpPostJsonWithRetry_(url, obj, maxRetry = 5) {
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
  formatDealCaption_(deal, lang = "en") {
    Logger.log(deal);
    // Sélection de la description AI selon la langue (fallback sur FR)
    const descKey = `desc_ai_${lang}`;
    const desc = deal[descKey] || deal.desc_ai_en || "";

    const priceNow = deal.priceNew
      ? `€${Number(deal.priceNew).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}`
      : "";
    const priceOld = deal.priceOld
      ? `€${Number(deal.priceOld).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}`
      : "";
    const pct = deal.discountPct ? `(-${deal.discountPct}%)` : "";
    const store = deal.store ? ` • ${escapeHtml_(deal.store)}` : "";
    const note = deal.note ? `\n<i>${escapeHtml_(deal.note)}</i>` : "";

    // Description IA (facultative)
    const descBlock = desc ? `\n${escapeHtml_(desc)}` : "";

    const delay = deal.stockDelayDays ?? "-"; // accepte 0



    return [
      `<b>${escapeHtml_(deal.title || "Deal RCZ")}</b>`,
      priceNow && priceOld
        ? `<b>${priceNow}</b> <s>${priceOld}</s> ${pct}`
        : priceNow
          ? `<b>${priceNow}</b>`
          : "",
      `<code>Délai d’approvisionnement : ${delay}J</code>${store}`,
      descBlock,
      note,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // === Clavier inline multilingue ===
  buildInlineKeyboard_(deal, lang = "en") {
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
  resolveChatIds_(category) {
    const key = (category || '').toLowerCase();
    return CHAT_IDS[key] || CHAT_IDS['default'] || [];
  }

  publishDealWithImage(c, deal) {

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
      const caption = TELEGRAM.formatDealCaption_(deal, lang);
      const kb = TELEGRAM.buildInlineKeyboard_(deal, lang);

      const res = TELEGRAM.tgSendPhoto_(chatId, deal.image, caption, kb);
      console.log(`✅ Envoyé à ${lang} (${chatId}) → message_id=${res?.result?.message_id || res?.message_id}`);
    });
  }

  /** ==== EXEMPLE D’APPEL ==== */
}
const TELEGRAM = new Telegram();