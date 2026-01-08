// === CONFIG GEMINI ===
const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_RPM     = 50;
const AI_ONLY_IF_MISSING = true;      // true = enrichit seulement si champs vides
const AI_LIMIT_PER_RUN   = 50;        // sécurité : limite d’items par exécution
const AI_CACHE_TTL_SEC   = 1; // 14 jours

/***** ========== IA (JSON strict + normalisation) ========== *****/
// Fenêtre RPM (glissante 60s)
let _geminiWindowStart = 0;
let _geminiCountThisWindow = 0;

function geminiListModels_() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`;

  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error(`ListModels HTTP ${code}: ${res.getContentText()}`);

  const data = JSON.parse(res.getContentText());
  return data.models || [];
}

function geminiPickModelForGenerateContent() {
  const models = geminiListModels_();
  const ok = models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent'));
  // Priorité “flash” (rapide/moins cher) si dispo
  const prefer = ok.find(m => (m.name || '').includes('flash')) || ok[0];
  if (!prefer) throw new Error('Aucun modèle ne supporte generateContent pour cette clé.');
  Logger.log(prefer.name);
  return prefer.name;
}



function geminiRateGate_() {
  const now = Date.now();
  if (now - _geminiWindowStart >= 60000) {
    _geminiWindowStart = now;
    _geminiCountThisWindow = 0;
  }
  if (_geminiCountThisWindow >= GEMINI_RPM) {
    const wait = 60000 - (now - _geminiWindowStart) + 100;
    log(`   ⏳ RPM atteint (${GEMINI_RPM}/min) → sleep ${wait}ms`);
    Utilities.sleep(Math.max(0, wait));
    _geminiWindowStart = Date.now();
    _geminiCountThisWindow = 0;
  }
  _geminiCountThisWindow++;
}

function geminiModelCandidates_() {
  const m = (GEMINI_MODEL || '').trim();
  const base = m.endsWith('-latest') ? m.slice(0, -7) : m;
  return ['gemini-2.5-flash'];
}

function geminiGenerate_(prompt) {
    const props = PropertiesService.getScriptProperties();
    const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');

  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY manquant');
  const models = geminiModelCandidates_();
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';

  const payload = {
    contents: [{ parts: [{ text: String(prompt || '') }]}]
  };

  for (const model of models) {
    try {
      geminiRateGate_();
      const url = `${baseUrl}${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      const code = res.getResponseCode();
      if (code !== 200) {
        log(`   ⚠️ Gemini error ${code} on ${model}: ${res.getContentText().slice(0, 240)}`);
        continue;
      }
      const data = JSON.parse(res.getContentText());
      const out = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      if (out) return out;
    } catch (e) {
      log(`   ⚠️ geminiGenerate_ exception on model: ${e}`);
    }
  }
  return '';
}

// === Liste autorisée + normalisation ===
const ALLOWED_CATEGORIES = [
  "Route","Gravel","XC","Trail / All-Mountain","Enduro","DH / Bike Park",
  "E-MTB Trail / All-Mountain","E-MTB Enduro","E-MTB Autre",
  "Accessoires génériques","Autre"
];

function normalizeCategory(raw) {
  if (!raw) return null;
  const s0 = String(raw).trim();
  const s = s0.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const map = new Map([
    ["route","Route"],
    ["gravel","Gravel"],
    ["xc","XC"], ["cross-country","XC"], ["cross country","XC"],
    ["trail","Trail / All-Mountain"], ["all mountain","Trail / All-Mountain"], ["am","Trail / All-Mountain"],
    ["enduro","Enduro"],
    ["dh","DH / Bike Park"], ["downhill","DH / Bike Park"], ["bike park","DH / Bike Park"],
    ["accessoires","Accessoires génériques"], ["accessoires generiques","Accessoires génériques"],
    ["autre","Autre"],
    // E-MTB variantes
    ["e-mtb","E-MTB Autre"], ["emtb","E-MTB Autre"], ["vttae","E-MTB Autre"], ["e vtt","E-MTB Autre"],
    ["e-mtb trail","E-MTB Trail / All-Mountain"], ["emtb trail","E-MTB Trail / All-Mountain"], ["e-mtb all-mountain","E-MTB Trail / All-Mountain"], ["emtb am","E-MTB Trail / All-Mountain"], ["e-mtb am","E-MTB Trail / All-Mountain"],
    ["e-mtb enduro","E-MTB Enduro"], ["emtb enduro","E-MTB Enduro"]
  ]);

  if (map.has(s)) return map.get(s);

  if (s.includes("e-mtb") || s.includes("emtb") || s.includes("vttae") || s.includes("e vtt")) {
    if (s.includes("enduro")) return "E-MTB Enduro";
    if (s.includes("trail") || s.includes("all-mountain") || /\bam\b/.test(s)) return "E-MTB Trail / All-Mountain";
    return "E-MTB Autre";
  }
  if (s.includes("downhill") || /\bdh\b/.test(s) || s.includes("bike park")) return "DH / Bike Park";
  if (s.includes("all mountain") || /\bam\b/.test(s) || s.includes("trail")) return "Trail / All-Mountain";
  if (s.includes("cross") && s.includes("country")) return "XC";

  const exact = ALLOWED_CATEGORIES.find(c => c.toLowerCase() === s);
  if (exact) return exact;

  return null;
}

function classifyBikeProductStructured_(productName) {
  if (!productName) return { usage: "Autre", type: "", resume: "" };

  var prompt = `
Tu es un expert en vélo.
Analyse le produit ci-dessous et réponds UNIQUEMENT en JSON compact.

Contraintes :
- "type" = famille (roue alu arriere, roue alu avant, roue carbone arriere, roue carbone avant, fourche, amortisseur, pédales, chaussures, vélo complet, kit cadre, cadre, tige de selle, transmission, frein, pneu, cintre, potence, casque, textile, outil, etc.)
- "usage" doit être UNE valeur parmi :
  Route, Gravel, XC, Trail / All-Mountain, Enduro, DH / Bike Park,
  E-MTB Trail / All-Mountain, E-MTB Enduro, E-MTB Autre,
  Accessoires génériques, Autre
- "resume" : petit article court de 4 à 5 lignes max facon vendeur de vélo. 
  Inclure :
  • Description rapide du produit et son usage (3-4 lignes). si possible ajouter le poid. 
  • Comparaison avec 1–2 concurrents connus (Shimano, SRAM, Fox, RockShox, Magura, DT Swiss, Maxxis, Schwalbe, etc.).
  • Positionnement de gamme (entrée/milieu/haut).
  • Estimer le poid du composant
Format de sortie STRICT :
{"usage":"<valeur>","type":"<type>","resume":"<texte en 10 lignes max>"}

Produit : ${productName}`;

  try {
    const out = geminiGenerate_(prompt) || "";
    const parsed = tryParseStrictJson_(out);
    if (parsed) {
      const normalized = normalizeCategory(parsed.usage) || parsed.usage || "Autre";
      const type = parsed.type || "Autre";
      const usage = ALLOWED_CATEGORIES.includes(normalized) ? normalized : "Autre";
      const resume = (parsed.resume || "").toString().trim();
      return { usage, type, resume };
    }

    const m = out.match(/usage\s*principal\s*[:\-]\s*(.+)/i);
    const cand = m ? m[1].split(/[\n\r\-•|]/)[0].trim() : out.trim();
    const usage = normalizeCategory(cand) || "Autre";
    return { usage, type: "", resume: "" };
  } catch (e) {
    log('   ❌ classifyBikeProductStructured_ error: ' + e);
    return { usage: "Autre", type: "", resume: "", compatible : "" };
  }
}

function testai(){

  const ai=classifyBikeProductStructured_("fox 36 150mm 29 grip");
  Logger.log(JSON.stringify(ai,null,2));
}

/**
 * Entry point: boucle sur les deals actifs et enrichit item_type, desc_ai_fr, category.
 */
function enrichActiveDealsAi() {
  const deals = getActiveDealsForAi_();
  log(`🔎 Deals actifs trouvés: ${deals.length}`);

  const cache = CacheService.getScriptCache();
  let done = 0, skipped = 0, failed = 0;

  for (const d of deals) {
    if (done >= AI_LIMIT_PER_RUN) {
      log(`🛑 Limite AI_LIMIT_PER_RUN atteinte (${AI_LIMIT_PER_RUN}). Stop.`);
      break;
    }

    const id = d.id;
    const title = (d.title || '').toString().trim();
    if (!id || !title) {
      skipped++;
      continue;
    }

    if (AI_ONLY_IF_MISSING) {
      const hasType = !!(d.item_type && String(d.item_type).trim());
      const hasCat  = !!(d.category && String(d.category).trim());
      const hasDesc = !!(d.desc_ai_fr && String(d.desc_ai_fr).trim());
      if (hasType && hasCat && hasDesc) {
        skipped++;
        continue;
      }
    }

    try {
      let ai;

      ai = classifyBikeProductStructured_(title); // <- ta fonction Gemini

      const item_type = (ai?.type || '').toString().trim();
      const category  = (ai?.usage || 'Autre').toString().trim(); // tu renvoies "usage" déjà normalisé
      const desc_ai_fr = (ai?.resume || '').toString().trim();

      const patch = {
        item_type: item_type || (AI_ONLY_IF_MISSING ? d.item_type : item_type) || null,
        category: category || (AI_ONLY_IF_MISSING ? d.category : category) || null,
        desc_ai_fr: desc_ai_fr || (AI_ONLY_IF_MISSING ? d.desc_ai_fr : desc_ai_fr) || null
      };

      if (AI_ONLY_IF_MISSING) {
        if (d.item_type && d.item_type.trim()) delete patch.item_type;
        if (d.category && d.category.trim()) delete patch.category;
        if (d.desc_ai_fr && d.desc_ai_fr.trim()) delete patch.desc_ai_fr;
      }

      // Si plus rien à patch
      const keys = Object.keys(patch);
      if (!keys.length) {
        skipped++;
        continue;
      }

      patchDealAiFields_(id, patch);
      done++;
      log(`✅ ${id} updated | category=${patch.category || d.category} | type=${patch.item_type || d.item_type}`);

    } catch (e) {
      failed++;
      log(`❌ ${id} failed: ${e}`);
      // continue
    }
  }

  log(`🏁 Terminé: done=${done}, skipped=${skipped}, failed=${failed}`);
}

