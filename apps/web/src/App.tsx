import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PublicLayout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
const ExecutiveDashboard = lazy(() => import('@/pages/ExecutiveDashboard').then((m) => ({ default: m.ExecutiveDashboard })));
const Projects = lazy(() => import('@/pages/Projects').then((m) => ({ default: m.Projects })));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail })));
const ProjectCreate = lazy(() => import('@/pages/ProjectCreate').then((m) => ({ default: m.ProjectCreate })));
const ProjectEdit = lazy(() => import('@/pages/ProjectEdit').then((m) => ({ default: m.ProjectEdit })));
const KTReports = lazy(() => import('@/pages/KTReports').then((m) => ({ default: m.KTReports })));
const KTReportDetail = lazy(() => import('@/pages/KTReportDetail').then((m) => ({ default: m.KTReportDetail })));
const KTReportCreate = lazy(() => import('@/pages/KTReportCreate').then((m) => ({ default: m.KTReportCreate })));
const KTReportEdit = lazy(() => import('@/pages/KTReportEdit').then((m) => ({ default: m.KTReportEdit })));
const Documents = lazy(() => import('@/pages/Documents').then((m) => ({ default: m.Documents })));
const KnowledgeBooks = lazy(() => import('@/pages/KnowledgeBooks').then((m) => ({ default: m.KnowledgeBooks })));
const Compliance = lazy(() => import('@/pages/Compliance').then((m) => ({ default: m.Compliance })));
const ComplianceDetail = lazy(() => import('@/pages/ComplianceDetail').then((m) => ({ default: m.ComplianceDetail })));
const ComplianceCreate = lazy(() => import('@/pages/ComplianceCreate').then((m) => ({ default: m.ComplianceCreate })));
const ComplianceEdit = lazy(() => import('@/pages/ComplianceEdit').then((m) => ({ default: m.ComplianceEdit })));
const Users = lazy(() => import('@/pages/Users').then((m) => ({ default: m.Users })));
const Roles = lazy(() => import('@/pages/Roles').then((m) => ({ default: m.Roles })));
const Notifications = lazy(() => import('@/pages/Notifications').then((m) => ({ default: m.Notifications })));
const AuditLogs = lazy(() => import('@/pages/AuditLogs').then((m) => ({ default: m.AuditLogs })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })));
const Assignments = lazy(() => import('@/pages/Assignments').then((m) => ({ default: m.Assignments })));
const Activate = lazy(() => import('@/pages/Activate').then((m) => ({ default: m.Activate })));
const SsoSettings = lazy(() => import('@/pages/SsoSettings').then((m) => ({ default: m.SsoSettings })));
const MailSettings = lazy(() => import('@/pages/MailSettings').then((m) => ({ default: m.MailSettings })));
const Search = lazy(() => import('@/pages/Search').then((m) => ({ default: m.Search })));
const AdminControlCenter = lazy(() => import('@/pages/AdminControlCenter').then((m) => ({ default: m.AdminControlCenter })));
import { useAuth } from '@/context/AuthContext';
import { ProjectProvider } from '@/context/ProjectContext';

function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dbi-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dbi-cyan" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function PublicRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dbi-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-dbi-cyan" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-dbi-cyan" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<PublicRoute />}>
          <Route index element={<Login />} />
        </Route>
      </Route>

      {/* Public: link from the invitation email */}
      <Route element={<PublicLayout />}>
        <Route path="/activate/:token" element={<Activate />} />
      </Route>

      <Route element={<Layout />}>
        <Route element={<ProtectedRoute />}>
          {/* Redirect root to Executive Dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* HOME - Executive Dashboard for leadership */}
          <Route path="/dashboard" element={<ExecutiveDashboard />} />

          {/* WORKSPACE - My Assignments for individual contributors */}
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/new" element={<ProjectCreate />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/projects/:projectId/edit" element={<ProjectEdit />} />
          <Route path="/kt-reports" element={<KTReports />} />
          <Route path="/kt-reports/new" element={<KTReportCreate />} />
          <Route path="/kt-reports/:id" element={<KTReportDetail />} />
          <Route path="/kt-reports/:id/edit" element={<KTReportEdit />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/knowledge-books" element={<KnowledgeBooks />} />

          {/* GOVERNANCE */}
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/compliance/new" element={<ComplianceCreate />} />
          <Route path="/compliance/:id" element={<ComplianceDetail />} />
          <Route path="/compliance/:id/edit" element={<ComplianceEdit />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/audit-logs" element={<AuditLogs />} />

          {/* ADMINISTRATION */}
          <Route path="/users" element={<Users />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/admin-control-center" element={<AdminControlCenter />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/mail-settings" element={<MailSettings />} />
          <Route path="/sso-settings" element={<SsoSettings />} />
          <Route path="/roles" element={<Roles />} />

          {/* SEARCH */}
          <Route path="/search" element={<Search />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppRoutes />
    </ProjectProvider>
  );
}