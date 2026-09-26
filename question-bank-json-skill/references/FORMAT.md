# `medical-question-bank` v1 canonical profile

## Authority

The maintained App importer in `app/src/main/assets/data-exchange.js` defines runtime acceptance. This document defines the stricter repository profile for import-ready question banks. The App may normalize some missing values for legacy compatibility; new files must satisfy this profile directly.

## Top-level object

```json
{
  "format": "medical-question-bank",
  "version": 1,
  "subjects": [],
  "questions": []
}
```

Only these four top-level fields are permitted. A deliverable contains at least one subject and one question. The UTF-8 JSON text must not exceed `64 * 1024 * 1024` JavaScript UTF-16 code units.

## Subjects

Each subject contains exactly:

- `id`: unique ASCII letters, digits, `_`, or `-`; 1-100 characters; never `__proto__`, `constructor`, or `prototype`.
- `name`: unique, non-blank, at most 100 characters.
- `short`: non-blank, at most 8 characters.

## Questions

Each question contains `id`, `subjectId`, `chapter`, `path`, `stem`, `options`, `answer`, `analysis`, `context`, `number`, and `type`. `subject` is optional and, when present, exactly matches the referenced subject name. Other fields are rejected because the current importer does not preserve them.

### Identity and structure

- `id`: unique immutable stable ID, 1-200 characters, without control characters or reserved prototype keys.
- `subjectId`: references a declared subject.
- `chapter`: non-blank, at most 200 characters.
- `path`: 2-8 non-blank segments; the last two are exactly `[subject name, chapter]`.
- `number`: positive integer preserving the source's displayed number.
- `type`: one of `A1`, `A2`, `A3`, `A4`, or `B1`.
- `context`: string; use `""` only when no shared case or common stem exists.

### Stem, options, and answer

- `stem`: non-blank, at most 20,000 characters.
- `options`: 2-5 non-blank strings, at most 10,000 characters each, with no duplicates after trimming.
- `answer`: one uppercase letter within the actual option range.

Preserve option order. Do not add a missing option or alter an answer to make validation pass. Unsupported multiple-answer or matrix questions must be excluded and reported.

### Analysis quality

`analysis` is a non-empty string containing four headings in this order:

```text
本题考查：...
考点还原：...
全选项解析：
A. ...
B. ...
C. ...
D. ...
结论：...
```

Rules:

- `本题考查` states the competency or distinction being tested.
- `考点还原` explains the governing concept and why it applies to the stem.
- `全选项解析` explains every option actually present using labels `A.` through the final real option. It must distinguish why the correct option is correct and why the others do not fit.
- `考点还原` must state substantive medical grounds that relate to the stem or tested distinction, not merely repeat the answer.
- Each actual option explanation must state the medical or logical reason it is correct or incorrect. A bare conclusion such as `正确`, `错误`, `不符合题意`, `符合题意`, or `根据相关知识` is invalid.
- `结论` states the selected answer and concise reasoning.
- Headings alone, empty boilerplate, or paraphrasing the answer without reasoning does not satisfy the profile.
- The repository Validator rejects empty or boilerplate-only reasoning and checks structure and option coverage. It cannot establish medical truth or prove that a non-boilerplate explanation is medically correct; human review remains required.

If the source answer appears wrong, the stem is insufficient, several options may be valid, the standard may be obsolete, or the medical basis cannot be confirmed, do not resolve the uncertainty by invention. Keep the item out of import-ready output and list it in a separate human-review report.

## Merge behavior

The App merges question banks by stable question ID and never overwrites an existing question. Duplicate IDs with identical content are skipped; conflicting content under an existing ID is also skipped and reported. Use `--existing` before delivery whenever an installed-bank export is available.

Array positions are never persistent identities.

## Data-domain boundary

Question-bank JSON contains question content only. It must not include answers given by the user, progress, answer history, favorites, wrong markers, slashed markers, resume state, settings, credentials, or device paths. Those belong to the App's separate backup domains.
