// End-to-end check: a teacher builds a quiz in the real UI, hosts it, and three
// players join and play the whole game. Runs against `npm run build:e2e`
// (Firebase replaced by an in-browser fake), so no real data is touched.
//
//   npm run e2e            (needs Playwright + Chromium installed)
//   SHOTS=dir npm run e2e  (also saves screenshots)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist-e2e');
const SHOTS = process.env.SHOTS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures.push(label);
};
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.host !== 'tapblast.test') return route.fulfill({ status: 204, body: '' });
    const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const errors = [];
  const open = async (url, label) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`${label} console: ${m.text()}`));
    p.on('dialog', (d) => d.accept());
    await p.goto(url);
    return p;
  };
  const shot = async (p, name) => SHOTS && (await p.screenshot({ path: path.join(SHOTS, name + '.png') }));

  // ---------- teacher signs in (whitelisted) ----------
  const host = await open('http://tapblast.test/', 'host');
  await host.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('mockdb', JSON.stringify({ tapblast_clean_v1: { accessWhitelist: { 'teacher@test_dev': { email: 'teacher@test.dev', role: 'teacher', enabled: true } } } }));
  });
  await host.reload();
  await host.click('#googleLoginBtn');
  await host.waitForSelector('#library-screen');
  await sleep(300);
  check('default folders created', (await host.textContent('#folderList')).includes('Math'));
  await shot(host, '01-library-empty');

  // ---------- build a 3-question quiz in the editor ----------
  await host.click('#newQuizTile');
  await host.waitForSelector('#editor-screen');
  await host.fill('#quizTitle', 'E2E Quiz');
  await host.check('#shuffleAnswersInput');
  await host.fill('#questionText', '2+2?');
  for (const [i, t] of ['3', '4', '5', '6'].entries()) await host.fill(`[data-answer-text="${i}"]`, t);
  await host.check('input[name="correctAnswer"][value="1"]');
  await host.click('#addQuestionBtn');
  await host.fill('#questionText', 'Sky is blue');
  await host.locator('.question-card').nth(1).locator('.question-type-menu-btn').click();
  await host.click('.question-type-menu:not(.hidden) >> text=True or False');
  await host.locator('.question-card').nth(1).locator('.question-type-menu-btn').click();
  await host.click('.question-type-menu:not(.hidden) >> text=Double points');
  check('double points label shows', (await host.locator('.question-card').nth(1).textContent()).includes('2X'));
  await host.click('#addQuestionBtn');
  await host.locator('.question-card').nth(2).locator('.question-type-menu-btn').click();
  await host.click('.question-type-menu:not(.hidden) >> text=Type Answer');
  await host.fill('#questionText', 'Capital of France');
  await host.fill('#typeAnswerInput', 'Paris');
  await host.locator('.question-card').nth(0).click();
  check('switching questions keeps edits', (await host.inputValue('#questionText')) === '2+2?');
  await shot(host, '02-editor');
  await host.click('#saveQuizBtn');
  await host.waitForSelector('#library-screen');
  await sleep(300);
  check('quiz saved to library', (await host.textContent('#quizGrid')).includes('E2E Quiz'));
  // Short timers so the test runs fast.
  await host.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('mockdb'));
    const qz = Object.values(db.tapblast_clean_v1.quizzes.teacher1)[0];
    qz.questions[0].seconds = 8;
    qz.questions[1].seconds = 5;
    qz.questions[2].seconds = 6;
    localStorage.setItem('mockdb', JSON.stringify(db));
  });
  await host.reload();
  await host.waitForSelector('[data-host]');
  await shot(host, '03-library');

  // ---------- host + 3 players join ----------
  await host.click('[data-host]');
  await host.waitForSelector('#roomCodeDisplay');
  const code = (await host.textContent('#roomCodeDisplay')).trim();
  check('room code shown', /^\d{6}$/.test(code), code);
  const names = ['Ann', 'Bob', 'Cat'];
  const st = [];
  for (const n of names) {
    const p = await open(`http://tapblast.test/?code=${code}`, n);
    await p.fill('#studentName', n);
    await p.click('#studentJoinBtn');
    await p.waitForSelector('#student-screen');
    st.push(p);
  }
  await sleep(400);
  check('lobby shows 3 players', (await host.textContent('#playerCountText')).trim() === '3');
  check('players see waiting room', (await st[0].textContent('#studentPhase')) === 'Waiting Room');
  await shot(host, '04-lobby');
  await shot(st[0], '05-student-lobby');

  const scores = () =>
    host.evaluate((c) => {
      const players = JSON.parse(localStorage.getItem('mockdb')).tapblast_clean_v1.rooms[c].players;
      return Object.fromEntries(Object.values(players).map((p) => [p.name, p]));
    }, code);
  const phase = () => host.evaluate((c) => JSON.parse(localStorage.getItem('mockdb')).tapblast_clean_v1.rooms[c].phase, code);
  const waitPhase = async (ph, timeout = 15000) => {
    const t = Date.now();
    while (Date.now() - t < timeout) {
      if ((await phase()) === ph) return Date.now() - t;
      await sleep(50);
    }
    throw new Error(`timed out waiting for ${ph}, still ${await phase()}`);
  };

  // ---------- Q1: everyone answers -> ends early ----------
  await host.click('#startQuizBtn');
  await sleep(1000);
  // A player update mid-countdown must not restart the countdown.
  await st[2].evaluate((c) => {
    const db = JSON.parse(localStorage.getItem('mockdb'));
    Object.values(db.tapblast_clean_v1.rooms[c].players).forEach((p) => (p.lastSeenAt = Date.now()));
    localStorage.setItem('mockdb', JSON.stringify(db)); // other tabs get a 'storage' event
  }, code);
  const cd = await waitPhase('question_answers');
  check('countdown finishes on time', cd < 2600, `${cd}ms after 1s`);
  await sleep(300);
  const hostOrder = await host.$$eval('#hostAnswers .label-text', (els) => els.map((e) => e.textContent).join(','));
  const stOrder = await st[0].$$eval('#studentAnswerGrid .label-text', (els) => els.map((e) => e.textContent).join(','));
  check('shuffled answers match on host and phone', hostOrder === stOrder, `${hostOrder} / ${stOrder}`);
  await shot(host, '06-host-question');
  await st[0].click('[data-answer-index="1"]');
  await st[0].click('[data-answer-index="0"]', { force: true }).catch(() => {});
  await sleep(1000);
  await st[1].click('[data-answer-index="2"]');
  await sleep(1500);
  await st[2].click('[data-answer-index="1"]');
  const t0 = Date.now();
  await waitPhase('answer_results');
  check('question ends as soon as all answered', Date.now() - t0 < 2500, `${Date.now() - t0}ms (timer 8s)`);
  await sleep(300);
  let s = await scores();
  check('Q1 fast correct ≈1000', s.Ann.score >= 950 && s.Ann.score <= 1000, String(s.Ann.score));
  check('Q1 double tap ignored', s.Ann.currentAnswerIndex === 1);
  check('Q1 wrong = 0', s.Bob.score === 0);
  check('Q1 slower correct scores less', s.Cat.score > 500 && s.Cat.score < s.Ann.score, String(s.Cat.score));
  check('host shows correct answer tile', (await host.locator('.host-answer.correct').count()) === 1);
  check('phone: Correct!', (await st[0].textContent('#studentPhase')) === 'Correct!');
  check('phone: Incorrect + rank', (await st[1].textContent('#studentPhase')) === 'Incorrect' && (await st[1].textContent('#studentResult')).includes('3rd place'));
  await shot(host, '07-host-results');
  await st[0].setViewportSize({ width: 390, height: 800 });
  await shot(st[0], '08-phone-correct');
  check('next button says Scoreboard', (await host.textContent('#nextQuestionBtn')) === 'Scoreboard');
  await host.click('#nextQuestionBtn');
  await host.waitForSelector('#leaderboard-screen');
  check('players see rank on scoreboard', (await st[2].textContent('#studentQuestion')).includes('2nd place'));
  await shot(host, '09-scoreboard');
  await host.click('#leaderboardNextBtn');
  await waitPhase('question_answers');
  await sleep(300);

  // ---------- Q2 (double points): pause doesn't cost points; timer ends it ----------
  await st[0].click('[data-answer-index="0"]');
  await host.click('#pauseBtn');
  await sleep(2000);
  check('phones show Paused', (await st[1].textContent('#studentPhase')) === 'Paused');
  await host.click('#resumeBtn');
  await sleep(200);
  await st[1].click('[data-answer-index="0"]');
  await waitPhase('answer_results');
  await sleep(300);
  s = await scores();
  check('Q2 double points + streak bonus', s.Ann.lastBonus === 100 && s.Ann.lastDelta >= 1900 && s.Ann.lastDelta <= 2100, `+${s.Ann.lastDelta}`);
  check('Q2 pause not counted against player', s.Bob.lastDelta >= 1700, `+${s.Bob.lastDelta}`);
  check('Q2 no answer = 0 and streak reset', s.Cat.lastDelta === 0 && s.Cat.streak === 0 && (await st[2].textContent('#studentPhase')) === "Time's up!");
  await host.click('#nextQuestionBtn');
  await host.waitForSelector('#leaderboard-screen');
  await host.click('#leaderboardNextBtn');
  await waitPhase('question_answers');
  await sleep(300);

  // ---------- Q3 typed answer + Skip ----------
  await st[0].fill('#studentTypedAnswer', ' paris ');
  await st[0].click('#studentTypeSubmit');
  await st[1].fill('#studentTypedAnswer', 'London');
  await st[1].click('#studentTypeSubmit');
  await sleep(500);
  await host.click('#showResultsBtn');
  await waitPhase('answer_results');
  await sleep(300);
  s = await scores();
  check('Q3 typed answer, case-insensitive, streak 3', s.Ann.lastCorrect && s.Ann.lastBonus === 200 && s.Ann.streak === 3);
  check('Q3 wrong typed answer', !s.Bob.lastCorrect && s.Bob.lastDelta === 0);
  check('last question button says Final Results', (await host.textContent('#nextQuestionBtn')) === 'Final Results');
  await host.click('#nextQuestionBtn');
  await host.waitForSelector('#final-screen');
  await sleep(300);
  check('podium shows all players', (await host.locator('.pod').count()) === 3);
  check('phone shows finishing place', (await st[0].textContent('#studentQuestion')).startsWith('You finished 1st!'));
  await shot(host, '10-final');
  await shot(st[1], '11-phone-final');
  await host.click('#finalLibraryBtn');
  await host.waitForSelector('#library-screen');

  // ---------- preview mode from the editor ----------
  await host.click('.quiz-cover');
  await host.waitForSelector('#editor-screen');
  await host.click('#previewQuizBtn');
  await host.waitForSelector('#hostLobby');
  check('preview lobby has no join link', (await host.textContent('#joinUrlLabel')) === 'Preview mode');
  await host.click('#startQuizBtn');
  await sleep(3500);
  await host.click('#showResultsBtn');
  await host.waitForSelector('#nextQuestionBtn');
  await host.click('#nextQuestionBtn');
  await host.waitForSelector('#leaderboard-screen');
  await host.click('#leaderboardEndBtn');
  await host.waitForSelector('#editor-screen');
  check('preview returns to editor', true);
  await host.click('#editorBackBtn');

  // ---------- settings ----------
  await host.click('#settingsBtn');
  await host.waitForSelector('#settingsModal');
  for (const tab of ['Sharing', 'Backup', 'Defaults']) await host.click(`.settings-tab >> text=${tab}`);
  await host.fill('#defaultSecondsInput', '30');
  await host.click('#saveDefaultsBtn');
  await sleep(200);
  check('defaults saved', (await host.textContent('#defaultsSavedLine')) === 'Saved.');
  await shot(host, '12-settings');
  await host.click('#settingsCloseBtn');

  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll checks passed');
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('E2E crashed:', err);
  process.exit(1);
});
