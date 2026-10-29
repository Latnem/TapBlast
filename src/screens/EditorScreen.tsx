import { useRef, useState, type DragEvent } from 'react';
import { Brand, MediaView, Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { answerShapes, defaultQuestion, pointsMultiplier, questionTypeLabel, withQuestionType } from '../game/rules';
import type { AppSettings, Folder, Media, PointsMultiplier, Question, QuestionType, Quiz } from '../game/types';
import { readDataUrl } from '../lib/util';

const toMedia = async (file: File): Promise<Media> => ({
  type: file.type.startsWith('video/') ? 'video' : 'image',
  dataUrl: await readDataUrl(file),
});

/** Quiz as saved: trimmed text, clamped timers. */
export function finalizeQuiz(quiz: Quiz, settings: AppSettings): Quiz {
  return {
    ...quiz,
    title: quiz.title.trim() || 'Untitled Quiz',
    questions: quiz.questions.map((q) => ({
      ...q,
      text: q.text.trim(),
      seconds: Math.max(5, Math.min(120, Number(q.seconds || settings.defaultSeconds || 20))),
      typeAnswer: (q.typeAnswer || '').trim(),
      answers: (q.answers || []).map((a) => ({ ...a, text: (a.text || '').trim() })),
    })),
  };
}

export function EditorScreen({
  initialQuiz,
  folders,
  settings,
  onBack,
  onSave,
  onPreview,
}: {
  initialQuiz: Quiz;
  folders: Folder[];
  settings: AppSettings;
  onBack(): void;
  onSave(quiz: Quiz): Promise<void>;
  onPreview(quiz: Quiz): void;
}) {
  const [quiz, setQuiz] = useState<Quiz>(initialQuiz);
  const [selectedId, setSelectedId] = useState(initialQuiz.questions[0]?.id);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const current = quiz.questions.find((q) => q.id === selectedId) || quiz.questions[0];
  const patchQuiz = (patch: Partial<Quiz>) => setQuiz((z) => ({ ...z, ...patch }));
  const patchQuestion = (id: string, fn: (q: Question) => Question) =>
    setQuiz((z) => ({ ...z, questions: z.questions.map((q) => (q.id === id ? fn(q) : q)) }));

  function addQuestion() {
    const q = defaultQuestion(settings);
    setQuiz((z) => ({ ...z, questions: [...z.questions, q] }));
    setSelectedId(q.id);
  }

  function deleteCurrent() {
    if (quiz.questions.length === 1) {
      alert('At least one question is required.');
      return;
    }
    const idx = quiz.questions.findIndex((q) => q.id === current.id);
    if (!confirm(`Delete Q${idx + 1}? This cannot be undone.`)) return;
    const questions = quiz.questions.filter((q) => q.id !== current.id);
    setQuiz((z) => ({ ...z, questions }));
    setSelectedId(questions[Math.max(0, idx - 1)].id);
  }

  function reorder(draggedId: string, targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setQuiz((z) => {
      const list = z.questions.slice();
      const from = list.findIndex((q) => q.id === draggedId);
      const to = list.findIndex((q) => q.id === targetId);
      if (from < 0 || to < 0) return z;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return { ...z, questions: list };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(finalizeQuiz(quiz, settings));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen id="editor-screen">
      <div style={{ width: '100%' }} onClick={(e) => !(e.target as Element).closest('.question-card-menu-wrap') && setMenuFor(null)}>
        <div className="topbar">
          <div>
            <Brand />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button id="editorBackBtn" type="button" className="btn outline" onClick={onBack}>
              <Icon name="arrow_back" />
              Library
            </button>
            <button id="previewQuizBtn" type="button" className="btn outline" onClick={() => onPreview(finalizeQuiz(quiz, settings))}>
              <Icon name="play_circle" />
              Preview
            </button>
            <button id="saveQuizBtn" type="button" className="btn accent" disabled={saving} onClick={save}>
              Save Quiz
            </button>
          </div>
        </div>
        <div className="app-shell">
          <div className="app-container editor-shell editor-three-col" style={{ maxWidth: 1440 }}>
            <aside className="editor-left editor-questions-panel">
              <div className="editor-side-title">Questions</div>
              <div id="questionList" className="question-list">
                {quiz.questions.map((q, i) => {
                  const mult = pointsMultiplier(q);
                  return (
                    <div
                      key={q.id}
                      className={`question-card ${q.id === current.id ? 'active' : ''}`}
                      draggable
                      data-qid={q.id}
                      onClick={(e) => !(e.target as Element).closest('.question-card-menu-wrap') && setSelectedId(q.id)}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', q.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        reorder(e.dataTransfer.getData('text/plain'), q.id);
                      }}
                    >
                      <div className="question-card-menu-wrap">
                        <button type="button" className="question-type-menu-btn" title="Question options" onClick={() => setMenuFor(menuFor === q.id ? null : q.id)}>
                          ⋮
                        </button>
                        <div className={`question-type-menu ${menuFor === q.id ? '' : 'hidden'}`}>
                          {(
                            [
                              ['quiz', 'Quiz'],
                              ['truefalse', 'True or False'],
                              ['type', 'Type Answer'],
                            ] as [QuestionType, string][]
                          ).map(([type, label]) => (
                            <button key={type} type="button" onClick={() => (patchQuestion(q.id, (x) => withQuestionType(x, type)), setSelectedId(q.id), setMenuFor(null))}>
                              {label}
                            </button>
                          ))}
                          {(
                            [
                              [1, 'Standard points'],
                              [2, 'Double points'],
                              [0, 'No points'],
                            ] as [PointsMultiplier, string][]
                          ).map(([m, label]) => (
                            <button key={m} type="button" onClick={() => (patchQuestion(q.id, (x) => ({ ...x, pointsMultiplier: m })), setSelectedId(q.id), setMenuFor(null))}>
                              {mult === m ? '✓ ' : ''}
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="question-card-num">
                        Q{i + 1} · {questionTypeLabel(q)}
                        {mult === 2 ? ' · 2X' : mult === 0 ? ' · NO PTS' : ''}
                      </div>
                      <div className="question-card-preview">{(q.text || '').slice(0, 80) || 'Untitled question'}</div>
                    </div>
                  );
                })}
              </div>
              <button id="addQuestionBtn" className="btn primary" type="button" style={{ width: '100%', marginTop: 14 }} onClick={addQuestion}>
                <Icon name="add" />
                Add Question
              </button>
            </aside>

            <main className="content-wrap editor-question-panel">
              <div className="panel question-editor-card">
                <div className="question-editor-head">
                  <div className="editor-card-title">Quiz Editor</div>
                  <button id="deleteQuestionBtn" type="button" className="question-delete-icon" title="Delete question" aria-label="Delete question" onClick={deleteCurrent}>
                    <Icon name="delete" />
                  </button>
                </div>
                <div className="field">
                  <label htmlFor="questionText">Quiz Editor</label>
                  <textarea id="questionText" placeholder="Type your question…" value={current.text} onChange={(e) => patchQuestion(current.id, (q) => ({ ...q, text: e.target.value }))} />
                </div>
                <div className="field question-media-field">
                  <label>Question Media</label>
                  <div className="question-media-row">
                    <DropZone id="questionMediaDrop" className="media-drop question-media-drop-compact" hidden={!!current.media} accept="image/*,video/*" iconSize={28} label="Click or drag media here" onFile={async (f) => {
                      const media = await toMedia(f);
                      patchQuestion(current.id, (q) => ({ ...q, media }));
                    }} />
                    <div className="question-media-preview-box media-selected-shell">
                      <div id="questionMediaPreview" className="media-preview">
                        <MediaView media={current.media} controls />
                      </div>
                      <button id="clearQuestionMediaBtn" type="button" className={`media-remove-x ${current.media ? '' : 'hidden'}`} title="Remove media" aria-label="Remove media" onClick={() => patchQuestion(current.id, (q) => ({ ...q, media: null }))}>
                        ×
                      </button>
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Answers</label>
                  <div id="answersGrid" className="answers-grid">
                    <AnswersEditor q={current} onChange={(fn) => patchQuestion(current.id, fn)} />
                  </div>
                </div>
              </div>
            </main>

            <aside className="editor-right-settings">
              <div className="panel quiz-settings-card">
                <div className="editor-card-title">Quiz Settings</div>
                <div className="field">
                  <label htmlFor="quizTitle">Quiz Title</label>
                  <input id="quizTitle" type="text" placeholder="e.g., Fractions Fundamentals" value={quiz.title} onChange={(e) => patchQuiz({ title: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="quizFolderSelect">Quiz Folder</label>
                  <select id="quizFolderSelect" value={quiz.folderId || ''} onChange={(e) => patchQuiz({ folderId: e.target.value })}>
                    <option value="">Unsorted</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Quiz Cover</label>
                  <DropZone id="coverDrop" className="media-drop quiz-cover-drop" hidden={!!quiz.cover} accept="image/*" iconSize={26} label="Click or drag image here" onFile={async (f) => patchQuiz({ cover: await readDataUrl(f) })} />
                  <div className="media-selected-shell cover-selected-shell">
                    <div id="coverPreview" className="media-preview">
                      {quiz.cover && <img src={quiz.cover} alt="Quiz cover" />}
                    </div>
                    <button id="clearCoverBtn" type="button" className={`media-remove-x ${quiz.cover ? '' : 'hidden'}`} title="Remove cover" aria-label="Remove cover" onClick={() => patchQuiz({ cover: null })}>
                      ×
                    </button>
                  </div>
                </div>
                <label className="quiz-settings-check">
                  <input id="shuffleAnswersInput" type="checkbox" checked={!!quiz.shuffleAnswers} onChange={(e) => patchQuiz({ shuffleAnswers: e.target.checked })} />
                  <span>Shuffle answer order</span>
                </label>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </Screen>
  );
}

function DropZone({ id, className, hidden, accept, iconSize, label, onFile }: { id: string; className: string; hidden: boolean; accept: string; iconSize: number; label: string; onFile(f: File): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const stop = (e: DragEvent, over: boolean) => {
    e.preventDefault();
    setDrag(over);
  };
  return (
    <div
      id={id}
      className={`${className} ${hidden ? 'hidden' : ''} ${drag ? 'drag' : ''}`}
      onClick={() => input.current?.click()}
      onDragEnter={(e) => stop(e, true)}
      onDragOver={(e) => stop(e, true)}
      onDragLeave={(e) => stop(e, false)}
      onDrop={(e) => {
        stop(e, false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <Icon name={accept === 'image/*' ? 'image' : 'perm_media'} style={{ fontSize: iconSize, color: 'var(--sky-500)' }} />
      <div style={{ marginTop: 5 }}>{label}</div>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function AnswersEditor({ q, onChange }: { q: Question; onChange(fn: (q: Question) => Question): void }) {
  const fileInputs = useRef<(HTMLInputElement | null)[]>([]);
  if (q.type === 'type') {
    return (
      <div className="type-answer-editor">
        <div className="type-answer-label">Correct typed answer</div>
        <input id="typeAnswerInput" type="text" placeholder="Example: Washington" value={q.typeAnswer || ''} onChange={(e) => onChange((x) => ({ ...x, typeAnswer: e.target.value }))} />
        <div className="type-answer-help">Case insensitive. Use | for multiple accepted answers. Example: USA|United States</div>
      </div>
    );
  }
  const tf = q.type === 'truefalse';
  const setAnswer = (i: number, patch: Partial<Question['answers'][number]>) =>
    onChange((x) => ({ ...x, answers: x.answers.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  return (
    <>
      {(q.answers || []).map((ans, i) => (
        <div key={ans.id} className="answer-edit" data-color={i}>
          <div className="answer-letter">{answerShapes[i]}</div>
          <div className="top">
            <input type="radio" name="correctAnswer" value={i} checked={q.correctIndex === i} onChange={() => onChange((x) => ({ ...x, correctIndex: i }))} />
            <input type="text" data-answer-text={i} placeholder={`Answer ${i + 1}`} value={ans.text} readOnly={tf} onChange={(e) => setAnswer(i, { text: e.target.value })} />
          </div>
          <div className="answer-media-preview">
            <MediaView media={ans.media} controls />
          </div>
          {!tf && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn outline" style={{ padding: '6px 12px', fontSize: '.82rem' }} onClick={() => fileInputs.current[i]?.click()}>
                <Icon name="image" style={{ fontSize: 16 }} />
                Media
              </button>
              <button type="button" className={`btn ghost ${ans.media ? '' : 'hidden'}`} style={{ padding: '6px 12px', fontSize: '.82rem' }} onClick={() => setAnswer(i, { media: null })}>
                Remove
              </button>
              <input
                type="file"
                className="hidden"
                accept="image/*,video/*"
                ref={(el) => (fileInputs.current[i] = el)}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setAnswer(i, { media: await toMedia(f) });
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
