---
name: question-bank-json
description: Define, review, and validate canonical medical-question-bank JSON for this Android app. Use for JSON format, migration, merge, import-readiness, or quality checks; this Skill does not authorize batch medical-content authoring.
metadata:
  owner: question-bank-app
  contract: medical-question-bank-v1-canonical
  version: "2.0.0"
---

# Question Bank JSON Contract

Use this Skill as the repository authority for question-bank JSON structure and automated quality checks. Read [references/FORMAT.md](references/FORMAT.md) before changing the importer, schema, validator, example, or question-bank JSON.

## Scope

This Skill covers:

- the `medical-question-bank` version 1 import shape;
- stable IDs, subjects, chapters, paths, questions, options, answers, and analysis structure;
- merge and collision checks;
- deterministic validation and actionable error reporting.

It does not assign Codex responsibility for batch-writing medical questions or explanations. Medical content must come from a separately reviewed source or authoring workflow.

## Required invariants

1. Emit `medical-question-bank` version `1`. Never use the full-backup `medical-question-data` shape as a question-bank deliverable.
2. Preserve source wording, option order, answers, chapters, and source hierarchy. Do not silently correct disputed medical content.
3. Every question uses an immutable stable `id`, a declared `subjectId`, and an explicit canonical `path` ending in `[subject name, chapter]`.
4. Every formal question has a non-empty `analysis` with these sections in order:
   - `本题考查`
   - `考点还原`
   - `全选项解析`
   - `结论`
5. `全选项解析` covers every option actually present. A four-option question requires A-D and must not be rejected for lacking E.
6. Do not invent mechanisms, guidelines, citations, page numbers, numerical thresholds, or certainty. Exclude unresolved items from import-ready output and report them for human review.
7. Validate every deliverable with `scripts/validate_question_bank.py`. Use `--existing` when a current export is available so stable-ID collisions are visible.
8. Keep files within the App's 12 MiB UTF-16 text limit.

## Validation

From the repository root:

```bash
python .agents/skills/question-bank-json/scripts/validate_question_bank.py path/to/question-bank.json
```

With collision checking:

```bash
python .agents/skills/question-bank-json/scripts/validate_question_bank.py path/to/question-bank.json --existing path/to/current-export.json
```

Do not call a file import-ready unless validation exits successfully. Report subject count, question count, warnings, exclusions, unresolved medical-review items, and whether collision checking ran.

## Contract changes

When importer behavior or the canonical profile changes, update `SKILL.md`, `references/FORMAT.md`, the JSON Schema, validator, validator tests, and example in the same change. Test both valid input and each newly enforced failure mode.
