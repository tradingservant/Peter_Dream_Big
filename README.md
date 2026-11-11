# Peter_Dream_Big

Static classroom practice for Longman English Leap 6A, Chapter 2 *Dream big* (Hong Kong Primary 6). Five stations, 36 items. Student directions are in formal Traditional Chinese. Questions and answers use British school English.

This page is a practice activity for one sitting. It is not an official test, not an anti-cheating system, and not a student record system.

## Practice design

- Stations may be opened in any order. The suggested order is Station 1 to Station 5.
- 35 items are marked in the browser. The count keeps a correct first try separate from a correct try after a hint.
- The first submit does not show a hint. A wrong first try shows that item’s `hints.first_error` and allows one more try. The explanation appears after a correct answer, or after the second answer is also wrong. The first result does not change if the retry is correct.
- Multiple choice is marked with `correct_option_id`. Typed answers must match a listed accepted answer after the page ignores letter case, extra spaces, curly or straight apostrophes, and one final `.` or `!`. Spelling is not guessed. `so` is not accepted in place of `so that`.
- Station 5 question 7 is short writing for the teacher. Any non-empty writing can be submitted, including abbreviations such as `Mr Brown` and `Mr. Brown`. The page does not count sentences, does not mark the writing, and does not treat it as mastery. It shows the submitted text and「已提交，請交教師審閱」. The teacher model answer is not shown.
- Completing every item does not award an official grade or mastery.
- The reading text is the short passage stored with those questions. The site does not copy textbook pages, and it has no audio and no pictures.

`docs/online-spec.md` is the earlier content specification. That file says building a website was out of scope for the content phase. This repository is the later website for that same pack. The question text is `data/online-exercises.json`.

## Answers can be read in the page files

Marking runs in the browser. Accepted answers are in `data/online-exercises.json`, which the page loads. Anyone who can open the site files, or the browser’s developer tools, can read those answers. The teacher model answer is in that same file so the pack stays complete, and so a static page does not need a server to hide it. The page does not render the model.

That is acceptable for classroom practice. It will not stop a pupil from viewing the file, and it does not keep a central mark book.

## Nothing is stored

Attempts, answers, and the on-screen count stay in memory only. Refreshing the page, closing it, or pressing「重新開始」clears them. The site does not use localStorage, sessionStorage, IndexedDB, cookies, or a service worker. It does not ask for a name, email, class code, or login. It does not upload answers or call an analytics service.

There is no teacher backend. Writing stays on that same screen until reset or reload. The teacher needs to see it before the page is cleared. Pupils can select and copy the submitted text.

## Files

- `index.html` — page
- `css/styles.css` — layout
- `js/marking.js` — matching rules
- `js/app.js` — screens and the memory-only session
- `data/online-exercises.json` — canonical items
- `docs/online-spec.md` — canonical content specification

Paths are relative, so the folder can later be hosted at a path such as `/Peter_Dream_Big/`. This repository does not include a deployment workflow.

## Tests

Install the one development dependency (Puppeteer Core uses the Chrome already installed on the machine; it does not download a browser), then run the content, unit, and headless browser tests:

```bash
npm install
npm test
```

Content and marking rules only:

```bash
npm run test:unit
```

Headless Chrome only:

```bash
npm run test:browser
```

`npm start` serves the folder on `127.0.0.1:8080` for a local look. It is not a deployment.
