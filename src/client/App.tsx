import { Navigate, Route, Routes } from 'react-router';
import { HealthIndicator } from './components/HealthIndicator.tsx';
import { LibraryPage } from './pages/library/LibraryPage.tsx';
import { TrashPage } from './pages/library/TrashPage.tsx';
import { SettingsPage } from './pages/settings/SettingsPage.tsx';
import { WorkspacePage } from './pages/workspace/WorkspacePage.tsx';
import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.app}>
      <div className={styles.main}>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/book/:bookId/manuscript/:nodeId?" element={<WorkspacePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <footer className={styles.footer}>
        <HealthIndicator />
      </footer>
    </div>
  );
}
