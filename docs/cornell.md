# Cornell notes with evidence

Cornell notes are visible project documents for research, codebase analysis, guidance, how-to procedures, root-cause investigations, and learning. The format was independently authored from the structure of the supplied reverse-string note. It uses the requested quote and preserves the distinction between explanation and measured results.

`createCornellNote(root, input)` creates the authoritative narrative, separate exercise and answer files, and a knowledge record containing artifact hashes and provenance. It preserves an existing user solution. Existing note, exercise, and answer paths are protected against overwrite; a revision uses new paths and an explicit review.

Each note has topic/date, context/constraints, cue questions, main notes, demonstration, expected and observed results, failure cases, practice, summary, and a source ledger. Claims use `[observed]`, `[source-reported]`, `[expected]`, or `[inferred]`. Source IDs use `[S1]` references. Local sources and record sources are fingerprinted; external HTTPS sources retain retrieval time and optional captured-content hash. An external citation is structurally checked, not automatically fetched or independently verified.

Observed demonstrations require passing evidence records. A worked example can remain an expected result until it runs. Commands are explicit argument vectors and are executed only through the engineering check workflow. Format checks cannot establish the educational correctness of prose or causal conclusions; those require independent review.

`validateCornellNote(root, id)` reports missing/changed artifacts, malformed sections, placeholder prose, unresolved citations, broken local links or heading anchors, changed local/record sources, and missing demonstration evidence. `noteFreshnessProblems(root, taskOrRecord)` applies those checks to linked notes during engineering gates.

Root-cause notes add reproduction, hypotheses, eliminating evidence, confirmed/unresolved conclusion, repair, and regression results. A problem record links to its explanation through the note's `documents` relationship. Practice artifacts keep the exercise separate from the answer; a user solution is neither hashed as generated content nor overwritten.

The default note location is `docs/knowledge/<topic>.md`. The source reference note is an inspiration for the portable layout; its topic-specific algorithms and unrelated scripts are not copied.
