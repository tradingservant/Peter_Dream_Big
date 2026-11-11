'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const marking = require('../js/marking.js');
const pack = require('../data/online-exercises.json');

const byId = {};
marking.listQuestions(pack).forEach(function (item) {
  byId[item.question.id] = item.question;
});

function snapshot(record) {
  return JSON.stringify(record);
}

test('normalises case, spaces, apostrophes, and one final . or !', function () {
  assert.equal(marking.normalizeAnswer('  So   THAT! '), 'so that');
  assert.equal(marking.normalizeAnswer('so\nthat.'), 'so that');
  assert.equal(marking.normalizeAnswer('Cheerful.'), 'cheerful');
  assert.equal(marking.normalizeAnswer("pupil\u2019s"), "pupil's");
  assert.equal(marking.normalizeAnswer("pupil's"), "pupil's");
  assert.equal(marking.normalizeAnswer('so that.!'), 'so that.');
  assert.equal(marking.normalizeAnswer('so'), 'so');
  assert.notEqual(marking.normalizeAnswer('so'), marking.normalizeAnswer('so that'));
  assert.equal(marking.normalizeAnswer('.'), '');
  assert.equal(marking.normalizeAnswer('   !  '), '');
});

test('every auto item accepts only its listed answers, and MCQ uses the option id', function () {
  marking.listQuestions(pack).forEach(function (item) {
    const question = item.question;
    if (marking.isTeacherReview(question)) {
      question.accepted_answers.forEach(function (answer) {
        assert.equal(marking.isAcceptable(question, answer), false);
      });
      assert.equal(marking.isAcceptable(question, 'Mr. Brown'), false);
      return;
    }
    if (question.type === 'mcq') {
      assert.equal(marking.isAcceptable(question, question.correct_option_id), true);
      assert.equal(marking.isAcceptable(question, ' ' + question.correct_option_id + ' '), true);
      assert.equal(marking.isAcceptable(question, question.correct_option_id + '.'), false);
      question.options.forEach(function (option) {
        assert.equal(marking.isAcceptable(question, option.id), option.id === question.correct_option_id);
        assert.equal(marking.isAcceptable(question, option.text), false);
      });
      question.accepted_answers.forEach(function (answer) {
        assert.equal(marking.isAcceptable(question, answer), false);
      });
      return;
    }
    const acceptedNorms = question.accepted_answers.map(marking.normalizeAnswer);
    question.accepted_answers.forEach(function (answer) {
      assert.equal(marking.isAcceptable(question, answer), true);
      assert.equal(marking.isAcceptable(question, answer.toUpperCase()), true);
      assert.equal(marking.isAcceptable(question, '  ' + answer + '  '), true);
      assert.equal(marking.isAcceptable(question, answer + '.'), true);
      assert.equal(marking.isAcceptable(question, answer + '!'), true);
      if (answer.includes(' ')) {
        assert.equal(marking.isAcceptable(question, answer.replace(/ /g, '   ')), true);
        assert.equal(marking.isAcceptable(question, answer.replace(/ /g, '\n')), true);
      }
      [answer + 's', answer + 'x', answer.slice(0, -1)].forEach(function (miss) {
        if (!miss || acceptedNorms.includes(marking.normalizeAnswer(miss))) return;
        assert.equal(marking.isAcceptable(question, miss), false, question.id + ' fuzzy ' + miss);
      });
    });
    assert.equal(marking.isAcceptable(question, ''), false);
    assert.equal(marking.isAcceptable(question, '   .'), false);
  });
});

test('S3-Q07 accepts so that and rejects so, because, and so that I', function () {
  const question = byId['S3-Q07'];
  assert.deepEqual(question.accepted_answers, ['so that']);
  ['so that', 'SO THAT', 'So That', '  so    that  ', 'so that.', 'so that!', 'so\nthat'].forEach(function (answer) {
    assert.equal(marking.isAcceptable(question, answer), true, answer);
  });
  ['so', 'SO', 'so.', 'so!', 'because', 'Because', 'so that I', 'so that I.', 'so  that I', 'so that I can'].forEach(function (answer) {
    assert.equal(marking.isAcceptable(question, answer), false, answer);
  });
});

test('typed items follow the published accept notes', function () {
  const cases = {
    'S1-Q06': {
      accept: ['cheerful', 'Cheerful', 'CHEERFUL.', '  cheerful! '],
      reject: ['cheerfull', 'cheer ful', 'cheer-ful', 'cheer'],
    },
    'S1-Q07': {
      accept: ['artistic', 'Artistic!'],
      reject: ['artist', 'artisticc', 'art'],
    },
    'S2-Q03': {
      accept: ['brave', 'courageous', 'fearless', 'Brave.', 'FEARLESS!'],
      reject: ['calm', 'strong', 'bravely', 'braver'],
    },
    'S2-Q06': {
      accept: ['show', 'guide', 'take', 'lead', 'Show.', 'TAKE!'],
      reject: ['showing', 'shows', 'be show', 'showed', 'to show'],
    },
    'S3-Q05': {
      accept: ['playing', 'Playing.'],
      reject: ['play', 'to play', 'played', 'plays'],
    },
  };
  Object.keys(cases).forEach(function (id) {
    cases[id].accept.forEach(function (answer) {
      assert.equal(marking.isAcceptable(byId[id], answer), true, id + ' ' + answer);
    });
    cases[id].reject.forEach(function (answer) {
      assert.equal(marking.isAcceptable(byId[id], answer), false, id + ' ' + answer);
    });
  });
  assert.equal(marking.isAcceptable(byId['S2-Q07'], 'B'), true);
  assert.equal(marking.isAcceptable(byId['S2-Q07'], 'fit and strong'), false);
  assert.equal(marking.isAcceptable(byId['S2-Q07'], 'strong and fit'), false);
});

test('curly apostrophes match straight apostrophes for typed answers', function () {
  const question = {
    id: 'sample',
    type: 'gap',
    teacher_review: false,
    accepted_answers: ["pupil's book"],
  };
  assert.equal(marking.isAcceptable(question, 'Pupil\u2019s   book.'), true);
  assert.equal(marking.isAcceptable(question, 'pupils book'), false);
});

test('first wrong shows the hint only; a correct retry is not first-correct; the first result stays', function () {
  const question = byId['S3-Q07'];
  const original = marking.blankRecord();
  const before = snapshot(original);
  const first = marking.applyAttempt(question, original, 'so');
  assert.equal(snapshot(original), before);
  assert.equal(first.ok, true);
  assert.equal(first.outcome, 'awaiting_retry');
  assert.equal(first.record.firstResult, 'incorrect');
  assert.equal(first.record.attempts, 1);
  const hidden = marking.visibleOutcome(question, first.record);
  assert.equal(hidden.hint, question.hints.first_error);
  assert.equal(hidden.explanatory, null);
  assert.equal(hidden.correctText, null);
  assert.equal(hidden.modelAnswer, null);

  const empty = marking.applyAttempt(question, first.record, '   .');
  assert.equal(empty.ok, false);
  assert.equal(empty.record.attempts, 1);
  assert.equal(empty.record.firstResult, 'incorrect');

  const retry = marking.applyAttempt(question, first.record, 'So that!');
  assert.equal(retry.outcome, 'retry_correct');
  assert.equal(retry.record.firstResult, 'incorrect');
  assert.equal(retry.record.attempts, 2);
  const shown = marking.visibleOutcome(question, retry.record);
  assert.equal(shown.explanatory, question.feedback.explanatory);
  assert.equal(shown.correctText, question.feedback.correct);
  assert.equal(shown.hint, question.hints.first_error);

  const locked = marking.applyAttempt(question, retry.record, 'because');
  assert.equal(locked.ok, false);
  assert.equal(locked.record.status, 'retry_correct');
  assert.equal(locked.record.firstResult, 'incorrect');
});

test('a correct first try is first-correct and does not show the hint', function () {
  const question = byId['S1-Q01'];
  const result = marking.applyAttempt(question, marking.blankRecord(), 'B');
  assert.equal(result.outcome, 'first_correct');
  assert.equal(result.record.firstResult, 'correct');
  assert.equal(result.record.showHint, false);
  const outcome = marking.visibleOutcome(question, result.record);
  assert.equal(outcome.hint, null);
  assert.equal(outcome.explanatory, question.feedback.explanatory);
  assert.equal(outcome.correctText, question.feedback.correct);
  const wrongText = marking.applyAttempt(question, marking.blankRecord(), 'understanding');
  assert.equal(wrongText.outcome, 'awaiting_retry');
});

test('a second wrong answer is final and reveals the explanation, not a new first result', function () {
  const question = byId['S1-Q06'];
  let record = marking.blankRecord();
  record = marking.applyAttempt(question, record, 'cheer ful').record;
  record = marking.applyAttempt(question, record, 'cheerfull').record;
  assert.equal(record.status, 'final_incorrect');
  assert.equal(record.firstResult, 'incorrect');
  assert.equal(record.attempts, 2);
  const outcome = marking.visibleOutcome(question, record);
  assert.equal(outcome.explanatory, question.feedback.explanatory);
  assert.equal(outcome.correctText, null);
  assert.equal(outcome.hint, question.hints.first_error);
  const third = marking.applyAttempt(question, record, 'cheerful');
  assert.equal(third.ok, false);
  assert.equal(third.record.attempts, 2);
});

test('writing accepts any non-empty text, including abbreviations, and is not auto-marked', function () {
  const question = byId['S5-Q07'];
  ['Mr Brown', 'Mr. Brown', 'Mr. Brown is a vet.', 'a', 'e.g. this is fine', 'I want to be a chef because I love food. Chefs need to be caring. I am going to read so that I can learn.'].forEach(function (answer) {
    const result = marking.applyAttempt(question, marking.blankRecord(), answer);
    assert.equal(result.outcome, 'teacher_submitted', answer);
    assert.equal(result.record.submittedText, answer);
    assert.equal(result.record.firstResult, null);
    assert.equal(marking.isAcceptable(question, answer), false);
    const outcome = marking.visibleOutcome(question, result.record);
    assert.equal(outcome.teacherStatus, '已提交，請交教師審閱');
    assert.equal(outcome.submittedText, answer);
    assert.equal(outcome.modelAnswer, null);
    assert.equal(JSON.stringify(outcome).includes('I want to be a dog trainer'), false);
    assert.equal(JSON.stringify(outcome).includes('範例／教師用'), false);
    assert.equal(outcome.explanatory, question.feedback.explanatory);
  });
  ['', '   ', '\n\t', '  .  '].forEach(function (answer) {
    if (answer.trim().length === 0) {
      const result = marking.applyAttempt(question, marking.blankRecord(), answer);
      assert.equal(result.ok, false);
      assert.equal(result.error, 'empty');
    }
  });
  assert.equal(marking.isNonEmptyWriting('Mr. Brown'), true);
  assert.equal(marking.isNonEmptyWriting('   '), false);
});

test('the auto score counts 35 items and never treats writing or completion as mastery', function () {
  const records = {};
  marking.listQuestions(pack).forEach(function (item) {
    records[item.question.id] = marking.blankRecord();
  });
  let summary = marking.summarize(pack, records);
  assert.equal(summary.autoTotal, 35);
  assert.equal(summary.writingTotal, 1);
  assert.equal(summary.autoCorrect, 0);
  assert.equal(summary.mastery, undefined);
  assert.equal(summary.grade, undefined);

  records['S5-Q07'] = marking.applyAttempt(byId['S5-Q07'], records['S5-Q07'], 'Mr Brown').record;
  summary = marking.summarize(pack, records);
  assert.equal(summary.autoCorrect, 0);
  assert.equal(summary.firstCorrect, 0);
  assert.equal(summary.writingSubmitted, 1);
  assert.equal(summary.autoTotal, 35);

  marking.listQuestions(pack).forEach(function (item) {
    if (marking.isTeacherReview(item.question)) return;
    const response = item.question.type === 'mcq' ? item.question.correct_option_id : item.question.accepted_answers[0];
    records[item.question.id] = marking.applyAttempt(item.question, marking.blankRecord(), response).record;
  });
  summary = marking.summarize(pack, records);
  assert.equal(summary.firstCorrect, 35);
  assert.equal(summary.retryCorrect, 0);
  assert.equal(summary.autoCorrect, 35);
  assert.equal(summary.writingSubmitted, 1);
  assert.notEqual(summary.autoCorrect, 36);
  assert.notEqual(summary.autoCorrect, 38);

  records['S1-Q01'] = marking.applyAttempt(byId['S1-Q01'], marking.applyAttempt(byId['S1-Q01'], marking.blankRecord(), 'A').record, 'B').record;
  summary = marking.summarize(pack, records);
  assert.equal(summary.firstCorrect, 34);
  assert.equal(summary.retryCorrect, 1);
  assert.equal(summary.autoCorrect, 35);
  assert.equal(records['S1-Q01'].firstResult, 'incorrect');
});
