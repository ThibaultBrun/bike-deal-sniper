function toYMD(dateStr) {
  var d = new Date(dateStr); // ex: "Thu Dec 18 15:18:08 GMT+01:00 2025"
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy/MM/dd");
}

