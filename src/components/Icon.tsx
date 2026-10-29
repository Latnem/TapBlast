import type { CSSProperties } from 'react';

// Inline SVG icons (same set as the original app), so the UI works without icon fonts.
const ICONS: Record<string, string> = {
  add: '<path d="M12 5v14M5 12h14"/>',
  arrow_back: '<path d="M15 18l-6-6 6-6"/>',
  arrow_forward: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  content_copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  create_new_folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v6M9 14h6"/>',
  delete: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M5 3h14"/>',
  drive_file_move: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 14h6M13 11l3 3-3 3"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folder_open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"/><path d="M3 9h18l-2 9a2 2 0 0 1-2 1.6H6a2 2 0 0 1-2-1.6z"/>',
  folder_off: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M4 4l16 16" stroke-width="2.4"/>',
  home: '<path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-3v-6h-8v6H5a2 2 0 0 1-2-2z"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 17l-5-6-6 8"/>',
  login: '<path d="M10 17l5-5-5-5M15 12H3M3 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3" transform="translate(6 0)"/>',
  more_vert: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  perm_media: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 17l6-6 5 5 3-3 4 4"/>',
  play_arrow: '<path d="M8 5v14l11-7z"/>',
  play_circle: '<circle cx="12" cy="12" r="9"/><path d="M10 8v8l6-4z"/>',
  quiz: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 10a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17.5v.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
};

/** Icons without an SVG render nothing, matching the original app. */
export function Icon({ name, style }: { name: string; style?: CSSProperties }) {
  const body = ICONS[name];
  if (!body) return null;
  return (
    <span className="icon" data-iconified="1" style={style}>
      <svg
        className="icon-svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </span>
  );
}
