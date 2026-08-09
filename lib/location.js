// Pure logic for GPS fix labeling and precision checks. No DOM, no network.
// Shared by the STOPS mode map dot and ROUTE mode's "use my location" pickup
// button — both read a fix through this module, neither owns it.

function formatGpsFallbackLabel(lat, lng) {
  return `Current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

function isPreciseFix(accuracyMeters, thresholdMeters = 300) {
  return typeof accuracyMeters === 'number' && accuracyMeters <= thresholdMeters;
}

module.exports = { formatGpsFallbackLabel, isPreciseFix };
