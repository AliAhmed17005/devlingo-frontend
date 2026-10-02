import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import Layout from "../components/Layout";
import toast from "react-hot-toast";

const TOPICS = [
  { id: "variables",    label: "Variables and Types" },
  { id: "loops",        label: "Loops and Iteration" },
  { id: "functions",    label: "Functions" },
  { id: "lists",        label: "Lists and Arrays" },
  { id: "dictionaries", label: "Dictionaries" },
  { id: "files",        label: "File Handling" },
  { id: "oop",          label: "OOP" },
];

const EVENT_COLORS = { competition: "#ef4444", deadline: "#f59e0b", exam: "#3b82f6", other: "#6b7280" };

export default function GoalPlanner() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();

  const [goalTitle, setGoalTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoursPerDay, setHoursPerDay] = useState(1.5);
  const [loading, setLoading] = useState(false);
  const [planResult, setPlanResult] = useState(null);

  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState("competition");
  const [eventNotes, setEventNotes] = useState("");
  const [events, setEvents] = useState([]);

  const [plans, setPlans] = useState([]);

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#0f1117", input: "#161b27" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f8fafc", input: "#f8fafc" };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  // Fetch events from backend
  useEffect(() => {
    if (!currentUser) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/events/${currentUser.uid}`)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(d => setEvents(d.events || []))
      .catch(() => {});
  }, [currentUser]);

  // Fetch existing plans from Firestore
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, `users/${currentUser.uid}/studyPlans`),
      orderBy("timestamp", "desc"),
      limit(5)
    );
    const unsub = onSnapshot(q, (snap) => {
      setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentUser]);

  const toggleTopic = (id) => {
    setSelectedTopics(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const createPlan = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/create-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.uid,
          goal_title: goalTitle,
          deadline,
          topics: selectedTopics,
          available_hours: hoursPerDay
        })
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setPlanResult(data);
        toast.success(`Plan created with ${data.sessions_created} sessions!`);
      }
    } catch (e) {
      toast.error("Could not create plan. Is the backend running?");
    }
    setLoading(false);
  };

  const addEvent = async () => {
    if (!eventTitle || !eventDate) return toast.error("Title and date required");
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/add-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.uid,
          title: eventTitle,
          event_date: eventDate,
          event_type: eventType,
          notes: eventNotes
        })
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Event added!");
      setEventTitle(""); setEventDate(""); setEventNotes("");
      // Refresh events
      const evRes = await fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/events/${currentUser.uid}`);
      if (evRes.ok) { const d = await evRes.json(); setEvents(d.events || []); }
    } catch (e) {
      toast.error("Could not add event");
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: `1px solid ${s.border}`, background: s.input,
    color: s.text, fontSize: 14, outline: "none", boxSizing: "border-box"
  };

  const canSubmit = goalTitle.trim() && deadline && selectedTopics.length > 0 && !loading;

  return (
    <Layout title="Goal Planner">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 22, color: s.text, margin: "0 0 4px" }}>
            🎯 Goal Planner
          </h2>
          <p style={{ color: s.muted, fontSize: 14, margin: 0 }}>
            Set a study goal and track your schedule
          </p>
        </div>

        {/* Goal Form */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ fontWeight: 600, fontSize: 16, color: s.text, margin: "0 0 16px" }}>Create Study Plan</h3>

          {/* Goal Title */}
          <label style={{ fontSize: 12, fontWeight: 600, color: s.muted, display: "block", marginBottom: 6 }}>Goal Title</label>
          <input
            value={goalTitle} onChange={e => setGoalTitle(e.target.value)}
            placeholder="e.g. Master Python loops by September 20"
            style={{ ...inputStyle, marginBottom: 16 }}
          />

          {/* Deadline */}
          <label style={{ fontSize: 12, fontWeight: 600, color: s.muted, display: "block", marginBottom: 6 }}>Deadline</label>
          <input
            type="date" value={deadline} min={minDate}
            onChange={e => setDeadline(e.target.value)}
            style={{ ...inputStyle, marginBottom: 16 }}
          />

          {/* Topics */}
          <label style={{ fontSize: 12, fontWeight: 600, color: s.muted, display: "block", marginBottom: 8 }}>Select Topics</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {TOPICS.map(t => (
              <label key={t.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                borderRadius: 8, cursor: "pointer",
                background: selectedTopics.includes(t.id)
                  ? (isDark ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)")
                  : "transparent",
                border: `1px solid ${selectedTopics.includes(t.id) ? "#6366f1" : s.border}`,
                transition: "all 0.2s"
              }}>
                <input
                  type="checkbox" checked={selectedTopics.includes(t.id)}
                  onChange={() => toggleTopic(t.id)}
                  style={{ accentColor: "#6366f1" }}
                />
                <span style={{ fontSize: 13, color: s.text }}>{t.label}</span>
              </label>
            ))}
          </div>

          {/* Hours slider */}
          <label style={{ fontSize: 12, fontWeight: 600, color: s.muted, display: "block", marginBottom: 6 }}>
            Hours per day: <span style={{ color: "#6366f1", fontWeight: 700 }}>{hoursPerDay}h</span>
          </label>
          <input
            type="range" min="0.5" max="3" step="0.5" value={hoursPerDay}
            onChange={e => setHoursPerDay(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "#6366f1", marginBottom: 20 }}
          />

          {/* Create button */}
          <button
            onClick={createPlan} disabled={!canSubmit}
            style={{
              width: "100%", padding: 12, borderRadius: 10,
              background: canSubmit ? "#6366f1" : "#4b5563",
              color: "white", border: "none", fontWeight: 600, fontSize: 14,
              cursor: canSubmit ? "pointer" : "not-allowed"
            }}
          >
            {loading ? "Creating Plan..." : "📅 Create Study Plan"}
          </button>
        </div>

        {/* Plan Result */}
        {planResult && (
          <div style={{
            background: isDark ? "#0d2818" : "#ecfdf5",
            border: `1px solid ${isDark ? "#065f46" : "#a7f3d0"}`,
            borderRadius: 14, padding: 20
          }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, color: "#10b981", margin: "0 0 4px" }}>
              ✅ Plan Created — {planResult.sessions_created} sessions
            </h3>
            <p style={{ fontSize: 12, color: s.muted, margin: "0 0 14px" }}>
              {planResult.days_remaining} days remaining until deadline
            </p>
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {(planResult.schedule || []).map((sess, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 0",
                  borderBottom: `1px solid ${isDark ? "#2d3748" : "#e2e8f0"}`
                }}>
                  <span style={{ fontSize: 16 }}>{sess.completed ? "✅" : "⏳"}</span>
                  <span style={{ fontSize: 13, color: s.text, fontWeight: 500, width: 90 }}>
                    {new Date(sess.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span style={{ fontSize: 13, color: "#818cf8", textTransform: "capitalize" }}>
                    {sess.topic}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Event */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ fontWeight: 600, fontSize: 16, color: s.text, margin: "0 0 16px" }}>📌 Add Calendar Event</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input value={eventTitle} onChange={e => setEventTitle(e.target.value)} placeholder="Event title" style={inputStyle} />
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <select value={eventType} onChange={e => setEventType(e.target.value)} style={inputStyle}>
              <option value="competition">🏆 Competition</option>
              <option value="deadline">⏰ Deadline</option>
              <option value="exam">📝 Exam</option>
              <option value="other">📌 Other</option>
            </select>
            <input value={eventNotes} onChange={e => setEventNotes(e.target.value)} placeholder="Notes (optional)" style={inputStyle} />
          </div>
          <button onClick={addEvent} style={{
            padding: "10px 24px", borderRadius: 8,
            background: "#0d9488", color: "white", border: "none",
            fontWeight: 600, fontSize: 13, cursor: "pointer"
          }}>
            Add to Calendar
          </button>
        </div>

        {/* Upcoming Events */}
        {events.length > 0 && (
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 14, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: s.text, margin: "0 0 14px" }}>Upcoming Events</h3>
            {events.map((ev, i) => {
              const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.other;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                  borderBottom: `1px solid ${isDark ? "#2d3748" : "#f1f5f9"}`
                }}>
                  <div style={{ width: 4, height: 36, borderRadius: 4, background: c, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>{ev.title}</p>
                    <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>
                      {ev.event_date} · <span style={{ color: c, fontWeight: 500 }}>{ev.event_type}</span>
                      {ev.notes ? ` · ${ev.notes}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Existing Plans */}
        {plans.length > 0 && (
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 14, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: s.text, margin: "0 0 14px" }}>Your Study Plans</h3>
            {plans.map(p => {
              const deadlinePassed = p.deadline && new Date(p.deadline) < new Date();
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                  borderBottom: `1px solid ${isDark ? "#2d3748" : "#f1f5f9"}`
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>{p.goal_title}</p>
                    <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>
                      Deadline: {p.deadline} · {p.sessions_created} sessions
                    </p>
                  </div>
                  <span style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: deadlinePassed ? "rgba(107,114,128,0.15)" : "rgba(16,185,129,0.15)",
                    color: deadlinePassed ? "#9ca3af" : "#10b981"
                  }}>
                    {deadlinePassed ? "Completed" : "Active"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
