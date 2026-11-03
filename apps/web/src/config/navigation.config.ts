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
  Mail,
  KeyRound,
  Trash2,
  DatabaseBackup,
  BookOpen,
  Shield,
} from 'lucide-react';

export type UserRole =
  | 'SUPER_ADMIN' | 'ADMIN' | 'SECURITY_ADMIN' | 'SECURITY_ANALYST' | 'COMPLIANCE_OFFICER' | 'MANAGER' | 'USER' | 'VIEWER';

// Who may use what. These mirror the rules enforced by the API, which stays the real gatekeeper.
export const LEADERSHIP_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'SECURITY_ADMIN', 'COMPLIANCE_OFFICER', 'MANAGER'];
export const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN'];
export const SUPER_ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN'];
export const COMPLIANCE_WRITE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE_OFFICER'];

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

// Offline mode: Mail Settings and Microsoft Sign-in are hidden. Flip to true later to show them.
const ENABLE_INTEGRATIONS = false;

export const navigationSections: NavSection[] = [
  {
    label: 'HOME',
    roles: LEADERSHIP_ROLES,
    items: [
      { name: 'Executive Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: LEADERSHIP_ROLES },
    ],
  },
  {
    label: 'WORKSPACE',
    items: [
      { name: 'My Assignments', href: '/assignments', icon: UserCheck },
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
      { name: 'Audit Logs', href: '/audit-logs', icon: FileSearch, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { name: 'Notifications', href: '/notifications', icon: Bell },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
  {
    label: 'ADMINISTRATION',
    roles: ADMIN_ROLES,
    items: [
      { name: 'Team & Users', href: '/users', icon: Users, roles: ADMIN_ROLES },
      { name: 'Admin Control Center', href: '/admin-control-center', icon: Shield, roles: ADMIN_ROLES },
      { name: 'Recycle Bin', href: '/recycle-bin', icon: Trash2, roles: SUPER_ADMIN_ROLES },
      { name: 'Backups', href: '/backups', icon: DatabaseBackup, roles: SUPER_ADMIN_ROLES },
      // Office 365 integrations: switch ENABLE_INTEGRATIONS on when mail / Microsoft sign-in are set up
      ...(ENABLE_INTEGRATIONS
        ? [
            { name: 'Mail Settings', href: '/mail-settings', icon: Mail, roles: SUPER_ADMIN_ROLES },
            { name: 'Microsoft Sign-in', href: '/sso-settings', icon: KeyRound, roles: SUPER_ADMIN_ROLES },
          ]
        : []),
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