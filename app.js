// ============================================================
// HOLD THE LINE — app.js
// ============================================================

// ── DATA ────────────────────────────────────────────────────
const STORAGE_KEY = 'htl_data';
const MILESTONES  = [7, 14, 30, 60, 100, 365];

function defaultData() {
  return {
    days:     {},
    meta:     { bestStreak: 0, acknowledgedMilestones: [] },
    settings: { notificationTime: '20:00', notificationEnabled: false },
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const p = JSON.parse(raw);
    const d = defaultData();
    return {
      days:     p.days     || {},
      meta:     { ...d.meta,     ...p.meta     },
      settings: { ...d.settings, ...p.settings },
    };
  } catch { return defaultData(); }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── STATE ────────────────────────────────────────────────────
let state           = loadData();
let pendingMilestone = null;
let settingsOpen     = false;
let heatmapReady     = false;

// ── DATE UTILS ───────────────────────────────────────────────
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayISO() { return toISODate(new Date()); }

function subtractDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

function formatDisplayDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function getHeatmapDates(weeks = 26) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sun = new Date(today);
  sun.setDate(today.getDate() - today.getDay());
  const result = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(sun);
      dt.setDate(sun.getDate() - w * 7 + d);
      week.push(toISODate(dt));
    }
    result.push(week);
  }
  return result;
}

function monthLabel(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' });
}

// ── STREAK UTILS ─────────────────────────────────────────────
function currentStreak(days) {
  const today = todayISO();
  let cursor = days[today] ? today : subtractDays(today, 1);
  let n = 0;
  while (days[cursor] === 'under') { n++; cursor = subtractDays(cursor, 1); }
  return n;
}

function computeStats(days) {
  const vals = Object.values(days);
  const under = vals.filter(v => v === 'under').length;
  const over  = vals.filter(v => v === 'over').length;
  const total = under + over;
  return { under, over, total, rate: total === 0 ? 0 : Math.round((under / total) * 100) };
}

function recentRate(days, n = 7) {
  const today = todayISO();
  let under = 0, logged = 0;
  for (let i = 0; i < n; i++) {
    const d = subtractDays(today, i);
    if (days[d]) { logged++; if (days[d] === 'under') under++; }
  }
  return logged === 0 ? null : under / logged;
}

// ── QUOTES ───────────────────────────────────────────────────
function hashDate(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

const QUOTES = {
  noData: [
    "You haven't logged a single day. That tells me everything I need to know. Fix it.",
    "Empty record. Empty effort. This app isn't going to use itself, recruit.",
    "I've seen rocks with more initiative. Press a button. Either button. Go.",
    "The battle hasn't started because you haven't shown up. Log something. Today.",
    "Zero data. I can't motivate what I can't measure. Get to work.",
    "You downloaded this app and then did nothing. Classic. Prove me wrong.",
  ],
  streak1to3: [
    "{s} days. My grandmother could do that before her second cup of coffee. Keep moving.",
    "Ooh, {s} days. You want a trophy? The trophy is not being winded walking upstairs. Back to work.",
    "Congratulations on {s} days. That's cute. Now do it again. And again. And again.",
    "{s} days in and you're still here. Good. Don't get sentimental about it.",
    "You're {s} days in. The hard part is remembering you're not allowed to celebrate yet.",
    "Day {s}. You've officially done more than most people who start this kind of thing. Don't let that go to your head.",
    "Fine. {s} days. I've seen worse starts. I've also seen them collapse by day five. Don't.",
  ],
  streak4to13: [
    "{s} days. You've graduated from 'complete disaster' to 'marginally functional.' Don't let it go to your head.",
    "Look at that. {s} days without losing your nerve. There might be hope for you yet.",
    "{s} days. I almost respect you. Almost. Come back after thirty.",
    "You're building something here at {s} days. Don't blow it at a birthday dinner.",
    "{s} days strong. I've had drill sessions shorter than that. Keep your head down and keep going.",
    "At {s} days you're past the point where most quitters quit. I've noticed. Don't make me regret it.",
    "I'm not impressed. But {s} days is more than most recruits manage before they fold. So. Fine.",
  ],
  streak14to29: [
    "{s} days. Now THAT is what I am talking about. You're starting to look like you actually mean this.",
    "Two weeks and change. {s} days. I'll believe it when I see thirty, but you're making a case.",
    "{s} days. The discipline is real. Don't ruin it being stupid on the weekend.",
    "I've seen recruits crack at day three. You're at {s}. I'm taking notes, soldier.",
    "{s} days and you haven't rage-quit yet. I'm surprised. Pleasantly. Don't tell anyone I said that.",
    "At {s} days, your body is starting to notice. Your brain better catch up.",
  ],
  streak30plus: [
    "{s} days. All right. I'll admit it. You've got some fight in you.",
    "A month-plus streak. {s} days. I don't hand out praise lightly, but — good. Now don't screw it up.",
    "{s} days. You've outperformed my expectations, which were extremely low. Congratulations.",
    "I've trained soldiers who couldn't hold a streak half this long. {s} days. You earned a nod. Just a nod.",
    "{s} days of discipline. This is the part where you prove it wasn't a phase.",
    "At {s} days you're not a recruit anymore. You're a soldier. Now act like one every single day.",
    "{s} days. I expected you to fold weeks ago. I was wrong. That doesn't happen often. Don't waste it.",
  ],
  recentBad: [
    "Your recent track record looks like a bad EKG. Get it together.",
    "Under 50% compliance this week. That's not a diet, that's a suggestion you've been ignoring.",
    "The last few days have been rough. I know. You know. The heatmap knows. Fix it.",
    "You've been losing more than you've been winning lately. That ends today. Or it doesn't, and you stay exactly where you are.",
    "Recent performance? Disappointing. But I haven't written you off yet. Don't make me.",
    "Half the time under, half the time not. You're not running a diet, you're flipping a coin. Pick a side.",
  ],
  recentMediocre: [
    "50 to 70% isn't bad. But it also isn't good. Pick a lane and stay in it.",
    "You're hovering around average. Average doesn't transform anything. You know that.",
    "Mediocre consistency gets mediocre results. I'm not saying it to be cruel. I'm saying it because it's true.",
    "You're doing okay. 'Okay' is just another word for 'not quite enough.' Dig deeper.",
    "More than half the time you're winning. The other times you're throwing it away. Stop.",
    "You're trending above average. Now push it to excellent. You know you can. I know you can. Do it.",
  ],
  justLoggedOver: [
    "Over today. Rough. Walk it off and don't let it happen again tomorrow.",
    "You blew it today. Fine. The streak is dead. Start a new one. Right now. Not tomorrow. Now.",
    "Over your limit. I've seen this before. The question is what you do next. Don't make excuses.",
    "Today was a loss. Log it, own it, and come back swinging tomorrow. No sulking.",
    "Over today. Are you disappointed? Good. Stay disappointed long enough to make different choices tomorrow.",
    "One bad day doesn't make a bad you. But don't let it become two. That's how they all start.",
    "Called it. You looked shaky this week. Today proved it. Now prove me wrong tomorrow.",
  ],
  milestone: [
    "I don't say this often, and I mean that: well done, soldier. Now keep going.",
    "You hit a milestone. Most people never get here. You're not most people. Act like it.",
    "I'll be damned. You actually did it. Don't get sentimental — the next one isn't going to earn itself.",
    "This is the part where weaker people stop. You are not going to stop.",
    "Milestone achieved. I won't make a big deal of it. It is a big deal. Now move.",
  ],
};

function determineTier({ streak, todayResult, rRate, totalLogged, hasMilestone }) {
  if (hasMilestone)                              return 'milestone';
  if (totalLogged === 0)                         return 'noData';
  if (todayResult === 'over')                    return 'justLoggedOver';
  if (streak >= 30)                              return 'streak30plus';
  if (streak >= 14)                              return 'streak14to29';
  if (streak >= 4)                               return 'streak4to13';
  if (streak >= 1)                               return 'streak1to3';
  if (rRate !== null && rRate < 0.5)             return 'recentBad';
  if (rRate !== null)                            return 'recentMediocre';
  return 'noData';
}

function getQuote(tier, dateStr, streak) {
  const bucket = QUOTES[tier] || QUOTES.noData;
  return bucket[hashDate(dateStr) % bucket.length].replace(/\{s\}/g, streak);
}

// ── MILESTONE QUOTES ─────────────────────────────────────────
const MILESTONE_QUOTES = {
  7:   "One week. Most recruits don't make it here. I won't make a big deal of it. But it is.",
  14:  "Two weeks of discipline. Your body is starting to notice. Don't let your brain talk you out of it.",
  30:  "A month. A full month. I've trained soldiers who couldn't do this. I'm taking note.",
  60:  "Two months. This is no longer a phase. This is who you are now. Don't forget it.",
  100: "One hundred days. That's not motivation anymore. That's character. Well done, soldier.",
  365: "A year. Three hundred and sixty five days. I don't have words. Just... continue.",
};

// ── ACTIONS ──────────────────────────────────────────────────
function logToday(result) {
  state.days[todayISO()] = result;
  if (result === 'under') {
    const streak = currentStreak(state.days);
    if (streak > state.meta.bestStreak) state.meta.bestStreak = streak;
    const hit = MILESTONES.find(m => streak === m && !state.meta.acknowledgedMilestones.includes(m));
    if (hit) { state.meta.acknowledgedMilestones.push(hit); pendingMilestone = hit; }
  }
  save(); render();
}

function undoToday() {
  delete state.days[todayISO()];
  save(); render();
}

function dismissMilestone() {
  pendingMilestone = null;
  render();
}

async function toggleNotifications() {
  if (state.settings.notificationEnabled) {
    state.settings.notificationEnabled = false;
    save(); render(); return;
  }
  if (typeof Notification === 'undefined') {
    alert('Notifications are not supported in this browser.'); return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    state.settings.notificationEnabled = true;
    save(); render();
  } else {
    alert('Notification permission denied. Enable it in your browser settings.');
  }
}

// ── RENDER ───────────────────────────────────────────────────
function render() {
  const today       = todayISO();
  const todayResult = state.days[today] ?? null;
  const streak      = currentStreak(state.days);
  const stats       = computeStats(state.days);
  const rRate       = recentRate(state.days);

  // Header date
  document.getElementById('date-display').textContent = formatDisplayDate(today);

  // Quote
  const tier = determineTier({ streak, todayResult, rRate, totalLogged: stats.total, hasMilestone: !!pendingMilestone });
  document.getElementById('quote-text').textContent = getQuote(tier, today, streak);

  renderLogger(todayResult);
  renderStats(streak, stats);
  renderHeatmap();
  renderSettings();
  renderMilestone();
}

function renderLogger(todayResult) {
  const el = document.getElementById('logger-section');
  if (todayResult) {
    const u = todayResult === 'under';
    el.innerHTML = `
      <div class="logged-card ${u ? 'under' : 'over'}">
        <div class="logged-result">${u ? 'UNDER' : 'OVER'}</div>
        <div class="logged-sub">Today is logged</div>
        <button class="btn-undo" id="btn-undo">Undo</button>
      </div>`;
    document.getElementById('btn-undo').addEventListener('click', undoToday);
  } else {
    el.innerHTML = `
      <div class="logger-label">Today's Report</div>
      <div class="log-buttons">
        <button class="btn-under" id="btn-under">UNDER</button>
        <button class="btn-over"  id="btn-over">OVER</button>
      </div>`;
    document.getElementById('btn-under').addEventListener('click', () => logToday('under'));
    document.getElementById('btn-over').addEventListener('click',  () => logToday('over'));
  }
}

function renderStats(streak, stats) {
  const rc = stats.rate >= 80 ? 'c-green' : stats.rate >= 60 ? 'c-amber' : 'c-red';
  document.getElementById('stats-section').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value c-amber">${streak}d</div>
        <div class="stat-label">Current Streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-value c-muted">${state.meta.bestStreak}d</div>
        <div class="stat-label">Best Streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-value c-green">${stats.under}</div>
        <div class="stat-label">Days Under</div>
      </div>
      <div class="stat-card">
        <div class="stat-value c-red">${stats.over}</div>
        <div class="stat-label">Days Over</div>
      </div>
      <div class="stat-card span-2">
        <div class="stat-value ${rc}">${stats.rate}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
    </div>`;
}

function renderHeatmap() {
  const weeks = getHeatmapDates(26);
  const today = todayISO();
  const DAY_LABELS = ['S','M','T','W','T','F','S'];

  const monthLabels = weeks.map((week, i) => {
    const label = monthLabel(week[0]);
    return (i === 0 || monthLabel(weeks[i - 1][0]) !== label) ? label : '';
  });

  function cellStyle(date) {
    const future = date > today;
    const result = state.days[date];
    const bg = future ? '#09090b' : !result ? '#27272a' : result === 'under' ? '#22c55e' : '#ef4444';
    const outline = date === today ? 'outline:1.5px solid rgba(255,255,255,0.35);outline-offset:-1px;' : '';
    return `background:${bg};${outline}`;
  }

  const monthRow  = weeks.map((_, i) => `<div class="month-label-cell">${monthLabels[i]}</div>`).join('');
  const dayLabels = DAY_LABELS.map((l, i) => `<div class="day-label">${i % 2 === 0 ? l : ''}</div>`).join('');
  const cols      = weeks.map(week =>
    `<div class="heatmap-col">${week.map(date =>
      `<div class="heatmap-cell" style="${cellStyle(date)}" title="${date}${state.days[date] ? ': ' + state.days[date] : ''}"></div>`
    ).join('')}</div>`
  ).join('');

  const scrollEl = document.getElementById('heatmap-scroll');
  scrollEl.innerHTML = `
    <div class="heatmap-inner">
      <div class="heatmap-day-labels">${dayLabels}</div>
      <div class="heatmap-weeks">
        <div class="heatmap-month-row">${monthRow}</div>
        <div class="heatmap-grid-row">${cols}</div>
      </div>
    </div>`;

  if (!heatmapReady) {
    scrollEl.scrollLeft = scrollEl.scrollWidth;
    heatmapReady = true;
  }
}

function renderSettings() {
  const el = document.getElementById('settings-section');
  if (!settingsOpen) {
    el.innerHTML = `<button class="btn-settings-toggle" id="btn-settings-open">Settings</button>`;
    document.getElementById('btn-settings-open').addEventListener('click', () => { settingsOpen = true; renderSettings(); });
    return;
  }

  const { notificationEnabled, notificationTime } = state.settings;
  el.innerHTML = `
    <div class="settings-panel">
      <div class="settings-header">
        <div class="settings-title">Settings</div>
        <button class="btn-close" id="btn-settings-close">Close</button>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-row-label">Daily Reminder</div>
          <div class="settings-row-sub">Notify if not logged by reminder time</div>
        </div>
        <button class="toggle ${notificationEnabled ? 'on' : 'off'}" id="btn-notif-toggle" aria-label="Toggle notifications">
          <span class="toggle-thumb"></span>
        </button>
      </div>
      ${notificationEnabled ? `
      <div class="settings-row">
        <div class="settings-row-label">Reminder Time</div>
        <input type="time" class="time-input" id="notif-time" value="${notificationTime}">
      </div>` : ''}
      <p class="settings-note">Background notifications require Chrome on Android. On iOS, open the app to trigger your reminder.</p>
    </div>`;

  document.getElementById('btn-settings-close').addEventListener('click', () => { settingsOpen = false; renderSettings(); });
  document.getElementById('btn-notif-toggle').addEventListener('click', toggleNotifications);
  if (notificationEnabled) {
    document.getElementById('notif-time').addEventListener('change', e => {
      state.settings.notificationTime = e.target.value;
      save();
    });
  }
}

function renderMilestone() {
  const overlay = document.getElementById('milestone-overlay');
  if (!pendingMilestone) { overlay.classList.add('hidden'); return; }

  overlay.classList.remove('hidden');
  const quote = MILESTONE_QUOTES[pendingMilestone] || `${pendingMilestone} days straight. Rare. Don't stop now.`;
  document.getElementById('milestone-modal').innerHTML = `
    <span class="milestone-icon">🎖️</span>
    <div class="milestone-badge-label">Milestone Achieved</div>
    <div class="milestone-days">${pendingMilestone}</div>
    <div class="milestone-unit">Days Straight</div>
    <p class="milestone-quote">${quote}</p>
    <button class="btn-dismiss" id="btn-dismiss">Roger That</button>`;

  document.getElementById('btn-dismiss').addEventListener('click', dismissMilestone);
}

// ── NOTIFICATIONS (on-open check) ───────────────────────────
function checkNotification() {
  const { notificationEnabled, notificationTime } = state.settings;
  if (!notificationEnabled) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (state.days[todayISO()]) return;

  const [hh, mm] = notificationTime.split(':').map(Number);
  const now = new Date();
  if (now.getHours() < hh || (now.getHours() === hh && now.getMinutes() < mm)) return;

  const today = todayISO();
  if (localStorage.getItem('htl_last_notif') === today) return;

  new Notification('Hold The Line 🎖️', {
    body: "Have you logged today, soldier? Don't make me ask twice.",
    icon: 'icons/icon-192.png',
    tag:  'daily-reminder',
  });
  localStorage.setItem('htl_last_notif', today);
}

// ── MILESTONE OVERLAY — click outside to dismiss ─────────────
document.getElementById('milestone-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('milestone-overlay')) dismissMilestone();
});

// ── SERVICE WORKER ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed:', err));
}

// ── BOOT ─────────────────────────────────────────────────────
checkNotification();
render();
