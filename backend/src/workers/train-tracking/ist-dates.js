// IST date helpers (UTC+5:30, no DST). journeyDate is a YYYY-MM-DD string in
// IST, matching how the Next.js journey API validates dates.

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

function istDateString(date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

module.exports = { istDateString };
