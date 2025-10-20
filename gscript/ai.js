// === CONFIG GEMINI ===
const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_RPM     = 15;

/***** ========== IA (JSON strict + normalisation) ========== *****/
// Fenêtre RPM (glissante 60s)
let _geminiWindowStart = 0;
let _geminiCountThisWindow = 0;
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
  return [base + '-latest', base, 'gemini-1.5-flash-latest', 'gemini-2.5-flash'];
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
- "type" = famille (roue alu arriere, roue alu avant, roue carbone arriere, roue carbone avant, fourche, amortisseur, pédales, chaussures, vélo complet, kit cadre, tige de selle, transmission, frein, pneu, cintre, potence, casque, textile, outil, etc.)
- "usage" doit être UNE valeur parmi :
  Route, Gravel, XC, Trail / All-Mountain, Enduro, DH / Bike Park,
  E-MTB Trail / All-Mountain, E-MTB Enduro, E-MTB Autre,
  Accessoires génériques, Autre
- "resume" : mini-article court de 4 à 5 lignes max (~100 tokens). 
  Inclure :
  • Description rapide du produit et son usage.
  • Comparaison avec 1–2 concurrents connus (Shimano, SRAM, Fox, RockShox, Magura, DT Swiss, Maxxis, Schwalbe, etc.).
  • Positionnement de gamme (entrée/milieu/haut).
  • compatibilité orbea rise 2023 endurisé ( fourche 29 150mm / amortisseur 210*55 / transmission ms 12s / roues 29 alu légère et solide (enduro) ms  )
  • compatibilité rocky mountain reaper 24 ( fourche 26 120-130mm / amortisseur 165x38 /  transmission hg 10s / roues 24 / tige de selle telescopique < 125mm  30.9   )

  • compatibilité specicialized enduro comp 2016 650b ( fourche 27.5 160-170mm / amortisseur 216x63 / transmission gx 11s / roues 27.5 )

Format de sortie STRICT :
{"usage":"<valeur>","type":"<type>","resume":"<texte en 4-5 lignes max>"}

Produit : ${productName}`;

  try {
    const out = geminiGenerate_(prompt) || "";
    const parsed = tryParseStrictJson_(out);
    if (parsed) {
      const normalized = normalizeCategory(parsed.usage) || parsed.usage || "Autre";
      const usage = ALLOWED_CATEGORIES.includes(normalized) ? normalized : "Autre";
      const resume = (parsed.resume || "").toString().trim();
      const type = (parsed.type || "").toString().trim();
      return { usage, type, resume };
    }

    const m = out.match(/usage\s*principal\s*[:\-]\s*(.+)/i);
    const cand = m ? m[1].split(/[\n\r\-•|]/)[0].trim() : out.trim();
    const usage = normalizeCategory(cand) || "Autre";
    return { usage, type: "", resume: "" };
  } catch (e) {
    log('   ❌ classifyBikeProductStructured_ error: ' + e);
    return { usage: "Autre", type: "", resume: "" };
  }
}
