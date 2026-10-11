import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import {
  atomicWrite,
  createRecord,
  getRecord,
  hash,
  loadRecords,
  now,
  readConfig,
  safePath,
  snapshotPaths,
  withOperationLock,
} from './storage.js';
import type { ProjectRecord } from './types.js';

export const cornellQuote =
  '<p align="center"><strong><em>"DO NOT JUST TALK ABOUT IT — SHOW IT"</em></strong></p>';
export const cornellKinds = [
  'research-note',
  'codebase-analysis',
  'guidance',
  'how-to',
  'root-cause',
  'learning-note',
] as const;
export type CornellKind = (typeof cornellKinds)[number];
export interface CornellSource {
  id: string;
  title: string;
  uri: string;
  retrieved_at: string;
  locator?: string;
  record_id?: string;
  sha256?: string;
}
export interface CornellInput {
  topic: string;
  kind: CornellKind;
  path?: string;
  owner?: string;
  date?: string;
  context: string;
  constraints: string[];
  cues: string[];
  main_notes: string;
  sources: CornellSource[];
  demonstration: {
    body: string;
    expected: string;
    command?: string[];
    observed?: string;
    evidence_ids?: string[];
  };
  failure_cases: string[];
  practice: {
    exercise_path: string;
    exercise: string;
    answer_path: string;
    answer: string;
    command?: string[];
    solution_path?: string;
    starter?: string;
  };
  summary: string;
  requirement_ids?: string[];
  problem_ids?: string[];
  root_cause?: {
    reproduction: string;
    hypotheses: string[];
    eliminating_evidence: string;
    conclusion: 'confirmed' | 'unresolved';
    cause: string;
    repair: string;
    regression: string;
  };
}
function text(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.trim().length < 8 ||
    /\b(?:TODO|TBD|insert here|fill in|placeholder)\b/i.test(value)
  )
    throw new Error(`${label} needs substantive content without placeholders.`);
}
function contentPath(root: string, path: string): string {
  if (!path || path.includes('\\'))
    throw new Error('Note paths must use non-empty project-relative forward-slash paths.');
  const canonical = relative(root, safePath(root, path)).replaceAll('\\', '/');
  if (
    !canonical ||
    canonical.startsWith('.verythinker/') ||
    canonical.startsWith('.git/') ||
    canonical !== path
  )
    throw new Error(
      'Cornell artifacts must use canonical visible project paths outside managed records.',
    );
  return canonical;
}
function fingerprint(record: ProjectRecord): string {
  const { submission, requested_model, confirmed_model, attempts, ...data } = record.meta.data;
  return hash(
    JSON.stringify({
      type: record.meta.type,
      title: record.meta.title,
      owner: record.meta.owner,
      links: record.meta.links,
      data,
      body: record.body,
    }),
  );
}
function demonstrationEvidenceProblems(root: string, evidence: ProjectRecord): string[] {
  const problems: string[] = [];
  const data = evidence.meta.data;
  if (evidence.meta.type !== 'evidence' || data.result !== 'pass')
    return ['Demonstration requires passing execution evidence.'];
  try {
    if (
      !data.file_baseline ||
      typeof data.file_baseline !== 'object' ||
      !Object.keys(data.file_baseline).length
    )
      problems.push('Demonstration evidence lacks input file hashes.');
    else
      for (const [path, digest] of Object.entries(data.file_baseline as Record<string, string>))
        if (snapshotPaths(root, [path])[path] !== digest)
          problems.push(`Demonstration evidence input changed: ${path}`);
    const checkId = evidence.meta.links.find((link) => link.type === 'evidence-for')?.target;
    if (!checkId || fingerprint(getRecord(root, checkId)) !== data.check_fingerprint)
      problems.push('Demonstration verification procedure is missing or changed.');
    for (const [id, digest] of Object.entries(
      (data.record_baseline as Record<string, string>) ?? {},
    ))
      if (fingerprint(getRecord(root, id)) !== digest)
        problems.push(`Demonstration evidence record baseline changed: ${id}`);
    if (
      typeof data.log_path !== 'string' ||
      hash(readFileSync(safePath(root, data.log_path))) !== data.log_hash
    )
      problems.push('Demonstration evidence execution log is missing or changed.');
    if (typeof data.receipt_path !== 'string')
      problems.push('Demonstration evidence receipt is missing.');
    else {
      const receipt = JSON.parse(readFileSync(safePath(root, data.receipt_path), 'utf8'));
      if (
        receipt.result !== 'pass' ||
        receipt.log_hash !== data.log_hash ||
        JSON.stringify(receipt.file_baseline) !== JSON.stringify(data.file_baseline)
      )
        problems.push('Demonstration evidence receipt does not match its record.');
    }
  } catch {
    problems.push('Demonstration evidence inputs, log, or receipt cannot be resolved.');
  }
  return problems;
}
function normalizeSource(
  root: string,
  source: CornellSource,
): CornellSource & { baseline?: string } {
  if (!/^S[1-9][0-9]*$/.test(source.id)) throw new Error('Source IDs must use S1, S2, and so on.');
  text(source.title, `Source ${source.id} title`);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(source.retrieved_at) ||
    !Number.isFinite(Date.parse(source.retrieved_at))
  )
    throw new Error(`Source ${source.id} needs an ISO retrieval timestamp.`);
  if (source.record_id) {
    const record = getRecord(root, source.record_id);
    return { ...source, baseline: fingerprint(record) };
  }
  if (/^https?:\/\//.test(source.uri)) {
    const url = new URL(source.uri);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('External sources require HTTPS without embedded credentials.');
    if (source.sha256 && !/^[a-f0-9]{64}$/.test(source.sha256))
      throw new Error('Source hashes must be SHA-256 hex values.');
    return { ...source };
  }
  const path = contentPath(root, source.uri);
  if (!existsSync(safePath(root, path)) || !statSync(safePath(root, path)).isFile())
    throw new Error(`Source file is missing: ${path}`);
  const baseline = hash(readFileSync(safePath(root, path)));
  if (source.sha256 && source.sha256 !== baseline) throw new Error(`Source hash is stale: ${path}`);
  return { ...source, uri: path, sha256: baseline, baseline };
}
function command(value: string[] | undefined): string {
  if (!value) return 'Worked example: evaluate the explicit inputs and expected outcome below.';
  if (!value.length || value.some((part) => typeof part !== 'string' || !part.trim()))
    throw new Error('Runnable commands require a non-empty argument vector.');
  return `Argument vector (run from the project root):\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
}
function sourceLinks(body: string, sources: CornellSource[]): string[] {
  const used = [...body.matchAll(/\[(S[1-9][0-9]*)\]/g)].map((match) => match[1]!);
  const ids = new Set(sources.map((source) => source.id));
  return [...new Set(used.filter((id) => !ids.has(id)))].map(
    (id) => `Unknown source citation [${id}].`,
  );
}
function linkProblems(
  root: string,
  path: string,
  body: string,
  proposed: Record<string, string> = {},
): string[] {
  const errors: string[] = [];
  for (const match of body.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    let uri = match[1]!.replace(/^<|>$/g, '').split(/\s+"/)[0]!;
    if (/^https:\/\//.test(uri)) {
      try {
        const url = new URL(uri);
        if (url.username || url.password) errors.push('Links cannot contain credentials.');
      } catch {
        errors.push(`Invalid external link: ${uri}`);
      }
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
      errors.push(`Unsupported link scheme: ${uri}`);
      continue;
    }
    const [file = '', anchor] = uri.split('#');
    try {
      const target = file
        ? safePath(root, `${dirname(path).replaceAll('\\', '/')}/${decodeURIComponent(file)}`)
        : safePath(root, path);
      const projected = proposed[relative(root, target).replaceAll('\\', '/')];
      if (projected === undefined && (!existsSync(target) || !statSync(target).isFile())) {
        errors.push(`Broken local link: ${uri}`);
        continue;
      }
      if (anchor) {
        const targetBody = projected ?? readFileSync(target, 'utf8');
        const headings = [...targetBody.matchAll(/^#{1,6}\s+(.+)$/gm)].map((item) =>
          item[1]!
            .toLowerCase()
            .replace(/[^\p{L}\p{N} _-]/gu, '')
            .replace(/ /g, '-'),
        );
        const explicit = targetBody.includes(`id="${anchor}"`);
        if (!headings.includes(decodeURIComponent(anchor)) && !explicit)
          errors.push(`Broken heading anchor: ${uri}`);
      }
    } catch {
      errors.push(`Unsafe local link: ${uri}`);
    }
  }
  return errors;
}
/** Create visible narrative once; managed knowledge holds references and provenance only. */
export function createCornellNote(root: string, input: CornellInput): ProjectRecord {
  readConfig(root);
  if (!cornellKinds.includes(input.kind)) throw new Error('Unsupported Cornell note kind.');
  text(input.topic, 'Topic');
  text(input.context, 'Context');
  text(input.main_notes, 'Main notes');
  text(input.summary, 'Summary');
  for (const key of ['constraints', 'cues', 'failure_cases'] as const) {
    if (!Array.isArray(input[key]) || !input[key].length)
      throw new Error(`${key} needs at least one substantive entry.`);
    input[key].forEach((value) => text(value, key));
  }
  if (!/\[(?:observed|source-reported|expected|inferred)\]/.test(input.main_notes))
    throw new Error(
      'Main notes must label claims as observed, source-reported, expected, or inferred.',
    );
  if (
    !input.sources.length ||
    new Set(input.sources.map((source) => source.id)).size !== input.sources.length
  )
    throw new Error('Notes need a non-empty source ledger with unique source IDs.');
  const sources = input.sources.map((source) => normalizeSource(root, source));
  if (!/\[S[1-9][0-9]*\]/.test(input.main_notes))
    throw new Error('Main notes must cite the source ledger using [S1] references.');
  text(input.demonstration.body, 'Demonstration');
  text(input.demonstration.expected, 'Expected result');
  text(input.practice.exercise, 'Practice exercise');
  text(input.practice.answer, 'Practice answer');
  if (!input.practice.command)
    throw new Error('Practice needs an explicit runnable argument vector.');
  command(input.practice.command);
  if (input.demonstration.observed) text(input.demonstration.observed, 'Observed result');
  const evidenceIds = input.demonstration.evidence_ids ?? [];
  if (input.demonstration.observed && !evidenceIds.length)
    throw new Error('An observed demonstration requires evidence record IDs.');
  evidenceIds.forEach((id) => {
    const evidence = getRecord(root, id);
    const problems = demonstrationEvidenceProblems(root, evidence);
    if (problems.length)
      throw new Error(
        `Observed demonstration requires current passing evidence: ${id}: ${problems.join('; ')}`,
      );
  });
  const links = [
    ...(input.requirement_ids ?? []).map((id) => {
      if (getRecord(root, id).meta.type !== 'requirement')
        throw new Error(`Expected requirement: ${id}`);
      return { type: 'documents' as const, target: id };
    }),
    ...(input.problem_ids ?? []).map((id) => {
      if (getRecord(root, id).meta.type !== 'problem') throw new Error(`Expected problem: ${id}`);
      return { type: 'documents' as const, target: id };
    }),
    ...evidenceIds.map((id) => ({ type: 'references' as const, target: id })),
    ...sources
      .filter((source) => source.record_id)
      .map((source) => ({ type: 'references' as const, target: source.record_id! })),
  ];
  const path = contentPath(
    root,
    input.path ??
      `docs/knowledge/${input.topic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}.md`,
  );
  const exercisePath = contentPath(root, input.practice.exercise_path);
  const answerPath = contentPath(root, input.practice.answer_path);
  const solutionPath = input.practice.solution_path
    ? contentPath(root, input.practice.solution_path)
    : null;
  if (
    new Set([path, exercisePath, answerPath, ...(solutionPath ? [solutionPath] : [])]).size !==
    3 + Number(Boolean(solutionPath))
  )
    throw new Error('Note, exercise, answer, and user solution need separate paths.');
  const date = input.date ?? now().slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error('Note dates must use a valid YYYY-MM-DD date.');
  const link = (target: string) =>
    relative(dirname(safePath(root, path)), safePath(root, target)).replaceAll('\\', '/');
  let cause = '';
  if (input.kind === 'root-cause') {
    const value = input.root_cause;
    if (
      !value ||
      !['confirmed', 'unresolved'].includes(value.conclusion) ||
      !value.hypotheses?.length
    )
      throw new Error(
        'Root-cause notes need reproduction, hypotheses, eliminating evidence, conclusion, repair, and regression.',
      );
    for (const key of [
      'reproduction',
      'eliminating_evidence',
      'cause',
      'repair',
      'regression',
    ] as const)
      text(value[key], `Root-cause ${key}`);
    value.hypotheses.forEach((item) => text(item, 'Hypothesis'));
    cause = `\n## Root-Cause Analysis\n\n### Reproduction\n${value.reproduction}\n\n### Hypotheses\n${value.hypotheses.map((item) => `- ${item}`).join('\n')}\n\n### Eliminating Evidence\n${value.eliminating_evidence}\n\n### Conclusion: ${value.conclusion}\n${value.cause}\n\n### Repair\n${value.repair}\n\n### Regression Results\n${value.regression}\n`;
  }
  const sourceBody = sources
    .map(
      (source) =>
        `- [${source.id}] ${source.title}; ${source.uri}; retrieved ${source.retrieved_at}; locator: ${source.locator ?? 'whole source'}${source.sha256 ? `; SHA-256: ${source.sha256}` : ''}`,
    )
    .join('\n');
  const body = `# Cornell Notes\n\n## Topic: ${input.topic}\n\n## Date: ${date}\n\n${cornellQuote}\n\n## Context and Constraints\n\n${input.context}\n\n${input.constraints.map((item) => `- ${item}`).join('\n')}\n\n## Cue Column\n\n${input.cues.map((item) => `- ${item}`).join('\n')}\n\n## Main Notes\n\n${input.main_notes}\n\n## Demonstration\n\n${input.demonstration.body}\n\n${command(input.demonstration.command)}\n\n### Expected Result\n\n[expected] ${input.demonstration.expected}\n\n### Observed Result\n\n${input.demonstration.observed ? `[observed] ${input.demonstration.observed}\nEvidence: ${evidenceIds.join(', ')}` : '[expected] The demonstration has not been executed; no observed result is claimed.'}\n\n## Failure Cases\n\n${input.failure_cases.map((item) => `- ${item}`).join('\n')}\n\n## Practice\n\n[Exercise](${link(exercisePath)}) · [Answer](${link(answerPath)})${solutionPath ? ` · [Your solution](${link(solutionPath)})` : ''}\n\n${command(input.practice.command)}\n${cause}\n## Summary\n\n${input.summary}\n\n## Sources\n\n${sourceBody}\n`;
  const citationErrors = sourceLinks(body, sources);
  if (citationErrors.length) throw new Error(citationErrors.join(' '));
  return withOperationLock(root, `cornell-${hash(path).slice(0, 32)}`, () => {
    for (const target of [path, exercisePath, answerPath])
      if (existsSync(safePath(root, target)))
        throw new Error(`Preserve existing artifact; choose a new path: ${target}`);
    const proposed = {
      [path]: body,
      [exercisePath]: input.practice.exercise,
      [answerPath]: input.practice.answer,
      ...(solutionPath && !existsSync(safePath(root, solutionPath))
        ? {
            [solutionPath]:
              input.practice.starter ??
              '# My solution\n\nRecord your reasoning and implementation here.\n',
          }
        : {}),
    };
    const broken = linkProblems(root, path, body, proposed);
    if (broken.length) throw new Error(broken.join(' '));
    const artifacts: Record<string, string> = {
      [path]: hash(body),
      [exercisePath]: hash(input.practice.exercise),
      [answerPath]: hash(input.practice.answer),
    };
    atomicWrite(safePath(root, exercisePath), input.practice.exercise);
    atomicWrite(safePath(root, answerPath), input.practice.answer);
    if (solutionPath && !existsSync(safePath(root, solutionPath)))
      atomicWrite(
        safePath(root, solutionPath),
        input.practice.starter ??
          '# My solution\n\nRecord your reasoning and implementation here.\n',
      );
    atomicWrite(safePath(root, path), body);
    return createRecord(root, {
      type: 'knowledge',
      title: input.topic,
      owner: input.owner ?? 'curator',
      status: 'draft',
      links,
      data: {
        kind: input.kind,
        format: 'cornell-v1',
        artifact_path: path,
        artifact_hashes: artifacts,
        sources,
        demonstration: input.demonstration,
        practice: {
          exercise_path: exercisePath,
          answer_path: answerPath,
          solution_path: solutionPath,
          command: input.practice.command ?? null,
        },
        source_review: 'structural-only',
      },
      body: `# ${input.topic}\n\nAuthoritative Cornell narrative: ${path}.\nThis record stores artifact hashes, source provenance, and engineering links. Content quality requires independent review.\n`,
    });
  });
}
export function validateCornellNote(
  root: string,
  id: string,
): { ok: boolean; problems: string[]; checked_at: string } {
  const record = getRecord(root, id);
  const problems: string[] = [];
  if (record.meta.type !== 'knowledge' || record.meta.data.format !== 'cornell-v1')
    throw new Error('Expected a Cornell knowledge record.');
  const data = record.meta.data;
  const artifacts = data.artifact_hashes as Record<string, string> | undefined;
  const path = data.artifact_path as string;
  if (!artifacts || typeof path !== 'string')
    return { ok: false, problems: ['Cornell artifact metadata is missing.'], checked_at: now() };
  for (const [file, baseline] of Object.entries(artifacts)) {
    try {
      contentPath(root, file);
      if (
        !existsSync(safePath(root, file)) ||
        hash(readFileSync(safePath(root, file))) !== baseline
      )
        problems.push(`Cornell artifact is missing or changed: ${file}`);
    } catch {
      problems.push(`Unsafe Cornell artifact path: ${file}`);
    }
  }
  try {
    const body = readFileSync(safePath(root, path), 'utf8');
    if (!body.includes(cornellQuote))
      problems.push('Cornell note is missing the exact demonstration quote.');
    for (const section of [
      'Context and Constraints',
      'Cue Column',
      'Main Notes',
      'Demonstration',
      'Expected Result',
      'Observed Result',
      'Failure Cases',
      'Practice',
      'Summary',
      'Sources',
    ]) {
      if (!new RegExp(`^#{2,3} ${section}\\s*$`, 'm').test(body))
        problems.push(`Cornell section is missing: ${section}`);
    }
    if (/\b(?:TODO|TBD|insert here|fill in|placeholder)\b/i.test(body))
      problems.push('Cornell note still contains placeholders.');
    const sources = Array.isArray(data.sources)
      ? (data.sources as (CornellSource & { baseline?: string })[])
      : [];
    if (!sources.length) problems.push('Cornell source ledger is missing.');
    problems.push(...sourceLinks(body, sources), ...linkProblems(root, path, body));
    for (const source of sources) {
      try {
        if (source.record_id && fingerprint(getRecord(root, source.record_id)) !== source.baseline)
          problems.push(`Cornell source record changed: ${source.record_id}`);
        else if (
          !source.record_id &&
          !/^https:\/\//.test(source.uri) &&
          hash(readFileSync(safePath(root, source.uri))) !== source.baseline
        )
          problems.push(`Cornell source file changed: ${source.uri}`);
      } catch {
        problems.push(`Cornell source cannot be resolved: ${source.id}`);
      }
    }
    const demonstration = data.demonstration as CornellInput['demonstration'];
    for (const evidenceId of demonstration?.evidence_ids ?? []) {
      try {
        const evidence = getRecord(root, evidenceId);
        problems.push(
          ...demonstrationEvidenceProblems(root, evidence).map(
            (problem) => `${evidenceId}: ${problem}`,
          ),
        );
      } catch {
        problems.push(`Cornell demonstration evidence is missing: ${evidenceId}`);
      }
    }
  } catch {
    problems.push('Cornell narrative cannot be read.');
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)], checked_at: now() };
}
/** Engineering gates call this for direct notes or notes linked to an assignment. */
export function noteFreshnessProblems(
  root: string,
  recordOrTask?: ProjectRecord | string,
): string[] {
  const records = loadRecords(root);
  const target = typeof recordOrTask === 'string' ? getRecord(root, recordOrTask) : recordOrTask;
  const applicable = new Set(
    target
      ? [
          target.meta.id,
          ...target.meta.links.map((link) => link.target),
          ...(Array.isArray(target.meta.data.requirements)
            ? (target.meta.data.requirements as string[])
            : []),
        ]
      : [],
  );
  if (target?.meta.type === 'task') {
    for (const recipe of records.filter(
      (record) =>
        record.meta.data.kind === 'recipe-instance' &&
        record.meta.data.task_id === target.meta.id &&
        record.meta.status !== 'superseded',
    ))
      if (typeof recipe.meta.data.note_id === 'string') applicable.add(recipe.meta.data.note_id);
    const pending = [...applicable];
    for (let index = 0; index < pending.length; index++) {
      const record = records.find((entry) => entry.meta.id === pending[index]);
      if (!record || !['requirement', 'design'].includes(record.meta.type)) continue;
      for (const link of record.meta.links.filter((link) =>
        ['derives-from', 'satisfies'].includes(link.type),
      ))
        if (!applicable.has(link.target)) {
          applicable.add(link.target);
          pending.push(link.target);
        }
    }
  }
  const notes = records.filter(
    (record) =>
      record.meta.data.format === 'cornell-v1' &&
      record.meta.status !== 'superseded' &&
      (!target ||
        applicable.has(record.meta.id) ||
        record.meta.links.some((link) => applicable.has(link.target)) ||
        target.meta.links.some((link) => link.target === record.meta.id) ||
        (Array.isArray(target.meta.data.knowledge_ids) &&
          target.meta.data.knowledge_ids.includes(record.meta.id))),
  );
  return notes.flatMap((record) =>
    validateCornellNote(root, record.meta.id).problems.map(
      (problem) => `${record.meta.id}: ${problem}`,
    ),
  );
}
