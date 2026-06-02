import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, onSnapshot, serverTimestamp,
  arrayUnion, setDoc, limit,
} from 'firebase/firestore';
import { db } from '@/firebase';

// ─── USERS ───────────────────────────────────────────────────────────────────

export const getUsers = async () => {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getUserById = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const updateUser = async (uid, data) => {
  await updateDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() });
};

export const subscribeUsers = (callback) => {
  const q = query(collection(db, 'users'));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(docs);
  });
};

// ─── VEHICLES ────────────────────────────────────────────────────────────────

export const createVehicle = async (data) => {
  const ref = await addDoc(collection(db, 'vehicles'), {
    ...data,
    currentStatus: 'WDA',
    statusEnteredAt: serverTimestamp(),
    isDelayed: false,
    isDelivered: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Log initial status
  await addDoc(collection(db, 'vehicleStatusHistory'), {
    vehicleId: ref.id,
    vehicleNumber: data.vehicleNumber,
    status: 'WDA',
    previousStatus: null,
    remarks: data.remarks || 'Vehicle intake created',
    updatedBy: data.adviserName,
    updatedByRole: 'service_adviser',
    timestamp: serverTimestamp(),
  });

  return ref;
};

export const updateVehicleStatus = async (vehicleId, { status, subStatus, remarks, updatedBy, updatedByRole, previousStatus, additionalData = {} }) => {
  const vehicleRef = doc(db, 'vehicles', vehicleId);

  const updateData = {
    currentStatus: status,
    subStatus: subStatus || null,
    previousStatus,
    statusEnteredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isDelivered: status === 'Delivered',
    ...additionalData,
  };

  await updateDoc(vehicleRef, updateData);

  // Log history
  await addDoc(collection(db, 'vehicleStatusHistory'), {
    vehicleId,
    status,
    subStatus: subStatus || null,
    previousStatus,
    remarks: remarks || '',
    updatedBy,
    updatedByRole,
    timestamp: serverTimestamp(),
  });

  // Auto-create parts tracking when entering PNA
  if (status === 'PNA') {
    const vehicleSnap = await getDoc(vehicleRef);
    const vehicle = vehicleSnap.data();
    await setDoc(doc(db, 'partsTracking', vehicleId), {
      vehicleId,
      vehicleNumber: vehicle.vehicleNumber,
      jobCardNumber: vehicle.jobCardNumber,
      adviserId: vehicle.adviserId,
      adviserName: vehicle.adviserName,
      orderStatus: 'Pending',
      orderDate: null,
      etaDate: null,
      receivedDate: null,
      pendingItems: [],
      backOrderItems: [],
      vendorName: '',
      invoiceNumber: '',
      totalPartsCount: 0,
      receivedPartsCount: 0,
      pendingPartsCount: 0,
      remarks: '',
      updatedBy,
      updatedAt: serverTimestamp(),
      logs: [],
      etaExceeded: false,
      createdAt: serverTimestamp(),
    }, { merge: true });
  }
};

export const getVehicles = async (filters = {}) => {
  let q = collection(db, 'vehicles');
  const constraints = [orderBy('createdAt', 'desc')];
  if (filters.adviserId) constraints.unshift(where('adviserId', '==', filters.adviserId));
  if (filters.status) constraints.unshift(where('currentStatus', '==', filters.status));
  const snap = await getDocs(query(q, ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getVehicleById = async (id) => {
  const snap = await getDoc(doc(db, 'vehicles', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const subscribeVehicles = (callback, filters = {}) => {
  const constraints = [];
  if (filters.adviserId) constraints.push(where('adviserId', '==', filters.adviserId));
  if (filters.status) constraints.push(where('currentStatus', '==', filters.status));
  const q = query(collection(db, 'vehicles'), ...constraints);
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort client-side to avoid composite index requirement
    docs.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
    callback(docs);
  });
};

export const subscribeVehicleHistory = (vehicleId, callback) => {
  const q = query(
    collection(db, 'vehicleStatusHistory'),
    where('vehicleId', '==', vehicleId)
  );
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
    callback(docs);
  });
};

// ─── PARTS TRACKING ──────────────────────────────────────────────────────────

export const getPartsTracking = async (vehicleId) => {
  const snap = await getDoc(doc(db, 'partsTracking', vehicleId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const subscribePartsTracking = (callback) => {
  const q = query(collection(db, 'partsTracking'));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(docs);
  });
};

export const updatePartsTracking = async (vehicleId, data, updatedBy, prevData = {}) => {
  // Build a detailed human-readable summary of what changed
  const changes = [];

  if (data.orderStatus && data.orderStatus !== prevData.orderStatus)
    changes.push(`Order status: ${prevData.orderStatus || '—'} → ${data.orderStatus}`);
  if (data.vendorName !== undefined && data.vendorName !== prevData.vendorName)
    changes.push(`Vendor: ${prevData.vendorName || '—'} → ${data.vendorName || '—'}`);
  if (data.etaDate && data.etaDate !== toDateStr(prevData.etaDate))
    changes.push(`ETA date: ${toDateStr(prevData.etaDate) || '—'} → ${data.etaDate}`);
  if (data.orderDate && data.orderDate !== toDateStr(prevData.orderDate))
    changes.push(`Order date: ${toDateStr(prevData.orderDate) || '—'} → ${data.orderDate}`);
  if (data.receivedDate && data.receivedDate !== toDateStr(prevData.receivedDate))
    changes.push(`Received date set: ${data.receivedDate}`);
  if (data.invoiceNumber !== undefined && data.invoiceNumber !== prevData.invoiceNumber)
    changes.push(`Invoice: ${prevData.invoiceNumber || '—'} → ${data.invoiceNumber || '—'}`);
  if (data.totalPartsCount !== undefined && +data.totalPartsCount !== +prevData.totalPartsCount)
    changes.push(`Total parts: ${prevData.totalPartsCount ?? 0} → ${data.totalPartsCount}`);
  if (data.receivedPartsCount !== undefined && +data.receivedPartsCount !== +prevData.receivedPartsCount)
    changes.push(`Received parts: ${prevData.receivedPartsCount ?? 0} → ${data.receivedPartsCount}`);
  if (data.pendingItems !== undefined && data.pendingItems !== (Array.isArray(prevData.pendingItems) ? prevData.pendingItems.join(', ') : prevData.pendingItems || ''))
    changes.push(`Pending items updated`);
  if (data.backOrderItems !== undefined && data.backOrderItems !== (Array.isArray(prevData.backOrderItems) ? prevData.backOrderItems.join(', ') : prevData.backOrderItems || ''))
    changes.push(`Back order items updated`);

  // Helper to normalise Firestore Timestamps to plain date strings for comparison
  const toDateStr = (val) => {
    if (!val) return '';
    if (val?.seconds) return new Date(val.seconds * 1000).toISOString().split('T')[0];
    if (typeof val === 'string') return val.split('T')[0];
    return '';
  };

  const logEntry = {
    orderStatus: data.orderStatus,
    summary: changes.length > 0 ? changes.join(' · ') : 'Parts details updated',
    remarks: data.remarks || '',
    receivedPartsCount: data.receivedPartsCount,
    totalPartsCount: data.totalPartsCount,
    pendingPartsCount: data.pendingPartsCount,
    updatedBy,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(doc(db, 'partsTracking', vehicleId), {
    ...data,
    updatedAt: serverTimestamp(),
    logs: arrayUnion(logEntry),
  });
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export const createNotification = async (data) => {
  await addDoc(collection(db, 'notifications'), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
};

export const subscribeNotifications = (userId, callback) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    limit(20)
  );
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(docs);
  });
};

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

export const getDashboardStats = async (adviserId = null) => {
  const constraints = adviserId ? [where('adviserId', '==', adviserId)] : [];
  const snap = await getDocs(query(collection(db, 'vehicles'), ...constraints));
  const vehicles = snap.docs.map(d => d.data());

  return {
    total: vehicles.length,
    byStatus: vehicles.reduce((acc, v) => {
      acc[v.currentStatus] = (acc[v.currentStatus] || 0) + 1;
      return acc;
    }, {}),
    delayed: vehicles.filter(v => v.isDelayed).length,
    delivered: vehicles.filter(v => v.isDelivered).length,
  };
};

// ─── UPDATE VEHICLE DETAILS ───────────────────────────────────────────────────

export const updateVehicle = async (vehicleId, data) => {
  // Use the same flat field names as NewVehicleIntake so reads/writes are consistent
  const allowed = [
    'vehicleNumber', 'vehicleModel', 'repairType', 'repairCategory',
    'numberOfPanels', 'jobCardNumber',
    'customerName', 'customerMobile', 'insuranceCompany',
    'documentaryReceivedDate', 'surveyApprovedDate', 'promisedDeliveryDate',
    'remarks',
  ];
  const sanitized = {};
  for (const key of allowed) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }
  sanitized.updatedAt = serverTimestamp();
  await updateDoc(doc(db, 'vehicles', vehicleId), sanitized);
};
