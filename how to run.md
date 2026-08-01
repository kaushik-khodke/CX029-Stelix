Backend Server + Ngrok (Auto-Tunnel for Voice Calls):

```bash
cd backend
python run_backend.py
# OR standard uvicorn (which also auto-starts ngrok):
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Frontend React App:

bash
cd frontend
npm run dev -- --port 3000
WhatsApp Gateway:

bash
node index.js
# Or inside whatsapp-gateway directory:
cd whatsapp-gateway
node index.js

That all.