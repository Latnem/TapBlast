import { useEffect, useState } from 'react';
import { sound } from '../lib/sound';

/** Speaker button that mutes/unmutes all game sounds (remembered on this device). */
export function SoundToggle({ className = '' }: { className?: string }) {
  const [muted, setMuted] = useState(sound.isMuted());
  useEffect(() => sound.subscribe(setMuted), []);
  return (
    <button
      type="button"
      className={`sound-toggle ${muted ? 'is-muted' : ''} ${className}`.trim()}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Sound off' : 'Sound on'}
      onClick={() => sound.setMuted(!muted)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
        {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
}
