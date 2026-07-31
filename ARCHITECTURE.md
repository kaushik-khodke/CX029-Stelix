# 🏗️ MyHealthChain - System Architecture Diagram

Below is the complete, high-level system architecture of **MyHealthChain (AI-Powered National Emergency Triage & Hospital Command System)**.

---

## 📐 System Architecture Diagram (Mermaid)

```mermaid
flowchart TB
    subgraph CLIENTS ["1. Client Interfaces & Physical Touchpoints"]
        direction LR
        P_APP["🩸 Patient Web App<br/>(React / Vite)"]
        CARD["💳 Smart Health Card<br/>(Physical QR + PIN)"]
        DOC_APP["🥼 Doctor Portal<br/>(React / Vite)"]
        HOSP_DASH["🏥 Hospital Command Center<br/>(Realtime Dashboard)"]
        WA_APP["📱 WhatsApp User Interface<br/>(Doctor & Patient Messaging)"]
        VOICE_PHONE["📞 Telephony Callers<br/>(Phone Line Patients)"]
        AMB_GIS["🚑 Ambulance Fleet GIS<br/>(Routing & Intake)"]
    end

    subgraph GATEWAY ["2. Integration & Gateway Layer"]
        API_GATEWAY["⚡ FastAPI Backend Engine<br/>(Port 8000 / Uvicorn)"]
        WA_GATEWAY["🟢 WhatsApp Gateway Bridge<br/>(Node.js Baileys API)"]
        VOICE_AGENT["🎙️ Conversational Voice AI<br/>(Twilio + ElevenLabs SDK)"]
        STRIPE_PAY["💳 Stripe Payment Gateway<br/>(Automated Checkout)"]
        IPFS_PINATA["🌐 Decentralized Storage<br/>(Pinata IPFS Network)"]
    end

    subgraph AI_ENGINE ["3. AI / ML Intelligence Core"]
        direction TB
        XGB_TRIAGE["🧠 XGBoost ESI Triage Model<br/>• Predicts RED / ORANGE / YELLOW / GREEN / BLUE<br/>• Realtime Priority Queue Re-sorting"]
        RF_RISK["🌲 Random Forest Risk Model<br/>• Regex OCR Vitals Extractor<br/>• Health Risk: Healthy / Warning / Critical"]
        FORECAST_4S["📈 4-Signal Inflow & Deterioration Forecast<br/>• Time Patterns (4-wk rolling avg)<br/>• Bed Occupancy Pressure Multiplier<br/>• IPFS Chronic Disease Vector Scans<br/>• Seasonal Multipliers (Summer/Monsoon/Winter)"]
        GEMINI_COMMAND["✨ Gemini 2.0 Flash Strategic Analyzer<br/>• Command Center Ops Report Generator<br/>• Clinical Risk & Bottleneck Detection"]
    end

    subgraph DATA_LAYER ["4. Database & Storage Layer (Supabase PostgreSQL)"]
        direction TB
        DB_TRIAGE["📋 Triage Queue & Vitals"]
        DB_BEDS["🛏️ Hospital Beds & Ward Balancer"]
        DB_RES["📦 Medical Equipment & Blood Bank"]
        DB_DOCS["👨‍⚕️ Doctors & Shift Assignments"]
        DB_SNAPS["📊 Load Snapshots & Forecast Logs"]
        DB_DOC_CHUNKS["📄 IPFS Document Chunks & OCR Embeddings"]
    end

    %% Client Interactions
    P_APP <-->|Upload Records & View Vitals| API_GATEWAY
    CARD -->|QR Scan + PIN Verification| DOC_APP
    DOC_APP <-->|Request Patient Access & Prescribe| API_GATEWAY
    HOSP_DASH <-->|Realtime Triage & Resource Allocation| API_GATEWAY
    AMB_GIS -->|Send Inbound ER Vitals & Routing| API_GATEWAY
    WA_APP <-->|Receive Shift Notifications & Alerts| WA_GATEWAY
    VOICE_PHONE <-->|Conversational Voice Order| VOICE_AGENT

    %% Gateway to Backend
    WA_GATEWAY <-->|REST Webhooks| API_GATEWAY
    VOICE_AGENT <-->|Webhook Callback & Stripe Links| API_GATEWAY
    API_GATEWAY <-->|Create Payment Link| STRIPE_PAY
    API_GATEWAY <-->|Encrypted Record Upload / Download| IPFS_PINATA

    %% Backend to AI Engine
    API_GATEWAY -->|Raw Vitals (HR, BP, SpO2, Temp)| XGB_TRIAGE
    API_GATEWAY -->|OCR Prescription Text| RF_RISK
    API_GATEWAY -->|Queue & IPFS Vector Signals| FORECAST_4S
    API_GATEWAY -->|System Snapshot Counts| GEMINI_COMMAND

    %% AI Engine back to Gateway
    XGB_TRIAGE -->|Priority Level & Confidence %| API_GATEWAY
    RF_RISK -->|Parsed Risk Profile| API_GATEWAY
    FORECAST_4S -->|+1h & +4h Inflow Forecast| API_GATEWAY
    GEMINI_COMMAND -->|Structured Ops Report & Resource Alerts| API_GATEWAY

    %% Backend to Supabase Data Layer
    API_GATEWAY <-->|Read / Write Triage Data| DB_TRIAGE
    API_GATEWAY <-->|Manage Bed Allocations| DB_BEDS
    API_GATEWAY <-->|Query Inventory & Equipment| DB_RES
    API_GATEWAY <-->|Update Doctor Shifts| DB_DOCS
    API_GATEWAY <-->|Log Hourly Load Snapshots| DB_SNAPS
    API_GATEWAY <-->|Fetch Vector Chunks for Risk Engine| DB_DOC_CHUNKS

    %% Styling
    classDef clientStyle fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#fff;
    classDef gatewayStyle fill:#0f172a,stroke:#818cf8,stroke-width:2px,color:#fff;
    classDef aiStyle fill:#31103f,stroke:#c084fc,stroke-width:2px,color:#fff;
    classDef dataStyle fill:#064e3b,stroke:#34d399,stroke-width:2px,color:#fff;

    class P_APP,CARD,DOC_APP,HOSP_DASH,WA_APP,VOICE_PHONE,AMB_GIS clientStyle;
    class API_GATEWAY,WA_GATEWAY,VOICE_AGENT,STRIPE_PAY,IPFS_PINATA gatewayStyle;
    class XGB_TRIAGE,RF_RISK,FORECAST_4S,GEMINI_COMMAND aiStyle;
    class DB_TRIAGE,DB_BEDS,DB_RES,DB_DOCS,DB_SNAPS,DB_DOC_CHUNKS dataStyle;
```

---

## 🔍 Layer-by-Layer Architectural Overview

### Layer 1: Client Touchpoints & Physical Interfaces
- **Patient Web App**: Built with React, TypeScript & Vite. Allows document uploads to IPFS, symptom checking, and Smart Health Card management.
- **Smart Health Card (QR + PIN)**: Physical card with QR code mapped to encrypted IPFS records. Requires 4-digit PIN verification to grant doctor access.
- **Hospital Command Center**: High-density dashboard with real-time WebSocket subscriptions to Supabase for immediate emergency queue updates.
- **WhatsApp Gateway (Baileys API)**: Node.js gateway bridging WhatsApp for instant doctor shift confirmation and emergency capacity alerts.
- **Telephony (Twilio + ElevenLabs)**: Allows non-smartphone patients to speak with an AI assistant over standard phone lines.

### Layer 2: API Gateway & Integration Layer
- **FastAPI Core (`main.py`)**: High-performance asynchronous Python backend managing authentication, CORS, routing, and database communication.
- **Pinata IPFS Integration**: Hashes and encrypts patient files for decentralized storage with auto-expiring consent locks.
- **Stripe Integration**: Automated checkout link generation for voice-ordered prescriptions.

### Layer 3: Artificial Intelligence Core
- **XGBoost ESI Triage Engine (`ml_triage.py`)**: Evaluates incoming ER vitals and outputs Emergency Severity Index priority levels (**RED**, **ORANGE**, **YELLOW**, **GREEN**, **BLUE**).
- **Random Forest Risk Engine (`ml_engine.py`)**: RegEx-based OCR parsing + Random Forest classifier to categorize chronic health risks (**Healthy**, **Warning**, **Critical**).
- **4-Signal Inflow & Deterioration Forecast Engine (`resource_load.py`)**: Integrates time-series signals, hospital bed pressure, IPFS chronic disease vector scans, and seasonal weather patterns to forecast +1h and +4h incoming patient volume.
- **Gemini 2.5 Flash Strategic Command Center**: Analyzes bed capacities, medical staff load, and inventory levels to output executive strategic actions and system overload warnings.

### Layer 4: Storage & Realtime Database (Supabase PostgreSQL)
- **Realtime Subscriptions**: Enables instant multi-terminal sync when patient priority changes or beds are assigned.
- **IPFS Document Chunks**: Enables vector search across patient medical histories without storing raw unencrypted files centrally.
