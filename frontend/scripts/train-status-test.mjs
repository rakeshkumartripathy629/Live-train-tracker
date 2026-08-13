// Unit tests for the shared train-status classifier (frontend/lib/train-status.ts).
// Run: node scripts/train-status-test.mjs  (Node 22+ type stripping)
import {
  classifyTrainStatus,
  classifyBetween,
  groupBetweenTrains,
  istInstant,
  istParts,
  IST_TZ,
} from '../lib/train-status.ts';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function istPartsAt(ms) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const nums = fmt.format(new Date(ms)).split(/[^\d]+/).filter(Boolean).map(Number);
  return { y: nums[0], m: nums[1], d: nums[2], h: nums[3], mi: nums[4] };
}

// Schedule time "HH:MM" offset minutes from now, with correct IST day offset
// (handles midnight crossing for overnight trains).
function schedFromNow(offsetMinutes) {
  const now = istPartsAt(Date.now());
  const t = istPartsAt(Date.now() + offsetMinutes * 60000);
  return {
    time: `${String(t.h).padStart(2, '0')}:${String(t.mi).padStart(2, '0')}`,
    day: t.d - now.d + 1,
  };
}

// CASE 1: Future scheduled departure -> UPCOMING
check('C1 future schedule', classifyTrainStatus({ scheduledDeparture: schedFromNow(120) }), 'UPCOMING');

// CASE 2: Real RailRadar status departed -> DEPARTED (even if schedule is future)
check('C2 live departed', classifyTrainStatus({ liveType: 'departed', scheduledDeparture: schedFromNow(120) }), 'DEPARTED');

// CASE 3: Actual departure timestamp exists -> DEPARTED
check('C3 actual departure', classifyTrainStatus({ scheduledDeparture: schedFromNow(-120), actualDeparture: schedFromNow(-100) }), 'DEPARTED');

// CASE 4: Scheduled departure passed, no live -> DEPARTURE_PASSED_UNCONFIRMED
check('C4 passed unconfirmed', classifyTrainStatus({ scheduledDeparture: schedFromNow(-90) }), 'DEPARTURE_PASSED_UNCONFIRMED');

// CASE 5: Real source says completed -> COMPLETED
check('C5 completed', classifyTrainStatus({ liveType: 'completed', scheduledDeparture: schedFromNow(120) }), 'COMPLETED');

// CASE 6: Overnight / midnight crossing. 00:20 next day must sort after 23:50 today.
check('C6 next-day > today midnight', istInstant('00:20', 2) > istInstant('23:50', 1), true);
check('C6b overnight upcoming', classifyTrainStatus({ scheduledDeparture: schedFromNow(50) }), 'UPCOMING');

// CASE 7: Departed but still running -> DEPARTED (live wins over schedule)
check('C7 departed running', classifyTrainStatus({ liveType: 'departed', scheduledDeparture: schedFromNow(120) }), 'DEPARTED');

// CASE 8: Future departure with delay -> UPCOMING (delay does not change status)
check('C8 upcoming with delay', classifyTrainStatus({ liveType: 'scheduled', scheduledDeparture: schedFromNow(120) }), 'UPCOMING');

// CASE 9: API unavailable -> no live, fall back to schedule only, never fabricate
check('C9a no live future', classifyTrainStatus({ scheduledDeparture: schedFromNow(120) }), 'UPCOMING');
check('C9b no live passed', classifyTrainStatus({ scheduledDeparture: schedFromNow(-120) }), 'DEPARTURE_PASSED_UNCONFIRMED');
check('C9c no data at all', classifyTrainStatus({}), 'DEPARTURE_PASSED_UNCONFIRMED');

// Other live type mappings
check('at-station -> UPCOMING', classifyTrainStatus({ liveType: 'at-station' }), 'UPCOMING');
check('upcoming -> UPCOMING', classifyTrainStatus({ liveType: 'upcoming' }), 'UPCOMING');
check('running alone is NOT departed (schedule future)', classifyTrainStatus({ liveType: 'running', scheduledDeparture: schedFromNow(120) }), 'UPCOMING');
check('arrived -> COMPLETED', classifyTrainStatus({ liveType: 'arrived' }), 'COMPLETED');
check('garbage live type falls back to schedule', classifyTrainStatus({ liveType: 'zzz', scheduledDeparture: schedFromNow(120) }), 'UPCOMING');

// CASE 10: Multiple trains -> grouping + sorting (times relative to now)
const mk = (num, sched, liveType) => ({
  number: num,
  from: { departure: sched.time, day: sched.day },
  to: { arrival: '09:00', day: 1 },
  live: liveType ? { type: liveType } : undefined,
});
const t1 = mk('A', schedFromNow(-120), 'departed');
const t2 = mk('B', schedFromNow(-60), 'departed');
const t3 = mk('C', schedFromNow(120), undefined);
const t4 = mk('D', schedFromNow(240), undefined);
const t5 = mk('E', schedFromNow(-30), 'completed');
const groups = groupBetweenTrains([t4, t1, t3, t5, t2]);
check('C10 upcoming sorted ascending', groups.upcoming.map((t) => t.number), ['C', 'D']);
check('C10 departed sorted most-recent-first', groups.departed.map((t) => t.number), ['B', 'A']);
check('C10 completed grouped', groups.completed.map((t) => t.number), ['E']);
check('C10 passedUnconfirmed empty', groups.passedUnconfirmed.length, 0);
check('C10 classifyBetween', classifyBetween(mk('X', schedFromNow(0), 'departed')), 'DEPARTED');

console.log(`\ntrain-status: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
