// ADAS Vision - Main Application Logic
// Real-time object detection and collision warning system

const state = {
  model: null, stream: null, facingMode: 'environment',
  detecting: true, soundOn: localStorage.getItem('adas-sound') === 'true', running: false,
  frameCount: 0, lastFps: 0, alertActive: false,
  audioCtx: null, wakeLock: null,
  speed: 0, gpsEnabled: false, latitude: 0, longitude: 0,
  detectionLogs: JSON.parse(localStorage.getItem('adas-logs') || '[]'),
  lastLogTime: 0,
};

// DOM elements - initialized after page loads
let video, canvas, ctx, splash, splashStatus, permErr;

const VEHICLE_CLASSES = ['car','truck','bus','motorcycle','bicycle','boat','train','airplane'];
const PERSON_CLASSES = ['person'];
const RISK_CLASSES = ['car','truck','bus','person','motorcycle'];

const COLORS = { vehicle: '#ffb800', person: '#ff2d55', other: '#00aaff' };

// Utility Functions
function classColor(label) {
  if (VEHICLE_CLASSES.includes(label)) return COLORS.vehicle;
  if (PERSON_CLASSES.includes(label)) return COLORS.person;
  return COLORS.other;
}

function classType(label) {
  if (VEHICLE_CLASSES.includes(label)) return 'vehicle';
  if (PERSON_CLASSES.includes(label)) return 'person';
  return 'other';
}

// Wake Lock Management
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
    } catch (e) {}
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.running) requestWakeLock();
});

// Clock Update
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.getHours().toString().padStart(2,'0') + ':' +
    now.getMinutes().toString().padStart(2,'0');
}

// Application Initialization
async function init() {
  splashStatus.textContent = 'LOADING AI MODEL...';
  try {
    if (window._loadErrors && window._loadErrors.length > 0) {
      throw new Error('Failed to load: ' + window._loadErrors.join(', ') + '. Serve via HTTP and check paths.');
    }
    if (typeof cocoSsd === 'undefined') {
      throw new Error('COCO-SSD not loaded. Check console for script errors.');
    }
    state.model = await cocoSsd.load();
    // Initialize AudioContext for sound alerts
    try {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
      }
    } catch (e) {
      console.warn('AudioContext unavailable:', e);
    }
    startGPS();
    splashStatus.textContent = 'STARTING CAMERA...';
    await initCamera();
    splashStatus.textContent = 'SYSTEM READY';
    setTimeout(() => { splash.classList.add('hidden'); }, 700);
  } catch (e) {
    splashStatus.textContent = 'ERROR: ' + e.message;
    console.error(e);
  }
}

// Camera Initialization
async function initCamera() {
  permErr.classList.remove('show');
  try {
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    const constraints = {
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1920 }, height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    };
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = state.stream;
    await new Promise(r => video.onloadedmetadata = r);
    await video.play();
    resizeCanvas();
    requestWakeLock();
    if (!state.running) { state.running = true; detectLoop(); }
  } catch (e) {
    console.error('Camera error:', e);
    permErr.classList.add('show');
    splash.classList.add('hidden');
  }
}

// Canvas Resize Handler
function resizeCanvas() {
  canvas.width = video.videoWidth || window.innerWidth;
  canvas.height = video.videoHeight || window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);

// Detection Loop
let lastTime = 0;
async function detectLoop() {
  const now = performance.now();
  const dt = now - lastTime;
  if (dt > 0) {
    const fps = Math.round(1000 / dt);
    state.frameCount++;
    if (state.frameCount % 10 === 0) {
      document.getElementById('fps').textContent = 'FPS: ' + fps;
    }
  }
  lastTime = now;

  if (state.model && state.detecting && video.readyState === 4) {
    try {
      const predictions = await state.model.detect(video);
      renderFrame(predictions);
      updateHUD(predictions);
    } catch(e) {}
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(detectLoop);
}

// Frame Rendering with Bounding Boxes
function renderFrame(predictions) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw horizon line
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,136,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 16]);
  ctx.beginPath();
  ctx.moveTo(0, canvas.height * 0.45);
  ctx.lineTo(canvas.width, canvas.height * 0.45);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Draw perspective lines
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,136,0.18)';
  ctx.lineWidth = 1.5;
  const cx = canvas.width / 2;
  const horizon = canvas.height * 0.45;
  ctx.beginPath(); ctx.moveTo(cx - 60, horizon); ctx.lineTo(cx - 200, canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 60, horizon); ctx.lineTo(cx + 200, canvas.height); ctx.stroke();
  ctx.restore();

  // Draw bounding boxes for each prediction
  for (const pred of predictions) {
    if (pred.score < 0.45) continue;
    const [x, y, w, h] = pred.bbox;
    const color = classColor(pred.class);
    const scaleX = canvas.width / (video.videoWidth || canvas.width);
    const scaleY = canvas.height / (video.videoHeight || canvas.height);
    const bx = x * scaleX, by = y * scaleY;
    const bw = w * scaleX, bh = h * scaleY;

    ctx.save();
    ctx.fillStyle = color + '18';
    ctx.fillRect(bx, by, bw, bh);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const cs = Math.min(20, bw * 0.3, bh * 0.3);
    ctx.beginPath();
    ctx.moveTo(bx + cs, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + cs);
    ctx.moveTo(bx + bw - cs, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cs);
    ctx.moveTo(bx, by + bh - cs); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cs, by + bh);
    ctx.moveTo(bx + bw - cs, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cs);
    ctx.stroke();

    // Draw label
    const label = pred.class.toUpperCase();
    const conf = Math.round(pred.score * 100) + '%';
    ctx.font = 'bold 11px "Share Tech Mono", monospace';
    const textW = ctx.measureText(label + ' ' + conf).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx, by - 20, textW, 18);
    ctx.fillStyle = color;
    ctx.fillText(label + ' ' + conf, bx + 5, by - 6);

    // Draw warning indicator for large objects
    const area = (bw * bh) / (canvas.width * canvas.height);
    if (area > 0.08 && RISK_CLASSES.includes(pred.class)) {
      ctx.fillStyle = 'rgba(255,45,85,0.85)';
      ctx.beginPath(); ctx.arc(bx + bw - 10, by + 10, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// HUD Update with Risk Assessment
let lastAlertTime = 0, lastHudUpdate = 0;
const HUD_INTERVAL = 200;
function updateHUD(predictions) {
  const hudNow = performance.now();
  if (hudNow - lastHudUpdate < HUD_INTERVAL) return;
  lastHudUpdate = hudNow;

  const valid = predictions.filter(p => p.score >= 0.45);
  let vehicles = 0, persons = 0;
  const tags = {};
  for (const p of valid) {
    if (VEHICLE_CLASSES.includes(p.class)) vehicles++;
    if (PERSON_CLASSES.includes(p.class)) persons++;
    tags[p.class] = (tags[p.class] || 0) + 1;
  }

  let risk = 'LOW', riskClass = '';
  const largestArea = valid.length
    ? Math.max(...valid.map(p => (p.bbox[2] * p.bbox[3]) / (canvas.width * canvas.height)))
    : 0;
  const largestPred = valid.length ? valid.reduce((a, b) => (a.bbox[2] * a.bbox[3]) > (b.bbox[2] * b.bbox[3]) ? a : b) : null;
  const estimatedDist = largestPred ? estimateDistance(largestPred.bbox, largestPred.score) : 0;

  if (largestArea > 0.20 || (persons > 0 && largestArea > 0.08)) { risk = 'HIGH'; riskClass = 'danger'; }
  else if (largestArea > 0.08 || vehicles > 1 || persons > 0) { risk = 'MED'; riskClass = 'amber'; }

  document.getElementById('val-vehicles').textContent = vehicles;
  document.getElementById('val-persons').textContent = persons;
  document.getElementById('val-total').textContent = valid.length;
  document.getElementById('obj-count').textContent = 'OBJ: ' + valid.length;
  const riskEl = document.getElementById('val-risk');
  riskEl.textContent = risk; riskEl.className = 'metric-val ' + riskClass;

  const alertEl = document.getElementById('alert');
  const now = Date.now();
  const isMoving = state.speed > 10;

  if (risk === 'HIGH' && isMoving) {
    alertEl.classList.add('show');
    if (state.soundOn && now - lastAlertTime > 2000) { 
      playBeep(880, 0.15, 0.2);
      logDetection('ALERT_HIGH', largestPred?.class || 'unknown', risk, largestPred?.score || 0, estimatedDist);
      lastAlertTime = now;
    }
  } else { alertEl.classList.remove('show'); }

  if (risk === 'MED' && isMoving && state.soundOn && now - lastAlertTime > 3000) { 
    playBeep(440, 0.08, 0.1);
    logDetection('ALERT_MED', largestPred?.class || 'unknown', risk, largestPred?.score || 0, estimatedDist);
    lastAlertTime = now;
  }

  if (!isMoving && (risk === 'HIGH' || risk === 'MED')) {
    alertEl.classList.remove('show');
  }

  const list = document.getElementById('det-list');
  list.innerHTML = '';
  for (const [cls, cnt] of Object.entries(tags)) {
    const div = document.createElement('div');
    div.className = 'det-tag ' + classType(cls);
    div.textContent = cls.toUpperCase() + (cnt > 1 ? ' x' + cnt : '');
    list.appendChild(div);
  }
}

// Control Functions
function toggleDetection() {
  state.detecting = !state.detecting;
  document.getElementById('btn-detect').classList.toggle('active', state.detecting);
  if (!state.detecting) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('det-list').innerHTML = '';
    document.getElementById('val-vehicles').textContent = '0';
    document.getElementById('val-persons').textContent = '0';
    document.getElementById('val-total').textContent = '0';
    document.getElementById('val-risk').textContent = '--';
    document.getElementById('alert').classList.remove('show');
  }
}

function flipCamera() {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  initCamera();
}

function toggleSound() {
  state.soundOn = !state.soundOn;
  localStorage.setItem('adas-sound', state.soundOn);
  document.getElementById('sound-icon').textContent = state.soundOn ? '🔊' : '🔇';
  document.getElementById('btn-sound').classList.toggle('active', state.soundOn);
  if (state.soundOn) {
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
  }
}

// Audio & Haptic Feedback
function playBeep(freq, vol, dur) {
  try {
    // Create AudioContext if not exists (for user interaction requirement)
    if (!state.audioCtx) {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended by browser
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(e => console.warn('Resume AudioContext failed:', e));
    }
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    osc.connect(gain); gain.connect(state.audioCtx.destination);
    osc.frequency.value = freq; gain.gain.value = vol;
    osc.start(); osc.stop(state.audioCtx.currentTime + dur);
    hapticFeedback();
  } catch (e) {
    console.warn('Beep failed:', e);
  }
}

function hapticFeedback(pattern = 1) {
  if (navigator.vibrate) {
    if (pattern === 1) navigator.vibrate([50, 50, 50]);
    else if (pattern === 2) navigator.vibrate([100, 50, 100, 50, 100]);
    else navigator.vibrate(30);
  }
}

// Orientation & GPS
function lockOrientation() {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape-primary').catch(() => {});
  }
}

function startGPS() {
  if ('geolocation' in navigator) {
    state.gpsEnabled = true;
    navigator.geolocation.watchPosition(
      pos => {
        state.speed = (pos.coords.speed || 0) * 2.237; // Convert m/s to mph
        state.latitude = pos.coords.latitude;
        state.longitude = pos.coords.longitude;
        document.getElementById('speed-display').textContent = 'SPEED: ' + Math.round(state.speed) + ' mph';
      },
      err => { state.gpsEnabled = false; },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 1000 }
    );
  }
}

// Distance Estimation
function estimateDistance(bbox, confidence) {
  const [x, y, w, h] = bbox;
  const imageWidth = canvas.width;
  const imageHeight = canvas.height;
  const pixelArea = w * h;
  const imageArea = imageWidth * imageHeight;
  const normalizedArea = pixelArea / imageArea;
  const distance = Math.max(3, 50 * Math.pow(1 - normalizedArea, 0.5));
  return Math.round(distance);
}

// Logging System
function logDetection(eventType, objectClass, riskLevel, confidence, distance) {
  const now = Date.now();
  if (now - state.lastLogTime < 500) return;
  state.lastLogTime = now;

  const log = {
    timestamp: new Date().toISOString(),
    event: eventType,
    object: objectClass,
    risk: riskLevel,
    confidence: Math.round(confidence * 100),
    distance: distance + 'm',
    speed: Math.round(state.speed) + ' mph',
    location: state.gpsEnabled ? (state.latitude + ',' + state.longitude) : 'N/A'
  };

  state.detectionLogs.push(log);
  if (state.detectionLogs.length > 500) state.detectionLogs.shift();
  localStorage.setItem('adas-logs', JSON.stringify(state.detectionLogs));
}

// CSV Export
function downloadCSV() {
  const headers = ['Timestamp', 'Event', 'Object', 'Risk', 'Confidence', 'Distance', 'Speed', 'Location'];
  const rows = state.detectionLogs.map(log => [
    log.timestamp, log.event, log.object, log.risk, log.confidence + '%', log.distance, log.speed, log.location
  ]);

  let csv = headers.join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'adas-detections-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Log Management
function clearLogs() {
  if (confirm('Delete all detection logs?')) {
    state.detectionLogs = [];
    localStorage.removeItem('adas-logs');
    updateLogDisplay();
  }
}

function updateLogDisplay() {
  const list = document.getElementById('log-list');
  if (state.detectionLogs.length === 0) {
    list.innerHTML = '<p>No detection logs yet.</p>';
    return;
  }
  const html = state.detectionLogs.slice(-50).reverse().map(log => 
    `${log.timestamp.slice(11, 19)} | ${log.event} | ${log.object.toUpperCase()} | Risk: ${log.risk} | ${log.distance} | ${log.speed}`
  ).join('\n');
  list.innerHTML = html;
}

function openLogModal() {
  updateLogDisplay();
  document.getElementById('log-modal').classList.add('show');
}

function closeLogModal() {
  document.getElementById('log-modal').classList.remove('show');
}

// Event Listeners
window.addEventListener('load', () => {
  // Initialize DOM elements
  video = document.getElementById('video');
  canvas = document.getElementById('overlay');
  ctx = canvas.getContext('2d');
  splash = document.getElementById('splash');
  splashStatus = document.getElementById('splash-status');
  permErr = document.getElementById('perm-error');
  
  // Attach event listeners
  document.getElementById('log-btn').addEventListener('click', openLogModal);
  document.getElementById('retry-btn').addEventListener('click', initCamera);
  document.getElementById('btn-sound').classList.toggle('active', state.soundOn);
  
  // Start clock updates
  setInterval(updateClock, 1000);
  updateClock();
  
  // Initialize app
  lockOrientation();
  init();
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => { resizeCanvas(); }, 100);
});
