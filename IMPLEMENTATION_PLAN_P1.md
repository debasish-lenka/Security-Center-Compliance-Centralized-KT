# Security Center — P1 Implementation Plan

**Source**: UX-REDESIGN-PROPOSAL.html  
**Scope**: P1 items only — Dashboard/Assignments split, Global Search page, Navigation restructure  
**Date**: 2026-10-31  
**Status**: Planning phase — not yet implemented

---

## Overview

| P1 Item | Sprint | Effort | Risk |
|---------|--------|--------|------|
| 1. Navigation Restructure + Header Search Wiring | 1 | S + XS | Low |
| 2. Dashboard/Assignments Content Split | 2 | M | Medium |
| 3. Global Search Results Page | 3 | M | Medium |

**Total estimated effort**: ~3 sprints (6-8 weeks with 2-week sprints)

---

## 1. Navigation Restructure + Header Search Wiring

### Design Reference
- Section 3: "Workspaces + Modules" hierarchy
- Workspaces: Dashboard, My Assignments
- Modules: Projects, Documents, KT Reports, Compliance, People
- Administration: collapsible, role-gated (Admin/Super Admin only)

### Components Affected

| Component | Path | Change Type |
|-----------|------|-------------|
| Sidebar/Navigation | `apps/web/src/components/layout/Sidebar.tsx` | **Rewrite** |
| Navigation config | `apps/web/src/config/navigation.ts` | **New file** |
| Header search handler | `apps/web/src/components/layout/Header.tsx` | **Modify** (already has `handleSearch`) |
| Layout wrapper | `apps/web/src/components/layout/Layout.tsx` | **Modify** (sidebar integration) |
| Role utilities | `apps/web/src/lib/auth-utils.ts` | **New/Modify** (role checks) |

### Routes Affected

| Old Route | New Route | Notes |
|-----------|-----------|-------|
| `/` | `/dashboard` | Redirect root to dashboard |
| `/dashboard` | `/dashboard` | Keep (explicit) |
| `/assignments` | `/assignments` | Keep (was pointing to Dashboard) |
| `/projects` | `/projects` | Unchanged |
| `/documents` | `/documents` | Unchanged |
| `/kt-reports` | `/kt-reports` | Unchanged |
| `/compliance` | `/compliance` | Unchanged |
| `/users` | `/people` | **Rename** |
| `/roles` | `/admin/roles` | **Move under Admin** |
| `/audit-logs` | `/admin/audit-logs` | **Move under Admin** |
| `/settings` | `/admin/settings` | **Move under Admin** |
| `/notifications` | — | Remove from nav (header bell) |
| `/reports` | — | Remove from nav (merge into Dashboard) |

### API Changes Required

| Endpoint | Change |
|----------|--------|
| None for navigation itself | Navigation is client-side config |
| `GET /v1/auth/me` | Ensure `role` field returned for role-gating |

### Database Impact
- **None** — Navigation is purely frontend configuration

### Estimated Effort
- **S (Small)**: 3-5 days
  - Navigation config design: 1 day
  - Sidebar component rewrite: 2 days
  - Role-gating logic: 1 day
  - Header search wiring: 0.5 day
  - Testing/QA: 0.5 day

### Migration Strategy

1. **Create `navigation.config.ts`** with role-aware section definitions
2. **Build new `Sidebar.tsx`** consuming config, supporting collapsible sections
3. **Update `Layout.tsx`** to use new sidebar
4. **Wire Header search** → navigate to `/search?q=` (search page built in Sprint 3)
5. **Add route redirects** in `App.tsx` for renamed/moved routes
6. **Feature flag `NEW_NAV`** for gradual rollout
7. **Deprecate old routes** after validation (keep 404 redirects)

---

## 2. Dashboard / Assignments Content Split

### Design Reference
- Section 1: "Strategy vs. Execution" principle
- **Dashboard** (Leadership): Portfolio Health Score, Risk Heatmap, Compliance Posture, Resource Allocation, Executive Alerts, Trend Sparklines
- **Assignments** (Operators): Task Board (Kanban), Due This Week, Blockers & Dependencies, KT Reports Due, Recent Activity (Mine), Quick Actions

### Components Affected

| Component | Path | Change Type |
|-----------|------|-------------|
| Dashboard (new) | `apps/web/src/pages/Dashboard.tsx` | **Rewrite** |
| Assignments (new) | `apps/web/src/pages/Assignments.tsx` | **New file** |
| Dashboard widgets | `apps/web/src/components/dashboard/*.tsx` | **New components** |
| Assignment widgets | `apps/web/src/components/assignments/*.tsx` | **New components** |
| Shared hooks | `apps/web/src/hooks/useDashboard.ts`, `useAssignments.ts` | **New files** |
| API client | `apps/web/src/lib/api.ts` | **Modify** (new endpoints) |

### Routes Affected

| Route | Component | Notes |
|-------|-----------|-------|
| `/dashboard` | `Dashboard` (new) | Leadership view |
| `/assignments` | `Assignments` (new) | Operator view |
| `/` | Redirect → `/dashboard` | Root alias |

### API Changes Required

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/dashboard/metrics` | GET | Aggregate portfolio health, risk distribution, compliance scores, resource allocation |
| `/v1/dashboard/alerts` | GET | Executive-level escalated items only |
| `/v1/dashboard/trends` | GET | 30/60/90-day sparkline data for KPIs |
| `/v1/assignments/tasks` | GET | User-scoped tasks with filters (status, project, due date) |
| `/v1/assignments/blockers` | GET | Tasks where user is blocker or waiting on others |
| `/v1/assignments/kt-reports` | GET | User's KT reports due/overdue |
| `/v1/assignments/activity` | GET | User's recent comments, approvals, uploads |

**Query parameters for assignments endpoints**:
- `assignee=me` (implicit from auth)
- `status[]`, `projectId`, `dueBefore`, `dueAfter`
- `page`, `limit`, `sort`

### Database Impact

| Table | Change | Reason |
|-------|--------|--------|
| `Task` | Add index on `assigneeId + status + dueDate` | Assignment queries |
| `Task` | Add `blockedBy` relation (self-referential) | Blocker tracking |
| `KTReport` | Add index on `projectId + assigneeId + dueDate` | KT reports due |
| `AuditLog` | Add index on `userId + createdAt` | User activity feed |
| *No new tables* | — | All data exists; only query optimization |

**Prisma migration**: Add composite indexes only (no schema changes)

```prisma
// Example migration
model Task {
  // ...existing fields
  @@index([assigneeId, status, dueDate])
  @@index([assigneeId, blockedById])
}

model KTReport {
  // ...existing fields
  @@index([projectId, assigneeId, dueDate])
}

model AuditLog {
  // ...existing fields
  @@index([userId, createdAt])
}
```

### Estimated Effort
- **M (Medium)**: 8-12 days
  - API endpoints (4 new): 3 days
  - Database indexes + migration: 1 day
  - Dashboard page + widgets: 3 days
  - Assignments page + widgets: 3 days
  - React Query hooks + caching: 1 day
  - Integration testing: 1 day

### Migration Strategy

1. **Sprint 2a**: Add API endpoints + DB indexes (backend)
2. **Sprint 2b**: Build new `Dashboard.tsx` with leadership widgets
3. **Sprint 2c**: Build new `Assignments.tsx` with operator widgets
4. **Switch routes** in `App.tsx`: `/dashboard` → new Dashboard, `/assignments` → new Assignments
5. **Keep old Dashboard** as `DashboardLegacy.tsx` behind feature flag for rollback
6. **Validate** with stakeholder group before deprecating legacy

---

## 3. Global Search Results Page

### Design Reference
- Section 2: "Unified Findability" — categorized results, faceted refinement
- Modules: Projects, Documents, KT Reports, Compliance, People, Audit Logs
- Facets: Module, Status, Date Range, Owner, Project

### Components Affected

| Component | Path | Change Type |
|-----------|------|-------------|
| Search page | `apps/web/src/pages/Search.tsx` | **New file** |
| Search results list | `apps/web/src/components/search/SearchResults.tsx` | **New file** |
| Search facet sidebar | `apps/web/src/components/search/SearchFacets.tsx` | **New file** |
| Search hook | `apps/web/src/hooks/useGlobalSearch.ts` | **New file** |
| Header search | `apps/web/src/components/layout/Header.tsx` | **Modify** (target `/search`) |
| API client | `apps/web/src/lib/api.ts` | **Modify** (search endpoint) |

### Routes Affected

| Route | Component | Notes |
|-------|-----------|-------|
| `/search` | `Search` (new) | Query param: `?q=<query>&module[]=projects&status[]=active` |
| `/documents?search=` | Keep working | Backward compat — redirect to `/search?q=` |

### API Changes Required

| Endpoint | Method | Spec |
|----------|--------|------|
| `/v1/search` | GET | Unified search across all modules |

**Request**:
```
GET /v1/search?q=security&module[]=projects&module[]=documents&status[]=active&dateFrom=2026-01-01&dateTo=2026-12-31&page=1&limit=10
```

**Response**:
```json
{
  "success": true,
  "data": {
    "query": "security",
    "total": 17,
    "facets": {
      "modules": { "projects": 3, "documents": 5, "ktReports": 2, "compliance": 1, "people": 2, "auditLogs": 4 },
      "statuses": { "active": 10, "completed": 7 },
      "projects": { "proj-1": 5, "proj-2": 3 }
    },
    "results": [
      { "type": "project", "id": "proj-1", "title": "Security Audit Q1", "subtitle": "Ongoing · 65% · John Doe", "url": "/projects/proj-1", "metadata": { "status": "ONGOING", "progress": 65 } },
      { "type": "document", "id": "doc-1", "title": "Security Policy v2.1", "subtitle": "PDF · 1.2 MB · Approved", "url": "/documents/doc-1", "metadata": { "type": "PDF", "size": 1200000, "status": "APPROVED" } },
      { "type": "ktReport", "id": "kt-1", "title": "Weekly Security KT - Jan 15", "subtitle": "Submitted · Sarah Johnson", "url": "/kt-reports/kt-1", "metadata": { "status": "SUBMITTED" } }
    ]
  }
}
```

### Database Impact

| Table | Change | Reason |
|-------|--------|--------|
| All searchable tables | Add full-text search indexes | PostgreSQL `tsvector` / GIN indexes |
| `Project` | `search_vector` column + GIN index | Project search |
| `Document` | `search_vector` column + GIN index | Document search |
| `KTReport` | `search_vector` column + GIN index | KT report search |
| `ComplianceItem` | `search_vector` column + GIN index | Compliance search |
| `User` | `search_vector` column + GIN index | People search |
| `AuditLog` | `search_vector` column + GIN index | Audit log search |

**Prisma migration**: Add `tsvector` columns + triggers + GIN indexes

```sql
-- Example for Project table
ALTER TABLE "Project" ADD COLUMN "search_vector" tsvector;
CREATE INDEX "Project_search_vector_idx" ON "Project" USING GIN ("search_vector");
CREATE TRIGGER "Project_search_vector_update"
BEFORE INSERT OR UPDATE ON "Project"
FOR EACH ROW EXECUTE FUNCTION tsvector_update_trigger("search_vector", "pg_catalog.english", "name", "description");
```

*Repeat for Document, KTReport, ComplianceItem, User, AuditLog*

### Estimated Effort
- **M (Medium)**: 8-10 days
  - Database full-text search setup: 2 days
  - Backend `/v1/search` endpoint: 3 days
  - Frontend Search page + components: 3 days
  - Faceted filtering UI: 1 day
  - Integration + performance testing: 1 day

### Migration Strategy

1. **Sprint 3a**: Add full-text search columns + triggers + GIN indexes (DB migration)
2. **Sprint 3b**: Implement `/v1/search` endpoint with faceted aggregation
3. **Sprint 3c**: Build `Search.tsx` page with results grid + facet sidebar
4. **Wire Header search** → `navigate(\`/search?q=\${encodeURIComponent(query)}\`)`
5. **Add redirect** from `/documents?search=` → `/search?q=` for backward compat
6. **Load test** with production-scale data before release

---

## Cross-Cutting Concerns

### Shared Infrastructure

| Area | Details |
|------|---------|
| **React Query Keys** | `['dashboard']`, `['assignments']`, `['assignments', 'tasks', filters]`, `['search', query, facets]` |
| **Feature Flags** | `NEW_NAV`, `NEW_DASHBOARD`, `NEW_ASSIGNMENTS`, `GLOBAL_SEARCH` |
| **Error Boundaries** | Wrap each new page in error boundary with fallback to legacy |
| **Analytics** | Add page view events for new routes (`dashboard_view`, `assignments_view`, `search_view`) |
| **Permissions** | All new endpoints require authenticated user; Admin endpoints check `role === 'ADMIN' || role === 'SUPER_ADMIN'` |

### Testing Checklist

- [ ] Navigation renders correctly for each role (User, Manager, Admin, Super Admin)
- [ ] Dashboard shows only leadership metrics (no task lists)
- [ ] Assignments shows only user-scoped data (no portfolio metrics)
- [ ] Search returns results from all 6 modules with correct facets
- [ ] Facet filters refine results correctly (AND logic across facets, OR within facet)
- [ ] Keyboard navigation works in Search modal and Sidebar
- [ ] Mobile responsive: bottom nav on ≤640px, sidebar collapse on ≥1024px
- [ ] Legacy routes redirect correctly (`/users` → `/people`, `/roles` → `/admin/roles`)
- [ ] Feature flags allow instant rollback

---

## Dependencies Between P1 Items

```
Sprint 1: Navigation + Header Search
    │
    ├─► Enables discoverability of new Dashboard/Assignments routes
    │
    ▼
Sprint 2: Dashboard/Assignments Split
    │
    ├─► Requires Navigation to expose new routes
    │
    ▼
Sprint 3: Global Search Page
    │
    ├─► Requires Header search wiring (from Sprint 1)
    │
    ▼
All P1 Complete → Ready for P2 (Kanban, Facets, Mobile Nav)
```

---

## Rollback Plan

| Feature | Rollback Mechanism |
|---------|-------------------|
| Navigation | Feature flag `NEW_NAV=false` → restores old Sidebar |
| Dashboard | Feature flag `NEW_DASHBOARD=false` → routes to `DashboardLegacy` |
| Assignments | Feature flag `NEW_ASSIGNMENTS=false` → routes to `Dashboard` (old behavior) |
| Global Search | Feature flag `GLOBAL_SEARCH=false` → Header search falls back to `/documents?search=` |

All flags controlled via `apps/web/src/config/features.ts` with environment variable overrides.

---

## Next Steps

1. **Stakeholder review** of this plan (Week 1)
2. **Technical spike** on full-text search performance (Week 1-2)
3. **Sprint planning** with engineering team (Week 2)
4. **Begin Sprint 1** — Navigation restructure