import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import { collection, query, orderBy, limit, onSnapshot, doc } from "firebase/firestore";
import Layout from "../components/Layout";
import toast from "react-hot-toast";

export default function Reports() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [userData, setUserData] = useState(null);
  const [sessionsCount, setSessionsCount] = useState(null);

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#0f1117" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f8fafc" };

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, `users/${currentUser.uid}/weeklyReports`),
      orderBy("timestamp", "desc"),
      limit(8)
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentUser]);

  // Track user study sessions to verify >= 1 completed session
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, `users/${currentUser.uid}/sessions`), (snap) => {
      setSessionsCount(snap.docs.length);
    });
    return () => unsub();
  }, [currentUser]);

  // Listen to user data to get email reliably
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
    return () => unsub();
  }, [currentUser]);

  const generateReport = async () => {
    if (sessionsCount === 0) {
      toast.error("You must complete at least 1 study session before generating a progress report.");
      return;
    }

    setLoading(true);
    try {
      // Use email from Firestore userData first, then from Auth, fallback to empty
      const userEmail = userData?.email || currentUser?.email || "";

      if (!userEmail) {
        toast.error("No email found. Please update your email in Settings.");
        setLoading(false);
        return;
      }

      const res = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/reporting/weekly-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUser.uid, email: userEmail })
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || errData?.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      if (data.status === "not enough data") {
        toast.error(data.message || `Need more sessions (only ${data.sessions || 0} found). Complete at least 1 session.`);
      } else {
        setReport(data);
        if (data.emailed) {
          toast.success(`Report generated & emailed to ${userEmail}!`);
        } else if (data.email_error) {
          toast.success("Report generated!");
          toast.error(`Email delivery failed: ${data.email_error}`);
        } else {
          toast.success("Report generated! (Email not configured on backend)");
        }
      }
    } catch (e) {
      console.error("Report generation error:", e);
      toast.error(e.message || "Could not generate report. Is the backend running?");
    }
    setLoading(false);
  };

  const trendArrow = (trend) => {
    if (trend === "improving") return { text: "↑ Improving", color: "#10b981" };
    if (trend === "declining") return { text: "↓ Declining", color: "#ef4444" };
    return { text: "→ Stable", color: "#fbbf24" };
  };

  return (
    <Layout title="Reports">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 22, color: s.text, margin: "0 0 4px" }}>
            Insights & Reports
          </h2>
          <p style={{ color: s.muted, fontSize: 14, margin: 0 }}>
            Weekly progress analyzed and sent to your Gmail
          </p>
        </div>

        {/* Generate Report Card */}
        <div style={{
          background: s.card, border: `1px solid ${s.border}`, borderRadius: 14,
          padding: 24, borderLeft: "4px solid #6366f1"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <h3 style={{ fontWeight: 600, fontSize: 16, color: s.text, margin: 0 }}>
              Weekly Performance Report
            </h3>
            <span style={{
              fontSize: 12,
              background: isDark ? "rgba(99, 102, 241, 0.2)" : "rgba(99, 102, 241, 0.1)",
              color: "#6366f1",
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 20
            }}>
              ⏱ Emailed Automatically Every Week
            </span>
          </div>

          <p style={{ fontSize: 13, color: s.muted, margin: "0 0 16px", lineHeight: 1.6 }}>
            Generates an AI-powered summary of your week including average score, trend analysis,
            anomaly detection, and personalized improvement tips. Reports are <strong>automatically emailed to your registered Gmail once a week</strong> as you study, or you can trigger one on demand below.
          </p>

          {sessionsCount === 0 && (
            <div style={{
              background: isDark ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              fontSize: 13,
              color: isDark ? "#fde68a" : "#b45309",
              lineHeight: 1.5
            }}>
              ⚠️ <strong>No Sessions Completed Yet:</strong> You must complete at least 1 study session before DevLingo can analyze your performance and dispatch weekly reports.
            </div>
          )}

          <button
            onClick={generateReport}
            disabled={loading || sessionsCount === 0}
            style={{
              width: "100%", padding: "12px", borderRadius: 10,
              background: loading || sessionsCount === 0 ? "#4b5563" : "#6366f1",
              color: "white", border: "none", fontWeight: 600, fontSize: 14,
              cursor: loading || sessionsCount === 0 ? "not-allowed" : "pointer",
              transition: "background 0.2s",
              opacity: sessionsCount === 0 ? 0.7 : 1
            }}
          >
            {loading ? "Generating..." : sessionsCount === 0 ? "Complete 1 Session to Unlock Report" : "📧 Send Weekly Report Now"}
          </button>
        </div>

        {/* Current Report Result */}
        {report && (
          <div style={{
            background: isDark ? "#0d2818" : "#ecfdf5",
            border: `1px solid ${isDark ? "#065f46" : "#a7f3d0"}`,
            borderRadius: 14, padding: 24
          }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, color: "#10b981", margin: "0 0 16px" }}>
              ✅ Report Generated
            </h3>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginBottom: 16 }}>
              <div style={{ background: isDark ? "#1a1f2e" : "#ffffff", borderRadius: 10, padding: 14, textAlign: "center" }}>
                <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>Avg Score</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "#6366f1", margin: "4px 0 0" }}>{report.avg_score}%</p>
              </div>
              <div style={{ background: isDark ? "#1a1f2e" : "#ffffff", borderRadius: 10, padding: 14, textAlign: "center" }}>
                <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>Trend</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: trendArrow(report.trend).color, margin: "4px 0 0" }}>
                  {trendArrow(report.trend).text}
                </p>
              </div>
              <div style={{ background: isDark ? "#1a1f2e" : "#ffffff", borderRadius: 10, padding: 14, textAlign: "center" }}>
                <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>Sessions</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "#34d399", margin: "4px 0 0" }}>{report.sessions}</p>
              </div>
              <div style={{ background: isDark ? "#1a1f2e" : "#ffffff", borderRadius: 10, padding: 14, textAlign: "center" }}>
                <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>Time</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: "#fbbf24", margin: "4px 0 0" }}>{report.total_minutes}m</p>
              </div>
            </div>

            {/* Anomalies warning */}
            {report.anomalies > 0 && (
              <div style={{
                background: isDark ? "#451a03" : "#fffbeb",
                border: "1px solid #f59e0b", borderRadius: 10,
                padding: 12, marginBottom: 14
              }}>
                <p style={{ color: "#fbbf24", margin: 0, fontSize: 13 }}>
                  ⚠️ {report.anomalies} unusual session(s) detected this week
                </p>
              </div>
            )}

            {/* AI Summary */}
            <div style={{
              background: isDark ? "#1a1f2e" : "#ffffff",
              borderLeft: "4px solid #6366f1", borderRadius: 10,
              padding: 16
            }}>
              <p style={{ color: "#818cf8", fontSize: 11, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase" }}>
                AI Coach Says
              </p>
              <p style={{ color: s.text, lineHeight: 1.7, margin: 0, fontSize: 14 }}>
                {report.summary}
              </p>
            </div>
          </div>
        )}

        {/* Report History */}
        {history.length > 0 && (
          <div style={{
            background: s.card, border: `1px solid ${s.border}`,
            borderRadius: 14, padding: 20
          }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: s.text, margin: "0 0 14px" }}>
              Past Reports
            </h3>
            {history.map((r) => {
              const t = trendArrow(r.trend);
              const date = r.timestamp?.toDate
                ? r.timestamp.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "—";
              return (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0",
                  borderBottom: `1px solid ${isDark ? "#2d3748" : "#f1f5f9"}`
                }}>
                  <span style={{
                    background: "rgba(99,102,241,0.15)", color: "#818cf8",
                    padding: "4px 10px", borderRadius: 6, fontSize: 13, fontWeight: 700, minWidth: 50, textAlign: "center"
                  }}>
                    {r.avg_score}%
                  </span>
                  <span style={{ color: t.color, fontWeight: 600, fontSize: 13, width: 90 }}>
                    {t.text}
                  </span>
                  <span style={{ fontSize: 12, color: s.muted }}>
                    {r.total_sessions || r.sessions || 0} sessions
                  </span>
                  <span style={{ fontSize: 12, color: s.muted, marginLeft: "auto" }}>
                    {date}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!report && history.length === 0 && (
          <div style={{
            background: s.card, border: `1px solid ${s.border}`,
            borderRadius: 14, padding: 48, textAlign: "center"
          }}>
            <p style={{ fontSize: 48, margin: "0 0 12px" }}>📊</p>
            <h3 style={{ fontWeight: 700, fontSize: 18, color: s.text, margin: "0 0 8px" }}>
              No reports yet
            </h3>
            <p style={{ color: s.muted, fontSize: 14, margin: 0 }}>
              Complete at least 1 study session to generate your first weekly report
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
