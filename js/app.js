(function () {
  'use strict';

  const M = globalThis.DreamBigMarking;
  const CONTENT_URL = new URL('../data/online-exercises.json', document.currentScript.src).href;

  const state = {
    pack: null,
    records: {},
    drafts: {},
    view: 'loading',
    stationId: null,
    questionIndex: 0,
    formMessage: '',
    focusSelector: null,
    beforeConfirm: null,
  };

  function h(tag, props) {
    const node = document.createElement(tag);
    const children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      Object.keys(props).forEach(function (key) {
        const value = props[key];
        if (value == null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'value') node.value = String(value);
        else if (key === 'checked' || key === 'disabled' || key === 'readOnly') node[key] = Boolean(value);
        else node.setAttribute(key, String(value));
      });
    }
    children.flat(Infinity).forEach(function (child) {
      if (child == null || child === false) return;
      node.append(child);
    });
    return node;
  }

  function currentStation() {
    if (!state.pack) return null;
    return state.pack.stations.find(function (station) {
      return station.id === state.stationId;
    }) || null;
  }

  function currentQuestion() {
    const station = currentStation();
    if (!station) return null;
    return station.questions[state.questionIndex] || null;
  }

  function stationProgress(station) {
    let done = 0;
    station.questions.forEach(function (question) {
      const status = state.records[question.id] ? state.records[question.id].status : 'unanswered';
      if (status === 'first_correct' || status === 'retry_correct' || status === 'final_incorrect' || status === 'teacher_submitted') {
        done += 1;
      }
    });
    return { done: done, total: station.questions.length };
  }

  function scoreSection() {
    const summary = M.summarize(state.pack, state.records);
    return h('section', { class: 'card score', 'data-region': 'score' },
      h('h2', { text: '練習記錄' }),
      h('p', null,
        '自動批改：',
        h('span', { 'data-score': 'auto-correct', text: String(summary.autoCorrect) }),
        '／',
        h('span', { 'data-score': 'auto-total', text: String(summary.autoTotal) }),
        '（不含短寫）'
      ),
      h('p', null, '首次答對：', h('span', { 'data-score': 'first-correct', text: String(summary.firstCorrect) })),
      h('p', null, '提示或重試後答對：', h('span', { 'data-score': 'retry-correct', text: String(summary.retryCorrect) })),
      h('p', null, '答錯作結：', h('span', { 'data-score': 'final-incorrect', text: String(summary.finalIncorrect) })),
      h('p', null,
        '短寫（',
        h('span', { 'data-score': 'writing-total', text: String(summary.writingTotal) }),
        ' 題，不計入自動分數，亦不自動評分）：',
        h('span', {
          'data-score': 'writing',
          text: summary.writingSubmitted ? M.TEACHER_STATUS : '未提交',
        })
      ),
      h('p', {
        'data-region': 'score-note',
        text: '完成全部題目只代表練習記錄。這不是正式成績，也不代表已掌握本課。',
      })
    );
  }

  function menuView() {
    const list = h('div', { class: 'station-list' });
    state.pack.stations.forEach(function (station) {
      const progress = stationProgress(station);
      list.append(h('button', {
        type: 'button',
        class: 'secondary station-button',
        'data-station': station.id,
        'data-total': String(station.questions.length),
        'data-done': String(progress.done),
      },
        h('span', { class: 'station-kicker', text: station.title_zh }),
        h('span', { class: 'station-en', lang: 'en', text: station.title }),
        h('span', { class: 'station-meta', text: '共 ' + station.questions.length + ' 題 · 已完成 ' + progress.done + '/' + station.questions.length })
      ));
    });
    return h('div', null,
      scoreSection(),
      h('section', { class: 'card' },
        h('h2', { text: '選擇關卡' }),
        h('p', { text: '建議由第一關做到第五關。你也可以直接進入任何一關。進入關卡後會先看到該關說明。' }),
        h('p', { text: '可用鍵盤操作：按 Tab 鍵移動，按 Enter 鍵確定或提交；選擇題請先選選項，再按提交。' }),
        list
      )
    );
  }

  function introView() {
    const station = currentStation();
    return h('div', null,
      scoreSection(),
      h('section', { class: 'card', 'data-region': 'intro' },
        h('h2', { text: station.title_zh }),
        h('p', { lang: 'en', text: station.title }),
        h('p', { 'data-region': 'intro-zh', text: station.intro_zh }),
        h('p', { lang: 'en', 'data-region': 'intro-en', text: station.intro_en }),
        h('div', { class: 'actions' },
          h('button', { type: 'button', 'data-action': 'start-station', text: '開始本關' }),
          h('button', { type: 'button', class: 'secondary', 'data-action': 'menu', text: '返回關卡' })
        )
      )
    );
  }

  function resultLines(record) {
    const lines = [];
    if (record.firstResult === 'correct') {
      lines.push(h('p', { 'data-region': 'first-result', 'data-first-result': 'correct', text: '第一次作答：正確' }));
    } else if (record.firstResult === 'incorrect') {
      lines.push(h('p', { 'data-region': 'first-result', 'data-first-result': 'incorrect', text: '第一次作答：不正確' }));
    }
    if (record.status === 'retry_correct') {
      lines.push(h('p', {
        'data-region': 'retry-result',
        'data-retry-result': 'correct',
        text: '重試結果：正確（提示後答對，並非首次答對）',
      }));
    } else if (record.status === 'final_incorrect') {
      lines.push(h('p', {
        'data-region': 'retry-result',
        'data-retry-result': 'incorrect',
        text: '重試結果：不正確',
      }));
    }
    return lines;
  }

  function questionView() {
    const station = currentStation();
    const question = currentQuestion();
    const record = state.records[question.id] || M.blankRecord();
    const outcome = M.visibleOutcome(question, record);
    const locked = record.status === 'first_correct' || record.status === 'retry_correct' || record.status === 'final_incorrect' || record.status === 'teacher_submitted';
    const draft = Object.prototype.hasOwnProperty.call(state.drafts, question.id)
      ? state.drafts[question.id]
      : (record.lastResponse || '');

    const jumps = h('div', { class: 'jumps', role: 'group', 'aria-label': '本關題目' });
    station.questions.forEach(function (item, index) {
      const itemRecord = state.records[item.id];
      const done = itemRecord && (itemRecord.status === 'first_correct' || itemRecord.status === 'retry_correct' || itemRecord.status === 'final_incorrect' || itemRecord.status === 'teacher_submitted');
      jumps.append(h('button', {
        type: 'button',
        class: 'secondary jump' + (index === state.questionIndex ? ' is-current' : '') + (done ? ' is-done' : ''),
        'data-q-index': String(index),
        'aria-current': index === state.questionIndex ? 'true' : 'false',
        'aria-label': '第 ' + (index + 1) + ' 題',
        text: String(index + 1),
      }));
    });

    let field;
    if (question.type === 'mcq') {
      const options = h('div', { class: 'options', role: 'radiogroup', 'aria-label': '選項' });
      question.options.forEach(function (option) {
        const resolved = Boolean(record.showFeedback && option.id === question.correct_option_id);
        options.append(h('label', { class: resolved ? 'option is-resolved-key' : 'option' },
          h('input', {
            type: 'radio',
            name: 'answer',
            value: option.id,
            checked: draft === option.id,
            disabled: locked,
            'data-resolved-key': resolved ? 'true' : null,
          }),
          h('span', { class: 'option-text', lang: 'en', text: option.text })
        ));
      });
      field = options;
    } else if (M.isTeacherReview(question) && locked) {
      field = h('div', null,
        h('h3', { text: '你提交的寫作' }),
        h('p', { class: 'submitted-text', 'data-region': 'submitted-text', text: record.submittedText }),
        h('p', { 'data-region': 'teacher-status', text: M.TEACHER_STATUS }),
        h('p', { text: '請把這段文字交給教師審閱。一旦重新載入或重新開始，畫面上的寫作會消失。此題沒有自動分數。' })
      );
    } else if (M.isTeacherReview(question)) {
      field = h('div', null,
        h('label', { for: 'writing-answer', text: '你的寫作' }),
        h('textarea', {
          id: 'writing-answer',
          'data-field': 'writing',
          autocomplete: 'off',
          autocorrect: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          value: draft,
        }),
        h('p', { text: '建議寫 2 至 3 句。任何已寫內容皆可提交，系統不會按句子數目拒絕，也不會自動評分。' })
      );
    } else {
      field = h('div', null,
        h('label', { for: 'gap-answer', text: '你的答案' }),
        h('input', {
          id: 'gap-answer',
          type: 'text',
          'data-field': 'gap',
          autocomplete: 'off',
          autocorrect: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          value: draft,
          readOnly: locked,
        })
      );
    }

    const formChildren = [field];
    if (state.formMessage) {
      formChildren.push(h('p', { class: 'form-message', role: 'alert', 'data-region': 'form-message', text: state.formMessage }));
    }
    if (!locked) {
      formChildren.push(h('button', {
        type: 'submit',
        'data-action': 'submit',
        text: M.isTeacherReview(question) ? '提交給教師審閱' : '提交',
      }));
    } else if (!M.isTeacherReview(question)) {
      formChildren.push(h('p', { text: '本題已結束，答案不能再更改。' }));
    }

    const hint = outcome.hint ? h('aside', {
      class: 'hint',
      'data-region': 'hint',
      tabindex: '-1',
      role: 'status',
    },
      h('h3', { text: '提示' }),
      h('p', { lang: 'en', 'data-region': 'hint-text', text: outcome.hint }),
      record.status === 'awaiting_retry'
        ? h('p', { text: '請再試一次。這次提示不會直接公布正確答案。' })
        : null
    ) : null;

    const feedbackParts = [];
    if (record.showFeedback) {
      feedbackParts.push(h('h3', { text: '說明' }));
      resultLines(record).forEach(function (line) { feedbackParts.push(line); });
      if (outcome.correctText) {
        feedbackParts.push(h('p', { 'data-region': 'feedback-correct', text: outcome.correctText }));
      }
      if (outcome.explanatory) {
        feedbackParts.push(h('p', { lang: 'en', 'data-region': 'feedback-explanatory', text: outcome.explanatory }));
      }
    } else if (record.firstResult) {
      resultLines(record).forEach(function (line) { feedbackParts.push(line); });
    }

    const feedback = feedbackParts.length ? h('section', {
      class: 'feedback feedback-' + record.status,
      'data-region': 'feedback',
      tabindex: '-1',
      role: 'status',
    }, feedbackParts) : null;

    const stimulus = question.stimulus ? h('section', { class: 'passage-wrap' },
      h('h3', { text: '閱讀短文' }),
      h('p', { class: 'passage', lang: 'en', 'data-region': 'stimulus', text: question.stimulus })
    ) : null;

    const panel = h('div', { class: 'question-panel' },
      h('p', { class: 'progress', 'data-region': 'progress', text: '第 ' + (state.questionIndex + 1) + ' 題，共 ' + station.questions.length + ' 題' }),
      h('p', { class: 'item-id', text: '題號：' + question.id }),
      h('p', { class: 'prompt-zh', 'data-region': 'prompt-zh', text: question.prompt_zh }),
      h('p', { class: 'stem', lang: 'en', 'data-region': 'prompt', text: question.prompt }),
      hint,
      h('form', { 'data-form': 'answer' }, formChildren),
      feedback
    );

    return h('div', null,
      scoreSection(),
      h('article', {
        class: 'card',
        'data-question-id': question.id,
        'data-status': record.status,
        'data-attempts': String(record.attempts),
        'data-first-result': record.firstResult || '',
      },
        h('h2', { text: station.title_zh }),
        jumps,
        h('div', { class: question.stimulus ? 'reading-layout' : 'question-layout' }, stimulus, panel),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'secondary', 'data-action': 'prev', disabled: state.questionIndex === 0, text: '上一題' }),
          h('button', { type: 'button', class: 'secondary', 'data-action': 'next', disabled: state.questionIndex === station.questions.length - 1, text: '下一題' }),
          h('button', { type: 'button', class: 'secondary', 'data-action': 'menu', text: '返回關卡' })
        )
      )
    );
  }

  function confirmView() {
    return h('div', null,
      scoreSection(),
      h('section', { class: 'card' },
        h('h2', { text: '重新開始' }),
        h('p', { text: '確定要清除本頁所有作答與練習記錄嗎？清除後無法在此頁還原。重新載入頁面也會清除記錄。' }),
        h('div', { class: 'actions' },
          h('button', { type: 'button', 'data-action': 'confirm-reset', text: '確定清除' }),
          h('button', { type: 'button', class: 'secondary', 'data-action': 'cancel-reset', text: '取消' })
        )
      )
    );
  }

  function buildView() {
    if (!state.pack || state.view === 'menu') return menuView();
    if (state.view === 'intro') return introView();
    if (state.view === 'question') return questionView();
    if (state.view === 'confirm') return confirmView();
    return menuView();
  }

  function render() {
    const main = document.getElementById('main');
    const focusSelector = state.focusSelector;
    state.focusSelector = null;
    main.replaceChildren(buildView());
    window.scrollTo(0, 0);
    if (focusSelector) {
      const target = main.querySelector(focusSelector);
      if (target) target.focus();
    }
  }

  function rememberDraft(questionId, value) {
    state.drafts[questionId] = value;
  }

  function readResponse(question) {
    if (question.type === 'mcq') {
      const selected = document.querySelector('input[name="answer"]:checked');
      return selected ? selected.value : '';
    }
    if (M.isTeacherReview(question)) {
      const field = document.querySelector('[data-field="writing"]');
      return field ? field.value : (state.records[question.id].submittedText || '');
    }
    const field = document.querySelector('[data-field="gap"]');
    return field ? field.value : '';
  }

  function submitCurrent() {
    const question = currentQuestion();
    if (!question) return;
    const response = readResponse(question);
    const result = M.applyAttempt(question, state.records[question.id], response);
    if (!result.ok && result.error === 'empty') {
      state.formMessage = question.type === 'mcq'
        ? '請先選擇一個答案。'
        : (M.isTeacherReview(question) ? '請先寫下答案，再提交。' : '請先輸入答案。');
      rememberDraft(question.id, response);
      render();
      return;
    }
    if (!result.ok) return;
    state.records[question.id] = result.record;
    rememberDraft(question.id, response);
    state.formMessage = '';
    state.focusSelector = result.record.showFeedback ? '[data-region="feedback"]' : '[data-region="hint"]';
    render();
  }

  function move(delta) {
    const station = currentStation();
    if (!station) return;
    const nextIndex = state.questionIndex + delta;
    if (nextIndex < 0 || nextIndex >= station.questions.length) return;
    state.questionIndex = nextIndex;
    state.formMessage = '';
    render();
  }

  function onClick(event) {
    const control = event.target.closest('[data-station], [data-action], [data-q-index]');
    if (!control || !state.pack) return;
    if (control.hasAttribute('data-station')) {
      state.stationId = control.getAttribute('data-station');
      state.questionIndex = 0;
      state.view = 'intro';
      state.formMessage = '';
      render();
      return;
    }
    if (control.hasAttribute('data-q-index') && !control.hasAttribute('data-action')) {
      state.questionIndex = Number(control.getAttribute('data-q-index'));
      state.view = 'question';
      state.formMessage = '';
      render();
      return;
    }
    const action = control.getAttribute('data-action');
    if (action === 'reset') {
      if (state.view === 'confirm') return;
      state.beforeConfirm = {
        view: state.view,
        stationId: state.stationId,
        questionIndex: state.questionIndex,
      };
      state.view = 'confirm';
      render();
    } else if (action === 'confirm-reset') {
      M.listQuestions(state.pack).forEach(function (item) {
        state.records[item.question.id] = M.blankRecord();
      });
      state.drafts = {};
      state.formMessage = '';
      state.view = 'menu';
      state.stationId = null;
      state.questionIndex = 0;
      state.beforeConfirm = null;
      render();
    } else if (action === 'cancel-reset') {
      const previous = state.beforeConfirm || { view: 'menu', stationId: null, questionIndex: 0 };
      state.view = previous.view;
      state.stationId = previous.stationId;
      state.questionIndex = previous.questionIndex;
      state.beforeConfirm = null;
      render();
    } else if (action === 'menu') {
      state.view = 'menu';
      state.formMessage = '';
      render();
    } else if (action === 'start-station') {
      state.view = 'question';
      state.questionIndex = 0;
      state.formMessage = '';
      render();
    } else if (action === 'next') {
      move(1);
    } else if (action === 'prev') {
      move(-1);
    }
  }

  function onSubmit(event) {
    const form = event.target;
    if (!form || !form.getAttribute || form.getAttribute('data-form') !== 'answer') return;
    event.preventDefault();
    submitCurrent();
  }

  function onInput(event) {
    const field = event.target;
    if (!field.matches || !field.matches('[data-field]')) return;
    const article = field.closest('[data-question-id]');
    if (!article) return;
    rememberDraft(article.getAttribute('data-question-id'), field.value);
  }

  function onChange(event) {
    const field = event.target;
    if (!field.matches || field.name !== 'answer') return;
    const article = field.closest('[data-question-id]');
    if (!article) return;
    rememberDraft(article.getAttribute('data-question-id'), field.value);
  }

  async function boot() {
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('submit', onSubmit);
    document.body.addEventListener('input', onInput);
    document.body.addEventListener('change', onChange);
    try {
      const response = await fetch(CONTENT_URL);
      if (!response.ok) throw new Error('load failed');
      const pack = await response.json();
      state.pack = pack;
      M.listQuestions(pack).forEach(function (item) {
        state.records[item.question.id] = M.blankRecord();
      });
      if (pack.meta && pack.meta.title_zh) {
        document.title = pack.meta.title_zh;
        const heading = document.querySelector('.site-header h1');
        if (heading) heading.textContent = pack.meta.title_zh;
      }
      state.view = 'menu';
      render();
    } catch (error) {
      document.getElementById('main').replaceChildren(
        h('p', { role: 'alert', text: '練習內容未能載入。請重新載入此頁。' })
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
