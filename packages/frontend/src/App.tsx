import { Navigate, Route, Routes } from 'react-router-dom';
import { ProjectList } from './pages/ProjectList.js';
import { ProjectEditor } from './pages/ProjectEditor.js';
import { Dashboard } from './pages/Dashboard.js';
import { Profile } from './pages/Profile.js';
import { Help } from './pages/Help.js';
import { HelpVi } from './pages/HelpVi.js';
import { SingleTablePage } from './pages/SingleTablePage.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/help" element={<Help />} />
      <Route path="/help/vi" element={<HelpVi />} />
      <Route path="/single" element={<SingleTablePage />} />
      {/* Redirect bare project URL to the default tab */}
      <Route path="/projects/:projectId" element={<Navigate to="tables" replace />} />
      <Route path="/projects/:projectId/:tab" element={<ProjectEditor />} />
      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
