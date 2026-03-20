import { useState, useEffect } from "react";
import { getFirebaseDb, collection, onSnapshot, query, orderBy, doc, updateDoc, increment, handleFirestoreError, OperationType } from "../firebase.js";

export function useCollection(colName, orderField = "createdAt") {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db) return;
    const q = query(collection(db, colName), orderBy(orderField, "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error(`Error fetching ${colName}:`, err);
      if (err.message.includes("insufficient permissions")) {
        handleFirestoreError(err, OperationType.LIST, colName);
      }
      setLoading(false);
    });
    return unsub;
  }, [colName, orderField]);

  return { docs, loading };
}

export async function incrementViews(colName, docId) {
  const db = getFirebaseDb();
  if (!db) return;
  try {
    const ref = doc(db, colName, docId);
    await updateDoc(ref, { views: increment(1) });
  } catch (e) {
    console.warn("Error incrementing views:", e.message);
    if (e.message.includes("insufficient permissions")) {
      handleFirestoreError(e, OperationType.UPDATE, `${colName}/${docId}`);
    }
  }
}

export function timeAgo(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
}

export function fmtViews(v) {
  if (!v) return "0";
  if (v >= 1000000) return (v / 1000000).toFixed(1) + "M";
  if (v >= 1000) return (v / 1000).toFixed(1) + "K";
  return v.toString();
}
