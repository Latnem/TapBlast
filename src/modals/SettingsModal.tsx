import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Icon } from '../components/Icon';
import { ADMIN_EMAIL } from '../lib/firebase';
import * as api from '../lib/teacherApi';
import * as drive from '../lib/drive';
import { clampSeconds, questionTypeLabel } from '../game/rules';
import type { AppSettings, Folder, Quiz } from '../game/types';
import { downloadTextFile } from '../lib/util';

type Tab = 'defaults' | 'sharing' | 'backup' | 'admin';

export function SettingsModal({
  user,
  role,
  settings,
  quizzes,
  folders,
  onSettingsSaved,
  onSharedChanged,
  onClose,
}: {
  user: User;
  role: api.Role;
  settings: AppSettings;
  quizzes: Quiz[];
  folders: Folder[];
  onSettingsSaved(s: AppSettings): void;
  onSharedChanged(): void;
  onClose(): void;
}) {
  const [tab, setTab] = useState<Tab>('defaults');
  const [seconds, setSeconds] = useState(String(settings.defaultSeconds || 20));
  const [savedLine, setSavedLine] = useState('');
  const [inbox, setInbox] = useState<api.SharedItem[]>([]);
  const [preview, setPreview] = useState<api.SharedItem | null>(null);
  const [backupStatus, setBackupStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState<{ whitelist: api.WhitelistUser[]; requests: api.AccessRequest[] } | null>(null);
  const [adminError, setAdminError] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  const refreshInbox = () =>
    api
      .loadSharedInbox(user.email || '')
      .then(setInbox)
      .catch((err) => console.warn('Shared inbox unavailable:', err));
  const refreshAdmin = () =>
    api
      .loadAdminLists()
      .then((l) => (setAdmin(l), setAdminError(false)))
      .catch((err) => (console.error(err), setAdminError(true)));

  useEffect(() => {
    refreshInbox();
    if (role === 'admin') refreshAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveDefaults() {
    const next = { ...settings, defaultSeconds: clampSeconds(parseInt(seconds, 10)), defaultQuestionType: settings.defaultQuestionType || 'quiz' };
    try {
      await api.saveAppSettings(next);
      onSettingsSaved(next);
      setSavedLine('Saved.');
    } catch (err) {
      console.error(err);
      setSavedLine('Could not save settings.');
    }
    setTimeout(() => setSavedLine(''), 1600);
  }

  async function decide(item: api.SharedItem, accept: boolean) {
    if (accept) await api.acceptShared(user, item);
    else await api.declineShared(user, item);
    setPreview(null);
    await refreshInbox();
    onSharedChanged();
  }

  async function importList(list: unknown[], confirmText: string, doneText: string) {
    if (!list.length) {
      setBackupStatus('No quizzes found in this file.');
      return;
    }
    if (!confirm(confirmText)) {
      setBackupStatus('Canceled.');
      return;
    }
    await api.importQuizList(user.uid, list, settings);
    setBackupStatus(doneText);
  }

  const plural = (n: number) => `${n} quiz${n === 1 ? '' : 'zes'}`;

  async function importJson(file: File) {
    setBackupStatus('Importing…');
    try {
      const list = api.quizListFromBackup(JSON.parse(await file.text()));
      await importList(list, `Import ${plural(list.length)} into your library?`, `Imported ${plural(list.length)}.`);
    } catch (err) {
      console.error(err);
      setBackupStatus('Import failed. Make sure this is a TapBlast JSON export.');
    }
  }

  async function backupToDrive() {
    setBusy(true);
    try {
      setBackupStatus('Connecting to Google Drive…');
      const existing = await drive.findBackupFile();
      setBackupStatus(existing ? 'Replacing existing tapblast_backup.json…' : 'Creating tapblast_backup.json…');
      await drive.uploadBackup(existing?.id || null, JSON.stringify(api.makeExportPayload(user, quizzes, folders), null, 2));
      setBackupStatus('Backup saved to Google Drive: tapblast_backup.json');
    } catch (err) {
      console.error(err);
      setBackupStatus((err as Error)?.message || 'Google Drive backup failed.');
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromDrive() {
    setBusy(true);
    try {
      setBackupStatus('Finding tapblast_backup.json in Google Drive…');
      const file = await drive.findBackupFile();
      if (!file) {
        setBackupStatus('No tapblast_backup.json found in Google Drive.');
        return;
      }
      const list = api.quizListFromBackup(await drive.downloadBackup(file.id));
      await importList(list, 'Restore quizzes from tapblast_backup.json? This adds imported quizzes into your library.', `Restored ${plural(list.length)} from Google Drive.`);
    } catch (err) {
      console.error(err);
      setBackupStatus((err as Error)?.message || 'Google Drive restore failed.');
    } finally {
      setBusy(false);
    }
  }

  async function adminAction(fn: () => Promise<void>) {
    await fn();
    await refreshAdmin();
  }

  const pending = inbox.filter((x) => x.status === 'pending');
  const tabs: [Tab, string][] = [
    ['defaults', 'Defaults'],
    ['sharing', 'Sharing'],
    ['backup', 'Backup'],
    ...(role === 'admin' ? ([['admin', 'Admin Access']] as [Tab, string][]) : []),
  ];

  return (
    <>
      <div id="settingsModal" className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-card settings-card">
          <div className="settings-head">
            <div>
              <div className="modal-title">Settings</div>
              <div id="settingsAccountLine" className="settings-subline">
                {user.email || ''} · {role === 'admin' ? 'Admin' : 'Teacher'}
              </div>
            </div>
            <button id="settingsCloseBtn" type="button" className="btn icon ghost" title="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>

          <div className="settings-tabs">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" className={`settings-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'defaults' && (
            <section className="settings-section">
              <div className="field">
                <label htmlFor="defaultSecondsInput">Default time</label>
                <input id="defaultSecondsInput" type="number" min={5} max={120} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
              </div>
              <button id="saveDefaultsBtn" type="button" className="btn accent" onClick={saveDefaults}>
                Save Defaults
              </button>
              <div id="defaultsSavedLine" className="settings-note">
                {savedLine}
              </div>
            </section>
          )}

          {tab === 'sharing' && (
            <section className="settings-section">
              <div className="settings-panel-title">Shared with me</div>
              <div id="sharedInboxList" className="settings-list">
                {pending.length ? (
                  pending.map((item) => (
                    <div key={item.id} className="settings-item">
                      <div className="settings-item-main">
                        <div className="settings-item-title">{item.quiz?.title || 'Untitled Quiz'}</div>
                        <div className="settings-item-sub">
                          From {item.fromEmail || 'teacher'} · {(item.quiz?.questions || []).length} questions
                        </div>
                      </div>
                      <div className="settings-item-actions">
                        <button className="btn outline" type="button" onClick={() => setPreview(item)}>
                          Preview
                        </button>
                        <button className="btn accent" type="button" onClick={() => decide(item, true)}>
                          Accept
                        </button>
                        <button className="btn outline" type="button" onClick={() => decide(item, false)}>
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="settings-note">No shared quizzes waiting.</div>
                )}
              </div>
            </section>
          )}

          {tab === 'backup' && (
            <section className="settings-section">
              <div className="settings-panel-title">Google Drive Backup</div>
              <div className="settings-note">
                Save your quiz library to the signed-in Google account. Each backup replaces the same Drive file: <strong>tapblast_backup.json</strong>.
              </div>
              <div className="settings-actions-row backup-drive-actions">
                <button id="driveBackupBtn" type="button" className="btn accent" disabled={busy} onClick={backupToDrive}>
                  Backup to Google Drive
                </button>
                <button id="driveRestoreBtn" type="button" className="btn outline" disabled={busy} onClick={restoreFromDrive}>
                  Restore from Google Drive
                </button>
              </div>
              <div className="settings-panel-title backup-small-title">Local JSON</div>
              <div className="settings-note">Optional manual backup if you want a downloaded file.</div>
              <div className="settings-actions-row">
                <button
                  id="exportQuizzesBtn"
                  type="button"
                  className="btn outline"
                  onClick={() => {
                    downloadTextFile(`tapblast-quizzes-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(api.makeExportPayload(user, quizzes, folders), null, 2));
                    setBackupStatus(`Exported ${plural(quizzes.length)}.`);
                  }}
                >
                  <Icon name="download" />
                  Download JSON
                </button>
                <button id="importQuizzesBtn" type="button" className="btn outline" onClick={() => importInput.current?.click()}>
                  <Icon name="upload" />
                  Import JSON
                </button>
                <input
                  ref={importInput}
                  id="importQuizzesInput"
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importJson(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <div id="backupStatus" className="settings-note backup-status">
                {backupStatus}
              </div>
            </section>
          )}

          {tab === 'admin' && role === 'admin' && (
            <section className="settings-section">
              <div className="settings-admin-grid">
                <div>
                  <div className="settings-panel-title">Whitelist email</div>
                  <div className="settings-inline">
                    <input
                      id="whitelistEmailInput"
                      type="email"
                      placeholder="teacher@school.org"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addEmail()}
                    />
                    <button id="addWhitelistBtn" type="button" className="btn accent" onClick={addEmail}>
                      Add
                    </button>
                  </div>
                  <div id="whitelistList" className="settings-list">
                    {adminError ? (
                      <div className="settings-note">Could not load whitelist.</div>
                    ) : admin?.whitelist.length ? (
                      admin.whitelist.map((u) => (
                        <div key={u.email} className="settings-item">
                          <div className="settings-item-main">
                            <div className="settings-item-title">{u.email}</div>
                            <div className="settings-item-sub">
                              {u.role || 'teacher'} · {u.enabled === false ? 'disabled' : 'enabled'}
                            </div>
                          </div>
                          <div className="settings-item-actions">
                            {String(u.email).toLowerCase() !== ADMIN_EMAIL && (
                              <button className="btn outline" type="button" onClick={() => adminAction(() => api.toggleUserEnabled(u.email))}>
                                {u.enabled === false ? 'Enable' : 'Disable'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="settings-note">No whitelist users yet.</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="settings-panel-title">Pending requests</div>
                  <div id="accessRequestList" className="settings-list">
                    {adminError ? (
                      <div className="settings-note">Could not load requests.</div>
                    ) : admin?.requests.length ? (
                      admin.requests.map((r) => (
                        <div key={r.email} className="settings-item">
                          <div className="settings-item-main">
                            <div className="settings-item-title">{r.email}</div>
                            <div className="settings-item-sub">
                              {r.displayName ? r.displayName + ' · ' : ''}
                              {new Date(r.requestedAt || Date.now()).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="settings-item-actions">
                            <button className="btn accent" type="button" onClick={() => adminAction(() => api.approveUser(r.email))}>
                              Approve
                            </button>
                            <button className="btn outline" type="button" onClick={() => adminAction(() => api.denyUser(r.email))}>
                              Deny
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="settings-note">No pending requests.</div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {preview && <SharedPreviewModal item={preview} onClose={() => setPreview(null)} onDecide={(accept) => decide(preview, accept)} />}
    </>
  );

  function addEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!email.includes('@')) return;
    setNewEmail('');
    adminAction(() => api.addWhitelistEmail(email));
  }
}

function SharedPreviewModal({ item, onClose, onDecide }: { item: api.SharedItem; onClose(): void; onDecide(accept: boolean): void }) {
  const q = item.quiz || ({} as Quiz);
  return (
    <div id="sharedPreviewModal" className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card settings-card">
        <div className="settings-head">
          <div>
            <div id="sharedPreviewTitle" className="modal-title">
              {q.title || 'Untitled Quiz'}
            </div>
            <div id="sharedPreviewMeta" className="settings-subline">
              From {item.fromEmail || 'teacher'} · {(q.questions || []).length} questions
            </div>
          </div>
          <button id="sharedPreviewCloseBtn" type="button" className="btn icon ghost" title="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div id="sharedPreviewBody" className="shared-preview-body">
          {(q.questions || []).length ? (
            q.questions.map((qq, i) => (
              <div key={qq.id || i} className="shared-preview-question">
                <div className="shared-preview-question-title">
                  {i + 1}. {qq.text || 'Untitled question'} <span style={{ color: 'var(--ink-400)', fontSize: '.75rem' }}>({questionTypeLabel(qq)})</span>
                </div>
                {qq.type === 'type' ? (
                  <div className="shared-preview-answer">Typed answer: {qq.typeAnswer || ''}</div>
                ) : (
                  (qq.answers || []).map((a, idx) => (
                    <div key={idx} className="shared-preview-answer">
                      {idx + 1}. {a.text || ''}
                      {idx === qq.correctIndex ? ' ✓' : ''}
                    </div>
                  ))
                )}
              </div>
            ))
          ) : (
            <div className="settings-note">No questions.</div>
          )}
        </div>
        <div className="modal-actions">
          <button id="sharedPreviewDeclineBtn" type="button" className="btn outline" onClick={() => onDecide(false)}>
            Decline
          </button>
          <button id="sharedPreviewAcceptBtn" type="button" className="btn accent" onClick={() => onDecide(true)}>
            Accept Copy
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareQuizModal({ user, quiz, onClose }: { user: User; quiz: Quiz; onClose(): void }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  async function send() {
    const to = email.trim().toLowerCase();
    if (!to.includes('@')) {
      setStatus('Enter a valid email.');
      return;
    }
    try {
      await api.shareQuiz(user, to, quiz);
      setStatus('Shared.');
      setTimeout(onClose, 800);
    } catch (err) {
      console.error(err);
      setStatus('Could not share quiz.');
    }
  }
  return (
    <div id="shareQuizModal" className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-title">Share Quiz</div>
        <div className="field">
          <label htmlFor="shareQuizEmailInput">Send copy to email</label>
          <input id="shareQuizEmailInput" type="email" placeholder="teacher@school.org" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        </div>
        <div id="shareQuizStatus" className="settings-note">
          {status}
        </div>
        <div className="modal-actions">
          <button id="shareQuizCancelBtn" type="button" className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <button id="shareQuizSendBtn" type="button" className="btn accent" onClick={send}>
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
