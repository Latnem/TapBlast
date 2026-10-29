import { useEffect, useMemo, useRef, useState } from 'react';
import { Brand, Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import type { Folder, Quiz } from '../game/types';
import { genId } from '../lib/util';

export interface LibraryActions {
  onCreate(): void;
  onEdit(quiz: Quiz): void;
  onHost(quiz: Quiz): void;
  onDuplicate(quiz: Quiz): void;
  onDelete(quiz: Quiz): void;
  onShare(quiz: Quiz): void;
  onMove(quizId: string, folderId: string): void;
  onSaveFolder(folder: Folder): void;
  onDeleteFolder(folder: Folder): void;
  onImportPdf(file: File): Promise<void>;
  onOpenSettings(): void;
  onLogout(): void;
}

const QuizPlaceholder = () => (
  <svg className="quiz-placeholder-svg" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="18" y="18" width="28" height="28" fill="none" stroke="#60A5FA" strokeWidth="4" />
    <rect x="26" y="26" width="12" height="12" fill="#60A5FA" />
  </svg>
);

const EditSvg = ({ className }: { className: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
    <path d="M14 7l3 3" />
  </svg>
);

export function LibraryScreen({
  teacherName,
  folders,
  quizzes,
  syncText,
  actions,
}: {
  teacherName: string;
  folders: Folder[];
  quizzes: Quiz[];
  syncText: string;
  actions: LibraryActions;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState('all');
  const [search, setSearch] = useState('');
  const [manage, setManage] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [folderModal, setFolderModal] = useState<{ mode: 'new' | 'rename'; folder?: Folder } | null>(null);
  const [moveQuizId, setMoveQuizId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.menu-wrap')) setOpenMenu(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') document.body.classList.remove('folders-open');
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const folderName = (id: string) => (!id ? 'Unsorted' : folders.find((f) => f.id === id)?.name || 'Unsorted');
  const countFor = (id: string) =>
    id === 'all' ? quizzes.length : id === 'unsorted' ? quizzes.filter((q) => !q.folderId).length : quizzes.filter((q) => q.folderId === id).length;

  const filtered = useMemo(() => {
    let arr = [...quizzes];
    if (selectedFolderId === 'unsorted') arr = arr.filter((q) => !q.folderId);
    else if (selectedFolderId !== 'all') arr = arr.filter((q) => q.folderId === selectedFolderId);
    const term = search.trim().toLowerCase();
    if (term) arr = arr.filter((q) => (q.title || '').toLowerCase().includes(term));
    return arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [quizzes, selectedFolderId, search]);

  const headerName = selectedFolderId === 'all' ? 'All Quizzes' : folderName(selectedFolderId === 'unsorted' ? '' : selectedFolderId);
  const countText = (filtered.length === 1 ? '1 quiz' : `${filtered.length} quizzes`) + (search.trim() ? ` matching "${search.trim()}"` : '');

  const folderItems = [
    { id: 'all', name: 'All Quizzes', icon: 'folder_open' },
    { id: 'unsorted', name: 'Unsorted', icon: 'folder_off' },
    ...folders.map((f) => ({ id: f.id, name: f.name, icon: 'folder' })),
  ];

  async function importPdf(file: File) {
    setImporting(true);
    try {
      await actions.onImportPdf(file);
    } finally {
      setImporting(false);
      if (pdfInput.current) pdfInput.current.value = '';
    }
  }

  return (
    <Screen id="library-screen">
      <div id="foldersBackdrop" className="folders-backdrop" onClick={() => document.body.classList.remove('folders-open')}></div>
      <div className="app-shell">
        <div className="app-container dashboard-v2-shell">
          <aside className="left-pane library-sidebar dashboard-sidebar">
            <div className="sidebar-brand-block">
              <Brand className="sidebar-brand" />
              <div className="subtle sidebar-subtle">Teacher Dashboard</div>
            </div>
            <button id="mobileFoldersCloseBtn" className="btn icon ghost mobile-only sidebar-close" type="button" title="Close folders" aria-label="Close folders" onClick={() => document.body.classList.remove('folders-open')}>
              <Icon name="close" />
            </button>
            <nav className="sidebar-nav" aria-label="Quiz folders">
              <div id="folderList" className="folder-list">
                {folderItems.map((item) => {
                  const folder = folders.find((f) => f.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className={`folder-item ${selectedFolderId === item.id ? 'active' : ''} ${dropTarget === item.id ? 'drop-target' : ''}`}
                      data-folder-id={item.id}
                      onClick={(e) => {
                        if ((e.target as Element).closest('.folder-inline-actions')) return;
                        setSelectedFolderId(item.id);
                        document.body.classList.remove('folders-open');
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropTarget(item.id);
                      }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropTarget(null);
                        const quizId = e.dataTransfer.getData('text/plain');
                        if (quizId && item.id !== 'all') actions.onMove(quizId, item.id === 'unsorted' ? '' : item.id);
                      }}
                    >
                      <Icon name={item.icon} />
                      <div className="folder-name">{item.name}</div>
                      <span className="folder-count">{countFor(item.id)}</span>
                      {folder && (
                        <div className={`folder-inline-actions ${manage ? 'show' : ''}`}>
                          <button className="folder-action-btn" type="button" title="Rename folder" aria-label="Rename folder" onClick={() => setFolderModal({ mode: 'rename', folder })}>
                            <EditSvg className="folder-action-svg" />
                          </button>
                          <button
                            className="folder-action-btn danger"
                            type="button"
                            title="Delete folder"
                            aria-label="Delete folder"
                            onClick={() => {
                              const count = countFor(folder.id);
                              const msg = count > 0 ? `Delete folder "${folder.name}"? ${count} quiz${count === 1 ? '' : 'zes'} will move to Unsorted.` : `Delete folder "${folder.name}"?`;
                              if (confirm(msg)) {
                                if (selectedFolderId === folder.id) setSelectedFolderId('all');
                                actions.onDeleteFolder(folder);
                              }
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="folder-action-svg">
                              <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </nav>
            <div className="sidebar-folder-tools">
              <button id="newFolderBtn" className="sidebar-tool-btn" type="button" title="New folder" onClick={() => setFolderModal({ mode: 'new' })}>
                <Icon name="create_new_folder" />
                <span>New Folder</span>
              </button>
              <button id="folderManageBtn" className={`sidebar-tool-btn ${manage ? 'active' : ''}`} type="button" title="Manage folders" aria-label="Manage folders" onClick={() => setManage(!manage)}>
                <EditSvg className="folder-manage-svg" />
                <span>Manage Folders</span>
              </button>
            </div>
            <div className="sidebar-bottom">
              <button id="settingsBtn" type="button" className="sidebar-settings-btn" title="Settings" aria-label="Settings" onClick={actions.onOpenSettings}>
                <span>Settings</span>
              </button>
            </div>
          </aside>

          <section className="main-pane dashboard-main">
            <div className="dashboard-topbar">
              <div className="dashboard-title-wrap">
                <button id="mobileFoldersBtn" className="mobile-menu-btn" type="button" aria-label="Open folders" onClick={() => document.body.classList.toggle('folders-open')}>
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
                <div>
                  <div id="libraryHeaderTitle" className="library-header-title">{headerName}</div>
                  <div id="librarySubtle" className="library-header-meta">{syncText ? `${countText} · ${syncText}` : countText}</div>
                </div>
              </div>
              <div className="dashboard-top-actions">
                <div id="teacherName" className="teacher-name">{teacherName}</div>
                <button id="logoutBtn" className="logout-icon-only" title="Sign Out" aria-label="Sign Out" onClick={actions.onLogout}>
                  <svg className="logout-svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path d="M10 4H4v16h6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13 12h8" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                    <path d="M17 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="content-wrap dashboard-content">
              <div className="option2-hero">
                <div className="option2-hero-head">
                  <div>
                    <h1>Choose a quiz</h1>
                    <p>Create a new quiz, or search your library.</p>
                  </div>
                  <button className="btn primary option2-import-btn" id="pdf-import-btn" type="button" disabled={importing} onClick={() => pdfInput.current?.click()}>
                    {importing ? 'Importing...' : 'Import PDF'}
                  </button>
                  <input
                    ref={pdfInput}
                    type="file"
                    id="pdf-upload-input"
                    accept="application/pdf,.pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importPdf(file);
                    }}
                  />
                </div>
                <div className="dashboard-utility-row option2-search-row">
                  <div className="search-wrap dashboard-search">
                    <Icon name="search" />
                    <input id="searchInput" type="text" placeholder="Search a quiz" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>

                <div id="quizGrid" className="quiz-grid dashboard-quiz-grid option2-grid">
                  <button id="newQuizTile" type="button" className="create-quiz-tile option2-create-card" onClick={actions.onCreate}>
                    <span className="option2-plus">＋</span>
                    <strong>Create Quiz</strong>
                  </button>
                  {filtered.length === 0 && <div className="empty-inline-message">No quizzes here yet</div>}
                  {filtered.map((q) => {
                    const qCount = (q.questions || []).length;
                    return (
                      <div
                        key={q.id}
                        className="quiz-card option2-quiz-card"
                        draggable
                        data-quiz-id={q.id}
                        onDragStart={(e) => {
                          e.currentTarget.classList.add('dragging');
                          e.dataTransfer.setData('text/plain', q.id);
                        }}
                        onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
                      >
                        <div className="quiz-cover option2-cover" title="Edit quiz" onClick={() => actions.onEdit(q)}>
                          {q.cover ? <img src={q.cover} alt="" /> : <QuizPlaceholder />}
                        </div>
                        <div className="quiz-body option2-card-body">
                          <h3 className="quiz-title option2-card-title">{q.title}</h3>
                          <div className="quiz-meta option2-meta">
                            <span>{folderName(q.folderId)}</span>
                            <span className="dot-sep"></span>
                            <span>
                              {qCount} question{qCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="quiz-actions option2-actions">
                            <button className="btn host-card-btn option2-host-btn" type="button" data-host={q.id} onClick={() => actions.onHost(q)}>
                              Host
                            </button>
                            <div className="menu-wrap option2-menu-wrap">
                              <button className="btn icon card-more-btn option2-more-btn" type="button" title="More options" aria-label="More options" onClick={() => setOpenMenu(openMenu === q.id ? null : q.id)}>
                                <Icon name="more_vert" />
                              </button>
                              <div className={`menu-pop option2-menu-pop ${openMenu === q.id ? '' : 'hidden'}`}>
                                <button type="button" onClick={() => actions.onEdit(q)}>
                                  <Icon name="edit" />
                                  Edit
                                </button>
                                <button type="button" onClick={() => (setOpenMenu(null), actions.onDuplicate(q))}>
                                  <Icon name="content_copy" />
                                  Duplicate
                                </button>
                                <button type="button" onClick={() => (setOpenMenu(null), setMoveQuizId(q.id))}>
                                  <Icon name="drive_file_move" />
                                  Move to folder
                                </button>
                                <button type="button" onClick={() => (setOpenMenu(null), actions.onShare(q))}>
                                  <Icon name="upload" />
                                  Share
                                </button>
                                <button type="button" onClick={() => (setOpenMenu(null), confirm('Delete this quiz?') && actions.onDelete(q))}>
                                  <Icon name="delete" />
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {folderModal && (
        <FolderModal
          mode={folderModal.mode}
          initialName={folderModal.folder?.name || ''}
          onCancel={() => setFolderModal(null)}
          onSave={(name) => {
            const base = folderModal.folder || { id: '', name: '', updatedAt: 0 };
            actions.onSaveFolder({ ...base, id: base.id || genId(), name, updatedAt: Date.now() });
            setFolderModal(null);
          }}
        />
      )}
      {moveQuizId && (
        <div id="moveQuizModal" className="modal-backdrop show">
          <div className="modal-card">
            <div className="modal-title">Move Quiz to Folder</div>
            <div id="moveQuizOptions" className="option-list">
              {[{ id: '', name: 'Unsorted' }, ...folders].map((opt) => (
                <div
                  key={opt.id || 'unsorted'}
                  className="option-item"
                  onClick={() => {
                    actions.onMove(moveQuizId, opt.id);
                    setMoveQuizId(null);
                  }}
                >
                  {opt.name}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button id="moveQuizCancel" type="button" className="btn outline" onClick={() => setMoveQuizId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}

function FolderModal({ mode, initialName, onCancel, onSave }: { mode: 'new' | 'rename'; initialName: string; onCancel(): void; onSave(name: string): void }) {
  const [name, setName] = useState(initialName);
  const commit = () => name.trim() && onSave(name.trim());
  return (
    <div id="folderModal" className="modal-backdrop show">
      <div className="modal-card">
        <div id="folderModalTitle" className="modal-title">
          {mode === 'new' ? 'New Folder' : 'Rename Folder'}
        </div>
        <div className="field">
          <label htmlFor="folderNameInput">Folder Name</label>
          <input id="folderNameInput" type="text" placeholder="e.g., Biology Unit 3" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} />
        </div>
        <div className="modal-actions">
          <button id="folderModalCancel" type="button" className="btn outline" onClick={onCancel}>
            Cancel
          </button>
          <button id="folderModalSave" type="button" className="btn primary" onClick={commit}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
