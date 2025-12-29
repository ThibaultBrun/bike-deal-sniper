/**
 * Insère un purchase dans Supabase (login bot -> JWT -> insert RLS authenticated).
 *
 * @param {Object} purchase - objet à insérer (clés = colonnes DB)
 * @return {Object} - ligne insérée (ou objet d'erreur)
 */
function insertPurchase(purchase) {
  const props = PropertiesService.getScriptProperties();
  const SUPABASE_URL = props.getProperty('SUPABASE_URL');
  const SUPABASE_ANON_KEY = props.getProperty('SUPABASE_ANON_KEY');
  const BOT_EMAIL = props.getProperty('SUPABASE_BOT_EMAIL');
  const BOT_PASSWORD = props.getProperty('SUPABASE_BOT_PASSWORD');

  try {
    // --- 1) Auth bot ---
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
    const loginTxt = loginRes.getContentText();
    if (loginCode >= 300) {
      Logger.log(`❌ Auth bot KO (${loginCode}): ${loginTxt}`);
      return { error: 'Auth failed', message: loginTxt };
    }

    const loginJson = JSON.parse(loginTxt);
    const access_token = loginJson.access_token;
    if (!access_token) {
      Logger.log('❌ Aucun access_token reçu');
      return { error: 'No JWT returned', message: loginTxt };
    }

    // --- 2) INSERT purchase ---
    const res = UrlFetchApp.fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
      method: 'post',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + access_token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation' // + ",resolution=merge-duplicates" si besoin
      },
      payload: JSON.stringify(purchase), // ici objet simple (comme ton insertDeal)
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const text = res.getContentText();

    if (code >= 200 && code < 300) {
      const json = JSON.parse(text);
      Logger.log('✅ Purchase inséré : ' + JSON.stringify(json, null, 2));
      // PostgREST renvoie souvent un tableau
      return Array.isArray(json) ? (json[0] || json) : json;
    } else {
      Logger.log(`❌ Erreur HTTP ${code}: ${text}`);
      return { error: `HTTP ${code}`, message: text };
    }
  } catch (err) {
    Logger.log('❌ Exception: ' + err.message);
    return { error: err.message };
  }
}


function testInsertPurchaseAllInOne() {
  const props = PropertiesService.getScriptProperties();
  const SUPABASE_URL = props.getProperty('SUPABASE_URL');
  const SUPABASE_ANON_KEY = props.getProperty('SUPABASE_ANON_KEY');
  const BOT_EMAIL = props.getProperty('SUPABASE_BOT_EMAIL');
  const BOT_PASSWORD = props.getProperty('SUPABASE_BOT_PASSWORD');

  /* ========= 1) LOGIN BOT ========= */
  const loginRes = UrlFetchApp.fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
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
    }
  );

  Logger.log('login http=' + loginRes.getResponseCode());
  const loginTxt = loginRes.getContentText();
  Logger.log(loginTxt);

  if (loginRes.getResponseCode() >= 300) {
    throw new Error('Login failed');
  }

  const loginJson = JSON.parse(loginTxt);
  const access_token = loginJson.access_token;
  if (!access_token) {
    throw new Error('No access_token returned');
  }

  /* ========= 2) PAYLOAD PURCHASE ========= */
  const purchase = {
    order_number: 'TEST_' + Date.now(),
    order_date: '2025-12-18',               // ISO DATE
    items_text: '1x SHIMANO Frein XT AVANT', // OBLIGATOIRE
    subtotal: 39.99,
    discount: -8.00,
    vat: 7.25,
    shipping: 11.50,
    grand_total: 43.49
  };

  Logger.log('payload=' + JSON.stringify(purchase));

  /* ========= 3) INSERT ========= */
  const insertRes = UrlFetchApp.fetch(
    `${SUPABASE_URL}/rest/v1/purchases?select=*`,
    {
      method: 'post',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + access_token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,missing=default'
      },
      payload: JSON.stringify(purchase),
      muteHttpExceptions: true
    }
  );

  Logger.log('insert http=' + insertRes.getResponseCode());
  Logger.log(insertRes.getContentText());

  if (insertRes.getResponseCode() >= 300) {
    throw new Error('Insert failed');
  }

  Logger.log('✅ INSERT OK');
}
