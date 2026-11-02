import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ProjectSelector } from '@/components/ProjectSelector';
import { NotificationBell } from '@/components/NotificationBell';
import { Search, Settings, LogOut, User, ChevronDown, Sun, Moon, Monitor } from 'lucide-react';

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const themeIcons = {
    dark: Moon,
    light: Sun,
    system: Monitor,
  };

  const CurrentIcon = themeIcons[theme];

  const handleThemeCycle = () => {
    const themes: ('dark' | 'light' | 'system')[] = ['dark', 'light', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-dbi-surface/80 backdrop-blur-sm">
      <div className="flex h-full items-center justify-between px-4 md:px-6 lg:ml-64">
        <div className="flex items-center gap-4">
          <form onSubmit={handleSearch} className="relative w-64 max-w-[300px] hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" aria-hidden="true" />
            <Input
              placeholder="Search projects, documents, reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 h-9 bg-dbi-elevated border-dbi-border"
            />
          </form>
          <div className="hidden md:block">
            <ProjectSelector />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <NotificationBell />
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Notifications
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-dbi-textSecondary hover:text-dbi-textPrimary hover:bg-dbi-elevated">
                <Settings className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Settings
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg text-dbi-textSecondary hover:text-dbi-textPrimary hover:bg-dbi-elevated"
                onClick={handleThemeCycle}
                aria-label={`Current theme: ${theme}. Click to cycle.`}
              >
                <CurrentIcon className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)} (click to cycle)
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-dbi-cyan/20 text-dbi-cyan text-sm font-medium">
                    {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-dbi-textSecondary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium text-dbi-textPrimary">{user?.fullName}</p>
                  <p className="text-xs text-dbi-textSecondary">{user?.email}</p>
                  <p className="text-xs text-dbi-textSecondary capitalize">{user?.role?.toLowerCase?.().replace('_', ' ')}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile" onClick={() => {}} className="flex w-full">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex w-full">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-dbi-critical focus:text-dbi-critical">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}