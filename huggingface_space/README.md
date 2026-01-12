---
title: YOLOv8 API
emoji: 👁️
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
app_port: 7860
---

# YOLOv8 API Server

This space hosts a simple YOLOv8 object detection API.

## API Usage

**POST** `/detect`

**Headers**:
- `Authorization`: `Bearer <YOUR_SECRET>`
- `Content-Type`: `application/json`

**Body**:
```json
{
  "images": ["base64_encoded_image_string", ...],
  "camera_name": "Front Door"
}
```
