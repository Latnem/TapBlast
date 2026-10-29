import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { DRIVE_SCOPE, rememberDriveToken } from '../lib/drive';
import { Brand, Screen } from '../components/Screen';

export function LoginScreen({ message }: { message?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    setError('');
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(DRIVE_SCOPE);
      provider.setCustomParameters({ prompt: 'select_account' });
      // Popup only: redirect can fail when browser storage is partitioned.
      const result = await signInWithPopup(auth, provider);
      rememberDriveToken(GoogleAuthProvider.credentialFromResult(result)?.accessToken);
    } catch (err) {
      console.error(err);
      const code = String((err as { code?: string })?.code || '');
      if (code.includes('popup-blocked')) setError('Popup was blocked. Allow popups for this site and try again.');
      else if (code.includes('popup-closed')) setError('Google sign-in was closed before finishing.');
      else setError((err as Error)?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen id="login-screen">
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-badge">
            <span className="dot"></span>Teacher Portal
          </div>
          <Brand />
          <div className="login-tagline">
            Build engaging quizzes. Host live games.
            <br />
            Watch your classroom light up.
          </div>
          <button id="googleLoginBtn" type="button" className="google-btn" aria-label="Continue with Google" disabled={busy} style={busy ? { opacity: 0.7 } : undefined} onClick={signIn}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09 0-.73.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Continue with Google</span>
          </button>
          <div id="loginError" className="error-line">
            {error || message || ''}
          </div>
        </div>
      </div>
    </Screen>
  );
}
