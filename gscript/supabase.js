function testSupabaseConn() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key = props.getProperty('SUPABASE_ANON_KEY');

  const endpoint = url + '/rest/v1/deals?select=id'; // select=id + limit=0 → permet count
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: 'count=exact'
    },
    muteHttpExceptions: true
  });

  Logger.log('Code HTTP: ' + res.getResponseCode());
  Logger.log(res.getContentText());
}


/**
 * Insère un deal dans Supabase.
 *
 * @param {string} title - Titre du produit
 * @param {string} url - Lien vers la page produit
 * @param {number} price_current - Prix actuel
 * @param {number} price_original - Prix d'origine (peut être null)
 * @param {string|null} coupon_code - Code promo éventuel
 * @param {string|null} category - Catégorie du produit
 * @param {string|null} item_type - Type d'article
 * @param {string|null} desc_rcz - Description brute RCZ
 * @param {string|null} desc_ai - Description enrichie IA
 * @param {string} token - Identifiant unique du deal
 * @return {Object} - L'objet du deal inséré ou un message d'erreur
 */
function insertDeal(
  id,
  title,
  url,
  price_current,
  price_original,
  coupon_code,
  category,
  item_type,
  desc_rcz,
  desc_ai_fr,
  desc_ai_en,
  desc_ai_es,
  desc_ai_it,
  desc_ai_de,
  desc_ai_ru,
  desc_ai_pt,
  compatible_ai,
  image,
  token,
  prct_discount
) {
  const props = PropertiesService.getScriptProperties();
  const SUPABASE_URL = props.getProperty('SUPABASE_URL');
  const SUPABASE_ANON_KEY = props.getProperty('SUPABASE_ANON_KEY');
  const BOT_EMAIL = props.getProperty('SUPABASE_BOT_EMAIL');
  const BOT_PASSWORD = props.getProperty('SUPABASE_BOT_PASSWORD');

  const payload = {
    id,
    title,
    url,
    price_current,
    price_original,
    coupon_code,
    category,
    item_type,
    desc_rcz,
    desc_ai_fr,
    desc_ai_en,
    desc_ai_de,
    desc_ai_es,
    desc_ai_it,
    desc_ai_ru,
    desc_ai_pt,
    compatible_ai,
    image,
    token,
    prct_discount
  };

  try {
    // --- Étape 1 : authentification du bot (login + récupération du JWT) ---
    const loginRes = UrlFetchApp.fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'post',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        email: BOT_EMAIL,
        password: BOT_PASSWORD
      }),
      muteHttpExceptions: true
    });

    const loginCode = loginRes.getResponseCode();
    if (loginCode >= 300) {
      const errTxt = loginRes.getContentText();
      Logger.log(`❌ Échec de connexion du bot (${loginCode}): ${errTxt}`);
      return { error: `Auth failed`, message: errTxt };
    }

    const { access_token } = JSON.parse(loginRes.getContentText());
    if (!access_token) {
      Logger.log(`❌ Aucun access_token reçu`);
      return { error: 'No JWT returned' };
    }

    // --- Étape 2 : envoi de l’INSERT avec le JWT du bot ---
    const res = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/deals`, {
      method: 'post',
      headers: {
        apikey: SUPABASE_ANON_KEY,            // toujours requis
        Authorization: 'Bearer ' + access_token, // JWT du bot authentifié
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText();

    if (code >= 200 && code < 300) {
      const json = JSON.parse(text);
      Logger.log('✅ Insertion réussie : ' + JSON.stringify(json, null, 2));
      return json[0];
    } else {
      Logger.log(`❌ Erreur HTTP ${code}: ${text}`);
      return { error: `HTTP ${code}`, message: text };
    }

  } catch (err) {
    Logger.log('❌ Exception: ' + err.message);
    return { error: err.message };
  }
}



function insertDealTest() {
  // Génère un identifiant unique court basé sur la date + un random
  const uniq = Math.random().toString(36).substring(2, 8); // ex : 'a9f3zq'
  const id = `test_${uniq}`;
  const token = `rcz_maxxis_dhf_275x24_${uniq}`;

  // Données du deal fictif
  const title = 'Pneu Maxxis Minion DHF 27.5x2.4';
  const url = 'https://rczbikeshop.com/pneu-maxxis-minion-dhf.html';
  const price_current = 39.99;
  const price_original = 69.99;
  const coupon_code = 'MAXXIS10';
  const category = 'pneus';
  const item_type = 'pneu';
  const desc_rcz = 'Pneu avant mythique, excellent grip';
  const desc_ai_fr = 'Super grip, idéal enduro/all-mountain';
  const desc_ai_en = 'en Super grip, idéal enduro/all-mountain';
  const desc_ai_de = 'de Super grip, idéal enduro/all-mountain';
  const desc_ai_es = 'es Super grip, idéal enduro/all-mountain';
  const desc_ai_it = 'it Super grip, idéal enduro/all-mountain';
  const desc_ai_ru = 'ru Super grip, idéal enduro/all-mountain';
  const desc_ai_pt = 'pt Super grip, idéal enduro/all-mountain';
  const compatible_ai = 'rise ok reaper ok enduro ok';
  const image = 'https://rczbikeshop.com/media/catalog/product/m/a/maxxis-minion-dhf-275x24.jpg';
  const prct_discount = Math.round(((price_original - price_current) / price_original) * 100);

  // Appel de la fonction prod (ne pas modifier)
  const deal = insertDeal(
    id,
    title,
    url,
    price_current,
    price_original,
    coupon_code,
    category,
    item_type,
    desc_rcz,
    desc_ai_fr,
    desc_ai_en,
    desc_ai_es,
    desc_ai_it,
    desc_ai_de,
    desc_ai_ru,
    desc_ai_pt,
    compatible_ai,
    image,
    token,
    prct_discount
  );

  Logger.log(deal);
}

function debugBotUid() {
  const props = PropertiesService.getScriptProperties();
  const SUPABASE_URL = props.getProperty('SUPABASE_URL');
  const SUPABASE_ANON_KEY = props.getProperty('SUPABASE_ANON_KEY');
  const BOT_EMAIL = props.getProperty('SUPABASE_BOT_EMAIL');
  const BOT_PASSWORD = props.getProperty('SUPABASE_BOT_PASSWORD');

  // login
  const res = UrlFetchApp.fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'post',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  const jwt = data.access_token;
  const payload = jwt.split('.')[1];
  const json = JSON.parse(
    Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString()
  );
  Logger.log('🔎 auth.uid() = ' + json.sub);
}


