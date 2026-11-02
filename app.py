import os
import time
import base64
import threading
from collections import deque
from datetime import datetime, timezone

import cv2
import numpy as np
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

CAMERA_CAPTURE_URL = os.getenv("CAMERA_CAPTURE_URL", "http://192.168.1.11/capture")
MODEL_PATH = os.getenv("MODEL_PATH", "yolo11n.pt")
PERSON_CLASS_ID = int(os.getenv("PERSON_CLASS_ID", "0"))
YOLO_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.35"))
YOLO_IMAGE_SIZE = int(os.getenv("YOLO_IMAGE_SIZE", "640"))
ROVER_ID = os.getenv("ROVER_ID", "ROVER_1")

# Load YOLO once at startup. If the weights are not present, Ultralytics
# downloads yolo11n.pt automatically (internet required for first launch).
model = None
model_error = None
try:
    model = YOLO(MODEL_PATH)
    print(f"[YOLO] Loaded model: {MODEL_PATH}")
except Exception as exc:
    model_error = str(exc)
    print(f"[YOLO LOAD ERROR] {model_error}")

lock = threading.Lock()
latest_telemetry = {}
history = deque(maxlen=180)
detection_state = {
    "available": False, "human_detected": False, "count": 0,
    "detections": [], "annotated_image": None, "updated_at": None,
    "error": "Press Start monitoring to begin camera inference."
}
alerts = deque(maxlen=150)
latest_command = {"command": "stop", "updated_at": None}
monitoring = False
monitor_thread = None
last_human_state = False

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def add_alert(level, title, message):
    with lock:
        alerts.appendleft({
            "id": int(time.time() * 1000),
            "level": level, "title": title, "message": message,
            "time": now_iso()
        })

def fetch_camera_frame():
    response = requests.get(CAMERA_CAPTURE_URL, timeout=5)
    response.raise_for_status()
    data = np.frombuffer(response.content, dtype=np.uint8)
    frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Could not decode JPEG from ESP32-CAM /capture")
    return frame

def detect_frame(frame):
    global last_human_state
    if model is None:
        raise RuntimeError(model_error or "YOLO model is not loaded")

    h, w = frame.shape[:2]
    results = model.predict(
        source=frame,
        imgsz=YOLO_IMAGE_SIZE,
        conf=YOLO_CONFIDENCE,
        classes=[PERSON_CLASS_ID],
        verbose=False
    )
    result = results[0]
    detections = []

    if result.boxes is not None:
        for box in result.boxes:
            confidence = float(box.conf[0].item())
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            detections.append({
                "class": "person",
                "confidence": confidence,
                "box": [x1, y1, x2, y2],
                "center": [(x1 + x2) // 2, (y1 + y2) // 2]
            })
            cv2.rectangle(frame, (x1, y1), (x2, y2), (50, 220, 130), 2)
            label = f"PERSON {confidence:.2f}"
            cv2.rectangle(frame, (x1, max(0, y1 - 26)), (x1 + 150, y1), (20, 90, 70), -1)
            cv2.putText(frame, label, (x1 + 5, max(16, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

    human_detected = len(detections) > 0
    if human_detected and not last_human_state:
        add_alert("critical", "Possible person detected",
                  f"{len(detections)} person detection(s). Verify the camera image.")
    last_human_state = human_detected

    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    if not ok:
        raise RuntimeError("Could not encode annotated camera image")
    image_b64 = base64.b64encode(encoded.tobytes()).decode("ascii")

    return {
        "available": True,
        "human_detected": human_detected,
        "count": len(detections),
        "detections": detections,
        "annotated_image": image_b64,
        "frame_width": w,
        "frame_height": h,
        "updated_at": now_iso(),
        "error": None,
        "model": MODEL_PATH
    }

def monitor_loop():
    global monitoring, detection_state
    while monitoring:
        try:
            frame = fetch_camera_frame()
            result = detect_frame(frame)
            with lock:
                detection_state = result
        except Exception as exc:
            with lock:
                detection_state = {
                    "available": False, "human_detected": False, "count": 0,
                    "detections": [], "annotated_image": None,
                    "updated_at": now_iso(), "error": str(exc)
                }
        time.sleep(0.8)

@app.get("/")
def dashboard():
    return render_template("index.html")

@app.get("/api/health")
def health():
    with lock:
        return jsonify({
            "status": "online",
            "model_loaded": model is not None,
            "model_path": MODEL_PATH,
            "model_error": model_error,
            "camera_capture_url": CAMERA_CAPTURE_URL,
            "monitoring": monitoring,
            "time": now_iso()
        })

@app.post("/api/telemetry")
def receive_telemetry():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"ok": False, "error": "Expected JSON object"}), 400
    data["received_at"] = now_iso()
    data.setdefault("rover_id", ROVER_ID)
    with lock:
        latest_telemetry.update(data)
        history.append(dict(data))
    for key, label in [("mq2_raw", "MQ-2"), ("mq4_raw", "MQ-4"), ("co_raw", "CO")]:
        try:
            value = int(data.get(key, 0))
            if value >= 3000:
                add_alert("warning", f"{label} raw reading elevated",
                          f"{label} ADC value is {value}; calibrate threshold for your sensor.")
        except (TypeError, ValueError):
            pass
    return jsonify({"ok": True, "received_at": data["received_at"]})

@app.get("/api/telemetry")
def get_telemetry():
    with lock:
        return jsonify({"latest": dict(latest_telemetry), "history": list(history)})

@app.get("/api/detection")
def get_detection():
    with lock:
        result = dict(detection_state)
    result["model_loaded"] = model is not None
    if model_error:
        result["model_error"] = model_error
    return jsonify(result)

@app.get("/api/alerts")
def get_alerts():
    with lock:
        return jsonify(list(alerts))

@app.post("/api/monitoring")
def set_monitoring():
    global monitoring, monitor_thread
    body = request.get_json(silent=True) or {}
    enable = bool(body.get("enabled", False))
    if enable and model is None:
        return jsonify({"ok": False, "error": model_error or "YOLO model not loaded"}), 503
    if enable and not monitoring:
        monitoring = True
        monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        monitor_thread.start()
    elif not enable:
        monitoring = False
    return jsonify({"ok": True, "monitoring": monitoring})

@app.post("/api/settings")
def update_settings():
    global CAMERA_CAPTURE_URL, YOLO_CONFIDENCE
    body = request.get_json(silent=True) or {}
    url = body.get("camera_url")
    confidence = body.get("confidence")
    if url:
        CAMERA_CAPTURE_URL = str(url).strip()
    if confidence is not None:
        confidence = float(confidence)
        if not 0.05 <= confidence <= 0.95:
            return jsonify({"ok": False, "error": "Confidence must be between 0.05 and 0.95"}), 400
        YOLO_CONFIDENCE = confidence
    return jsonify({"ok": True, "camera_capture_url": CAMERA_CAPTURE_URL,
                    "confidence": YOLO_CONFIDENCE})

@app.post("/api/command")
def set_command():
    global latest_command
    body = request.get_json(silent=True) or {}
    command = str(body.get("command", "stop")).lower()
    if command not in {"forward", "backward", "left", "right", "stop"}:
        return jsonify({"ok": False, "error": "Invalid command"}), 400
    latest_command = {"command": command, "updated_at": now_iso()}
    return jsonify({"ok": True, **latest_command})

@app.get("/api/command/current")
def current_command():
    return jsonify(latest_command)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    print(f"TERRANEX AquaCare-style dashboard: http://localhost:{port}")
    try:
        app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
    except OSError as err:
        if port == 5000 and "Address already in use" in str(err):
            alt_port = 5050
            print(f"[PORT CONFLICT] Port 5000 is in use (macOS AirPlay). Starting on http://localhost:{alt_port}")
            app.run(host="0.0.0.0", port=alt_port, debug=False, threaded=True)
        else:
            raise

