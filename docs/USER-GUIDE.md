# DBI Security Center — User Guide (start to end)

Open the site at `https://<server-address>:8443` (for example `https://192.168.31.158:8443`). The browser shows a certificate warning because the certificate is made by the server itself: choose **Advanced → Continue**. After an update, press **Ctrl+Shift+R** once.

---

## Part 1. For everyone

### 1. Sign in
1. Open the site, enter your email and password, press **Sign in**.
2. Admin roles also enter a 6-digit code from the authenticator app (first time: scan the QR code, save the recovery codes somewhere safe).
3. You stay signed in for 8 hours and the time extends while you use the system. Idle longer: sign in again.
4. New user: open the **invite link** you received (`/activate/...`), choose a password.
5. Change your password and see your sessions in **Settings**.

### 2. Dashboard
The first page shows projects, deadlines, health, alerts, resources and **Recent Activity**. Every card, row and activity line is clickable and opens exactly what it names (the task, the document, the project).

### 3. Projects
1. **Projects → New Project**: name, owner, dates, priority.
2. Open a project. Tabs: **Overview, Work, Team, Session, Documents, Reports, Activity**.
3. **Team**: add people with a project role (Owner, Lead, Contributor, Reviewer, Viewer).
4. **Work → Tasks**: add a task, assign it, set the due date. The person does the work and presses **Submit**. A reviewer presses **Verify** (or sends it back). Each task keeps its **history**.
5. **Documents** tab: **Upload Document** puts a file in this project. It also appears in the Document Vault under the same project.

### 4. Work Log and Session
Write what you did today in the project's work log. The **Session** tab shows who worked when.

### 5. Documents (Document Vault)
1. **Documents** lists every file, grouped by project.
2. Upload: choose the project, pick the file, add details, **Upload**.
3. Click a document to see its details, versions, reviews and who opened it.
4. Rules: allowed file types and size limit are shown on the upload screen. Every upload is checked for viruses (ClamAV); an infected file is refused with a clear message.
5. Deleting asks for approval; deleted files go to the **Recycle Bin** and can be restored.
6. Download links expire for safety; open the document again for a fresh link.

### 6. KT (Knowledge Transfer)
- **Create KT / Work KT**: write a daily KT report for a project (what was done, what is pending, risks). Edit while it is a draft, then submit.
- **KT Reports**: see all reports, open one, filter by project and date.
- **Knowledge Books**: longer, lasting notes and guides.

### 7. Needs attention, Reminders, Notifications
- **Needs attention**: things waiting for you (tasks to verify, overdue work). **Verify/Open** takes you to that task.
- **Notifications** (bell): clicking one opens the exact task, document or report.
- **Reminders** (admins): set when the system reminds people.

### 8. Compliance and Reports
- **Compliance**: controls, status, evidence and remediation tasks.
- **Reports**: summaries you can view and export.
- **Search** (top bar): finds projects, tasks, documents and people.

---

## Part 2. For admins

### 9. Users and roles
- **Users → Add**: email, name, role. Either set a password or send an **invite link**.
- Roles: Super Admin, Admin, Security Admin, Security Analyst, Compliance Officer, Manager, User, Viewer. **Roles** page shows and adjusts permissions.
- To lock someone out: change status, or **sign out everywhere**. If someone loses their authenticator, reset their 2FA.

### 10. Audit Logs
Records who did what, when and from which IP.
1. Filter by several **actions, resources and people** at once, outcome (success/failed), IP, item id and **time range** (IST, with quick ranges).
2. Search also looks inside the details.
3. Click any value in the table to filter by it. Use the chips above the table to remove a filter.
4. Save a filter as a **view**; copy the address to share the same filter.
5. **Live** refreshes automatically; **Export CSV** downloads exactly what you filtered.
6. Click a row for the full details in plain words and a link to the item.

### 11. Settings pages
- **Mail settings**: SMTP for invites and reminders (test it).
- **SSO settings**: company sign-in, if used.
- **Backups**: make a backup now, set the schedule, download or restore.
- **Recycle Bin**, **Admin Control Center**, **Reminders**.

---

## Part 3. For the server owner

All commands run on the Ubuntu server in `/opt/dbi-security`.

| Task | Command |
|---|---|
| Update to the newest version | `git pull --ff-only && ./update.sh --force` |
| Backup now (DB + files + .env) | `./backup.sh` |
| Restore a backup | `./restore.sh backups/<folder>` |
| See what runs | `docker compose ps` |
| Logs | `docker compose logs -f api` |
| **Empty the system** | `./reset-data.sh admin@company.com` |

- `update.sh` takes a backup first, rebuilds, waits for the app to answer, and rolls back if it does not.
- Backups are kept in `backups/` (newest 14). Copy them to another machine regularly; they also contain `.env`, which holds the keys for 2FA secrets and mail passwords.
- Virus definitions: ClamAV updates itself when the server has internet; offline setup is in `README-DEPLOY.md`.

### Starting fresh (removing all data)
`./reset-data.sh <admin email>` removes projects, tasks, documents and their files, KT, reports, logs, notifications, teams, departments, compliance items and **all users except that one admin** (password and 2FA unchanged). Roles, permissions and settings (mail, SSO, backup, reminders) are kept. It makes a backup first, shows the counts, and only continues when you type `DELETE-ALL-DATA`.

---

## Part 4. A typical day, start to end
1. Admin adds users and a project, adds the team.
2. Owner creates tasks and assigns them.
3. People work, write the work log, upload documents in the project.
4. People **Submit** tasks; reviewers **Verify**. Anything waiting appears in **Needs attention** and notifications.
5. Each day, write the **KT report**.
6. Admin watches the dashboard, checks **Audit Logs** when needed, and backups run daily.
