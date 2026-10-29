import { genId } from './util';
import type { Question, Quiz } from '../game/types';

/* Turns a worksheet / Canvas-export PDF into a draft quiz (same rules as the original importer). */

const clean = (s: unknown) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

function splitQuestionBlocks(text: string): string[] {
  text = String(text || '').replace(/\r/g, '\n');
  const re = /(?:^|\s)(?:Question|Q)\s*(\d+)\s*(?:\(\s*\d+\s*points?\s*\))?/gi;
  const matches: { index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) matches.push({ index: m.index, end: re.lastIndex });
  return matches.map((match, i) => text.slice(match.end, i + 1 < matches.length ? matches[i + 1].index : text.length).trim());
}

const KNOWN_ANSWERS: [string, string][] = [
  ['alliance that included the united states, the united kingdom, the soviet union, and france', 'allied powers'],
  ['information used to influence public opinion', 'propaganda'],
  ['six million jews', 'the holocaust'],
  ['lightning war', 'blitzkrieg'],
  ['control every aspect of public and private life', 'totalitarianism'],
  ['germany, italy, and japan', 'axis powers'],
  ['staying away from international affairs', 'isolationism'],
  ['controlled distribution', 'rationing'],
  ['dictatorial', 'fascism'],
  ['june 6, 1944', 'd-day invasion'],
  ['formal agreement between opposing sides to stop fighting', 'armistice'],
  ['strong military capability', 'militarism'],
  ['national socialist german workers', 'nazis'],
  ['deliberate destruction of a racial, political, or cultural group', 'genocide'],
  ['violate international rules of war', 'war crimes'],
];

export function guessCorrectIndex(question: string, answers: string[]): number {
  const q = clean(question).toLowerCase();
  const a = answers.map((x) => clean(x).toLowerCase());
  for (const [needle, answer] of KNOWN_ANSWERS) {
    if (q.includes(needle)) {
      const idx = a.findIndex((x) => x.includes(answer));
      if (idx >= 0) return idx;
    }
  }
  const key = q.match(/correct\s+answer\s*[:-]\s*([a-d])/i) || q.match(/answer\s*[:-]\s*([a-d])/i);
  return key ? 'abcd'.indexOf(key[1].toLowerCase()) : 0;
}

// Answer markers like "a." / "b)". The loose form (optional punctuation) is the
// original rule; it is only used when no punctuated markers are found, because it
// also matches the word "a" inside a question ("Which is a prime number?").
const STRICT = { marker: /(?:^|\s)[a-dA-D][.)]\s+/, answers: /(?:^|\s)([a-dA-D])[.)]\s+(.+?)(?=\s+[a-dA-D][.)]\s+|$)/g };
const LOOSE = { marker: /(?:^|\s)[a-dA-D][.)]?\s+/, answers: /(?:^|\s)([a-dA-D])[.)]?\s+(.+?)(?=\s+[a-dA-D][.)]?\s+|$)/g };

function splitAnswers(b: string, rule: typeof STRICT): { qText: string; answers: string[] } {
  const answers: string[] = [];
  const re = new RegExp(rule.answers);
  let m: RegExpExecArray | null;
  while ((m = re.exec(b)) !== null) answers.push(clean(m[2]));
  const first = b.search(rule.marker);
  return { qText: first >= 0 ? b.slice(0, first) : '', answers };
}

export function parseQuestions(text: string): Question[] {
  const questions: Question[] = [];
  splitQuestionBlocks(text).forEach((block) => {
    const b = clean(block).replace(/^\(?\s*\d+\s*points?\s*\)?/i, '').trim();
    let parsed = splitAnswers(b, STRICT);
    if (parsed.answers.length < 2) parsed = splitAnswers(b, LOOSE);
    if (parsed.answers.length < 2) return;
    const qText = clean(parsed.qText.replace(/^\(?\s*\d+\s*points?\s*\)?/i, ''));
    if (!qText) return;
    const found = parsed.answers.slice(0, 4);
    questions.push({
      id: genId(),
      type: 'quiz',
      text: qText,
      seconds: 20,
      media: null,
      answers: found.map((t) => ({ id: genId(), text: t, media: null })),
      correctIndex: guessCorrectIndex(qText, found),
      typeAnswer: '',
    });
  });
  return questions;
}

async function extractText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.js?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    // Rebuild lines by grouping text items that share a Y position.
    const lines: { y: number; parts: { x: number; str: string }[] }[] = [];
    content.items.forEach((item) => {
      if (!('str' in item)) return;
      const y = Math.round(item.transform?.[5] || 0);
      let line = lines.find((l) => Math.abs(l.y - y) <= 2);
      if (!line) lines.push((line = { y, parts: [] }));
      line.parts.push({ x: item.transform?.[4] || 0, str: item.str || '' });
    });
    lines.sort((a, b) => b.y - a.y);
    pages.push(lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ')).join('\n'));
  }
  return pages.join('\n');
}

export async function quizFromPdf(file: File): Promise<Quiz> {
  const questions = parseQuestions(await extractText(file));
  if (!questions.length) throw new Error('No questions detected. This PDF may be scanned/image-only or formatted differently.');
  return {
    id: genId(),
    title: file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported PDF Quiz',
    folderId: '',
    cover: null,
    shuffleAnswers: false,
    updatedAt: Date.now(),
    questions,
  };
}
