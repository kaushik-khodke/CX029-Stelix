# 🚀 How to Run Stelix (MyHealthChain)

This document provides complete instructions to set up, configure, and launch all services of the **Stelix** healthcare platform locally or via cross-platform launch scripts.

---

## 📋 Prerequisites
* **Node.js**: v18.0.0 or higher
* **Python**: v3.10 or higher
* **Supabase Account**: Managed PostgreSQL Database with `pgvector` enabled

---

## 🗄️ 1. Database Setup (Supabase)

1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. Run the SQL schema files located in the project root:
   - Run `overall.sql` (Creates profiles, patients, doctors, orders, refills, and routines tables).
   - Run `supabase_resource_balancer.sql` (Resource forecast tables).
   - Run `supabase_triage.sql` (Triage history tables).

---

## ⚙️ 2. Environment Configuration

1. Copy `.env.example` to `.env` in the `backend/` directory:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Fill in your **Supabase URL**, **Service Role Key**, **Gemini API Key**, and **Stripe Keys**.

---

## 🚀 3. Quick Launch Options

### Option A: Automatic Cross-Platform Launch Scripts (Recommended)

#### On Windows (PowerShell):
```powershell
.\start_all.ps1
```

#### On Linux / macOS (Bash):
```bash
chmod +x start_all.sh
./start_all.sh
```

---

### Option B: Manual Service Launch

#### 1. Backend Server + Auto Ngrok Tunnel:
```bash
cd backend
python run_backend.py
# OR standard Uvicorn:
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend React Web Application:
```bash
cd frontend
npm install
npm run dev -- --port 3000
```

#### 3. WhatsApp Gateway Service:
```bash
cd whatsapp-gateway
npm install
node index.js
```

---

## 🧪 4. Running Automated Tests

### Backend Unit Tests (Pytest):
```bash
cd backend
pytest tests/ -v
```

### Frontend Type Check:
```bash
cd frontend
npx tsc --noEmit
```