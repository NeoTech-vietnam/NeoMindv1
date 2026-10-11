import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createCornellNote,
  cornellQuote,
  noteFreshnessProblems,
  validateCornellNote,
} from '../dist/notes.js';
import { createRecord, initialize, updateRecord } from '../dist/storage.js';
import { runCheck } from '../dist/engineering.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'verythinker-cornell-'));
  t.after(() => {
    const target = resolve(root);
    assert.ok(relative(tmpdir(), target).startsWith('verythinker-cornell-'));
    rmSync(target, { recursive: true, force: true });
  });
  initialize(root, { project_id: 'NOTE' });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/example.mjs'), 'export const answer = 42;\n');
  return root;
}
function input() {
  return {
    topic: 'Named numeric export',
    kind: 'codebase-analysis',
    path: 'docs/knowledge/export.md',
    context: 'This local module provides a fixed named export for a small demonstration.',
    constraints: ['Node.js executes the module without additional dependencies.'],
    cues: ['Which named export contains the fixed numeric answer?'],
    main_notes:
      '[source-reported] The inspected module exports answer with value 42 [S1]. [expected] Importing it yields the same number.',
    sources: [
      {
        id: 'S1',
        title: 'Local numeric export module',
        uri: 'src/example.mjs',
        retrieved_at: '2026-10-11T00:00:00Z',
        locator: 'line 1',
      },
    ],
    demonstration: {
      body: 'Import the named export and inspect its numeric value in the Node runtime.',
      expected: 'The named answer export evaluates to numeric value 42.',
      command: [
        process.execPath,
        '--input-type=module',
        '-e',
        'import {answer} from "./src/example.mjs"; console.log(answer)',
      ],
    },
    failure_cases: ['Changing the export name causes named-import resolution to fail.'],
    practice: {
      exercise_path: 'docs/practice/export-exercise.md',
      exercise: '# Exercise\nCreate a named export and explain how an import resolves its value.\n',
      answer_path: 'docs/practice/export-answer.md',
      answer: '# Answer\nUse export const value and a matching named import in the consumer.\n',
      solution_path: 'docs/practice/my-export.mjs',
      starter: '// Write your own named-export demonstration.\n',
      command: [
        process.execPath,
        '--input-type=module',
        '-e',
        'import {answer} from "./src/example.mjs"; if(answer !== 42) process.exit(1)',
      ],
    },
    summary:
      'A named export gives callers a stable symbolic interface to the declared numeric value.',
  };
}
test('Cornell artifacts preserve the quote, narrative ownership, source ledger, and separate practice', (t) => {
  const root = fixture(t);
  const note = createCornellNote(root, input());
  const narrative = readFileSync(join(root, note.meta.data.artifact_path), 'utf8');
  assert.ok(narrative.includes(cornellQuote));
  assert.ok(narrative.includes('[expected] The demonstration has not been executed'));
  assert.equal(note.body.includes(input().main_notes), false);
  assert.equal(validateCornellNote(root, note.meta.id).ok, true);
  assert.equal(note.meta.data.sources[0].sha256.length, 64);
  assert.notEqual(note.meta.data.practice.exercise_path, note.meta.data.practice.answer_path);
});
test('creation preserves existing user solutions and refuses generated artifact overwrites', (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'docs/practice'), { recursive: true });
  writeFileSync(
    join(root, 'docs/practice/my-export.mjs'),
    '// My authored reasoning must remain intact.\n',
  );
  createCornellNote(root, input());
  assert.equal(
    readFileSync(join(root, 'docs/practice/my-export.mjs'), 'utf8'),
    '// My authored reasoning must remain intact.\n',
  );
  assert.throws(() => createCornellNote(root, input()), /Preserve existing artifact/);
});
test('changed local and record sources invalidate their linked Cornell notes', (t) => {
  const root = fixture(t);
  const requirement = createRecord(root, {
    type: 'requirement',
    title: 'Answer is forty two',
    body: 'The module provides numeric answer forty two.',
    data: { acceptance_criteria: ['answer equals 42'] },
  });
  const task = createRecord(root, {
    type: 'task',
    title: 'Read the numeric export',
    links: [{ type: 'satisfies', target: requirement.meta.id }],
  });
  const value = input();
  value.requirement_ids = [requirement.meta.id];
  value.sources.push({
    id: 'S2',
    title: 'Numeric answer requirement',
    uri: `record:${requirement.meta.id}`,
    record_id: requirement.meta.id,
    retrieved_at: '2026-10-11T00:00:00Z',
  });
  const note = createCornellNote(root, value);
  updateRecord(root, task.meta.id, {
    links: [...task.meta.links, { type: 'references', target: note.meta.id }],
  });
  writeFileSync(join(root, 'src/example.mjs'), 'export const answer = 43;\n');
  updateRecord(
    root,
    requirement.meta.id,
    {},
    'The requirement changed to numeric answer forty three.',
  );
  const errors = noteFreshnessProblems(root, task.meta.id);
  assert.ok(errors.some((message) => message.includes('source file changed')));
  assert.ok(errors.some((message) => message.includes('source record changed')));
});
test('notes reject placeholders, missing demonstrations, unsupported claims, and unknown citations', (t) => {
  const root = fixture(t);
  const missing = input();
  missing.demonstration.body = '';
  assert.throws(() => createCornellNote(root, missing), /Demonstration/);
  const unlabelled = input();
  unlabelled.main_notes = 'The module exports answer value 42 [S1].';
  assert.throws(() => createCornellNote(root, unlabelled), /label claims/);
  const unknown = input();
  unknown.main_notes += ' [source-reported] Another source gives a different answer [S9].';
  assert.throws(() => createCornellNote(root, unknown), /Unknown source citation/);
  const placeholder = input();
  placeholder.summary = 'TODO explain this numeric interface later.';
  assert.throws(() => createCornellNote(root, placeholder), /placeholders/);
  const observed = input();
  observed.demonstration.observed = 'The actual runtime printed value forty two.';
  assert.throws(() => createCornellNote(root, observed), /requires evidence/);
});
test('validation detects broken links, removed quote, and changed practice answers', (t) => {
  const root = fixture(t);
  const note = createCornellNote(root, input());
  const path = join(root, note.meta.data.artifact_path);
  writeFileSync(
    path,
    readFileSync(path, 'utf8')
      .replace(cornellQuote, '')
      .replace('## Summary', '[Broken](missing.md#unknown)\n\n## Summary'),
  );
  writeFileSync(
    join(root, 'docs/practice/export-answer.md'),
    '# Answer\nA different unreviewed answer now occupies this file.\n',
  );
  const report = validateCornellNote(root, note.meta.id);
  assert.equal(report.ok, false);
  assert.ok(report.problems.some((message) => message.includes('exact demonstration quote')));
  assert.ok(report.problems.some((message) => message.includes('Broken local link')));
  assert.ok(report.problems.some((message) => message.includes('export-answer.md')));
});
test('root-cause investigations require explicit hypotheses and confirmed or unresolved conclusions', (t) => {
  const root = fixture(t);
  const value = input();
  value.kind = 'root-cause';
  assert.throws(() => createCornellNote(root, value), /Root-cause notes/);
  value.root_cause = {
    reproduction: 'Import the missing name and observe a module resolution failure.',
    hypotheses: ['The caller uses a name that differs from the exported identifier.'],
    eliminating_evidence:
      'Source inspection excludes a numeric-value conversion error in the module.',
    conclusion: 'unresolved',
    cause: 'The name mismatch is a candidate until an actual reproduction supplies evidence.',
    repair: 'Align the import name with the established interface after review.',
    regression: 'Regression execution remains pending; no actual passing result is claimed.',
  };
  const note = createCornellNote(root, value);
  assert.ok(
    readFileSync(join(root, note.meta.data.artifact_path), 'utf8').includes(
      '### Conclusion: unresolved',
    ),
  );
});
test('observed demonstrations require current execution inputs, logs, and receipts', (t) => {
  const root = fixture(t);
  const requirement = createRecord(root, {
    type: 'requirement',
    title: 'Answer has fixed value',
    body: 'The named export has numeric value forty two.',
    data: { acceptance_criteria: ['answer equals 42'] },
  });
  const task = createRecord(root, {
    type: 'task',
    title: 'Inspect actual numeric export',
    links: [{ type: 'satisfies', target: requirement.meta.id }],
  });
  const check = createRecord(root, {
    type: 'check',
    title: 'Execute the export demonstration',
    links: [{ type: 'verifies', target: requirement.meta.id }],
    data: {
      command: [
        process.execPath,
        '--input-type=module',
        '-e',
        'import {answer} from "./src/example.mjs"; if(answer !== 42) process.exit(1); console.log(answer)',
      ],
      baseline_paths: ['src/example.mjs'],
    },
  });
  const evidence = runCheck(root, check.meta.id, task.meta.id);
  assert.equal(evidence.meta.data.result, 'pass');
  const value = input();
  value.demonstration.observed = 'The native Node process printed 42 and exited successfully.';
  value.demonstration.evidence_ids = [evidence.meta.id];
  const note = createCornellNote(root, value);
  assert.equal(validateCornellNote(root, note.meta.id).ok, true);
  writeFileSync(
    join(root, evidence.meta.data.log_path),
    'An altered execution log cannot substantiate the observation.',
  );
  assert.ok(
    validateCornellNote(root, note.meta.id).problems.some((problem) =>
      problem.includes('execution log'),
    ),
  );
});
test('task freshness includes notes attached to allocated requirements and recipe instances', (t) => {
  const root = fixture(t);
  const requirement = createRecord(root, {
    type: 'requirement',
    title: 'Numeric export requirement',
    body: 'The named export provides numeric value forty two.',
    data: { acceptance_criteria: ['answer equals 42'] },
  });
  const task = createRecord(root, {
    type: 'task',
    title: 'Verify the allocated numeric interface',
    links: [{ type: 'satisfies', target: requirement.meta.id }],
  });
  const value = input();
  value.requirement_ids = [requirement.meta.id];
  const note = createCornellNote(root, value);
  assert.deepEqual(noteFreshnessProblems(root, task.meta.id), []);
  writeFileSync(join(root, 'src/example.mjs'), 'export const answer = 43;\n');
  assert.ok(
    noteFreshnessProblems(root, task.meta.id).some((problem) =>
      problem.includes('source file changed'),
    ),
  );
  updateRecord(root, note.meta.id, { status: 'superseded' });
  assert.deepEqual(noteFreshnessProblems(root, task.meta.id), []);
});
