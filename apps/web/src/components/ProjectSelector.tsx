import { useProjectContext } from '@/context/ProjectContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderKanban, ChevronDown } from 'lucide-react';

export function ProjectSelector() {
  const { currentProject, availableProjects, setCurrentProject, isLoading } = useProjectContext();

  if (isLoading || availableProjects.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="w-48 bg-dbi-elevated border-dbi-border">
          <SelectValue placeholder={isLoading ? 'Loading projects...' : 'No projects yet'} />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={currentProject?.id || '__all__'} onValueChange={(v) => setCurrentProject(v === '__all__' ? null : v)}>
      <SelectTrigger className="w-48 bg-dbi-elevated border-dbi-border flex items-center gap-2">
        <FolderKanban className="h-4 w-4 text-dbi-cyan" />
        <SelectValue placeholder="Select project" className="flex-1 truncate" />
        <ChevronDown className="h-4 w-4 text-dbi-textSecondary" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All Projects</SelectItem>
        {availableProjects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <div className="flex items-center gap-2 w-full">
              <span className="flex-1 truncate">{project.name}</span>
              <span className="text-xs text-dbi-textSecondary capitalize">{project.status.replace('_', ' ')}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}