/**
 * iPhone 15 Pro Max ADAS Engine with Classic Aesthetic
 * High-performance WebRTC Camera & TensorFlow Object Detection
 */

const state = {
  model: null,
  stream: null,
  isActive: false,
  detecting: true,
  soundOn: true,
  alarmTimeout: 0,
  audioUnlocked: false,
  facingMode: 'environment', // Added support for switching properly
  frameCount: 0,
  speed: 0 // Speed in km/h
};

const UI = {
  splash: document.getElementById('splash'),
  statusMsg: document.getElementById('splash-status'),
  startBtn: document.getElementById('start-btn'),
  video: document.getElementById('video'),
  canvas: document.getElementById('overlay'),
  clock: document.getElementById('clock'),
  valVehicles: document.getElementById('val-vehicles'),
  valPersons: document.getElementById('val-persons'),
  valRisk: document.getElementById('val-risk'),
  valSpeed: document.getElementById('val-speed'),
  objCount: document.getElementById('obj-count'),
  fps: document.getElementById('fps'),
  alertEl: document.getElementById('alert'),
  detList: document.getElementById('det-list'),
  permErr: document.getElementById('perm-error')
};

let ctx = UI.canvas.getContext('2d');

/* =========================================================================
   1. Audio System (Standard HTML5 to avoid WebAudio DOMException Bugs)
   ========================================================================= */
function createWavBlob(frequency, durationSamples) {
  const sampleRate = 44100;
  const buffer = new ArrayBuffer(44 + durationSamples * 2);
  const view = new DataView(buffer);
  
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) { view.setUint8(offset + i, str.charCodeAt(i)); }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + durationSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, durationSamples * 2, true);
  
  for (let i = 0; i < durationSamples; i++) {
    const t = i / sampleRate;
    const envelope = i < 500 ? i/500 : (i > durationSamples - 500 ? (durationSamples - i)/500 : 1);
    const sample = Math.sin(2 * Math.PI * frequency * t) > 0 ? 1 : -1;
    view.setInt16(44 + i * 2, Math.round(sample * 32767 * 0.8 * envelope), true);
  }
  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}

const BEEP_HIGH_URL = createWavBlob(880, Math.round(44100 * 0.2)); 
const BEEP_MED_URL  = createWavBlob(440, Math.round(44100 * 0.1));

function playBeep(isHigh) {
  if (!state.audioUnlocked || !state.soundOn) return;
  const alarmSound = new Audio(isHigh ? BEEP_HIGH_URL : BEEP_MED_URL);
  alarmSound.play().catch(()=>{});
  if (navigator.vibrate) navigator.vibrate(isHigh ? [100, 50, 100] : [50]);
}

/* =========================================================================
   2. UI Controls Map
   ========================================================================= */
document.getElementById('btn-sound').addEventListener('click', () => {
  state.soundOn = !state.soundOn;
  document.getElementById('sound-icon').innerHTML = state.soundOn ? '&#128266;' : '&#128263;';
  document.getElementById('btn-sound').classList.toggle('active', state.soundOn);
  if (state.soundOn) playBeep(true);
});

document.getElementById('btn-detect').addEventListener('click', () => {
  state.detecting = !state.detecting;
  document.getElementById('btn-detect').classList.toggle('active', state.detecting);
  if (!state.detecting) {
    ctx.clearRect(0, 0, UI.canvas.width, UI.canvas.height);
    UI.detList.innerHTML = '';
    UI.valVehicles.textContent = '0';
    UI.valPersons.textContent = '0';
    UI.valRisk.textContent = '--';
    UI.alertEl.classList.remove('show');
  }
});

document.getElementById('btn-cam').addEventListener('click', () => {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  initCamera();
});

/* =========================================================================
   3. Core Initialization
   ========================================================================= */
window.addEventListener('load', async () => {
  setInterval(() => {
    const d = new Date();
    UI.clock.textContent = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  }, 1000);

  try {
    if (typeof cocoSsd === 'undefined') throw new Error("TensorFlow Models failed to load. Check connectivity.");
    state.model = await cocoSsd.load();
    
    UI.statusMsg.textContent = "NEURAL ENGINE ONLINE. AWAITING FEED.";
    document.querySelector('.splash-ring').style.display = 'none';
    UI.startBtn.classList.remove('hidden');

  } catch (err) {
    UI.statusMsg.textContent = "CRITICAL BOOT ERROR. CHECK CONSOLE.";
    console.error(err);
  }
});

async function initCamera() {
  UI.permErr.classList.remove('show');
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());

  try {
    const constraints = {
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1920 }, // 1080p target
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    };
    
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    UI.video.srcObject = state.stream;
    
    await new Promise(resolve => {
      UI.video.onloadedmetadata = () => {
        UI.canvas.width = UI.video.videoWidth || window.innerWidth;
        UI.canvas.height = UI.video.videoHeight || window.innerHeight;
        resolve();
      };
    });

    UI.splash.classList.add('hidden');
    state.isActive = true;

    // Start GPS Telemetry
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        pos => {
          // pos.coords.speed is in meters per second
          state.speed = pos.coords.speed !== null ? (pos.coords.speed * 3.6).toFixed(1) : 0;
          UI.valSpeed.textContent = Math.floor(state.speed);
        },
        err => { console.warn("GPS error:", err.message); },
        { enableHighAccuracy: true, maximumAge: 1000 }
      );
    }

    requestAnimationFrame(detectLoop);
    
  } catch (err) {
    UI.splash.classList.add('hidden');
    UI.permErr.classList.add('show');
    console.error(err);
  }
}

UI.startBtn.addEventListener('click', () => {
  state.audioUnlocked = true;
  const authSound = new Audio(BEEP_HIGH_URL);
  authSound.volume = 0.01; authSound.play().catch(()=>{});

  UI.startBtn.style.display = 'none';
  UI.statusMsg.textContent = "ACQUIRING IPHONE TELEMETRY...";
  initCamera();
});

document.getElementById('retry-btn').addEventListener('click', initCamera);

window.addEventListener('resize', () => {
  if (state.isActive) {
    UI.canvas.width = UI.video.videoWidth || window.innerWidth;
    UI.canvas.height = UI.video.videoHeight || window.innerHeight;
  }
});

/* =========================================================================
   4. Vision Engine (Classic Look)
   ========================================================================= */
const VEHICLE_CLASSES = ['car','truck','bus','motorcycle','bicycle','boat','train','airplane'];
const PERSON_CLASSES = ['person'];
const RISK_CLASSES = ['car','truck','bus','person','motorcycle'];
const COLORS = { vehicle: '#ffb800', person: '#ff2d55', other: '#00aaff' };

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

let lastTime = 0;

async function detectLoop() {
  if (!state.isActive) return;

  const now = performance.now();
  const dt = now - lastTime;
  if (dt > 0) {
    const fps = Math.round(1000 / dt);
    state.frameCount++;
    if (state.frameCount % 10 === 0) UI.fps.textContent = 'FPS: ' + fps;
  }
  lastTime = now;

  try {
    if (state.detecting) {
      const predictions = await state.model.detect(UI.video);
      renderFrame(predictions);
      updateTelemetry(predictions);
    }
  } catch (e) {
    // Ignore minor drops
  }

  requestAnimationFrame(detectLoop);
}

function renderFrame(predictions) {
  ctx.clearRect(0, 0, UI.canvas.width, UI.canvas.height);

  // Draw wireframe environment targeting grid
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,136,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 16]);
  ctx.beginPath();
  ctx.moveTo(0, UI.canvas.height * 0.45);
  ctx.lineTo(UI.canvas.width, UI.canvas.height * 0.45);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,136,0.18)';
  ctx.lineWidth = 1.5;
  const cx = UI.canvas.width / 2;
  const horizon = UI.canvas.height * 0.45;
  ctx.beginPath(); ctx.moveTo(cx - 60, horizon); ctx.lineTo(cx - 200, UI.canvas.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 60, horizon); ctx.lineTo(cx + 200, UI.canvas.height); ctx.stroke();
  ctx.restore();

  // Draw objects
  for (const pred of predictions) {
    if (pred.score < 0.45) continue;
    const [x, y, w, h] = pred.bbox;
    const color = classColor(pred.class);
    const scaleX = UI.canvas.width / (UI.video.videoWidth || UI.canvas.width);
    const scaleY = UI.canvas.height / (UI.video.videoHeight || UI.canvas.height);
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

    const label = pred.class.toUpperCase();
    const conf = Math.round(pred.score * 100) + '%';
    ctx.font = 'bold 11px "Share Tech Mono", monospace';
    const textW = ctx.measureText(label + ' ' + conf).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx, by - 20, textW, 18);
    ctx.fillStyle = color;
    ctx.fillText(label + ' ' + conf, bx + 5, by - 6);

    const area = (bw * bh) / (UI.canvas.width * UI.canvas.height);
    if (area > 0.08 && RISK_CLASSES.includes(pred.class)) {
      ctx.fillStyle = 'rgba(255,45,85,0.85)';
      ctx.beginPath(); ctx.arc(bx + bw - 10, by + 10, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

let lastHudUpdate = 0;
function updateTelemetry(predictions) {
  const hudNow = performance.now();
  if (hudNow - lastHudUpdate < 200) return; // 5Hz UI update rate
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
    ? Math.max(...valid.map(p => (p.bbox[2] * p.bbox[3]) / (UI.canvas.width * UI.canvas.height)))
    : 0;

  if (largestArea > 0.20 || (persons > 0 && largestArea > 0.08)) { 
    risk = 'HIGH'; riskClass = 'danger'; 
  } else if (largestArea > 0.08 || vehicles > 1 || persons > 0) { 
    risk = 'MED'; riskClass = 'amber'; 
  }

  UI.valVehicles.textContent = vehicles;
  UI.valPersons.textContent = persons;
  UI.valSpeed.textContent = Math.floor(state.speed);
  UI.objCount.textContent = 'OBJ: ' + valid.length;
  
  UI.valRisk.textContent = risk; 
  UI.valRisk.className = 'metric-val ' + riskClass;

  // Alarm Execution (Gated to >= 10 km/h as requested)
  const now = Date.now();
  if (risk === 'HIGH' && state.speed >= 10) {
    UI.alertEl.classList.add('show');
    if (now - state.alarmTimeout > 2000) { playBeep(true); state.alarmTimeout = now; }
  } else { 
    UI.alertEl.classList.remove('show'); 
  }
  
  if (risk === 'MED' && state.speed >= 10 && now - state.alarmTimeout > 3000) { 
    playBeep(false); 
    state.alarmTimeout = now; 
  }

  // Tags
  UI.detList.innerHTML = '';
  for (const [cls, cnt] of Object.entries(tags)) {
    const div = document.createElement('div');
    div.className = 'det-tag ' + classType(cls);
    div.textContent = cls.toUpperCase() + (cnt > 1 ? ' x' + cnt : '');
    UI.detList.appendChild(div);
  }
}
