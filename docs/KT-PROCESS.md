# Login and the complete KT process

## A. First login (admin)

1. Open `https://192.168.31.158:8443` (certificate warning: **Advanced → Continue**). Press **Ctrl+Shift+R**.
2. Email: `admin@dbi.example.com`. Password: the one set for this account. If it was never changed, it is the starting password from the server's `.env` (`SEED_ADMIN_PASSWORD`, default `Admin@123`). To see it: `grep SEED_ADMIN_PASSWORD /opt/dbi-security/.env` (nothing printed = the default).
3. Admin roles must use 2FA. Already set up: type the 6-digit code from your authenticator app. First time: scan the QR code with Google/Microsoft Authenticator, type the code, and **save the recovery codes** (they are the only way in if the phone is lost).
4. Change the password: **Settings**.

## B. Before KT can start (once)

1. **Users → Add user**: create each person (email, name, role USER or MANAGER). Choose a password, or send the invite link (needs Mail settings).
2. **Projects → New Project**: name, owner, dates, priority. Save.
3. Open the project → **Team** tab → add the people with a project role: Owner, Lead, Contributor, Reviewer or Viewer.

## C. What KT means here

KT (Knowledge Transfer) = a lasting record of what was done on a project, so someone else can take over. There are four ways to build it. Use any of them; all KT documents end up in the **Document Vault** under the project.

### C1. Work KT (recorded while you work) — best for daily KT
1. Open the project → **Session** tab.
2. Press **Start work**. Choose the tool you work in. Allow **Share screen** and pick the whole screen if the system asks.
3. Work normally. Screenshots are taken while the work runs.
4. Write **notes** in the Work note box: what you did, what you found, what is pending. Press **Save note** after each point.
5. Stop the work when you finish (stop button on the same panel). A running session blocks the KT, so stop first.
6. **Work KT → Generate KT**. It puts all finished sessions, notes and screenshots into one document. Each time you generate, the **same document gets a new version** (v1, v2, v3 …).
7. Open it from the Document Vault.

Screenshots are deleted after the retention period; notes and the generated KT stay.

### C2. Create KT (merge files people uploaded)
1. People upload their files in the project: **Documents** tab → **Upload Document**.
2. On the project **Documents** tab (or the Document Vault) press **Create KT**.
3. Pick the project, then the kind: **Images**, or **Documents** as PDF (merged into one PDF), Word, Excel, Other (kept intact in one ZIP).
4. Press **Create KT file**. Files are put together in upload order, each marked with who uploaded it and when. The result is saved in the Document Vault.

### C3. Daily KT report (written form)
1. **KT Reports → New** (or `/kt-reports/new`).
2. Choose the project and date, fill: what was done, what is pending, risks/blockers. Save as draft, edit if needed, then submit.
3. Open **KT Reports** any time to read, filter by project/date, or edit.

### C4. Knowledge Book (long-lasting guide)
**Knowledge Books** is for things that stay true for months: how a system works, runbooks, contacts. Write it once, update when it changes.

## D. Review and finish the KT

1. Contributor finishes a task and presses **Submit**; the reviewer gets it in **Needs attention** and presses **Verify** (or sends it back with a comment). The task history keeps every step.
2. Check the project **Documents** tab: the KT file is there with its version.
3. Open the document to see details, versions and who opened it.
4. Project closing: make sure the last Work KT is generated, the KT report is submitted, all tasks are verified, and open items are written in the KT report.

## E. When a person leaves

Admin → **Users** → open the person → **Hand over work**. Pick who receives it. The tasks and responsibilities move to that person, and the history stays. Then set the leaver's status to inactive.

## F. One full example (about 20 minutes)

1. Admin logs in (A), creates user "Ravi" and project "Server Hardening" (B).
2. Ravi logs in, opens the project → **Session** → **Start work**, works, writes 3 notes, stops.
3. **Generate KT** → document "Work KT – Server Hardening v1" in the Document Vault.
4. Ravi uploads two files in the project **Documents** tab, then **Create KT → Documents → PDF → Create KT file**.
5. Ravi writes the daily KT report and submits it.
6. The reviewer verifies Ravi's task. Admin checks **Audit Logs** to see all of it.
