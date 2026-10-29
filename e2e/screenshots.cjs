// Screenshots of every screen at phone, tablet and desktop sizes, for checking
// layout. Runs against `npm run build:e2e` (fake Firebase, no real data).
//
//   npm run screenshots              -> e2e/screenshots/<size>/<screen>.png
//   SIZES=phone,desktop npm run screenshots
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist-e2e');
const OUT = process.env.OUT || path.join(__dirname, 'screenshots');
const ALL_SIZES = {
  phone: { width: 375, height: 740, isMobile: true, hasTouch: true },
  phoneL: { width: 430, height: 932, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true },
  desktop: { width: 1280, height: 800 },
  wide: { width: 1920, height: 1080 },
};
const SIZES = (process.env.SIZES || Object.keys(ALL_SIZES).join(',')).split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const CODE = '246810';
const IMG =
  'data:image/svg+xml;base64,' +
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#93c5fd"/><circle cx="320" cy="200" r="120" fill="#2563eb"/></svg>').toString('base64');

const q = (id, over) => ({ id, type: 'quiz', text: '', seconds: 20, media: null, answers: [], correctIndex: 0, typeAnswer: '', ...over });
const ans = (...t) => t.map((text, i) => ({ id: 'a' + i, text, media: null }));
const QUIZ = {
  id: 'quiz1',
  title: 'World War II Review',
  folderId: '',
  cover: null,
  shuffleAnswers: false,
  updatedAt: 1,
  questions: [
    q('q1', { text: 'Which alliance included the United States, the United Kingdom, the Soviet Union, and France?', answers: ans('Axis Powers', 'Allied Powers', 'Central Powers', 'League of Nations'), correctIndex: 1 }),
    q('q2', { type: 'truefalse', text: 'D-Day took place on June 6, 1944.', answers: ans('True', 'False'), correctIndex: 0, pointsMultiplier: 2 }),
    q('q3', { type: 'type', text: 'What German word means "lightning war"?', typeAnswer: 'Blitzkrieg' }),
    q('q4', { text: 'What does this picture show?', media: { type: 'image', dataUrl: IMG }, answers: ans('A circle', 'A square', 'A triangle', 'A star'), correctIndex: 0 }),
  ],
};
const names = ['Ann', 'Bob', 'Cat', 'Dmitri the Great', 'Eve', 'Finn', 'Gus', 'Hana'];
const PLAYERS = Object.fromEntries(
  names.map((name, i) => [
    'p' + i,
    { name, joinedAt: i, score: 4000 - i * 430, streak: Math.max(0, 3 - i), avatarEmoji: ['🐶', '🐱', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵'][i], avatarColor: '#2563eb', answerQ: -1, rank: i + 1, prevRank: i === 1 ? 3 : i === 2 ? 2 : i + 1, lastDelta: 900 - i * 80, behindName: i ? names[i - 1] : '', behindBy: i ? 430 : 0 },
  ]),
);

function seedDb(room) {
  return {
    tapblast_clean_v1: {
      accessWhitelist: { 'teacher@test_dev': { email: 'teacher@test.dev', role: 'teacher', enabled: true } },
      folders: { teacher1: { f1: { id: 'f1', name: 'History', updatedAt: 1 }, f2: { id: 'f2', name: 'Science', updatedAt: 1 } } },
      quizzes: {
        teacher1: {
          quiz1: QUIZ,
          quiz2: { ...QUIZ, id: 'quiz2', title: 'Fractions Fundamentals with a really long quiz title that wraps', folderId: 'f2', cover: IMG },
          quiz3: { ...QUIZ, id: 'quiz3', title: 'Cells', folderId: 'f2' },
        },
      },
      ...(room ? { rooms: { [CODE]: room }, hostSessions: { teacher1: { roomCode: CODE } } } : {}),
    },
  };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const size of SIZES) {
    const vp = ALL_SIZES[size];
    const dir = path.join(OUT, size);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1 });
    await ctx.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.host !== 'tapblast.test') return route.fulfill({ status: 204, body: '' });
      const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    const page = async (label) => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${size} ${label}: ${e.message}`));
      p.on('dialog', (d) => d.dismiss());
      return p;
    };
    const shot = async (p, name) => {
      await sleep(450);
      await p.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
    };
    // Writes from this page reach the other tabs via the 'storage' event.
    const control = await page('control');
    await control.goto('http://tapblast.test/legacy-none');
    const writeDb = (db) => control.evaluate((d) => localStorage.setItem('mockdb', JSON.stringify(d)), db);
    const patchRoom = (patch) =>
      control.evaluate(
        ([code, patch]) => {
          const db = JSON.parse(localStorage.getItem('mockdb'));
          const room = db.tapblast_clean_v1.rooms[code];
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'players') for (const [pid, pp] of Object.entries(v)) Object.assign(room.players[pid], pp);
            else room[k] = v;
          }
          localStorage.setItem('mockdb', JSON.stringify(db));
        },
        [CODE, patch],
      );

    // ---------- teacher: login, library, editor, settings ----------
    await control.evaluate(() => localStorage.clear());
    await writeDb(seedDb(null));
    const t = await page('teacher');
    await t.goto('http://tapblast.test/');
    await t.waitForSelector('#googleLoginBtn');
    await shot(t, '01-login');
    await t.click('#googleLoginBtn');
    await t.waitForSelector('[data-host]');
    await shot(t, '02-library');
    if (await t.isVisible('#mobileFoldersBtn')) {
      await t.click('#mobileFoldersBtn');
      await shot(t, '03-library-folders-drawer');
      await t.click('#foldersBackdrop', { force: true }).catch(() => {});
      await t.evaluate(() => document.body.classList.remove('folders-open'));
    }
    await t.locator('.option2-more-btn').first().click();
    await shot(t, '04-library-menu');
    await t.locator('.option2-more-btn').first().click();
    await t.click('#newFolderBtn', { force: true }).catch(() => {});
    await t.evaluate(() => document.body.classList.remove('folders-open'));
    if (await t.isVisible('#folderModal')) {
      await shot(t, '05-folder-modal');
      await t.click('#folderModalCancel');
    }
    await t.locator('.quiz-cover').first().click();
    await t.waitForSelector('#editor-screen');
    await shot(t, '06-editor');
    await t.locator('.question-card').nth(2).evaluate((el) => el.click());
    await shot(t, '07-editor-type-answer');
    await t.locator('.question-card').nth(0).locator('.question-type-menu-btn').evaluate((el) => el.click());
    await shot(t, '08-editor-question-menu');
    await t.locator('#editorBackBtn').evaluate((el) => el.click());
    await t.waitForSelector('#settingsBtn');
    await t.evaluate(() => document.getElementById('settingsBtn').click());
    await shot(t, '09-settings');
    await t.locator('.settings-tab >> text=Backup').evaluate((el) => el.click());
    await shot(t, '10-settings-backup');
    await t.close();

    // ---------- live game: host + one player ----------
    const room = { code: CODE, hostUid: 'teacher1', hostName: 'Teacher', quiz: QUIZ, currentQ: 0, phase: 'lobby', players: PLAYERS, updatedAt: 1 };
    await writeDb(seedDb(room));
    const s = await page('student');
    await s.goto(`http://tapblast.test/?code=${CODE}`);
    await s.waitForSelector('#studentJoinBtn');
    await shot(s, '20-phone-join');
    await s.evaluate(() => sessionStorage.setItem('tapblast_player_246810', 'p2'));
    await s.fill('#studentName', 'Cat');
    await s.click('#studentJoinBtn');
    await s.waitForSelector('#student-screen');
    await shot(s, '21-phone-lobby');

    const h = await page('host');
    await h.goto('http://tapblast.test/');
    await h.waitForSelector('#roomCodeDisplay');
    await shot(h, '30-host-lobby');

    const far = () => Date.now() + 10 * 60 * 1000;
    const answering = (qi) => ({ currentQ: qi, phase: 'question_answers', currentQuestionStartedAt: Date.now(), currentQuestionDurationMs: 20000, currentQuestionEndsAt: far() });
    await patchRoom({ phase: 'countdown', countdownEndsAt: Date.now() + 2500 });
    await sleep(300);
    await h.screenshot({ path: path.join(dir, '31-host-countdown.png'), fullPage: true });
    await s.screenshot({ path: path.join(dir, '22-phone-countdown.png'), fullPage: true });
    await sleep(2600);

    const results = (qi, correctIdx) => {
      const players = {};
      Object.keys(PLAYERS).forEach((pid, i) => {
        const right = i % 3 !== 1;
        players[pid] = { answerQ: qi, currentAnswerIndex: right ? correctIdx : (correctIdx + 1) % 2, lastAnswered: true, lastCorrect: right, lastDelta: right ? 900 - i * 40 : 0, lastBonus: right && i < 2 ? 200 : 0 };
      });
      return { phase: 'answer_results', players };
    };
    for (const [qi, label, correct] of [
      [0, 'quiz', 1],
      [1, 'truefalse', 0],
      [2, 'type', 0],
      [3, 'media', 0],
    ]) {
      await patchRoom({ ...answering(qi), players: Object.fromEntries(Object.keys(PLAYERS).map((pid) => [pid, { answerQ: -1, currentAnswerIndex: null, currentTypedAnswer: null }])) });
      await shot(h, `32-host-question-${label}`);
      await shot(s, `23-phone-question-${label}`);
      if (qi === 0) {
        await s.locator('[data-answer-index="1"]').click();
        await shot(s, '24-phone-answered');
        await patchRoom({ phase: 'paused', currentRemainingMs: 12000 });
        await shot(h, '33-host-paused');
      }
      const r = results(qi, correct);
      if (qi === 2) Object.values(r.players).forEach((p, i) => ((p.currentAnswerIndex = null), (p.currentTypedAnswer = i % 3 !== 1 ? 'blitzkrieg' : 'nope')));
      await patchRoom(r);
      await shot(h, `34-host-results-${label}`);
      await shot(s, `25-phone-results-${label}`);
    }
    await patchRoom({ players: { p2: { lastCorrect: false, lastAnswered: true, lastDelta: 0, lastBonus: 0 } } });
    await shot(s, '26-phone-results-wrong');
    await patchRoom({ phase: 'leaderboard' });
    await shot(h, '35-host-scoreboard');
    await shot(s, '27-phone-scoreboard');
    await patchRoom({ phase: 'final' });
    await shot(h, '36-host-final');
    await shot(s, '28-phone-final');
    await ctx.close();
  }
  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
