import { rtdb } from "../firebase/config";
import { ref, push, onValue, serverTimestamp, off } from "firebase/database";

export function sendMessage(channelId, message, user) {
  const msgRef = ref(rtdb, `channels/${channelId}/messages`);
  return push(msgRef, {
    text: message, uid: user.uid,
    name: user.displayName || "User",
    initials: (user.displayName || "U").split(" ").map(n => n[0]).join("").toUpperCase(),
    timestamp: serverTimestamp()
  });
}

export function sendDM(uid1, uid2, message, sender) {
  const key = [uid1, uid2].sort().join("_");
  const msgRef = ref(rtdb, `dms/${key}/messages`);
  return push(msgRef, {
    text: message, uid: sender.uid,
    name: sender.displayName || "User",
    timestamp: serverTimestamp()
  });
}

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
  });
  return () => off(msgRef, "value", handler);
}

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
  });
  return () => off(msgRef, "value", handler);
}
