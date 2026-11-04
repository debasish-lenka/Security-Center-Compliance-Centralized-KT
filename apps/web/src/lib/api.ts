import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAuthToken, clearAuth } from './auth';

// Mock mode flag - enable when API is not available (default true for development)
const MOCK_MODE = import.meta.env.VITE_MOCK_MODE !== 'false';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 5000, // 5 second timeout to fail fast when API is not available
});

// Mock data
const mockUser = {
  id: '1',
  email: 'admin@dbi.example.com',
  fullName: 'Admin User',
  department: 'Security Operations',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
};

const mockMetrics = {
  metrics: {
    totalProjects: 10,
    ongoingProjects: 5,
    completedProjects: 2,
    notStartedProjects: 1,
    onHoldProjects: 1,
    overdueProjects: 1,
    atRiskProjects: 0,
    activeMembers: 15,
    pendingKTReports: 12,
    totalDocuments: 50,
    activeUsers: 14,
    complianceScore: 87,
    pendingReviews: 8,
    knowledgeBaseArticles: 42,
  },
  charts: {
    statusDistribution: [
      { status: 'NOT_STARTED', count: 1 },
      { status: 'ONGOING', count: 5 },
      { status: 'COMPLETED', count: 2 },
      { status: 'ON_HOLD', count: 1 },
      { status: 'OVERDUE', count: 1 },
      { status: 'AT_RISK', count: 0 },
    ],
    teamWorkload: [
      { userName: 'Admin User', userEmail: 'admin@dbi.example.com', projectCount: 3 },
      { userName: 'John Doe', userEmail: 'john@example.com', projectCount: 4 },
      { userName: 'Jane Smith', userEmail: 'jane@example.com', projectCount: 3 },
      { userName: 'Bob Wilson', userEmail: 'bob@example.com', projectCount: 2 },
      { userName: 'Alice Brown', userEmail: 'alice@example.com', projectCount: 1 },
      { userName: 'Charlie Davis', userEmail: 'charlie@example.com', projectCount: 2 },
      { userName: 'Sarah Johnson', userEmail: 'sarah@example.com', projectCount: 2 },
      { userName: 'Mike Chen', userEmail: 'mike@example.com', projectCount: 1 },
      { userName: 'Emily Rodriguez', userEmail: 'emily@example.com', projectCount: 3 },
      { userName: 'David Kim', userEmail: 'david@example.com', projectCount: 1 },
    ],
    ktSubmissionRates: [
      { date: '2024-01-01', count: 8 },
      { date: '2024-01-02', count: 12 },
      { date: '2024-01-03', count: 9 },
      { date: '2024-01-04', count: 15 },
      { date: '2024-01-05', count: 11 },
      { date: '2024-01-06', count: 7 },
      { date: '2024-01-07', count: 6 },
      { date: '2024-01-08', count: 10 },
      { date: '2024-01-09', count: 13 },
      { date: '2024-01-10', count: 9 },
      { date: '2024-01-11', count: 8 },
      { date: '2024-01-12', count: 12 },
      { date: '2024-01-13', count: 14 },
      { date: '2024-01-14', count: 10 },
      { date: '2024-01-15', count: 11 },
      { date: '2024-01-16', count: 9 },
      { date: '2024-01-17', count: 13 },
      { date: '2024-01-18', count: 7 },
      { date: '2024-01-19', count: 6 },
      { date: '2024-01-20', count: 10 },
      { date: '2024-01-21', count: 12 },
      { date: '2024-01-22', count: 9 },
      { date: '2024-01-23', count: 11 },
      { date: '2024-01-24', count: 8 },
      { date: '2024-01-25', count: 14 },
      { date: '2024-01-26', count: 10 },
      { date: '2024-01-27', count: 7 },
      { date: '2024-01-28', count: 6 },
      { date: '2024-01-29', count: 9 },
      { date: '2024-01-30', count: 12 },
    ],
    complianceMetrics: [
      { framework: 'ISO 27001', compliant: 8, partial: 2, nonCompliant: 1 },
      { framework: 'NIST CSF', compliant: 7, partial: 3, nonCompliant: 1 },
      { framework: 'SOC 2', compliant: 6, partial: 2, nonCompliant: 2 },
      { framework: 'GDPR', compliant: 5, partial: 3, nonCompliant: 1 },
    ],
  },
  alerts: {
    upcomingDeadlines: [
      { id: '1', name: 'Security Audit Q1', expectedCompletionDate: '2024-02-15', priority: 'HIGH' },
      { id: '2', name: 'Compliance Review', expectedCompletionDate: '2024-02-20', priority: 'MEDIUM' },
      { id: '3', name: 'Penetration Testing', expectedCompletionDate: '2024-02-25', priority: 'CRITICAL' },
      { id: '5', name: 'New Hire Onboarding', expectedCompletionDate: '2024-03-01', priority: 'LOW' },
      { id: '8', name: 'Vendor Risk Assessment', expectedCompletionDate: '2024-02-28', priority: 'MEDIUM' },
    ],
    overdueProjects: [
      { id: '4', name: 'Legacy System Migration', expectedCompletionDate: '2024-01-10', priority: 'HIGH' },
    ],
  },
  recentActivity: [
    { id: '1', action: 'Created', resourceType: 'Project', actor: { fullName: 'Admin User' }, createdAt: '2024-01-15T10:30:00Z' },
    { id: '2', action: 'Updated', resourceType: 'KT Report', actor: { fullName: 'John Doe' }, createdAt: '2024-01-15T09:15:00Z' },
    { id: '3', action: 'Approved', resourceType: 'Document', actor: { fullName: 'Jane Smith' }, createdAt: '2024-01-14T16:45:00Z' },
    { id: '4', action: 'Completed', resourceType: 'Task', actor: { fullName: 'Bob Wilson' }, createdAt: '2024-01-14T14:20:00Z' },
    { id: '5', action: 'Created', resourceType: 'Compliance Control', actor: { fullName: 'Admin User' }, createdAt: '2024-01-14T11:00:00Z' },
    { id: '6', action: 'Submitted', resourceType: 'KT Report', actor: { fullName: 'Sarah Johnson' }, createdAt: '2024-01-15T08:30:00Z' },
    { id: '7', action: 'Reviewed', resourceType: 'Document', actor: { fullName: 'Mike Chen' }, createdAt: '2024-01-15T07:45:00Z' },
    { id: '8', action: 'Assigned', resourceType: 'Task', actor: { fullName: 'Emily Rodriguez' }, createdAt: '2024-01-14T18:00:00Z' },
    { id: '9', action: 'Updated', resourceType: 'Project', actor: { fullName: 'David Kim' }, createdAt: '2024-01-14T15:30:00Z' },
    { id: '10', action: 'Created', resourceType: 'Notification', actor: { fullName: 'System' }, createdAt: '2024-01-15T06:00:00Z' },
  ],
  recentDocuments: [
    { id: '1', name: 'Security Policy v2.1', projectId: '1', projectName: 'Security Audit Q1', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-15T10:00:00Z' },
    { id: '2', name: 'Penetration Test Report', projectId: '3', projectName: 'Penetration Testing', fileType: 'pdf', fileSize: 2048000, createdAt: '2024-01-14T15:30:00Z' },
    { id: '3', name: 'Compliance Checklist', projectId: '2', projectName: 'Compliance Review', fileType: 'xlsx', fileSize: 512000, createdAt: '2024-01-13T09:00:00Z' },
    { id: '4', name: 'Risk Assessment Matrix', projectId: '1', projectName: 'Security Audit Q1', fileType: 'xlsx', fileSize: 256000, createdAt: '2024-01-12T14:00:00Z' },
    { id: '5', name: 'Incident Response Playbook', projectId: '7', projectName: 'Incident Response Plan', fileType: 'pdf', fileSize: 3072000, createdAt: '2024-01-10T11:00:00Z' },
    { id: '6', name: 'Vendor Security Questionnaire', projectId: '8', projectName: 'Vendor Risk Assessment', fileType: 'docx', fileSize: 768000, createdAt: '2024-01-11T09:30:00Z' },
    { id: '7', name: 'Cloud Architecture Diagram', projectId: '6', projectName: 'Cloud Security Assessment', fileType: 'png', fileSize: 1536000, createdAt: '2024-01-09T16:00:00Z' },
    { id: '8', name: 'Onboarding Checklist', projectId: '5', projectName: 'New Hire Onboarding', fileType: 'pdf', fileSize: 512000, createdAt: '2024-01-08T10:00:00Z' },
  ],
};

const mockProjects = {
  items: [
    {
      id: '1',
      name: 'Security Audit Q1',
      description: 'Comprehensive quarterly security audit covering all critical systems and infrastructure',
      owner: { fullName: 'Admin User', email: 'admin@dbi.example.com' },
      reviewer: { fullName: 'Jane Smith', email: 'jane@example.com' },
      contributors: [
        { fullName: 'John Doe', email: 'john@example.com', role: 'Lead Auditor' },
        { fullName: 'Sarah Johnson', email: 'sarah@example.com', role: 'Security Analyst' },
      ],
      status: 'ONGOING',
      priority: 'HIGH',
      progress: 65,
      expectedCompletionDate: '2024-02-15',
      startDate: '2024-01-01',
      tags: ['Audit', 'Compliance', 'Quarterly'],
      budget: 50000,
      spent: 32500,
    },
    {
      id: '2',
      name: 'Compliance Review',
      description: 'Annual compliance review for ISO 27001 and SOC 2 certifications',
      owner: { fullName: 'Jane Smith', email: 'jane@example.com' },
      reviewer: { fullName: 'Admin User', email: 'admin@dbi.example.com' },
      contributors: [
        { fullName: 'Emily Rodriguez', email: 'emily@example.com', role: 'Compliance Analyst' },
        { fullName: 'Mike Chen', email: 'mike@example.com', role: 'Documentation Specialist' },
      ],
      status: 'ONGOING',
      priority: 'MEDIUM',
      progress: 40,
      expectedCompletionDate: '2024-02-20',
      startDate: '2024-01-10',
      tags: ['Compliance', 'ISO 27001', 'SOC 2'],
      budget: 35000,
      spent: 14000,
    },
    {
      id: '3',
      name: 'Penetration Testing',
      description: 'External and internal penetration testing of all public-facing applications',
      owner: { fullName: 'John Doe', email: 'john@example.com' },
      reviewer: { fullName: 'Admin User', email: 'admin@dbi.example.com' },
      contributors: [
        { fullName: 'Bob Wilson', email: 'bob@example.com', role: 'Penetration Tester' },
        { fullName: 'David Kim', email: 'david@example.com', role: 'Security Researcher' },
      ],
      status: 'ONGOING',
      priority: 'CRITICAL',
      progress: 80,
      expectedCompletionDate: '2024-02-25',
      startDate: '2024-01-05',
      tags: ['Penetration Testing', 'Security', 'Critical'],
      budget: 75000,
      spent: 60000,
    },
    {
      id: '4',
      name: 'Legacy System Migration',
      description: 'Migration of legacy authentication systems to modern identity provider',
      owner: { fullName: 'Bob Wilson', email: 'bob@example.com' },
      reviewer: { fullName: 'John Doe', email: 'john@example.com' },
      contributors: [
        { fullName: 'Charlie Davis', email: 'charlie@example.com', role: 'DevOps Engineer' },
        { fullName: 'Mike Chen', email: 'mike@example.com', role: 'Backend Developer' },
      ],
      status: 'OVERDUE',
      priority: 'HIGH',
      progress: 90,
      expectedCompletionDate: '2024-01-10',
      startDate: '2023-11-01',
      tags: ['Migration', 'Legacy', 'Identity'],
      budget: 120000,
      spent: 108000,
    },
    {
      id: '5',
      name: 'New Hire Onboarding',
      description: 'Security onboarding program for new employees including training and access provisioning',
      owner: { fullName: 'Alice Brown', email: 'alice@example.com' },
      reviewer: { fullName: 'Jane Smith', email: 'jane@example.com' },
      contributors: [
        { fullName: 'Sarah Johnson', email: 'sarah@example.com', role: 'Training Coordinator' },
      ],
      status: 'NOT_STARTED',
      priority: 'LOW',
      progress: 0,
      expectedCompletionDate: '2024-03-01',
      startDate: '2024-02-01',
      tags: ['Onboarding', 'Training', 'HR'],
      budget: 15000,
      spent: 0,
    },
    {
      id: '6',
      name: 'Cloud Security Assessment',
      description: 'Assessment of cloud infrastructure security posture across AWS, Azure, and GCP',
      owner: { fullName: 'Charlie Davis', email: 'charlie@example.com' },
      reviewer: { fullName: 'Admin User', email: 'admin@dbi.example.com' },
      contributors: [
        { fullName: 'David Kim', email: 'david@example.com', role: 'Cloud Security Engineer' },
        { fullName: 'Emily Rodriguez', email: 'emily@example.com', role: 'Compliance Analyst' },
      ],
      status: 'ON_HOLD',
      priority: 'MEDIUM',
      progress: 25,
      expectedCompletionDate: '2024-03-15',
      startDate: '2024-01-15',
      tags: ['Cloud', 'AWS', 'Azure', 'GCP'],
      budget: 45000,
      spent: 11250,
    },
    {
      id: '7',
      name: 'Incident Response Plan',
      description: 'Development and testing of comprehensive incident response procedures',
      owner: { fullName: 'Admin User', email: 'admin@dbi.example.com' },
      reviewer: { fullName: 'John Doe', email: 'john@example.com' },
      contributors: [
        { fullName: 'Bob Wilson', email: 'bob@example.com', role: 'Incident Commander' },
        { fullName: 'Charlie Davis', email: 'charlie@example.com', role: 'Forensics Lead' },
      ],
      status: 'COMPLETED',
      priority: 'HIGH',
      progress: 100,
      expectedCompletionDate: '2024-01-05',
      startDate: '2023-12-01',
      tags: ['Incident Response', 'Plan', 'Completed'],
      budget: 25000,
      spent: 25000,
    },
    {
      id: '8',
      name: 'Vendor Risk Assessment',
      description: 'Assessment of security posture for all third-party vendors and suppliers',
      owner: { fullName: 'Jane Smith', email: 'jane@example.com' },
      reviewer: { fullName: 'Admin User', email: 'admin@dbi.example.com' },
      contributors: [
        { fullName: 'Mike Chen', email: 'mike@example.com', role: 'Vendor Manager' },
        { fullName: 'Sarah Johnson', email: 'sarah@example.com', role: 'Risk Analyst' },
      ],
      status: 'ONGOING',
      priority: 'MEDIUM',
      progress: 55,
      expectedCompletionDate: '2024-02-28',
      startDate: '2024-01-08',
      tags: ['Vendor', 'Risk', 'Third Party'],
      budget: 30000,
      spent: 16500,
    },
    {
      id: '9',
      name: 'Data Loss Prevention',
      description: 'Implementation of DLP policies and monitoring across all data channels',
      owner: { fullName: 'John Doe', email: 'john@example.com' },
      reviewer: { fullName: 'Jane Smith', email: 'jane@example.com' },
      contributors: [
        { fullName: 'Bob Wilson', email: 'bob@example.com', role: 'DLP Engineer' },
        { fullName: 'David Kim', email: 'david@example.com', role: 'Data Analyst' },
      ],
      status: 'ONGOING',
      priority: 'HIGH',
      progress: 35,
      expectedCompletionDate: '2024-03-10',
      startDate: '2024-01-12',
      tags: ['DLP', 'Data Protection', 'Monitoring'],
      budget: 60000,
      spent: 21000,
    },
    {
      id: '10',
      name: 'Security Awareness Training',
      description: 'Annual security awareness training program for all employees',
      owner: { fullName: 'Emily Rodriguez', email: 'emily@example.com' },
      reviewer: { fullName: 'Alice Brown', email: 'alice@example.com' },
      contributors: [
        { fullName: 'Sarah Johnson', email: 'sarah@example.com', role: 'Content Creator' },
        { fullName: 'Mike Chen', email: 'mike@example.com', role: 'Platform Admin' },
      ],
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      progress: 0,
      expectedCompletionDate: '2024-04-01',
      startDate: '2024-03-01',
      tags: ['Training', 'Awareness', 'Annual'],
      budget: 20000,
      spent: 0,
    },
  ],
};

const mockUsers = [
  { id: '1', email: 'admin@dbi.example.com', fullName: 'Admin User', department: 'Security Operations', role: 'SUPER_ADMIN', status: 'ACTIVE', lastLogin: '2024-01-15T08:30:00Z', avatar: null },
  { id: '2', email: 'john@example.com', fullName: 'John Doe', department: 'Security Operations', role: 'ADMIN', status: 'ACTIVE', lastLogin: '2024-01-15T07:45:00Z', avatar: null },
  { id: '3', email: 'jane@example.com', fullName: 'Jane Smith', department: 'Compliance', role: 'COMPLIANCE_OFFICER', status: 'ACTIVE', lastLogin: '2024-01-15T09:00:00Z', avatar: null },
  { id: '4', email: 'bob@example.com', fullName: 'Bob Wilson', department: 'Security Operations', role: 'ANALYST', status: 'ACTIVE', lastLogin: '2024-01-14T16:30:00Z', avatar: null },
  { id: '5', email: 'alice@example.com', fullName: 'Alice Brown', department: 'HR', role: 'VIEWER', status: 'ACTIVE', lastLogin: '2024-01-15T08:00:00Z', avatar: null },
  { id: '6', email: 'charlie@example.com', fullName: 'Charlie Davis', department: 'IT', role: 'ANALYST', status: 'ACTIVE', lastLogin: '2024-01-15T06:15:00Z', avatar: null },
  { id: '7', email: 'sarah@example.com', fullName: 'Sarah Johnson', department: 'Security Operations', role: 'ANALYST', status: 'ACTIVE', lastLogin: '2024-01-15T08:30:00Z', avatar: null },
  { id: '8', email: 'mike@example.com', fullName: 'Mike Chen', department: 'Engineering', role: 'DEVELOPER', status: 'ACTIVE', lastLogin: '2024-01-14T18:00:00Z', avatar: null },
  { id: '9', email: 'emily@example.com', fullName: 'Emily Rodriguez', department: 'Compliance', role: 'COMPLIANCE_OFFICER', status: 'ACTIVE', lastLogin: '2024-01-15T07:45:00Z', avatar: null },
  { id: '10', email: 'david@example.com', fullName: 'David Kim', department: 'Security Operations', role: 'ANALYST', status: 'ACTIVE', lastLogin: '2024-01-15T06:30:00Z', avatar: null },
  { id: '11', email: 'lisa@example.com', fullName: 'Lisa Wang', department: 'Legal', role: 'VIEWER', status: 'ACTIVE', lastLogin: '2024-01-14T15:00:00Z', avatar: null },
  { id: '12', email: 'james@example.com', fullName: 'James Anderson', department: 'IT', role: 'ADMIN', status: 'ACTIVE', lastLogin: '2024-01-15T07:00:00Z', avatar: null },
  { id: '13', email: 'marie@example.com', fullName: 'Marie Dubois', department: 'Security Operations', role: 'ANALYST', status: 'INACTIVE', lastLogin: '2024-01-10T10:00:00Z', avatar: null },
  { id: '14', email: 'robert@example.com', fullName: 'Robert Taylor', department: 'Engineering', role: 'DEVELOPER', status: 'ACTIVE', lastLogin: '2024-01-15T08:45:00Z', avatar: null },
  { id: '15', email: 'amanda@example.com', fullName: 'Amanda Foster', department: 'Compliance', role: 'COMPLIANCE_OFFICER', status: 'ACTIVE', lastLogin: '2024-01-15T09:15:00Z', avatar: null },
];

const mockRoles = [
  { id: '1', name: 'SUPER_ADMIN', description: 'Full system access', permissions: [] },
  { id: '2', name: 'ADMIN', description: 'Administrative access', permissions: [] },
  { id: '3', name: 'COMPLIANCE_OFFICER', description: 'Compliance management access', permissions: [] },
  { id: '4', name: 'ANALYST', description: 'Security analysis access', permissions: [] },
  { id: '5', name: 'VIEWER', description: 'Read-only access', permissions: [] },
];

const mockComplianceControls = [
  { id: '1', name: 'Access Control Policy', framework: 'ISO 27001', status: 'COMPLIANT', lastAssessed: '2024-01-10', owner: 'Jane Smith', description: 'Policy defining access control requirements and procedures' },
  { id: '2', name: 'Encryption Standards', framework: 'NIST', status: 'NON_COMPLIANT', lastAssessed: '2024-01-12', owner: 'John Doe', description: 'Encryption requirements for data at rest and in transit' },
  { id: '3', name: 'Incident Response', framework: 'ISO 27001', status: 'PARTIAL', lastAssessed: '2024-01-14', owner: 'Admin User', description: 'Incident response procedures and escalation paths' },
  { id: '4', name: 'Business Continuity Plan', framework: 'ISO 22301', status: 'COMPLIANT', lastAssessed: '2024-01-08', owner: 'Jane Smith', description: 'Business continuity and disaster recovery procedures' },
  { id: '5', name: 'Vendor Management', framework: 'SOC 2', status: 'PARTIAL', lastAssessed: '2024-01-15', owner: 'Jane Smith', description: 'Third-party vendor risk assessment and management' },
  { id: '6', name: 'Data Classification', framework: 'GDPR', status: 'COMPLIANT', lastAssessed: '2024-01-09', owner: 'Emily Rodriguez', description: 'Data classification and handling procedures' },
  { id: '7', name: 'Network Security Monitoring', framework: 'NIST', status: 'COMPLIANT', lastAssessed: '2024-01-11', owner: 'John Doe', description: 'Continuous network monitoring and intrusion detection' },
  { id: '8', name: 'Secure Development Lifecycle', framework: 'OWASP', status: 'PARTIAL', lastAssessed: '2024-01-13', owner: 'Mike Chen', description: 'Security requirements in software development lifecycle' },
  { id: '9', name: 'Physical Security', framework: 'ISO 27001', status: 'COMPLIANT', lastAssessed: '2024-01-05', owner: 'Robert Taylor', description: 'Physical access controls and environmental protection' },
  { id: '10', name: 'Privacy Impact Assessment', framework: 'GDPR', status: 'NON_COMPLIANT', lastAssessed: '2024-01-16', owner: 'Lisa Wang', description: 'Privacy impact assessments for new processes' },
];

// Mock Documents (50 documents)
const mockDocuments = [
  { id: '1', name: 'Security Policy v2.1', projectId: '1', projectName: 'Security Audit Q1', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-15T10:00:00Z', owner: 'Admin User', tags: ['policy', 'security'], status: 'APPROVED', reviewStatus: null, reviewerId: null, reviewedAt: null, reviewComments: null },
  { id: '2', name: 'Penetration Test Report', projectId: '3', projectName: 'Penetration Testing', fileType: 'pdf', fileSize: 2048000, createdAt: '2024-01-14T15:30:00Z', owner: 'John Doe', tags: ['pentest', 'report'], status: 'APPROVED', reviewStatus: null, reviewerId: null, reviewedAt: null, reviewComments: null },
  { id: '3', name: 'Compliance Checklist', projectId: '2', projectName: 'Compliance Review', fileType: 'xlsx', fileSize: 512000, createdAt: '2024-01-13T09:00:00Z', owner: 'Jane Smith', tags: ['compliance', 'checklist'], status: 'IN_REVIEW', reviewStatus: 'PENDING', reviewerId: '3', reviewedAt: null, reviewComments: null },
  { id: '4', name: 'Risk Assessment Matrix', projectId: '1', projectName: 'Security Audit Q1', fileType: 'xlsx', fileSize: 256000, createdAt: '2024-01-12T14:00:00Z', owner: 'Admin User', tags: ['risk', 'assessment'], status: 'DRAFT', reviewStatus: null, reviewerId: null, reviewedAt: null, reviewComments: null },
  { id: '5', name: 'Incident Response Playbook', projectId: '7', projectName: 'Incident Response Plan', fileType: 'pdf', fileSize: 3072000, createdAt: '2024-01-10T11:00:00Z', owner: 'Admin User', tags: ['incident', 'response', 'playbook'], status: 'APPROVED', reviewStatus: null, reviewerId: null, reviewedAt: null, reviewComments: null },
  { id: '6', name: 'Vendor Security Questionnaire', projectId: '8', projectName: 'Vendor Risk Assessment', fileType: 'docx', fileSize: 768000, createdAt: '2024-01-11T09:30:00Z', owner: 'Jane Smith', tags: ['vendor', 'questionnaire'], status: 'IN_REVIEW', reviewStatus: 'PENDING', reviewerId: '3', reviewedAt: null, reviewComments: null },
  { id: '7', name: 'Cloud Architecture Diagram', projectId: '6', projectName: 'Cloud Security Assessment', fileType: 'png', fileSize: 1536000, createdAt: '2024-01-09T16:00:00Z', owner: 'Charlie Davis', tags: ['cloud', 'architecture'], status: 'DRAFT', reviewStatus: null, reviewerId: null, reviewedAt: null, reviewComments: null },
  { id: '8', name: 'Onboarding Checklist', projectId: '5', projectName: 'New Hire Onboarding', fileType: 'pdf', fileSize: 512000, createdAt: '2024-01-08T10:00:00Z', owner: 'Alice Brown', tags: ['onboarding', 'checklist'], status: 'DRAFT', reviewStatus: null, reviewerId: null, reviewedAt: null, reviewComments: null },
  { id: '9', name: 'DLP Policy Document', projectId: '9', projectName: 'Data Loss Prevention', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-15T09:00:00Z', owner: 'John Doe', tags: ['dlp', 'policy'], status: 'DRAFT', reviewStatus: null, reviewerId: null, reviewedAt: null, reviewComments: null },
  { id: '10', name: 'Security Training Materials', projectId: '10', projectName: 'Security Awareness Training', fileType: 'zip', fileSize: 5120000, createdAt: '2024-01-15T08:00:00Z', owner: 'Emily Rodriguez', tags: ['training', 'awareness'], status: 'DRAFT', reviewStatus: null, reviewerId: null, reviewedAt: null, reviewComments: null },
  { id: '11', name: 'Network Security Config', projectId: '1', projectName: 'Security Audit Q1', fileType: 'json', fileSize: 128000, createdAt: '2024-01-14T13:00:00Z', owner: 'Sarah Johnson', tags: ['network', 'config'], status: 'APPROVED' },
  { id: '12', name: 'Access Control Matrix', projectId: '2', projectName: 'Compliance Review', fileType: 'xlsx', fileSize: 384000, createdAt: '2024-01-13T11:00:00Z', owner: 'Emily Rodriguez', tags: ['access', 'control'], status: 'IN_REVIEW' },
  { id: '13', name: 'Vulnerability Scan Results', projectId: '3', projectName: 'Penetration Testing', fileType: 'pdf', fileSize: 2048000, createdAt: '2024-01-12T16:00:00Z', owner: 'Bob Wilson', tags: ['vulnerability', 'scan'], status: 'APPROVED' },
  { id: '14', name: 'Migration Runbook', projectId: '4', projectName: 'Legacy System Migration', fileType: 'md', fileSize: 256000, createdAt: '2024-01-11T14:00:00Z', owner: 'Bob Wilson', tags: ['migration', 'runbook'], status: 'APPROVED' },
  { id: '15', name: 'Vendor Contract Templates', projectId: '8', projectName: 'Vendor Risk Assessment', fileType: 'docx', fileSize: 1024000, createdAt: '2024-01-10T10:00:00Z', owner: 'Mike Chen', tags: ['vendor', 'contract'], status: 'DRAFT' },
  { id: '16', name: 'AWS Security Benchmark', projectId: '6', projectName: 'Cloud Security Assessment', fileType: 'pdf', fileSize: 2048000, createdAt: '2024-01-09T15:00:00Z', owner: 'Charlie Davis', tags: ['aws', 'benchmark'], status: 'IN_REVIEW' },
  { id: '17', name: 'Azure Security Benchmark', projectId: '6', projectName: 'Cloud Security Assessment', fileType: 'pdf', fileSize: 2048000, createdAt: '2024-01-09T14:00:00Z', owner: 'Charlie Davis', tags: ['azure', 'benchmark'], status: 'IN_REVIEW' },
  { id: '18', name: 'GCP Security Benchmark', projectId: '6', projectName: 'Cloud Security Assessment', fileType: 'pdf', fileSize: 2048000, createdAt: '2024-01-09T13:00:00Z', owner: 'David Kim', tags: ['gcp', 'benchmark'], status: 'IN_REVIEW' },
  { id: '19', name: 'Phishing Simulation Results', projectId: '10', projectName: 'Security Awareness Training', fileType: 'xlsx', fileSize: 512000, createdAt: '2024-01-08T12:00:00Z', owner: 'Sarah Johnson', tags: ['phishing', 'simulation'], status: 'DRAFT' },
  { id: '20', name: 'Business Impact Analysis', projectId: '7', projectName: 'Incident Response Plan', fileType: 'pdf', fileSize: 1536000, createdAt: '2024-01-07T11:00:00Z', owner: 'Admin User', tags: ['bia', 'business'], status: 'APPROVED' },
  { id: '21', name: 'Disaster Recovery Plan', projectId: '7', projectName: 'Incident Response Plan', fileType: 'pdf', fileSize: 2048000, createdAt: '2024-01-06T10:00:00Z', owner: 'Admin User', tags: ['dr', 'disaster', 'recovery'], status: 'APPROVED' },
  { id: '22', name: 'Data Retention Policy', projectId: '2', projectName: 'Compliance Review', fileType: 'pdf', fileSize: 768000, createdAt: '2024-01-12T10:00:00Z', owner: 'Jane Smith', tags: ['retention', 'policy'], status: 'APPROVED' },
  { id: '23', name: 'Encryption Key Management', projectId: '1', projectName: 'Security Audit Q1', fileType: 'pdf', fileSize: 512000, createdAt: '2024-01-11T09:00:00Z', owner: 'John Doe', tags: ['encryption', 'keys'], status: 'APPROVED' },
  { id: '24', name: 'SIEM Rules Documentation', projectId: '3', projectName: 'Penetration Testing', fileType: 'md', fileSize: 512000, createdAt: '2024-01-10T15:00:00Z', owner: 'Bob Wilson', tags: ['siem', 'rules'], status: 'DRAFT' },
  { id: '25', name: 'API Security Guidelines', projectId: '9', projectName: 'Data Loss Prevention', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-09T11:00:00Z', owner: 'David Kim', tags: ['api', 'security'], status: 'IN_REVIEW' },
  { id: '26', name: 'Container Security Policy', projectId: '6', projectName: 'Cloud Security Assessment', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-08T14:00:00Z', owner: 'Charlie Davis', tags: ['container', 'kubernetes'], status: 'DRAFT' },
  { id: '27', name: 'Third Party Risk Register', projectId: '8', projectName: 'Vendor Risk Assessment', fileType: 'xlsx', fileSize: 768000, createdAt: '2024-01-07T16:00:00Z', owner: 'Mike Chen', tags: ['vendor', 'risk', 'register'], status: 'IN_REVIEW' },
  { id: '28', name: 'Security Architecture Review', projectId: '1', projectName: 'Security Audit Q1', fileType: 'pdf', fileSize: 2048000, createdAt: '2024-01-06T12:00:00Z', owner: 'Admin User', tags: ['architecture', 'review'], status: 'APPROVED' },
  { id: '29', name: 'Compliance Gap Analysis', projectId: '2', projectName: 'Compliance Review', fileType: 'xlsx', fileSize: 512000, createdAt: '2024-01-05T10:00:00Z', owner: 'Jane Smith', tags: ['gap', 'analysis'], status: 'IN_REVIEW' },
  { id: '30', name: 'Threat Modeling Document', projectId: '3', projectName: 'Penetration Testing', fileType: 'pdf', fileSize: 1536000, createdAt: '2024-01-04T14:00:00Z', owner: 'John Doe', tags: ['threat', 'modeling'], status: 'APPROVED' },
  { id: '31', name: 'Identity Provider Config', projectId: '4', projectName: 'Legacy System Migration', fileType: 'json', fileSize: 256000, createdAt: '2024-01-03T11:00:00Z', owner: 'Bob Wilson', tags: ['identity', 'idp', 'config'], status: 'APPROVED' },
  { id: '32', name: 'Security Metrics Dashboard', projectId: '1', projectName: 'Security Audit Q1', fileType: 'json', fileSize: 128000, createdAt: '2024-01-15T07:00:00Z', owner: 'Admin User', tags: ['metrics', 'dashboard'], status: 'APPROVED' },
  { id: '33', name: 'Audit Trail Export', projectId: '2', projectName: 'Compliance Review', fileType: 'csv', fileSize: 5242880, createdAt: '2024-01-14T17:00:00Z', owner: 'Emily Rodriguez', tags: ['audit', 'export'], status: 'APPROVED' },
  { id: '34', name: 'Patch Management Report', projectId: '9', projectName: 'Data Loss Prevention', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-13T16:00:00Z', owner: 'David Kim', tags: ['patch', 'management'], status: 'IN_REVIEW' },
  { id: '35', name: 'Firewall Rule Audit', projectId: '3', projectName: 'Penetration Testing', fileType: 'xlsx', fileSize: 768000, createdAt: '2024-01-12T09:00:00Z', owner: 'Bob Wilson', tags: ['firewall', 'audit'], status: 'APPROVED' },
  { id: '36', name: 'Backup Verification Log', projectId: '7', projectName: 'Incident Response Plan', fileType: 'log', fileSize: 2048000, createdAt: '2024-01-11T08:00:00Z', owner: 'Charlie Davis', tags: ['backup', 'verification'], status: 'APPROVED' },
  { id: '37', name: 'SSL Certificate Inventory', projectId: '1', projectName: 'Security Audit Q1', fileType: 'xlsx', fileSize: 256000, createdAt: '2024-01-10T12:00:00Z', owner: 'Sarah Johnson', tags: ['ssl', 'certificates'], status: 'APPROVED' },
  { id: '38', name: 'Access Review Report', projectId: '2', projectName: 'Compliance Review', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-09T15:00:00Z', owner: 'Jane Smith', tags: ['access', 'review'], status: 'IN_REVIEW' },
  { id: '39', name: 'Security Exception Request', projectId: '4', projectName: 'Legacy System Migration', fileType: 'docx', fileSize: 256000, createdAt: '2024-01-08T11:00:00Z', owner: 'Mike Chen', tags: ['exception', 'request'], status: 'DRAFT' },
  { id: '40', name: 'Incident Postmortem Template', projectId: '7', projectName: 'Incident Response Plan', fileType: 'md', fileSize: 128000, createdAt: '2024-01-07T14:00:00Z', owner: 'Admin User', tags: ['incident', 'postmortem', 'template'], status: 'APPROVED' },
  { id: '41', name: 'Privacy Policy v1.5', projectId: '2', projectName: 'Compliance Review', fileType: 'pdf', fileSize: 768000, createdAt: '2024-01-06T16:00:00Z', owner: 'Lisa Wang', tags: ['privacy', 'policy'], status: 'APPROVED' },
  { id: '42', name: 'Data Processing Agreement', projectId: '8', projectName: 'Vendor Risk Assessment', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-05T13:00:00Z', owner: 'Mike Chen', tags: ['dpa', 'vendor'], status: 'IN_REVIEW' },
  { id: '43', name: 'Security Training Completion', projectId: '10', projectName: 'Security Awareness Training', fileType: 'csv', fileSize: 1024000, createdAt: '2024-01-04T10:00:00Z', owner: 'Emily Rodriguez', tags: ['training', 'completion'], status: 'DRAFT' },
  { id: '44', name: 'Red Team Exercise Results', projectId: '3', projectName: 'Penetration Testing', fileType: 'pdf', fileSize: 3072000, createdAt: '2024-01-03T15:00:00Z', owner: 'John Doe', tags: ['redteam', 'exercise'], status: 'APPROVED' },
  { id: '45', name: 'Blue Team Response Log', projectId: '7', projectName: 'Incident Response Plan', fileType: 'log', fileSize: 512000, createdAt: '2024-01-02T12:00:00Z', owner: 'Bob Wilson', tags: ['blueteam', 'response'], status: 'APPROVED' },
  { id: '46', name: 'Security Architecture Diagram', projectId: '1', projectName: 'Security Audit Q1', fileType: 'png', fileSize: 2048000, createdAt: '2024-01-01T11:00:00Z', owner: 'Admin User', tags: ['architecture', 'diagram'], status: 'APPROVED' },
  { id: '47', name: 'Compliance Evidence Package', projectId: '2', projectName: 'Compliance Review', fileType: 'zip', fileSize: 10485760, createdAt: '2024-01-15T06:00:00Z', owner: 'Jane Smith', tags: ['compliance', 'evidence'], status: 'IN_REVIEW' },
  { id: '48', name: 'Vulnerability Remediation Plan', projectId: '9', projectName: 'Data Loss Prevention', fileType: 'pdf', fileSize: 1024000, createdAt: '2024-01-14T10:00:00Z', owner: 'David Kim', tags: ['remediation', 'vulnerability'], status: 'DRAFT' },
  { id: '49', name: 'Security Budget Forecast', projectId: '1', projectName: 'Security Audit Q1', fileType: 'xlsx', fileSize: 256000, createdAt: '2024-01-13T09:00:00Z', owner: 'Admin User', tags: ['budget', 'forecast'], status: 'APPROVED' },
  { id: '50', name: 'Executive Security Summary', projectId: '1', projectName: 'Security Audit Q1', fileType: 'pdf', fileSize: 512000, createdAt: '2024-01-12T17:00:00Z', owner: 'Admin User', tags: ['executive', 'summary'], status: 'APPROVED' },
];

// Mock Notifications (20 notifications)
const mockNotifications = [
  { id: '1', userId: '1', title: 'Security Audit Q1 - Milestone Completed', message: 'The network scanning phase has been completed successfully.', type: 'SUCCESS', read: false, createdAt: '2024-01-15T10:30:00Z', link: '/projects/1' },
  { id: '2', userId: '1', title: 'Penetration Testing - Critical Finding', message: 'Critical SQL injection vulnerability found in payment portal.', type: 'CRITICAL', read: false, createdAt: '2024-01-15T09:15:00Z', link: '/projects/3' },
  { id: '3', userId: '1', title: 'Legacy System Migration - Overdue', message: 'Project is 5 days overdue. Immediate attention required.', type: 'WARNING', read: true, createdAt: '2024-01-15T08:00:00Z', link: '/projects/4' },
  { id: '4', userId: '1', title: 'New Compliance Control Assigned', message: 'You have been assigned as owner for "Privacy Impact Assessment".', type: 'INFO', read: false, createdAt: '2024-01-14T16:45:00Z', link: '/compliance' },
  { id: '5', userId: '1', title: 'Document Approved: Incident Response Playbook', message: 'Your document has been reviewed and approved by John Doe.', type: 'SUCCESS', read: true, createdAt: '2024-01-14T14:20:00Z', link: '/documents/5' },
  { id: '6', userId: '1', title: 'KT Report Reminder', message: 'Daily KT report for Security Audit Q1 is due today.', type: 'INFO', read: false, createdAt: '2024-01-15T06:00:00Z', link: '/kt-reports' },
  { id: '7', userId: '1', title: 'Vendor Risk Assessment - Review Needed', message: 'Vendor contract templates require your review.', type: 'WARNING', read: false, createdAt: '2024-01-14T18:00:00Z', link: '/projects/8' },
  { id: '8', userId: '1', title: 'Cloud Security Assessment - On Hold', message: 'Project placed on hold pending AWS credential approval.', type: 'INFO', read: true, createdAt: '2024-01-14T15:30:00Z', link: '/projects/6' },
  { id: '9', userId: '1', title: 'New User Added: Amanda Foster', message: 'Amanda Foster has been added as COMPLIANCE_OFFICER.', type: 'INFO', read: true, createdAt: '2024-01-14T11:00:00Z', link: '/users' },
  { id: '10', userId: '1', title: 'Security Patch Released', message: 'Critical security patch available for OpenSSL. Apply immediately.', type: 'CRITICAL', read: false, createdAt: '2024-01-15T07:00:00Z', link: '/projects/9' },
  { id: '11', userId: '2', title: 'Project Assigned: Data Loss Prevention', message: 'You have been assigned as owner for the DLP project.', type: 'INFO', read: false, createdAt: '2024-01-15T08:30:00Z', link: '/projects/9' },
  { id: '12', userId: '3', title: 'Compliance Review - Evidence Needed', message: 'Additional evidence required for SOC 2 compliance.', type: 'WARNING', read: false, createdAt: '2024-01-15T09:00:00Z', link: '/projects/2' },
  { id: '13', userId: '4', title: 'Penetration Test - Retest Required', message: 'Critical findings require retest after remediation.', type: 'CRITICAL', read: false, createdAt: '2024-01-14T16:00:00Z', link: '/projects/3' },
  { id: '14', userId: '5', title: 'Onboarding Program - Approval Needed', message: 'New hire onboarding program requires stakeholder approval.', type: 'INFO', read: true, createdAt: '2024-01-14T14:00:00Z', link: '/projects/5' },
  { id: '15', userId: '6', title: 'Cloud Credentials Approved', message: 'AWS and Azure credentials have been approved for Cloud Security Assessment.', type: 'SUCCESS', read: false, createdAt: '2024-01-14T12:00:00Z', link: '/projects/6' },
  { id: '16', userId: '7', title: 'KT Report Submitted', message: 'Your KT report for Compliance Review has been submitted.', type: 'SUCCESS', read: true, createdAt: '2024-01-15T08:30:00Z', link: '/kt-reports' },
  { id: '17', userId: '8', title: 'Code Review Requested', message: 'Security review requested for authentication module PR #234.', type: 'INFO', read: false, createdAt: '2024-01-15T07:45:00Z', link: '/projects/4' },
  { id: '18', userId: '9', title: 'GDPR Assessment Due', message: 'GDPR privacy impact assessment is due next week.', type: 'WARNING', read: false, createdAt: '2024-01-14T17:00:00Z', link: '/compliance' },
  { id: '19', userId: '10', title: 'DLP Policy Review', message: 'DLP policy document is ready for your review.', type: 'INFO', read: false, createdAt: '2024-01-14T15:00:00Z', link: '/documents/9' },
  { id: '20', userId: '1', title: 'System Maintenance Scheduled', message: 'Planned maintenance window this Saturday 2-4 AM UTC.', type: 'INFO', read: true, createdAt: '2024-01-13T10:00:00Z', link: null },
];

// Mock Audit Logs (25 audit logs)
const mockAuditLogs = [
  { id: '1', action: 'LOGIN', resourceType: 'USER', resourceId: '1', actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { ip: '192.168.1.100', userAgent: 'Chrome 120' }, createdAt: '2024-01-15T08:30:00Z' },
  { id: '2', action: 'CREATE', resourceType: 'PROJECT', resourceId: '1', actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { name: 'Security Audit Q1' }, createdAt: '2024-01-15T10:30:00Z' },
  { id: '3', action: 'UPDATE', resourceType: 'KT_REPORT', resourceId: '1', actor: { id: '2', fullName: 'John Doe', email: 'john@example.com' }, ipAddress: '192.168.1.110', userAgent: 'Chrome 120', outcome: 'success', details: { field: 'status', oldValue: 'DRAFT', newValue: 'SUBMITTED' }, createdAt: '2024-01-15T09:15:00Z' },
  { id: '4', action: 'APPROVE', resourceType: 'DOCUMENT', resourceId: '5', actor: { id: '3', fullName: 'Jane Smith', email: 'jane@example.com' }, ipAddress: '192.168.1.105', userAgent: 'Firefox 121', outcome: 'success', details: { documentName: 'Incident Response Playbook' }, createdAt: '2024-01-14T16:45:00Z' },
  { id: '5', action: 'COMPLETE', resourceType: 'TASK', resourceId: '12', actor: { id: '4', fullName: 'Bob Wilson', email: 'bob@example.com' }, ipAddress: '192.168.1.120', userAgent: 'Chrome 120', outcome: 'success', details: { taskName: 'Network segmentation validation' }, createdAt: '2024-01-14T14:20:00Z' },
  { id: '6', action: 'CREATE', resourceType: 'COMPLIANCE_CONTROL', resourceId: '10', actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { name: 'Privacy Impact Assessment' }, createdAt: '2024-01-14T11:00:00Z' },
  { id: '7', action: 'SUBMIT', resourceType: 'KT_REPORT', resourceId: '2', actor: { id: '7', fullName: 'Sarah Johnson', email: 'sarah@example.com' }, ipAddress: '192.168.1.130', userAgent: 'Safari 17', outcome: 'success', details: { projectName: 'Compliance Review' }, createdAt: '2024-01-15T08:30:00Z' },
  { id: '8', action: 'VIEW', resourceType: 'DOCUMENT', resourceId: '2', actor: { id: '8', fullName: 'Mike Chen', email: 'mike@example.com' }, ipAddress: '192.168.1.140', userAgent: 'Edge 121', outcome: 'success', details: { documentName: 'Penetration Test Report' }, createdAt: '2024-01-14T18:00:00Z' },
  { id: '9', action: 'ASSIGN', resourceType: 'TASK', resourceId: '45', actor: { id: '9', fullName: 'Emily Rodriguez', email: 'emily@example.com' }, ipAddress: '192.168.1.150', userAgent: 'Chrome 120', outcome: 'success', details: { taskName: 'Update vendor questionnaires', assignee: 'Mike Chen' }, createdAt: '2024-01-14T15:30:00Z' },
  { id: '10', action: 'UPDATE', resourceType: 'PROJECT', resourceId: '6', actor: { id: '10', fullName: 'David Kim', email: 'david@example.com' }, ipAddress: '192.168.1.160', userAgent: 'Chrome 120', outcome: 'success', details: { field: 'status', oldValue: 'NOT_STARTED', newValue: 'ON_HOLD' }, createdAt: '2024-01-14T15:30:00Z' },
  { id: '11', action: 'LOGIN', resourceType: 'USER', resourceId: '3', actor: { id: '3', fullName: 'Jane Smith', email: 'jane@example.com' }, ipAddress: '192.168.1.105', userAgent: 'Firefox 121', outcome: 'failure', details: { ip: '192.168.1.105', userAgent: 'Firefox 121', error: 'Invalid password' }, createdAt: '2024-01-15T09:00:00Z' },
  { id: '12', action: 'DOWNLOAD', resourceType: 'DOCUMENT', resourceId: '3', actor: { id: '3', fullName: 'Jane Smith', email: 'jane@example.com' }, ipAddress: '192.168.1.105', userAgent: 'Firefox 121', outcome: 'success', details: { documentName: 'Compliance Checklist' }, createdAt: '2024-01-15T09:30:00Z' },
  { id: '13', action: 'EXPORT', resourceType: 'AUDIT_LOG', resourceId: null, actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { format: 'csv', dateRange: '2024-01-01 to 2024-01-15' }, createdAt: '2024-01-15T10:00:00Z' },
  { id: '14', action: 'DELETE', resourceType: 'DOCUMENT', resourceId: '99', actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { documentName: 'Old Test Document', reason: 'Cleanup' }, createdAt: '2024-01-15T10:15:00Z' },
  { id: '15', action: 'CREATE', resourceType: 'USER', resourceId: '15', actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { email: 'amanda@example.com', role: 'COMPLIANCE_OFFICER' }, createdAt: '2024-01-14T11:00:00Z' },
  { id: '16', action: 'UPDATE', resourceType: 'USER', resourceId: '13', actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { field: 'status', oldValue: 'ACTIVE', newValue: 'INACTIVE' }, createdAt: '2024-01-10T10:00:00Z' },
  { id: '17', action: 'APPROVE', resourceType: 'KT_REPORT', resourceId: '1', actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { projectName: 'Security Audit Q1', action: 'APPROVED' }, createdAt: '2024-01-15T10:45:00Z' },
  { id: '18', action: 'CREATE', resourceType: 'NOTIFICATION', resourceId: '10', actor: { id: '0', fullName: 'System', email: 'system@example.com' }, ipAddress: '127.0.0.1', userAgent: 'System', outcome: 'success', details: { title: 'Security Patch Released', priority: 'CRITICAL' }, createdAt: '2024-01-15T07:00:00Z' },
  { id: '19', action: 'LOGIN', resourceType: 'USER', resourceId: '2', actor: { id: '2', fullName: 'John Doe', email: 'john@example.com' }, ipAddress: '192.168.1.110', userAgent: 'Chrome 120', outcome: 'success', details: { ip: '192.168.1.110', userAgent: 'Chrome 120' }, createdAt: '2024-01-15T07:45:00Z' },
  { id: '20', action: 'UPLOAD', resourceType: 'DOCUMENT', resourceId: '11', actor: { id: '7', fullName: 'Sarah Johnson', email: 'sarah@example.com' }, ipAddress: '192.168.1.130', userAgent: 'Safari 17', outcome: 'success', details: { documentName: 'Network Security Config' }, createdAt: '2024-01-14T13:00:00Z' },
  { id: '21', action: 'COMMENT', resourceType: 'PROJECT', resourceId: '2', actor: { id: '9', fullName: 'Emily Rodriguez', email: 'emily@example.com' }, ipAddress: '192.168.1.150', userAgent: 'Chrome 120', outcome: 'success', details: { comment: 'Need additional evidence for control 6.2' }, createdAt: '2024-01-14T14:30:00Z' },
  { id: '22', action: 'UPDATE', resourceType: 'COMPLIANCE_CONTROL', resourceId: '5', actor: { id: '3', fullName: 'Jane Smith', email: 'jane@example.com' }, ipAddress: '192.168.1.105', userAgent: 'Firefox 121', outcome: 'success', details: { field: 'status', oldValue: 'NON_COMPLIANT', newValue: 'PARTIAL' }, createdAt: '2024-01-15T11:00:00Z' },
  { id: '23', action: 'VIEW', resourceType: 'DASHBOARD', resourceId: null, actor: { id: '1', fullName: 'Admin User', email: 'admin@example.com' }, ipAddress: '192.168.1.100', userAgent: 'Chrome 120', outcome: 'success', details: { page: 'Dashboard' }, createdAt: '2024-01-15T08:31:00Z' },
  { id: '24', action: 'SEARCH', resourceType: 'DOCUMENT', resourceId: null, actor: { id: '4', fullName: 'Bob Wilson', email: 'bob@example.com' }, ipAddress: '192.168.1.120', userAgent: 'Chrome 120', outcome: 'success', details: { query: 'penetration test', results: 3 }, createdAt: '2024-01-15T09:20:00Z' },
  { id: '25', action: 'LOGOUT', resourceType: 'USER', resourceId: '2', actor: { id: '2', fullName: 'John Doe', email: 'john@example.com' }, ipAddress: '192.168.1.110', userAgent: 'Chrome 120', outcome: 'success', details: { sessionDuration: '1h 30m' }, createdAt: '2024-01-14T19:15:00Z' },
];

// Mock KT Reports (10 KT reports)
const mockKTReports = [
  { id: '1', projectId: '1', projectName: 'Security Audit Q1', author: { id: '2', fullName: 'John Doe' }, date: '2024-01-15', status: 'APPROVED', title: 'Network Scanning Results', content: 'Completed comprehensive network scan of all VLANs. Found 3 open ports requiring review. No critical vulnerabilities detected.', tags: ['network', 'scanning'], reviewedBy: 'Admin User', reviewedAt: '2024-01-15T10:45:00Z' },
  { id: '2', projectId: '2', projectName: 'Compliance Review', author: { id: '7', fullName: 'Sarah Johnson' }, date: '2024-01-15', status: 'SUBMITTED', title: 'ISO 27001 Control Evidence Collection', content: 'Collected evidence for 12 controls. 8 compliant, 2 partial, 2 non-compliant. Need additional documentation for A.12.1 and A.12.2.', tags: ['iso27001', 'evidence'], reviewedBy: null, reviewedAt: null },
  { id: '3', projectId: '3', projectName: 'Penetration Testing', author: { id: '4', fullName: 'Bob Wilson' }, date: '2024-01-14', status: 'APPROVED', title: 'External Pentest - Day 3 Results', content: 'Completed external penetration testing. Found 1 critical (SQLi), 3 high, 5 medium, 8 low. Critical finding in payment portal requires immediate remediation.', tags: ['pentest', 'external', 'critical'], reviewedBy: 'John Doe', reviewedAt: '2024-01-14T17:00:00Z' },
  { id: '4', projectId: '4', projectName: 'Legacy System Migration', author: { id: '4', fullName: 'Bob Wilson' }, date: '2024-01-14', status: 'IN_REVIEW', title: 'Identity Provider Configuration Progress', content: 'Configured 85% of user mappings. 15% remaining require manual intervention due to legacy attribute formats. Migration runbook updated.', tags: ['migration', 'identity', 'idp'], reviewedBy: 'John Doe', reviewedAt: null },
  { id: '5', projectId: '8', projectName: 'Vendor Risk Assessment', author: { id: '8', fullName: 'Mike Chen' }, date: '2024-01-13', status: 'SUBMITTED', title: 'Vendor Questionnaire Responses - Batch 2', content: 'Received responses from 12 of 20 vendors. 3 vendors flagged for high risk due to missing SOC 2 reports. Follow-up emails sent.', tags: ['vendor', 'questionnaire', 'risk'], reviewedBy: null, reviewedAt: null },
  { id: '6', projectId: '9', projectName: 'Data Loss Prevention', author: { id: '10', fullName: 'David Kim' }, date: '2024-01-13', status: 'DRAFT', title: 'DLP Policy Draft - Email Channel', content: 'Drafted DLP policies for email channel covering PII, PCI, and PHI detection. 45 regex patterns defined. Testing phase starts next week.', tags: ['dlp', 'email', 'policy'], reviewedBy: null, reviewedAt: null },
  { id: '7', projectId: '7', projectName: 'Incident Response Plan', author: { id: '4', fullName: 'Bob Wilson' }, date: '2024-01-05', status: 'APPROVED', title: 'Incident Response Plan - Final Version', content: 'Finalized incident response plan with 6-phase methodology. Includes communication templates, escalation matrix, and postmortem procedures. Approved by leadership.', tags: ['incident', 'response', 'plan'], reviewedBy: 'Admin User', reviewedAt: '2024-01-05T10:00:00Z' },
  { id: '8', projectId: '1', projectName: 'Security Audit Q1', author: { id: '7', fullName: 'Sarah Johnson' }, date: '2024-01-12', status: 'APPROVED', title: 'Vulnerability Scan - Internal Network', content: 'Internal vulnerability scan completed. 127 assets scanned. 23 vulnerabilities found (2 critical, 5 high, 16 medium). Remediation tickets created.', tags: ['vulnerability', 'internal', 'scan'], reviewedBy: 'Admin User', reviewedAt: '2024-01-12T18:00:00Z' },
  { id: '9', projectId: '6', projectName: 'Cloud Security Assessment', author: { id: '6', fullName: 'Charlie Davis' }, date: '2024-01-11', status: 'DRAFT', title: 'AWS Security Benchmark - Initial Assessment', content: 'Initial assessment of AWS accounts against CIS benchmarks. 45% compliant, 35% partial, 20% non-compliant. Major gaps in logging and encryption.', tags: ['aws', 'cis', 'benchmark'], reviewedBy: null, reviewedAt: null },
  { id: '10', projectId: '8', projectName: 'Vendor Risk Assessment', author: { id: '9', fullName: 'Emily Rodriguez' }, date: '2024-01-10', status: 'SUBMITTED', title: 'Third Party Risk Register Update', content: 'Updated risk register with 5 new vendors. 2 classified as critical (payment processors), 3 as high (cloud providers). Contracts under legal review.', tags: ['vendor', 'risk', 'register'], reviewedBy: 'Jane Smith', reviewedAt: null },
];

// Mock API implementations
function createMockResponse<T>(data: T) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config: { headers: {} } as any,
  };
}

const mockAuthApi = {
  login: async (email: string, password: string) => {
    if (email === 'admin@dbi.example.com' && password === 'Admin@123') {
      return createMockResponse({ data: { user: mockUser, token: 'mock-token-' + Date.now() } });
    }
    throw new Error('Invalid credentials');
  },
  logout: async () => createMockResponse({ data: { success: true } }),
  me: async () => createMockResponse({ data: mockUser }),
  updateProfile: async (data: any) => createMockResponse({ data: { ...mockUser, ...data } }),
  changePassword: async () => createMockResponse({ data: { success: true } }),
  forgotPassword: async () => createMockResponse({ data: { success: true } }),
};

const mockDashboardApi = {
  getMetrics: async () => createMockResponse(mockMetrics),
  getProjects: async () => createMockResponse(mockProjects),
};

const mockProjectsApi = {
  start: async (_id: string) => createMockResponse({ data: { alreadyStarted: false } }),
  list: async (params?: Record<string, string>) => {
    let items = [...mockProjects.items];
    if (params?.status) {
      items = items.filter(p => p.status === params.status);
    }
    if (params?.search) {
      const search = params.search.toLowerCase();
      items = items.filter(p => p.name.toLowerCase().includes(search) || p.description?.toLowerCase().includes(search));
    }
    return createMockResponse({ items, total: items.length, page: 1, pageSize: items.length });
  },
  get: async (id: string) => createMockResponse(mockProjects.items.find(p => p.id === id)),
  create: async (data: any) => createMockResponse({ ...data, id: String(Date.now()) }),
  update: async (id: string, data: any) => createMockResponse({ ...data, id }),
  delete: async (_id: string) => createMockResponse({ data: { success: true } }),
  getMembers: async (projectId: string) => {
    const project = mockProjects.items.find(p => p.id === projectId);
    const members = [];
    if (project?.owner) members.push({ ...project.owner, role: 'OWNER' });
    if (project?.reviewer) members.push({ ...project.reviewer, role: 'REVIEWER' });
    if (project?.contributors) project.contributors.forEach(c => members.push({ ...c, role: 'CONTRIBUTOR' }));
    return createMockResponse({ data: members });
  },
  addMember: async () => createMockResponse({ data: { success: true } }),
  updateMember: async () => createMockResponse({ data: { success: true } }),
  removeMember: async () => createMockResponse({ data: { success: true } }),
  getTasks: async () => createMockResponse({ data: [] }),
  createTask: async () => createMockResponse({ data: { success: true } }),
  updateTask: async () => createMockResponse({ data: { success: true } }),
  deleteTask: async () => createMockResponse({ data: { success: true } }),
  getMilestones: async () => createMockResponse({ data: [] }),
  createMilestone: async () => createMockResponse({ data: { success: true } }),
  updateMilestone: async () => createMockResponse({ data: { success: true } }),
  completeMilestone: async () => createMockResponse({ data: { success: true } }),
  deleteMilestone: async () => createMockResponse({ data: { success: true } }),
  getKTReports: async (projectId: string) => createMockResponse({ data: mockKTReports.filter(r => r.projectId === projectId) }),
  getKTReport: async (projectId: string, reportId: string) => createMockResponse({ data: mockKTReports.find(r => r.id === reportId && r.projectId === projectId) }),
  createOrUpdateKTReport: async () => createMockResponse({ data: { success: true } }),
  updateKTReport: async () => createMockResponse({ data: { success: true } }),
  approveKTReport: async () => createMockResponse({ data: { success: true } }),
  getMissingKTReports: async () => createMockResponse({ data: [] }),
  getDocuments: async (projectId: string) => createMockResponse({ data: mockDocuments.filter(d => d.projectId === projectId) }),
  getDocument: async (projectId: string, documentId: string) => createMockResponse({ data: mockDocuments.find(d => d.id === documentId && d.projectId === projectId) }),
  getUploadUrl: async () => createMockResponse({ data: { uploadUrl: 'https://mock-s3.example.com/upload' } }),
  createDocument: async () => createMockResponse({ data: { success: true } }),
  downloadDocument: async () => createMockResponse({ data: { success: true } }),
  previewDocument: async () => createMockResponse({ data: { success: true } }),
  deleteDocument: async () => createMockResponse({ data: { success: true } }),
};

const mockUsersApi = {
  directory: async (_params?: Record<string, string>) => createMockResponse({ items: [] as { id: string; fullName: string; email: string }[] }),
  list: async (params?: Record<string, string>) => {
    let items = [...mockUsers];
    if (params?.status) {
      items = items.filter(u => u.status === params.status);
    }
    if (params?.role) {
      items = items.filter(u => u.role === params.role);
    }
    if (params?.search) {
      const search = params.search.toLowerCase();
      items = items.filter(u => u.fullName.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
    }
    return createMockResponse({ items, total: items.length, page: 1, pageSize: items.length });
  },
  get: async (id: string) => createMockResponse({ data: mockUsers.find(u => u.id === id) }),
  create: async (data: any) => createMockResponse({ data: { ...data, id: String(Date.now()) } }),
  update: async (id: string, data: any) => createMockResponse({ data: { ...data, id } }),
  delete: async (_id: string) => createMockResponse({ data: { success: true } }),
  getProjects: async (userId: string) => createMockResponse({ data: mockProjects.items.filter(p => p.owner?.email === mockUsers.find(u => u.id === userId)?.email) }),
};

const mockRolesApi = {
  list: async (_params?: Record<string, string>) => createMockResponse({ data: mockRoles, total: mockRoles.length, page: 1, pageSize: mockRoles.length }),
  getPermissions: async () => createMockResponse({ data: [] }),
  get: async (id: string) => createMockResponse({ data: mockRoles.find(r => r.id === id) }),
  create: async (data: any) => createMockResponse({ data: { ...data, id: String(Date.now()) } }),
  update: async (id: string, data: any) => createMockResponse({ data: { ...data, id } }),
  delete: async (_id: string) => createMockResponse({ data: { success: true } }),
  assign: async () => createMockResponse({ data: { success: true } }),
  unassign: async () => createMockResponse({ data: { success: true } }),
};

const mockComplianceApi = {
  list: async (params?: Record<string, string>) => {
    let items = [...mockComplianceControls];
    if (params?.framework) {
      items = items.filter(c => c.framework === params.framework);
    }
    if (params?.status) {
      items = items.filter(c => c.status === params.status);
    }
    if (params?.search) {
      const search = params.search.toLowerCase();
      items = items.filter(c => c.name.toLowerCase().includes(search));
    }
    return createMockResponse({ items, total: items.length, page: 1, pageSize: items.length });
  },
  getControls: async (params?: Record<string, string>) => {
    let items = [...mockComplianceControls];
    if (params?.framework) {
      items = items.filter(c => c.framework === params.framework);
    }
    if (params?.status) {
      items = items.filter(c => c.status === params.status);
    }
    if (params?.search) {
      const search = params.search.toLowerCase();
      items = items.filter(c => c.name.toLowerCase().includes(search));
    }
    return createMockResponse({ items, total: items.length, page: 1, pageSize: items.length });
  },
  getControl: async (id: string) => createMockResponse({ data: mockComplianceControls.find(c => c.id === id) }),
  createControl: async (data: any) => createMockResponse({ data: { ...data, id: String(Date.now()) } }),
  updateControl: async (id: string, data: any) => createMockResponse({ data: { ...data, id } }),
  deleteControl: async () => createMockResponse({ data: { success: true } }),
  delete: async (_id: string) => createMockResponse({ data: { success: true } }),
  createRemediationTask: async () => createMockResponse({ data: { success: true } }),
  updateRemediationTask: async () => createMockResponse({ data: { success: true } }),
};

const mockDocumentsApi = {
  createKtPack: async (_projectId: string, _body: { kind: 'images' | 'documents'; types?: string[] }) => createMockResponse({ items: [] as any[] }),
  timeline: async (_projectId: string) => createMockResponse({ items: [] as any[] }),
  list: async (params?: Record<string, string>) => {
    let items = [...mockDocuments];
    if (params?.projectId) {
      items = items.filter(d => d.projectId === params.projectId);
    }
    if (params?.status) {
      items = items.filter(d => d.status === params.status);
    }
    if (params?.search) {
      const search = params.search.toLowerCase();
      items = items.filter(d => d.name.toLowerCase().includes(search));
    }
    // Transform mock data to match component expectations
    const transformedItems = items.map(doc => {
      const project = mockProjects.items.find(p => p.id === doc.projectId);
      return {
        ...doc,
        type: doc.fileType,
        size: doc.fileSize,
        uploadedBy: { fullName: doc.owner },
        project: project ? { id: project.id, name: project.name } : null,
        url: `https://mock-s3.example.com/${doc.name.replace(/\s+/g, '_')}.${doc.fileType}`,
        description: `${doc.name} - ${doc.tags?.join(', ') || 'No description'}`,
      };
    });
    return createMockResponse({ items: transformedItems, total: transformedItems.length, page: 1, pageSize: transformedItems.length });
  },
  get: async (id: string) => {
    const doc = mockDocuments.find(d => d.id === id);
    if (!doc) return createMockResponse({ data: null });
    const project = mockProjects.items.find(p => p.id === doc.projectId);
    const transformed = {
      ...doc,
      type: doc.fileType,
      size: doc.fileSize,
      uploadedBy: { fullName: doc.owner },
      project: project ? { id: project.id, name: project.name } : null,
      url: `https://mock-s3.example.com/${doc.name.replace(/\s+/g, '_')}.${doc.fileType}`,
      description: `${doc.name} - ${doc.tags?.join(', ') || 'No description'}`,
    };
    return createMockResponse({ data: transformed });
  },
  create: async (data: any) => {
    const newDoc = { ...data, id: String(Date.now()) };
    // Ensure transformed fields exist
    if (newDoc.fileType && !newDoc.type) newDoc.type = newDoc.fileType;
    if (newDoc.fileSize && !newDoc.size) newDoc.size = newDoc.fileSize;
    if (newDoc.owner && !newDoc.uploadedBy) newDoc.uploadedBy = { fullName: newDoc.owner };
    if (newDoc.projectId && !newDoc.project) {
      const project = mockProjects.items.find(p => p.id === newDoc.projectId);
      newDoc.project = project ? { id: project.id, name: project.name } : null;
    }
    if (!newDoc.url) newDoc.url = `https://mock-s3.example.com/${newDoc.name?.replace(/\s+/g, '_')}.${newDoc.fileType || 'pdf'}`;
    if (!newDoc.description) newDoc.description = `${newDoc.name} - ${newDoc.tags?.join(', ') || 'No description'}`;
    return createMockResponse({ data: newDoc });
  },
  update: async (id: string, data: any) => {
    const updatedDoc = { ...data, id };
    // Ensure transformed fields exist
    if (updatedDoc.fileType && !updatedDoc.type) updatedDoc.type = updatedDoc.fileType;
    if (updatedDoc.fileSize && !updatedDoc.size) updatedDoc.size = updatedDoc.fileSize;
    if (updatedDoc.owner && !updatedDoc.uploadedBy) updatedDoc.uploadedBy = { fullName: updatedDoc.owner };
    if (updatedDoc.projectId && !updatedDoc.project) {
      const project = mockProjects.items.find(p => p.id === updatedDoc.projectId);
      updatedDoc.project = project ? { id: project.id, name: project.name } : null;
    }
    if (!updatedDoc.url) updatedDoc.url = `https://mock-s3.example.com/${updatedDoc.name?.replace(/\s+/g, '_')}.${updatedDoc.fileType || 'pdf'}`;
    if (!updatedDoc.description) updatedDoc.description = `${updatedDoc.name} - ${updatedDoc.tags?.join(', ') || 'No description'}`;
    return createMockResponse({ data: updatedDoc });
  },
  delete: async (_id: string) => createMockResponse({ data: { success: true } }),
  getUploadUrl: async () => createMockResponse({ data: { uploadUrl: 'https://mock-s3.example.com/upload' } }),
  upload: async (data: { file: File; projectId?: string; name: string; description: string; type: string }) => {
    const project = data.projectId ? mockProjects.items.find(p => p.id === data.projectId) : null;
    const newDoc = {
      id: String(Date.now()),
      name: data.name,
      projectId: data.projectId || '',
      projectName: project?.name || 'Unknown',
      fileType: data.type,
      fileSize: data.file.size,
      createdAt: new Date().toISOString(),
      owner: 'Current User',
      tags: [],
      status: 'UPLOADED',
      url: 'https://mock-s3.example.com/' + data.file.name,
      // Include transformed fields for immediate use
      type: data.type,
      size: data.file.size,
      uploadedBy: { fullName: 'Current User' },
      project: project ? { id: project.id, name: project.name } : null,
      description: data.description || `${data.name} - Uploaded document`,
    };
    mockDocuments.unshift(newDoc);
    return createMockResponse({ data: newDoc });
  },
  downloadDocument: async () => createMockResponse({ data: { success: true } }),
  previewDocument: async () => createMockResponse({ data: { success: true } }),
  getVersions: async (documentId: string) => {
    // Mock version history
    const versions = [
      { id: `v-${documentId}-3`, version: 3, size: 1024000, createdAt: '2024-01-15T10:00:00Z', uploader: { fullName: 'Admin User' }, storageKey: `doc-${documentId}-v3` },
      { id: `v-${documentId}-2`, version: 2, size: 1024000, createdAt: '2024-01-14T15:30:00Z', uploader: { fullName: 'John Doe' }, storageKey: `doc-${documentId}-v2` },
      { id: `v-${documentId}-1`, version: 1, size: 1024000, createdAt: '2024-01-13T09:00:00Z', uploader: { fullName: 'Jane Smith' }, storageKey: `doc-${documentId}-v1` },
    ];
    return createMockResponse({ items: versions, total: versions.length });
  },
  getDiff: async (_documentId: string, _version: number) => {
    // Mock diff data
    const changes = [
      { added: false, removed: false, value: 'Security Policy v2.1\n' },
      { added: false, removed: false, value: '==================\n\n' },
      { added: false, removed: true, value: 'Version 2.0 - Previous content\n' },
      { added: true, removed: false, value: 'Version 2.1 - Updated content\n' },
      { added: false, removed: false, value: '\n1. Purpose\n' },
      { added: false, removed: false, value: 'This document outlines the security policies...' },
      { added: true, removed: false, value: '\n2. New Section Added in v2.1\n' },
      { added: true, removed: false, value: 'Additional compliance requirements...\n' },
    ];
    return createMockResponse({
      oldContent: 'Previous version content...',
      newContent: 'Current version content...',
      changes
    });
  },
  rollback: async (_documentId: string, version: number, _reason?: string) => {
    return createMockResponse({ data: { success: true, message: `Rolled back to version ${version}` } });
  },
  submitReview: async (documentId: string, reviewerId: string) => {
    const doc = mockDocuments.find(d => d.id === documentId);
    if (!doc) return createMockResponse({ data: null });
    doc.status = 'PENDING_REVIEW';
    doc.reviewStatus = 'PENDING';
    doc.reviewerId = reviewerId;
    const reviewer = mockUsers.find(u => u.id === reviewerId);
    return createMockResponse({
      data: {
        ...doc,
        reviewer: reviewer ? { id: reviewer.id, fullName: reviewer.fullName, email: reviewer.email } : null,
      }
    });
  },
  reviewDocument: async (documentId: string, status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED', comments?: string) => {
    const doc = mockDocuments.find(d => d.id === documentId);
    if (!doc) return createMockResponse({ data: null });
    doc.reviewStatus = status;
    doc.reviewedAt = new Date().toISOString() as any;
    doc.reviewComments = comments as any;
    doc.status = status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'DRAFT';
    return createMockResponse({
      data: {
        id: doc.id,
        name: doc.name,
        status: doc.status,
        reviewStatus: doc.reviewStatus,
        reviewedAt: doc.reviewedAt,
        reviewComments: doc.reviewComments,
      }
    });
  },
  getReviews: async (_documentId: string) => {
    // Mock reviews - return empty array for now
    return createMockResponse({ items: [], total: 0 });
  },
  // Document sharing endpoints
  getShares: async (documentId: string) => {
    const shares = [
      { id: 's1', documentId, userId: '2', userName: 'Jane Smith', userEmail: 'jane@example.com', permission: 'VIEW', sharedAt: '2024-01-10T10:00:00Z', sharedBy: 'Admin User' },
      { id: 's2', documentId, userId: '3', userName: 'John Doe', userEmail: 'john@example.com', permission: 'EDIT', sharedAt: '2024-01-12T14:30:00Z', sharedBy: 'Admin User' },
    ];
    return createMockResponse({ items: shares, total: shares.length });
  },
  share: async (documentId: string, data: { userId: string; permission: 'VIEW' | 'EDIT' | 'DOWNLOAD' | 'COMMENT' | 'FULL' }) => {
    const newShare = { id: `s${Date.now()}`, documentId, ...data, sharedAt: new Date().toISOString(), sharedBy: 'Current User' };
    return createMockResponse({ data: newShare });
  },
  unshare: async (_documentId: string, _shareId: string) => createMockResponse({ data: { success: true } }),
  updateSharePermission: async (_documentId: string, _shareId: string, permission: 'VIEW' | 'EDIT' | 'DOWNLOAD' | 'COMMENT' | 'FULL') => createMockResponse({ data: { success: true, shareId: _shareId, permission } }),
  getDocumentActivity: async (_documentId: string) => createMockResponse({ data: { totalAccesses: 0, uniqueUsers: 0, actionCounts: {}, recentEvents: [] } }),
  // Access analytics endpoints
  getAccessAnalytics: async (params: Record<string, string>) => {
    const mockEvents = [
      { id: 'ae1', documentId: '1', documentName: 'Security Policy v2.1', userId: '2', userName: 'Jane Smith', userEmail: 'jane@example.com', action: 'VIEW', timestamp: new Date(Date.now() - 3600000).toISOString(), ipAddress: '192.168.1.100', userAgent: 'Mozilla/5.0', location: 'San Francisco, CA', duration: 300, watermarkApplied: true },
      { id: 'ae2', documentId: '1', documentName: 'Security Policy v2.1', userId: '2', userName: 'Jane Smith', userEmail: 'jane@example.com', action: 'DOWNLOAD', timestamp: new Date(Date.now() - 7200000).toISOString(), ipAddress: '192.168.1.100', userAgent: 'Mozilla/5.0', location: 'San Francisco, CA', duration: 45, watermarkApplied: true },
      { id: 'ae3', documentId: '1', documentName: 'Security Policy v2.1', userId: '3', userName: 'John Doe', userEmail: 'john@example.com', action: 'VIEW', timestamp: new Date(Date.now() - 10800000).toISOString(), ipAddress: '10.0.0.50', userAgent: 'Mozilla/5.0', location: 'New York, NY', duration: 180, watermarkApplied: true },
      { id: 'ae4', documentId: '2', documentName: 'Compliance Framework', userId: '4', userName: 'Alice Brown', userEmail: 'alice@example.com', action: 'EDIT', timestamp: new Date(Date.now() - 14400000).toISOString(), ipAddress: '172.16.0.25', userAgent: 'Mozilla/5.0', location: 'London, UK', duration: 600, watermarkApplied: false },
      { id: 'ae5', documentId: '1', documentName: 'Security Policy v2.1', userId: '5', userName: 'Bob Wilson', userEmail: 'bob@example.com', action: 'SHARE', timestamp: new Date(Date.now() - 18000000).toISOString(), ipAddress: '192.168.1.200', userAgent: 'Mozilla/5.0', location: 'Austin, TX', duration: 30, watermarkApplied: false },
      { id: 'ae6', documentId: '3', documentName: 'Incident Response Plan', userId: '2', userName: 'Jane Smith', userEmail: 'jane@example.com', action: 'PREVIEW', timestamp: new Date(Date.now() - 21600000).toISOString(), ipAddress: '192.168.1.100', userAgent: 'Mozilla/5.0', location: 'San Francisco, CA', duration: 120, watermarkApplied: true },
      { id: 'ae7', documentId: '1', documentName: 'Security Policy v2.1', userId: '3', userName: 'John Doe', userEmail: 'john@example.com', action: 'COMMENT', timestamp: new Date(Date.now() - 25200000).toISOString(), ipAddress: '10.0.0.50', userAgent: 'Mozilla/5.0', location: 'New York, NY', duration: 60, watermarkApplied: false },
      { id: 'ae8', documentId: '2', documentName: 'Compliance Framework', userId: '6', userName: 'Carol White', userEmail: 'carol@example.com', action: 'VIEW', timestamp: new Date(Date.now() - 28800000).toISOString(), ipAddress: '192.168.1.150', userAgent: 'Mozilla/5.0', location: 'Seattle, WA', duration: 240, watermarkApplied: true },
    ];
    let items = [...mockEvents];
    if (params.documentId) items = items.filter(e => e.documentId === params.documentId);
    if (params.projectId) items = items.filter(e => e.documentId.startsWith(params.projectId));
    const totalViews = items.filter(e => e.action === 'VIEW').length;
    const totalDownloads = items.filter(e => e.action === 'DOWNLOAD').length;
    const uniqueUsers = new Set(items.map(e => e.userId)).size;
    const avgDuration = items.filter(e => e.duration).reduce((sum, e) => sum + (e.duration || 0), 0) / items.filter(e => e.duration).length || 0;
    const anomalyCount = 1; // Mock anomaly
    const summary = { totalViews, totalDownloads, uniqueUsers, avgDuration: Math.round(avgDuration), anomalyCount };
    return createMockResponse({ items, total: items.length, summary });
  },
  exportAccessLog: async (_params: { documentId?: string; projectId?: string; timeRange?: string; format: string }) => {
    const csv = 'id,documentId,documentName,userId,userName,userEmail,action,timestamp,ipAddress,location,duration,watermarkApplied\n' +
      'ae1,1,Security Policy v2.1,2,Jane Smith,jane@example.com,VIEW,2024-01-15T10:00:00Z,192.168.1.100,San Francisco CA,300,true\n' +
      'ae2,1,Security Policy v2.1,2,Jane Smith,jane@example.com,DOWNLOAD,2024-01-15T09:00:00Z,192.168.1.100,San Francisco CA,45,true\n';
    return createMockResponse(new Blob([csv], { type: 'text/csv' }));
  },
  // Admin monitoring endpoint
  getAdminMonitoring: async (params: Record<string, string>) => {
    const mockEvents = [
      { id: 'am1', documentId: '1', documentName: 'Security Policy v2.1', projectId: '1', projectName: 'Security Audit Q1', userId: '2', userName: 'Jane Smith', userEmail: 'jane@example.com', action: 'DOWNLOAD', timestamp: new Date(Date.now() - 60000).toISOString(), ipAddress: '192.168.1.100', userAgent: 'Mozilla/5.0', location: 'San Francisco, CA', severity: 'CRITICAL', flags: ['MASS_DOWNLOAD', 'AFTER_HOURS', 'ANOMALY_DETECTED'], metadata: { fileSize: 2048000 } },
      { id: 'am2', documentId: '2', documentName: 'Compliance Framework', projectId: '2', projectName: 'Compliance Review', userId: '3', userName: 'John Doe', userEmail: 'john@example.com', action: 'VIEW', timestamp: new Date(Date.now() - 120000).toISOString(), ipAddress: '10.0.0.50', userAgent: 'Mozilla/5.0', location: 'New York, NY', severity: 'INFO', flags: [], metadata: {} },
      { id: 'am3', documentId: '3', documentName: 'Incident Response Plan', projectId: '7', projectName: 'Security Operations', userId: '4', userName: 'Alice Brown', userEmail: 'alice@example.com', action: 'SHARE', timestamp: new Date(Date.now() - 180000).toISOString(), ipAddress: '172.16.0.25', userAgent: 'Mozilla/5.0', location: 'London, UK', severity: 'WARNING', flags: ['EXTERNAL_SHARE', 'SENSITIVE_DOCUMENT'], metadata: { sharedWith: ['external@partner.com'] } },
      { id: 'am4', documentId: '1', documentName: 'Security Policy v2.1', projectId: '1', projectName: 'Security Audit Q1', userId: '5', userName: 'Bob Wilson', userEmail: 'bob@example.com', action: 'DELETE', timestamp: new Date(Date.now() - 240000).toISOString(), ipAddress: '192.168.1.200', userAgent: 'Mozilla/5.0', location: 'Austin, TX', severity: 'CRITICAL', flags: ['DOCUMENT_DELETED', 'UNAUTHORIZED_ATTEMPT'], metadata: { recovered: true } },
      { id: 'am5', documentId: '4', documentName: 'Vendor Assessment Report', projectId: '8', projectName: 'Vendor Risk Mgmt', userId: '6', userName: 'Carol White', userEmail: 'carol@example.com', action: 'EDIT', timestamp: new Date(Date.now() - 300000).toISOString(), ipAddress: '192.168.1.150', userAgent: 'Mozilla/5.0', location: 'Seattle, WA', severity: 'INFO', flags: [], metadata: { changes: 15 } },
    ];
    let items = [...mockEvents];
    if (params.timeRange) {
      // Filter by time range (simplified)
      const now = Date.now();
      const rangeMs = params.timeRange === '5m' ? 300000 : params.timeRange === '15m' ? 900000 : params.timeRange === '1h' ? 3600000 : params.timeRange === '6h' ? 21600000 : 86400000;
      items = items.filter(e => now - new Date(e.timestamp).getTime() < rangeMs);
    }
    const summary = {
      totalEvents: items.length,
      criticalCount: items.filter(e => e.severity === 'CRITICAL').length,
      warningCount: items.filter(e => e.severity === 'WARNING').length,
      uniqueUsers: new Set(items.map(e => e.userId)).size,
      uniqueDocuments: new Set(items.map(e => e.documentId)).size,
    };
    return createMockResponse({ items, total: items.length, summary });
  },
};

const mockNotificationsApi = {
  list: async (params?: Record<string, string>) => {
    let items = [...mockNotifications];
    if (params?.userId) {
      items = items.filter(n => n.userId === params.userId);
    }
    if (params?.read !== undefined) {
      items = items.filter(n => n.read === (params.read === 'true'));
    }
    if (params?.type) {
      items = items.filter(n => n.type === params.type);
    }
    return createMockResponse({ items, total: items.length, page: 1, pageSize: items.length });
  },
  getUnreadCount: async (userId?: string) => {
    const items = userId ? mockNotifications.filter(n => n.userId === userId && !n.read) : mockNotifications.filter(n => !n.read);
    return createMockResponse({ data: { count: items.length } });
  },
  markAsRead: async (_id: string) => createMockResponse({ data: { success: true } }),
  markAllAsRead: async (_userId?: string) => createMockResponse({ data: { success: true } }),
  delete: async (_id: string) => createMockResponse({ data: { success: true } }),
};

const mockAuditLogsApi = {
  list: async (params?: Record<string, string>) => {
    let items = [...mockAuditLogs];
    if (params?.action) {
      items = items.filter(a => a.action === params.action);
    }
    if (params?.resourceType) {
      items = items.filter(a => a.resourceType === params.resourceType);
    }
    if (params?.outcome) {
      items = items.filter(a => a.outcome === params.outcome);
    }
    if (params?.search) {
      const search = params.search.toLowerCase();
      items = items.filter(a => a.actor?.fullName?.toLowerCase().includes(search) || JSON.stringify(a.details).toLowerCase().includes(search));
    }
    if (params?.page) {
      const page = parseInt(params.page, 10);
      const pageSize = parseInt(params.limit || '20', 10);
      const start = (page - 1) * pageSize;
      items = items.slice(start, start + pageSize);
    }
    return createMockResponse({ items, total: mockAuditLogs.length, page: 1, pageSize: items.length });
  },
  export: async (params?: Record<string, string>) => {
    let items = [...mockAuditLogs];
    if (params?.action) {
      items = items.filter(a => a.action === params.action);
    }
    if (params?.resourceType) {
      items = items.filter(a => a.resourceType === params.resourceType);
    }
    if (params?.outcome) {
      items = items.filter(a => a.outcome === params.outcome);
    }
    const csv = 'id,action,resourceType,resourceId,actor,details,createdAt\n' +
      items.map(a => `${a.id},${a.action},${a.resourceType},${a.resourceId},${a.actor?.fullName || ''},"${JSON.stringify(a.details)}",${a.createdAt}`).join('\n');
    return createMockResponse(new Blob([csv], { type: 'text/csv' }));
  },
  getStats: async () => createMockResponse({ data: { total: mockAuditLogs.length, byAction: { LOGIN: 5, CREATE: 4, UPDATE: 5, APPROVE: 3, COMPLETE: 1, SUBMIT: 2, VIEW: 3, ASSIGN: 1, DOWNLOAD: 1, EXPORT: 1, DELETE: 1, UPLOAD: 1, COMMENT: 1, SEARCH: 1, LOGOUT: 1 }, byResource: { USER: 5, PROJECT: 3, KT_REPORT: 3, DOCUMENT: 4, TASK: 1, COMPLIANCE_CONTROL: 2, NOTIFICATION: 1, AUDIT_LOG: 1, DASHBOARD: 1 } } }),
  // Activity feed endpoints
  getActivityFeed: async (params: Record<string, string>) => {
    const limit = parseInt(params.limit || '50', 10);
    const page = parseInt(params.page || '1', 10);
    const mockEvents = [
      { id: 'af1', timestamp: new Date(Date.now() - 60000).toISOString(), userId: '2', userName: 'Jane Smith', userEmail: 'jane@example.com', userRole: 'Auditor', action: 'VIEW', resourceType: 'DOCUMENT', resourceId: '1', resourceName: 'Security Policy v2.1', projectId: '1', projectName: 'Security Audit Q1', details: { page: 5, duration: 120 }, severity: 'INFO', tags: ['policy', 'security'] },
      { id: 'af2', timestamp: new Date(Date.now() - 120000).toISOString(), userId: '3', userName: 'John Doe', userEmail: 'john@example.com', userRole: 'Developer', action: 'DOWNLOAD', resourceType: 'DOCUMENT', resourceId: '1', resourceName: 'Security Policy v2.1', projectId: '1', projectName: 'Security Audit Q1', details: { fileSize: 2048000 }, severity: 'CRITICAL', tags: ['policy', 'download', 'sensitive'] },
      { id: 'af3', timestamp: new Date(Date.now() - 180000).toISOString(), userId: '4', userName: 'Alice Brown', userEmail: 'alice@example.com', userRole: 'Manager', action: 'CREATE', resourceType: 'PROJECT', resourceId: '11', resourceName: 'New Compliance Initiative', projectId: '11', projectName: 'New Compliance Initiative', details: { template: 'ISO27001' }, severity: 'INFO', tags: ['project', 'compliance'] },
      { id: 'af4', timestamp: new Date(Date.now() - 240000).toISOString(), userId: '5', userName: 'Bob Wilson', userEmail: 'bob@example.com', userRole: 'Admin', action: 'SHARE', resourceType: 'DOCUMENT', resourceId: '2', resourceName: 'Compliance Framework', projectId: '2', projectName: 'Compliance Review', details: { sharedWith: ['external@partner.com'], permission: 'VIEW' }, severity: 'WARNING', tags: ['share', 'external'] },
      { id: 'af5', timestamp: new Date(Date.now() - 300000).toISOString(), userId: '6', userName: 'Carol White', userEmail: 'carol@example.com', userRole: 'Analyst', action: 'UPDATE', resourceType: 'KT_REPORT', resourceId: '1', resourceName: 'Weekly Security KT', projectId: '1', projectName: 'Security Audit Q1', details: { section: 'Findings', changes: 3 }, severity: 'INFO', tags: ['kt-report', 'update'] },
      { id: 'af6', timestamp: new Date(Date.now() - 360000).toISOString(), userId: '2', userName: 'Jane Smith', userEmail: 'jane@example.com', userRole: 'Auditor', action: 'APPROVE', resourceType: 'COMPLIANCE_CONTROL', resourceId: 'cc-1', resourceName: 'Access Control Policy', projectId: '1', projectName: 'Security Audit Q1', details: { evidence: 'Documented procedures' }, severity: 'INFO', tags: ['compliance', 'approval'] },
      { id: 'af7', timestamp: new Date(Date.now() - 420000).toISOString(), userId: '3', userName: 'John Doe', userEmail: 'john@example.com', userRole: 'Developer', action: 'DELETE', resourceType: 'DOCUMENT', resourceId: '5', resourceName: 'Old Vendor List', projectId: '8', projectName: 'Vendor Risk Mgmt', details: { reason: 'Outdated' }, severity: 'WARNING', tags: ['delete', 'cleanup'] },
      { id: 'af8', timestamp: new Date(Date.now() - 480000).toISOString(), userId: '4', userName: 'Alice Brown', userEmail: 'alice@example.com', userRole: 'Manager', action: 'LOGIN', resourceType: 'USER', resourceId: '4', resourceName: 'Alice Brown', details: { ip: '172.16.0.25', location: 'London, UK' }, severity: 'INFO', tags: ['auth', 'login'] },
    ];
    let items = [...mockEvents];
    if (params.timeRange) {
      const now = Date.now();
      const rangeMs = params.timeRange === '1m' ? 60000 : params.timeRange === '5m' ? 300000 : params.timeRange === '15m' ? 900000 : params.timeRange === '1h' ? 3600000 : params.timeRange === '6h' ? 21600000 : 86400000;
      items = items.filter(e => now - new Date(e.timestamp).getTime() < rangeMs);
    }
    if (params.documentId) items = items.filter(e => e.resourceId === params.documentId && e.resourceType === 'DOCUMENT');
    if (params.projectId) items = items.filter(e => e.projectId === params.projectId);
    if (params.userId) items = items.filter(e => e.userId === params.userId);
    const start = (page - 1) * limit;
    const paginatedItems = items.slice(start, start + limit);
    return createMockResponse({ items: paginatedItems, total: items.length, page, pageSize: limit });
  },
  getActions: async () => createMockResponse({ data: { items: ['CREATE', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'UPLOAD', 'APPROVE', 'REJECT', 'SUBMIT', 'ASSIGN', 'COMMENT', 'SHARE', 'UNSHARE', 'PERMISSION_CHANGE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'PREVIEW'] } }),
  getResourceTypes: async () => createMockResponse({ data: { items: ['DOCUMENT', 'PROJECT', 'KT_REPORT', 'USER', 'COMPLIANCE_CONTROL', 'TASK', 'NOTIFICATION', 'AUDIT_LOG', 'DASHBOARD', 'KNOWLEDGE_BOOK'] } }),
};

const mockKTReportsApi = {
  list: async (params?: Record<string, string>) => {
    let items = [...mockKTReports];
    if (params?.projectId) {
      items = items.filter(r => r.projectId === params.projectId);
    }
    if (params?.status) {
      items = items.filter(r => r.status === params.status);
    }
    return createMockResponse({ items, total: items.length, page: 1, pageSize: items.length });
  },
  get: async (id: string) => createMockResponse({ data: mockKTReports.find(r => r.id === id) }),
  create: async (data: any) => createMockResponse({ data: { ...data, id: String(Date.now()) } }),
  update: async (id: string, data: any) => createMockResponse({ data: { ...data, id } }),
  approve: async (_id: string, _action: string) => createMockResponse({ data: { success: true } }),
  delete: async (_id: string) => createMockResponse({ data: { success: true } }),
};

const mockKnowledgeBooksApi = {
  list: async (params?: Record<string, string>) => {
    let items = [...mockKnowledgeBooks];
    if (params?.search) {
      const search = params.search.toLowerCase();
      items = items.filter(b => b.name.toLowerCase().includes(search) || b.description.toLowerCase().includes(search));
    }
    if (params?.status) {
      items = items.filter(b => b.status === params.status);
    }
    const page = parseInt(params?.page || '1', 10);
    const limit = parseInt(params?.limit || '10', 10);
    const start = (page - 1) * limit;
    const paginatedItems = items.slice(start, start + limit);
    return createMockResponse({ items: paginatedItems, total: items.length, page, pageSize: limit });
  },
  get: async (id: string) => createMockResponse({ data: mockKnowledgeBooks.find(b => b.id === id) }),
  create: async (data: any) => {
    const newBook = { ...data, id: String(Date.now()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    mockKnowledgeBooks.unshift(newBook);
    return createMockResponse({ data: newBook });
  },
  update: async (id: string, data: any) => {
    const index = mockKnowledgeBooks.findIndex(b => b.id === id);
    if (index !== -1) {
      mockKnowledgeBooks[index] = { ...mockKnowledgeBooks[index], ...data, updatedAt: new Date().toISOString() };
    }
    return createMockResponse({ data: mockKnowledgeBooks[index] });
  },
  delete: async (_id: string) => createMockResponse({ data: { success: true } }),
  generatePdf: async (id: string) => {
    // Generate a simple PDF blob for mock mode
    const book = mockKnowledgeBooks.find(b => b.id === id);
    const content = `Knowledge Book: ${book?.name || 'Unknown'}\n\nDescription: ${book?.description || ''}\n\nTags: ${book?.tags?.join(', ') || ''}\n\nStatus: ${book?.status || 'DRAFT'}\n\nGenerated on: ${new Date().toISOString()}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    return createMockResponse(blob);
  },
  getStats: async () => createMockResponse({ data: { totalBooks: mockKnowledgeBooks.length, publishedBooks: mockKnowledgeBooks.filter(b => b.status === 'PUBLISHED').length, totalDocuments: 47, totalDownloads: 1234, activeProjects: 5, topContributors: [{ name: 'Jane Smith', count: 5 }, { name: 'John Doe', count: 3 }, { name: 'Alice Brown', count: 2 }], recentActivity: [{ action: 'Published', book: 'Security Policy v2.1', user: 'Jane Smith', time: '2 hours ago' }, { action: 'Created', book: 'Incident Response Guide', user: 'John Doe', time: '5 hours ago' }, { action: 'Updated', book: 'Compliance Framework', user: 'Alice Brown', time: '1 day ago' }] } }),
  exportReport: async (params: { format: string }) => {
    const content = `Knowledge Repository Report\n========================\n\nTotal Books: ${mockKnowledgeBooks.length}\nPublished: ${mockKnowledgeBooks.filter(b => b.status === 'PUBLISHED').length}\nTotal Documents: 47\nTotal Downloads: 1234\nActive Projects: 5\n\nGenerated: ${new Date().toISOString()}`;
    const blob = new Blob([content], { type: params.format === 'pdf' ? 'application/pdf' : 'text/csv' });
    return createMockResponse(blob);
  },
};

// Export mock APIs when in mock mode
export const authApi = MOCK_MODE ? mockAuthApi : {
  login: (email: string, password: string) => api.post('/v1/auth/login', { email, password }),
  logout: () => api.post('/v1/auth/logout'),
  me: () => api.get('/v1/auth/me'),
  updateProfile: (data: { fullName?: string; department?: string | null }) => api.patch('/v1/auth/me', data),
  changePassword: (currentPassword: string, newPassword: string) => api.post('/v1/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email: string) => api.post('/v1/auth/forgot-password', { email }),
};

export const dashboardApi = MOCK_MODE ? mockDashboardApi : {
  getMetrics: (params?: Record<string, string>) => api.get('/v1/dashboard/metrics', { params }),
  getProjects: (params?: Record<string, string>) => api.get('/v1/dashboard/projects', { params }),
};

export const projectsApi = MOCK_MODE ? mockProjectsApi : {
  list: (params?: Record<string, string>) => api.get('/v1/projects', { params }),
  // pages read the project straight from response.data; the API wraps it as { success, data }
  get: async (id: string): Promise<any> => {
    const res = await api.get(`/v1/projects/${id}`);
    return { ...res, data: res.data?.data ?? res.data };
  },
  create: (data: any) => api.post('/v1/projects', data),
  start: (id: string) => api.post(`/v1/projects/${id}/start`),
  update: (id: string, data: any) => api.patch(`/v1/projects/${id}`, data),
  delete: (id: string) => api.delete(`/v1/projects/${id}`),
  getMembers: (projectId: string) => api.get(`/v1/projects/${projectId}/members`),
  addMember: (projectId: string, data: { userId: string; role: string }) => api.post(`/v1/projects/${projectId}/members`, data),
  updateMember: (projectId: string, memberId: string, data: { role: string }) => api.patch(`/v1/projects/${projectId}/members/${memberId}`, data),
  removeMember: (projectId: string, memberId: string) => api.delete(`/v1/projects/${projectId}/members/${memberId}`),
  getTasks: (projectId: string, params?: Record<string, string>) => api.get(`/v1/projects/${projectId}/tasks`, { params }),
  createTask: (projectId: string, data: any) => api.post(`/v1/projects/${projectId}/tasks`, data),
  updateTask: (projectId: string, taskId: string, data: any) => api.patch(`/v1/projects/${projectId}/tasks/${taskId}`, data),
  deleteTask: (projectId: string, taskId: string) => api.delete(`/v1/projects/${projectId}/tasks/${taskId}`),
  getMilestones: (projectId: string) => api.get(`/v1/projects/${projectId}/milestones`),
  createMilestone: (projectId: string, data: any) => api.post(`/v1/projects/${projectId}/milestones`, data),
  updateMilestone: (projectId: string, milestoneId: string, data: any) => api.patch(`/v1/projects/${projectId}/milestones/${milestoneId}`, data),
  completeMilestone: (projectId: string, milestoneId: string) => api.post(`/v1/projects/${projectId}/milestones/${milestoneId}/complete`),
  deleteMilestone: (projectId: string, milestoneId: string) => api.delete(`/v1/projects/${projectId}/milestones/${milestoneId}`),
  getKTReports: (projectId: string, params?: Record<string, string>) => api.get(`/v1/projects/${projectId}/kt-reports`, { params }),
  getKTReport: (projectId: string, reportId: string) => api.get(`/v1/projects/${projectId}/kt-reports/${reportId}`),
  createOrUpdateKTReport: (projectId: string, data: any) => api.post(`/v1/projects/${projectId}/kt-reports`, data),
  updateKTReport: (projectId: string, reportId: string, data: any) => api.patch(`/v1/projects/${projectId}/kt-reports/${reportId}`, data),
  approveKTReport: (projectId: string, reportId: string, action: 'APPROVE' | 'REJECT') => api.post(`/v1/projects/${projectId}/kt-reports/${reportId}/approve`, { action }),
  getMissingKTReports: (projectId: string) => api.get(`/v1/projects/${projectId}/kt-reports/missing`),
  getDocuments: (projectId: string, params?: Record<string, string>) => api.get(`/v1/projects/${projectId}/documents`, { params }),
  getDocument: (projectId: string, documentId: string) => api.get(`/v1/projects/${projectId}/documents/${documentId}`),
  getUploadUrl: (projectId: string, data: any) => api.post(`/v1/projects/${projectId}/documents/upload-url`, data),
  createDocument: (projectId: string, data: any) => api.post(`/v1/projects/${projectId}/documents`, data),
  downloadDocument: (projectId: string, documentId: string) => api.get(`/v1/projects/${projectId}/documents/${documentId}/download`),
  previewDocument: (projectId: string, documentId: string) => api.get(`/v1/projects/${projectId}/documents/${documentId}/preview`),
  deleteDocument: (projectId: string, documentId: string) => api.delete(`/v1/projects/${projectId}/documents/${documentId}`),
};

export const usersApi = MOCK_MODE ? mockUsersApi : {
  // names only, open to every signed-in user (owner / assignee pickers)
  directory: (params?: Record<string, string>) => api.get('/v1/users/directory', { params }),
  list: (params?: Record<string, string>) => api.get('/v1/users', { params }),
  get: (id: string) => api.get(`/v1/users/${id}`),
  create: (data: any) => api.post('/v1/users', data),
  update: (id: string, data: any) => api.patch(`/v1/users/${id}`, data),
  delete: (id: string) => api.delete(`/v1/users/${id}`),
  getProjects: (userId: string) => api.get(`/v1/users/${userId}/projects`),
};

export const rolesApi = MOCK_MODE ? mockRolesApi : {
  list: (params?: Record<string, string>) => api.get('/v1/roles', { params }),
  getPermissions: () => api.get('/v1/roles/permissions'),
  get: (id: string) => api.get(`/v1/roles/${id}`),
  create: (data: any) => api.post('/v1/roles', data),
  update: (id: string, data: any) => api.patch(`/v1/roles/${id}`, data),
  delete: (id: string) => api.delete(`/v1/roles/${id}`),
  assign: (userId: string, roleId: string) => api.post('/v1/roles/assign', { userId, roleId }),
  unassign: (userId: string, roleId: string) => api.delete('/v1/roles/assign', { data: { userId, roleId } }),
};

// The compliance pages use friendlier field names than the API stores
const mapControl = (c: any) => c && ({
  ...c,
  name: c.title,
  framework: c.category,
  nextReviewDate: c.dueDate,
  lastAssessed: c.lastReviewedAt,
  evidence: c.evidence ? [{ name: 'Evidence notes', description: c.evidence }] : [],
  evidenceText: c.evidence ?? '',
});

const toControlPayload = (d: any) => {
  const out: Record<string, unknown> = {};
  if (d.controlId !== undefined) out.controlId = d.controlId;
  if (d.name !== undefined) out.title = d.name;
  if (d.framework !== undefined) out.category = d.framework;
  if (d.status !== undefined) out.status = d.status;
  if (d.description !== undefined) out.description = d.description || null;
  if (d.ownerId) out.ownerId = d.ownerId;
  if (d.evidence !== undefined) out.evidence = d.evidence || null;
  if (d.nextReviewDate !== undefined) out.dueDate = d.nextReviewDate || null;
  return out;
};

const realControlsList = async (params?: Record<string, string>): Promise<any> => {
  const { framework, search, ...rest } = params ?? {};
  const res = await api.get('/v1/compliance/controls', { params: { ...rest, ...(framework && framework !== 'ALL' ? { category: framework } : {}) } });
  const q = search?.toLowerCase();
  let items = (res.data?.items ?? []).map(mapControl);
  if (q) items = items.filter((c: any) => [c.name, c.controlId, c.framework].some((v) => String(v ?? '').toLowerCase().includes(q)));
  return { ...res, data: { ...res.data, items, total: q ? items.length : res.data?.total } };
};

export const complianceApi = MOCK_MODE ? mockComplianceApi : {
  list: (params?: Record<string, string>) => realControlsList(params),
  getControls: (params?: Record<string, string>) => realControlsList(params),
  getControl: async (id: string): Promise<any> => {
    const res = await api.get(`/v1/compliance/controls/${id}`);
    return { ...res, data: mapControl(res.data?.data) }; // pages read the control straight from response.data
  },
  createControl: (data: any) => api.post('/v1/compliance/controls', toControlPayload(data)),
  updateControl: (id: string, data: any) => api.patch(`/v1/compliance/controls/${id}`, toControlPayload(data)),
  deleteControl: (id: string) => api.delete(`/v1/compliance/controls/${id}`),
  delete: (id: string) => api.delete(`/v1/compliance/controls/${id}`),
  createRemediationTask: (controlId: string, data: any) => api.post(`/v1/compliance/controls/${controlId}/remediation-tasks`, data),
  updateRemediationTask: (taskId: string, data: any) => api.patch(`/v1/compliance/remediation-tasks/${taskId}`, data),
};

export const notificationsApi = MOCK_MODE ? mockNotificationsApi : {
  list: (params?: Record<string, string>) => api.get('/v1/notifications', { params }),
  // { success, data: { count } } -> the hook reads response.data.count
  getUnreadCount: async (): Promise<any> => {
    const res = await api.get('/v1/notifications/unread-count');
    return { ...res, data: res.data?.data ?? res.data };
  },
  markAsRead: (id: string) => api.patch(`/v1/notifications/${id}/read`),
  markAllAsRead: () => api.post('/v1/notifications/mark-all-read'),
  delete: (id: string) => api.delete(`/v1/notifications/${id}`),
};

export const auditLogsApi = MOCK_MODE ? mockAuditLogsApi : {
  list: (params?: Record<string, string>) => api.get('/v1/audit-logs', { params }),
  getStats: () => api.get('/v1/audit-logs/stats'),
  export: (params?: Record<string, string>) => api.get('/v1/audit-logs/export', { params, responseType: 'blob' }),
  getActivityFeed: (params?: Record<string, string>) => api.get('/v1/audit-logs/activity-feed', { params }),
  getActions: () => api.get('/v1/audit-logs/actions'),
  getResourceTypes: () => api.get('/v1/audit-logs/resource-types'),
};

// Real-mode documents live under /v1/projects/:projectId/documents; the pages work with flat document ids,
// so remember which project each document belongs to.
const docProject = new Map<string, string>();

const CATEGORY_BY_TYPE = (mime: string) =>
  mime.includes('pdf') || mime.includes('word') || mime.includes('sheet') ? 'TECHNICAL' : 'OTHER';

const realDocumentsList = async (params?: Record<string, string>) => {
  const { projectId, ...rest } = params ?? {};
  const projectsRes = await api.get('/v1/projects', { params: { limit: '100' } });
  const projects: { id: string; name: string }[] = projectsRes.data?.items ?? [];
  const projectIds = projectId ? [projectId] : projects.map((p) => p.id);
  const pages = await Promise.all(
    projectIds.map((id) =>
      api.get(`/v1/projects/${id}/documents`, { params: { limit: '100', ...(rest.search ? { search: rest.search } : {}) } })
        .then((r) => (r.data?.data?.items ?? r.data?.items ?? []).map((d: any) => ({ ...d, projectId: id })))
        .catch(() => [])
    )
  );
  const items = pages.flat().map((d: any) => {
    docProject.set(d.id, d.projectId);
    return {
      ...d,
      type: d.mimeType,
      uploadedBy: d.uploader ?? d.owner,
      project: projects.find((p) => p.id === d.projectId) ?? undefined,
      deleteRequestPending: (d.deleteRequests?.length ?? 0) > 0,
      url: `/api/v1/projects/${d.projectId}/documents/${d.id}/file`,
    };
  });
  return { data: { items, total: items.length } };
};

const realDocumentsUpload = async ({ file, projectId, name, category }: { file: File; projectId?: string; name?: string; category?: string }) => {
  if (!projectId) throw new Error('Select a project before uploading');
  const mimeType = file.type || 'application/octet-stream';
  const meta = { name: name || file.name, category: category || CATEGORY_BY_TYPE(mimeType) };
  const { data } = await api.post(`/v1/projects/${projectId}/documents/upload-url`, meta);
  const { uploadUrl, storageKey } = data.data;
  // Signed link is same-origin; send the raw bytes
  await api.put(uploadUrl.replace(/^\/api/, ''), file, { headers: { 'Content-Type': mimeType }, withCredentials: false });
  return api.post(`/v1/projects/${projectId}/documents`, { ...meta, storageKey, size: file.size, mimeType });
};

const projectOfDoc = (id: string) => {
  const projectId = docProject.get(id);
  if (!projectId) throw new Error('Open the document from the list first');
  return projectId;
};

const realDocumentsRollback = async (id: string, version: number, reason?: string) => {
  const projectId = projectOfDoc(id);
  const list = await api.get(`/v1/projects/${projectId}/documents/${id}/versions`);
  const target = (list.data?.items ?? []).find((v: any) => v.version === version);
  if (!target) throw new Error('Version not found');
  return api.post(`/v1/projects/${projectId}/documents/${id}/versions/${target.id}/rollback`, reason ? { reason } : undefined);
};

const realDocumentsDelete = (id: string) => {
  const projectId = docProject.get(id);
  if (!projectId) return Promise.reject(new Error('Unknown document project'));
  return api.delete(`/v1/projects/${projectId}/documents/${id}`);
};

export const documentsApi = MOCK_MODE ? mockDocumentsApi : {
  list: realDocumentsList,
  // every file of one project, oldest first, with uploader and time
  timeline: (projectId: string) => api.get(`/v1/projects/${projectId}/documents/timeline`),
  // put the images (one PDF) or documents (PDF merged, Word / Excel in a ZIP) of a project together; saved in the vault
  createKtPack: (projectId: string, body: { kind: 'images' | 'documents'; types?: string[] }) => api.post(`/v1/projects/${projectId}/kt-pack`, body),
  get: (id: string) => api.get(`/v1/documents/${id}`),
  create: (data: any) => api.post('/v1/documents', data),
  update: (id: string, data: any) => api.patch(`/v1/documents/${id}`, data),
  delete: realDocumentsDelete,
  getUploadUrl: (data: any) => api.post('/v1/documents/upload-url', data),
  upload: realDocumentsUpload,
  downloadDocument: (id: string) => api.get(`/v1/documents/${id}/download`),
  previewDocument: (id: string) => api.get(`/v1/documents/${id}/preview`),
  getVersions: (documentId: string) => api.get(`/v1/projects/${projectOfDoc(documentId)}/documents/${documentId}/versions`),
  getDiff: (documentId: string, version: number) => api.get(`/v1/documents/${documentId}/diff`, { params: { version } }),
  rollback: realDocumentsRollback,
  submitReview: (documentId: string, reviewerId: string) => api.post(`/v1/projects/${projectOfDoc(documentId)}/documents/${documentId}/submit-review`, { reviewerId }),
  reviewDocument: (documentId: string, status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED', comments?: string) => api.post(`/v1/projects/${projectOfDoc(documentId)}/documents/${documentId}/review`, { status, comments }),
  getReviews: (documentId: string) => api.get(`/v1/projects/${projectOfDoc(documentId)}/documents/${documentId}/reviews`),
  // Document sharing
  getShares: (documentId: string) => api.get(`/v1/documents/${documentId}/shares`),
  share: (documentId: string, data: { userId: string; permission: 'VIEW' | 'EDIT' | 'DOWNLOAD' | 'COMMENT' | 'FULL' }) => api.post(`/v1/documents/${documentId}/shares`, data),
  unshare: (documentId: string, shareId: string) => api.delete(`/v1/documents/${documentId}/shares/${shareId}`),
  updateSharePermission: (documentId: string, shareId: string, permission: 'VIEW' | 'EDIT' | 'DOWNLOAD' | 'COMMENT' | 'FULL') => api.patch(`/v1/documents/${documentId}/shares/${shareId}`, { permission }),
  // Who opened, downloaded or changed one document (owner, lead, reviewer and super admin only)
  getDocumentActivity: (documentId: string) => api.get(`/v1/projects/${projectOfDoc(documentId)}/documents/${documentId}/access-analytics`),
  // Access analytics
  getAccessAnalytics: (params: Record<string, string>) => api.get('/v1/documents/access-analytics', { params }),
  exportAccessLog: (params: { documentId?: string; projectId?: string; timeRange?: string; format: string }) => api.get('/v1/documents/access-log/export', { params, responseType: 'blob' }),
  // Admin monitoring
  getAdminMonitoring: (params: Record<string, string>) => api.get('/v1/documents/admin-monitoring', { params }),
};

// The knowledge book page shows `name`; the API stores `title`
const mapBook = (b: any) => ({ ...b, name: b.title, tags: [] as string[] });

export const knowledgeBooksApi = MOCK_MODE ? mockKnowledgeBooksApi : {
  list: async (params?: Record<string, string>): Promise<any> => {
    const res = await api.get('/v1/knowledge-books', { params });
    const items = (res.data?.items ?? []).map(mapBook);
    return { ...res, data: { ...res.data, items } };
  },
  get: (id: string) => api.get(`/v1/knowledge-books/${id}`),
  create: (data: any) => api.post('/v1/knowledge-books', {
    projectId: data.projectId, title: data.name, description: data.description || null, includeDocumentIds: [],
  }),
  update: (id: string, data: any) => api.patch(`/v1/knowledge-books/${id}`, {
    title: data.name, description: data.description || null, status: data.status,
  }),
  delete: (id: string) => api.delete(`/v1/knowledge-books/${id}`),
  // The server builds the PDF; fetch it through the short-lived link it returns
  generatePdf: async (id: string): Promise<any> => {
    const link = await api.get(`/v1/knowledge-books/${id}/download`);
    const file = await fetch(link.data.data.downloadUrl);
    if (!file.ok) throw new Error('PDF not available');
    return { data: await file.blob() };
  },
  getStats: () => api.get('/v1/knowledge-books/stats'),
  exportReport: (params: { format: string }) => api.get('/v1/knowledge-books/export', { params, responseType: 'blob' }),
};

// Mock Assignments Data (for individual contributors)
const mockMyTasks = [
  { id: '1', title: 'Review Security Policy v2.1', projectId: '1', projectName: 'Security Audit Q1', status: 'IN_PROGRESS', priority: 'HIGH', dueDate: '2024-01-16', assignee: 'Current User', blockedBy: null },
  { id: '2', title: 'Complete vendor assessment', projectId: '8', projectName: 'Vendor Risk Mgmt', status: 'TODO', priority: 'MEDIUM', dueDate: '2024-01-17', assignee: 'Current User', blockedBy: 'Waiting on Legal review' },
  { id: '3', title: 'Update incident response plan', projectId: '7', projectName: 'Security Operations', status: 'IN_PROGRESS', priority: 'HIGH', dueDate: '2024-01-19', assignee: 'Current User', blockedBy: null },
  { id: '4', title: 'Submit monthly metrics', projectId: '1', projectName: 'Security Audit Q1', status: 'TODO', priority: 'MEDIUM', dueDate: '2024-01-19', assignee: 'Current User', blockedBy: null },
  { id: '5', title: 'Team security training prep', projectId: '10', projectName: 'Awareness Program', status: 'TODO', priority: 'LOW', dueDate: '2024-01-22', assignee: 'Current User', blockedBy: null },
  { id: '6', title: 'Penetration test findings review', projectId: '3', projectName: 'Penetration Testing', status: 'BLOCKED', priority: 'CRITICAL', dueDate: '2024-01-15', assignee: 'Current User', blockedBy: 'Waiting on dev team fix' },
  { id: '7', title: 'DLP policy configuration', projectId: '9', projectName: 'Data Loss Prevention', status: 'IN_PROGRESS', priority: 'HIGH', dueDate: '2024-01-18', assignee: 'Current User', blockedBy: null },
  { id: '8', title: 'Cloud security benchmark review', projectId: '6', projectName: 'Cloud Security Assessment', status: 'TODO', priority: 'MEDIUM', dueDate: '2024-01-25', assignee: 'Current User', blockedBy: 'Waiting on AWS credentials' },
];

const mockMyProjects = [
  { id: '1', name: 'Security Audit Q1', role: 'Lead Auditor', status: 'ONGOING', progress: 65, priority: 'HIGH', expectedCompletionDate: '2024-02-15' },
  { id: '3', name: 'Penetration Testing', role: 'Penetration Tester', status: 'ONGOING', progress: 80, priority: 'CRITICAL', expectedCompletionDate: '2024-02-25' },
  { id: '7', name: 'Incident Response Plan', role: 'Contributor', status: 'COMPLETED', progress: 100, priority: 'HIGH', expectedCompletionDate: '2024-01-05' },
  { id: '9', name: 'Data Loss Prevention', role: 'DLP Engineer', status: 'ONGOING', progress: 35, priority: 'HIGH', expectedCompletionDate: '2024-03-10' },
];

const mockMyKTReports = [
  { id: '1', title: 'Weekly Security KT', projectId: '1', projectName: 'Security Audit Q1', status: 'DRAFT', dueDate: '2024-01-16', lastUpdated: '2024-01-15T10:00:00Z' },
  { id: '2', title: 'Monthly Compliance Summary', projectId: '2', projectName: 'Compliance Review', status: 'IN_PROGRESS', dueDate: '2024-01-19', lastUpdated: '2024-01-14T14:00:00Z' },
  { id: '3', title: 'Quarterly Risk Assessment', projectId: '8', projectName: 'Vendor Risk Assessment', status: 'NOT_STARTED', dueDate: '2024-01-22', lastUpdated: null },
];

const mockMyDocumentReviews = [
  { id: '1', name: 'Security Policy v2.1', projectId: '1', projectName: 'Security Audit Q1', status: 'IN_REVIEW', requestedBy: 'Admin User', requestedAt: '2024-01-15T09:00:00Z', dueDate: '2024-01-17' },
  { id: '2', name: 'Vendor Security Questionnaire', projectId: '8', projectName: 'Vendor Risk Assessment', status: 'IN_REVIEW', requestedBy: 'Jane Smith', requestedAt: '2024-01-14T11:00:00Z', dueDate: '2024-01-18' },
  { id: '3', name: 'DLP Policy Document', projectId: '9', projectName: 'Data Loss Prevention', status: 'PENDING', requestedBy: 'John Doe', requestedAt: '2024-01-13T10:00:00Z', dueDate: '2024-01-20' },
];

const mockMyComplianceActions = [
  { id: '1', controlId: '1', controlName: 'Access Control Policy', framework: 'ISO 27001', action: 'Provide evidence', status: 'PENDING', dueDate: '2024-01-18' },
  { id: '2', controlId: '5', controlName: 'Vendor Management', framework: 'SOC 2', action: 'Review vendor contracts', status: 'IN_PROGRESS', dueDate: '2024-01-20' },
  { id: '3', controlId: '10', controlName: 'Privacy Impact Assessment', framework: 'GDPR', action: 'Complete assessment', status: 'NOT_STARTED', dueDate: '2024-01-25' },
];

// Mock Knowledge Books (10 knowledge books)
const mockKnowledgeBooks = [
  { id: '1', name: 'Security Policies Handbook', description: 'Comprehensive collection of all security policies and procedures', tags: ['security', 'policy', 'handbook'], status: 'PUBLISHED', createdAt: '2024-01-10T10:00:00Z', updatedAt: '2024-01-15T14:30:00Z' },
  { id: '2', name: 'Compliance Evidence Pack', description: 'Evidence documents for ISO 27001 and SOC 2 compliance audits', tags: ['compliance', 'iso27001', 'soc2', 'evidence'], status: 'PUBLISHED', createdAt: '2024-01-12T09:00:00Z', updatedAt: '2024-01-14T16:00:00Z' },
  { id: '3', name: 'Incident Response Playbook', description: 'Step-by-step incident response procedures and runbooks', tags: ['incident', 'response', 'playbook', 'runbook'], status: 'PUBLISHED', createdAt: '2024-01-08T11:00:00Z', updatedAt: '2024-01-15T10:00:00Z' },
  { id: '4', name: 'Vendor Risk Assessment Guide', description: 'Guidelines and templates for assessing third-party vendor risks', tags: ['vendor', 'risk', 'assessment', 'third-party'], status: 'DRAFT', createdAt: '2024-01-14T13:00:00Z', updatedAt: '2024-01-14T13:00:00Z' },
  { id: '5', name: 'Cloud Security Benchmarks', description: 'CIS benchmarks and best practices for AWS, Azure, and GCP', tags: ['cloud', 'aws', 'azure', 'gcp', 'cis', 'benchmark'], status: 'PUBLISHED', createdAt: '2024-01-09T15:00:00Z', updatedAt: '2024-01-13T11:00:00Z' },
  { id: '6', name: 'Penetration Testing Methodology', description: 'Standardized penetration testing approach and reporting templates', tags: ['pentest', 'methodology', 'testing', 'reporting'], status: 'DRAFT', createdAt: '2024-01-11T14:00:00Z', updatedAt: '2024-01-11T14:00:00Z' },
  { id: '7', name: 'Security Awareness Training Materials', description: 'Training content, phishing simulations, and awareness campaigns', tags: ['training', 'awareness', 'phishing', 'education'], status: 'PUBLISHED', createdAt: '2024-01-15T08:00:00Z', updatedAt: '2024-01-15T08:00:00Z' },
  { id: '8', name: 'Data Loss Prevention Policies', description: 'DLP policy definitions, regex patterns, and response procedures', tags: ['dlp', 'data-protection', 'policy', 'patterns'], status: 'ARCHIVED', createdAt: '2024-01-05T10:00:00Z', updatedAt: '2024-01-12T09:00:00Z' },
  { id: '9', name: 'Business Continuity Plans', description: 'BCP/DRP documents, recovery procedures, and contact lists', tags: ['bcp', 'drp', 'continuity', 'disaster-recovery'], status: 'PUBLISHED', createdAt: '2024-01-07T11:00:00Z', updatedAt: '2024-01-14T15:00:00Z' },
  { id: '10', name: 'Identity & Access Management Guide', description: 'IAM policies, role definitions, and access review procedures', tags: ['iam', 'identity', 'access', 'rbac'], status: 'DRAFT', createdAt: '2024-01-13T16:00:00Z', updatedAt: '2024-01-13T16:00:00Z' },
];

const mockPersonalActivity = [
  { id: '1', action: 'Completed', resourceType: 'Task', resourceName: 'Network segmentation validation', projectName: 'Security Audit Q1', timestamp: '2024-01-15T14:30:00Z' },
  { id: '2', action: 'Submitted', resourceType: 'KT Report', resourceName: 'Weekly Security KT - Jan 15', projectName: 'Security Audit Q1', timestamp: '2024-01-15T10:00:00Z' },
  { id: '3', action: 'Reviewed', resourceType: 'Document', resourceName: 'Penetration Test Report', projectName: 'Penetration Testing', timestamp: '2024-01-14T16:00:00Z' },
  { id: '4', action: 'Updated', resourceType: 'Project', resourceName: 'Penetration Testing', projectName: 'Penetration Testing', timestamp: '2024-01-14T15:30:00Z' },
  { id: '5', action: 'Commented', resourceType: 'Task', resourceName: 'Endpoint security scan', projectName: 'Security Audit Q1', timestamp: '2024-01-14T14:20:00Z' },
  { id: '6', action: 'Created', resourceType: 'Document', resourceName: 'Network Security Config', projectName: 'Security Audit Q1', timestamp: '2024-01-14T13:00:00Z' },
];

// Mock Executive Dashboard Data (for leadership)
const mockExecutiveMetrics = {
  metrics: {
    organizationHealthScore: 87,
    totalProjects: 10,
    activeProjects: 6,
    completedProjects: 2,
    onHoldProjects: 1,
    overdueProjects: 1,
    complianceScore: 78,
    openRisks: 12,
    criticalRisks: 3,
    highRisks: 5,
    pendingKTReports: 8,
    teamUtilization: 73,
    budgetUtilization: 68,
    avgProjectHealth: 82,
  },
  charts: {
    healthTrend: [
      { month: 'Sep', score: 72 },
      { month: 'Oct', score: 75 },
      { month: 'Nov', score: 78 },
      { month: 'Dec', score: 81 },
      { month: 'Jan', score: 87 },
    ],
    riskHeatmap: [
      { category: 'Application Security', critical: 2, high: 4, medium: 8, low: 12 },
      { category: 'Network Security', critical: 1, high: 3, medium: 6, low: 10 },
      { category: 'Data Protection', critical: 0, high: 2, medium: 7, low: 9 },
      { category: 'Identity & Access', critical: 0, high: 1, medium: 4, low: 8 },
      { category: 'Cloud Security', critical: 0, high: 2, medium: 5, low: 11 },
      { category: 'Compliance', critical: 0, high: 1, medium: 3, low: 6 },
    ],
    compliancePosture: [
      { framework: 'ISO 27001', compliant: 8, partial: 2, nonCompliant: 1, trend: '+5%' },
      { framework: 'NIST CSF', compliant: 7, partial: 3, nonCompliant: 1, trend: '+3%' },
      { framework: 'SOC 2', compliant: 6, partial: 2, nonCompliant: 2, trend: '+2%' },
      { framework: 'GDPR', compliant: 5, partial: 3, nonCompliant: 1, trend: '0%' },
    ],
    resourceAllocation: [
      { project: 'Security Audit Q1', allocated: 3.5, utilized: 3.2, teamSize: 4 },
      { project: 'Penetration Testing', allocated: 2.0, utilized: 1.8, teamSize: 2 },
      { project: 'Compliance Review', allocated: 2.5, utilized: 2.1, teamSize: 3 },
      { project: 'Vendor Risk Assessment', allocated: 1.5, utilized: 1.3, teamSize: 2 },
      { project: 'Data Loss Prevention', allocated: 2.0, utilized: 1.5, teamSize: 2 },
      { project: 'Cloud Security Assessment', allocated: 1.0, utilized: 0.5, teamSize: 2 },
    ],
    budgetTracking: [
      { project: 'Security Audit Q1', budget: 50000, spent: 32500, forecast: 48000 },
      { project: 'Penetration Testing', budget: 75000, spent: 60000, forecast: 73000 },
      { project: 'Compliance Review', budget: 35000, spent: 14000, forecast: 33000 },
      { project: 'Legacy System Migration', budget: 120000, spent: 108000, forecast: 115000 },
      { project: 'Data Loss Prevention', budget: 60000, spent: 21000, forecast: 58000 },
      { project: 'Vendor Risk Assessment', budget: 30000, spent: 16500, forecast: 28000 },
    ],
  },
  alerts: [
    { id: '1', type: 'CRITICAL', title: 'Legacy System Migration Overdue', message: 'Project 5 days past deadline, budget at 90%', projectId: '4', timestamp: '2024-01-15T08:00:00Z' },
    { id: '2', type: 'WARNING', title: 'Penetration Test Critical Finding', message: 'SQL injection in payment portal requires immediate attention', projectId: '3', timestamp: '2024-01-15T09:15:00Z' },
    { id: '3', type: 'WARNING', title: 'Cloud Security Assessment On Hold', message: 'Blocked on AWS credential approval for 3 days', projectId: '6', timestamp: '2024-01-14T15:30:00Z' },
    { id: '4', type: 'INFO', title: 'Compliance Review Behind Schedule', message: 'Only 40% complete, target date at risk', projectId: '2', timestamp: '2024-01-14T16:45:00Z' },
    { id: '5', type: 'INFO', title: 'Team Utilization Below Target', message: 'Security Operations team at 65% utilization', projectId: null, timestamp: '2024-01-14T10:00:00Z' },
  ],
  upcomingDeadlines: [
    { id: '1', name: 'Security Audit Q1', expectedCompletionDate: '2024-02-15', priority: 'HIGH', health: 85 },
    { id: '2', name: 'Compliance Review', expectedCompletionDate: '2024-02-20', priority: 'MEDIUM', health: 70 },
    { id: '3', name: 'Penetration Testing', expectedCompletionDate: '2024-02-25', priority: 'CRITICAL', health: 90 },
    { id: '8', name: 'Vendor Risk Assessment', expectedCompletionDate: '2024-02-28', priority: 'MEDIUM', health: 75 },
    { id: '9', name: 'Data Loss Prevention', expectedCompletionDate: '2024-03-10', priority: 'HIGH', health: 65 },
  ],
  recentActivity: [
    { id: '1', action: 'Created', resourceType: 'Project', actor: { fullName: 'Admin User' }, projectName: 'Security Audit Q1', timestamp: '2024-01-15T10:30:00Z' },
    { id: '2', action: 'Updated', resourceType: 'KT Report', actor: { fullName: 'John Doe' }, projectName: 'Security Audit Q1', timestamp: '2024-01-15T09:15:00Z' },
    { id: '3', action: 'Approved', resourceType: 'Document', actor: { fullName: 'Jane Smith' }, projectName: 'Compliance Review', timestamp: '2024-01-14T16:45:00Z' },
    { id: '4', action: 'Completed', resourceType: 'Project', actor: { fullName: 'Admin User' }, projectName: 'Incident Response Plan', timestamp: '2024-01-14T14:20:00Z' },
    { id: '5', action: 'Created', resourceType: 'Compliance Control', actor: { fullName: 'Admin User' }, projectName: 'Compliance Review', timestamp: '2024-01-14T11:00:00Z' },
  ],
};

const mockExecutiveDashboardApi = {
  getMetrics: async () => createMockResponse(mockExecutiveMetrics),
};

const mockAssignmentsApi = {
  getMyTasks: async (params?: Record<string, string>) => {
    let items = [...mockMyTasks];
    if (params?.status) {
      items = items.filter(t => t.status === params.status);
    }
    if (params?.priority) {
      items = items.filter(t => t.priority === params.priority);
    }
    return createMockResponse({ items, total: items.length, page: 1, pageSize: items.length });
  },
  getMyProjects: async () => createMockResponse({ items: mockMyProjects, total: mockMyProjects.length }),
  getMyKTReports: async () => createMockResponse({ items: mockMyKTReports, total: mockMyKTReports.length }),
  getMyDocumentReviews: async () => createMockResponse({ items: mockMyDocumentReviews, total: mockMyDocumentReviews.length }),
  getMyComplianceActions: async () => createMockResponse({ items: mockMyComplianceActions, total: mockMyComplianceActions.length }),
  getPersonalActivity: async (params?: Record<string, string>) => {
    let items = [...mockPersonalActivity];
    if (params?.limit) {
      items = items.slice(0, parseInt(params.limit, 10));
    }
    return createMockResponse({ items, total: items.length });
  },
};

export const ktReportsApi = MOCK_MODE ? mockKTReportsApi : {
  list: (params?: Record<string, string>) => api.get('/v1/kt-reports', { params }),
  get: (id: string) => api.get(`/v1/kt-reports/${id}`),
  create: (data: any) => api.post('/v1/kt-reports', data),
  update: (id: string, data: any) => api.patch(`/v1/kt-reports/${id}`, data),
  approve: (id: string, action: string) => api.post(`/v1/kt-reports/${id}/approve`, { action }),
  delete: (id: string) => api.delete(`/v1/kt-reports/${id}`),
};

export const executiveDashboardApi = MOCK_MODE ? mockExecutiveDashboardApi : {
  getMetrics: () => api.get('/v1/executive/dashboard/metrics'),
};

export const assignmentsApi = MOCK_MODE ? mockAssignmentsApi : {
  getMyTasks: (params?: Record<string, string>) => api.get('/v1/assignments/tasks', { params }),
  getMyProjects: () => api.get('/v1/assignments/projects'),
  getMyKTReports: () => api.get('/v1/assignments/kt-reports'),
  getMyDocumentReviews: () => api.get('/v1/assignments/document-reviews'),
  getMyComplianceActions: () => api.get('/v1/assignments/compliance-actions'),
  getPersonalActivity: (params?: Record<string, string>) => api.get('/v1/assignments/activity', { params }),
};

// Mock search data generator for mock mode
function generateMockSearchResults(query: string, modules: string[]) {
  const lowerQuery = query.toLowerCase();
  const allResults = [
    // Projects
    { type: 'projects', id: 'proj-1', title: 'Security Audit Q1', subtitle: 'Ongoing · 65% complete · John Doe', url: '/projects/proj-1', metadata: { status: 'ONGOING', progress: 65, owner: 'John Doe' } },
    { type: 'projects', id: 'proj-2', title: 'Endpoint Security Assessment', subtitle: 'Not Started · Jane Smith', url: '/projects/proj-2', metadata: { status: 'NOT_STARTED', owner: 'Jane Smith' } },
    { type: 'projects', id: 'proj-3', title: 'Network Penetration Testing', subtitle: 'In Review · 90% complete · Mike Wilson', url: '/projects/proj-3', metadata: { status: 'IN_REVIEW', progress: 90, owner: 'Mike Wilson' } },
    // Documents
    { type: 'documents', id: 'doc-1', title: 'Security Policy v2.1', subtitle: 'PDF · 1.2 MB · Approved', url: '/documents/doc-1', metadata: { type: 'PDF', size: 1200000, status: 'APPROVED' } },
    { type: 'documents', id: 'doc-2', title: 'Physical Security Standards', subtitle: 'PDF · 800 KB · In Review', url: '/documents/doc-2', metadata: { type: 'PDF', size: 800000, status: 'IN_REVIEW' } },
    { type: 'documents', id: 'doc-3', title: 'Incident Response Playbook', subtitle: 'DOCX · 2.1 MB · Draft', url: '/documents/doc-3', metadata: { type: 'DOCX', size: 2100000, status: 'DRAFT' } },
    { type: 'documents', id: 'doc-4', title: 'Vendor Security Assessment Template', subtitle: 'XLSX · 500 KB · Published', url: '/documents/doc-4', metadata: { type: 'XLSX', size: 500000, status: 'PUBLISHED' } },
    { type: 'documents', id: 'doc-5', title: 'Security Awareness Training Materials', subtitle: 'PPTX · 5.2 MB · Approved', url: '/documents/doc-5', metadata: { type: 'PPTX', size: 5200000, status: 'APPROVED' } },
    // KT Reports
    { type: 'ktReports', id: 'kt-1', title: 'Weekly Security KT - Jan 15', subtitle: 'Submitted · Sarah Johnson', url: '/kt-reports/kt-1', metadata: { status: 'SUBMITTED', author: 'Sarah Johnson', date: '2026-01-15' } },
    { type: 'ktReports', id: 'kt-2', title: 'Monthly Compliance Summary - Dec', subtitle: 'Approved · David Chen', url: '/kt-reports/kt-2', metadata: { status: 'APPROVED', author: 'David Chen', date: '2025-12-31' } },
    // Compliance
    { type: 'compliance', id: 'comp-1', title: 'ISO 27001 Control A.12.1', subtitle: 'Operational · 95% · Next review: Mar 15', url: '/compliance/comp-1', metadata: { framework: 'ISO 27001', status: 'OPERATIONAL', progress: 95 } },
    // People
    { type: 'people', id: 'user-1', title: 'Sarah Johnson', subtitle: 'Security Analyst · Active · Compliance Team', url: '/users/user-1', metadata: { role: 'SECURITY_ANALYST', status: 'ACTIVE', department: 'Compliance' } },
    { type: 'people', id: 'user-2', title: 'Mike Wilson', subtitle: 'Senior Auditor · Active · Audit Team', url: '/users/user-2', metadata: { role: 'SENIOR_AUDITOR', status: 'ACTIVE', department: 'Audit' } },
    // Audit Logs
    { type: 'auditLogs', id: 'audit-1', title: 'Document "Security Policy v2.1" approved', subtitle: 'John Doe · 2 hours ago', url: '/audit-logs/audit-1', metadata: { action: 'APPROVE', user: 'John Doe', timestamp: '2026-01-15T10:30:00Z' } },
    { type: 'auditLogs', id: 'audit-2', title: 'Project "Endpoint Security Assessment" created', subtitle: 'Jane Smith · 1 day ago', url: '/audit-logs/audit-2', metadata: { action: 'CREATE', user: 'Jane Smith', timestamp: '2026-01-14T14:22:00Z' } },
    { type: 'auditLogs', id: 'audit-3', title: 'KT Report "Weekly Security KT - Jan 15" submitted', subtitle: 'Sarah Johnson · 2 days ago', url: '/audit-logs/audit-3', metadata: { action: 'SUBMIT', user: 'Sarah Johnson', timestamp: '2026-01-13T09:15:00Z' } },
    { type: 'auditLogs', id: 'audit-4', title: 'User "Mike Wilson" assigned to project "Network Penetration Testing"', subtitle: 'Admin · 3 days ago', url: '/audit-logs/audit-4', metadata: { action: 'ASSIGN', user: 'Admin', timestamp: '2026-01-12T16:45:00Z' } },
  ];
  return allResults.filter(r => modules.includes(r.type) && (r.title.toLowerCase().includes(lowerQuery) || r.subtitle.toLowerCase().includes(lowerQuery)));
}

export const searchApi = MOCK_MODE ? {
  search: async (params: { q: string; modules?: string[]; limit?: number; offset?: number }) => {
    const results = generateMockSearchResults(params.q, params.modules || ['projects', 'documents', 'ktReports', 'compliance', 'people', 'auditLogs']);
    return {
      data: {
        results: results.slice(params.offset || 0, (params.offset || 0) + (params.limit || 20)),
        total: results.length,
        query: params.q,
        modules: params.modules,
      },
    };
  },
} : {
  // The API wraps results as { success, data: { results, total } } and takes a comma separated `modules`
  search: async (params: { q: string; modules?: string[]; limit?: number; offset?: number }) => {
    const res = await api.get('/v1/search', { params: {
      q: params.q,
      modules: params.modules?.length ? params.modules.join(',') : undefined,
      limit: params.limit,
      offset: params.offset,
    }});
    return { ...res, data: res.data?.data ?? res.data };
  },
};

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
let redirectingToLogin = false;

api.interceptors.response.use(
  (response) => {
    // The API wraps payloads as { success, data }, while list pages read response.data.items.
    // For paginated lists expose both shapes (response.data.items and response.data.data.items).
    const body = response.data;
    if (body?.success === true && Array.isArray(body.data?.items)) {
      response.data = { ...body.data, data: body.data, success: true };
    }
    return response;
  },
  (error: AxiosError) => {
    // A 401 on a login attempt is just "wrong password": let the form show it.
    // For any other 401 the session is gone: clear it and go to /login once.
    // (There is no refresh endpoint to retry against, and redirecting while already
    // on /login made the page reload in a loop.)
    const isAuthCall = error.config?.url?.includes('/v1/auth/');
    if (error.response?.status === 401 && !isAuthCall) {
      clearAuth();
      if (!redirectingToLogin && window.location.pathname !== '/login') {
        redirectingToLogin = true;
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);


// Two-factor login, account activation and mail settings (no mock mode: these need the real API)
export const accessApi = {
  verifyMfa: (data: { mfaToken: string; code?: string; recoveryCode?: string }) => api.post('/v1/auth/login/mfa', data),
  mfaSetup: (mfaToken: string) => api.post('/v1/auth/mfa/setup', { mfaToken }),
  mfaConfirm: (mfaToken: string, code: string) => api.post('/v1/auth/mfa/confirm', { mfaToken, code }),
  getInvite: (token: string) => api.get(`/v1/auth/invite/${token}`),
  setInvitePassword: (token: string, password: string) => api.post(`/v1/auth/invite/${token}/password`, { password }),
  confirmInvite: (token: string, code: string) => api.post(`/v1/auth/invite/${token}/confirm`, { code }),
  resendInvite: (userId: string) => api.post(`/v1/users/${userId}/resend-invite`),
  resetMfa: (userId: string) => api.post(`/v1/users/${userId}/reset-mfa`),
  ssoStatus: () => api.get('/v1/auth/microsoft/status'),
  signInOptions: () => api.get('/v1/users/sign-in-options'),
  setPassword: (userId: string, password: string) => api.post(`/v1/users/${userId}/set-password`, { password }),
  ssoExchange: (code: string) => api.post('/v1/auth/microsoft/exchange', { code }),
};

export const mailSettingsApi = {
  get: () => api.get('/v1/admin/mail-settings'),
  save: (data: Record<string, unknown>) => api.put('/v1/admin/mail-settings', data),
  sendTest: (to: string) => api.post('/v1/admin/mail-settings/test', { to }),
};

export const ssoSettingsApi = {
  get: () => api.get('/v1/admin/sso-settings'),
  save: (data: Record<string, unknown>) => api.put('/v1/admin/sso-settings', data),
};

// Deleting a document needs a manager's approval; approved documents wait 30 days in the recycle bin
export const deleteRequestsApi = {
  request: (projectId: string, documentId: string, reason: string, immediate = false) =>
    api.post(`/v1/projects/${projectId}/documents/${documentId}/delete-request`, { reason, immediate }),
  list: (scope: 'approver' | 'mine', status = 'PENDING') => api.get('/v1/delete-requests', { params: { scope, status } }),
  approve: (id: string, note?: string) => api.post(`/v1/delete-requests/${id}/approve`, { note }),
  reject: (id: string, note: string) => api.post(`/v1/delete-requests/${id}/reject`, { note }),
  cancel: (id: string) => api.post(`/v1/delete-requests/${id}/cancel`),
};

export const recycleBinApi = {
  list: () => api.get('/v1/recycle-bin'),
  restore: (id: string) => api.post(`/v1/recycle-bin/${id}/restore`),
  purge: (id: string) => api.delete(`/v1/recycle-bin/${id}`),
};

// Project team management (owner / lead)
export const teamApi = {
  available: (projectId: string) => api.get(`/v1/projects/${projectId}/members/available`),
  add: (projectId: string, userId: string, role: string) => api.post(`/v1/projects/${projectId}/members`, { userId, role }),
  setRole: (projectId: string, memberId: string, role: string) => api.patch(`/v1/projects/${projectId}/members/${memberId}`, { role }),
  remove: (projectId: string, memberId: string) => api.delete(`/v1/projects/${projectId}/members/${memberId}`),
};

// Server backups (super admin only)
export const backupsApi = {
  list: () => api.get('/v1/backups'),
  saveSettings: (data: any) => api.put('/v1/backups/settings', data),
  run: () => api.post('/v1/backups/run'),
  remove: (name: string) => api.delete(`/v1/backups/${name}`),
  // the file needs the login header, so fetch it and hand the browser a local copy
  download: async (name: string, file: 'db' | 'documents') => {
    const res = await api.get(`/v1/backups/${name}/${file}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dbi-${name}-${file === 'db' ? 'db.sql.gz' : 'documents.tgz'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// Delete requests for whole projects (a super admin decides)
export const projectDeleteApi = {
  request: (projectId: string, reason: string) => api.post(`/v1/projects/${projectId}/delete-request`, { reason }),
  list: (scope: 'approver' | 'mine', status = 'PENDING') => api.get('/v1/project-delete-requests', { params: { scope, status } }),
  approve: (id: string, note?: string) => api.post(`/v1/project-delete-requests/${id}/approve`, { note }),
  reject: (id: string, note: string) => api.post(`/v1/project-delete-requests/${id}/reject`, { note }),
  cancel: (id: string) => api.post(`/v1/project-delete-requests/${id}/cancel`),
};

// Work sessions: start / stop work on a project, notes, screenshots, and the versioned work KT
export const workApi = {
  state: (projectId: string) => api.get(`/v1/projects/${projectId}/work/state`),
  start: (projectId: string, body: { linkUrl?: string | null; linkLabel?: string | null; surface?: string | null }) => api.post(`/v1/projects/${projectId}/work/start`, body),
  heartbeat: (projectId: string, sessionId: string) => api.post(`/v1/projects/${projectId}/work/${sessionId}/heartbeat`),
  note: (projectId: string, sessionId: string, text: string) => api.post(`/v1/projects/${projectId}/work/${sessionId}/note`, { text }),
  event: (projectId: string, sessionId: string, text: string) => api.post(`/v1/projects/${projectId}/work/${sessionId}/event`, { text }),
  shot: (projectId: string, sessionId: string, image: string, reason: 'CHANGE' | 'MANUAL' | 'HEARTBEAT' | 'NOTE' | 'STOP') =>
    api.post(`/v1/projects/${projectId}/work/${sessionId}/shot`, { image, reason }),
  share: (projectId: string, sessionId: string, state: 'STARTED' | 'STOPPED' | 'DENIED' | 'REJECTED', surface?: string | null) =>
    api.post(`/v1/projects/${projectId}/work/${sessionId}/share`, { state, surface: surface ?? null }),
  stop: (projectId: string, sessionId: string) => api.post(`/v1/projects/${projectId}/work/${sessionId}/stop`),
  sessions: (projectId: string, userId?: string) => api.get(`/v1/projects/${projectId}/work/sessions`, { params: userId ? { userId } : undefined }),
  session: (projectId: string, sessionId: string) => api.get(`/v1/projects/${projectId}/work/sessions/${sessionId}`),
  generateKt: (projectId: string) => api.post(`/v1/projects/${projectId}/work/generate-kt`),
};

// Reminders for work that is not moving (settings are in days; the admin decides)
export const remindersApi = {
  get: () => api.get('/v1/admin/reminders'),
  save: (data: { enabled: boolean; stalledAfterDays: number; notStartedAfterDays: number; escalateAfterDays: number }) => api.put('/v1/admin/reminders', data),
  runNow: () => api.post('/v1/admin/reminders/run'),
  getWork: () => api.get('/v1/admin/work-settings'),
  saveWork: (data: { requireScreenShare: boolean }) => api.put('/v1/admin/work-settings', data),
};
