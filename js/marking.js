(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.DreamBigMarking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEACHER_STATUS = '已提交，請交教師審閱';
  const APOSTROPHES = /[\u2018\u2019\u201A\u201B\u2032\u2035\u02BC\uFF07]/g;
  const LOCKED = {
    first_correct: true,
    retry_correct: true,
    final_incorrect: true,
    teacher_submitted: true,
  };

  function normalizeAnswer(value) {
    let text = String(value == null ? '' : value);
    text = text.replace(APOSTROPHES, "'");
    text = text.replace(/\s+/g, ' ').trim();
    if (text.endsWith('.') || text.endsWith('!')) {
      text = text.slice(0, -1).trim();
    }
    return text.toLowerCase();
  }

  function isTeacherReview(question) {
    return Boolean(question && (question.teacher_review === true || question.type === 'teacher_review'));
  }

  function isNonEmptyWriting(value) {
    return String(value == null ? '' : value).trim().length > 0;
  }

  function isAcceptable(question, response) {
    if (!question || isTeacherReview(question)) return false;
    if (question.type === 'mcq') {
      return String(response == null ? '' : response).trim() === String(question.correct_option_id);
    }
    const norm = normalizeAnswer(response);
    if (!norm) return false;
    const accepted = Array.isArray(question.accepted_answers) ? question.accepted_answers : [];
    return accepted.some(function (answer) {
      return normalizeAnswer(answer) === norm;
    });
  }

  function blankRecord() {
    return {
      attempts: 0,
      firstResult: null,
      status: 'unanswered',
      showHint: false,
      showFeedback: false,
      lastResponse: '',
      submittedText: '',
    };
  }

  function applyAttempt(question, record, response) {
    const next = Object.assign(blankRecord(), record || {});
    if (LOCKED[next.status]) {
      return { ok: false, error: 'locked', record: next };
    }

    if (isTeacherReview(question)) {
      if (!isNonEmptyWriting(response)) {
        return { ok: false, error: 'empty', record: next };
      }
      next.status = 'teacher_submitted';
      next.submittedText = String(response);
      next.lastResponse = String(response);
      next.showHint = false;
      next.showFeedback = true;
      next.firstResult = null;
      next.attempts = 0;
      return { ok: true, outcome: 'teacher_submitted', record: next };
    }

    const raw = response == null ? '' : String(response);
    const empty = question.type === 'mcq' ? raw.trim() === '' : normalizeAnswer(raw) === '';
    if (empty) {
      return { ok: false, error: 'empty', record: next };
    }

    const correct = isAcceptable(question, raw);
    next.attempts = Number(next.attempts || 0) + 1;
    next.lastResponse = raw;
    if (next.firstResult == null) {
      next.firstResult = correct ? 'correct' : 'incorrect';
    }

    if (correct) {
      const firstTry = next.attempts === 1 && next.firstResult === 'correct';
      next.status = firstTry ? 'first_correct' : 'retry_correct';
      next.showHint = !firstTry;
      next.showFeedback = true;
      return { ok: true, outcome: next.status, record: next };
    }

    if (next.attempts < 2) {
      next.status = 'awaiting_retry';
      next.showHint = true;
      next.showFeedback = false;
      return { ok: true, outcome: 'awaiting_retry', record: next };
    }

    next.status = 'final_incorrect';
    next.showHint = true;
    next.showFeedback = true;
    return { ok: true, outcome: 'final_incorrect', record: next };
  }

  function listQuestions(pack) {
    const questions = [];
    const stations = (pack && pack.stations) || [];
    stations.forEach(function (station) {
      (station.questions || []).forEach(function (question) {
        questions.push({ station: station, question: question });
      });
    });
    return questions;
  }

  function summarize(pack, records) {
    const summary = {
      autoTotal: 0,
      firstCorrect: 0,
      retryCorrect: 0,
      autoCorrect: 0,
      finalIncorrect: 0,
      awaitingRetry: 0,
      unanswered: 0,
      writingTotal: 0,
      writingSubmitted: 0,
    };
    listQuestions(pack).forEach(function (item) {
      const question = item.question;
      const record = (records && records[question.id]) || blankRecord();
      if (isTeacherReview(question)) {
        summary.writingTotal += 1;
        if (record.status === 'teacher_submitted') summary.writingSubmitted += 1;
        return;
      }
      summary.autoTotal += 1;
      if (record.status === 'first_correct') summary.firstCorrect += 1;
      else if (record.status === 'retry_correct') summary.retryCorrect += 1;
      else if (record.status === 'final_incorrect') summary.finalIncorrect += 1;
      else if (record.status === 'awaiting_retry') summary.awaitingRetry += 1;
      else summary.unanswered += 1;
    });
    summary.autoCorrect = summary.firstCorrect + summary.retryCorrect;
    return summary;
  }

  function visibleOutcome(question, record) {
    const current = Object.assign(blankRecord(), record || {});
    const outcome = {
      hint: null,
      correctText: null,
      explanatory: null,
      teacherStatus: null,
      submittedText: null,
      modelAnswer: null,
    };
    if (current.showHint && question && question.hints) {
      outcome.hint = question.hints.first_error;
    }
    if (current.showFeedback && question && question.feedback) {
      outcome.explanatory = question.feedback.explanatory;
      if (current.status !== 'final_incorrect') {
        outcome.correctText = question.feedback.correct;
      }
    }
    if (current.status === 'teacher_submitted') {
      outcome.teacherStatus = TEACHER_STATUS;
      outcome.submittedText = current.submittedText;
    }
    return outcome;
  }

  return {
    TEACHER_STATUS: TEACHER_STATUS,
    normalizeAnswer: normalizeAnswer,
    isTeacherReview: isTeacherReview,
    isNonEmptyWriting: isNonEmptyWriting,
    isAcceptable: isAcceptable,
    blankRecord: blankRecord,
    applyAttempt: applyAttempt,
    listQuestions: listQuestions,
    summarize: summarize,
    visibleOutcome: visibleOutcome,
  };
});
