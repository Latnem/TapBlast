import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { LoginScreen } from './screens/LoginScreen';
import { StudentApp, hasStudentJoinRoute } from './screens/StudentApp';
import { TeacherApp } from './TeacherApp';
import './styles/app.css';

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const student = hasStudentJoinRoute();
  useEffect(() => (student ? undefined : onAuthStateChanged(auth, setUser)), [student]);

  if (student) return <StudentApp />;
  if (user === undefined) return null;
  if (!user) return <LoginScreen />;
  return <TeacherApp key={user.uid} user={user} />;
}

// Android "Desktop site" reports a wide viewport; use the desktop layout there too.
function applyDesktopRequestClass() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const desktopSiteLikely = /Android/i.test(navigator.userAgent) && width >= 900;
  document.body.classList.toggle('android-desktop-mode', desktopSiteLikely);
  document.body.classList.toggle('force-desktop-layout', desktopSiteLikely || width >= 980);
}
window.addEventListener('resize', applyDesktopRequestClass);
window.addEventListener('orientationchange', () => setTimeout(applyDesktopRequestClass, 250));
applyDesktopRequestClass();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
