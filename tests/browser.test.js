'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const test = require('node:test');
const puppeteer = require('puppeteer-core');
const pack = require('../data/online-exercises.json');
const marking = require('../js/marking.js');
const { createServer } = require('./serve.js');

const byId = {};
marking.listQuestions(pack).forEach(function (item) {
  byId[item.question.id] = item.question;
});

const MODEL_SENTENCES = [
  'I want to be a dog trainer when I grow up because I love animals.',
  'Dog trainers need to be patient and calm.',
  'I am going to read training books so that I can learn how to teach dogs new skills.',
];

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find(function (candidate) { return fs.existsSync(candidate); });
}

async function installGuards(page) {
  await page.evaluateOnNewDocument(function () {
    window.__persistLog = [];
    function mark(name) { window.__persistLog.push(name); }
    function wrap(storage, label) {
      ['setItem', 'removeItem', 'clear'].forEach(function (method) {
        const original = storage[method];
        storage[method] = function () {
          mark(label + '.' + method);
          return original.apply(this, arguments);
        };
      });
    }
    wrap(window.localStorage, 'localStorage');
    wrap(window.sessionStorage, 'sessionStorage');
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = function () {
      mark('indexedDB.open');
      return open.apply(indexedDB, arguments);
    };
    const removeDb = indexedDB.deleteDatabase.bind(indexedDB);
    indexedDB.deleteDatabase = function () {
      mark('indexedDB.deleteDatabase');
      return removeDb.apply(indexedDB, arguments);
    };
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (desc && desc.set) {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: function () { return desc.get.call(document); },
        set: function (value) { mark('cookie.set'); return desc.set.call(document, value); },
      });
    }
    if (navigator.serviceWorker && navigator.serviceWorker.register) {
      const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = function () {
        mark('serviceWorker.register');
        return register.apply(navigator.serviceWorker, arguments);
      };
    }
  });
}

async function auditLayout(page, label) {
  const report = await page.evaluate(function () {
    const selectors = ['body', 'button', 'textarea', 'input[type="text"]', 'label', '.option-text', '.stem', '.passage', 'p', 'h1', 'h2', 'h3'];
    const seen = new Set();
    const offenders = [];
    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        if (seen.has(el)) return;
        seen.add(el);
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const size = parseFloat(style.fontSize);
        if (!(size >= 18)) {
          offenders.push({
            selector: selector,
            size: size,
            text: (el.innerText || el.value || '').slice(0, 80),
          });
        }
      });
    });
    return {
      offenders: offenders,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  assert.deepEqual(report.offenders, [], label + ' small text ' + JSON.stringify(report.offenders));
  assert.ok(
    report.scrollWidth <= report.clientWidth + 1,
    label + ' overflow ' + report.scrollWidth + ' > ' + report.clientWidth
  );
}

test.describe('headless browser', function () {
  let browser;
  let server;
  let origin;
  const cookieHeaders = [];

  test.before(async function () {
    const executablePath = chromePath();
    assert.ok(executablePath, 'Chrome is required for browser tests');
    server = createServer();
    await new Promise(function (resolve) {
      server.listen(0, '127.0.0.1', resolve);
    });
    origin = 'http://127.0.0.1:' + server.address().port;
    browser = await puppeteer.launch({
      executablePath: executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }, { timeout: 60000 });

  test.after(async function () {
    if (browser) await browser.close();
    if (server) {
      await new Promise(function (resolve, reject) {
        server.close(function (err) { if (err) reject(err); else resolve(); });
      });
    }
  });

  async function openPage(viewport, path) {
    const page = await browser.newPage();
    const requests = [];
    const pageErrors = [];
    page.on('request', function (request) { requests.push(request); });
    page.on('response', function (response) {
      if (response.headers()['set-cookie']) cookieHeaders.push(response.url());
    });
    page.on('pageerror', function (error) { pageErrors.push(String(error)); });
    await installGuards(page);
    await page.setCacheEnabled(false);
    await page.setViewport(viewport);
    const response = await page.goto(origin + path, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('[data-station="S5"]');
    assert.equal(response.headers()['set-cookie'], undefined);
    assert.deepEqual(pageErrors, []);
    return { page: page, requests: requests, pageErrors: pageErrors };
  }

  async function openStation(page, stationId) {
    await page.click('[data-station="' + stationId + '"]');
    await page.waitForSelector('[data-region="intro-zh"]');
    const intro = await page.$eval('[data-region="intro-zh"]', function (el) { return el.textContent; });
    const station = pack.stations.find(function (item) { return item.id === stationId; });
    assert.equal(intro, station.intro_zh);
    await page.click('[data-action="start-station"]');
    await page.waitForSelector('[data-question-id="' + station.questions[0].id + '"]');
  }

  async function jump(page, index, question) {
    await page.click('[data-q-index="' + index + '"]');
    await page.waitForSelector('[data-question-id="' + question.id + '"]');
    const rendered = await page.evaluate(function () {
      return {
        prompt: document.querySelector('[data-region="prompt"]').textContent,
        promptZh: document.querySelector('[data-region="prompt-zh"]').textContent,
        options: Array.from(document.querySelectorAll('.option-text')).map(function (el) { return el.textContent; }),
        stimulus: document.querySelector('[data-region="stimulus"]')
          ? document.querySelector('[data-region="stimulus"]').textContent
          : null,
        hint: Boolean(document.querySelector('[data-region="hint"]')),
      };
    });
    assert.equal(rendered.prompt, question.prompt);
    assert.equal(rendered.promptZh, question.prompt_zh);
    assert.equal(rendered.hint, false);
    if (question.stimulus) assert.equal(rendered.stimulus, question.stimulus);
    else assert.equal(rendered.stimulus, null);
    if (question.type === 'mcq') {
      assert.deepEqual(rendered.options, question.options.map(function (option) { return option.text; }));
    }
  }

  async function setField(page, selector, value) {
    await page.$eval(selector, function (el, next) {
      el.value = next;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }

  async function score(page) {
    return page.evaluate(function () {
      function text(name) {
        return document.querySelector('[data-score="' + name + '"]').textContent;
      }
      return {
        autoCorrect: text('auto-correct'),
        autoTotal: text('auto-total'),
        firstCorrect: text('first-correct'),
        retryCorrect: text('retry-correct'),
        writing: text('writing'),
        writingTotal: text('writing-total'),
      };
    });
  }

  test('station menu shows 8/7/7/7/7 and 35 auto plus 1 writing', { timeout: 60000 }, async function () {
    const opened = await openPage({ width: 414, height: 896 }, '/');
    try {
      const counts = await opened.page.evaluate(function () {
        return ['S1', 'S2', 'S3', 'S4', 'S5'].map(function (id) {
          const button = document.querySelector('[data-station="' + id + '"]');
          return { id: id, total: button.getAttribute('data-total'), text: button.innerText };
        });
      });
      assert.deepEqual(counts.map(function (item) { return item.total; }), ['8', '7', '7', '7', '7']);
      const totals = await score(opened.page);
      assert.equal(totals.autoTotal, '35');
      assert.equal(totals.autoCorrect, '0');
      assert.equal(totals.writingTotal, '1');
      assert.equal(totals.writing, '未提交');
      const notice = await opened.page.$eval('[data-region="memory-notice"]', function (el) { return el.textContent; });
      assert.match(notice, /重新載入/);
      assert.match(notice, /重新開始/);
      const disclaimer = await opened.page.$eval('[data-region="disclaimer"]', function (el) { return el.textContent; });
      assert.match(disclaimer, /不代表正式成績/);
      assert.match(disclaimer, /不代表已掌握/);
      await auditLayout(opened.page, 'menu-414');
      const media = await opened.page.evaluate(function () {
        return {
          images: document.images.length,
          audio: document.querySelectorAll('audio, video, iframe').length,
        };
      });
      assert.equal(media.images, 0);
      assert.equal(media.audio, 0);
    } finally {
      await opened.page.close();
    }
  });

  test('wrong attempt reveals only the hint; retry-correct stays distinct from first-correct', { timeout: 60000 }, async function () {
    const opened = await openPage({ width: 414, height: 896 }, '/');
    const page = opened.page;
    try {
      await openStation(page, 'S1');
      await jump(page, 0, byId['S1-Q01']);
      await page.click('input[name="answer"][value="A"]');
      await page.click('[data-action="submit"]');
      await page.waitForSelector('[data-status="awaiting_retry"]');
      const hint = await page.$eval('[data-region="hint-text"]', function (el) { return el.textContent; });
      assert.equal(hint, byId['S1-Q01'].hints.first_error);
      assert.equal(await page.$('[data-region="feedback-explanatory"]'), null);
      assert.equal(await page.$('[data-region="feedback-correct"]'), null);
      assert.equal(await page.$('[data-resolved-key="true"]'), null);
      assert.equal(await page.$eval('[data-region="first-result"]', function (el) { return el.textContent; }), '第一次作答：不正確');
      await page.click('input[name="answer"][value="B"]');
      await page.click('[data-action="submit"]');
      await page.waitForSelector('[data-status="retry_correct"]');
      assert.equal(await page.$eval('[data-first-result]', function (el) { return el.getAttribute('data-first-result'); }), 'incorrect');
      assert.equal(await page.$eval('[data-region="retry-result"]', function (el) { return el.textContent; }), '重試結果：正確（提示後答對，並非首次答對）');
      assert.equal(await page.$eval('[data-region="feedback-explanatory"]', function (el) { return el.textContent; }), byId['S1-Q01'].feedback.explanatory);
      assert.equal(await page.$('[data-action="submit"]'), null);

      const gaps = [
        ['S1', 5, 'S1-Q06', 'cheer ful', 'Cheerful.'],
        ['S1', 6, 'S1-Q07', 'artisticc', 'ARTISTIC!'],
        ['S2', 2, 'S2-Q03', 'calm', null],
        ['S2', 5, 'S2-Q06', 'showing', 'Show.'],
        ['S3', 4, 'S3-Q05', 'play', 'Playing!'],
        ['S3', 6, 'S3-Q07', 'so', 'so that'],
      ];
      for (const row of gaps) {
        await page.click('[data-action="menu"]');
        await openStation(page, row[0]);
        await jump(page, row[1], byId[row[2]]);
        const scoreBefore = await page.$eval('[data-score="auto-correct"]', function (el) { return el.textContent; });
        await setField(page, '[data-field="gap"]', row[3]);
        await page.click('[data-action="submit"]');
        await page.waitForSelector('[data-question-id="' + row[2] + '"][data-status="awaiting_retry"]');
        assert.equal(await page.$eval('[data-region="hint-text"]', function (el) { return el.textContent; }), byId[row[2]].hints.first_error);
        assert.equal(await page.$('[data-region="feedback-explanatory"]'), null);
        assert.equal(await page.$eval('[data-score="auto-correct"]', function (el) { return el.textContent; }), scoreBefore);
        if (row[2] === 'S3-Q07') {
          const mainText = await page.$eval('#main', function (el) { return el.innerText; });
          assert.equal(mainText.includes(byId['S3-Q07'].feedback.explanatory), false);
          assert.equal(mainText.includes('正確。應填 so that。'), false);
        }
        if (row[4] == null) {
          await setField(page, '[data-field="gap"]', 'calmly');
          await page.click('[data-action="submit"]');
          await page.waitForSelector('[data-status="final_incorrect"]');
          assert.equal(await page.$eval('[data-region="feedback-explanatory"]', function (el) { return el.textContent; }), byId[row[2]].feedback.explanatory);
          assert.equal(await page.$('[data-region="feedback-correct"]'), null);
          assert.equal(await page.$eval('[data-field="gap"]', function (el) { return el.value; }), 'calmly');
          assert.equal(await page.$('[data-action="submit"]'), null);
          assert.equal(await page.$eval('[data-attempts]', function (el) { return el.getAttribute('data-attempts'); }), '2');
        } else {
          await setField(page, '[data-field="gap"]', row[4]);
          await page.click('[data-action="submit"]');
          await page.waitForSelector('[data-question-id="' + row[2] + '"][data-status="retry_correct"]');
          assert.equal(await page.$eval('[data-region="first-result"]', function (el) { return el.getAttribute('data-first-result'); }), 'incorrect');
          assert.match(await page.$eval('[data-region="retry-result"]', function (el) { return el.textContent; }), /並非首次答對/);
          assert.equal(await page.$eval('[data-region="feedback-correct"]', function (el) { return el.textContent; }), byId[row[2]].feedback.correct);
        }
      }
      const totals = await score(page);
      assert.equal(totals.firstCorrect, '0');
      assert.equal(totals.retryCorrect, '6');
      assert.equal(totals.autoCorrect, '6');
      assert.equal(totals.autoTotal, '35');
      await auditLayout(page, 'retry-414');
    } finally {
      await page.close();
    }
  });

  test('all 36 items render and the 35 auto items can be first-correct at 414px', { timeout: 180000 }, async function () {
    const opened = await openPage({ width: 414, height: 896 }, '/');
    const page = opened.page;
    const variants = {
      'S1-Q06': 'Cheerful.',
      'S1-Q07': 'ARTISTIC!',
      'S2-Q03': '  Fearless  ',
      'S2-Q06': 'Show.',
      'S3-Q05': 'Playing!',
      'S3-Q07': 'So   that',
    };
    try {
      for (const station of pack.stations) {
        await openStation(page, station.id);
        const jumpCount = await page.$$eval('[data-q-index]', function (nodes) { return nodes.length; });
        assert.equal(jumpCount, station.questions.length);
        for (let index = 0; index < station.questions.length; index += 1) {
          const question = station.questions[index];
          await jump(page, index, question);
          await auditLayout(page, question.id + '-414');
          if (question.type === 'mcq') {
            await page.click('input[name="answer"][value="' + question.correct_option_id + '"]');
            await page.click('[data-action="submit"]');
            await page.waitForSelector('[data-question-id="' + question.id + '"][data-status="first_correct"]');
            assert.equal(await page.$('[data-region="hint"]'), null);
            assert.equal(await page.$eval('[data-region="first-result"]', function (el) { return el.textContent; }), '第一次作答：正確');
            assert.equal(await page.$eval('[data-region="feedback-explanatory"]', function (el) { return el.textContent; }), question.feedback.explanatory);
          } else if (question.type === 'gap') {
            await setField(page, '[data-field="gap"]', variants[question.id]);
            await page.click('[data-action="submit"]');
            await page.waitForSelector('[data-question-id="' + question.id + '"][data-status="first_correct"]');
            assert.equal(await page.$('[data-region="hint"]'), null);
          } else {
            const writing = 'Mr. Brown said I can try. Vets need to be caring. I am going to read so that I can learn.';
            await setField(page, '[data-field="writing"]', '   \n\t');
            await page.click('[data-action="submit"]');
            assert.equal(await page.$eval('[data-status]', function (el) { return el.getAttribute('data-status'); }), 'unanswered');
            assert.match(await page.$eval('[data-region="form-message"]', function (el) { return el.textContent; }), /請先寫下答案/);
            await setField(page, '[data-field="writing"]', writing);
            await page.click('[data-action="submit"]');
            await page.waitForSelector('[data-status="teacher_submitted"]');
            assert.equal(await page.$eval('[data-region="submitted-text"]', function (el) { return el.textContent; }), writing);
            assert.equal(await page.$eval('[data-region="teacher-status"]', function (el) { return el.textContent; }), '已提交，請交教師審閱');
            const body = await page.evaluate(function () { return document.body.innerText; });
            MODEL_SENTENCES.forEach(function (sentence) {
              assert.equal(body.includes(sentence), false, sentence);
            });
            assert.equal(body.includes('範例／教師用'), false);
            assert.equal(await page.$('[data-score="mastery"]'), null);
            assert.equal(await page.$('[data-score="grade"]'), null);
          }
        }
        await page.click('[data-action="menu"]');
        await page.waitForSelector('[data-station="S1"]');
      }
      const totals = await score(page);
      assert.equal(totals.firstCorrect, '35');
      assert.equal(totals.retryCorrect, '0');
      assert.equal(totals.autoCorrect, '35');
      assert.equal(totals.autoTotal, '35');
      assert.equal(totals.writing, '已提交，請交教師審閱');
      const body = await page.evaluate(function () { return document.body.innerText; });
      assert.match(body, /也不代表已掌握本課/);
      assert.doesNotMatch(body, /你已掌握|已完全掌握|滿分|Mastery/);
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-station="S5"]');
      const cleared = await score(page);
      assert.equal(cleared.firstCorrect, '0');
      assert.equal(cleared.autoCorrect, '0');
      assert.equal(cleared.retryCorrect, '0');
      assert.equal(cleared.writing, '未提交');
    } finally {
      await page.close();
    }
  });

  test('writing abbreviations submit without a sentence rule, and reset clears them', { timeout: 60000 }, async function () {
    const opened = await openPage({ width: 1280, height: 900 }, '/');
    const page = opened.page;
    try {
      await openStation(page, 'S5');
      await jump(page, 6, byId['S5-Q07']);
      await auditLayout(page, 'writing-desktop');
      await setField(page, '[data-field="writing"]', 'Mr Brown');
      await page.click('[data-action="submit"]');
      await page.waitForSelector('[data-status="teacher_submitted"]');
      assert.equal(await page.$eval('[data-region="submitted-text"]', function (el) { return el.textContent; }), 'Mr Brown');
      assert.equal(await page.$eval('[data-score="auto-correct"]', function (el) { return el.textContent; }), '0');
      assert.equal(await page.$eval('[data-score="writing"]', function (el) { return el.textContent; }), '已提交，請交教師審閱');
      const body = await page.evaluate(function () { return document.body.innerText; });
      MODEL_SENTENCES.forEach(function (sentence) { assert.equal(body.includes(sentence), false); });

      await page.click('[data-action="reset"]');
      await page.waitForSelector('[data-action="confirm-reset"]');
      assert.equal(await page.$eval('[data-score="writing"]', function (el) { return el.textContent; }), '已提交，請交教師審閱');
      await page.click('[data-action="cancel-reset"]');
      await page.waitForSelector('[data-status="teacher_submitted"]');
      await page.click('[data-action="reset"]');
      await page.click('[data-action="confirm-reset"]');
      await page.waitForSelector('[data-station="S1"]');
      const cleared = await score(page);
      assert.equal(cleared.writing, '未提交');
      assert.equal(cleared.autoCorrect, '0');
      await openStation(page, 'S5');
      await jump(page, 6, byId['S5-Q07']);
      assert.equal(await page.$('[data-region="submitted-text"]'), null);
      await page.focus('[data-field="writing"]');
      await page.keyboard.type('Mr. Brown');
      await page.click('[data-action="submit"]');
      await page.waitForSelector('[data-status="teacher_submitted"]');
      assert.equal(await page.$eval('[data-region="submitted-text"]', function (el) { return el.textContent; }), 'Mr. Brown');
    } finally {
      await page.close();
    }
  });

  test('desktop layout has no overflow and keyboard submit works', { timeout: 60000 }, async function () {
    const opened = await openPage({ width: 1280, height: 900 }, '/');
    const page = opened.page;
    try {
      await auditLayout(page, 'menu-desktop');
      await page.focus('[data-station="S1"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-action="start-station"]');
      await page.focus('[data-action="start-station"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-question-id="S1-Q01"]');
      await page.focus('[data-q-index="1"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-question-id="S1-Q02"]');
      await page.focus('input[name="answer"][value="C"]');
      await page.keyboard.press('Space');
      const selected = await page.$eval('input[name="answer"]:checked', function (el) { return el.value; });
      assert.equal(selected, 'C');
      await page.focus('[data-action="submit"]');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-status="first_correct"]');
      await auditLayout(page, 'mcq-desktop');
      await page.click('[data-action="menu"]');
      await openStation(page, 'S4');
      await auditLayout(page, 'reading-desktop');
      await page.click('[data-action="menu"]');
      await openStation(page, 'S3');
      await jump(page, 1, byId['S3-Q02']);
      await auditLayout(page, 'long-option-desktop');
      await page.click('[data-action="menu"]');
      await openStation(page, 'S1');
      await jump(page, 5, byId['S1-Q06']);
      await page.focus('[data-field="gap"]');
      await page.keyboard.type('cheerful');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-status="first_correct"]');
      await auditLayout(page, 'gap-desktop');
    } finally {
      await page.close();
    }
  });

  test('nested /Peter_Dream_Big/ path, no storage, and no outbound answer requests', { timeout: 60000 }, async function () {
    const opened = await openPage({ width: 414, height: 896 }, '/Peter_Dream_Big/');
    const page = opened.page;
    try {
      const urls = opened.requests.map(function (request) { return request.url(); });
      assert.ok(urls.some(function (url) { return url.includes('/Peter_Dream_Big/css/styles.css'); }));
      assert.ok(urls.some(function (url) { return url.includes('/Peter_Dream_Big/js/marking.js'); }));
      assert.ok(urls.some(function (url) { return url.includes('/Peter_Dream_Big/js/app.js'); }));
      assert.ok(urls.some(function (url) { return url.includes('/Peter_Dream_Big/data/online-exercises.json'); }));
      const host = new URL(origin).host;
      opened.requests.forEach(function (request) {
        const url = request.url();
        if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return;
        assert.equal(new URL(url).host, host, url);
        assert.equal(request.method(), 'GET', url);
      });
      await auditLayout(page, 'nested-menu-414');
      await openStation(page, 'S1');
      await page.click('input[name="answer"][value="B"]');
      await page.click('[data-action="submit"]');
      await page.waitForSelector('[data-status="first_correct"]');
      assert.equal(await page.$eval('[data-score="first-correct"]', function (el) { return el.textContent; }), '1');
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-station="S1"]');
      assert.equal(await page.$eval('[data-score="first-correct"]', function (el) { return el.textContent; }), '0');
      const persistence = await page.evaluate(async function () {
        const registrations = 'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistrations()
          : [];
        return {
          local: localStorage.length,
          session: sessionStorage.length,
          log: window.__persistLog.slice(),
          workers: registrations.length,
          controller: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
        };
      });
      assert.equal(persistence.local, 0);
      assert.equal(persistence.session, 0);
      assert.deepEqual(persistence.log, []);
      assert.equal(persistence.workers, 0);
      assert.equal(persistence.controller, false);
      assert.equal((await page.cookies()).length, 0);
      assert.deepEqual(cookieHeaders, []);
      await page.goto(origin + '/Peter_Dream_Big/index.html', { waitUntil: 'networkidle0' });
      await page.setViewport({ width: 1280, height: 900 });
      await page.waitForSelector('[data-station="S5"]');
      await auditLayout(page, 'nested-index-desktop');
      const nestedUrls = opened.requests.map(function (request) { return request.url(); });
      assert.ok(nestedUrls.some(function (url) { return url.includes('/Peter_Dream_Big/index.html'); }));
    } finally {
      await page.close();
    }
  });
});
