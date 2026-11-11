# Online practice specification — Dream big

This file describes **content and expected interaction only**. It does not require a score server, student accounts, or saved results. Any later marking or storage plan can be added separately.

## Purpose and audience

- Learner: Hong Kong P6, British school English.
- Source: Longman English Leap 6A, Chapter 2 *Dream big* (the scanned working pages 14–25 only).
- Student-facing directions: formal Traditional Chinese.
- Questions, options and expected answers: British English.
- Recommended order: Station 1 → 5 (graduated). Stations may be opened in any order if the builder prefers, but later stations reuse earlier ideas (*need to be*, *so that*, qualities).

## Station map (5 stations, 36 items)

| Station | Title | Items | Focus |
|---------|--------|-------|--------|
| S1 | 工作特質與形容詞 / Job qualities | 8 | Adjectives (*understanding*, *patient*, *caring*, *attentive*, *outgoing*); suffixes *-ful* / *-ic*; one visible *ient* sound item (*patient*) |
| S2 | need to be / need to | 7 | Requirements: *need to be* + adjective; one duty: *need to show*; Ella as an athlete |
| S3 | so that 表示目的 / So that | 7 | *so that* for purpose; contrast with *because* for a reason; plans from Henry, Carrie and Brandon |
| S4 | 閱讀理解 / Reading | 7 | Short original text about dog trainer Leo Chan (qualities, *so that*, rewards, main purpose) |
| S5 | 寫作技巧與短寫 / Writing skills | 7 | Topic and supporting sentences; sentences that do not belong; introduction of the writing outline; 1 teacher-reviewed short writing |

Item IDs: `S1-Q01` … `S5-Q07`. Full stems, options, accepted answers, first-error hints and explanatory feedback are in `online-exercises.json`.

## Interaction

1. Show the station introduction (Chinese) before the first item.
2. Show one item at a time, or a short scrollable list; do not hide the stem when options appear. For Station 4, keep the short reading text visible with each question (`stimulus`).
3. **First attempt:** the student submits once with no hint visible.
4. **If the first attempt is wrong** (auto-marked items only): show the `hints.first_error` text, and allow at least one retry. Do not reveal the full correct option immediately in the hint.
5. After a correct answer, or after a final incorrect attempt, show the explanatory feedback.
6. A correct retry after a hint is **not** a “first-correct” result, if results are ever recorded later.
7. **S5-Q07** is `teacher_review`: accept 2–3 sentences, do **not** auto-mark, and do **not** treat submission as mastery. Show a state such as「已提交，請交教師審閱」. A model answer belongs in the teacher key only (範例／教師用). Do **not** use a strict sentence-count regex (abbreviations such as *Mr Brown* must not be rejected).
8. Reading items already include the needed short text in `stimulus`. Do not paste long textbook pages into the screen.
9. No audio, and no invented pictures that the student must “see” in order to answer. The optional phonics item in S1 uses only the visible rule and the word *patient*.
10. Navigation: allow moving to the next item after feedback; a simple station menu is enough. A progress count (e.g. 3/8) is helpful but optional.

## Auto-marking rules (if marking is added later)

- Case-insensitive; ignore extra inner spaces and a single final full stop or exclamation mark; normalise curly and straight apostrophes.
- Accept only the strings listed in `accepted_answers` (and the notes beside some items).
- Multiple-choice: use `correct_option_id` to mark the keyed option, not literal answer-text equality.
- Do not mark S5-Q07 automatically.
- Do not accept *so* in place of *so that* for S3-Q07.

These rules are for a possible later build. This pack does **not** assume that scores must be stored.

## Language and accessibility

- British spelling in English text (*behaviour*, *programmes*, *practise* as a verb, *Maths*). Keep the unit hyphenation *hard-working* and *good-looking* if those words appear.
- Buttons and short system messages may be in Traditional Chinese, e.g.「提交」「下一題」「提示」「已提交，請交教師審閱」。
- Fonts should be clear on a tablet or laptop. Avoid a tiny type size for quality words that P6 pupils may still confuse (*attentive*, *understanding*, *confident*, *artistic*).

## Out of scope for this phase

- Building the website, a repository, or a deployment.
- Teacher login, class codes, or a results spreadsheet.
- Modifying unrelated existing materials.
