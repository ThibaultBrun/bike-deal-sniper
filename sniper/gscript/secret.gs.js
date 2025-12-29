function setupSecrets() {
  const sp = PropertiesService.getScriptProperties();
  sp.setProperties({
    SUPABASE_URL: 'XXXXXXXXXX',
    SUPABASE_ANON_KEY: 'XXXXXXXXXX',
    SUPABASE_BOT_UUID : 'XXXXXXXXXX',
    SUPABASE_BOT_EMAIL: 'XXXXXXXXXX',
    SUPABASE_BOT_PASSWORD: 'XXXXXXXXXX',
    GEMINI_API_KEY: 'XXXXXXXXXX'

  }, true); // true = overwrite
  Logger.log('OK: secrets enregistrés');
}

