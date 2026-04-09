# SahayakNet-AI

### AI-powered emergency response network for faster, smarter disaster relief.

![Winner](https://img.shields.io/badge/BIT%20Sindri%20Hackatron%203.0-1st%20Prize-gold)
![Status](https://img.shields.io/badge/status-prototype%20to%20production--ready-0a7ea4)
![Frontend](https://img.shields.io/badge/frontend-Next.js%20%7C%20React-111827)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688)
![AI](https://img.shields.io/badge/AI-YOLOv8%20%2B%20OpenCV-orange)
![Comms](https://img.shields.io/badge/communication-Twilio%20WhatsApp%20%7C%20SMS%20%7C%20IVR-25D366)
![Maps](https://img.shields.io/badge/mapping-Leaflet-199900)

## 🏆 Achievement

**Winner - 1st Prize at BIT Sindri Hackatron 3.0** for building an AI-first, multi-channel disaster coordination platform.

## 🚀 Overview

SahayakNet-AI enables citizens, NGOs, volunteers, and authorities to coordinate rescue operations in real time.
It unifies emergency intake, AI-assisted prioritization, volunteer dispatch, and mission tracking in one operational platform.

## ✨ Core Features

- **WhatsApp SOS Chatbot (Twilio):** Guided emergency reporting with structured intake.
- **Multi-Channel Ingestion:** WhatsApp, SMS, IVR, missed calls, web requests, and drone-triggered events.
- **Drone AI Detection:** YOLOv8 + OpenCV surveillance auto-generates rescue requests from aerial intelligence.
- **Command Center Dashboard:** Live map, alerts, risk insights, and operational analytics for rapid decisions.
- **Autonomous Assignment Engine:** Priority + proximity based volunteer allocation.
- **Mission Tracking and ETA Flow:** End-to-end visibility from assignment to completion.
- **Zone-Based Broadcast Alerts:** Channel-aware public advisories based on weather and risk context.
- **Priority Classification:** Low, Medium, High risk triage for faster critical response.
- **Duplicate Detection and Merge:** Prevents duplicate ticket noise during high-volume incidents.
- **Offline-Resilient Concepts:** Queue-and-sync workflow for degraded network conditions.

## 🧠 Why This Matters

- Reduces emergency response delay when minutes are critical.
- Prevents coordination chaos by centralizing channels and operations.
- Improves rescue efficiency through smart triage and auto-assignment.
- Builds disaster resilience for low-connectivity and high-stress conditions.

## 🏗️ Architecture Overview

```text
[Citizens / Sensors / Drones]
          |
          v
[WhatsApp | SMS | IVR | Web | Drone APIs]
          |
          v
[FastAPI Ingestion Layer]
  - validation
  - deduplication
  - priority scoring
  - resource estimation
          |
          v
[Assignment + Mission Engine]
  - volunteer matching
  - status transitions
  - ETA and tracking
          |
          v
[NGO Command Center Dashboard]
  - live map
  - analytics
  - alert controls
          |
          v
[Volunteers + Broadcast Channels]
```

### State and Caching

- In-memory operational state for requests, missions, volunteers, and alerts.
- Dashboard snapshots for fast reads under high event load.
- Short-window dedup indexes to suppress repeated incident creation.

## ⚙️ How It Works

1. An incident is reported from WhatsApp/SMS/IVR/web/drone.
2. Backend normalizes data and checks for duplicates.
3. Priority is computed and risk category is assigned.
4. Best-fit volunteer is auto-assigned by zone and availability.
5. Mission status flows from assigned to on-the-way to completed.
6. Dashboard updates in real time, with alerts and operational metrics.

## 🔌 API Endpoints Overview

- **Requests:** `POST /request`, `POST /requests`, `GET /requests`, `GET /request/{request_id}`
- **Assignment and Missions:** `POST /assign`, `POST /auto-assign`, `POST /mission/start`, `POST /complete`
- **Volunteer Ops:** `POST /volunteer`, `GET /volunteers`, `POST /volunteer/status`, `POST /volunteer/accept`, `POST /volunteer/reject`
- **Channel Intake:** `POST /whatsapp`, `POST /sms`, `POST /ivr`, `POST /missed-call`
- **Drone AI:** `POST /drone`, `POST /drone/detect`, `POST /predict`, `GET /drone/frame/{filename}`
- **Alerts and Insights:** `POST /alerts`, `POST /broadcast`, `GET /alerts/history`, `GET /weather`, `GET /risk-analysis`, `GET /dashboard`

## 📁 Folder Structure

```text
sahayaknet/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── data.json
│   ├── whatsapp_requests.json
│   └── events/
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── command-center/
│   │   ├── government/
│   │   ├── volunteer/
│   │   └── citizen/
│   ├── components/
│   └── lib/
├── package.json
└── README.md
```

## 🛠️ Installation and Setup

### Prerequisites

- Node.js 20+
- Python 3.10+
- pip and virtual environment support

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend

```bash
npm install
```

## ▶️ Running the Project

### Start Backend

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Start Frontend

```bash
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## 🔮 Future Scope

- Persistent database and event streaming for scale.
- Smarter routing and dynamic ETA with disaster-aware map layers.
- Multilingual conversational AI for regional emergency communication.
- Edge drone processing with intermittent sync.
- Inter-agency audit logs and policy-driven response workflows.

## 🤝 Contributors

Contributions are welcome.

