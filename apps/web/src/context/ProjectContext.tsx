import { createContext, useContext, useState, ReactNode } from 'react';
import { projectsApi } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Project {
  id: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
}

interface ProjectContextType {
  currentProjectId: string | null;
  currentProject: Project | null;
  setCurrentProject: (projectId: string | null) => void;
  availableProjects: Project[];
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    const stored = localStorage.getItem('dbi-current-project');
    return stored ? stored : null;
  });

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects-for-selector'],
    queryFn: () => projectsApi.list({ limit: '100' }),
  });

  const availableProjects = projectsData?.data?.items?.map((p: { id: string; name: string; status: string; priority: string; progress: number }) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    priority: p.priority,
    progress: p.progress,
  })) || [];

  const currentProject = availableProjects.find((p: Project) => p.id === currentProjectId) || null;

  const setCurrentProject = (projectId: string | null) => {
    setCurrentProjectId(projectId);
    if (projectId) {
      localStorage.setItem('dbi-current-project', projectId);
    } else {
      localStorage.removeItem('dbi-current-project');
    }
    // Invalidate queries that depend on project context
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['kt-reports'] });
    queryClient.invalidateQueries({ queryKey: ['compliance'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  return (
    <ProjectContext.Provider value={{
      currentProjectId,
      currentProject,
      setCurrentProject,
      availableProjects,
      isLoading,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
}