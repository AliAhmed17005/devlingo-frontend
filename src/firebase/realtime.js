import { rtdb } from "./config";
import { ref, push, onValue, serverTimestamp, off, set } from "firebase/database";

// Send message in a channel (used by community features)
export function sendMessage(channelId, message, user) {
  const msgRef = ref(rtdb, `channels/${channelId}/messages`);
  return push(msgRef, {
    text: message, uid: user.uid,
    name: user.displayName || "User",
    initials: (user.displayName || "U").split(" ").map(n => n[0]).join("").toUpperCase(),
    timestamp: serverTimestamp()
  });
}

// Send private message (DM)
export function sendDM(uid1, uid2, message, sender) {
  const key = [uid1, uid2].sort().join("_");
  const msgRef = ref(rtdb, `dms/${key}/messages`);
  return push(msgRef, {
    text: message, uid: sender.uid,
    name: sender.displayName || "User",
    timestamp: serverTimestamp()
  });
}

// Listen to messages in a channel
export function listenToChannel(channelId, callback) {
  const msgRef = ref(rtdb, `channels/${channelId}/messages`);
  const handler = onValue(msgRef, snap => {
    const data = snap.val();
    const messages = data
      ? Object.entries(data)
          .map(([id, msg]) => ({ id, ...msg }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      : [];
    callback(messages);
  }, err => {
    console.warn("listenToChannel failed:", err);
  });
  return () => off(msgRef, "value", handler);
}

// Listen to private messages (DM)
export function listenToDM(uid1, uid2, callback) {
  const key = [uid1, uid2].sort().join("_");
  const msgRef = ref(rtdb, `dms/${key}/messages`);
  const handler = onValue(msgRef, snap => {
    const data = snap.val();
    const messages = data
      ? Object.entries(data)
          .map(([id, msg]) => ({ id, ...msg }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      : [];
    callback(messages);
  }, err => {
    console.warn("listenToDM failed:", err);
  });
  return () => off(msgRef, "value", handler);
}

// Send message in a group
export function sendGroupMessage(groupId, message, user) {
  const msgRef = ref(rtdb, `channels/${groupId}/messages`);
  return push(msgRef, {
    text: message, uid: user.uid,
    name: user.displayName || "User",
    timestamp: serverTimestamp()
  });
}

// Listen to messages in a group
export function listenToGroup(groupId, callback) {
  const msgRef = ref(rtdb, `channels/${groupId}/messages`);
  const handler = onValue(msgRef, snap => {
    const data = snap.val();
    const messages = data
      ? Object.entries(data)
          .map(([id, msg]) => ({ id, ...msg }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      : [];
    callback(messages);
  }, err => {
    console.warn("listenToGroup failed:", err);
  });
  return () => off(msgRef, "value", handler);
}

// Create a group in RTDB - stubbed out since membership is fully tracked in Firestore
export function createRTDBGroup(groupId, membersList) {
  return Promise.resolve();
}

// Send message in community
export function sendCommunityMessage(courseId, message, user) {
  const msgRef = ref(rtdb, `channels/${courseId}/messages`);
  return push(msgRef, {
    text: message, uid: user.uid,
    name: user.displayName || "User",
    timestamp: serverTimestamp()
  });
}

// Listen to messages in community
export function listenToCommunity(courseId, callback) {
  const msgRef = ref(rtdb, `channels/${courseId}/messages`);
  const handler = onValue(msgRef, snap => {
    const data = snap.val();
    const messages = data
      ? Object.entries(data)
          .map(([id, msg]) => ({ id, ...msg }))
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      : [];
    callback(messages);
  }, err => {
    console.warn("listenToCommunity failed:", err);
  });
  return () => off(msgRef, "value", handler);
}

// Leave a group in RTDB - stubbed out
export function leaveRTDBGroup(groupId, uid) {
  return Promise.resolve();
}

// Delete group metadata and messages in RTDB
export function deleteRTDBGroup(groupId, membersList = []) {
  const msgRef = ref(rtdb, `channels/${groupId}`);
  return set(msgRef, null).catch(err => {
    console.warn("deleteRTDBGroup failed:", err);
  });
}

// Ensure user membership is set in RTDB - stubbed out
export function syncGroupMemberRTDB(groupId, uid) {
  return Promise.resolve();
}

// Clear all messages in a specific chat path
export function clearRTDBChat(path) {
  const msgRef = ref(rtdb, path);
  return set(msgRef, null).catch(err => {
    console.warn("clearRTDBChat failed:", err);
  });
}

// ==== DEPRECATED RTDB FRIEND REQUEST STUBS (MIGRATED TO FIRESTORE SUBCOLLECTIONS) ====

export function sendRTDBFriendRequest(docId, data) {
  return Promise.resolve();
}

export function acceptRTDBFriendRequest(docId) {
  return Promise.resolve();
}

export function declineRTDBFriendRequest(docId) {
  return Promise.resolve();
}

export function listenToRTDBFriendRequests(callback) {
  // Return a dummy unsubscribe function
  return () => {};
}

export function updateRTDBLastMessage(docId, message) {
  return Promise.resolve();
}

export function syncUserProfileToRTDB(uid, profileData) {
  return Promise.resolve();
}

export function listenToRTDBUsers(callback) {
  // Return a dummy unsubscribe function
  return () => {};
}
