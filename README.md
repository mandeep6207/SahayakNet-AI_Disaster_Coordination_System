# SahayakNet-AI

AI-powered disaster management and emergency response platform for real-time coordination between citizens, NGOs, and volunteers.

## Achievement

🏆 This project won 1st Prize at BIT Sindri Hackatron 3.0.

## Features

- Twilio-powered WhatsApp chatbot for SOS reporting and guided request capture.
- Multi-channel intake pipeline: WhatsApp, SMS, IVR, missed-call callbacks, and drone detections.
- Drone AI surveillance using YOLOv8 + OpenCV for automatic emergency request generation.
- Real-time NGO command center with map intelligence, alerts, risk insights, and operational analytics.
- Autonomous volunteer assignment using location proximity, availability, and request priority.
- Live mission lifecycle tracking with status updates and ETA-aware response flow.
- Zone-based broadcast alert engine with weather/risk-aware communication triggers.
- Priority-based rescue classification (Low/Medium/High) with severity-aware escalation.
- Duplicate request detection and merge logic to prevent operational noise.
- Offline/disaster-resilient communication concepts with queued synchronization behavior.

## Tech Stack

- Frontend: Next.js, React, Tailwind CSS
- Backend: FastAPI (Python)
- AI/ML: YOLOv8, OpenCV, NumPy
- Communication: Twilio WhatsApp API, SMS, IVR
- Mapping: Leaflet and map overlays
- Realtime: Async processing, background tasks, cached dashboard snapshots

## Architecture Overview

High-level flow:

Input Channels -> Ingestion APIs -> Validation + Dedup + Prioritization -> Assignment Engine -> Command Center Dashboard -> Volunteer Mission Execution

Core architecture components:

- Input channels: Citizens and field systems submit events via WhatsApp, SMS, IVR, web forms, and drone detections.
- Processing layer: FastAPI services normalize payloads, classify severity, calculate resources, detect duplicates, and enrich geospatial metadata.
- Assignment layer: Auto-assignment matches requests to best-fit volunteers by zone, proximity, and current workload.
- Operations layer: Dashboard APIs provide compact/full snapshots, live alerts, and mission status views for NGOs/government coordinators.
- Communication layer: Broadcast and channel-specific responses (SMS/WhatsApp/IVR/app) close the response loop.

State management and caching:

- In-memory operational stores maintain active requests, missions, volunteers, alerts, and assignment tracking.
- Dashboard cache snapshots reduce repeated aggregation overhead and improve responsiveness during spikes.
- Duplicate indexes and short-window event tracking prevent repeated request creation from the same incident.

Request lifecycle:

1. Intake: Request enters from channel.
2. Normalize: Data is validated, location-normalized, and source-tagged.
3. Prioritize: Risk score and urgency are computed.
4. Deduplicate: Similar active requests are merged or linked.
5. Assign: Best volunteer is selected and notified.
6. Execute: Mission progresses through accepted, on-the-way, and completion states.
7. Analyze: Metrics update command center analytics and historical alert feeds.

## System Workflow

1. Citizen or sensor generates an emergency signal.
2. FastAPI intake endpoints parse and classify the event.
3. Priority engine labels risk and required resource profile.
4. Duplicate detection merges equivalent incidents.
5. Assignment system dispatches nearest suitable volunteer.
6. Command center tracks mission progress and ETA in real time.
7. Broadcast module pushes zone-specific advisories when risk thresholds are crossed.

## API Endpoints Overview

Representative backend endpoints:

- Request management: `POST /request`, `POST /requests`, `GET /requests`, `GET /request/{request_id}`
- Assignment and missions: `POST /assign`, `POST /auto-assign`, `POST /mission/start`, `POST /complete`
- Volunteer operations: `POST /volunteer`, `GET /volunteers`, `POST /volunteer/status`, `POST /volunteer/accept`, `POST /volunteer/reject`
- Multi-channel intake: `POST /whatsapp`, `POST /sms`, `POST /ivr`, `POST /missed-call`
- Drone intelligence: `POST /drone`, `POST /drone/detect`, `POST /predict`, `GET /drone/frame/{filename}`
- Alerts and analytics: `POST /alerts`, `POST /broadcast`, `GET /alerts/history`, `GET /weather`, `GET /risk-analysis`, `GET /dashboard`

## Installation and Setup

Prerequisites:

- Node.js 20+
- Python 3.10+
- pip and virtual environment support

1. Clone repository and enter project directory.
2. Setup backend environment.
3. Install frontend dependencies.
4. Configure environment variables (Twilio credentials, webhook/public URL, optional map/weather keys).

Backend setup:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Frontend setup:

```bash
npm install
```

## Running the Project

Start backend:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Start frontend (new terminal):

```bash
npm run dev
```

Local URLs:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Screenshots

- [Placeholder] Landing page and channel overview
- [Placeholder] NGO command center with live map
- [Placeholder] Volunteer mission dashboard and ETA flow
- [Placeholder] Drone detection to auto-request pipeline
- [Placeholder] WhatsApp SOS conversation flow

## Future Improvements

- Persistent datastore and event streaming for large-scale deployments.
- GIS-grade routing and dynamic ETA based on road/flood conditions.
- Multilingual NLP for regional dialects in WhatsApp/SMS/IVR.
- Edge AI drone nodes with intermittent connectivity sync.
- Policy-driven inter-agency orchestration and audit trails.

## Contributors

Built with a collaborative hackathon team of developers, AI engineers, and disaster-response problem solvers.

To add contributors, include names and roles in this section.
