import { useLayoutEffect, type ReactNode } from 'react';

/**
 * One full-page screen. Keeps the original `id` + `screen active` classes and
 * sets `body[data-screen]`, which the stylesheet relies on.
 */
export function Screen({ id, className = '', children }: { id: string; className?: string; children: ReactNode }) {
  useLayoutEffect(() => {
    document.body.setAttribute('data-screen', id);
    document.body.classList.remove('folders-open');
  }, [id]);
  return (
    <div id={id} className={`screen active ${className}`.trim()}>
      {children}
    </div>
  );
}

export function MediaView({ media, controls, autoPlay, muted }: { media: { type: string; dataUrl: string } | null | undefined; controls?: boolean; autoPlay?: boolean; muted?: boolean }) {
  if (!media) return null;
  if (media.type === 'video') return <video src={media.dataUrl} controls={controls} autoPlay={autoPlay} muted={muted} playsInline />;
  return <img src={media.dataUrl} alt="" />;
}

export function Brand({ className }: { className?: string }) {
  return (
    <div className={className ? `brand ${className}` : 'brand'}>
      Tap<em>Blast</em>
    </div>
  );
}
