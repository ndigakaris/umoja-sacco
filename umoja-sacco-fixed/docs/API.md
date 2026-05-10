# UmojaSACCO API Reference

Base URL: `http://localhost:5000/api`

All protected endpoints require: `Authorization: Bearer <accessToken>`

---

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | None | Self-register as member |
| POST | `/auth/login` | None | Login, returns access + refresh tokens |
| POST | `/auth/refresh` | None | Rotate refresh token |
| POST | `/auth/logout` | None | Revoke refresh token |
| GET | `/auth/me` | Required | Get current user profile |

### Login Request
```json
{ "email": "admin@umojasacco.co.ke", "password": "Admin@1234" }
```

### Login Response
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "member_no": "ADMIN-001", "full_name": "James Mwangi", "role": "admin" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

---

## Dashboard

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/dashboard` | admin, treasurer, auditor | KPI summary |
| GET | `/dashboard/trend` | admin, treasurer, auditor | 7-month financial trend |

---

## Members

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/members` | admin, treasurer, auditor | List members (pagination, search) |
| POST | `/members` | admin | Create member |
| GET | `/members/:id` | authenticated | Get member detail |
| PATCH | `/members/:id` | admin, treasurer | Update member/profile |
| PATCH | `/members/:id/kyc` | admin, treasurer | Verify/reject KYC |
| GET | `/members/:id/statement` | authenticated | Mini statement |

**Query params:** `?search=&status=active&kyc_status=pending&page=1&limit=20`

---

## Accounts

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/accounts/:userId` | authenticated | Get user accounts |
| POST | `/accounts/contribute` | admin, treasurer | Record contribution |

---

## Loans

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/loans` | authenticated | List loans |
| POST | `/loans` | authenticated | Apply for loan |
| POST | `/loans/:id/approve` | admin, treasurer | Approve/reject (maker-checker) |
| POST | `/loans/:id/disburse` | admin, treasurer | Disburse approved loan |
| POST | `/loans/:id/repay` | admin, treasurer | Record repayment |
| GET | `/loans/:id/schedule` | authenticated | Get repayment schedule |

### Apply Loan Request
```json
{
  "product_id": "uuid",
  "principal": 250000,
  "term_months": 24,
  "purpose": "Home improvement",
  "guarantor_ids": ["uuid1", "uuid2"]
}
```

### Approve Loan Request
```json
{ "action": "approved", "comment": "All documents verified" }
```

---

## Welfare

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/welfare` | authenticated | List welfare cases |
| POST | `/welfare` | authenticated | File welfare case |
| PATCH | `/welfare/:id/review` | admin, treasurer | Approve/reject/disburse |

### File Welfare Request
```json
{
  "category": "bereavement",
  "amount": 30000,
  "description": "Loss of spouse on 12 Jan 2025"
}
```

---

## Penalties

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/penalties` | authenticated | List penalties |
| GET | `/penalties/rules` | authenticated | Get penalty rules |
| PUT | `/penalties/rules` | admin | Update penalty rules |
| PATCH | `/penalties/:id/waive` | admin | Waive a penalty |

---

## Transactions

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/transactions` | authenticated | Full ledger (filterable) |

**Query params:** `?user_id=&type=savings&from=2025-01-01&to=2025-01-31&page=1&limit=50`

---

## Reports

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/reports/income-expenditure` | admin, treasurer, auditor | I&E summary |
| GET | `/reports/loan-book` | admin, treasurer, auditor | Full loan book |

---

## Audit Logs

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/audit` | admin, auditor | Immutable audit log |

---

## Standard Response Format

```json
{
  "success": true,
  "data": { ... },
  "pagination": { "page": 1, "limit": 20, "total": 1284, "pages": 65 }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Valid email required" }]
}
```

### HTTP Status Codes
- `200` OK
- `201` Created
- `400` Bad Request
- `401` Unauthorized (token missing or expired)
- `403` Forbidden (insufficient role)
- `404` Not Found
- `409` Conflict (duplicate email/ID)
- `422` Validation Error
- `429` Too Many Requests
- `500` Internal Server Error
