import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import { doc, onSnapshot, collection } from "firebase/firestore";
import Layout from "../components/Layout";
import { Award, Flame, Zap, Star } from "lucide-react";

const ALL_BADGES = [
  { id:"first_blood", label:"First Blood", category:"Course", rarity:"Common", xp:50, desc:"Complete your first lesson", total:1 },
  { id:"on_fire", label:"On Fire", category:"Streak", rarity:"Rare", xp:100, desc:"7-day streak", total:7 },
  { id:"perfect_score", label:"Perfect Score", category:"Test", rarity:"Legendary", xp:150, desc:"Score 100% on any test", total:1 },
  { id:"speed_coder", label:"Speed Coder", category:"Speed", rarity:"Rare", xp:120, desc:"Test in under 2 minutes", total:1 },
  { id:"social_butterfly", label:"Social Butterfly", category:"Social", rarity:"Common", xp:75, desc:"10 community connections", total:10 },
  { id:"marathon_coder", label:"Marathon Coder", category:"Course", rarity:"Rare", xp:200, desc:"Complete 30 lessons", total:30 },
  { id:"challenger", label:"Challenger", category:"Challenge", rarity:"Rare", xp:150, desc:"Win 5 challenges", total:5 },
  { id:"knowledge_seeker", label:"Knowledge Seeker", category:"Course", rarity:"Common", xp:100, desc:"Enroll in 3 courses", total:3 },
  { id:"century", label:"Century", category:"Points", rarity:"Common", xp:50, desc:"Earn 100 total XP", total:100 },
  { id:"comeback_kid", label:"Comeback Kid", category:"Resilience", rarity:"Rare", xp:80, desc:"Pass a retry test", total:1 },
  { id:"night_owl", label:"Night Owl", category:"Streak", rarity:"Legendary", xp:500, desc:"30-day streak", total:30 },
  { id:"top_learner", label:"Top Learner", category:"Rank", rarity:"Legendary", xp:300, desc:"Top 10 on leaderboard", total:10 },
];

const RARITY = { Common: "#10b981", Rare: "#6366f1", Legendary: "#f59e0b" };
const MOCK_PROGRESS = { social_butterfly: 7, marathon_coder: 22, challenger: 2, knowledge_seeker: 1 };

export default function Achievements() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const [userData, setUserData] = useState(null);
  const [activityDays, setActivityDays] = useState([]);
  const [filter, setFilter] = useState("All");

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#161b27" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f1f5f9" };

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) setUserData(snap.data());
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const activityRef = collection(db, `users/${currentUser.uid}/activityLog`);
    const unsub = onSnapshot(activityRef, snap => {
      setActivityDays(snap.docs.map(d => d.id));
    }, err => {
      console.warn("Failed to listen to activity log in Achievements:", err);
    });
    return unsub;
  }, [currentUser]);

  const earned = userData?.achievements || [];
  const streak = userData?.currentStreak || 0;
  const totalPoints = userData?.totalPoints || 0;

  const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const cells = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return getLocalDateString(d);
  });

  const todayDate = new Date();
  const sunday = new Date(todayDate);
  sunday.setDate(todayDate.getDate() - todayDate.getDay());

  const weekStudied = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return activityDays.includes(getLocalDateString(d));
  });

  const TIERS = [
    { label: "Bronze", min: 0, max: 500, color: "#cd7c2f" },
    { label: "Silver", min: 500, max: 1500, color: "#94a3b8" },
    { label: "Gold", min: 1500, max: 3000, color: "#f59e0b" },
    { label: "Platinum", min: 3000, max: 6000, color: "#06b6d4" },
    { label: "Diamond", min: 6000, max: 9999, color: "#8b5cf6" },
  ];
  const currentTier = TIERS.reduce((t, tier) => totalPoints >= tier.min ? tier : t, TIERS[0]);
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
  const tierProgress = nextTier ? Math.round(((totalPoints - currentTier.min) / (nextTier.min - currentTier.min)) * 100) : 100;

  const badgeStatus = (b) => earned.includes(b.id) ? "earned" : MOCK_PROGRESS[b.id] !== undefined ? "inprogress" : "locked";

  const filtered = ALL_BADGES.filter(b => {
    const st = badgeStatus(b);
    if (filter === "Earned") return st === "earned";
    if (filter === "In Progress") return st === "inprogress";
    if (filter === "Locked") return st === "locked";
    return true;
  });

  return (
    <Layout title="Achievements">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, margin: "0 auto" }}>

        <div>
          <h2 style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 2px", display:"flex", alignItems:"center", gap:8 }}>
            <Award size={18} color="#6366f1" />Achievements
          </h2>
          <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>{earned.length}/{ALL_BADGES.length} badges earned</p>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
          {[
            { value: streak, label: "Day Streak", color: "#f59e0b", icon: Flame },
            { value: totalPoints.toLocaleString(), label: "Total XP", color: "#6366f1", icon: Zap },
            { value: earned.length, label: "Badges Earned", color: "#10b981", icon: Award },
            { value: currentTier.label, label: "Current Tier", color: currentTier.color, icon: Star },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="card-hover" style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: "14px 16px", borderLeft: `3px solid ${stat.color}` }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
                  <Icon size={14} color={stat.color} />
                  <span style={{ fontSize: 12, color: s.muted }}>{stat.label}</span>
                </div>
                <p style={{ fontWeight: 600, fontSize: 22, color: s.text, margin: 0 }}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Tier progress */}
        {nextTier && (
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: currentTier.color }}>{currentTier.label}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: nextTier.color }}>{nextTier.label}</span>
            </div>
            <div style={{ height: 4, background: s.border, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${tierProgress}%`, height: "100%", background: currentTier.color, borderRadius: 4 }} />
            </div>
            <p style={{ fontSize: 11, color: s.muted, marginTop: 4 }}>{totalPoints}/{nextTier.min} XP · {tierProgress}%</p>
          </div>
        )}

        {/* Streak calendar */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>Activity</p>
            <div style={{ display: "flex", gap: 6 }}>
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i} style={{ width: 26, height: 26, borderRadius: 4, background: weekStudied[i] ? "#6366f1" : s.bg, border: `1px solid ${weekStudied[i] ? "#6366f1" : s.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: weekStudied[i] ? "white" : s.muted, fontWeight: 500 }}>
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(15, 1fr)", gap: 3 }}>
            {cells.map(date => {
              const active = activityDays.includes(date);
              return (
                <div key={date} style={{ aspectRatio: "1", borderRadius: 3, background: active ? "#6366f1" : s.bg, border: `1px solid ${active ? "#6366f1" : s.border}`, opacity: active ? 1 : 0.4 }}
                  title={date} />
              );
            })}
          </div>
        </div>

        {/* Badge filters */}
        <div style={{ display: "flex", gap: 4 }}>
          {["All", "Earned", "In Progress", "Locked"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${filter === f ? "#6366f1" : s.border}`, background: filter === f ? "#6366f1" : "transparent", color: filter === f ? "white" : s.muted, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              {f}
            </button>
          ))}
        </div>

        {/* Badge grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
          {filtered.map(badge => {
            const status = badgeStatus(badge);
            const isEarned = status === "earned";
            const progress = MOCK_PROGRESS[badge.id];
            const rarityColor = RARITY[badge.rarity];
            return (
              <div key={badge.id} style={{ background: s.card, border: `1px solid ${isEarned ? rarityColor : s.border}`, borderRadius: 10, padding: 16, opacity: status === "locked" ? 0.5 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: rarityColor, fontWeight: 500 }}>{badge.rarity}</span>
                  {isEarned && <span style={{ fontSize: 10, background: "rgba(16,185,129,0.1)", color: "#10b981", padding: "1px 6px", borderRadius: 4 }}>Earned</span>}
                </div>
                <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: "0 0 2px" }}>{badge.label}</p>
                <p style={{ fontSize: 12, color: s.muted, margin: "0 0 8px" }}>{badge.desc}</p>
                {progress !== undefined && !isEarned && (
                  <div>
                    <div style={{ height: 3, background: s.border, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ width: `${(progress / badge.total) * 100}%`, height: "100%", background: "#6366f1", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 10, color: s.muted }}>{progress}/{badge.total}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: s.muted }}>{badge.category}</span>
                  <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 500 }}>+{badge.xp} XP</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
