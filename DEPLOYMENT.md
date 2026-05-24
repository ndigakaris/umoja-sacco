# UmojaSACCO — Feature Update 002 Deployment Guide

## What's New in This Update

| Feature | Where |
|---|---|
| Member number auto-generated + **admin can customize** it before saving | Members page create form |
| **NOK Name is mandatory** (SASRA compliance, red asterisk + validation) | Members page & backend |
| **Second Next of Kin** — "Add 2nd NOK" button shows second NOK fields | Members page create/edit |
| **Contribution % slider** — 0–100 enforced, cannot exceed 100, color-coded | Members page, member profile |
| **Project Shares** — Create projects (Land, Tents…), assign member shares | New `/project-shares` page |
| **Bulk Import** — CSV import for savings, shares, welfare, loans, contributions, project shares | New `/import` page |
| Import History log | Import page → History tab |

---

## Files Changed

### Backend
```
backend/migrations/002_new_features.sql     ← NEW migration (run first)
backend/server.js                           ← Registers /api/projects and /api/imports
backend/src/controllers/membersController.js ← All new fields supported
backend/src/routes/projects.js             ← NEW: project share management API
backend/src/routes/imports.js              ← NEW: bulk import API
```

### Frontend
```
frontend/src/App.jsx                                    ← Added /project-shares and /import routes
frontend/src/components/layout/AppLayout.jsx            ← New nav items
frontend/src/pages/MembersPage.jsx                      ← All new member form features
frontend/src/pages/ProjectSharesPage.jsx               ← NEW page
frontend/src/pages/ImportPage.jsx                       ← NEW page
```

---

## Step-by-Step Deployment

### 1. Apply Database Migration (Neon)

Run this in your **Neon SQL console** or via your migration script:

```bash
# Option A: Run migration file directly via psql
psql $DATABASE_URL -f backend/migrations/002_new_features.sql

# Option B: If your npm run migrate picks up new files automatically,
# just deploy — it will detect and run 002_new_features.sql
```

**What the migration adds:**
- `profiles.nok2_name`, `nok2_relationship`, `nok2_phone`, `nok2_id_number` columns
- `profiles.contribution_pct` column (0–100, DB CHECK constraint)
- New `projects` table
- New `project_share_allocations` table
- New `bulk_imports` table
- Indexes and triggers for all new tables
- Two example projects (Land, Tents) seeded

### 2. Deploy Backend (Render)

1. Copy the changed backend files into your repo
2. Commit and push to GitHub:
   ```bash
   git add backend/
   git commit -m "feat(002): project shares, bulk import, second NOK, contribution pct, editable member no"
   git push origin main
   ```
3. Render auto-deploys on push. Watch the Render logs for:
   ```
   ✅ Database connected
   🚀 UmojaSACCO API running on port ...
   ```
4. Verify the new routes work:
   ```
   GET  https://your-render-app.onrender.com/api/projects
   POST https://your-render-app.onrender.com/api/imports/savings
   ```

**Important:** The `express.json` limit is now `20mb` (was `10mb`) to handle large CSV imports.

### 3. Deploy Frontend (Vercel)

1. Copy the changed frontend files into your repo
2. Commit and push:
   ```bash
   git add frontend/
   git commit -m "feat(002): project shares page, import page, updated members form"
   git push origin main
   ```
3. Vercel auto-deploys. Watch for build success.
4. Verify the new pages:
   - `https://your-vercel-app.vercel.app/project-shares`
   - `https://your-vercel-app.vercel.app/import`

---

## Bulk Import Usage Guide

### Supported Import Types

| Type | What it does |
|---|---|
| `contributions` | Credits savings + shares + welfare in one row |
| `savings` | Credits savings account |
| `shares` | Credits shares account |
| `welfare` | Credits welfare account |
| `loans` | Creates historical loan records |
| `project_shares` | Assigns member units to a project |

### How to Import

1. Go to **Import Records** in the sidebar
2. Select the import type on the left
3. Click **Download Template CSV** to get the correct column headers
4. Fill in your data (use your member numbers like `MBR-1001`)
5. Upload the CSV or paste it into the text box
6. Click **Parse & Preview** — verify the first 10 rows
7. Click **Import Records** and confirm
8. Review the success/error report

### CSV Format Notes

- **Date format:** `YYYY-MM-DD` (e.g. `2024-01-15`)
- **member_no:** Must exactly match existing member numbers (e.g. `MBR-1001`)
- **Amounts:** Numbers without currency symbol (e.g. `5000` not `KES 5,000`)
- **Maximum rows per import:** 2,000 (split larger datasets into batches)
- **Failed rows:** Are reported per-row with the reason — fix and re-import just those rows

### Loan Import Status Values
`draft` | `pending` | `approved` | `active` | `completed` | `defaulted`

### Project Shares Import
Create the project first in the **Project Shares** page, then import allocations.
The `project_name` column must exactly match the project name in the system.

---

## Project Shares Usage Guide

1. Go to **Project Shares** in the sidebar
2. Click **+ New Project** and fill in name, total value, share price
3. Click a project to open it
4. Click **+ Add Member** to assign shares to a member
5. Enter units, amount paid, and date
6. Members with shares appear in the project member table
7. Click **Edit** to update an existing allocation

---

## Contribution Percentage

- Shown as a slider (0–100%) in the member create/edit form
- Cannot exceed 100 — the slider and number input both enforce this
- Color-coded: green (100%), yellow (50%+), red (< 50%)
- Visible in the members list as a mini progress bar
- Stored in `profiles.contribution_pct`

---

## Member Number Customization

- By default, member numbers are auto-generated (`MBR-1042`)
- In the create member form, click **✎ Customize** to enter a custom number
- Format: uppercase letters, numbers, hyphens (e.g. `MBR-2001`, `OGP-001`)
- The system validates uniqueness before saving
- Admin can also update a member's number via PATCH `/api/members/:id` with `{ member_no: "NEW-001" }`

---

## Rollback Instructions

If you need to roll back:

**Frontend:** Revert to the previous commit on Vercel (use Vercel dashboard → Deployments → Redeploy previous)

**Backend:** Revert commit on Render (same approach) — the new routes just won't exist, the old ones are untouched.

**Database:** The migration only **adds** columns and tables — it never drops or modifies existing columns. Rolling back the code is safe; the new columns will simply be unused. If you want to fully remove them:
```sql
-- Only run if you want to fully remove the new tables
DROP TABLE IF EXISTS project_share_allocations;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS bulk_imports;
ALTER TABLE profiles DROP COLUMN IF EXISTS nok2_name;
ALTER TABLE profiles DROP COLUMN IF EXISTS nok2_relationship;
ALTER TABLE profiles DROP COLUMN IF EXISTS nok2_phone;
ALTER TABLE profiles DROP COLUMN IF EXISTS nok2_id_number;
ALTER TABLE profiles DROP COLUMN IF EXISTS contribution_pct;
```

---

## Environment Variables (unchanged)

No new environment variables are needed. The existing setup works:

```
# Backend (.env on Render)
DATABASE_URL=postgresql://...
JWT_SECRET=...
FRONTEND_URL=https://your-vercel-app.vercel.app

# Frontend (.env on Vercel)
REACT_APP_API_URL=https://your-render-app.onrender.com/api
```
