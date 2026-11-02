import {
  LayoutDashboard,
  UserCheck,
  FolderKanban,
  ClipboardList,
  FolderOpen,
  ShieldCheck,
  BarChart,
  FileSearch,
  Users,
  Bell,
  Settings,
  BookOpen,
  Shield,
} from 'lucide-react';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'COMPLIANCE_OFFICER' | 'MANAGER' | 'USER';

export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[]; // If undefined, accessible to all authenticated users
}

export interface NavSection {
  label: string;
  items: NavItem[];
  roles?: UserRole[]; // If undefined, accessible to all authenticated users
}

export const navigationSections: NavSection[] = [
  {
    label: 'HOME',
    roles: ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'MANAGER'],
    items: [
      { name: 'Executive Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER', 'MANAGER'] },
    ],
  },
  {
    label: 'WORKSPACE',
    roles: ['USER', 'COMPLIANCE_OFFICER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'],
    items: [
      { name: 'My Assignments', href: '/assignments', icon: UserCheck, roles: ['USER', 'COMPLIANCE_OFFICER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      { name: 'Projects', href: '/projects', icon: FolderKanban },
      { name: 'KT Reports', href: '/kt-reports', icon: ClipboardList },
      { name: 'Document Vault', href: '/documents', icon: FolderOpen },
      { name: 'Knowledge Books', href: '/knowledge-books', icon: BookOpen },
    ],
  },
  {
    label: 'GOVERNANCE',
    items: [
      { name: 'Compliance Tracking', href: '/compliance', icon: ShieldCheck },
      { name: 'Reports & Analytics', href: '/reports', icon: BarChart },
      { name: 'Audit Logs', href: '/audit-logs', icon: FileSearch },
    ],
  },
  {
    label: 'ADMINISTRATION',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    items: [
      { name: 'Team & Users', href: '/users', icon: Users, roles: ['ADMIN', 'SUPER_ADMIN'] },
      { name: 'Notifications', href: '/notifications', icon: Bell, roles: ['ADMIN', 'SUPER_ADMIN'] },
      { name: 'Admin Control Center', href: '/admin-control-center', icon: Shield, roles: ['ADMIN', 'SUPER_ADMIN'] },
      { name: 'Settings', href: '/settings', icon: Settings, roles: ['ADMIN', 'SUPER_ADMIN'] },
    ],
  },
];

// Helper to check if user has access to a section/item
export function hasAccess(userRole: UserRole | undefined, requiredRoles?: UserRole[]): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
}

// Helper to get all visible sections for a user role
export function getVisibleSections(userRole: UserRole | undefined): NavSection[] {
  return navigationSections.filter(section => hasAccess(userRole, section.roles));
}

// Helper to get all visible items for a section for a user role
export function getVisibleItems(section: NavSection, userRole: UserRole | undefined): NavItem[] {
  return section.items.filter(item => hasAccess(userRole, item.roles));
}