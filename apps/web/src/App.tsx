import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { PublicLayout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { ExecutiveDashboard } from '@/pages/ExecutiveDashboard';
import { Projects } from '@/pages/Projects';
import { ProjectDetail } from '@/pages/ProjectDetail';
import { ProjectCreate } from '@/pages/ProjectCreate';
import { ProjectEdit } from '@/pages/ProjectEdit';
import { KTReports } from '@/pages/KTReports';
import { KTReportDetail } from '@/pages/KTReportDetail';
import { KTReportCreate } from '@/pages/KTReportCreate';
import { KTReportEdit } from '@/pages/KTReportEdit';
import { Documents } from '@/pages/Documents';
import { KnowledgeBooks } from '@/pages/KnowledgeBooks';
import { Compliance } from '@/pages/Compliance';
import { ComplianceDetail } from '@/pages/ComplianceDetail';
import { ComplianceCreate } from '@/pages/ComplianceCreate';
import { ComplianceEdit } from '@/pages/ComplianceEdit';
import { Users } from '@/pages/Users';
import { Roles } from '@/pages/Roles';
import { Notifications } from '@/pages/Notifications';
import { AuditLogs } from '@/pages/AuditLogs';
import { Settings } from '@/pages/Settings';
import { Reports } from '@/pages/Reports';
import { Assignments } from '@/pages/Assignments';
import { Search } from '@/pages/Search';
import { AdminControlCenter } from '@/pages/AdminControlCenter';
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

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<PublicRoute />}>
          <Route index element={<Login />} />
        </Route>
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
          <Route path="/roles" element={<Roles />} />

          {/* SEARCH */}
          <Route path="/search" element={<Search />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <AppRoutes />
    </ProjectProvider>
  );
}