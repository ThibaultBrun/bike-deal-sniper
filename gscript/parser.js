/***** ========== PARSING MAIL (HTML BRUT) ========== *****/
function extractPromosFromMail_(htmlOrText, opts) {
  const cfg = Object.assign({ maxItems: 9999, lookaheadBlocks: 4 }, opts || {});
  const html = String(htmlOrText || '');

  log(`   🔎 extractPromosFromMail_: HTML in=${html.length} chars`);

  // 1) Découpe en blocs
  const rawBlocks = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .split(/<\/?(?:p|div|li|tr|td|table|br|center)[^>]*>/i)
    .map(x => x && x.trim())
    .filter(Boolean);

  log(`   🧱 Blocs HTML: ${rawBlocks.length}`);

  // 2) Patterns
  const priceLineRe = /(.+?)\s*\/\s*([\d.,\s]+)\s*€\s*(?:instead of|au lieu de|statt|UVP)\s*([\d.,\s]+)\s*€/i;
  const codeRe      = /(?:veuillez\s+mettre\s+le\s+code|please\s+enter\s+(?:the\s+)?code|utilisez\s+le\s+code|use\s+code|code)\s*:\s*([A-Z0-9][A-Z0-9_-]{2,})/i;
  const hrefRe      = /<a[^>]+href=["']([^"']+)["'][^>]*>/ig;
  const linkHostRe  = /(rczbikeshop\.com|rcz[^"']*shop\.com|go\.mail-coach\.com)/i;
  const urlTextRe   = /(https?:\/\/[^\s"'<)]+)/ig;

  const promos = [];
  let lastCode = null;

  const textOf = (h) => cleanseHtmlToText_(h);

  function extractLinksFromBlock(idx) {
    const urls = [];
    let m;
    while ((m = hrefRe.exec(rawBlocks[idx])) !== null) {
      const h = cleanUrl_(m[1]);
      if (linkHostRe.test(h)) urls.push(h);
    }
    if (!urls.length) {
      const t = textOf(rawBlocks[idx]);
      let um;
      while ((um = urlTextRe.exec(t)) !== null) {
        const u = cleanUrl_(um[1]);
        if (linkHostRe.test(u)) urls.push(u);
      }
    }
    return Array.from(new Set(urls));
  }

  function findNearbyLink(idx) {
    let urls = extractLinksFromBlock(idx);
    if (!urls.length && idx > 0) urls = urls.concat(extractLinksFromBlock(idx - 1));
    if (!urls.length && idx + 1 < rawBlocks.length) urls = urls.concat(extractLinksFromBlock(idx + 1));
    urls = Array.from(new Set(urls));
    if (urls.length) log(`     🔗 liens autour bloc#${idx+1}: ${urls.length} (pick: ${urls[0]})`);
    return urls[0] || null;
  }

  function scanCodeAhead(fromIdx) {
    const end = Math.min(rawBlocks.length - 1, fromIdx + cfg.lookaheadBlocks);
    for (let j = fromIdx + 1; j <= end; j++) {
      const t = textOf(rawBlocks[j]);
      const cm = t.match(codeRe);
      if (cm) {
        const c = cm[1].trim().toUpperCase();
        if (!/^\d{6,}$/.test(c) && !/^[A-Z0-9_-]+(?:\.[A-Z0-9_-]+){2,}$/.test(c)) {
          log(`     🔭 code repéré en lookahead (bloc#${j+1}): ${c}`);
          return c;
        }
      }
    }
    return null;
  }

  for (let bi = 0; bi < rawBlocks.length && promos.length < cfg.maxItems; bi++) {
    const blockHtml = rawBlocks[bi];
    const blockText = textOf(blockHtml);

    // A) code sticky
    const cmHere = blockText.match(codeRe);
    if (cmHere) {
      const c = cmHere[1].trim().toUpperCase();
      if (!/^\d{6,}$/.test(c) && !/^[A-Z0-9_-]+(?:\.[A-Z0-9_-]+){2,}$/.test(c)) {
        lastCode = c;
        log(`     🏷️  code vu (bloc#${bi+1}): ${lastCode}`);
      } else {
        log(`     ⚠️  code suspect ignoré (bloc#${bi+1}): ${c}`);
      }
    }

    // B) ligne prix
    const pm = priceLineRe.exec(blockText);
    if (!pm) continue;

    const rawDesc  = pm[1].trim();
    const priceNew = toNumber_(pm[2]);
    const priceOld = toNumber_(pm[3]);
    if (!isFinite(priceNew) || !isFinite(priceOld) || !(priceOld > priceNew)) {
      log(`     ❌ Prix invalides (bloc#${bi+1}): new="${pm[2]}", old="${pm[3]}"`);
      continue;
    }

    // C) lien
    const link = findNearbyLink(bi);

    // D) code éventuel après
    let codeForThis = lastCode;
    if (!codeForThis) {
      const ahead = scanCodeAhead(bi);
      if (ahead) {
        codeForThis = ahead;
        lastCode = ahead;
      }
    }

    promos.push({
      rawDescription: rawDesc,
      priceNew,
      priceOld,
      code: codeForThis || null,
      link
    });
    log(`     ✅ Promo#${promos.length} (bloc#${bi+1}): "${short_(rawDesc)}" ${priceNew}€ -> ${priceOld}€ code=${codeForThis||'—'} link=${link?'yes':'no'}`);
  }

  if (!promos.length) {
    log('   🧪 DEBUG: aucun promo — dump 3 premiers blocs:');
    for (let i=0;i<Math.min(3, rawBlocks.length);i++){
      log('   ── block#'+(i+1)+' (html trimmed 300): '+short_(rawBlocks[i],300));
    }
  }

  log(`   📦 Total promos trouvées: ${promos.length}`);
  return promos;
}

function extractProductImageFromHtml_(html, canonicalBase) {
  try {
    const initMatch = html.match(/"mage\/gallery\/gallery"\s*:\s*\{\s*[^]*?"data"\s*:\s*(\[[^]*?\])\s*,/i);
    if (initMatch && initMatch[1]) {
      const jsonStr = initMatch[1].replace(/\\\//g, '/');
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data) && data.length) {
        const main = data.find(it => it.isMain) || data[0];
        const url = main.full || main.img || main.thumb;
        if (url) return absolutize_(url, canonicalBase);
      }
    }
  } catch (e) {}

  const ph = html.match(/<div class="gallery-placeholder[^>]*>[^]*?<img[^>]+src="([^"]+)"/i);
  if (ph && ph[1]) return absolutize_(ph[1], canonicalBase);

  try {
    const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig) || [];
    for (const block of scripts) {
      const body = (block.match(/>([\s\S]*?)</) || [,''])[1];
      try {
        const parsed = JSON.parse(body);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          if (!it) continue;
          const types = Array.isArray(it['@type']) ? it['@type'] : [it['@type']];
          const typeStr = types.map(x=>String(x||'')).join(',').toLowerCase();
          if (typeStr.includes('product')) {
            const img = pickImageFromLd_(it.image);
            if (img) return absolutize_(img, canonicalBase);
          }
        }
      } catch(_){}
    }
  } catch(e) {}

  const og = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og && og[1]) return absolutize_(og[1], canonicalBase);

  const mProd = html.match(/<img[^>]+class=["'][^"']*(?:product|gallery|image)[^"']*["'][^>]+src=["']([^"']+)["']/i);
  if (mProd && mProd[1]) return absolutize_(mProd[1], canonicalBase);

  return '';
}
function pickImageFromLd_(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) {
    for (const v of img) {
      const p = pickImageFromLd_(v);
      if (p) return p;
    }
  }
  if (typeof img === 'object' && img.url) return img.url;
  return null;
}

function scrapePageMeta_(html, baseUrl) {
  const canonical = pickFirst_([
    getMetaHref_(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i),
  ]) || baseUrl;

  let ld = null;
  try {
    const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig) || [];
    for (const block of scripts) {
      const body = (block.match(/>([\s\S]*?)</) || [,''])[1];
      try {
        const parsed = JSON.parse(body);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          if (!it) continue;
          const types = Array.isArray(it['@type']) ? it['@type'] : [it['@type']];
          const typeStr = types.map(x=>String(x||'')).join(',').toLowerCase();
          if (typeStr.includes('product')) { ld = it; break; }
        }
        if (ld) break;
      } catch(_){}
    }
  } catch(e) {}

  let title = ld && (ld.name || ld.title) || null;
  let description = ld && (ld.description || '') || null;

  if (!title) {
    title = pickFirst_([
      getMetaContent_(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
      getTagText_(html, /<h1[^>]*>([\s\S]{3,200}?)<\/h1>/i),
      getTagText_(html, /<title[^>]*>([\s\S]{3,200}?)<\/title>/i),
    ]);
  }
  if (!description) {
    description = pickFirst_([
      getMetaContent_(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
      getMetaContent_(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i),
    ]);
  }

  const image = extractProductImageFromHtml_(html, canonical);

  const titleClean = safeTrim_(decodeEntities_(title || ''));
  const descRaw    = (description || '');
  const descClean  = sanitizeDescriptionHtml_(decodeEntities_(descRaw));
  const imageAbs   = image ? absolutize_(image, canonical || baseUrl) : '';

  return {
    title: titleClean,
    description: descClean,
    image: imageAbs,
    canonical: canonical
  };
}

function resolveMainCategory(usageNorm) {
  if (!usageNorm) return null;
  const u = usageNorm.toLowerCase();
  log(`usage norm : ${usageNorm}`);
  // Routes / gravel
  if (u.includes("route") || u.includes("gravel")){
    log('usage final road');

    return ["road"];
  }

  // Tout le reste est du VTT (y compris E-MTB, Enduro, DH, Trail, XC, etc.)
  if (
    u.includes("vtt") ||
    u.includes("mtb") ||
    u.includes("e-mtb") ||
    u.includes("enduro") ||
    u.includes("dh") ||
    u.includes("trail") ||
    u.includes("all-mountain") ||
    u.includes("xc")
  ){
        log('usage final mtb');

    return ["mtb"];
  }
          log('usage final both');

  return ["mtb","road"];
}


