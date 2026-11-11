'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const pack = require('../data/online-exercises.json');
const marking = require('../js/marking.js');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('canonical pack has 5 stations and 36 items, 8/7/7/7/7', function () {
  assert.equal(pack.meta.station_count, 5);
  assert.equal(pack.meta.question_count_core, 36);
  assert.equal(pack.stations.length, 5);
  const counts = pack.stations.map(function (station) {
    return station.questions.length;
  });
  assert.deepEqual(counts, [8, 7, 7, 7, 7]);
  pack.stations.forEach(function (station) {
    assert.equal(station.question_count, station.questions.length);
  });
  const items = marking.listQuestions(pack);
  assert.equal(items.length, 36);
  const auto = items.filter(function (item) { return !marking.isTeacherReview(item.question); });
  const writing = items.filter(function (item) { return marking.isTeacherReview(item.question); });
  assert.equal(auto.length, 35);
  assert.equal(writing.length, 1);
  assert.equal(writing[0].question.id, 'S5-Q07');
});

test('question ids, types, and S4 stimulus are complete and unchanged in shape', function () {
  const expectedIds = [];
  [['S1', 8], ['S2', 7], ['S3', 7], ['S4', 7], ['S5', 7]].forEach(function (pair) {
    for (let n = 1; n <= pair[1]; n += 1) {
      expectedIds.push(pair[0] + '-Q' + String(n).padStart(2, '0'));
    }
  });
  const ids = marking.listQuestions(pack).map(function (item) { return item.question.id; });
  assert.deepEqual(ids, expectedIds);
  const stimuli = [];
  marking.listQuestions(pack).forEach(function (item) {
    const question = item.question;
    assert.equal(typeof question.prompt, 'string');
    assert.equal(typeof question.prompt_zh, 'string');
    assert.equal(typeof question.hints.first_error, 'string');
    assert.equal(typeof question.feedback.correct, 'string');
    assert.equal(typeof question.feedback.explanatory, 'string');
    if (question.type === 'mcq') {
      assert.ok(question.options.some(function (option) {
        return option.id === question.correct_option_id;
      }));
    }
    if (item.station.id === 'S4') {
      assert.equal(typeof question.stimulus, 'string');
      assert.ok(question.stimulus.length > 200);
      assert.ok(question.stimulus.length < 5000);
      stimuli.push(question.stimulus);
    } else {
      assert.equal(question.stimulus, undefined);
    }
  });
  assert.equal(new Set(stimuli).size, 1);
  assert.match(stimuli[0], /behaviour/);
  assert.match(stimuli[0], /so that/);
  const writing = pack.stations[4].questions[6];
  assert.equal(writing.type, 'teacher_review');
  assert.equal(writing.teacher_review, true);
  assert.deepEqual(writing.accepted_answers, []);
  assert.match(writing.accept_notes, /範例／教師用/);
  assert.match(writing.note, /Do not use a strict sentence-count regex/);
});

test('British spelling and unit hyphens in the canonical pack', function () {
  const blob = JSON.stringify(pack);
  assert.equal(blob.includes('behavior'), false);
  assert.equal(blob.includes('programs'), false);
  assert.equal(blob.includes('good looking'), false);
  assert.equal(blob.includes('hard working'), false);
  assert.ok(blob.includes('behaviour'));
  assert.ok(blob.includes('practise the violin'));
  assert.ok(blob.includes('need to practise'));
  assert.ok(blob.includes('programmes'));
  assert.ok(blob.includes('Maths'));
  assert.ok(blob.includes('good-looking'));
  assert.ok(blob.includes('hard-working'));
  assert.equal(/\bMath\b/.test(blob.replace(/Maths/g, '')), false);
});

test('student page uses relative files and does not persist or render the teacher model', function () {
  const html = read('index.html');
  const css = read('css/styles.css');
  const app = read('js/app.js');
  const markingSource = read('js/marking.js');
  const surface = [html, css, app, markingSource].join('\n');
  assert.match(html, /href="css\/styles.css"/);
  assert.match(html, /src="js\/marking.js"/);
  assert.match(html, /src="js\/app.js"/);
  assert.equal(/https?:\/\//.test(surface), false);
  assert.equal((app.match(/fetch\s*\(/g) || []).length, 1);
  assert.match(app, /online-exercises\.json/);
  assert.equal(/localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker|googletagmanager|google-analytics|firebase|XMLHttpRequest|WebSocket|gtag/i.test(surface), false);
  assert.equal(/<img|<audio|<video|<iframe/i.test(html), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows')), false);
  assert.equal(fs.existsSync(path.join(root, 'sw.js')), false);
  const model = 'I want to be a dog trainer when I grow up because I love animals.';
  assert.equal(surface.includes(model), false);
  assert.equal(surface.includes('範例／教師用'), false);
  assert.match(read('docs/online-spec.md'), /36 items/);
  assert.match(read('README.md'), /not an anti-cheating system/);
  assert.equal(read('README.md').includes('@'), false);
});
