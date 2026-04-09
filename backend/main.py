from __future__ import annotations

import asyncio
import base64
import binascii
import json
import hashlib
import hmac
import importlib
import os
import random
import time
from datetime import datetime, timezone
from math import ceil
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import parse_qs
from typing import Any, Literal, Optional
from xml.sax.saxutils import escape as xml_escape

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


RequestCategory = Literal["food", "medical", "rescue", "shelter", "baby_care", "women_care", "water", "emergency_help"]
RequestStatus = Literal["pending", "assigned", "accepted", "on_the_way", "completed"]
RequestSource = Literal["web", "ivr", "whatsapp", "sms", "missed_call", "drone"]
VolunteerAvailability = Literal["available", "busy", "inactive"]
BroadcastType = Literal["emergency", "warning", "info"]


class RequestIn(BaseModel):
    name: str
    phone: str
    category: RequestCategory
    family_size: int = Field(alias="people", ge=1)
    location: str
    zone: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    source: RequestSource = "web"


class AssignIn(BaseModel):
    request_id: str
    volunteer_id: str


class CompleteIn(BaseModel):
    request_id: str

class MissionStartIn(BaseModel):
    request_id: str
    volunteer_id: str

class VolunteerAcceptIn(BaseModel):
    request_id: str
    volunteer_id: str

class VolunteerRejectIn(BaseModel):
    request_id: str
    volunteer_id: str
    reason: Optional[str] = None


class PriorityIn(BaseModel):
    request_id: str
    priority: int


class VolunteerIn(BaseModel):
    name: str
    phone: str
    skills: list[str] = Field(default_factory=list)
    vehicle: bool = False
    zone: str = "Ranchi"
    availability: VolunteerAvailability = "available"
    lat: Optional[float] = None
    lng: Optional[float] = None
    image: Optional[str] = None
    id_card: Optional[str] = Field(default=None, alias="idCard")


class VolunteerStatusIn(BaseModel):
    volunteer_id: str
    availability: Literal["available", "busy", "inactive"]


class IVRIn(BaseModel):
    phone: str
    digit: str
    location: str | None = None
    zone: str | None = None


class WhatsAppIn(BaseModel):
    phone: str
    message: str
    location: str | None = None
    zone: str | None = None


class MissedCallIn(BaseModel):
    phone: str | None = None
    location: str | None = None
    zone: str | None = None


class DroneDetectionIn(BaseModel):
    id: str | None = None
    lat: float | None = None
    lng: float | None = None
    persons: int = 1
    people_count: int | None = None
    flag: Literal["red", "yellow", "green"] = "red"
    area: str | None = None
    zone: str | None = None
    image: str | None = None
    image_path: str | None = None
    detected_at: str | None = None
    status_text: str | None = None
    priority: Literal["LOW", "MEDIUM", "HIGH"] | None = None


class DroneDetectIn(BaseModel):
    image: str
    confidence: float = Field(default=0.35, ge=0.1, le=0.9)


class AlertIn(BaseModel):
    message: str
    channels: list[Literal["sms", "ivr", "whatsapp"]] = Field(default_factory=lambda: ["sms", "ivr", "whatsapp"])


class BroadcastIn(BaseModel):
    zone: str
    type: BroadcastType
    message: str
    channels: list[Literal["sms", "whatsapp", "app"]] = Field(default_factory=lambda: ["sms", "whatsapp", "app"])


app = FastAPI(title="SahayakNet Backend", version="1.1.0")

app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ZONE_COORDS: dict[str, tuple[float, float]] = {
    "Ranchi": (23.3441, 85.3096),
    "Dhanbad": (23.7957, 86.4304),
    "Jamshedpur": (22.8046, 86.2029),
}

CATEGORIES: list[RequestCategory] = ["food", "medical", "rescue", "shelter", "baby_care", "women_care", "water", "emergency_help"]

requests: list[dict[str, Any]] = []
volunteers: list[dict[str, Any]] = []
missions: list[dict[str, Any]] = []
resources: list[dict[str, Any]] = []
alerts: list[str] = []
camps: list[dict[str, Any]] = []
request_counter = 1
volunteer_counter = 1
mission_counter = 1
dashboard_cache_full: dict[str, Any] = {}
dashboard_cache_compact: dict[str, Any] = {}
dashboard_cache_updated_at = ""
duplicate_request_index: dict[str, str] = {}
cache_refresh_task: asyncio.Task[None] | None = None
whatsapp_user_state: dict[str, dict[str, Any]] = {}
sms_user_state: dict[str, dict[str, Any]] = {}
whatsapp_state_lock = asyncio.Lock()
broadcast_alerts: list[dict[str, Any]] = []
broadcast_rate_limit: dict[str, list[float]] = {}

# Auto-assignment tracking
assignment_tracker: dict[str, dict[str, Any]] = {}  # request_id -> {volunteer_id, assigned_at, status}
assignment_timeouts: dict[str, asyncio.Task[None]] = {}  # request_id -> timeout task
ASSIGNMENT_TIMEOUT_SECONDS = 30  # Reassign if not accepted within 30 seconds
BROADCAST_WINDOW_SECONDS = 300
BROADCAST_MAX_PER_WINDOW = 5
DRONE_FRAME_DIR = Path(__file__).resolve().parent / "events" / "drone_frames"
YOLO_MODEL_PATH = Path(__file__).resolve().parent / "yolov8n.pt"

drone_model_lock = asyncio.Lock()
drone_detector_model: Any | None = None
drone_detector_error: str | None = None

ZONE_MAP: dict[str, str] = {
    "whatsapp:+14156811342": "Dhanbad",
    "whatsapp:+14156811343": "Ranchi",
    "whatsapp:+14156811344": "Jamshedpur",
}

ZONE_BLOCK_COORDS: dict[str, dict[str, tuple[float, float]]] = {
    "Dhanbad": {
        "Sector 1": (23.80, 86.44),
        "Sector 2": (23.81, 86.45),
        "Sector 3": (23.82, 86.46),
        "Sector 4": (23.83, 86.47),
        "Sector 5": (23.84, 86.48),
    },
    "Ranchi": {
        "Sector 1": (23.35, 85.31),
        "Sector 2": (23.36, 85.32),
        "Sector 3": (23.37, 85.33),
        "Sector 4": (23.38, 85.34),
        "Sector 5": (23.39, 85.35),
    },
    "Jamshedpur": {
        "Sector 1": (22.81, 86.21),
        "Sector 2": (22.82, 86.22),
        "Sector 3": (22.83, 86.23),
        "Sector 4": (22.84, 86.24),
        "Sector 5": (22.85, 86.25),
    },
}

WHATSAPP_SERVICE_MAP: dict[str, tuple[RequestCategory, str]] = {
    "1": ("medical", "Medical"),
    "2": ("food", "Food"),
    "3": ("rescue", "Rescue"),
    "4": ("water", "Water"),
}

IVR_ZONE_MAP: dict[str, str] = {
    "+14156811342": "Dhanbad",
    "+14156811343": "Ranchi",
    "+14156811344": "Jamshedpur",
}

IVR_DIGIT_MAP: dict[str, tuple[RequestCategory, str]] = {
    "1": ("medical", "Medical"),
    "2": ("food", "Food"),
    "3": ("rescue", "Rescue"),
    "4": ("water", "Water & Shelter"),
    "5": ("women_care", "Women & Child"),
    "6": ("emergency_help", "Emergency Supplies"),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_location(value: str) -> str:
    return " ".join(value.strip().lower().split())


def duplicate_key(category: RequestCategory, location: str) -> str:
    return f"{category}|{normalize_location(location)}"


def compute_priority(category: RequestCategory, family_size: int, created_at: str) -> int:
    severity_map = {
        "medical": 60,
        "emergency_help": 58,
        "rescue": 55,
        "baby_care": 52,
        "women_care": 50,
        "water": 42,
        "food": 35,
        "shelter": 25,
    }
    waiting_hours = max(0, int((datetime.now(timezone.utc) - datetime.fromisoformat(created_at)).total_seconds() // 3600))
    waiting_score = min(waiting_hours * 2, 30)
    return severity_map[category] + family_size + waiting_score


def calculate_resources(category: RequestCategory, family_size: int) -> dict[str, int]:
    return {
        "food_packets": family_size * 3 if category in {"food", "emergency_help"} else (family_size * 2 if category == "shelter" else 0),
        "water_liters": family_size * 5 if category in {"food", "water", "baby_care", "women_care", "emergency_help"} else 0,
        "water_supply": family_size * 5 if category in {"food", "water", "baby_care", "women_care", "emergency_help"} else 0,
        "medicine_kits": ceil(family_size / 2) if category == "medical" else (1 if category == "emergency_help" else 0),
        "shelter_units": ceil(family_size / 4) if category == "shelter" else 0,
        "baby_care_kits": ceil(family_size / 2) if category == "baby_care" else 0,
        "women_care_kits": ceil(family_size / 2) if category == "women_care" else 0,
        "rescue_boats": 1 if category == "rescue" else 0,
        "emergency_essentials": max(1, ceil(family_size / 2)) if category in {"rescue", "emergency_help"} else 0,
    }


def priority_reason(category: RequestCategory, family_size: int) -> str:
    reason_map = {
        "medical": "medical emergency",
        "rescue": "rescue need",
        "shelter": "shelter shortage",
        "baby_care": "infant support need",
        "women_care": "women care shortage",
        "water": "water shortage",
        "emergency_help": "critical emergency",
        "food": "food shortage",
    }
    base = reason_map[category]
    return f"High priority due to {base} + {family_size} member{'s' if family_size > 1 else ''}."


def source_label(source: str) -> str:
    return source.replace("_", " ").upper()


def backend_public_url() -> str:
    # Set BACKEND_PUBLIC_URL to your ngrok/domain URL for Twilio webhooks.
    return os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000").rstrip("/")


def is_twilio_signature_valid(signature: str, url: str, form: dict[str, list[str]], auth_token: str) -> bool:
    # Twilio signature: base64(HMAC-SHA1(auth_token, url + sorted(form_key + form_value))).
    payload = url
    for key in sorted(form.keys()):
        values = form.get(key) or [""]
        for value in values:
            payload += f"{key}{value}"
    digest = hmac.new(auth_token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature)


def whatsapp_zone_from_phone(phone: str) -> str:
    normalized = phone.strip().lower()
    return ZONE_MAP.get(normalized, "Dhanbad")


def ivr_zone_from_phone(phone: str) -> str:
    trimmed = phone.strip()
    if not trimmed:
        return "Dhanbad"
    if trimmed in IVR_ZONE_MAP:
        return IVR_ZONE_MAP[trimmed]

    digits = "".join(ch for ch in trimmed if ch.isdigit())
    if digits.endswith("2"):
        return "Dhanbad"
    if digits.endswith("3"):
        return "Ranchi"
    if digits.endswith("4"):
        return "Jamshedpur"
    return "Dhanbad"


def random_point_near_zone(zone: str) -> tuple[float, float]:
    base_lat, base_lng = ZONE_COORDS.get(zone, ZONE_COORDS["Dhanbad"])
    return (round(base_lat + random.uniform(-0.035, 0.035), 6), round(base_lng + random.uniform(-0.035, 0.035), 6))


def whatsapp_block_coords(zone: str, block: str) -> tuple[float, float]:
    by_zone = ZONE_BLOCK_COORDS.get(zone)
    if by_zone and block in by_zone:
        return by_zone[block]
    return ZONE_COORDS.get(zone, ZONE_COORDS["Dhanbad"])


def whatsapp_random_near_zone(zone: str) -> tuple[float, float]:
    base_lat, base_lng = ZONE_COORDS.get(zone, ZONE_COORDS["Dhanbad"])
    return (round(base_lat + random.uniform(-0.03, 0.03), 6), round(base_lng + random.uniform(-0.03, 0.03), 6))


def whatsapp_language_prompt() -> str:
    return (
        "SahayakNet Disaster Help System\n\n"
        "Press 1 for Hindi\n"
        "Press 2 for English"
    )


def zone_coordinates(zone: str | None) -> tuple[str, float, float]:
    resolved_zone = zone if zone in ZONE_COORDS else "Ranchi"
    lat, lng = ZONE_COORDS[resolved_zone]
    return resolved_zone, lat, lng


def weather_api_key() -> str:
    return os.getenv("OPENWEATHER_API_KEY", "").strip()


def default_weather_payload(zone: str) -> dict[str, Any]:
    seed = int(time.time() // 1800)
    weather_rng = random.Random(f"{zone}-{seed}")
    current_temp = round(weather_rng.uniform(29.0, 41.5), 1)
    current_humidity = weather_rng.randint(38, 92)
    current_wind = round(weather_rng.uniform(8.0, 62.0), 1)
    current_rain_prob = weather_rng.randint(10, 90)
    condition = "Clear"
    if current_rain_prob > 60:
        condition = "Rain"
    if current_wind > 50:
        condition = "Storm"

    now_ts = int(time.time())
    hourly = []
    for hour in range(24):
        pop = max(0, min(100, int(current_rain_prob + weather_rng.randint(-20, 20))))
        hourly.append(
            {
                "timestamp": now_ts + (hour * 3600),
                "temp": round(max(18.0, current_temp + weather_rng.uniform(-5.0, 3.5)), 1),
                "humidity": max(20, min(99, current_humidity + weather_rng.randint(-15, 15))),
                "windSpeed": round(max(2.0, current_wind + weather_rng.uniform(-10.0, 8.0)), 1),
                "rainProbability": pop,
                "condition": "Rain" if pop > 60 else condition,
            }
        )

    daily = []
    for day in range(7):
        pop = max(0, min(100, int(current_rain_prob + weather_rng.randint(-25, 20))))
        daily.append(
            {
                "timestamp": now_ts + (day * 86400),
                "minTemp": round(max(16.0, current_temp - weather_rng.uniform(5.0, 9.0)), 1),
                "maxTemp": round(min(47.0, current_temp + weather_rng.uniform(2.0, 6.5)), 1),
                "humidity": max(20, min(99, current_humidity + weather_rng.randint(-18, 18))),
                "windSpeed": round(max(2.0, current_wind + weather_rng.uniform(-11.0, 10.0)), 1),
                "rainProbability": pop,
                "condition": "Rain" if pop > 60 else condition,
            }
        )

    return {
        "zone": zone,
        "provider": "simulated",
        "current": {
            "temperature": current_temp,
            "humidity": current_humidity,
            "windSpeed": current_wind,
            "rainProbability": current_rain_prob,
            "condition": condition,
            "timestamp": now_ts,
        },
        "hourly": hourly,
        "daily": daily,
        "updatedAt": now_iso(),
    }


def parse_openweather_payload(zone: str, payload: dict[str, Any]) -> dict[str, Any]:
    current = payload.get("current", {})
    current_weather = (current.get("weather") or [{}])[0]

    hourly: list[dict[str, Any]] = []
    for point in (payload.get("hourly") or [])[:24]:
        weather_info = (point.get("weather") or [{}])[0]
        hourly.append(
            {
                "timestamp": point.get("dt"),
                "temp": round(float(point.get("temp", 0.0)), 1),
                "humidity": int(point.get("humidity", 0)),
                "windSpeed": round(float(point.get("wind_speed", 0.0)) * 3.6, 1),
                "rainProbability": int(round(float(point.get("pop", 0.0)) * 100)),
                "condition": str(weather_info.get("main", "Clear")),
            }
        )

    daily: list[dict[str, Any]] = []
    for point in (payload.get("daily") or [])[:7]:
        weather_info = (point.get("weather") or [{}])[0]
        temps = point.get("temp") or {}
        daily.append(
            {
                "timestamp": point.get("dt"),
                "minTemp": round(float(temps.get("min", 0.0)), 1),
                "maxTemp": round(float(temps.get("max", 0.0)), 1),
                "humidity": int(point.get("humidity", 0)),
                "windSpeed": round(float(point.get("wind_speed", 0.0)) * 3.6, 1),
                "rainProbability": int(round(float(point.get("pop", 0.0)) * 100)),
                "condition": str(weather_info.get("main", "Clear")),
            }
        )

    current_wind = round(float(current.get("wind_speed", 0.0)) * 3.6, 1)
    current_rain_probability = hourly[0]["rainProbability"] if hourly else 0

    return {
        "zone": zone,
        "provider": "openweathermap",
        "current": {
            "temperature": round(float(current.get("temp", 0.0)), 1),
            "humidity": int(current.get("humidity", 0)),
            "windSpeed": current_wind,
            "rainProbability": current_rain_probability,
            "condition": str(current_weather.get("main", "Clear")),
            "timestamp": current.get("dt"),
        },
        "hourly": hourly,
        "daily": daily,
        "updatedAt": now_iso(),
    }


def fetch_weather(zone: str | None) -> dict[str, Any]:
    resolved_zone, lat, lng = zone_coordinates(zone)
    api_key = weather_api_key()
    if not api_key:
        return default_weather_payload(resolved_zone)

    endpoint = (
        "https://api.openweathermap.org/data/3.0/onecall"
        f"?lat={lat}&lon={lng}&exclude=minutely,alerts&units=metric&appid={api_key}"
    )
    try:
        with urlopen(endpoint, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return parse_openweather_payload(resolved_zone, payload)
    except Exception:
        return default_weather_payload(resolved_zone)


def analyze_weather_risk(weather: dict[str, Any]) -> dict[str, Any]:
    current = weather.get("current", {})
    temp = float(current.get("temperature", 0))
    wind = float(current.get("windSpeed", 0))
    rain_probability = float(current.get("rainProbability", 0))

    triggers: list[str] = []
    recommendations: list[str] = []

    if temp > 40:
        triggers.append("HEAT ALERT")
        recommendations.append("Extreme heat detected. Citizens should stay indoors, hydrate, and avoid mid-day travel.")
    if wind > 50:
        triggers.append("STORM ALERT")
        recommendations.append("High wind conditions expected. Secure loose structures and avoid open areas.")
    if rain_probability > 70:
        triggers.append("FLOOD ALERT")
        recommendations.append("High rain probability. Move vulnerable households to safer elevated areas.")

    if len(triggers) >= 2:
        risk_level = "HIGH"
    elif len(triggers) == 1:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
        recommendations.append("No severe weather threshold breached. Continue active monitoring.")

    return {
        "zone": weather.get("zone", "Ranchi"),
        "risk_level": risk_level,
        "triggers": triggers,
        "recommended_action": " ".join(recommendations),
        "weather_snapshot": {
            "temperature": temp,
            "windSpeed": wind,
            "rainProbability": rain_probability,
            "condition": current.get("condition", "Clear"),
        },
        "updatedAt": now_iso(),
    }


def auto_generate_broadcast_message(risk: dict[str, Any]) -> str:
    triggers = set(risk.get("triggers", []))
    if "FLOOD ALERT" in triggers:
        return "Flood risk detected in your area. Move to safe elevated zones and follow evacuation guidance immediately."
    if "STORM ALERT" in triggers:
        return "Storm conditions expected. Stay indoors, avoid open areas, and keep emergency supplies ready."
    if "HEAT ALERT" in triggers:
        return "Heatwave alert. Stay indoors, drink water frequently, and avoid non-essential travel during peak heat."
    return "Weather is being actively monitored. Stay alert and follow official updates from SahayakNet."


def enforce_broadcast_rate_limit(actor_key: str) -> None:
    now_ts = time.time()
    window_start = now_ts - BROADCAST_WINDOW_SECONDS
    timeline = [stamp for stamp in broadcast_rate_limit.get(actor_key, []) if stamp >= window_start]
    if len(timeline) >= BROADCAST_MAX_PER_WINDOW:
        raise HTTPException(status_code=429, detail="Broadcast limit reached. Please wait before sending another alert.")
    timeline.append(now_ts)
    broadcast_rate_limit[actor_key] = timeline


def zone_recipient_counts(zone: str) -> dict[str, int]:
    normalized_zone = zone if zone in ZONE_COORDS else "Ranchi"

    app_users = {
        str(req.get("phone", "")).strip()
        for req in requests
        if req.get("zone") == normalized_zone and str(req.get("phone", "")).strip()
    }
    sms_users = {
        str(phone).strip()
        for phone, state in sms_user_state.items()
        if state.get("zone", normalized_zone) == normalized_zone and str(phone).strip()
    }
    whatsapp_users = {
        str(phone).strip()
        for phone, state in whatsapp_user_state.items()
        if state.get("zone", normalized_zone) == normalized_zone and str(phone).strip()
    }

    return {
        "app": len(app_users),
        "sms": len(sms_users.union(app_users)),
        "whatsapp": len(whatsapp_users.union(app_users)),
    }


def append_broadcast_history(
    *,
    message: str,
    zone: str,
    alert_type: BroadcastType,
    channels: list[str],
    recipients: dict[str, int],
    created_by: str,
) -> dict[str, Any]:
    alert_id = f"ALT-{len(broadcast_alerts) + 1:05}"
    entry = {
        "id": alert_id,
        "message": message,
        "zone": zone,
        "type": alert_type,
        "channels": channels,
        "timestamp": now_iso(),
        "recipients": recipients,
        "createdBy": created_by,
    }
    broadcast_alerts.insert(0, entry)

    feed_line = (
        f"[{alert_type.upper()}] {zone}: {message} | "
        f"Delivered via {'/'.join(channel.upper() for channel in channels)}"
    )
    alerts.insert(0, feed_line)
    if len(alerts) > 100:
        del alerts[100:]
    return entry


def whatsapp_service_prompt(language: str) -> str:
    return (
        "Choose your service:\n\n"
        "1 Medical\n"
        "2 Food\n"
        "3 Rescue\n"
        "4 Water\n"
        "5 Women & Child\n"
        "6 Emergency"
    )


def whatsapp_block_prompt(zone: str, language: str) -> str:
    if language == "Hindi":
        return (
            f"📍 {zone} में अपना क्षेत्र चुनें:\n"
            "1 Sector 1\n"
            "2 Sector 2\n"
            "3 Sector 3\n"
            "4 Sector 4\n"
            "5 Sector 5\n"
            "6 अन्य (खुद लिखें)"
        )
    return (
        f"📍 Select your area in {zone}:\n"
        "1 Sector 1\n"
        "2 Sector 2\n"
        "3 Sector 3\n"
        "4 Sector 4\n"
        "5 Sector 5\n"
        "6 Other (type manually)"
    )


def decode_data_url_image(data_url: str) -> tuple[str, bytes]:
    value = (data_url or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="image is required")

    if value.startswith("data:"):
        header, encoded = value.split(",", 1)
        mime = "image/jpeg"
        if ";" in header:
            mime = header.split(";", 1)[0].replace("data:", "")
    else:
        encoded = value
        mime = "image/jpeg"

    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=400, detail="Invalid base64 image") from None

    if not raw:
        raise HTTPException(status_code=400, detail="Image payload is empty")

    return mime, raw


def save_drone_capture_image(image_data: str, request_id: str) -> dict[str, str]:
    mime, raw = decode_data_url_image(image_data)
    extension = "jpg"
    if "png" in mime:
        extension = "png"
    elif "webp" in mime:
        extension = "webp"

    DRONE_FRAME_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = int(time.time() * 1000)
    filename = f"{request_id}-{timestamp}.{extension}"
    file_path = DRONE_FRAME_DIR / filename
    file_path.write_bytes(raw)
    return {
        "path": str(file_path),
        "url": f"/drone/frame/{filename}",
    }


def drone_risk_profile(people_count: int) -> tuple[str, str, int, str]:
    if people_count >= 3:
        return "HIGH", "red", 75, "HIGH CROWD ALERT"
    if people_count == 2:
        return "MEDIUM", "yellow", 62, "Person Detected"
    if people_count == 1:
        return "LOW", "green", 56, "Person Detected"
    return "LOW", "green", 42, "No Person Detected"


async def get_drone_detector_model() -> tuple[Any | None, str | None]:
    global drone_detector_model, drone_detector_error

    async with drone_model_lock:
        if drone_detector_model is not None or drone_detector_error is not None:
            return drone_detector_model, drone_detector_error

        if not YOLO_MODEL_PATH.exists():
            drone_detector_error = "YOLO model file not found"
            return None, drone_detector_error

        try:
            yolo_module = importlib.import_module("ultralytics")
            YOLO = getattr(yolo_module, "YOLO")

            drone_detector_model = YOLO(str(YOLO_MODEL_PATH))
            return drone_detector_model, None
        except Exception as exc:
            drone_detector_error = f"YOLO model unavailable: {exc}"
            return None, drone_detector_error


async def run_drone_detection(image_data: str, confidence: float) -> dict[str, Any]:
    try:
        cv2 = importlib.import_module("cv2")
        np = importlib.import_module("numpy")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Drone detection dependencies missing ({exc}). Install ultralytics, opencv-python, and numpy.",
        ) from None

    _, raw = decode_data_url_image(image_data)
    frame_buffer = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(frame_buffer, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Unable to decode image frame")

    model, model_error = await get_drone_detector_model()
    if model is None:
        raise HTTPException(status_code=503, detail=model_error or "YOLO model not available")

    results = model(frame, classes=[0], conf=confidence, verbose=False)
    frame_height, frame_width = frame.shape[:2]

    boxes: list[dict[str, float]] = []
    people_count = 0

    for result in results:
        result_boxes = getattr(result, "boxes", None)
        if result_boxes is None:
            continue

        for box in result_boxes:
            cls_tensor = getattr(box, "cls", None)
            cls_id = int(cls_tensor[0]) if cls_tensor is not None else -1
            if cls_id != 0:
                continue

            conf_tensor = getattr(box, "conf", None)
            conf_value = float(conf_tensor[0]) if conf_tensor is not None else 0.0

            xyxy_tensor = getattr(box, "xyxy", None)
            if xyxy_tensor is None:
                continue
            x1, y1, x2, y2 = [float(item) for item in xyxy_tensor[0].tolist()]

            boxes.append(
                {
                    "x1": max(0.0, x1),
                    "y1": max(0.0, y1),
                    "x2": min(float(frame_width), x2),
                    "y2": min(float(frame_height), y2),
                    "confidence": round(conf_value, 4),
                }
            )
            people_count += 1

    risk_level, flag, _, status_text = drone_risk_profile(people_count)
    return {
        "people_count": people_count,
        "boxes": boxes,
        "width": frame_width,
        "height": frame_height,
        "status": status_text if people_count >= 1 else "No Person Detected",
        "crowd_alert": people_count >= 3,
        "risk_level": risk_level,
        "flag": flag,
        "detected_at": now_iso(),
    }


def whatsapp_confirm_prompt(state: dict[str, Any]) -> str:
    language = state.get("language", "English")
    service_label = state.get("serviceLabel", "Service")
    location = state.get("location", "Unknown location")
    if language == "Hindi":
        return (
            "कृपया पुष्टि करें:\n"
            f"सेवा: {service_label}\n"
            f"स्थान: {location}\n\n"
            "1 पुष्टि करें\n"
            "2 बदलें"
        )
    return (
        "Please confirm your request:\n"
        f"Service: {service_label}\n"
        f"Location: {location}\n\n"
        "1 Confirm\n"
        "2 Edit"
    )


def sms_zone_from_phone(phone: str) -> str:
    trimmed = phone.strip()
    normalized = trimmed.lower()
    if normalized in ZONE_MAP:
        return ZONE_MAP[normalized]

    # Support Twilio SMS From format like +1415... and prefixed variants.
    if trimmed in IVR_ZONE_MAP:
        return IVR_ZONE_MAP[trimmed]

    digits = "".join(ch for ch in trimmed if ch.isdigit())
    candidate = f"+{digits}" if digits else ""
    if candidate in IVR_ZONE_MAP:
        return IVR_ZONE_MAP[candidate]
    return "Dhanbad"


def sms_language_prompt() -> str:
    return (
        "🙏 SahayakNet Disaster Help System\n\n"
        "1️⃣ हिंदी के लिए 1 दबाएं\n"
        "2️⃣ For English press 2"
    )


def sms_service_prompt(language: str) -> str:
    if language == "Hindi":
        return (
            "कृपया सेवा चुनें:\n"
            "1 चिकित्सा\n"
            "2 भोजन\n"
            "3 बचाव\n"
            "4 पानी और आश्रय\n"
            "5 महिला और बच्चा सहायता\n"
            "6 आपातकालीन सामग्री"
        )
    return (
        "Choose service:\n"
        "1 Medical\n"
        "2 Food\n"
        "3 Rescue\n"
        "4 Water & Shelter\n"
        "5 Women & Child\n"
        "6 Emergency Supplies"
    )


def sms_block_prompt(language: str) -> str:
    if language == "Hindi":
        return (
            "अपने क्षेत्र का चयन करें:\n"
            "1 Sector 1\n"
            "2 Sector 2\n"
            "3 Sector 3\n"
            "4 Sector 4\n"
            "5 Sector 5"
        )
    return (
        "Select your area:\n"
        "1 Sector 1\n"
        "2 Sector 2\n"
        "3 Sector 3\n"
        "4 Sector 4\n"
        "5 Sector 5"
    )


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    from math import asin, cos, radians, sin, sqrt

    lat1, lng1 = a
    lat2, lng2 = b
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    aa = sin(d_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(d_lng / 2) ** 2
    return 2 * 6371.0 * asin(min(1.0, sqrt(aa)))


def bearing_degrees(a: tuple[float, float], b: tuple[float, float]) -> float:
    from math import atan2, degrees, radians, sin, cos

    lat1, lng1 = a
    lat2, lng2 = b
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    delta_lng = radians(lng2 - lng1)
    y = sin(delta_lng) * cos(phi2)
    x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(delta_lng)
    return (degrees(atan2(y, x)) + 360) % 360


def step_towards(start: tuple[float, float], target: tuple[float, float], step_km: float) -> tuple[float, float]:
    distance_km = haversine_km(start, target)
    if distance_km <= 0 or step_km <= 0 or step_km >= distance_km:
        return target

    progress = step_km / distance_km
    return (
        start[0] + (target[0] - start[0]) * progress,
        start[1] + (target[1] - start[1]) * progress,
    )


def advance_live_locations(interval_seconds: int = 5) -> None:
    now = now_iso()
    for request in requests:
        if request.get("status") == "completed":
            continue

        volunteer_id = request.get("assignedVolunteerId")
        if not volunteer_id:
            continue

        volunteer = find_volunteer(volunteer_id)
        if not volunteer:
            continue

        current = (float(volunteer.get("lat", request["lat"])), float(volunteer.get("lng", request["lng"])))
        destination = (float(request["lat"]), float(request["lng"]))
        speed_kmh = float(volunteer.get("speed") or (24.0 if volunteer.get("vehicle") else 16.0))
        step_km = max(0.01, speed_kmh * interval_seconds / 3600.0)
        new_lat, new_lng = step_towards(current, destination, step_km)

        volunteer["lat"] = round(new_lat, 6)
        volunteer["lng"] = round(new_lng, 6)
        volunteer["heading"] = round(bearing_degrees(current, destination), 2)
        volunteer["lastSeenAt"] = now
        request["assignedAt"] = request.get("assignedAt") or request.get("createdAt")


def resource_summary(category: RequestCategory, family_size: int) -> str:
    if category == "medical":
        return f"Medicine kits needed: {max(1, ceil(family_size / 2))} units"
    if category == "rescue":
        return f"Rescue support needed for {family_size} people"
    if category == "shelter":
        return f"Shelter units needed: {max(1, ceil(family_size / 4))}"
    if category == "baby_care":
        return f"Baby care kits needed: {max(1, ceil(family_size / 2))} units"
    if category == "women_care":
        return f"Women care kits needed: {max(1, ceil(family_size / 2))} units"
    if category == "water":
        return f"Water supply needed: {family_size * 5} liters"
    if category == "emergency_help":
        return f"Emergency essentials needed for {family_size} people"
    return f"Food needed: {family_size * 2} units"


def detect_duplicate(category: RequestCategory, location: str) -> dict[str, Any] | None:
    idx_key = duplicate_key(category, location)
    existing_id = duplicate_request_index.get(idx_key)
    if existing_id:
        existing = find_request(existing_id)
        if existing and existing.get("status") != "completed":
            return existing

    payload_location = normalize_location(location)
    for existing in requests:
        if existing["category"] == category and normalize_location(existing["location"]) == payload_location and existing["status"] != "completed":
            duplicate_request_index[idx_key] = existing["id"]
            return existing
    return None


def infer_zone(zone: str | None, lat: float | None, lng: float | None) -> tuple[str, float, float]:
    if zone and zone in ZONE_COORDS:
        base_lat, base_lng = ZONE_COORDS[zone]
        return zone, lat if lat is not None else base_lat, lng if lng is not None else base_lng

    if lat is not None and lng is not None:
        closest_zone = min(ZONE_COORDS.items(), key=lambda item: (item[1][0] - lat) ** 2 + (item[1][1] - lng) ** 2)[0]
        return closest_zone, lat, lng

    return "Ranchi", ZONE_COORDS["Ranchi"][0], ZONE_COORDS["Ranchi"][1]


def build_request(
    *,
    name: str,
    phone: str,
    category: RequestCategory,
    family_size: int,
    location: str,
    zone: str | None,
    source: RequestSource,
    lat: float | None = None,
    lng: float | None = None,
) -> dict[str, Any]:
    global request_counter

    inferred_zone, resolved_lat, resolved_lng = infer_zone(zone, lat, lng)
    location_value = (location or "").strip() or f"Unknown location (approx zone: {inferred_zone})"
    created_at = now_iso()

    duplicate = detect_duplicate(category, location_value)
    if duplicate:
        duplicate["family_size"] += family_size
        duplicate["people"] = duplicate["family_size"]
        duplicate["zone"] = duplicate.get("zone") or inferred_zone
        duplicate["lat"] = duplicate.get("lat") if duplicate.get("lat") is not None else resolved_lat
        duplicate["lng"] = duplicate.get("lng") if duplicate.get("lng") is not None else resolved_lng
        duplicate["location"] = duplicate.get("location") or location_value
        duplicate["priority"] = compute_priority(category, duplicate["family_size"], duplicate["createdAt"])
        duplicate["resourcesNeeded"] = calculate_resources(category, duplicate["family_size"])
        duplicate["duplicateOf"] = duplicate["id"]
        duplicate["mergedCount"] = duplicate.get("mergedCount", 1) + 1
        duplicate["priorityReason"] = priority_reason(category, duplicate["family_size"])
        duplicate["resourceSummary"] = resource_summary(category, duplicate["family_size"])
        duplicate_request_index[duplicate_key(category, location_value)] = duplicate["id"]
        return duplicate

    request_id = f"REQ-{request_counter:04}"
    request_counter += 1
    request = {
        "id": request_id,
        "name": name,
        "phone": phone,
        "category": category,
        "family_size": family_size,
        "people": family_size,
        "location": location_value,
        "zone": inferred_zone,
        "lat": resolved_lat,
        "lng": resolved_lng,
        "priority": compute_priority(category, family_size, created_at),
        "createdAt": created_at,
        "status": "pending",
        "source": source,
        "sourceLabel": source_label(source),
        "assignedAt": None,
        "acceptedAt": None,
        "resourcesNeeded": calculate_resources(category, family_size),
        "resourceSummary": resource_summary(category, family_size),
        "priorityReason": priority_reason(category, family_size),
        "mergedCount": 1,
        "assignedVolunteerId": None,
        "assignedVolunteerName": None,
        "eta": None,
    }
    requests.insert(0, request)
    duplicate_request_index[duplicate_key(category, location_value)] = request_id
    return request


def find_request(request_id: str) -> dict[str, Any] | None:
    return next((item for item in requests if item["id"] == request_id), None)


def find_volunteer(volunteer_id: str) -> dict[str, Any] | None:
    return next((item for item in volunteers if item["id"] == volunteer_id), None)


def compact_request(item: dict[str, Any]) -> dict[str, Any]:
    zone = item.get("zone") or "Dhanbad"
    fallback_lat, fallback_lng = ZONE_COORDS.get(zone, ZONE_COORDS["Dhanbad"])
    location = item.get("location") or f"Unknown location (approx zone: {zone})"
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "phone": item.get("phone"),
        "category": item.get("category"),
        "people": item.get("people"),
        "family_size": item.get("family_size"),
        "location": location,
        "zone": zone,
        "lat": item.get("lat") if item.get("lat") is not None else fallback_lat,
        "lng": item.get("lng") if item.get("lng") is not None else fallback_lng,
        "priority": item.get("priority"),
        "createdAt": item.get("createdAt"),
        "status": item.get("status"),
        "executionStatus": item.get("executionStatus"),
        "source": item.get("source"),
        "sourceLabel": item.get("sourceLabel"),
        "assignedAt": item.get("assignedAt"),
        "resourcesNeeded": item.get("resourcesNeeded"),
        "resourceSummary": item.get("resourceSummary"),
        "priorityReason": item.get("priorityReason"),
        "mergedCount": item.get("mergedCount"),
        "assignedVolunteerId": item.get("assignedVolunteerId"),
        "assignedVolunteerName": item.get("assignedVolunteerName"),
        "eta": item.get("eta"),
        "peopleCount": item.get("peopleCount"),
        "riskLevel": item.get("riskLevel"),
        "detectedAt": item.get("detectedAt"),
        "droneImage": item.get("droneImage"),
        "droneImagePath": item.get("droneImagePath"),
        "droneMeta": item.get("droneMeta"),
    }


def compact_volunteer(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "phone": item.get("phone"),
        "skills": item.get("skills"),
        "vehicle": item.get("vehicle"),
        "availability": item.get("availability"),
        "zone": item.get("zone"),
        "image": item.get("image"),
        "idCard": item.get("idCard"),
        "age": item.get("age"),
        "lat": item.get("lat"),
        "lng": item.get("lng"),
        "tasksCompleted": item.get("tasksCompleted"),
        "assignedRequest": item.get("assignedRequest"),
    }


def compact_resource(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": item.get("name"),
        "total": item.get("total"),
        "available": item.get("available"),
        "unit": item.get("unit"),
        "dailyConsumption": item.get("dailyConsumption"),
    }


def build_dashboard_payload(compact: bool) -> dict[str, Any]:
    if compact:
        return {
            "summary": update_summary(),
            "resources": [compact_resource(item) for item in resources],
            "alerts": alerts[:20],
            "volunteers": [compact_volunteer(item) for item in volunteers],
            "requests": [compact_request(item) for item in requests],
            "missions": missions[-120:],
            "camps": camps,
            "updatedAt": dashboard_cache_updated_at,
            "lastUpdated": dashboard_cache_updated_at,
        }

    return {
        "summary": update_summary(),
        "resources": resources,
        "alerts": alerts,
        "volunteers": volunteers,
        "requests": requests,
        "missions": missions,
        "camps": camps,
        "updatedAt": dashboard_cache_updated_at,
        "lastUpdated": dashboard_cache_updated_at,
    }


def refresh_dashboard_cache() -> None:
    global dashboard_cache_full, dashboard_cache_compact, dashboard_cache_updated_at
    dashboard_cache_updated_at = now_iso()
    dashboard_cache_full = build_dashboard_payload(compact=False)
    dashboard_cache_compact = build_dashboard_payload(compact=True)


def apply_request_post_processing(request_id: str) -> None:
    # Keep request-response path lightweight while guaranteeing derived fields stay fresh.
    request = find_request(request_id)
    if not request:
        return

    category = request["category"]
    family_size = request.get("family_size", request.get("people", 1))
    request["priority"] = compute_priority(category, family_size, request["createdAt"])
    request["resourcesNeeded"] = calculate_resources(category, family_size)
    request["priorityReason"] = priority_reason(category, family_size)

    if category == "food":
        request["resourceSummary"] = resource_summary(category, family_size)
    elif category == "medical":
        request["resourceSummary"] = resource_summary(category, family_size)
    elif category == "rescue":
        request["resourceSummary"] = resource_summary(category, family_size)
    else:
        request["resourceSummary"] = resource_summary(category, family_size)

    if request.get("status") == "completed":
        request["executionStatus"] = "completed"
    elif request.get("status") == "on_the_way":
        request["executionStatus"] = "on_the_way"
    elif request.get("status") == "accepted":
        request["executionStatus"] = "accepted"
    elif request.get("status") == "assigned" and request.get("executionStatus") not in {"on_the_way", "completed", "accepted"}:
        request["executionStatus"] = "assigned"
    elif request.get("status") == "pending":
        request["executionStatus"] = "pending"

    refresh_dashboard_cache()


def schedule_cache_refresh(background_tasks: BackgroundTasks | None) -> None:
    if background_tasks is None:
        refresh_dashboard_cache()
    else:
        background_tasks.add_task(refresh_dashboard_cache)


async def cache_refresh_loop() -> None:
    while True:
        await asyncio.sleep(5)
        advance_live_locations(5)
        refresh_dashboard_cache()


def consume_inventory_for_request(request: dict[str, Any]) -> None:
    if request.get("inventoryUpdated"):
        return

    needed = request.get("resourcesNeeded", {})
    for resource in resources:
        if resource["name"] == "Food Packets":
            resource["available"] = max(0, resource["available"] - int(needed.get("food_packets", 0)))
        elif resource["name"] == "Medical Kits":
            resource["available"] = max(0, resource["available"] - int(needed.get("medicine_kits", 0)))
        elif resource["name"] == "Shelter Units":
            resource["available"] = max(0, resource["available"] - int(needed.get("shelter_units", 0)))
        elif resource["name"] == "Baby Care Kits":
            resource["available"] = max(0, resource["available"] - int(needed.get("baby_care_kits", 0)))
        elif resource["name"] == "Women Care Kits":
            resource["available"] = max(0, resource["available"] - int(needed.get("women_care_kits", 0)))
        elif resource["name"] == "Water Supply":
            resource["available"] = max(0, resource["available"] - int(needed.get("water_supply", needed.get("water_liters", 0))))
        elif resource["name"] == "Emergency Essentials":
            resource["available"] = max(0, resource["available"] - int(needed.get("emergency_essentials", 0)))

    request["inventoryUpdated"] = True


def calculate_volunteer_load(volunteer_id: str) -> int:
    """Calculate how many active tasks a volunteer has"""
    count = 0
    for req in requests:
        if (req.get("assignedVolunteerId") == volunteer_id and 
            req.get("status") in {"assigned", "accepted", "on_the_way"}):
            count += 1
    return count


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in meters between two lat/lng points"""
    from math import radians, sin, cos, sqrt, atan2
    
    R = 6371000  # Earth radius in meters
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


def find_best_volunteer(request: dict[str, Any]) -> dict[str, Any] | None:
    """
    Find the best available volunteer for a request
    Priority:
    1. Available status
    2. Same zone preferred
    3. Lowest load (fewest active tasks)
    4. Nearest distance
    """
    req_zone = request.get("zone", "Ranchi")
    req_lat = float(request.get("lat", ZONE_COORDS["Ranchi"][0]))
    req_lng = float(request.get("lng", ZONE_COORDS["Ranchi"][1]))
    
    # Filter available volunteers
    available = [v for v in volunteers if v.get("availability") == "available"]
    if not available:
        return None
    
    # Prioritize same zone, then lowest load, then nearest
    def volunteer_score(vol: dict[str, Any]) -> tuple[int, int, float]:
        zone_match = 0 if vol.get("zone") == req_zone else 1
        load = calculate_volunteer_load(vol["id"])
        distance = haversine_distance(
            req_lat, req_lng,
            float(vol.get("lat", ZONE_COORDS["Ranchi"][0])),
            float(vol.get("lng", ZONE_COORDS["Ranchi"][1]))
        )
        return (zone_match, load, distance)
    
    return min(available, key=volunteer_score)


async def handle_assignment_timeout(request_id: str) -> None:
    """
    After 30 seconds, if volunteer hasn't accepted, reassign to next best volunteer
    """
    await asyncio.sleep(ASSIGNMENT_TIMEOUT_SECONDS)
    
    request = find_request(request_id)
    if not request:
        assignment_timeouts.pop(request_id, None)
        return
    
    # Check if still in assigned state (not accepted or completed)
    if request.get("status") not in {"assigned"}:
        assignment_timeouts.pop(request_id, None)
        return
    
    current_volunteer_id = request.get("assignedVolunteerId")
    if current_volunteer_id:
        current_volunteer = find_volunteer(current_volunteer_id)
        if current_volunteer:
            current_volunteer["availability"] = "available"
            current_volunteer["assignedRequest"] = None
    
    # Try to assign to next best volunteer
    new_volunteer = find_best_volunteer(request)
    if new_volunteer:
        request["assignedVolunteerId"] = new_volunteer["id"]
        request["assignedVolunteerName"] = new_volunteer["name"]
        new_volunteer["availability"] = "busy"
        new_volunteer["assignedRequest"] = request_id
        assignment_tracker[request_id]["volunteer_id"] = new_volunteer["id"]
        # Start new timeout
        assignment_timeouts.pop(request_id, None)
        assignment_timeouts[request_id] = asyncio.create_task(handle_assignment_timeout(request_id))
    else:
        # No volunteers available, revert to pending
        request["status"] = "pending"
        request["assignedVolunteerId"] = None
        request["assignedVolunteerName"] = None
        request["assignedAt"] = None
        assignment_tracker.pop(request_id, None)
    
    refresh_dashboard_cache()


def auto_assign_volunteer(request: dict[str, Any]) -> bool:
    """
    Automatically assign the best available volunteer to the request
    Returns True if assigned, False otherwise
    """
    best_volunteer = find_best_volunteer(request)
    if not best_volunteer:
        return False
    
    # Assign volunteer
    request["status"] = "assigned"
    request["assignedVolunteerId"] = best_volunteer["id"]
    request["assignedVolunteerName"] = best_volunteer["name"]
    request["assignedAt"] = now_iso()
    best_volunteer["availability"] = "busy"
    best_volunteer["assignedRequest"] = request["id"]
    
    # Track assignment
    assignment_tracker[request["id"]] = {
        "volunteer_id": best_volunteer["id"],
        "assigned_at": request["assignedAt"],
        "status": "assigned"
    }
    
    # Set timeout for acceptance
    if request["id"] in assignment_timeouts:
        assignment_timeouts[request["id"]].cancel()
    assignment_timeouts[request["id"]] = asyncio.create_task(
        handle_assignment_timeout(request["id"])
    )
    
    return True


def nearest_volunteer(request: dict[str, Any]) -> dict[str, Any] | None:
    available = [item for item in volunteers if item["availability"] == "available"]
    if not available:
        return None
    return min(
        available,
        key=lambda item: (item["lat"] - request["lat"]) ** 2 + (item["lng"] - request["lng"]) ** 2,
    )


def update_summary() -> dict[str, Any]:
    active = 0
    completed = 0
    critical = 0
    for item in requests:
        if item["status"] == "completed":
            completed += 1
            continue
        active += 1
        if item["priority"] >= 60:
            critical += 1

    volunteers_available = 0
    for item in volunteers:
        if item["availability"] == "available":
            volunteers_available += 1

    return {
        "totalRequests": len(requests),
        "activeRequests": active,
        "criticalRequests": critical,
        "completedRequests": completed,
        "volunteersAvailable": volunteers_available,
    }


def seed_data() -> None:
    global request_counter, volunteer_counter

    zone_cycle = ["Dhanbad", "Dhanbad", "Dhanbad", "Ranchi", "Jamshedpur"]
    volunteer_skill_sets = [
        ["First Aid", "Swimming"],
        ["Boat Operation", "Navigation"],
        ["Medical", "CPR"],
        ["Cooking", "Logistics"],
        ["Search & Rescue", "Rope Rescue"],
        ["Driving", "Coordination"],
        ["Communication", "Ham Radio"],
        ["Doctor", "Emergency Medicine"],
        ["Water Purification", "Sanitation"],
        ["Counselling", "Language"],
    ]

    for i in range(34):
        zone = random.choice(["Dhanbad", "Ranchi", "Jamshedpur"])
        base_lat, base_lng = ZONE_COORDS[zone]
        lat_offset = random.uniform(-0.12, 0.12)
        lng_offset = random.uniform(-0.12, 0.12)
        volunteers.append(
            {
                "id": f"VOL-{volunteer_counter:03}",
                "name": f"Volunteer {i + 1}",
                "phone": f"900000{i + 1:03}",
                "skills": volunteer_skill_sets[i % len(volunteer_skill_sets)],
                "vehicle": i % 3 != 0,
                "availability": "available" if i < 12 else ("busy" if i < 18 else "inactive"),
                "zone": zone,
                "image": f"/volunteers/{'m' if i < 20 else 'f'}{(i % 20) + 1 if i < 20 else (i - 20) + 1}.jpg",
                "idCard": f"JH-NDMA-{i + 1:04}",
                "age": 22 + (i % 13),
                "lat": round(base_lat + lat_offset, 5),
                "lng": round(base_lng + lng_offset, 5),
                "tasksCompleted": i % 8,
                "speed": 14 + (i % 6) * 2.5,
                "heading": 0,
                "lastSeenAt": now_iso(),
                "assignedRequest": None,
            }
        )
        volunteer_counter += 1

    categories = ["food", "medical", "rescue", "shelter", "baby_care", "women_care", "water", "emergency_help", "food", "medical"]
    sources: list[RequestSource] = ["web", "ivr", "whatsapp", "missed_call", "drone", "web"]
    for i in range(120):
        zone = random.choice(["Dhanbad", "Ranchi", "Jamshedpur"])
        lat, lng = ZONE_COORDS[zone]
        created_at = now_iso()
        family_size = (i % 9) + 2
        category: RequestCategory = categories[i % len(categories)]  # type: ignore[assignment]
        source: RequestSource = sources[i % len(sources)]
        status = "pending" if i < 42 else ("assigned" if i < 56 else "completed")
        request = {
            "id": f"REQ-{request_counter:04}",
            "name": f"Citizen {i + 1}",
            "phone": f"98{10000000 + i}",
            "category": category,
            "family_size": family_size,
            "people": family_size,
            "location": f"Flood Pocket {zone} Sector {i % 12 + 1}",
            "zone": zone,
            "lat": round(lat + random.uniform(-0.15, 0.15), 5),
            "lng": round(lng + random.uniform(-0.15, 0.15), 5),
            "priority": compute_priority(category, family_size, created_at),
            "createdAt": created_at,
            "status": status,
            "executionStatus": "completed" if status == "completed" else ("assigned" if status == "assigned" else "pending"),
            "source": source,
            "sourceLabel": source_label(source),
            "resourcesNeeded": calculate_resources(category, family_size),
            "resourceSummary": resource_summary(category, family_size),
            "priorityReason": priority_reason(category, family_size),
            "mergedCount": 1 if i % 5 else (2 + (i % 3)),
            "assignedVolunteerId": None,
            "assignedVolunteerName": None,
            "eta": None,
            "assignedAt": None if status == "pending" else created_at,
            "inventoryUpdated": status == "completed",
        }
        if request["status"] != "pending":
            volunteer = volunteers[i % len(volunteers)]
            request["assignedVolunteerId"] = volunteer["id"]
            request["assignedVolunteerName"] = volunteer["name"]
            request["eta"] = f"{15 + (i % 6) * 5} mins"
            request["assignedAt"] = created_at
            if volunteer["availability"] != "inactive":
                volunteer["availability"] = "busy"
            volunteer["assignedRequest"] = request["id"]
        if request["status"] == "completed":
            volunteer = volunteers[i % len(volunteers)]
            volunteer["tasksCompleted"] += 1
        requests.append(request)
        request_counter += 1


seed_data()

resources = [
    {"name": "Food Packets", "total": 2500, "available": 480, "unit": "packets", "dailyConsumption": 410},
    {"name": "Medical Kits", "total": 800, "available": 260, "unit": "kits", "dailyConsumption": 110},
    {"name": "Shelter Units", "total": 400, "available": 190, "unit": "units", "dailyConsumption": 32},
    {"name": "Baby Care Kits", "total": 300, "available": 92, "unit": "kits", "dailyConsumption": 24},
    {"name": "Women Care Kits", "total": 260, "available": 80, "unit": "kits", "dailyConsumption": 18},
    {"name": "Water Supply", "total": 5000, "available": 1460, "unit": "liters", "dailyConsumption": 480},
    {"name": "Emergency Essentials", "total": 600, "available": 175, "unit": "kits", "dailyConsumption": 60},
]

camps = [
    {"id": "CAMP-01", "name": "Dhanbad Relief Camp A", "zone": "Dhanbad", "capacity": 300, "occupied": 248},
    {"id": "CAMP-02", "name": "Dhanbad Relief Camp B", "zone": "Dhanbad", "capacity": 220, "occupied": 201},
    {"id": "CAMP-03", "name": "Ranchi Transit Camp", "zone": "Ranchi", "capacity": 180, "occupied": 96},
]

alerts = [
    "Flood emergency declared in Dhanbad low-lying zones",
    "Food shortage risk in 24-36 hours if inflow not increased",
    "Evacuation advisory issued for river-adjacent settlements",
]

refresh_dashboard_cache()


@app.on_event("startup")
async def startup_event() -> None:
    global cache_refresh_task
    if cache_refresh_task is None or cache_refresh_task.done():
        cache_refresh_task = asyncio.create_task(cache_refresh_loop())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    global cache_refresh_task
    if cache_refresh_task:
        cache_refresh_task.cancel()
        try:
            await cache_refresh_task
        except asyncio.CancelledError:
            pass
        cache_refresh_task = None


@app.get("/")
async def root() -> dict[str, Any]:
    return {"service": "SahayakNet API", "status": "ok"}


@app.post("/request")
async def create_request(payload: RequestIn, background_tasks: BackgroundTasks):
    request = build_request(
        name=payload.name,
        phone=payload.phone,
        category=payload.category,
        family_size=payload.family_size,
        location=payload.location,
        zone=payload.zone,
        source=payload.source,
        lat=payload.lat,
        lng=payload.lng,
    )
    background_tasks.add_task(auto_assign_volunteer, request)
    background_tasks.add_task(apply_request_post_processing, request["id"])
    schedule_cache_refresh(background_tasks)
    return request


@app.post("/requests")
async def create_request_legacy(payload: RequestIn, background_tasks: BackgroundTasks):
    return await create_request(payload, background_tasks)


@app.get("/requests")
async def get_requests() -> list[dict[str, Any]]:
    return requests


@app.get("/request/{request_id}")
async def get_request(request_id: str) -> dict[str, Any]:
    request = find_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return request


@app.post("/assign")
async def assign_request(payload: AssignIn, background_tasks: BackgroundTasks):
    global mission_counter
    request = find_request(payload.request_id)
    volunteer = find_volunteer(payload.volunteer_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    if request["status"] == "completed":
        raise HTTPException(status_code=400, detail="Completed request cannot be assigned")
    if volunteer["availability"] == "inactive":
        raise HTTPException(status_code=400, detail="Inactive volunteer cannot be assigned")

    request["status"] = "assigned"
    request["executionStatus"] = "assigned"
    request["assignedAt"] = now_iso()
    request["assignedVolunteerId"] = volunteer["id"]
    request["assignedVolunteerName"] = volunteer["name"]
    eta_minutes = 15 + int(abs(request["lat"] - volunteer["lat"]) * 100)
    request["eta"] = f"{eta_minutes} mins"
    volunteer["availability"] = "busy"
    volunteer["assignedRequest"] = request["id"]

    mission_id = f"MIS-{mission_counter:04}"
    missions.append(
        {
            "id": mission_id,
            "requestId": request["id"],
            "volunteerId": volunteer["id"],
            "status": "assigned",
            "createdAt": now_iso(),
            "completedAt": None,
        }
    )
    mission_counter += 1
    schedule_cache_refresh(background_tasks)
    return {"success": True, "request": request, "missionId": mission_id}


@app.post("/mission/start")
async def start_mission(payload: MissionStartIn, background_tasks: BackgroundTasks):
    request = find_request(payload.request_id)
    volunteer = find_volunteer(payload.volunteer_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    if request.get("assignedVolunteerId") != volunteer.get("id"):
        raise HTTPException(status_code=400, detail="Volunteer is not assigned to this request")
    if request.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Completed request cannot be started")

    request["status"] = "assigned"
    request["executionStatus"] = "on_the_way"
    volunteer["availability"] = "busy"

    if not request.get("eta"):
        eta_minutes = 15 + int(abs(request["lat"] - volunteer["lat"]) * 100)
        request["eta"] = f"{eta_minutes} mins"

    schedule_cache_refresh(background_tasks)
    return {"success": True, "request": request}


@app.post("/complete")
async def complete_request(payload: CompleteIn, background_tasks: BackgroundTasks):
    request = find_request(payload.request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    request["status"] = "completed"
    request["executionStatus"] = "completed"
    consume_inventory_for_request(request)
    volunteer_id = request.get("assignedVolunteerId")
    if volunteer_id:
        volunteer = find_volunteer(volunteer_id)
        if volunteer:
            volunteer["availability"] = "available"
            volunteer["tasksCompleted"] += 1
            volunteer["assignedRequest"] = None

    mission = next((item for item in missions if item["requestId"] == request["id"]), None)
    if mission:
        mission["status"] = "completed"
        mission["completedAt"] = now_iso()

    if request.get("category") and request.get("location"):
        duplicate_request_index.pop(duplicate_key(request["category"], request["location"]), None)

    schedule_cache_refresh(background_tasks)
    return {"success": True, "request": request}


@app.post("/volunteer/accept")
async def volunteer_accept(payload: VolunteerAcceptIn, background_tasks: BackgroundTasks):
    """Volunteer accepts an assigned request"""
    request = find_request(payload.request_id)
    volunteer = find_volunteer(payload.volunteer_id)
    
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    if request.get("assignedVolunteerId") != volunteer["id"]:
        raise HTTPException(status_code=400, detail="This request is not assigned to you")
    if request["status"] == "completed":
        raise HTTPException(status_code=400, detail="Request already completed")
    
    # Update request to accepted state
    request["status"] = "accepted"
    request["executionStatus"] = "assigned"
    if not request.get("acceptedAt"):
        request["acceptedAt"] = now_iso()
    
    # Cancel the timeout since volunteer accepted
    if payload.request_id in assignment_timeouts:
        assignment_timeouts[payload.request_id].cancel()
        assignment_timeouts.pop(payload.request_id, None)
    
    # Update tracking
    if payload.request_id in assignment_tracker:
        assignment_tracker[payload.request_id]["status"] = "accepted"
    
    schedule_cache_refresh(background_tasks)
    return {"success": True, "status": "accepted", "request": request}


@app.post("/volunteer/reject")
async def volunteer_reject(payload: VolunteerRejectIn, background_tasks: BackgroundTasks):
    """Volunteer rejects an assigned request - triggers reassignment"""
    request = find_request(payload.request_id)
    volunteer = find_volunteer(payload.volunteer_id)
    
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    if request.get("assignedVolunteerId") != volunteer["id"]:
        raise HTTPException(status_code=400, detail="This request is not assigned to you")
    
    # Unassign current volunteer
    volunteer["availability"] = "available"
    volunteer["assignedRequest"] = None
    
    # Cancel timeout
    if payload.request_id in assignment_timeouts:
        assignment_timeouts[payload.request_id].cancel()
        assignment_timeouts.pop(payload.request_id, None)
    
    # Try to assign to next best volunteer
    new_volunteer = find_best_volunteer(request)
    if new_volunteer:
        request["assignedVolunteerId"] = new_volunteer["id"]
        request["assignedVolunteerName"] = new_volunteer["name"]
        new_volunteer["availability"] = "busy"
        new_volunteer["assignedRequest"] = payload.request_id
        assignment_tracker[payload.request_id]["volunteer_id"] = new_volunteer["id"]
        # Start new timeout
        assignment_timeouts[payload.request_id] = asyncio.create_task(
            handle_assignment_timeout(payload.request_id)
        )
    else:
        # No volunteers available, revert to pending
        request["status"] = "pending"
        request["assignedVolunteerId"] = None
        request["assignedVolunteerName"] = None
        request["assignedAt"] = None
        assignment_tracker.pop(payload.request_id, None)
    
    schedule_cache_refresh(background_tasks)
    return {"success": True, "status": "reassigning", "request": request}


@app.get("/volunteer/{volunteer_id}/tasks")
async def get_volunteer_tasks(volunteer_id: str) -> dict[str, Any]:
    """Get all assigned/active tasks for a volunteer"""
    volunteer = find_volunteer(volunteer_id)
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    
    # Get all assigned requests for this volunteer
    assigned_requests = [
        req for req in requests
        if req.get("assignedVolunteerId") == volunteer_id and 
           req.get("status") in {"assigned", "accepted", "on_the_way"}
    ]
    
    # Sort by priority (highest first) then by assignment time (earliest first)
    assigned_requests.sort(
        key=lambda r: (-r.get("priority", 0), r.get("assignedAt", now_iso()))
    )
    
    return {
        "volunteer": volunteer,
        "activeTasks": len(assigned_requests),
        "tasks": [compact_request(req) for req in assigned_requests],
        "completedTasks": volunteer.get("tasksCompleted", 0),
    }


@app.post("/auto-assign")
async def trigger_auto_assign(request_id: str, background_tasks: BackgroundTasks):
    """Manually trigger auto-assignment for a pending request"""
    request = find_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be auto-assigned")
    
    success = auto_assign_volunteer(request)
    schedule_cache_refresh(background_tasks)
    
    if not success:
        return {"success": False, "message": "No available volunteers"}
    
    return {
        "success": True,
        "message": "Request auto-assigned",
        "request": request,
        "assignedTo": request.get("assignedVolunteerName")
    }


@app.get("/volunteers")
async def get_volunteers() -> list[dict[str, Any]]:
    return volunteers


@app.post("/volunteer")
async def create_volunteer(payload: VolunteerIn, background_tasks: BackgroundTasks):
    global volunteer_counter
    zone = payload.zone if payload.zone in ZONE_COORDS else "Ranchi"
    lat = payload.lat if payload.lat is not None else ZONE_COORDS[zone][0]
    lng = payload.lng if payload.lng is not None else ZONE_COORDS[zone][1]
    volunteer = {
        "id": f"VOL-{volunteer_counter:03}",
        "name": payload.name,
        "phone": payload.phone,
        "skills": payload.skills,
        "vehicle": payload.vehicle,
        "availability": payload.availability,
        "zone": zone,
        "image": payload.image or f"https://i.pravatar.cc/150?img={(volunteer_counter % 70) + 1}",
        "idCard": payload.id_card or f"JH-NDMA-{volunteer_counter:04}",
        "lat": lat,
        "lng": lng,
        "tasksCompleted": 0,
    }
    volunteers.append(volunteer)
    volunteer_counter += 1
    schedule_cache_refresh(background_tasks)
    return volunteer


@app.post("/volunteer/status")
async def update_volunteer_status(payload: VolunteerStatusIn, background_tasks: BackgroundTasks):
    volunteer = find_volunteer(payload.volunteer_id)
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    volunteer["availability"] = payload.availability
    schedule_cache_refresh(background_tasks)
    return {"success": True, "volunteer": volunteer}


@app.post("/alerts")
async def create_alert(payload: AlertIn, background_tasks: BackgroundTasks):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    sent_to = 1200 + (len(alerts) * 37)
    channels = [channel.upper() for channel in payload.channels]
    feed_line = f"{message} | Message sent to {sent_to} users via {'/'.join(channels)}"
    alerts.insert(0, feed_line)

    schedule_cache_refresh(background_tasks)

    return {
        "success": True,
        "message": message,
        "meta": {
            "sentTo": sent_to,
            "channels": channels,
            "delivery": "Delivered via SMS / IVR / WhatsApp",
        },
        "feed": feed_line,
    }


@app.post("/whatsapp/send-broadcast")
async def whatsapp_send_broadcast(payload: dict[str, str]):
    zone = str(payload.get("zone") or "Ranchi")
    message = str(payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    recipients = zone_recipient_counts(zone)
    return {
        "success": True,
        "zone": zone,
        "channel": "whatsapp",
        "delivered": recipients["whatsapp"],
        "message": message,
    }


@app.get("/weather")
async def get_weather(zone: str = "Ranchi") -> dict[str, Any]:
    return fetch_weather(zone)


@app.get("/risk-analysis")
async def get_risk_analysis(zone: str = "Ranchi") -> dict[str, Any]:
    weather = fetch_weather(zone)
    risk = analyze_weather_risk(weather)
    risk["auto_message"] = auto_generate_broadcast_message(risk)
    return risk


@app.get("/alerts/history")
async def get_alerts_history(limit: int = 30) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 100))
    return {"items": broadcast_alerts[:safe_limit], "count": len(broadcast_alerts)}


@app.post("/broadcast")
async def create_broadcast(payload: BroadcastIn, request: Request, background_tasks: BackgroundTasks) -> dict[str, Any]:
    role = request.headers.get("x-user-role", "").strip().lower()
    if role not in {"government", "ngo"}:
        raise HTTPException(status_code=403, detail="Only NGO/Government role can send broadcast alerts")

    actor = request.headers.get("x-user-id") or role
    enforce_broadcast_rate_limit(actor)

    resolved_zone = payload.zone if payload.zone in ZONE_COORDS else "Ranchi"
    message = payload.message.strip()
    if not message:
        risk = analyze_weather_risk(fetch_weather(resolved_zone))
        message = auto_generate_broadcast_message(risk)

    recipients = zone_recipient_counts(resolved_zone)
    selected_channels = [channel for channel in payload.channels if channel in {"sms", "whatsapp", "app"}]
    if not selected_channels:
        selected_channels = ["sms", "whatsapp", "app"]

    # Simulate WhatsApp broadcast delivery using dedicated channel endpoint contract.
    if "whatsapp" in selected_channels:
        _ = await whatsapp_send_broadcast({"zone": resolved_zone, "message": message})

    history_entry = append_broadcast_history(
        message=message,
        zone=resolved_zone,
        alert_type=payload.type,
        channels=selected_channels,
        recipients={channel: recipients.get(channel, 0) for channel in selected_channels},
        created_by=role,
    )

    schedule_cache_refresh(background_tasks)
    return {
        "success": True,
        "alert": history_entry,
        "delivery": {
            "zone": resolved_zone,
            "channels": selected_channels,
            "counts": {channel: recipients.get(channel, 0) for channel in selected_channels},
        },
    }


@app.post("/ivr")
async def ivr_create(request: Request, background_tasks: BackgroundTasks):
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        payload = await request.json()
        phone = str(payload.get("phone") or payload.get("From") or "").strip()
        digit = str(payload.get("digit") or payload.get("Digits") or "").strip()
        location = str(payload.get("location") or "").strip() or None
        zone = str(payload.get("zone") or "").strip() or None
        payload_kind = "json"
    else:
        raw_body = (await request.body()).decode("utf-8", errors="ignore")
        form = parse_qs(raw_body)
        phone = str((form.get("From") or form.get("phone") or [""])[0]).strip()
        digit = str((form.get("Digits") or form.get("digit") or [""])[0]).strip()
        location = str((form.get("location") or [""])[0]).strip() or None
        zone = str((form.get("zone") or [""])[0]).strip() or None
        payload_kind = "form"

    if not digit:
        reply = "Humein koi input prapt nahi hua. Kripya dobara call karein."
        if payload_kind == "json":
            return {"success": False, "message": reply}
        return Response(
            content=(
                "<Response>"
                f"<Say language=\"hi-IN\" voice=\"Polly.Aditi\">{xml_escape(reply)}</Say>"
                "</Response>"
            ),
            media_type="application/xml",
        )

    category, _service_label = IVR_DIGIT_MAP.get(digit, ("food", "Food"))
    zone_value = zone or ivr_zone_from_phone(phone)
    lat, lng = random_point_near_zone(zone_value)
    location_value = location or f"Auto detected zone, {zone_value}"

    request = build_request(
        name="IVR User",
        phone=phone or "unknown",
        category=category,  # type: ignore[arg-type]
        family_size=random.randint(2, 6),
        location=location_value,
        zone=zone_value,
        source="ivr",
        lat=lat,
        lng=lng,
    )
    background_tasks.add_task(apply_request_post_processing, request["id"])
    schedule_cache_refresh(background_tasks)

    if payload_kind == "json":
        return request

    request_id = request["id"]
    return Response(
        content=(
            "<Response>"
            "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Dhanyavaad. Aapki sahayata request safalta se register ho gayi hai.</Say>"
            "<Pause length=\"1\"/>"
            f"<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Kripya dhyaan dein. Aapka request ID hai {xml_escape(request_id)}</Say>"
            "<Pause length=\"1\"/>"
            "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Hamari team turant aapki madad ke liye aarahi hai .</Say>"
            "<Pause length=\"1\"/>"
            "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Kripya aap apna khayal rakhein.</Say>"
            "<Hangup/>"
            "</Response>"
        ),
        media_type="application/xml",
    )


@app.api_route("/twilio/voice", methods=["GET", "POST"])
async def twilio_voice_entry() -> Response:
    action_url = f"{backend_public_url()}/ivr"
    twiml = (
        "<Response>"
        f"<Gather numDigits=\"1\" action=\"{xml_escape(action_url)}\" method=\"POST\">"
        "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Chikitsa sahayata ke liye 1 dabaiye.</Say>"
        "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Bhojan sahayata ke liye 2 dabaiye.</Say>"
        "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Rescue ke liye 3 dabaiye.</Say>"
        "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Paani aur shelter ke liye 4 dabaiye.</Say>"
        "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Mahila aur bachcha suraksha ke liye 5 dabaiye.</Say>"
        "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Aapatkalin samaan ke liye 6 dabaiye.</Say>"
        "</Gather>"
        "<Say language=\"hi-IN\" voice=\"Polly.Aditi\">Humein koi input prapt nahi hua. Kripya dobara call karein.</Say>"
        "</Response>"
    )
    return Response(content=twiml, media_type="application/xml")
    return request


@app.post("/sms")
async def sms_create(request: Request, background_tasks: BackgroundTasks):
    content_type = request.headers.get("content-type", "")
    request_result: dict[str, Any] | None = None

    if "application/json" in content_type:
        payload = await request.json()
        phone = str(payload.get("phone") or payload.get("From") or "").strip()
        message = str(payload.get("message") or payload.get("Body") or "").strip()
        payload_kind = "json"
    else:
        raw_body = (await request.body()).decode("utf-8", errors="ignore")
        form = parse_qs(raw_body)
        phone = str((form.get("From") or form.get("phone") or [""])[0]).strip()
        message = str((form.get("Body") or form.get("message") or [""])[0]).strip()
        payload_kind = "form"

    if not phone:
        reply_text = "Phone number not detected. Please try again."
        if payload_kind == "json":
            return {"success": False, "message": reply_text}
        return Response(content=f"<Response><Message>{xml_escape(reply_text)}</Message></Response>", media_type="application/xml")

    normalized_phone = phone.strip().lower()
    state = sms_user_state.get(normalized_phone)
    msg = message.strip().lower()

    if not state or msg in {"hi", "help", "start", "hello", "namaste", "reset", "restart"}:
        sms_user_state[normalized_phone] = {
            "step": "language",
            "language": None,
            "zone": sms_zone_from_phone(phone),
            "service": None,
            "serviceLabel": None,
            "block": None,
            "location": None,
            "lat": None,
            "lng": None,
        }
        reply_text = sms_language_prompt()
    else:
        step = str(state.get("step") or "language")
        language = str(state.get("language") or "English")
        zone_value = str(state.get("zone") or sms_zone_from_phone(phone))

        if step == "language":
            if message.strip() == "1":
                state["language"] = "Hindi"
                state["step"] = "service"
                reply_text = sms_service_prompt("Hindi")
            elif message.strip() == "2":
                state["language"] = "English"
                state["step"] = "service"
                reply_text = sms_service_prompt("English")
            else:
                reply_text = sms_language_prompt()

        elif step == "service":
            selected = IVR_DIGIT_MAP.get(message.strip())
            if not selected:
                reply_text = sms_service_prompt(language)
            else:
                category, label = selected
                state["service"] = category
                state["serviceLabel"] = label
                state["step"] = "block"
                reply_text = sms_block_prompt(language)

        elif step == "block":
            block_options = {
                "1": "Sector 1",
                "2": "Sector 2",
                "3": "Sector 3",
                "4": "Sector 4",
                "5": "Sector 5",
            }
            selected_block = block_options.get(message.strip())
            if not selected_block:
                reply_text = sms_block_prompt(language)
            else:
                lat, lng = whatsapp_block_coords(zone_value, selected_block)
                state["block"] = selected_block
                state["location"] = f"{selected_block}, {zone_value}"
                state["lat"] = lat
                state["lng"] = lng

                category = state.get("service") or "food"
                service_label = str(state.get("serviceLabel") or str(category).upper())
                location_value = str(state["location"])

                request_result = build_request(
                    name="SMS User",
                    phone=phone,
                    category=category,  # type: ignore[arg-type]
                    family_size=random.randint(2, 6),
                    location=location_value,
                    zone=zone_value,
                    source="sms",
                    lat=float(state["lat"]),
                    lng=float(state["lng"]),
                )
                background_tasks.add_task(apply_request_post_processing, request_result["id"])
                schedule_cache_refresh(background_tasks)
                sms_user_state.pop(normalized_phone, None)

                if language == "Hindi":
                    reply_text = (
                        "✅ आपकी सहायता अनुरोध दर्ज हो गया है\n"
                        f"🆔 Request ID: {request_result['id']}\n"
                        f"📍 स्थान: {location_value}\n\n"
                        "🚑 सहायता आपके पास भेजी जा रही है\n"
                        "कृपया फोन चालू रखें"
                    )
                else:
                    reply_text = (
                        "✅ Your request has been registered\n"
                        f"Request ID: {request_result['id']}\n"
                        f"Location: {location_value}\n\n"
                        "Help is on the way. Please keep your phone active."
                    )

        else:
            state["step"] = "language"
            reply_text = sms_language_prompt()

    if payload_kind == "json":
        response_data: dict[str, Any] = {
            "success": True,
            "message": reply_text,
            "state": sms_user_state.get(normalized_phone),
        }
        if request_result is not None:
            response_data["request"] = request_result
        return response_data

    return Response(
        content=f"<Response><Message>{xml_escape(reply_text)}</Message></Response>",
        media_type="application/xml",
    )


@app.post("/whatsapp")
async def whatsapp_create(request: Request, background_tasks: BackgroundTasks):
    # Parse Twilio form request
    raw_body = (await request.body()).decode("utf-8", errors="ignore")
    form = parse_qs(raw_body)
    phone = str((form.get("From") or form.get("phone") or [""])[0]).strip()
    message = str((form.get("Body") or form.get("message") or [""])[0]).strip()

    if not phone:
        reply_text = "Unable to detect phone number. Please try again."
    else:
        normalized_phone = phone.strip().lower()
        msg = message.strip().lower()
        zone_value = "Dhanbad"

        # Get or create user state
        state = whatsapp_user_state.get(normalized_phone)

        if msg in {"hi", "hello", "start", "reset", "restart"} or state is None:
            # Step 1: Greeting
            whatsapp_user_state[normalized_phone] = {
                "step": "language",
                "language": None,
                "zone": zone_value,
            }
            reply_text = whatsapp_language_prompt()
        else:
            step = state.get("step", "language")
            language = state.get("language", "English")

            if step == "language":
                # Step 2: Language Selection
                if message.strip() == "1":
                    state["language"] = "Hindi"
                    state["step"] = "service"
                    reply_text = whatsapp_service_prompt("Hindi")
                elif message.strip() == "2":
                    state["language"] = "English"
                    state["step"] = "service"
                    reply_text = whatsapp_service_prompt("English")
                else:
                    reply_text = whatsapp_language_prompt()

            elif step == "service":
                # Step 3: Service Selection → Create Request
                selected = IVR_DIGIT_MAP.get(message.strip())
                if not selected:
                    reply_text = whatsapp_service_prompt(language)
                else:
                    category, _label = selected
                    lat, lng = ZONE_COORDS.get(zone_value, ZONE_COORDS["Dhanbad"])

                    request_result = build_request(
                        name="WhatsApp User",
                        phone=phone,
                        category=category,  # type: ignore[arg-type]
                        family_size=random.randint(2, 5),
                        location="Auto detected area",
                        zone=zone_value,
                        source="whatsapp",
                        lat=lat,
                        lng=lng,
                    )
                    background_tasks.add_task(apply_request_post_processing, request_result["id"])
                    schedule_cache_refresh(background_tasks)
                    whatsapp_user_state.pop(normalized_phone, None)

                    # Step 5: Final Reply
                    reply_text = (
                        "Request Registered Successfully\n"
                        f"ID: {request_result['id']}\n"
                        "Help is on the way"
                    )
            else:
                reply_text = whatsapp_language_prompt()

    if not reply_text:
        reply_text = "Please type Hi to start"

    # Return TwiML XML
    response_xml = (
        f"<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        f"<Response><Message>{xml_escape(reply_text)}</Message></Response>"
    )
    return Response(content=response_xml, media_type="text/xml")


@app.post("/missed-call")
async def missed_call_create(payload: MissedCallIn, background_tasks: BackgroundTasks):
    zone = payload.zone or "Dhanbad"
    phone = payload.phone or f"98{datetime.now().strftime('%H%M%S')}"
    location = payload.location or f"{zone} Missed Call Signal"
    request = build_request(
        name="Unknown Caller",
        phone=phone,
        category="rescue",
        family_size=1,
        location=location,
        zone=zone,
        source="missed_call",
    )
    background_tasks.add_task(apply_request_post_processing, request["id"])
    schedule_cache_refresh(background_tasks)
    return request


@app.post("/drone")
async def drone_create(payload: DroneDetectionIn, background_tasks: BackgroundTasks):
    zone = payload.zone or payload.area or "Ranchi"
    location = payload.area or f"{zone} Drone Detection"
    detected_people = max(1, int(payload.people_count or payload.persons or 1))
    risk_level, auto_flag, priority_score, status_text = drone_risk_profile(detected_people)
    if payload.priority in {"LOW", "MEDIUM", "HIGH"}:
        risk_level = payload.priority
    incoming_flag = payload.flag if payload.flag in {"red", "yellow", "green"} else auto_flag
    category: RequestCategory = "rescue" if incoming_flag in {"red", "yellow"} else "food"
    lat = payload.lat
    lng = payload.lng
    if lat is None or lng is None:
        lat = ZONE_COORDS["Ranchi"][0]
        lng = ZONE_COORDS["Ranchi"][1]
    request = build_request(
        name=f"Drone Target {payload.id or 'AUTO'}",
        phone="0000000000",
        category=category,
        family_size=detected_people,
        location=location,
        zone=zone,
        source="drone",
        lat=lat,
        lng=lng,
    )

    request["priority"] = max(int(request.get("priority", 0)), priority_score)
    request["peopleCount"] = detected_people
    request["riskLevel"] = risk_level
    request["detectedAt"] = payload.detected_at or now_iso()

    image_url = payload.image_path
    image_path = payload.image_path
    if payload.image:
        capture = save_drone_capture_image(payload.image, request["id"])
        image_url = capture["url"]
        image_path = capture["path"]

    if image_url:
        request["droneImage"] = image_url
        request["droneImagePath"] = image_path

    request["droneMeta"] = {
        "peopleCount": detected_people,
        "riskLevel": risk_level,
        "statusText": payload.status_text or status_text,
        "detectedAt": request["detectedAt"],
        "image": request.get("droneImage"),
        "imagePath": request.get("droneImagePath"),
        "flag": incoming_flag,
    }

    request["priorityReason"] = (
        f"Drone surveillance flagged {detected_people} person(s) with {risk_level.lower()} crowd risk."
    )
    request["resourceSummary"] = f"Drone crowd watch active near {location}."

    background_tasks.add_task(apply_request_post_processing, request["id"])
    schedule_cache_refresh(background_tasks)
    return request


@app.post("/drone/detect")
async def drone_detect(payload: DroneDetectIn) -> dict[str, Any]:
    return await run_drone_detection(payload.image, payload.confidence)


@app.post("/predict")
async def predict(frame: UploadFile = File(...), confidence: float = Form(0.35)) -> dict[str, Any]:
    # API alias for webcam pipeline that sends multipart/form-data frames.
    content = await frame.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded frame is empty")

    mime = frame.content_type or "image/jpeg"
    image_data = f"data:{mime};base64,{base64.b64encode(content).decode('utf-8')}"
    detection = await run_drone_detection(image_data, confidence)
    risk_score_map = {"LOW": 0.35, "MEDIUM": 0.65, "HIGH": 0.9}
    priority = detection.get("risk_level", "LOW")
    detection["risk_score"] = risk_score_map.get(priority, 0.35)
    detection["priority"] = priority
    return detection


@app.get("/drone/frame/{filename}")
async def drone_frame(filename: str):
    safe_name = Path(filename).name
    file_path = DRONE_FRAME_DIR / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Drone frame not found")
    return FileResponse(str(file_path))


@app.post("/priority")
async def update_priority(payload: PriorityIn, background_tasks: BackgroundTasks):
    request = find_request(payload.request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    request["priority"] = payload.priority
    schedule_cache_refresh(background_tasks)
    return {"success": True, "request": request}

# NGO DASHBOARD API
@app.get("/data")
def get_data():
    return requests


@app.get("/dashboard")
async def get_dashboard(
    request: Request,
    response: Response,
    compact: bool = False,
    last_updated: str | None = None,
) -> Any:
    # Default behavior remains full payload for compatibility.
    payload = dashboard_cache_compact if compact else dashboard_cache_full

    etag = f'W/"{dashboard_cache_updated_at}"'
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "no-cache"

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "no-cache"})

    if last_updated and last_updated == dashboard_cache_updated_at:
        return {
            "summary": payload.get("summary", {}),
            "resources": payload.get("resources", []),
            "alerts": [],
            "volunteers": [],
            "requests": [],
            "missions": [],
            "camps": payload.get("camps", []),
            "updatedAt": dashboard_cache_updated_at,
            "lastUpdated": dashboard_cache_updated_at,
        }

    return payload
