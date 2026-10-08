import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, addDoc, serverTimestamp,
  writeBatch
} from "firebase/firestore";
import Layout from "../components/Layout";
import toast from "react-hot-toast";
import { Bell } from "lucide-react";

const DEMO_NOTIFS = [
  { type:"badge", message:"You earned: First Blood badge!", read:false },
  { type:"challenge", message:"Alex M. challenged you! 100 XP stake.", read:false, challengeId:"demo_challenge" },
  { type:"streak", message:"Complete today's task to keep your 5-day streak!", read:true },
  { type:"level", message:"Difficulty adjusted to Medium based on your results", read:true },
  { type:"score", message:"You scored 85% on Functions & Scope", read:true },
];

function timeAgo(ts) {
  if (!ts?.toMillis) return "just now";
  const diff = Date.now() - ts.toMillis();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Notifications() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [notifs, setNotifs] = useState([]);
  const [filter, setFilter] = useState("All");
  const [seeded, setSeeded] = useState(false);

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#161b27" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f1f5f9" };

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, `users/${currentUser.uid}/notifications`), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, async snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifs(docs);
      if (docs.length === 0 && !seeded) {
        setSeeded(true);
        for (const n of DEMO_NOTIFS) {
          await addDoc(collection(db, `users/${currentUser.uid}/notifications`), { ...n, timestamp: serverTimestamp() });
        }
      }
    }, () => {
      setNotifs(DEMO_NOTIFS.map((n, i) => ({ ...n, id: `mock_${i}` })));
    });
    return unsub;
  }, [currentUser, seeded]);

  const markRead = async (notifId) => {
    if (notifId.startsWith("mock_")) return;
    try { await updateDoc(doc(db, `users/${currentUser.uid}/notifications`, notifId), { read: true }); } catch {}
  };

  const markAllRead = async () => {
    try {
      const batch = writeBatch(db);
      notifs.filter(n => !n.read && !n.id.startsWith("mock_")).forEach(n => {
        batch.update(doc(db, `users/${currentUser.uid}/notifications`, n.id), { read: true });
      });
      await batch.commit();
      toast.success("All marked as read");
    } catch { toast.error("Failed"); }
  };

  const handleChallengeAccept = async (notif) => {
    await markRead(notif.id);
    if (notif.challengeId && !notif.challengeId.startsWith("demo")) {
      try {
        await updateDoc(doc(db, "challenges", notif.challengeId), {
          status: "in_battle",
          startedAt: Date.now(),
          "player2.status": "ready"
        });
      } catch {}
      toast.success("Challenge accepted! Entering Battle Arena... ⚔️");
      navigate(`/battle/${notif.challengeId}`);
    } else {
      toast.success("Challenge accepted!");
    }
  };

  const filtered = notifs.filter(n => {
    if (filter === "Unread") return !n.read;
    if (filter === "Badges") return n.type === "badge";
    if (filter === "Challenges") return n.type === "challenge";
    return true;
  });

  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <Layout title="Notifications">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 700, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 2px", display: "flex", alignItems: "center", gap: 8 }}>
              <Bell size={18} color="#6366f1" />Notifications
            </h2>
            <p style={{ fontSize: 13, color: s.muted, margin: 0 }}>{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              style={{ padding: "6px 12px", borderRadius: 6, background: "transparent", color: "#6366f1", border: `1px solid ${s.border}`, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              Mark all read
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 2, background: s.card, padding: 3, borderRadius: 8, border: `1px solid ${s.border}`, width: "fit-content" }}>
          {["All","Unread","Badges","Challenges"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: filter === f ? "#6366f1" : "transparent", color: filter === f ? "white" : s.muted, fontSize: 12, fontWeight: filter === f ? 600 : 400, cursor: "pointer" }}>
              {f}{f === "Unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, background: s.card, border: `1px solid ${s.border}`, borderRadius: 10 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: s.text, marginBottom: 4 }}>No notifications</p>
            <p style={{ fontSize: 13, color: s.muted }}>Keep learning to earn achievements</p>
          </div>
        ) : (
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, overflow: "hidden" }}>
            {filtered.map((notif, i) => {
              const isUnread = !notif.read;
              return (
                <div key={notif.id} onClick={() => !isUnread || markRead(notif.id)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 16px", borderBottom: i < filtered.length - 1 ? `1px solid ${s.border}` : "none",
                    background: isUnread ? "rgba(99,102,241,0.04)" : "transparent",
                    cursor: "pointer",
                  }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: isUnread ? "#6366f1" : "transparent", flexShrink: 0, marginTop: 7 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: isUnread ? s.text : s.muted, margin: "0 0 2px", lineHeight: 1.5, fontWeight: isUnread ? 500 : 400 }}>
                      {notif.message}
                    </p>
                    <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>{timeAgo(notif.timestamp)}</p>
                    {notif.type === "challenge" && isUnread && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button onClick={e => { e.stopPropagation(); handleChallengeAccept(notif); }}
                          style={{ padding: "4px 12px", borderRadius: 6, background: "#10b981", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          Accept
                        </button>
                        <button onClick={e => { e.stopPropagation(); markRead(notif.id); }}
                          style={{ padding: "4px 12px", borderRadius: 6, background: "transparent", color: s.muted, border: `1px solid ${s.border}`, fontSize: 11, cursor: "pointer" }}>
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: s.muted, flexShrink: 0, textTransform: "capitalize" }}>{notif.type}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
