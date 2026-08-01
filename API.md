# 📖 Stelix (MyHealthChain) — Official REST API Specification

**Base URL**: `http://localhost:8000` (Local) / `https://cx029-stelix.onrender.com` (Production)  
**OpenAPI / Interactive Documentation**: `/docs` (Swagger UI) or `/redoc` (ReDoc)

---

## 🏥 1. System Health & Diagnostics

### `GET /health`
Returns system status, database connectivity health, Python version, and server timestamp.

#### Response (200 OK)
```json
{
  "status": "ok",
  "database": "healthy",
  "python_version": "3.12.0",
  "server_time": 1722510000.123,
  "timestamp": "2026-08-01T21:00:00.123456"
}
```

---

## 💊 2. Pharmacy & Order Management

### `POST /pharmacy/chat`
Submits a query to the specialized Pharmacy AI Agent to check stock, query medicines, or resolve refill requirements.

#### Request Body
```json
{
  "message": "Do I have any pending refills for Paracetamol?",
  "patient_id": "4720f774-69e0-4485-9b88-6f14cf8c287f",
  "language": "en"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "response": "You currently have 1 active refill available for Paracetamol (500mg)."
}
```

---

### `POST /place_order`
Webhook endpoint for ElevenLabs Voice AI or client interfaces to place pending medicine orders.

#### Request Body
```json
{
  "medicine_name": "Paracetamol",
  "quantity": "four",
  "patient_id": "4720f774-69e0-4485-9b88-6f14cf8c287f"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Order successfully placed for 4 units of Paracetamol.",
  "order_id": "e4252024-da83-47eb-a160-1c1338b47676",
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

---

## 🩺 3. Clinical Triage & ML Prediction

### `POST /predict-triage`
Evaluates patient vital signs and chief complaint using Scikit-Learn / XGBoost ML models to predict Emergency Severity Index (ESI) priority level.

#### Request Body
```json
{
  "chief_complaint": "Severe acute chest pain radiating to left arm",
  "age": 54,
  "systolic_bp": 155,
  "diastolic_bp": 95,
  "heart_rate": 112,
  "spo2": 93,
  "temp_celsius": 37.2
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "priority": "RED",
  "urgency_score": 92,
  "metrics_evaluated": {
    "chief_complaint": "Severe acute chest pain radiating to left arm",
    "vitals": {
      "bp": "155/95",
      "heart_rate": 112,
      "spo2": 93
    }
  }
}
```

---

## 📱 4. WhatsApp Integration

### `POST /send-whatsapp-health-report`
Dispatches an official AI Health Insight report directly to a patient's WhatsApp number via Baileys gateway.

#### Request Body
```json
{
  "user_id": "4720f774-69e0-4485-9b88-6f14cf8c287f",
  "phone": "8806275531"
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "message": "Official AI Health Report sent via WhatsApp to 8806275531!"
}
```
