
import os
import io
import base64
import json
import numpy as np
import cv2
from PIL import Image
from fastapi import FastAPI, UploadFile, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import List, Optional, Tuple
from ultralytics import YOLO
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

app = FastAPI()

# --- Config ---
API_SECRET = os.getenv("API_SECRET", "default_secret_123")
MODEL_NAME = "yolov8n.pt"  # Nano model for speed

print(f"Loading model {MODEL_NAME}...")
model = YOLO(MODEL_NAME)
print("Model loaded.")

# --- Models ---
class DetectionRequest(BaseModel):
    images: List[str]  # Base64 encoded images
    camera_name: str
    zone_points: Optional[List[List[float]]] = None # [[x,y], [x,y]] normalized 0-1
    # Dynamic Settings
    person_iou_threshold: Optional[float] = 0.6
    vehicle_iou_threshold: Optional[float] = 0.9
    ignore_moving_persons: Optional[bool] = True

class AnalysisResult(BaseModel):
    shouldAlert: bool
    description: str
    confidence: float
    detectedObjects: List[str]

# --- Auth ---
async def verify_token(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid header format")
    token = authorization.split(" ")[1]
    if token != API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid API Secret")
    return token

# --- Helpers ---
def base64_to_cv2(b64_str):
    image_data = base64.b64decode(b64_str)
    image = Image.open(io.BytesIO(image_data))
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

def calculate_iou(box1, box2):
    # box: [x1, y1, x2, y2]
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    box1Area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2Area = (box2[2] - box2[0]) * (box2[3] - box2[1])

    iou = interArea / float(box1Area + box2Area - interArea)
    return iou

def is_inside_zone(box, zone_poly: Polygon, width, height):
    if not zone_poly or zone_poly.is_empty:
        return True # No zone defined = everywhere is valid
    
    # Calculate centroid
    cx = (box[0] + box[2]) / 2 / width
    cy = (box[1] + box[3]) / 2 / height
    
    point = Point(cx, cy)
    return zone_poly.contains(point)

# --- Core Logic ---
@app.post("/detect", response_model=AnalysisResult)
async def detect(payload: DetectionRequest, token: str = Depends(verify_token)):
    try:
        if len(payload.images) == 0:
            return AnalysisResult(shouldAlert=False, description="No images provided", confidence=0, detectedObjects=[])

        print(f"Processing {len(payload.images)} frames from {payload.camera_name}")
        
        # Prepare Zone
        zone_poly = None
        if payload.zone_points and len(payload.zone_points) >= 3:
            zone_poly = Polygon(payload.zone_points)
            print(f"Zone defined: {len(payload.zone_points)} points")
        
        frames_detections = [] # [{class: 'person', box: [...], conf: 0.9}, ...] for each frame
        
        # 1. Run Detection on all frames
        for b64 in payload.images:
            img = base64_to_cv2(b64)
            h, w = img.shape[:2]
            results = model(img, verbose=False)[0]
            
            frame_dets = []
            for box in results.boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                conf = float(box.conf[0])
                xyxy = box.xyxy[0].tolist()
                
                # Filter useful classes
                if cls_name not in ['person', 'car', 'motorcycle', 'truck', 'bus']:
                    continue
                
                # Check Zone
                if zone_poly and not is_inside_zone(xyxy, zone_poly, w, h):
                    continue
                
                frame_dets.append({
                    "class": cls_name,
                    "box": xyxy,
                    "conf": conf
                })
            frames_detections.append(frame_dets)

        # 2. Analyze Behavior across frames
        # We need at least 3 frames for reliable movement analysis
        if len(frames_detections) < 3:
             # Fallback: Just report presence if any important object found in last frame
             last_frame_dets = frames_detections[-1] if frames_detections else []
             if last_frame_dets:
                 det_names = list(set([d['class'] for d in last_frame_dets]))
                 return AnalysisResult(
                     shouldAlert=True,
                     description=f"Phát hiện: {', '.join(det_names)} (Không đủ ảnh để phân tích hành vi)",
                     confidence=last_frame_dets[0]['conf'] * 100,
                     detectedObjects=det_names
                 )
             else:
                 return AnalysisResult(shouldAlert=False, description="Không phát hiện đối tượng", confidence=0, detectedObjects=[])

        # Track objects across frames (Simple greedy matching by IOU)
        # We focus on the "most prominent" object chain
        
        # Flatten and count classes
        all_objs = [d for frame in frames_detections for d in frame]
        if not all_objs:
             return AnalysisResult(shouldAlert=False, description="Không phát hiện đối tượng trong vùng", confidence=0, detectedObjects=[])

        # Prioritize Person Logic then Vehicle Logic
        has_person = any(d['class'] == 'person' for d in all_objs)
        
        alerts = []
        max_conf = 0
        detected_types = set()

        # Simple Logic: Check consistency of positions for each object "trace"
        # Since we don't have a tracker ID, we assume object 1 in frame 1 maps to object 1 in frame 2 if IOU is high
        
        first_frame_dets = frames_detections[0]
        
        # Calculate max confidence from ALL objects in chain
        for d in all_objs:
             max_conf = max(max_conf, d['conf'])

        for bet in first_frame_dets:
            obj_class = bet['class']
            box = bet['box']
            detected_types.add(obj_class)
            # max_conf updated above globally
            
            # Try to match in Frame 2 and Frame 3
            match_f2 = None
            for det2 in frames_detections[1]:
                if det2['class'] == obj_class and calculate_iou(box, det2['box']) > 0.1: # Loose match
                    match_f2 = det2
                    break
            
            match_f3 = None
            if match_f2:
                 for det3 in frames_detections[2]:
                    if det3['class'] == obj_class and calculate_iou(match_f2['box'], det3['box']) > 0.1:
                        match_f3 = det3
                        break
            
            if match_f2 and match_f3:
                # We have a chain of 3 frames
                # Calculate Intersection of all 3
                iou_1_3 = calculate_iou(box, match_f3['box'])
                
                # RULES
                if obj_class == 'person':
                    # Use dynamic settings
                    threshold = payload.person_iou_threshold if payload.person_iou_threshold is not None else 0.6
                    ignore_moving = payload.ignore_moving_persons if payload.ignore_moving_persons is not None else True
                    
                    if iou_1_3 > threshold:
                        alerts.append(f"Có người lảng vảng/đứng yên ({int(iou_1_3*100)}% > {int(threshold*100)}%)")
                    elif not ignore_moving:
                        alerts.append(f"Người đang di chuyển (IOU: {iou_1_3:.2f})")
                    else:
                        print(f"Ignored moving person (IOU: {iou_1_3:.2f})")
                
                elif obj_class in ['car', 'motorcycle', 'truck', 'bus']:
                    threshold = payload.vehicle_iou_threshold if payload.vehicle_iou_threshold is not None else 0.9
                    
                    if iou_1_3 > threshold:
                         alerts.append(f"{obj_class} đỗ trái phép/dừng lâu ({int(iou_1_3*100)}%)")
                    else:
                        print(f"Ignored moving vehicle (IOU: {iou_1_3:.2f})")

        if not alerts:
             # Objects found but didn't trigger specific rules (e.g. moving cars)
             # If Person was found but logic failed (maybe lost tracking), still alert "Person detected"
             if has_person:
                 return AnalysisResult(
                    shouldAlert=True, 
                    description="Phát hiện người (Chuyển động không rõ)", 
                    confidence=max_conf * 100, 
                    detectedObjects=list(detected_types)
                )
             return AnalysisResult(shouldAlert=False, description="Xe cộ di chuyển (Bỏ qua)", confidence=0, detectedObjects=list(detected_types))
        
        # Consolidate Alerts
        unique_alerts = list(set(alerts))
        final_desc = ", ".join(unique_alerts)
        
        return AnalysisResult(
            shouldAlert=True,
            description=final_desc,
            confidence=max_conf * 100,
            detectedObjects=list(detected_types)
        )

    except Exception as e:
        print(f"Error: {e}")
        return AnalysisResult(shouldAlert=False, description=f"Server Error: {str(e)}", confidence=0, detectedObjects=[])
