/***** RCZ — INBOX ENRICHED (mail → parse HTML → fetch RCZ → tri → 1 mail/article) *****/

/***** ========== CONFIG ========== *****/
const LABEL_NAME              = 'rcz_nl';
const DONE_LABEL_NAME         = 'rcz_nl/_done';
const MAX_THREADS_PER_RUN     = 1;
const MAX_ITEMS_PER_THREAD    = 5;
const SLEEP_MS_FETCH          = 400;
const SEND_ONE_MAIL_PER_ITEM  = true;
const RECIPIENT               = Session.getActiveUser().getEmail();
const SENDER_NAME             = 'RCZ Deal Bot';
const SEEN_MSGS_KEY           = 'RCZ_SEEN_MSG_IDS';
const SEEN_ITEMS_KEY          = 'RCZ_SEEN_ITEMS';
const KEEP_SEEN_MSGS          = 20;
const KEEP_SEEN_ITEMS         = 150;


/***** ========== ENTRYPOINT ========== *****/
function processRczEmails() {
  const props = PropertiesService.getScriptProperties();
  const flag  = props.getProperty("RCZ_RUNNING");
  if (flag === "true") {
    console.log("Un run est déjà en cours → sortie");
    return;
  }
  // Marquer le début
  props.setProperty("RCZ_RUNNING", "true");

  log('🚀 START processRczEmails @ ' + new Date().toISOString());
  try {
    const label   = getOrCreateLabel_(LABEL_NAME);
    const doneLbl = getOrCreateLabel_(DONE_LABEL_NAME);

    // mémoires
    const seenMsgsSet  = new Set(JSON.parse(props.getProperty(SEEN_MSGS_KEY)  || '[]'));
    const seenItemsSet = new Set(JSON.parse(props.getProperty(SEEN_ITEMS_KEY) || '[]'));

    const threads = label.getThreads(0, MAX_THREADS_PER_RUN);
    log(`📬 Threads sous "${LABEL_NAME}": ${threads.length} (limite ${MAX_THREADS_PER_RUN})`);

    let totalPromos = 0;
    let totalSent   = 0;

    for (let tIndex = 0; tIndex < threads.length; tIndex++) {
      const th = threads[tIndex];
      const isDone = threadHasLabel_(th, DONE_LABEL_NAME);
      log(`\n— Thread#${tIndex+1}/${threads.length} • id=${th.getId()} • déjà_done=${isDone}`);

      if (isDone) {
        log(`   ⏭️  Thread déjà marqué done → skip`);
        continue;
      }

      // Dernier message
      let msg = null, msgId = null, subject = '';
      try {
        const msgs = th.getMessages();
        msg = msgs[msgs.length - 1];
        msgId = msg.getId();
        subject = (msg.getSubject() || '(sans sujet)').trim();
        log(`   ✉️  Dernier message id=${msgId} subject="${subject}"`);
      } catch (e) {
        log(`   ⚠️  Impossible de lire le dernier message: ${e}`);
        markDone_(th, doneLbl);
        continue;
      }

      // Corps du mail
      let html = '', plain = '';
      try {
        html  = msg.getBody()      || '';
        plain = msg.getPlainBody() || '';
        log(`   📄 Corps: html=${html.length} chars, txt=${plain.length} chars`);
      } catch (e) {
        log(`   ⚠️  Impossible d'extraire le corps: ${e}`);
      }

      // 1) Parsing promos (rapide)
      const promos = extractPromosFromMail_(html || plain, { maxItems: 9999, lookaheadBlocks: 4 });
      log(`   🧩 Promos parsées: ${promos.length}`);
      if (!promos.length) {
        markDone_(th, doneLbl);
        seenMsgsSet.add(msgId);
        continue;
      }

      // 2) Calculer discount + tri AVANT fetch/IA
      for (const p of promos) {
        const pct = (p.priceOld && p.priceNew && p.priceOld > 0)
          ? Math.round((1 - p.priceNew / p.priceOld) * 100)
          : null;
        p.discountPct = (pct != null ? Math.max(0, Math.min(95, pct)) : null);
      }
      promos.sort((a,b) => (b.discountPct || 0) - (a.discountPct || 0));
      totalPromos += promos.length;

      // 3) Déterminer combien ont déjà été envoyées (pour numéroter)
      const sentSoFar = promos.filter(p => {
        // on utilise les clés "pré" (stables) pour compter
        const keys = keyCandidatesPre_(p);
        return keys.some(k => seenItemsSet.has(k));
      }).length;
      log(`   🔢 Déjà envoyées (pour numérotation): ${sentSoFar}`);

      // 3bis) Déterminer les non envoyées (dédoublon stable)
      const unsent = promos.filter(p => {
        const keys = keyCandidatesPre_(p);
        return !keys.some(k => seenItemsSet.has(k));
      });

      log(`   🔢 Non envoyées (dédoublon stable): ${unsent.length} / ${promos.length}`);

      if (!unsent.length) {
        markDone_(th, doneLbl);
        seenMsgsSet.add(msgId);
        log(`   🏷️  Thread complètement traité → done`);
        continue;
      }

      // 4) Batch courant
      const batch = unsent.slice(0, MAX_ITEMS_PER_THREAD);
      log(`   📦 Batch courant: ${batch.length} (max ${MAX_ITEMS_PER_THREAD})`);

      // 5) Pour chaque item du batch : enrichir → envoyer immédiatement → mémoriser clés
      let sentNow = 0;
      const displayIndexBase = sentSoFar; // on commence après les déjà envoyées

      for (let i = 0; i < batch.length; i++) {
        const p = batch[i];

        // --- Enrichissement RCZ ---
        let urlNorm = p.link || '';
        if (/rczbikeshop\.com|rcz.*?shop\.com/i.test(urlNorm)) {
          urlNorm = normalizeRczUrl_(urlNorm, 'fr'); // normalisation "à sec"
        }

        if (!urlNorm) {
          log(`   ⚠️  (batch#${i+1}) pas de lien → enrichissement limité`);
          p.canonical = '';
        } else {
          log(`   🌐 (batch#${i+1}) Fetch: ${urlNorm}`);
          const page = safeFetch_(urlNorm);
          if (!page) {
            log(`   ❌ Fetch KO → on garde au moins le lien`);
            p.canonical = urlNorm;
            p.image = p.image || '';
          } else {
            const meta = scrapePageMeta_(page, urlNorm);
            const score = titleMatchScore_(p.rawDescription || '', meta.title || '');
            log(`   🔍 match titre vs mail: ${Math.round(score*100)}%`);
            p.title           = meta.title || p.title || p.rawDescription || 'Article RCZ';
            p.pageDescription = meta.description || '';
            p.image           = meta.image || '';
            p.canonical       = meta.canonical || urlNorm;
            if (score < 0.35) {
              log('   ⚠️  faible concordance → suppression image');
              p.image = '';
            }
          }
        }

        // --- IA ---
        try {
          const prodName = p.title || p.rawDescription || '';
          const ai = classifyBikeProductStructured_(prodName); // {usage,type,resume}
          p.usageRaw   = ai.usage || '';
          p.usageNorm  = normalizeCategory(ai.usage);
          p.usageFinal = p.usageNorm || 'Autre';
          p.resumeIA_fr   = ai.resume_fr || '';
          p.resumeIA_en   = ai.resume_en || '';
          p.resumeIA_de   = ai.resume_de || '';
          p.resumeIA_es   = ai.resume_es || '';
          p.resumeIA_ru   = ai.resume_ru || '';
          p.resumeIA_pt   = ai.resume_pt || '';
          p.resumeIA_it   = ai.resume_it || '';
          p.type       = ai.type || '';
          p.compatible       = ai.compatible || '';
          log(`   🤖 IA usage="${p.usageFinal}" type="${p.type}" resume="${short_(p.resumeIA_fr,100)}"`);
        } catch (e) {
          log(`   ⚠️ IA erreur: ${e}`);
          p.usageRaw = ''; p.usageNorm = ''; p.usageFinal = 'Autre'; p.resumeIA_fr = '';
        }

        Utilities.sleep(SLEEP_MS_FETCH);

        // --- ENVOI immédiat ---
        const subjectOut = buildSubject_(p);
        const htmlOut    = buildItemEmailHtml_(p, displayIndexBase + i + 1);
        try {
          GmailApp.sendEmail(RECIPIENT, subjectOut, stripHtml_(htmlOut), {
            name: SENDER_NAME,
            htmlBody: htmlOut
          });
          totalSent++;
          sentNow++;
          log(`   ✉️  SEND #${totalSent}: ${subjectOut}`);
        } catch (e) {
          log(`   ⚠️ send KO (${e}) → création brouillon`);
          GmailApp.createDraft(RECIPIENT, subjectOut, stripHtml_(htmlOut), {
            name: SENDER_NAME, htmlBody: htmlOut
          });
        }


        // --- Mémorisation dédoublon IMMÉDIATE (pré + post) ---
        const allKeys = keyCandidatesPost_(p); // inclut les clés pré + canonical
        let changed = false;
        for (const k of allKeys) {
          if (!seenItemsSet.has(k)) {
            seenItemsSet.add(k);
            changed = true;
          }
        }
        if (changed) {
          props.setProperty(
            SEEN_ITEMS_KEY,
            JSON.stringify(headTail_(Array.from(seenItemsSet), KEEP_SEEN_ITEMS))
          );
        }



        // -- Envoi dans supabase
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let token = '';
        for (let i = 0; i < chars.length; i++) {
          token += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        insertDeal(
          escapeHtml_(p.canonical || p.link || ''),
          p.title,
          escapeHtml_(p.canonical || p.link || ''),
          p.priceNew,
          p.priceOld,
          p.code,
          p.usageFinal,
          p.type,
          p.pageDescription,
          p.resumeIA_fr,
          p.resumeIA_en,
          p.resumeIA_es,
          p.resumeIA_it,
          p.resumeIA_de,
          p.resumeIA_ru,
          p.resumeIA_pt,
          p.compatible,
          p.image,
          token,
          p.discountPct
        );

        Utilities.sleep(SLEEP_MS_FETCH);
      }

      // 6) Marquage done si plus rien à envoyer
      const remainingAfter = unsent.length - sentNow;
      if (remainingAfter > 0) {
        log(`   ⏸️  Partiellement traité: ${remainingAfter} restant(s). On reviendra sur ce thread au prochain run.`);
      } else {
        markDone_(th, doneLbl);
        seenMsgsSet.add(msgId);
        log(`   🏷️  Thread complètement traité → marqué "${DONE_LABEL_NAME}" & id mémorisé`);
      }
    }

    // Sauvegardes mémoires (final)
    props.setProperty(SEEN_MSGS_KEY,  JSON.stringify(headTail_(Array.from(seenMsgsSet),  KEEP_SEEN_MSGS)));
    props.setProperty(SEEN_ITEMS_KEY, JSON.stringify(headTail_(Array.from(seenItemsSet), KEEP_SEEN_ITEMS)));

    log(`\n✅ FIN: promos=${totalPromos}, mails envoyés=${totalSent}, memMsgs=${seenMsgsSet.size}, memItems=${seenItemsSet.size}`);
  } catch (e) {
    log('💥 ERREUR FATALE processRczEmails: ' + e + '\n' + (e.stack || ''));
  } finally {
    // Dé-marquer le run
    PropertiesService.getScriptProperties().deleteProperty("RCZ_RUNNING");
  }
}


/***** ========== DÉDOUBLONNAGE : CLÉS STABLES (pré + post) ========== *****/
// Nettoyage simple d'URL (fin de ponctuation)
function cleanUrl_(u) { return (u || '').replace(/[\)\]\.,]+$/,''); }

// Clé "contenu" (fallback) : desc + prix
function contentKey_(p) {
  const desc = (p.rawDescription || '').toLowerCase().trim().slice(0,160);
  const n = typeof p.priceNew === 'number' ? p.priceNew.toFixed(2) : '';
  const o = typeof p.priceOld === 'number' ? p.priceOld.toFixed(2) : '';
  const key = [desc, n, o].filter(Boolean).join('|');
  return key || null;
}

// Candidats de clés AVANT enrichissement (ne dépend QUE du mail)
function keyCandidatesPre_(p) {
  const out = new Set();
  const raw = (p.link || '').toLowerCase().trim();
  const cleaned = cleanUrl_(raw);
  if (raw) out.add(raw);
  if (cleaned) out.add(cleaned);

  // tentative de normalisation RCZ "à sec"
  try {
    const maybeRcz = /rczbikeshop\.com|rcz.*?shop\.com/i.test(raw);
    if (maybeRcz) {
      const norm = normalizeRczUrl_(raw, 'fr').toLowerCase().trim();
      if (norm) out.add(norm);
    }
  } catch(_) {}

  const content = contentKey_(p);
  if (content) out.add(content);

  return Array.from(out);
}

// Candidats de clés APRÈS enrichissement (ajoute canonical + re-normalisations)
function keyCandidatesPost_(p) {
  const out = new Set(keyCandidatesPre_(p));
  const can = (p.canonical || '').toLowerCase().trim();
  if (can) out.add(can);
  // normaliser aussi canonical via absolutize
  try {
    const abs = absolutize_(can);
    if (abs) out.add(abs.toLowerCase());
  } catch(_){}
  return Array.from(out);
}

/***** ========== ENRICHISSEMENT RCZ ========== *****/
function normalizeRczUrl_(u, lang) {
  try {
    const url = new URL(u);
    if (/go\.mail-coach\.com/i.test(url.hostname)) return u; // on ne peut pas résoudre sans fetch
    if (!/^\/(fr|en|de)\//i.test(url.pathname)) {
      url.pathname = '/' + (lang || 'fr') + url.pathname.replace(/^\/+/, '/');
    }
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','mc_cid','mc_eid','trk','ref']
      .forEach(k => url.searchParams.delete(k));
    return url.toString();
  } catch { return u; }
}

function safeFetch_(url) {
  try {
    const res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 RCZ-GAS' } });
    const code = res.getResponseCode();
    log(`     🌍 GET ${url} → ${code}`);
    if (code >= 200 && code < 400) return res.getContentText();
  } catch (e) {
    log(`     ❌ safeFetch_ error: ${e}`);
  }
  return null;
}

function absolutize_(u, base = 'https://www.rczbikeshop.com') {
  if (!u) return '';
  try { return new URL(u, base).toString(); } catch { return u; }
}



function tryParseStrictJson_(text) {
  if (!text) return null;
  const s = String(text).trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    if (obj && typeof obj === 'object' && ('usage' in obj)) return obj;
  } catch(_) {}
  return null;
}


/***** ========== HELPERS & LOGS ========== *****/


function cleanseHtmlToText_(s) {
  if (!s) return '';
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\r/g,'')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function toNumber_(s) {
  if (!s) return null;
  const n = s.replace(/\s/g, '').replace(',', '.');
  const v = parseFloat(n);
  return isNaN(v) ? null : v;
}
function getMetaContent_(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}
function getMetaHref_(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}
function getTagText_(html, re) {
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]+>/g,' ') : null;
}
function pickFirst_(arr) { return arr.find(Boolean) || null; }
function safeTrim_(s) { return (s || '').toString().trim(); }
function decodeEntities_(s) {
  if (!s) return '';
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => {
      const code = parseInt(d, 10);
      return (isFinite(code) ? String.fromCharCode(code) : _);
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return (isFinite(code) ? String.fromCharCode(code) : _);
    });
}
function sanitizeDescriptionHtml_(html) {
  if (!html) return '';
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<(\w+)(\s+[^>]*?)>/g, '<$1>');
  const allowed = ['p','br','ul','ol','li','b','strong','i','em'];
  s = s.replace(/<\/?([a-z0-9]+)[^>]*>/gi, (m, tag) =>
      allowed.includes(tag.toLowerCase()) ? m : '');
  return s.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function escapeHtml_(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
function fmtPrice_(n) {
  if (typeof n !== 'number') return '—';
  return n.toFixed(2).replace('.', ',') + ' €';
}
function absoluteUrl_(base, rel) { try { return new URL(rel, base).toString(); } catch { return rel; } }
function short_(s, n=80) { s = (s || '').toString().trim(); return s.length <= n ? s : s.slice(0, n-1) + '…'; }
function headTail_(arr, keep) { if (arr.length <= keep) return arr; return arr.slice(arr.length - keep); }
function log(msg) { try { Logger.log(msg); } catch(e) {} }

/***** Similarité titre↔mail (garde-fou image) *****/
function tokens_(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length >= 3 && ![
      'black','grey','size','disc','boost','shimano','sram','fork','wheel','rear','front',
      'pair','set','mm','inch','post','mount','tapered','factory','performance','elite',
      'pro','pos','adj','pm','fm','silver','orange','brown','blue','green','red'
    ].includes(w));
}
function titleMatchScore_(mailDesc, pageTitle) {
  const A = new Set(tokens_(mailDesc));
  const B = new Set(tokens_(pageTitle));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return inter / Math.min(A.size, B.size);
}
function stripHtml_(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/***** UTIL reset mémoire *****/
function resetRczMemory() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(SEEN_MSGS_KEY);
  props.deleteProperty(SEEN_ITEMS_KEY);
  log('🗑️ Mémoire RCZ vidée (messages & items)');
}



