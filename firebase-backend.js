// Firebase Admin Backend (Node.js + Firebase)
// Deploy to Firebase Cloud Functions or use directly from frontend

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Initialize Firebase (get from Firebase Console)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: "adas-vision.firebaseapp.com",
  projectId: "adas-vision",
  storageBucket: "adas-vision.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ============================================
// LOG SYNC - Store detection logs in cloud
// ============================================
export async function syncDetectionLogs(userId, vehicleId, logs) {
  try {
    const logsRef = collection(db, `users/${userId}/vehicles/${vehicleId}/logs`);
    
    for (const log of logs) {
      await addDoc(logsRef, {
        ...log,
        syncedAt: new Date().toISOString(),
        deviceId: navigator.userAgent
      });
    }
    
    return { success: true, synced: logs.length };
  } catch (error) {
    console.error('Log sync failed:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// FLEET MANAGEMENT - Get all vehicle data
// ============================================
export async function getFleetOverview(userId) {
  try {
    const vehiclesRef = collection(db, `users/${userId}/vehicles`);
    const vehiclesSnap = await getDocs(vehiclesRef);
    
    const fleet = [];
    for (const vehicleDoc of vehiclesSnap.docs) {
      const logsRef = collection(db, `users/${userId}/vehicles/${vehicleDoc.id}/logs`);
      const logsSnap = await getDocs(logsRef);
      const logs = logsSnap.docs.map(doc => doc.data());
      
      // Calculate risk score (0-100)
      const highAlerts = logs.filter(l => l.risk === 'HIGH').length;
      const medAlerts = logs.filter(l => l.risk === 'MED').length;
      const riskScore = Math.min(100, (highAlerts * 20 + medAlerts * 5));
      
      fleet.push({
        id: vehicleDoc.id,
        ...vehicleDoc.data(),
        logsCount: logs.length,
        riskScore,
        lastSync: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
        avgSpeed: logs.length > 0 
          ? Math.round(logs.reduce((sum, l) => sum + parseInt(l.speed), 0) / logs.length)
          : 0
      });
    }
    
    return fleet;
  } catch (error) {
    console.error('Fleet overview failed:', error);
    return [];
  }
}

// ============================================
// ANALYTICS - Generate safety metrics
// ============================================
export async function getAnalytics(userId, vehicleId, days = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const logsRef = collection(db, `users/${userId}/vehicles/${vehicleId}/logs`);
    const q = query(logsRef, where('timestamp', '>=', cutoffDate.toISOString()));
    const logsSnap = await getDocs(q);
    const logs = logsSnap.docs.map(doc => doc.data());
    
    const analytics = {
      totalEvents: logs.length,
      highRiskAlerts: logs.filter(l => l.risk === 'HIGH').length,
      mediumRiskAlerts: logs.filter(l => l.risk === 'MED').length,
      averageSpeed: Math.round(logs.reduce((sum, l) => sum + parseInt(l.speed), 0) / (logs.length || 1)),
      avgDistance: Math.round(logs.reduce((sum, l) => sum + parseInt(l.distance), 0) / (logs.length || 1)),
      detectionsByType: {},
      hoursWithAlerts: new Set(),
      safetyScore: 100 - (
        logs.filter(l => l.risk === 'HIGH').length * 10 +
        logs.filter(l => l.risk === 'MED').length * 2
      )
    };
    
    // Count detections by type
    logs.forEach(log => {
      const type = log.object || 'unknown';
      analytics.detectionsByType[type] = (analytics.detectionsByType[type] || 0) + 1;
      analytics.hoursWithAlerts.add(new Date(log.timestamp).getHours());
    });
    
    analytics.hoursWithAlerts = Array.from(analytics.hoursWithAlerts);
    analytics.safetyScore = Math.max(0, analytics.safetyScore);
    
    return analytics;
  } catch (error) {
    console.error('Analytics failed:', error);
    return null;
  }
}

// ============================================
// EXPORT REPORTS as CSV
// ============================================
export async function exportReport(userId, vehicleId, format = 'csv') {
  try {
    const logsRef = collection(db, `users/${userId}/vehicles/${vehicleId}/logs`);
    const logsSnap = await getDocs(logsRef);
    const logs = logsSnap.docs.map(doc => doc.data());
    
    if (format === 'csv') {
      const headers = ['Timestamp', 'Event', 'Object', 'Risk', 'Confidence', 'Distance', 'Speed', 'Location'];
      let csv = headers.join(',') + '\n';
      
      logs.forEach(log => {
        const row = [
          log.timestamp,
          log.event,
          log.object,
          log.risk,
          log.confidence + '%',
          log.distance,
          log.speed,
          log.location
        ];
        csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
      });
      
      return csv;
    }
    
    return logs; // JSON format
  } catch (error) {
    console.error('Export failed:', error);
    return null;
  }
}

// ============================================
// USER MANAGEMENT
// ============================================
export async function registerVehicle(userId, vehicleData) {
  try {
    const vehiclesRef = collection(db, `users/${userId}/vehicles`);
    const docRef = await addDoc(vehiclesRef, {
      ...vehicleData,
      createdAt: new Date().toISOString(),
      status: 'active'
    });
    return { success: true, vehicleId: docRef.id };
  } catch (error) {
    console.error('Vehicle registration failed:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteVehicle(userId, vehicleId) {
  try {
    await deleteDoc(doc(db, `users/${userId}/vehicles`, vehicleId));
    return { success: true };
  } catch (error) {
    console.error('Vehicle deletion failed:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// REAL-TIME ALERTS (for admin dashboard)
// ============================================
export function subscribeToVehicleAlerts(userId, vehicleId, callback) {
  const logsRef = collection(db, `users/${userId}/vehicles/${vehicleId}/logs`);
  const q = query(logsRef, where('risk', 'in', ['HIGH', 'MED']));
  
  return onSnapshot(q, (snapshot) => {
    const alerts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(alerts);
  });
}

// ============================================
// INTEGRATION WITH AIRTABLE (optional)
// ============================================
export async function syncToAirtable(vehicleId, logs) {
  const airtableToken = process.env.AIRTABLE_TOKEN;
  const airtableBase = 'appXXXXXX';
  
  try {
    await fetch(`https://api.airtable.com/v0/${airtableBase}/Detections`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${airtableToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: logs.map(log => ({
          fields: {
            'Vehicle ID': vehicleId,
            'Timestamp': log.timestamp,
            'Event': log.event,
            'Object': log.object,
            'Risk Level': log.risk,
            'Distance (m)': log.distance,
            'Speed (mph)': log.speed,
            'Location': log.location
          }
        }))
      })
    });
    return { success: true };
  } catch (error) {
    console.error('Airtable sync failed:', error);
    return { success: false };
  }
}
