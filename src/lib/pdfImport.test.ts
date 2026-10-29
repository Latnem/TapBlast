import { describe, expect, it } from 'vitest';
import { parseQuestions } from './pdfImport';

describe('parseQuestions', () => {
  it('reads numbered questions with a-d answers and an answer key', () => {
    const text = [
      'Question 1 (1 point)',
      'Information used to influence public opinion is called',
      'a. rationing  b. propaganda  c. armistice  d. genocide',
      'Question 2 (1 point)',
      'Which is a prime number? Answer: c',
      'a) 4 b) 6 c) 7 d) 9',
      'Question 3',
      'Not a real question with no answers',
    ].join('\n');
    const qs = parseQuestions(text);
    expect(qs).toHaveLength(2);
    expect(qs[0].text).toContain('influence public opinion');
    expect(qs[0].answers.map((a) => a.text)).toEqual(['rationing', 'propaganda', 'armistice', 'genocide']);
    expect(qs[0].correctIndex).toBe(1);
    expect(qs[1].text).toBe('Which is a prime number? Answer: c');
    expect(qs[1].correctIndex).toBe(2);
  });

  it('still reads answers without punctuation (original format)', () => {
    const qs = parseQuestions('Q1 Pick the largest A one B two C three D four');
    expect(qs[0].text).toBe('Pick the largest');
    expect(qs[0].answers.map((a) => a.text)).toEqual(['one', 'two', 'three', 'four']);
  });
});
