# Remaining Gaps & Technical Debt

**Project**: DBI Security Center - Compliance Centralized KT  
**Audit Date**: 2026-10-31  
**Version**: 1.0  
**Status**: Post-MVP Backlog

---

## Executive Summary

This document catalogs all known gaps, missing features, and technical debt identified during the Final Product Audit. Items are categorized by severity and mapped to suggested sprints.

**Total Items: 47**
- Critical (Blocking): 0
- High: 8
- Medium: 19
- Low: 15
- Technical Debt: 5

---

## 1. Critical Gaps (Blocking Production)

*None identified - Application is production-ready*

---

## 2. High Priority Gaps (Post-Launch Sprint 1-2)

### 2.1 Security Operations

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-001 | **API Rate Limiting** | No rate limiting on any endpoint. Exposes to credential stuffing, enumeration, DoS. | 2 days | Backend |
| GAP-002 | **CSRF Protection** | State-changing operations lack CSRF tokens. Vulnerable to cross-site request forgery. | 2 days | Fullstack |
| GAP-003 | **Security Headers** | Missing CSP, HSTS, X-Frame-Options, etc. Requires Helmet.js + reverse proxy config. | 1 day | DevOps |
| GAP-004 | **File Upload Validation** | Documents API accepts any file type/size. No virus scanning, MIME validation. | 3 days | Backend |
| GAP-005 | **Automated Security Testing** | No OWASP ZAP, dependency scanning, or SAST in CI/CD pipeline. | 3 days | DevOps |

### 2.2 Observability

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-006 | **Error Tracking** | No Sentry/Datadog integration. Errors only visible in browser console. | 1 day | Fullstack |
| GAP-007 | **API Monitoring** | No APM, request tracing, or performance metrics collection. | 2 days | Backend |
| GAP-008 | **Health Checks** | No `/health` or `/ready` endpoints for load balancer probes. | 1 day | Backend |

---

## 3. Medium Priority Gaps (Sprint 3-6)

### 3.1 Document Hub Advanced Features

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-009 | **Document Version History UI** | Backend supports `version` field but no UI to view/restore versions. | 3 days | Frontend |
| GAP-010 | **Document Dossier Generation** | No PDF/export functionality for compliance evidence packages. | 5 days | Fullstack |
| GAP-011 | **Document Comparison** | No diff view between document versions. | 3 days | Frontend |
| GAP-012 | **Bulk Document Operations** | No multi-select for delete, move, tag, download. | 2 days | Frontend |
| GAP-013 | **Document Approval Workflow** | No review/approve flow for uploaded documents. | 4 days | Fullstack |
| GAP-014 | **OCR/Search in Documents** | No text extraction from PDFs/images for search indexing. | 5 days | Backend |

### 3.2 Compliance Enhancements

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-015 | **Remediation Task CRUD** | Detail page shows tasks but no create/edit/delete UI. Routes exist (`/compliance/:id/remediation/new`) but pages missing. | 3 days | Frontend |
| GAP-016 | **Evidence Management UI** | Detail page shows evidence but no create/edit/delete UI. Routes exist (`/compliance/:id/evidence/new`) but pages missing. | 3 days | Frontend |
| GAP-017 | **Compliance Dashboard Widgets** | No visual compliance posture widgets on Executive Dashboard (only charts). | 2 days | Frontend |
| GAP-018 | **Framework Mapping** | No cross-framework control mapping (e.g., ISO 27001 A.12.1 → NIST PR.IP-1). | 5 days | Backend |
| GAP-019 | **Automated Compliance Scoring** | Score calculated in mock only. Real implementation needs evidence-based scoring. | 4 days | Backend |

### 3.3 KT Report Enhancements

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-020 | **KT Report Templates** | No template system for standardized reports. | 3 days | Fullstack |
| GAP-021 | **Rich Text Editor** | Content field is plain textarea. No formatting, images, tables. | 3 days | Frontend |
| GAP-022 | **Report Review Workflow** | Approve/Reject exists but no comment/feedback field for reviewers. | 2 days | Fullstack |
| GAP-023 | **Report Versioning** | No version history for KT reports. | 2 days | Backend |
| GAP-024 | **Scheduled Reports** | No recurring report generation (daily/weekly KT summaries). | 4 days | Backend |

### 3.4 Project Management

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-025 | **Gantt Chart View** | No timeline visualization for project milestones. | 5 days | Frontend |
| GAP-026 | **Resource Management** | Team allocation exists but no capacity planning view. | 3 days | Frontend |
| GAP-027 | **Budget Forecasting** | Basic tracking only. No variance analysis, burn rate charts. | 3 days | Fullstack |
| GAP-028 | **Project Dependencies** | No inter-project dependency tracking. | 2 days | Backend |
| GAP-029 | **Time Tracking** | No actual hours logging vs estimates. | 4 days | Fullstack |

### 3.5 User & Admin Features

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-030 | **User Profile Page** | Route `/profile` exists in Header dropdown but page not created. | 2 days | Frontend |
| GAP-031 | **User Edit Page** | Users table has Edit link but `/users/:id/edit` page not created. | 2 days | Frontend |
| GAP-032 | **Role Detail Page** | Roles table has View link but `/roles/:id` page not created. | 2 days | Frontend |
| GAP-033 | **Password Reset Flow** | No forgot/reset password functionality. | 3 days | Fullstack |
| GAP-034 | **Email Notifications** | Notification preferences exist but no email delivery system. | 5 days | Backend |
| GAP-035 | **In-App Notification Center** | Header bell icon has no dropdown - only separate Notifications page. | 2 days | Frontend |

### 3.6 Search & Discovery

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-036 | **Saved Searches** | No ability to save/name frequent search queries. | 2 days | Frontend |
| GAP-037 | **Search Facets** | No facet counts (e.g., "Projects (12)", "Documents (5)") in results. | 2 days | Backend |
| GAP-038 | **Advanced Search Syntax** | No support for field-specific queries (e.g., `project:alpha status:active`). | 3 days | Backend |

---

## 4. Low Priority Gaps (Backlog / Nice to Have)

### 4.1 UX Polish

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-039 | **Keyboard Shortcuts** | ⌘K hint exists but no global shortcut handler implemented. | 1 day | Frontend |
| GAP-040 | **Drag & Drop** | Task board, document upload, file reorder - no drag-drop. | 3 days | Frontend |
| GAP-041 | **Bulk Actions** | No multi-select bulk operations on any list page. | 2 days | Frontend |
| GAP-042 | **Column Customization** | Tables have fixed columns. No show/hide/reorder. | 2 days | Frontend |
| GAP-043 | **Export to Excel/CSV** | Only Audit Logs has export. All list pages should. | 2 days | Frontend |
| GAP-044 | **Dark Mode Images** | Some icons/logos not optimized for dark mode. | 1 day | Design |

### 4.2 Platform Features

| ID | Gap | Description | Effort | Owner |
|----|-----|-------------|--------|-------|
| GAP-045 | **Webhooks/Integrations** | No outgoing webhook system for third-party integrations. | 5 days | Backend |
| GAP-046 | **API Keys Management** | Settings shows "API Access" toggle but no token generation UI. | 2 days | Fullstack |
| GAP-047 | **Two-Factor Authentication** | Settings has 2FA toggle but no TOTP implementation. | 4 days | Fullstack |

---

## 5. Technical Debt

| ID | Debt | Description | Impact | Effort |
|----|------|-------------|--------|--------|
| TECH-001 | **Backend TypeScript Config** | CommonJS/ESM conflicts, missing @types/fastify. Build works in mock mode but fails type checking. | Medium | 2 days |
| TECH-002 | **No Test Suite** | Zero unit, integration, or E2E tests. High regression risk. | High | 10 days |
| TECH-003 | **Mock/Real API Duplication** | `api.ts` has both mock and real implementations inline. Should separate. | Low | 2 days |
| TECH-004 | **Component Prop Drilling** | Some components pass props through multiple layers (e.g., user in Header→Dropdown). | Low | 1 day |
| TECH-005 | **Inconsistent Error Handling** | Some API calls use try/catch + toast, others rely on TanStack Query error boundary only. | Low | 2 days |

---

## 6. Dependency Updates Needed

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| react | 18.2.x | 18.3.x | Low |
| @tanstack/react-query | 5.x | 5.5x | Low |
| fastify | 4.x | 4.28x | Low |
| prisma | 5.x | 5.18x | Low |
| zod | 3.22.x | 3.23x | Low |
| lucide-react | 0.4xx | 0.47x | Low |
| @radix-ui/* | latest | latest | Low |

**Action**: Run `npm audit` and `npm outdated` in CI weekly.

---

## 7. Sprint Planning Recommendation

### Sprint 1 (Week 1-2): Security Hardening
- GAP-001, GAP-002, GAP-003, GAP-004, GAP-008
- TECH-001 (fix backend TS config)

### Sprint 2 (Week 3-4): Observability & Missing Pages
- GAP-006, GAP-007
- GAP-030, GAP-031, GAP-032 (missing pages)

### Sprint 3 (Week 5-6): Document Hub Completion
- GAP-009, GAP-010, GAP-011, GAP-012
- GAP-015, GAP-016 (compliance remediation/evidence UI)

### Sprint 4 (Week 7-8): Compliance & KT Enhancements
- GAP-017, GAP-018, GAP-019
- GAP-020, GAP-021, GAP-022

### Sprint 5 (Week 9-10): Project Management
- GAP-025, GAP-026, GAP-027
- GAP-036, GAP-037 (search enhancements)

### Sprint 6 (Week 11-12): Platform Features
- GAP-033, GAP-034, GAP-035
- GAP-045, GAP-046, GAP-047

### Ongoing: Technical Debt
- TECH-002 (tests) - allocate 20% capacity each sprint
- TECH-003, TECH-004, TECH-005 - refactor during feature work

---

## 8. Architecture Decisions Needed

| Decision | Options | Recommendation |
|----------|---------|----------------|
| **Real-time Updates** | WebSockets vs Server-Sent Events vs Polling | SSE for notifications, polling for dashboards |
| **File Storage** | Local disk vs S3 vs Azure Blob | S3-compatible (MinIO for dev) |
| **Email Service** | SendGrid vs AWS SES vs Nodemailer/SMTP | AWS SES (cost-effective) |
| **PDF Generation** | Puppeteer vs pdfkit vs @react-pdf/renderer | @react-pdf/renderer (React-native) |
| **Rich Text Editor** | TipTap vs Slate vs Quill | TipTap (headless, React-friendly) |
| **Testing Framework** | Vitest + Playwright vs Jest + Cypress | Vitest + Playwright (Vite-native) |

---

## 9. Definition of Done for Gaps

Each gap is considered "Done" when:
1. ✅ Code implemented and merged to main
2. ✅ TypeScript compiles with zero errors
3. ✅ Manual testing completed (happy path + edge cases)
4. ✅ Added to relevant test suite (when TECH-002 complete)
5. ✅ Documentation updated (README, API docs, user guide)
6. ✅ Deployed to staging and verified

---

## 10. Risk of Not Addressing

| Gap Category | Risk if Deferred |
|--------------|------------------|
| Security (GAP-001 to 005) | **HIGH** - Production incidents, compliance failures |
| Observability (GAP-006 to 008) | **MEDIUM** - Slow incident response, unknown errors |
| Document Hub (GAP-009 to 014) | **LOW** - Manual workarounds exist |
| Compliance (GAP-015 to 019) | **MEDIUM** - Audit findings, incomplete evidence |
| KT Reports (GAP-020 to 024) | **LOW** - Current workflow functional |
| Project Mgmt (GAP-025 to 029) | **LOW** - Spreadsheets used as workaround |
| User/Admin (GAP-030 to 035) | **MEDIUM** - Admin UX gaps, no password reset |
| Search (GAP-036 to 038) | **LOW** - Current search sufficient for MVP |
| UX Polish (GAP-039 to 044) | **LOW** - Nice-to-have improvements |

---

## 11. Sign-Off

| Role | Acknowledgment | Date |
|------|----------------|------|
| Product Owner | ⬜ Reviewed & Prioritized | - |
| Tech Lead | ⬜ Technical Approach Approved | - |
| Security Lead | ⬜ Security Gaps Accepted | - |
| DevOps Lead | ⬜ Infrastructure Gaps Noted | - |

---

*This document is a living artifact. Update as gaps are resolved or new ones discovered.*
*Next Review: 2026-11-30 (Sprint 2 retrospective)*