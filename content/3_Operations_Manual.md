# SnowfigIP Operations Manual (Expanded Edition)

## 1. Introduction and Scope
This expanded manual dictates the exact, step-by-step procedures for managing the SnowfigIP ecosystem. It is divided into extreme detail across three major operational tiers: **Administrators (IT & Infrastructure)**, **Management (Partners & Directors)**, and **Standard Users (Associates, Paralegals, and Direct Clients)**.

This is not a theoretical guide; it addresses genuine edge cases encountered in the production deployment of SnowfigIP.

---

## 2. Administrator Operations (IT, DevOps, Lead Partners)

### 2.1 The Crisis Playbook: Handling "Export Failed" or "Email Didn't Send"
If a user reports that a massive 10,000-row trademark report never arrived in their inbox, **do not restart the database**. Follow this flow:
1. **Check the Celery Queue**: The `SFIP-Reports` service runs via a Celery worker pool heavily dependent on Redis.
2. Log into the backend instance (Azure VM or AWS EC2).
3. Access the `SFIP-Reports/sfip_reports/` directory.
4. Run: `celery -A app.background_tasks inspect active`.
5. If the queue is jammed with `generate_matter_report` pending states, the worker is likely OOM (Out of Memory). 
6. **The Fix**: Run `sh restart_celery.sh` in the `SnowfigIP-BE` or `SFIP-Reports` root. This executes a massive kill signal (`kill_and_start_workers_beat_final.sh`) which elegantly flushes zombie workers and restarts the daemon.

### 2.2 Managing Users, Roles, and The "Zombie Data" Rule
If an associate leaves the firm, **NEVER DELETE THEIR USER ACCOUNT**.
* **Why**: The database relies on strict Foreign Keys mapping `Matter` timelines to `User.id` (e.g., `matter_docketed_by = models.ForeignKey(User...))`. Deleting the user will trigger a `models.CASCADE` or orphan critical audit logs, causing irrecoverable data loss regarding who authorized a million-dollar patent filing in 2018.
* **The Procedure**: 
  1. Access the Django Admin portal (`/admin/users/user/`).
  2. Locate the associate.
  3. Uncheck **`is_active`** and remove all assigned Groups.
  4. Save. This immediately invalidates their Next.js JWT tokens (they will receive a 401 on their next API call) but perfectly preserves the relational history.

### 2.3 Environmental Constraints (`.env`)
The infrastructure is extremely sensitive to `.env` mismatches. 
* `DATABASE_URL=postgres://user:password@host:5432/ipcms`: Must be identical across BE and Reports.
* `MAILGUN_API_KEY`: If this rotates, Celery tasks will silently fail. You must tail the worker logs to catch `401 Unauthorized` responses from the Mailgun API.

---

## 3. Management Operations

### 3.1 Financial Approvals and Invoice Finalization
Management interaction generally revolves around the `/billing` routes on the Next.js frontend.
1. **The Draft State**: When Associates log hours against an IRN (Internal Reference Number), it generates a *Draft Invoice*.
2. **Reviewing**: Navigating to `InvoiceReporting`, management reviews the line items. The frontend calculates totals securely via `helper.formatCurrency`, ensuring the Japanese Yen conversion matches the firm's localized rate.
3. **The Lock (Finalization)**: Clicking "Approve" triggers a `POST /api/invoice-reporting/v1/invoice-reporting/{id}/mark_completed/` request. 
   * **Behind the Scenes**: This flips the database enum to `COMPLETED`. The Django `signals.py` intercepts this save and fires a webhook to the firm's external ERP (e.g., Business Central). **This action is strictly immutable.** Once authorized, only an Administrator with direct SQL access can reverse an invoice.

### 3.2 Portfolio Analytics Generation
When preparing for a quarterly client review, partners utilize the `SFIP-Reports` generation pipeline.
* Select the filters on the frontend. The `dateRangeDecorator.js` utility ensures that "Q3" maps perfectly to the UTC timestamp range expected by the backend.
* **Warning**: A 50,000 row export takes roughly 3 to 6 minutes to compile, format into Python `openpyxl`, and dispatch via Mailgun. If the system says "Processing", **do not refresh and click Export again**. You will spawn multiple instances of the exact same heavy query, which can bottleneck the SQL connection pool.

---

## 4. Standard User Operations (Associates & Paralegals)

### 4.1 Matter Creation and "The IRN"
* **The Core Rule**: The "IRN" (Internal Reference Number) is the absolute central pivot of the entire application. 
* When creating a Matter (`/create-matter`), the system may automatically assign an IRN via `ipcms_new.matter.utils`. If you manually assign it, the backend validates uniqueness. You cannot have two matters with the same IRN.
* **Linking Applications**: If a US Patent (Matter A) is a divisional of an EU Patent (Matter B), you *must* use the "Associated Case" feature on the frontend to explicitly link them. This populate the `MatterAssociatedCase` model, allowing the system to automatically infer complex priority dates.

### 4.2 Handling The Deadline Tracker 
* Missing a deadline is mathematically prevented by the system, provided the initial dates are accurate.
* **The Math**: If you enter an `IPO Filing Date` of Jan 1, 2024, the backend calculates statutory limits (e.g., adding exactly 18 months for publication).
* **Escalations**: The tracking interface turns Red 15 days prior. You *must* click "Mark Completed" and upload the PDF receipt. Simply typing "Done" in the notes is invalid; the system requires a boolean flag to be toggled in the DB to halt the automated escalation emails that bombard the Management tier at T-Minus 24 hours.
