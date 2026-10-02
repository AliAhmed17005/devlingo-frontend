import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import {
  collection, onSnapshot, query, orderBy, limit,
  addDoc, serverTimestamp, where
} from "firebase/firestore";
import Layout from "../components/Layout";
import toast from "react-hot-toast";
import { Trophy } from "lucide-react";

const COLORS = ["#6366f1","#0f9b8e","#f59e0b","#10b981","#8b5cf6","#ef4444","#3b82f6","#ec4899","#14b8a6","#f97316"];
function getColor(name = "") { return COLORS[name.charCodeAt(0) % COLORS.length]; }
function getInitials(name = "") { return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U"; }

const MOCK_USERS = [
  { id: "m1", name: "Alex M.", totalPoints: 3200, currentLevel: "hard", enrolledCourses: [{ courseId: "react-nextjs" }] },
  { id: "m2", name: "Sarah K.", totalPoints: 2980, currentLevel: "hard", enrolledCourses: [{ courseId: "javascript-mastery" }] },
  { id: "m3", name: "Zara J.", totalPoints: 2750, currentLevel: "medium", enrolledCourses: [{ courseId: "python-basics" }] },
  { id: "m4", name: "Bilal A.", totalPoints: 2410, currentLevel: "medium" },
  { id: "m5", name: "Omar S.", totalPoints: 2100, currentLevel: "medium" },
  { id: "m6", name: "Hana R.", totalPoints: 1870, currentLevel: "easy" },
  { id: "m7", name: "Fatima M.", totalPoints: 1640, currentLevel: "easy" },
  { id: "m8", name: "Umar K.", totalPoints: 1420, currentLevel: "easy" },
];

const COURSE_LABELS = { "python-basics": "Python", "javascript-mastery": "JavaScript", "react-nextjs": "React" };

export default function Leaderboard() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();

  const [tab, setTab] = useState("Global");
  const [users, setUsers] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [sending, setSending] = useState(null);

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#161b27" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f1f5f9" };

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("totalPoints", "desc"), limit(20));
    const unsub = onSnapshot(q,
      snap => { const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })); setUsers(docs.length > 0 ? docs : MOCK_USERS); },
      () => setUsers(MOCK_USERS)
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "challenges"), where("to", "==", currentUser.uid), where("status", "==", "pending"));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const battleChallenges = list.filter(c => c.type !== "friendRequest");
      setChallenges(battleChallenges);
    }, () => {});
    return unsub;
  }, [currentUser]);

  const sendChallenge = async (targetUser) => {
    if (!currentUser) return toast.error("Login required");
    if (targetUser.id === currentUser.uid) return toast.error("Can't challenge yourself");
    setSending(targetUser.id);
    try {
      await addDoc(collection(db, "challenges"), {
        from: currentUser.uid, fromName: currentUser.displayName || "You",
        to: targetUser.id, toName: targetUser.name, status: "pending",
        topic: "General", xpStake: 100, timestamp: serverTimestamp(),
      });
      await addDoc(collection(db, `users/${targetUser.id}/notifications`), {
        type: "challenge", message: `${currentUser.displayName || "A user"} challenged you! 100 XP stake.`,
        from: currentUser.uid, fromName: currentUser.displayName, read: false, timestamp: serverTimestamp(),
      });
      toast.success(`Challenge sent to ${targetUser.name}`);
    } catch { toast.error("Could not send challenge"); }
    setSending(null);
  };

  const respondChallenge = async (challengeId, accept) => {
    const { updateDoc, doc } = await import("firebase/firestore");
    try {
      await updateDoc(doc(db, "challenges", challengeId), { status: accept ? "accepted" : "declined" });
      setChallenges(prev => prev.filter(c => c.id !== challengeId));
      toast.success(accept ? "Challenge accepted!" : "Challenge declined.");
    } catch { toast.error("Action failed"); }
  };

  const meIndex = users.findIndex(u => u.id === currentUser?.uid);
  const top3 = users.slice(0, 3);
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumHeights = [70, 100, 56];
  const podiumColors = ["#94a3b8", "#f59e0b", "#cd7c2f"];
  const rankNums = [2, 1, 3];

  const courseLabel = (user) => {
    const id = user.enrolledCourses?.[0]?.courseId || user.enrolledCourses?.[0] || "";
    return COURSE_LABELS[id] || "—";
  };

  return (
    <Layout title="Leaderboard">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 2px", display:"flex", alignItems:"center", gap:8 }}>
              <Trophy size={18} color="#f59e0b" />Leaderboard
            </h2>
            <p style={{ fontSize: 13, color: s.muted, margin: 0 }}>
              Live rankings · {users.length} learners
              {meIndex >= 0 && <span style={{ color: "#6366f1", fontWeight: 500 }}> · You are #{meIndex + 1}</span>}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, background: s.card, padding: 3, borderRadius: 8, border: `1px solid ${s.border}`, width: "fit-content" }}>
          {["Global", "Challenges"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: tab === t ? "#6366f1" : "transparent", color: tab === t ? "white" : s.muted, fontWeight: tab === t ? 600 : 400, fontSize: 13, cursor: "pointer" }}>
              {t}{t === "Challenges" && challenges.length > 0 ? ` (${challenges.length})` : ""}
            </button>
          ))}
        </div>

        {tab !== "Challenges" && (
          <>
            {/* Podium */}
            {top3.length >= 3 && (
              <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: "24px 20px 0" }}>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 10 }}>
                  {podiumOrder.map((user, idx) => {
                    if (!user) return null;
                    const isMe = user.id === currentUser?.uid;
                    return (
                      <div key={user.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: idx === 1 ? 1.2 : 1 }}>
                        <div style={{
                          width: idx === 1 ? 56 : 44, height: idx === 1 ? 56 : 44, borderRadius: "50%",
                          background: getColor(user.name), display: "flex", alignItems: "center", justifyContent: "center",
                          color: "white", fontWeight: 600, fontSize: idx === 1 ? 18 : 14,
                          border: `2px solid ${podiumColors[idx]}`, marginBottom: 6,
                          overflow: "hidden"
                        }}>
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            getInitials(user.name)
                          )}
                        </div>
                        <p style={{ fontWeight: 600, fontSize: 13, color: s.text, margin: "0 0 1px", textAlign: "center" }}>
                          {user.name}{isMe && <span style={{ fontSize: 10, color: "#6366f1" }}> (You)</span>}
                        </p>
                        <p style={{ fontSize: 12, color: podiumColors[idx], fontWeight: 500, margin: "0 0 8px" }}>
                          {(user.totalPoints || 0).toLocaleString()} XP
                        </p>
                        <div style={{ width: "100%", height: podiumHeights[idx], background: podiumColors[idx], borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8 }}>
                          <span style={{ color: "white", fontWeight: 600, fontSize: 16 }}>#{rankNums[idx]}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Table */}
            <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 100px 80px 100px", padding: "10px 16px", borderBottom: `1px solid ${s.border}`, background: s.bg }}>
                {["Rank","User","Course","XP","Action"].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 600, color: s.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{h}</span>
                ))}
              </div>

              {users.map((user, idx) => {
                const isMe = user.id === currentUser?.uid;
                return (
                  <div key={user.id} style={{
                    display: "grid", gridTemplateColumns: "50px 1fr 100px 80px 100px",
                    padding: "10px 16px", borderBottom: `1px solid ${s.border}`,
                    background: isMe ? "rgba(99,102,241,0.06)" : "transparent",
                    borderLeft: isMe ? "3px solid #6366f1" : "3px solid transparent",
                    alignItems: "center",
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: idx < 3 ? ["#f59e0b","#94a3b8","#cd7c2f"][idx] : s.text }}>{idx + 1}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: getColor(user.name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 11, flexShrink: 0, overflow: "hidden" }}>
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          getInitials(user.name)
                        )}
                      </div>
                      <div>
                        <p style={{ fontWeight: 500, fontSize: 13, color: s.text, margin: 0 }}>
                          {user.name}{isMe && <span style={{ marginLeft: 4, fontSize: 10, color: "#6366f1" }}>You</span>}
                        </p>
                        <p style={{ fontSize: 11, color: s.muted, margin: 0, textTransform: "capitalize" }}>{user.currentLevel || "beginner"}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: s.muted }}>{courseLabel(user)}</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: s.text }}>{(user.totalPoints || 0).toLocaleString()}</span>
                    {isMe ? (
                      <span style={{ fontSize: 11, color: s.muted }}>—</span>
                    ) : (
                      <button onClick={() => sendChallenge(user)} disabled={sending === user.id}
                        style={{ padding: "4px 10px", borderRadius: 6, background: sending === user.id ? s.border : "#6366f1", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: sending === user.id ? "not-allowed" : "pointer" }}>
                        {sending === user.id ? "..." : "Challenge"}
                      </button>
                    )}
                  </div>
                );
              })}

              {users.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: s.muted }}>
                  <p style={{ fontSize: 14 }}>No rankings yet. Be the first to earn XP!</p>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "Challenges" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: "0 0 2px" }}>Send a challenge</p>
                <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>Pick a user from the Global tab</p>
              </div>
              <button onClick={() => setTab("Global")} style={{ padding: "6px 14px", borderRadius: 6, background: "#6366f1", color: "white", border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                View Global
              </button>
            </div>

            <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>Incoming ({challenges.length})</p>

            {challenges.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, background: s.card, border: `1px solid ${s.border}`, borderRadius: 10 }}>
                <p style={{ fontWeight: 600, fontSize: 14, color: s.text, marginBottom: 4 }}>No incoming challenges</p>
                <p style={{ fontSize: 13, color: s.muted }}>Challenge others from the leaderboard</p>
              </div>
            )}

            {challenges.map(ch => (
              <div key={ch.id} style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: getColor(ch.fromName || "C"), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 14 }}>
                    {getInitials(ch.fromName || "C")}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>{ch.fromName || "Challenger"}</p>
                    <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>{ch.topic || "General"} · {ch.xpStake || 100} XP</p>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={() => respondChallenge(ch.id, true)}
                    style={{ padding: "8px", borderRadius: 6, background: "#10b981", color: "white", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    Accept
                  </button>
                  <button onClick={() => respondChallenge(ch.id, false)}
                    style={{ padding: "8px", borderRadius: 6, background: "transparent", color: s.muted, border: `1px solid ${s.border}`, fontWeight: 500, fontSize: 13, cursor: "pointer" }}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
