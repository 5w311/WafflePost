// Pure helpers for HERE Autosuggest wiring. No DOM, no network.

// Minimum characters before firing a query — keeps call volume sane on a
// shared, unlocked key (autosuggest fires far more often than the once-
// per-plan geocode/route calls elsewhere in this app).
const MIN_QUERY_LEN = 3;

function shouldFireQuery(text) {
  return typeof text === 'string' && text.trim().length >= MIN_QUERY_LEN;
}

// Turn one HERE /autosuggest response item into either a ready-to-use
// candidate (position already present — the common case for 'place' and
// address-type results) or a flag that it needs a follow-up /lookup call
// (categoryQuery/chainQuery items carry no position of their own).
function candidateFromSuggestItem(item) {
  if (!item || !item.title) return null;
  const label = (item.address && item.address.label) || item.title;
  if (item.position && typeof item.position.lat === 'number' && typeof item.position.lng === 'number') {
    return { lat: item.position.lat, lng: item.position.lng, label, id: item.id, needsLookup: false };
  }
  return { label, id: item.id, needsLookup: true };
}

module.exports = { MIN_QUERY_LEN, shouldFireQuery, candidateFromSuggestItem };
