# 🗂 FileShare — Frontend

React + Vite frontend for the FileShare application. Clean & light UI, Redux Toolkit for state, connected to the Django REST API backend.

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| React 18 | UI framework |
| Vite 5 | Build tool & dev server |
| React Router v6 | Client-side routing |
| Redux Toolkit | Global state management |
| React Hook Form | Form handling & validation |
| Axios | HTTP client with interceptors |
| Tailwind CSS v3 | Utility-first styling |

---

## Project Structure

```
fileshare-frontend/
├── public/
├── src/
│   ├── api/
│   │   ├── axios.js          # Axios instance, auth headers, token refresh interceptor
│   │   └── authApi.js        # All auth API calls (register, login, logout, etc.)
│   │
│   ├── store/
│   │   ├── index.js          # Redux store
│   │   └── authSlice.js      # Auth state: user, tokens, loading, errors
│   │
│   ├── hooks/                # Custom hooks (add here as app grows)
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Input.jsx     # Reusable input with label, error, password toggle
│   │   │   ├── Button.jsx    # Button with loading spinner, variants
│   │   │   └── Alert.jsx     # Error / success / info alert component
│   │   └── layout/
│   │       ├── AuthLayout.jsx      # Wrapper for auth pages (login, register)
│   │       ├── AppLayout.jsx       # Sidebar + Outlet for authenticated pages
│   │       └── ProtectedRoute.jsx  # Blocks unauthenticated access, redirects to /login
│   │
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── Login.jsx           # Login form, connected to backend
│   │   │   ├── Register.jsx        # Registration form, all fields + validation
│   │   │   ├── ForgotPassword.jsx  # Request password reset email
│   │   │   └── ResetPassword.jsx   # Set new password via token from email
│   │   ├── Dashboard.jsx           # Home after login: storage stats + quick actions
│   │   └── NotFound.jsx            # 404 page
│   │
│   ├── utils/
│   │   └── validators.js     # Validation rules that mirror backend (DRY)
│   │
│   ├── App.jsx               # Route definitions (public + protected)
│   ├── main.jsx              # Entry point, Redux Provider
│   └── index.css             # Tailwind directives + global component classes
│
├── index.html
├── vite.config.js            # Vite config with /api proxy to Django
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── .env.example
└── .gitignore
```

---

## Pages & Routes

| Route | Page | Auth required |
|-------|------|---------------|
| `/` | Redirects → `/login` or `/dashboard` | — |
| `/login` | Login | No |
| `/register` | Register | No |
| `/forgot-password` | Forgot Password | No |
| `/reset-password?token=...` | Reset Password | No |
| `/dashboard` | Dashboard | ✅ Yes |
| `/files` | My Files *(coming soon)* | ✅ Yes |
| `/sharing` | Shared Files *(coming soon)* | ✅ Yes |
| `/settings` | Settings *(coming soon)* | ✅ Yes |

---

## Step-by-Step Setup

### 1. Prerequisites

Make sure you have:
- Node.js **18+** installed → `node -v`
- The Django backend running at `http://localhost:8000`

### 2. Clone / copy the project

```bash
cd fileshare-frontend
```

### 3. Install dependencies

```bash
npm install
```

### 4. Set up environment variables

```bash
cp .env.example .env
```

The default `.env` points to `http://localhost:8000` — no changes needed for local development.

### 5. Start the dev server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

> **Note:** The Vite dev server proxies all `/api` requests to the Django backend automatically. You don't need to touch CORS settings during development.

### 6. Make sure the backend is running

In a separate terminal, from your Django project:

```bash
source venv/bin/activate
python manage.py runserver
```

---

## How Auth Works

```
User fills form
    ↓
React Hook Form validates (client-side, mirrors backend rules)
    ↓
Redux Thunk dispatches API call via Axios
    ↓
Backend returns { success, message, data: { tokens, user } }
    ↓
authSlice stores tokens in Redux + localStorage
    ↓
Axios interceptor auto-attaches Bearer token to every future request
    ↓
On 401 → interceptor auto-refreshes token silently
    ↓
On logout → tokens blacklisted on backend + cleared from Redux + localStorage
```

---

## Adding New Pages (when you're ready)

1. Create `src/pages/YourPage.jsx`
2. Create `src/api/yourApi.js` with the API calls
3. Add a route in `src/App.jsx` inside the `<ProtectedRoute>` block
4. Add a `<NavItem>` to `AppLayout.jsx` sidebar

That's it — auth, tokens, and layout are already wired.

---

## Build for Production

```bash
npm run build
```

Output goes to `dist/`. Set `VITE_API_BASE_URL` in your `.env` to your production backend URL before building.

---

## Pushing to GitHub

```bash
git init
git add .
git commit -m "feat: initial frontend — auth pages + dashboard"
git remote add origin https://github.com/your-username/fileshare-frontend.git
git push -u origin main
```

> The `.gitignore` already excludes `node_modules/`, `dist/`, and `.env`.