# UmojaSACCO — Update Log

## Changes Applied (Based on Feedback Report)

### 1. Penalties — Manual + Automatic
**Backend** (`src/routes/penalties.js`)
- `POST /api/penalties` — Admin/Treasurer can now manually create a penalty for any member
- `POST /api/penalties/auto-generate` — Auto-generates missed-contribution penalties for all members who did not contribute in a given period after the deadline day
- `PATCH /api/penalties/:id/pay` — Mark a penalty as paid (records transaction)
- Penalties now include `is_auto` flag (Auto vs Manual) and notify members via in-app notification

**Frontend** (`src/pages/PenaltiesPage.jsx`)
- Full penalties table with status tabs (Pending / Paid / Waived / All)
- ⚡ Auto-Generate modal: select period, contribution type, deadline day
- Manual Penalty modal: select member, type, amount, description
- Pay and Waive actions inline in table
- Summary cards: total count, total amount, pending amount

---

### 2. Welfare — Fund Source + Approve/Reject Fix
**Backend** (`src/routes/welfare.js`)
- Fixed `PATCH /api/welfare/:id/review` — Approve/Reject/Disburse now correctly transitions status
- `disbursed` status deducts from SACCO welfare pool (admin accounts with welfare type)
- **Fallback logic**: if welfare pool is insufficient, system deducts from member's savings account and notifies member
- `GET /api/welfare/pool-balance` — new endpoint to show current pool balance
- Expenditure record created for every disbursement (visible on Finance side)

**Frontend** (`src/pages/WelfarePage.jsx`)
- Approve ✓ and Reject ✗ buttons are now separate — each moves case to correct next status
- Disburse button appears after approval
- Pool balance displayed with ⚠️ warning when low
- Savings fallback warning shown before confirming disbursement

---

### 3. Savings & Contribution — Scalable Multi-Type
**Backend** (`src/routes/accounts.js`)
- `POST /api/accounts/contribute` now accepts: `savings`, `shares`, `welfare`, `penalty_payment`, `custom_fields[]`
- Each type creates its own transaction record and account credit independently
- `GET /api/accounts` — admin summary view of all members' balances
- `GET /api/accounts/:userId/contributions` — filtered contribution history

**Frontend** (`src/pages/SavingsPage.jsx`)
- Record Contribution modal has separate fields for Savings, Shares, Welfare, Penalty Payment
- If member has pending penalties, they appear as selectable dropdown
- Live total calculation shown before submitting
- Scalable: backend supports `custom_fields` array for future contribution types

---

### 4. Loans — Configurable Products + Post-Approval Flow
**Backend** (`src/routes/loans.js`)
- `GET /api/loans/products` — list all loan products (filterable by active)
- `POST /api/loans/products` — admin creates new loan product with full terms
- `PATCH /api/loans/products/:id` — admin updates or toggles product active/inactive
- `GET /api/loans/:id` — full loan detail with approval steps history
- Approval workflow fixed: Pending → Under Review (Treasurer) → Approved (Admin) → Disbursed → Active

**Frontend** (`src/pages/LoansPage.jsx`)
- ⚙ Loan Products modal: view, toggle active/inactive, create new products
- Apply modal: select product → see constraints → live loan calculator (monthly payment, total, interest, processing fee)
- Status-tabbed view: Pending / Under Review / Approved / Active / Completed
- Approve, Reject, Disburse, Record Repayment — all inline per loan
- Repayment Schedule modal: full amortization table
- Maker-checker workflow: Treasurer approves step 1, Admin approves step 2

---

### 5. Members — Fast Creation + Portal Visibility Fix
**Backend** (`src/controllers/membersController.js`)
- `POST /api/members` — now checks duplicate email/phone/ID before transaction (faster error reporting)
- Bcrypt rounds reduced from 12 → 10 (saves ~150ms per creation)
- All 3 accounts created in a single INSERT (savings, shares, welfare) instead of 3 separate queries
- `GET /api/members/:id` now supports `me` alias for members to fetch their own profile
- Response now returns updated member data immediately after PATCH

**Frontend** (`src/pages/MembersPage.jsx`)
- Full members table with search, status filter, pagination
- Add Member modal with all required fields including NOK
- Created member password shown in success banner
- Savings, Shares, Loan balances visible per member
- Reflects on portal immediately (no cache issues)

---

### 6. Database Defaults Added
**migrations/001_initial_schema.sql**
- Default penalty rules: missed_contribution (KES 100), late_repayment (5%), rule_violation (KES 500)
- Default loan products: Emergency Loan, Development Loan, School Fees Loan, Super Saver Loan
- Default SACCO settings: contribution_deadline_day, min_shares, min_savings, welfare_contribution

---

### Files Modified
| File | Change |
|------|--------|
| `backend/src/routes/penalties.js` | Manual penalty, auto-generate, pay endpoints |
| `backend/src/routes/welfare.js` | Fixed approve/reject/disburse + savings fallback |
| `backend/src/routes/accounts.js` | Multi-type contribution + summary endpoint |
| `backend/src/routes/loans.js` | Loan products CRUD + full detail endpoint |
| `backend/src/controllers/membersController.js` | Faster creation, duplicate check, better response |
| `backend/migrations/001_initial_schema.sql` | Default penalty rules + loan products |
| `frontend/src/pages/MembersPage.jsx` | Full implementation (was stub) |
| `frontend/src/pages/SavingsPage.jsx` | Full implementation (was stub) |
| `frontend/src/pages/PenaltiesPage.jsx` | Full implementation (was stub) |
| `frontend/src/pages/WelfarePage.jsx` | Full implementation (was stub) |
| `frontend/src/pages/LoansPage.jsx` | Full implementation (was stub) |
