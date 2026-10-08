import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import { doc, onSnapshot, collection, getDocs, query, where, orderBy, limit, updateDoc } from "firebase/firestore";
import { updateStreak, ensureUserTagId, dropCourse } from "../utils/helpers";
import { syncUserProfileToRTDB } from "../firebase/realtime";
import Layout from "../components/Layout";
import { Flame, Zap, Globe, BookOpen } from "lucide-react";
import toast from "react-hot-toast";
import { COURSES_DATA } from "../firebase/seedData";

const getGridDays = () => {
  const days = [];
  const today = new Date();
  const end = new Date(today);
  const dayOfWeek = today.getDay(); // 0 is Sunday, 6 is Saturday
  // Align to the end of the current week (Saturday)
  end.setDate(today.getDate() + (6 - dayOfWeek));

  for (let i = 111; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    
    // Generate local YYYY-MM-DD date string matching helpers.js local date format
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    days.push({
      date: dateStr,
      dayOfWeek: d.getDay(),
      formattedDate: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    });
  }
  return days;
};

const formatTimeAgo = (isoString) => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch (err) {
    return "";
  }
};

export default function Dashboard() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const [userData, setUserData] = useState(null);
  const [courses, setCourses] = useState([]);
  const [activity, setActivity] = useState(new Set());
  const [globalRank, setGlobalRank] = useState("---");
  const navigate = useNavigate();
  const [decisionLogs, setDecisionLogs] = useState([]);
  const [moodChart, setMoodChart] = useState(null);
  const [skillRatings, setSkillRatings] = useState({});
  const [agentLog, setAgentLog] = useState([]);

  const getTopicDisplayName = (topicKey) => {
    if (!topicKey) return "";
    const allCoursesList = courses.length > 0 ? courses : COURSES_DATA;
    for (const c of allCoursesList) {
      const match = (c.topics || []).find(t => t.id?.toUpperCase() === topicKey?.toUpperCase());
      if (match) return `${match.id}: ${match.title}`;
    }
    for (const c of COURSES_DATA) {
      const match = (c.topics || []).find(t => t.id?.toUpperCase() === topicKey?.toUpperCase());
      if (match) return `${match.id}: ${match.title}`;
    }
    return topicKey.replace(/_/g, " ");
  };

  useEffect(() => {
    if (!currentUser) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/agent/state-log/${currentUser.uid}`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Failed to fetch state log");
      })
      .then(data => {
        const logsArray = Array.isArray(data)
          ? data
          : Array.isArray(data?.log)
            ? data.log
            : Array.isArray(data?.logs)
              ? data.logs
              : [];
        setDecisionLogs(logsArray);
      })
      .catch(err => {
        console.warn("Error loading agent decision logs:", err);
        setDecisionLogs([]);
      });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/agent/mood-chart/${currentUser.uid}`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Failed to fetch mood chart");
      })
      .then(data => {
        setMoodChart(data);
      })
      .catch(err => {
        console.warn("Error loading mood chart:", err);
      });
  }, [currentUser]);

  const s = isDark
    ? { card:"#1a1f2e",border:"#2d3748",text:"#f0f4ff",muted:"#8892a4",bg:"#161b27" }
    : { card:"#ffffff",border:"#e2e8f0",text:"#0f172a",muted:"#64748b",bg:"#f8fafc" };

  useEffect(() => {
    if (!currentUser) return;
    updateStreak(currentUser.uid);
    ensureUserTagId(currentUser.uid);
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) setUserData(snap.data());
    }, err => {
      console.warn("onSnapshot Dashboard user doc failed:", err);
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const activityRef = collection(db, `users/${currentUser.uid}/activityLog`);
    const unsub = onSnapshot(activityRef, snap => {
      const dates = new Set(snap.docs.map(doc => doc.id));
      setActivity(dates);
    }, err => {
      console.warn("Failed to fetch activity log:", err);
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !userData) return;
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("totalPoints", ">", userData.totalPoints || 0));
    getDocs(q).then(snap => {
      const rank = snap.size + 1;
      setGlobalRank(`#${rank}`);
    }).catch(err => {
      console.warn("Failed to calculate global rank:", err);
      setGlobalRank("#1");
    });
  }, [currentUser, userData]);

  useEffect(() => {
    if (currentUser && userData) {
      syncUserProfileToRTDB(currentUser.uid, {
        name: userData.name || currentUser.displayName || "User",
        email: userData.email || currentUser.email || "",
        tagId: userData.tagId || "---",
        enrolledCourses: userData.enrolledCourses || []
      });
    }
  }, [currentUser, userData]);

  useEffect(() => {
    getDocs(collection(db, "courses")).then(snap => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const rawSkills = snap.data()?.skillRatings || {};
        
        // Auto-clean legacy dummy keys for this and all existing users
        const legacyKeys = ["variables", "loops", "functions", "lists", "dictionaries", "files", "oop"];
        const hasLegacy = legacyKeys.some(k => k in rawSkills);

        if (hasLegacy) {
          const cleaned = { ...rawSkills };
          legacyKeys.forEach(k => delete cleaned[k]);
          updateDoc(userRef, { skillRatings: cleaned }).catch(console.warn);
          setSkillRatings(cleaned);
        } else {
          setSkillRatings(rawSkills);
        }
      }
    });
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'stateLog'),
      where('userId', '==', currentUser.uid),
      orderBy('timestamp', 'desc'),
      limit(8)
    );
    const unsub = onSnapshot(q, (snap) => {
      setAgentLog(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [currentUser]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = currentUser?.displayName?.split(" ")[0] || "there";

  const stats = [
    { value: userData?.currentStreak || 0, label: "Day Streak", color: "#f59e0b", icon: Flame },
    { value: (userData?.totalPoints || 0).toLocaleString(), label: "Total XP", color: "#6366f1", icon: Zap },
    { value: globalRank, label: "Global Rank", color: "#0f9b8e", icon: Globe },
    { value: userData?.enrolledCourses?.length || 0, label: "Courses", color: "#10b981", icon: BookOpen },
  ];

  const gridDays = getGridDays();
  const weeks = [];
  for (let i = 0; i < gridDays.length; i += 7) {
    weeks.push(gridDays.slice(i, i + 7));
  }

  const normalizeId = (id) => (id || "").toUpperCase().replace(/^T0*(\d+)$/, (_, n) => `T${n.padStart(2, '0')}`);
  const enrolledCourseIds = userData?.enrolledCourses?.map(e => e.courseId || e) || [];
  const currentCourses = courses.filter(c => enrolledCourseIds.includes(c.id));
  
  const primaryCourse = currentCourses[0];
  const primaryEnrollment = userData?.enrolledCourses?.find(e => (e.courseId || e) === primaryCourse?.id);
  const userCompletedTopics = new Set((primaryEnrollment?.completedTopics || []).map(normalizeId));
  const primaryTopics = primaryCourse?.topics || [];

  // Active Goal Plan integration: filter learning path to selected topics only
  const activeGoal = userData?.activeGoalPlan;
  const isGoalActive = activeGoal && (!activeGoal.course_id || activeGoal.course_id === primaryCourse?.id);
  const isCustomGoal = isGoalActive && activeGoal?.plan_mode === "custom";
  const goalTopicIds = isCustomGoal && activeGoal?.selected_topics
    ? new Set((activeGoal.selected_topics || []).map(normalizeId))
    : null;

  const relevantTopics = isCustomGoal
    ? primaryTopics.filter(t => goalTopicIds.has(normalizeId(t.id)))
    : primaryTopics;

  const activeTopic = relevantTopics.find(t => !userCompletedTopics.has(normalizeId(t.id))) || relevantTopics[0];
  const allCompleted = relevantTopics.length > 0 && relevantTopics.every(t => userCompletedTopics.has(normalizeId(t.id)));

  const handleDropGoal = async () => {
    if (!window.confirm("Drop your active goal plan? Your course roadmap will revert to standard sequential learning.")) return;
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { activeGoalPlan: null });
      fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/drop-active-plan/${currentUser.uid}`, { method: "POST" }).catch(() => {});
      toast.success("🚫 Goal dropped! Standard course curriculum restored.");
    } catch (err) {
      toast.error("Could not drop goal plan.");
    }
  };

  return (
    <Layout title="Dashboard">
      <div style={{ display:"flex",flexDirection:"column",gap:20 }}>

        {/* Greeting */}
        <div>
          <h2 style={{ fontWeight:600,fontSize:20,color:s.text,margin:"0 0 4px" }}>
            {greeting}, {firstName}
          </h2>
          <p style={{ color:s.muted,fontSize:14,margin:0 }}>
            {userData?.currentStreak > 0
              ? `${userData.currentStreak}-day streak — keep it up!`
              : "Start your learning journey today"}
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12 }}>
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="card-hover" style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:10,padding:"16px 18px",borderLeft:`3px solid ${stat.color}` }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
                  <Icon size={16} color={stat.color} strokeWidth={2} />
                  <span style={{ fontSize:12,color:s.muted }}>{stat.label}</span>
                </div>
                <p style={{ fontWeight:600,fontSize:24,color:s.text,margin:0 }}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Active Goal Plan Banner on Dashboard */}
        {isGoalActive && (
          <div
            style={{
              background: isCustomGoal
                ? (isDark ? "rgba(13,148,136,0.12)" : "rgba(13,148,136,0.06)")
                : (isDark ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.06)"),
              border: `1px solid ${isCustomGoal ? "#0d9488" : "#6366f1"}`,
              borderRadius: 12,
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>{isCustomGoal ? "🎯" : "🤖"}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: isCustomGoal ? "#0d9488" : "#6366f1",
                    background: isCustomGoal ? "rgba(13,148,136,0.18)" : "rgba(99,102,241,0.18)",
                    padding: "2px 8px",
                    borderRadius: 4
                  }}
                >
                  {isCustomGoal ? "Active Custom Goal" : "Active AI Adaptive Engine"}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.text }}>
                  "{activeGoal.goal_title}"
                </span>
              </div>
              <p style={{ fontSize: 13, color: s.muted, margin: 0 }}>
                {isCustomGoal
                  ? `Focusing on ${relevantTopics.length} selected topics (other topics skipped)`
                  : `All topics scheduled dynamically by Elo ratings`}
                {" · "}Pace: <strong>{activeGoal.available_hours || 1}h daily</strong>
                {" · "}Session Load: <strong style={{ color: "#6366f1" }}>{activeGoal.questions_per_session || 22} Qs/session</strong>
                {" · "}Deadline: <strong>{activeGoal.deadline || "None"}</strong>
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => navigate("/goal-planner")}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: s.card,
                  color: s.text,
                  border: `1px solid ${s.border}`,
                  cursor: "pointer"
                }}
              >
                Manage Goal
              </button>
              <button
                type="button"
                onClick={handleDropGoal}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  background: "rgba(239,68,68,0.12)",
                  color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.25)",
                  cursor: "pointer"
                }}
              >
                🚫 Drop Goal
              </button>
            </div>
          </div>
        )}

        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
          {/* Today's task */}
          <div style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:10,padding:20 }}>
            <p style={{ color:s.muted,fontSize:11,fontWeight:600,letterSpacing:0.8,margin:"0 0 8px",textTransform:"uppercase" }}>
              {isCustomGoal ? "Today's Goal Task" : "Today's Task"}
            </p>
            <p style={{ fontWeight:600,fontSize:16,color:s.text,margin:"0 0 4px" }}>
              {primaryCourse
                ? `${primaryCourse.title} — ${allCompleted ? "Review & Practice" : (activeTopic?.title || "Next Lesson")}`
                : "No course enrolled"}
            </p>
            <p style={{ color:s.muted,fontSize:13,margin:"0 0 14px" }}>
              {activeTopic
                ? activeGoal?.questions_per_session
                  ? `${activeGoal.questions_per_session} questions · ~${Math.round((activeGoal.available_hours || 1) * 60)} mins`
                  : "~20 mins · Next topic in roadmap"
                : "7 questions · ~20 mins"}
            </p>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
              <span style={{ background:"rgba(16,185,129,0.1)",color:"#10b981",padding:"3px 10px",borderRadius:4,fontSize:12,fontWeight:500 }}>
                +{activeTopic?.xp || 70} XP
              </span>
              <span style={{ color:s.muted,fontSize:12 }}>Due by midnight</span>
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <button
                onClick={() => primaryCourse && activeTopic && navigate(`/study/${primaryCourse.id}/${activeTopic.id}`)}
                style={{ flex:1,padding:"9px",borderRadius:8,background:"#6366f1",color:"white",border:"none",fontWeight:600,fontSize:13,cursor:"pointer" }}
              >
                {allCompleted ? "Practice" : "Start Task"}
              </button>
              <button
                onClick={() => primaryCourse && navigate(`/roadmap/${primaryCourse.id}`)}
                style={{ padding:"9px 16px",borderRadius:8,background: isDark ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)",color:"#818cf8",border:`1px solid ${s.border}`,cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6 }}
              >
                🗺️ View Roadmap
              </button>
            </div>
          </div>

          {/* Activity calendar */}
          <div style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:10,padding:20 }}>
            <p style={{ fontWeight:600,fontSize:14,color:s.text,margin:"0 0 14px" }}>Activity Calendar</p>
            <div style={{ display:"flex",gap:8 }}>
              {/* Day Labels Column */}
              <div style={{ display:"flex",flexDirection:"column",gap:3,paddingTop:2 }}>
                {["S", "M", "T", "W", "T", "F", "S"].map((l, idx) => (
                  <span key={idx} style={{ fontSize: 9, color: s.muted, height: 10, width: 10, textAlign: "center", lineHeight: "10px" }}>
                    {l}
                  </span>
                ))}
              </div>
              
              {/* Heatmap Grid */}
              <div style={{ display:"flex",gap:3,overflowX:"auto",flex:1,paddingBottom:5 }}>
                {weeks.map((week, wIdx) => (
                  <div key={wIdx} style={{ display:"flex",flexDirection:"column",gap:3 }}>
                    {week.map(day => {
                      const hasStudied = activity.has(day.date);
                      return (
                        <div
                          key={day.date}
                          title={`${day.formattedDate}: ${hasStudied ? "Studied (Earned XP)" : "No activity"}`}
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: hasStudied 
                              ? "#10b981" 
                              : isDark ? "#242b3d" : "#e2e8f0",
                            cursor: "pointer",
                            transition: "transform 0.1s",
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.25)"}
                          onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Heatmap Legend */}
            <div style={{ display:"flex",justifyContent:"flex-end",alignItems:"center",gap:6,marginTop:12,fontSize:11,color:s.muted }}>
              <span>Less</span>
              <div style={{ width:10,height:10,borderRadius:2,background: isDark ? "#242b3d" : "#e2e8f0" }} />
              <div style={{ width:10,height:10,borderRadius:2,background: "#10b981" }} />
              <span>More</span>
            </div>
          </div>
        </div>

        {/* Continue learning */}
        {currentCourses.length > 0 && (
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
              <p style={{ fontWeight:600,fontSize:15,color:s.text,margin:0 }}>Continue Learning</p>
              <button onClick={() => navigate("/courses")} style={{ fontSize:13,color:"#6366f1",background:"none",border:"none",cursor:"pointer",fontWeight:500 }}>View all</button>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12 }}>
              {currentCourses.slice(0,3).map(course => {
                const enrollment = userData?.enrolledCourses?.find(e => (e.courseId || e) === course.id);
                const completedTopicsCount = enrollment?.completedTopics?.length || 0;
                const totalTopicsCount = course.topics?.length || 0;
                const progressPct = totalTopicsCount ? Math.round((completedTopicsCount / totalTopicsCount) * 100) : 0;

                return (
                  <div key={course.id} className="card-hover" style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:10,padding:16,cursor:"pointer" }}
                    onClick={() => navigate(`/roadmap/${course.id}`)}>
                    <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12 }}>
                      <div style={{ width:8,height:8,borderRadius:"50%",background:course.color,flexShrink:0 }} />
                      <div>
                        <p style={{ fontWeight:600,fontSize:14,color:s.text,margin:0 }}>{course.title}</p>
                        <p style={{ fontSize:12,color:s.muted,margin:0 }}>{course.instructor}</p>
                      </div>
                    </div>
                    <div style={{ height:4,background:s.border,borderRadius:4,overflow:"hidden",marginBottom:8 }}>
                      <div style={{ width:`${progressPct}%`,height:"100%",background:"#6366f1",borderRadius:4 }} />
                    </div>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:12,color:s.muted }}>{progressPct}% complete</span>
                      <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/roadmap/${course.id}`);
                        }} style={{ padding:"4px 10px",borderRadius:6,background: isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.1)",color:"#818cf8",border:"none",fontSize:12,fontWeight:600,cursor:"pointer" }}>
                          🗺️ Roadmap
                        </button>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Are you sure you want to drop ${course.title}?`)) {
                            dropCourse(currentUser.uid, course.id);
                          }
                        }} style={{ padding:"4px 10px",borderRadius:6,background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"none",fontSize:12,fontWeight:500,cursor:"pointer" }}>
                          Drop
                        </button>
                        <button style={{ padding:"4px 12px",borderRadius:6,background:"#6366f1",color:"white",border:"none",fontSize:12,fontWeight:500,cursor:"pointer" }}>Resume</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommended courses */}
        <div>
          <p style={{ fontWeight:600,fontSize:15,color:s.text,margin:"0 0 12px" }}>Recommended</p>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12 }}>
            {courses.slice(0,3).map(course => (
              <div key={course.id} className="card-hover" style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:10,padding:16,cursor:"pointer" }}
                onClick={() => navigate(`/onboarding/${course.id}`)}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                  <span style={{ fontSize:11,background:"rgba(99,102,241,0.08)",color:"#6366f1",padding:"2px 8px",borderRadius:4,fontWeight:500 }}>{course.level}</span>
                  <span style={{ fontSize:12,color:s.muted }}>{course.rating}</span>
                </div>
                <p style={{ fontWeight:600,fontSize:14,color:s.text,margin:"0 0 4px" }}>{course.title}</p>
                <p style={{ fontSize:12,color:s.muted,margin:"0 0 14px" }}>{course.instructor}</p>
                <button style={{ width:"100%",padding:"8px",borderRadius:8,background:"#6366f1",color:"white",border:"none",fontWeight:600,fontSize:13,cursor:"pointer" }}>
                  Enroll Free
                </button>
              </div>
            ))}
          </div>
        </div>
        {/* Mood Chart Section */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 20, marginTop: 10 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 14px" }}>
            Your learning mood over time
          </p>
          
          {!moodChart || !moodChart.sentiments || moodChart.sentiments.length < 5 ? (
            <p style={{ color: s.muted, fontSize: 13, margin: 0, fontStyle: "italic" }}>
              Complete more study sessions to see your mood trend
            </p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", overflowX: "auto" }}>
              {moodChart.sentiments.map((sentiment, idx) => {
                let dotColor = "#6366f1"; // neutral -> indigo
                if (sentiment === "confident") dotColor = "#10b981"; // green
                else if (sentiment === "confused") dotColor = "#f59e0b"; // amber
                else if (sentiment === "frustrated") dotColor = "#ef4444"; // red
                
                const dateTooltip = moodChart.dates[idx] ? new Date(moodChart.dates[idx]).toLocaleString() : "";
                
                return (
                  <div
                    key={idx}
                    title={`${sentiment} (${dateTooltip})`}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: dotColor,
                      cursor: "pointer",
                      flexShrink: 0,
                      transition: "transform 0.1s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.3)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* AI Agent Decisions Section */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 20, marginTop: 10 }}>
          <h3 style={{ fontWeight: 600, fontSize: 16, color: s.text, margin: "0 0 4px" }}>
            How the agent has been adapting your experience
          </h3>
          <p style={{ color: s.muted, fontSize: 13, margin: "0 0 20px" }}>
            These decisions happen automatically based on your behavior and chat messages
          </p>
          
          {(!Array.isArray(decisionLogs) || decisionLogs.length === 0) ? (
            <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>No decision history found.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(Array.isArray(decisionLogs) ? decisionLogs : []).slice(0, 8).map((log, idx) => {
                const action = log.action;
                let icon = "➡️";
                let actionText = "Maintained Level";
                if (action === "increase_difficulty") {
                  icon = "📈";
                  actionText = "Increased Difficulty";
                } else if (action === "decrease_difficulty") {
                  icon = "📉";
                  actionText = "Decreased Difficulty";
                }
                
                return (
                  <div key={log.id || idx} style={{ display: "flex", alignItems: "center", justify_content: "space-between", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: isDark ? "#1f2736" : "#f1f5f9", border: `1px solid ${s.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{icon}</span>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>{actionText}</p>
                        <p style={{ fontSize: 12, color: s.muted, margin: 0, textTransform: "capitalize" }}>
                          Mood: {log.sentiment} · Confidence: {Math.round((log.confidence || 0) * 100)}%
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: s.muted }}>
                      {formatTimeAgo(log.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Elo Skill Ratings */}
        {Object.keys(skillRatings).filter(t => !["variables", "loops", "functions", "lists", "dictionaries", "files", "oop"].includes(t)).length > 0 && (
          <div style={{
            background: isDark ? '#1e2433' : '#ffffff',
            border: `1px solid ${isDark ? '#2d3748' : '#e2e8f0'}`,
            borderRadius: 14, padding: 20, marginTop: 20
          }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: isDark ? '#f0f4ff' : '#0f172a', margin: '0 0 4px' }}>
              Your Elo Skill Ratings per Topic
            </h3>
            <p style={{ fontSize: 12, color: isDark ? '#8892a4' : '#64748b', margin: '0 0 16px' }}>
              1000 = baseline · Above 1000 = stronger proficiency · Dynamic IRT updates after every practice session
            </p>
            {Object.entries(skillRatings)
              .filter(([topic]) => !["variables", "loops", "functions", "lists", "dictionaries", "files", "oop"].includes(topic))
              .map(([topic, rating]) => (
              <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isDark ? '#f0f4ff' : '#0f172a',
                    width: 200,
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={getTopicDisplayName(topic)}
                >
                  {getTopicDisplayName(topic)}
                </span>
                <div style={{ flex: 1, height: 10, background: isDark ? '#2d3748' : '#e2e8f0', borderRadius: 20, position: 'relative' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min((rating / 1600) * 100, 100)}%`,
                    background: rating >= 1050 ? '#10b981' : rating <= 950 ? '#ef4444' : '#6366f1',
                    borderRadius: 20,
                    transition: 'width 0.5s ease'
                  }} />
                  <div style={{
                    position: 'absolute', top: -14, left: `${(1000 / 1600) * 100}%`,
                    borderLeft: '1px dashed #6b7280', height: 38, opacity: 0.5
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: rating >= 1050 ? '#10b981' : rating <= 950 ? '#ef4444' : '#6366f1', width: 65, textAlign: 'right' }}>
                  {Math.round(rating)} Elo
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: isDark ? '#8892a4' : '#94a3b8', margin: '10px 0 0' }}>
              <span>Easy (&lt;1050)</span>
              <span>Baseline: 1000 Elo</span>
              <span>Medium (1050-1350)</span>
              <span>Hard (&gt;1350)</span>
            </div>
          </div>
        )}

        {/* Real-time Agent Log */}
        {Array.isArray(agentLog) && agentLog.length >= 2 && (
          <div style={{
            background: isDark ? '#1e2433' : '#ffffff',
            border: `1px solid ${isDark ? '#2d3748' : '#e2e8f0'}`,
            borderRadius: 14, padding: 20, marginTop: 16
          }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: isDark ? '#f0f4ff' : '#0f172a', margin: '0 0 4px' }}>
              AI Agent Decisions
            </h3>
            <p style={{ fontSize: 12, color: isDark ? '#8892a4' : '#64748b', margin: '0 0 14px' }}>
              Automatically adapting your learning experience
            </p>
            {agentLog.map(log => (
              <div key={log.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 0',
                borderBottom: `1px solid ${isDark ? '#2d3748' : '#f1f5f9'}`
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                  background: log.action === 'increase_difficulty' ? 'rgba(16,185,129,0.15)'
                    : log.action === 'decrease_difficulty' ? 'rgba(239,68,68,0.15)'
                    : 'rgba(99,102,241,0.15)'
                }}>
                  {log.action === 'increase_difficulty' ? '↑' : log.action === 'decrease_difficulty' ? '↓' : '→'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: isDark ? '#f0f4ff' : '#0f172a', margin: 0 }}>
                    {(log.action || '').replace(/_/g, ' ')}
                  </p>
                  <p style={{ fontSize: 11, color: isDark ? '#8892a4' : '#64748b', margin: 0 }}>
                    {log.sentiment} · {Math.round((log.confidence || 0) * 100)}% confidence
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
