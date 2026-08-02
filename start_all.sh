#!/bin/bash

# ==========================================
# 🚀 STELIX (MYHEALTHCHAIN) CROSS-PLATFORM LAUNCHER (Linux/macOS)
# ==========================================

echo "=========================================="
echo "🏥 Starting Stelix Healthcare AI Platform"
echo "=========================================="

# 1. Start Backend Server
echo "🚀 Starting FastAPI Backend on port 8000..."
cd backend || exit
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# 2. Start WhatsApp Gateway
echo "📱 Starting WhatsApp Gateway on port 3001..."
cd whatsapp-gateway || exit
node index.js &
GATEWAY_PID=$!
cd ..

# 3. Start Frontend React App
echo "💻 Starting Frontend React App on port 3000..."
cd frontend || exit
npm run dev -- --port 3000 &
FRONTEND_PID=$!
cd ..

echo "=========================================="
echo "✅ All services successfully launched!"
echo "📍 Frontend:  http://localhost:3000"
echo "📍 Backend:   http://localhost:8000"
echo "📍 API Docs:  http://localhost:8000/docs"
echo "=========================================="

trap "kill $BACKEND_PID $GATEWAY_PID $FRONTEND_PID" EXIT
wait
