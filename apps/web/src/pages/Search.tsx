import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search as SearchIcon,
  X,
  Filter,
  FolderKanban,
  FileText,
  ClipboardList,
  ShieldCheck,
  Users,
  FileSearch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchApi } from '@/lib/api';

const moduleOptions = [
  { key: 'projects', label: 'Projects', icon: FolderKanban, color: 'bg-blue-500/20 text-blue-400' },
  { key: 'documents', label: 'Documents', icon: FileText, color: 'bg-indigo-500/20 text-indigo-400' },
  { key: 'ktReports', label: 'KT Reports', icon: ClipboardList, color: 'bg-amber-500/20 text-amber-400' },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck, color: 'bg-emerald-500/20 text-emerald-400' },
  { key: 'people', label: 'People', icon: Users, color: 'bg-violet-500/20 text-violet-400' },
  { key: 'auditLogs', label: 'Audit Logs', icon: FileSearch, color: 'bg-rose-500/20 text-rose-400' },
];

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  url: string;
  metadata: Record<string, unknown>;
}

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(query);
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);

  // Initialize active modules from URL params
  useEffect(() => {
    const modules = searchParams.getAll('module');
    if (modules.length > 0) {
      setActiveModules(modules);
    } else {
      // Default to all modules
      setActiveModules(moduleOptions.map(m => m.key));
    }
  }, [searchParams]);

  // Perform search when query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotalResults(0);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await searchApi.search({
          q: searchQuery,
          modules: activeModules,
          limit: 20,
          offset: 0,
        });
        setResults(response.data.results);
        setTotalResults(response.data.total);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
        setTotalResults(0);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, activeModules]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const params = new URLSearchParams();
      params.set('q', searchQuery.trim());
      activeModules.forEach(m => params.append('module', m));
      setSearchParams(params, { replace: true });
    }
  };

  const handleModuleToggle = (moduleKey: string) => {
    setActiveModules(prev =>
      prev.includes(moduleKey)
        ? prev.filter(m => m !== moduleKey)
        : [...prev, moduleKey]
    );
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setResults([]);
    const params = new URLSearchParams();
    activeModules.forEach(m => params.append('module', m));
    setSearchParams(params, { replace: true });
  };

  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    results.forEach(r => {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    });
    return groups;
  }, [results]);

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div>
        <h1 className="text-3xl font-bold text-dbi-textPrimary">Search Results</h1>
        <p className="text-dbi-textSecondary mt-1">
          {query ? `Showing ${totalResults} result${totalResults !== 1 ? 's' : ''} for "${query}"` : 'Enter a search query to find content across all modules'}
        </p>
      </div>

      {/* Search Input Card */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="relative">
            <div className="flex items-center gap-3">
              <SearchIcon className="h-5 w-5 text-dbi-textMuted" aria-hidden="true" />
              <Input
                placeholder="Search projects, documents, reports, people, compliance..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-dbi-elevated border-dbi-border text-lg"
                autoFocus
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClearSearch}
                  className="text-dbi-textMuted hover:text-dbi-textPrimary"
                  aria-label="Clear search"
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
              <Button type="submit" className="bg-dbi-cyan text-background hover:bg-dbi-cyan/90">
                <SearchIcon className="h-5 w-5 mr-2" />
                Search
              </Button>
            </div>
          </form>

          {/* Active Modules Filter Chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-dbi-textMuted" aria-hidden="true" />
            <span className="text-sm text-dbi-textSecondary">Modules:</span>
            {moduleOptions.map((mod) => (
              <Button
                key={mod.key}
                type="button"
                variant={activeModules.includes(mod.key) ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleModuleToggle(mod.key)}
                className={cn(
                  'gap-1.5',
                  activeModules.includes(mod.key) && 'bg-dbi-cyan text-background border-dbi-cyan'
                )}
              >
                <mod.icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{mod.label}</span>
              </Button>
            ))}
            {activeModules.length !== moduleOptions.length && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setActiveModules(moduleOptions.map(m => m.key))}
                className="text-dbi-textSecondary hover:text-dbi-textPrimary"
              >
                All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-dbi-elevated rounded w-1/4 mb-3" />
                <div className="h-4 bg-dbi-elevated rounded w-1/2" />
                <div className="h-4 bg-dbi-elevated rounded w-3/4 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : searchQuery && results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <SearchIcon className="mx-auto h-16 w-16 text-dbi-textMuted mb-4" />
            <h3 className="text-lg font-medium text-dbi-textPrimary">No results found</h3>
            <p className="text-dbi-textSecondary mt-1">Try adjusting your search terms or filters</p>
          </CardContent>
        </Card>
      ) : searchQuery && results.length > 0 ? (
        <div className="space-y-6">
          {moduleOptions.map((mod) => {
            const moduleResults = groupedResults[mod.key];
            if (!moduleResults || moduleResults.length === 0) return null;

            return (
              <Card key={mod.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', mod.color)}>
                        <mod.icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{mod.label}</CardTitle>
                        <p className="text-xs text-dbi-textSecondary">{moduleResults.length} result{moduleResults.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {moduleResults.slice(0, 5).map((result) => (
                      <Link
                        key={result.id}
                        to={result.url}
                        className="block p-3 rounded-lg border border-dbi-border hover:bg-dbi-elevated/50 hover:border-dbi-cyan/30 transition-colors"
                      >
                        <p className="font-medium text-dbi-textPrimary">{result.title}</p>
                        <p className="text-sm text-dbi-textSecondary mt-1">{result.subtitle}</p>
                      </Link>
                    ))}
                    {moduleResults.length > 5 && (
                      <Link
                        to={`${mod.key}?search=${encodeURIComponent(query)}`}
                        className="block text-center py-3 text-sm text-dbi-cyan hover:text-dbi-cyan/80 font-medium"
                      >
                        View all {moduleResults.length} {mod.label.toLowerCase()} &rarr;
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Empty state - no query entered */
        <Card>
          <CardContent className="py-12">
            <div className="max-w-2xl mx-auto text-center space-y-6">
              <SearchIcon className="mx-auto h-16 w-16 text-dbi-textMuted" />
              <div>
                <h3 className="text-xl font-medium text-dbi-textPrimary">Search across Security Center</h3>
                <p className="text-dbi-textSecondary mt-2">
                  Find projects, documents, KT reports, compliance items, team members, and audit logs from one place.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
                {moduleOptions.map((mod) => (
                  <div key={mod.key} className="p-4 rounded-lg bg-dbi-elevated/50 border border-dbi-border">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', mod.color)}>
                        <mod.icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <span className="font-medium text-dbi-textPrimary">{mod.label}</span>
                    </div>
                    <p className="text-sm text-dbi-textSecondary">
                      Search {mod.label.toLowerCase()} by name, description, status, and more.
                    </p>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-dbi-border">
                <p className="text-sm text-dbi-textMuted">
                  Tip: Press <kbd className="px-2 py-0.5 bg-dbi-elevated rounded text-dbi-textPrimary font-mono">⌘K</kbd> to focus search from anywhere
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}