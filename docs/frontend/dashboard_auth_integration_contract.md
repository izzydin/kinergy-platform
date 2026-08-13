# Dashboard Authentication Integration Contract (Track B — Step B4)

## 1. Architectural Overview

This document specifies the authoritative integration contract between the **Authentication Domain (AuthProvider)**, the **Application Shell (DashboardLayout, Header, Sidebar)**, and the **User Interface (UserMenu)** for the Kinergy Platform frontend.

It enforces strict separation of concerns, single-direction data flow, and clear responsibility boundaries.

---

## 2. Ownership Boundaries & Responsibility Matrix

| Component / Layer               | Ownership Responsibilities                                                                                                                                                                            | Prohibited Ownership (DO NOT ALLOW)                                                                                                                              |
| :------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`AuthProvider`**              | • Authentication lifecycle state machine (`status`)<br>• Authoritative client-side user identity (`currentUser`)<br>• Session recovery & silent refresh<br>• `login()` and `logout()` async mutations | • UI presentation or layout rendering<br>• Route navigation or window location manipulation                                                                      |
| **`DashboardLayout`**           | • Enterprise application shell layout framing<br>• Responsive navigation drawer state & slots<br>• Header, Sidebar, Content, and Footer placement                                                     | • Authentication state tracking or validation<br>• Role or permission authorization evaluation                                                                   |
| **`Sidebar`**                   | • Navigation section & item rendering<br>• Active route highlighting & collapse state<br>• Accessible keyboard navigation & mobile drawer                                                             | • Auth token handling or user claim parsing<br>• Role/permission filtering (unless specified by ADR)                                                             |
| **`UserMenu`**                  | • Displaying authenticated user profile info (`name`, `email`, `role`)<br>• Rendering accessible user dropdown menu<br>• Invoking `logout()` method exposed by `useAuth()`                            | • Direct HTTP fetch or API calls<br>• JWT decoding or token parsing<br>• Accessing `localStorage` / `sessionStorage`<br>• Manual `navigate('/auth/login')` calls |
| **`Router` / `ProtectedRoute`** | • Client-side routing & route transitions<br>• Unauthenticated redirect to Login (`/auth/login?redirect=...`)                                                                                         | • Layout wrapping logic or presentation shell                                                                                                                    |

---

## 3. Canonical Current-User Identity Contract

The `currentUser` shape is strictly defined by the canonical `AuthUser` interface in `modules/auth/domain/auth-state.types.ts`:

```typescript
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly roles: string[];
  readonly permissions: string[];
  readonly tenantId: string;
  readonly avatarUrl?: string;
}
```

### Identity Rules

1. `currentUser` exposed by `useAuth()` is the **sole authoritative representation** of client-side user identity.
2. `UserMenu` must **never** create a secondary user representation or independently fetch `/api/v1/auth/me`.
3. `UserMenu` displays only properties derived from `AuthUser`:
   - Avatar / Initials: Derived from `name` (e.g. `"Lead Architect"` → `"LA"`) or `avatarUrl`.
   - Display Name: `currentUser.name`.
   - Email: `currentUser.email`.
   - Primary Role Badge: `currentUser.roles[0]` (e.g., `"ADMIN"` / `"OPERATOR"`).

---

## 4. End-to-End Logout Lifecycle Sequence

```text
User Action
  ↓
Clicks "Sign Out" in <UserMenu />
  ↓
Calls `logout()` from `useAuth()` context
  ↓
AuthProvider executes `authTransport.clearSession()` & invalidates backend refresh token
  ↓
AuthProvider transitions `status` → 'UNAUTHENTICATED' and sets `currentUser` → null
  ↓
React re-renders top-level <ProtectedRoute /> boundary
  ↓
<ProtectedRoute /> detects status === 'UNAUTHENTICATED'
  ↓
Renders <Navigate to="/auth/login" replace />
```

### Key Contract Guarantee

`<UserMenu />` must **NOT** execute `navigate('/auth/login')` directly. Navigation occurs reactively when the authentication state machine transitions to `UNAUTHENTICATED`.

---

## 5. Failure & Edge Case Handling

| Edge Case / State                  | Expected Behavior                                                                                                        |
| :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **`BOOTSTRAPPING`**                | `DashboardLayout` is guarded by `ProtectedRoute`; shell only renders after session is `AUTHENTICATED`.                   |
| **User Info Unavailable**          | Fallback to default avatar initials and `"Authenticated User"` placeholder if `name` is empty.                           |
| **Logout In Progress**             | Disable "Sign Out" menu button and render inline spinner (`isLoggingOut` state).                                         |
| **Logout Failure (Network Error)** | `AuthProvider` forcibly clears local credentials even if network fails, ensuring state transitions to `UNAUTHENTICATED`. |
