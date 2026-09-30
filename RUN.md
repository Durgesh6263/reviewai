# ReviewAI - Project Run Guide

A quick and comprehensive guide to setting up and running the ReviewAI project locally.

---

## 📋 Prerequisites

Ensure you have the following installed:
- **Node.js** >= 18.x (v20+ recommended)
- **pnpm** >= 9.x (`npm install -g pnpm`)
- **Supabase Account** (or local Supabase instance) for PostgreSQL database & authentication
- *(Optional)* **OpenAI / Gemini API Key** for AI review analysis features
- *(Optional)* **Stripe Account** for billing & subscriptions

---

## 🚀 Step-by-Step Setup

### 1. Install Dependencies

From the project root:
```bash
pnpm install
```

---

### 2. Configure Environment Variables

#### Backend (`apps/backend/.env`)

If `apps/backend/.env` does not exist, copy from `.env.example`:
```bash
cp apps/backend/.env.example apps/backend/.env
```

**Essential variables:**
```env
PORT=4000
NODE_ENV=development
API_PREFIX=/api/v1
FRONTEND_URL=http://localhost:3000

# Supabase (Supabase Dashboard -> Project Settings -> API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key

# JWT (Random 32+ character strings)
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
JWT_REFRESH_SECRET=super_secret_refresh_jwt_key_at_least_32_characters_long

# Optional: AI & Stripe
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
STRIPE_SECRET_KEY=sk_test_...
```

#### Frontend (`apps/frontend/.env.local`)

If `apps/frontend/.env.local` does not exist, copy or create it:
```bash
cp apps/frontend/.env.example apps/frontend/.env.local
```

**Required variables:**
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

---

### 3. Database Setup (Supabase)

1. Apply the database migrations:
   ```bash
   pnpm run db:migrate
   ```

2. *(Optional)* Seed test/demo data:
   ```bash
   pnpm run db:seed
   ```

---

### 4. Run Development Servers

#### Option A: Run everything together (Recommended)
Run Turborepo from the root:
```bash
pnpm run dev
```
*This starts the shared packages, Express backend (`http://localhost:4000`), and Next.js frontend (`http://localhost:3000`) concurrently.*

#### Option B: Run services separately
- **Terminal 1 — Backend (Port 4000):**
  ```bash
  cd apps/backend
  pnpm run dev
  ```
- **Terminal 2 — Frontend (Port 3000):**
  ```bash
  cd apps/frontend
  pnpm run dev
  ```

---

## 🌐 URLs & Key Routes

| Service / Page | URL | Description |
| :--- | :--- | :--- |
| **Frontend App** | [http://localhost:3000](http://localhost:3000) | Landing page & main web application |
| **Admin Dashboard** | [http://localhost:3000/admin](http://localhost:3000/admin) | Business & system management |
| **Business Dashboard** | [http://localhost:3000/dashboard](http://localhost:3000/dashboard) | QR codes, analytics, review inbox |
| **Onboarding Wizard** | [http://localhost:3000/onboarding](http://localhost:3000/onboarding) | 8-step business setup flow |
| **Customer Review Flow** | [http://localhost:3000/r/:slug](http://localhost:3000/r/:slug) | Public QR-code landing & review flow |
| **Backend Health Check** | [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health) | API server health status |

---

## 🐳 Running with Docker

Run all services using Docker Compose:
```bash
# Build and run containers
docker-compose up -d

# View live logs
docker-compose logs -f

# Stop containers
docker-compose down
```

---

## 🛠️ Useful Commands

```bash
# Type checking across all workspaces
pnpm run type-check

# Linting
pnpm run lint

# Build all packages & apps for production
pnpm run build

# Run automated tests
pnpm run test

# Code formatting
pnpm run format
```

---

## ❓ Troubleshooting

| Issue | Solution |
| :--- | :--- |
| `pnpm: command not found` | Run `npm install -g pnpm` |
| `EADDRINUSE: 3000 / 4000` | Port already occupied. Stop conflicting processes or free the port. |
| JWT validation error | Ensure `JWT_SECRET` and `JWT_REFRESH_SECRET` in `.env` are at least 32 characters. |
| Packages not resolved | Run `pnpm run build` once to compile all `@reviewai/*` shared packages into `dist`. |
| Supabase connection error | Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `apps/backend/.env`. |