ADAS VISION - SETUP GUIDE
=========================

This app requires 2 external files to run (not included due to size).
Place them in the SAME folder as adas_vision.html:

1. tf.min.js         — TensorFlow.js
   Download: https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/dist/tf.min.js

2. coco-ssd.min.js   — COCO-SSD object detection library
   Download: https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd/dist/coco-ssd.min.js

HOW TO RUN
----------
You MUST serve via HTTP (not by opening the file directly).

Option A — Python (quickest):
  cd /path/to/your/folder
  python -m http.server 8080
  Then open: http://localhost:8080/adas_vision.html

Option B — Node.js:
  npx serve .
  Then open the URL shown in the terminal

Option C — VS Code Live Server extension:
  Right-click adas_vision.html → "Open with Live Server"

FEATURES
--------
- Real-time object detection via device camera (rear cam by default)
- Detects: cars, trucks, buses, motorcycles, bicycles, persons, and more
- Risk level indicator (LOW / MED / HIGH) with collision alert
- Camera flip button (front/rear)
- Audio beep alerts (toggle on/off)
- Wake lock — keeps screen on while in use
- Works on mobile browsers (Chrome/Safari)

FOLDER STRUCTURE
----------------
adas_vision.html
tf.min.js
coco-ssd.min.js
README.txt
