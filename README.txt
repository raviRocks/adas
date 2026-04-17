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
- Audio beep alerts (toggle on/off) with haptic feedback
- Wake lock — keeps screen on while in use
- Works on mobile browsers (Chrome/Safari)
- Auto-locks landscape mode for car mounting
- Settings persist (sound toggle saved)

ADVANCED FEATURES (PRODUCTION)
------------------------------
✓ GPS Speed Detection — Only alerts when moving >10 mph (prevents false alarms at traffic lights)
✓ Distance Estimation — Real-time distance calculation for detected objects in meters
✓ Detection Logging — Saves all events to device storage for fleet analysis
  - Timestamped events (timestamp, object class, risk level, confidence, distance, speed, GPS location)
  - Maximum 500 recent logs stored locally
  - Export as CSV for analysis
  - View logs and clear history via chart button (📊)

==============================================
CAR MOUNTING SETUP & USAGE
==============================================

1. HARDWARE SETUP
   - Mount phone in landscape mode on dashboard/windshield
   - Point rear camera toward road ahead
   - Ensure good ventilation around device
   - Consider a phone holder that allows landscape orientation

2. INITIAL SETUP
   a) On your home network computer, start Python server:
      python -m http.server 8080
   
   b) Get your computer's IP address:
      - Windows: ipconfig (look for IPv4 Address like 192.168.x.x)
      - Mac/Linux: ifconfig
   
   c) On your iPhone in the car's WiFi network:
      - Open Safari
      - Go to: http://[YOUR-IP]:8080/adas_vision.html
      - Example: http://192.168.1.2:8080/adas_vision.html

3. INSTALL AS APP (Recommended)
   a) Tap Share button → "Add to Home Screen"
   b) Tap "Add" → App is now standalone on home screen
   c) Launch app from home screen when driving

4. GPS LOCATION & SPEED
   - Grant location access when prompted for GPS tracking
   - Speed display shows real-time speed (must be >10 mph to trigger alerts)
   - Location logged with each detection event for fleet tracking
   - Enable High Accuracy for better GPS readings

5. USAGE IN CAR
   ✓ App auto-locks to landscape mode
   ✓ Screen stays on (wake lock enabled)
   ✓ Speed displayed at top center
   ✓ Large alert in center of screen for HIGH risk (only when moving)
   ✓ Press RIGHT button to toggle detection
   ✓ Press MIDDLE button to flip camera (if mounted backward)
   ✓ Press LEFT (top) button to toggle sound alerts
   ✓ Press CHART (📊) button at bottom to view detection logs

6. RISK LEVELS & ALERTS
   LOW  - Normal traffic, safe distance
   MED  - Multiple vehicles nearby or person detected (alerts at >10 mph)
   HIGH - Large object very close (COLLISION WARNING - only when moving)

7. ALERT SOUNDS & VIBRATION
   - MED Alert: Single beep (440 Hz) + haptic vibration
   - HIGH Alert: Triple beep (880 Hz) + pattern vibration

8. DETECTION LOGGING
   a) Tap 📊 button to view logs
   b) See last 50 detection events with:
      - Exact timestamp
      - Object type detected
      - Risk level
      - Confidence score
      - Estimated distance to object
      - Vehicle speed at time of detection
      - GPS coordinates (if enabled)
   c) Export: Tap "EXPORT CSV" to download all logs as spreadsheet
   d) Clear: Tap "CLEAR" to delete all logs from device

9. FLEET ANALYSIS (CSV Data)
   Export format includes:
   - Timestamp: ISO 8601 format for easy sorting
   - Event: ALERT_HIGH, ALERT_MED, or custom event type
   - Object: Which object triggered alert (car, person, bus, etc)
   - Risk: Risk level at time of detection
   - Confidence: AI confidence score (0-100%)
   - Distance: Estimated distance in meters
   - Speed: Vehicle speed in mph
   - Location: GPS coordinates for hot-spot mapping

   Perfect for:
   - Driver performance analysis
   - High-risk location identification
   - Route optimization
   - Insurance/liability claims
   - Fleet safety metrics

10. FOR PRODUCTION/FLEET DEPLOYMENT
    a) Host on public server (GitHub Pages, Netlify, Vercel, etc.)
    b) Create QR code pointing to https://your-domain.com/adas_vision.html
    c) Share QR code with drivers (scan to install)
    d) Drivers can use offline if cached by browser
    e) Collect CSV logs from vehicle logs: export and track fleet-wide safety data
    f) Set up metrics: track high-risk zones, speed patterns, detection types

IMPORTANT SAFETY NOTES
======================
- ADAS Vision is a SUPPLEMENTAL aid, not a replacement for driver attention
- Always follow local traffic laws and regulations
- Keep focus on the road - do not use while driving without proper mounting
- Test system thoroughly before real-world driving
- Ensure phone is securely mounted to prevent flying projectiles
- In dangerous situations, manually take control (ADAS system cannot brake)
- GPS data is stored locally on device only - no cloud transmission
- Only triggers alerts while moving (>10 mph) to reduce false positives

FOLDER STRUCTURE
----------------
adas_vision.html
tf.min.js
coco-ssd.min.js
README.txt


