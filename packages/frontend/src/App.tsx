import { useState } from 'react';
import type { Project } from './types/index.js';
import { ProjectList } from './pages/ProjectList.js';
import { ProjectEditor } from './pages/ProjectEditor.js';

type View = 'list' | 'project';

export default function App() {
  const [view, setView] = useState<View>('list');
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  function handleOpen(projectId: string) {
    setOpenProjectId(projectId);
    setView('project');
  }

  function handleCreate(project: Project) {
    setOpenProjectId(project.id);
    setView('project');
  }

  function handleBack() {
    setView('list');
    setOpenProjectId(null);
  }

  if (view === 'project' && openProjectId) {
    return <ProjectEditor projectId={openProjectId} onBack={handleBack} />;
  }

  return <ProjectList onCreate={handleCreate} onOpen={handleOpen} />;
}
