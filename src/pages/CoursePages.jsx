import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import Layout from "../components/Layout";
import { motion } from "framer-motion";
import { COURSES_DATA } from "../firebase/seedData";
import { dropCourse } from "../utils/helpers";
import toast from "react-hot-toast";

// ============ COURSE ONBOARDING ============
export function CourseOnboarding() {
  const { courseId } = useParams();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const activeCourseId = courseId || "python-basics";
  const defaultCourse = COURSES_DATA.find(c => c.id === activeCourseId) || {
    id: activeCourseId,
    title: activeCourseId === "python-basics" ? "Python Basics" : activeCourseId,
    description: "Learn programming step by step",
    level: "Beginner"
  };

  const [course, setCourse] = useState(defaultCourse);

  const s = isDark
    ? { bg: "#0f1117", card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4" }
    : { bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

  useEffect(() => {
    getDoc(doc(db, "courses", activeCourseId)).then(snap => {
      if (snap.exists()) setCourse({ id: snap.id, ...snap.data() });
    }).catch(err => console.error("Error fetching course:", err));
  }, [activeCourseId]);

  const enroll = (isNew) => {
    // Instant navigation - 0ms delay!
    const targetPath = isNew ? `/roadmap/${activeCourseId}` : `/assessment/${activeCourseId}`;
    navigate(targetPath);

    // Update Firestore in background
    if (currentUser?.uid) {
      const userRef = doc(db, "users", currentUser.uid);
      getDoc(userRef).then(snap => {
        let enrolled = [];
        if (snap.exists()) enrolled = snap.data().enrolledCourses || [];
        const existing = enrolled.find(e => (e.courseId || e) === activeCourseId);
        if (!existing) {
          enrolled.push({
            courseId: activeCourseId,
            enrolledAt: new Date().toISOString(),
            level: isNew ? "easy" : "pending",
            completedTopics: []
          });
          setDoc(userRef, { enrolledCourses: enrolled }, { merge: true });
        }
      }).catch(err => console.warn("Background enroll update error:", err));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ minHeight: "100vh", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div style={{ maxWidth: 500, width: "100%" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontWeight: 600, fontSize: 22, color: s.text, margin: "0 0 6px" }}>Enroll in {course?.title || "Python Basics"}</h1>
          <p style={{ color: s.muted, fontSize: 14 }}>Choose your experience level to personalize your path</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            onClick={() => enroll(true)}
            className="card-hover"
            style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 20, textAlign: "left", cursor: "pointer", width: "100%", userSelect: "none" }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 4px", pointerEvents: "none" }}>I'm new to this</p>
            <p style={{ color: s.muted, fontSize: 13, margin: 0, pointerEvents: "none" }}>Start from the beginning with a beginner plan</p>
          </div>
          <div
            onClick={() => enroll(false)}
            className="card-hover"
            style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 20, textAlign: "left", cursor: "pointer", width: "100%", userSelect: "none" }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 4px", pointerEvents: "none" }}>I know the basics</p>
            <p style={{ color: s.muted, fontSize: 13, margin: 0, pointerEvents: "none" }}>Take an assessment to find your starting point</p>
          </div>
        </div>
        <button onClick={() => navigate("/courses")}
          style={{ width: "100%", marginTop: 14, padding: "10px", background: "transparent", border: "none", color: s.muted, cursor: "pointer", fontSize: 13 }}>
          Back to courses
        </button>
      </div>
    </motion.div>
  );
}

// ============ ASSESSMENT ============
export function Assessment() {
  const { courseId } = useParams();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const activeCourseId = courseId || "python-basics";
  const defaultCourse = COURSES_DATA.find(c => c.id === activeCourseId) || COURSES_DATA[0];

  const [course, setCourse] = useState(defaultCourse);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const [level, setLevel] = useState("");

  const s = isDark
    ? { bg: "#0f1117", card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4" }
    : { bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

  useEffect(() => {
    getDoc(doc(db, "courses", activeCourseId)).then(snap => {
      if (snap.exists() && snap.data().assessmentQuestions?.length > 0) {
        setCourse({ id: snap.id, ...snap.data() });
      }
    }).catch(err => console.error("Error fetching assessment course:", err));
  }, [activeCourseId]);

  const questions = course?.assessmentQuestions || [];
  const progress = questions.length ? ((current / questions.length) * 100) : 0;
  const handleSelect = (qi, ai) => setAnswers(prev => ({ ...prev, [qi]: ai }));

  const handleNext = async () => {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1);
    } else {
      const correct = questions.filter((q, i) => answers[i] === q.answer).length;
      const pct = Math.round((correct / questions.length) * 100);
      const assignedLevel = pct <= 40 ? "easy" : pct <= 70 ? "medium" : "hard";
      setLevel(assignedLevel);
      setDone(true);
      if (currentUser?.uid) {
        await updateDoc(doc(db, "users", currentUser.uid), { currentLevel: assignedLevel });
      }
    }
  };

  if (!course || !questions.length) return (
    <div style={{ minHeight: "100vh", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", color: s.muted }}>
      Loading assessment...
    </div>
  );

  if (done) return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ minHeight: "100vh", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <h2 style={{ fontWeight: 600, fontSize: 20, color: s.text, margin: "0 0 8px" }}>Assessment Complete</h2>
        <p style={{ color: s.muted, fontSize: 14, marginBottom: 20 }}>
          You scored {questions.filter((q, i) => answers[i] === q.answer).length}/{questions.length}
        </p>
        <div className="card-hover" style={{ background: s.card, border: `1px solid #6366f1`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <p style={{ color: s.muted, fontSize: 12, margin: "0 0 4px" }}>Assigned level</p>
          <p style={{ fontWeight: 600, fontSize: 22, color: "#6366f1", margin: "0 0 4px", textTransform: "capitalize" }}>{level}</p>
          <p style={{ color: s.muted, fontSize: 12, margin: 0 }}>
            {level === "easy" ? "Strong foundation first" : level === "medium" ? "Building on your knowledge" : "Advanced challenges ahead"}
          </p>
        </div>
        <button onClick={() => navigate(`/roadmap/${activeCourseId}`)}
          style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#6366f1", color: "white", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          Start Course
        </button>
      </div>
    </motion.div>
  );

  const q = questions[current];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ minHeight: "100vh", background: s.bg, display: "flex", flexDirection: "column" }}
    >
      <header style={{ background: s.card, borderBottom: `1px solid ${s.border}`, padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>{course.title} — Assessment</p>
          <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>Question {current + 1} of {questions.length}</p>
        </div>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#6366f1" }}>{current + 1}/{questions.length}</span>
      </header>
      <div style={{ height: 3, background: s.border }}>
        <div style={{ width: `${progress}%`, height: "100%", background: "#6366f1" }} />
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 580, width: "100%" }}>
          <div className="card-hover" style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 24 }}>
            <span style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, display: "inline-block", marginBottom: 14 }}>
              Multiple Choice
            </span>
            <h3 style={{ fontWeight: 600, fontSize: 16, color: s.text, margin: "0 0 20px", lineHeight: 1.5 }}>{q.q}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {q.options.map((opt, i) => (
                <button key={i} onClick={() => handleSelect(current, i)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${answers[current] === i ? "#6366f1" : s.border}`, background: answers[current] === i ? "rgba(99,102,241,0.08)" : "transparent", color: s.text, cursor: "pointer", textAlign: "left", width: "100%", fontSize: 14 }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: answers[current] === i ? "#6366f1" : s.border, color: answers[current] === i ? "white" : s.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 11, flexShrink: 0 }}>
                    {["A","B","C","D"][i]}
                  </span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button onClick={() => current > 0 && setCurrent(c => c - 1)} disabled={current === 0}
                style={{ padding: "8px 18px", borderRadius: 8, background: "transparent", border: `1px solid ${s.border}`, color: s.muted, cursor: current === 0 ? "not-allowed" : "pointer", fontSize: 13, opacity: current === 0 ? 0.4 : 1 }}>
                Previous
              </button>
              <button onClick={handleNext} disabled={answers[current] === undefined}
                style={{ padding: "8px 18px", borderRadius: 8, background: answers[current] !== undefined ? "#6366f1" : s.border, color: answers[current] !== undefined ? "white" : s.muted, border: "none", fontWeight: 600, fontSize: 13, cursor: answers[current] !== undefined ? "pointer" : "not-allowed" }}>
                {current === questions.length - 1 ? "Submit" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============ COURSE ROADMAP ============
export function CourseRoadmap() {
  const { courseId } = useParams();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const activeCourseId = courseId || "python-basics";
  const defaultCourse = COURSES_DATA.find(c => c.id === activeCourseId) || COURSES_DATA[0];

  const [course, setCourse] = useState(defaultCourse);
  const [userData, setUserData] = useState(null);
  const [skillRatings, setSkillRatings] = useState([]);

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#0f1117" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f8fafc" };

  useEffect(() => {
    getDoc(doc(db, "courses", activeCourseId)).then(snap => {
      if (snap.exists() && snap.data().topics?.length > 0) {
        setCourse({ id: snap.id, ...snap.data() });
      }
    }).catch(err => console.error("Error fetching course:", err));
    if (!currentUser) return;
    return onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [activeCourseId, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/difficulty/skill-ratings/${currentUser.uid}`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Failed to fetch skill ratings");
      })
      .then(data => {
        const raw = data.ratings || data.skill_ratings || [];
        const legacy = ["variables", "loops", "functions", "lists", "dictionaries", "files", "oop"];
        let list = [];
        if (Array.isArray(raw)) {
          list = raw.filter(r => !legacy.includes((r.topic_id || "").toLowerCase()) && !legacy.includes((r.name || "").toLowerCase()));
        } else if (raw && typeof raw === "object") {
          list = Object.entries(raw)
            .filter(([k]) => !legacy.includes(k.toLowerCase()))
            .map(([k, v]) => ({ topic_id: k, rating: v, name: k }));
        }
        setSkillRatings(list);
      })
      .catch(err => {
        console.warn("Could not load skill ratings from backend:", err);
      });
  }, [currentUser]);

  const normalizeId = (id) => (id || "").toUpperCase().replace(/^T0*(\d+)$/, (_, n) => `T${n.padStart(2, '0')}`);
  const enrollment = userData?.enrolledCourses?.find(e => (e.courseId || e) === activeCourseId);
  const rawCompleted = enrollment?.completedTopics || [];
  const completedSet = new Set(rawCompleted.map(normalizeId));
  const topics = course?.topics || defaultCourse.topics || [];

  // Active Goal Plan integration
  const activeGoal = userData?.activeGoalPlan;
  const isGoalActive = activeGoal && (!activeGoal.course_id || activeGoal.course_id === activeCourseId);
  const isCustomGoal = isGoalActive && activeGoal?.plan_mode === "custom";
  const goalTopicIds = isCustomGoal && activeGoal?.selected_topics
    ? new Set((activeGoal.selected_topics || []).map(normalizeId))
    : null;

  const isTopicComplete = (topicId) => completedSet.has(normalizeId(topicId));
  const isTopicInGoal = (topicId) => !isCustomGoal || (goalTopicIds && goalTopicIds.has(normalizeId(topicId)));

  const goalTopicsList = isCustomGoal ? topics.filter(t => isTopicInGoal(t.id)) : topics;
  const completedCount = goalTopicsList.filter(t => isTopicComplete(t.id)).length;
  const progressPct = goalTopicsList.length ? Math.round((completedCount / goalTopicsList.length) * 100) : 0;
  
  // Find first uncompleted topic that is part of the active path
  const firstUncompletedIndex = topics.findIndex(t => isTopicInGoal(t.id) && !isTopicComplete(t.id));
  const currentTopicIndex = firstUncompletedIndex !== -1 ? firstUncompletedIndex : Math.max(0, topics.length - 1);

  const handleDropGoal = async () => {
    if (!window.confirm("Drop your active goal plan? The roadmap will revert to the standard course curriculum.")) return;
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { activeGoalPlan: null });
      fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/drop-active-plan/${currentUser.uid}`, { method: "POST" }).catch(() => {});
      toast.success("🚫 Goal dropped! Full course sequence restored.");
    } catch (err) {
      toast.error("Could not drop goal plan.");
    }
  };

  return (
    <Layout title="Roadmap">
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Active Goal Plan Banner */}
        {isGoalActive && (
          <div style={{
            background: isCustomGoal
              ? (isDark ? "rgba(13,148,136,0.12)" : "rgba(13,148,136,0.08)")
              : (isDark ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.08)"),
            border: `1px solid ${isCustomGoal ? "#0d9488" : "#6366f1"}`,
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 16 }}>{isCustomGoal ? "🎯" : "🤖"}</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: isCustomGoal ? "#0d9488" : "#6366f1",
                  background: isCustomGoal ? "rgba(13,148,136,0.18)" : "rgba(99,102,241,0.18)",
                  padding: "2px 8px",
                  borderRadius: 4
                }}>
                  {isCustomGoal ? "Active Custom Goal" : "Active AI Adaptive Engine"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.text }}>
                  "{activeGoal.goal_title}"
                </span>
              </div>
              <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>
                {isCustomGoal
                  ? `Focusing strictly on ${goalTopicsList.length} selected topics (other topics skipped).`
                  : `All ${topics.length} topics dynamically sequenced according to your Elo ratings.`}
                {" · "}<strong>{activeGoal.questions_per_session || 20} Qs per session</strong>
                {" · "}Deadline: <strong>{activeGoal.deadline || "None"}</strong>
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => navigate("/goal-planner")}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: s.card,
                  color: s.text,
                  border: `1px solid ${s.border}`,
                  cursor: "pointer"
                }}
              >
                Manage Planner
              </button>
              <button
                type="button"
                onClick={handleDropGoal}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 11,
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

        {/* Course header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <h2 style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 4px" }}>{course?.title || "Python Basics"}</h2>
              <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>
                {course?.level || "Beginner"} · {course?.lessons || 24} Lessons · {course?.weeks || 6} Weeks
              </p>
            </div>
            <button onClick={async () => {
              if (window.confirm(`Are you sure you want to drop ${course?.title}?`)) {
                await dropCourse(currentUser.uid, course.id);
                navigate("/dashboard");
              }
            }} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}>
              Drop Course
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1, height: 4, background: s.border, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${progressPct}%`, height: "100%", background: isCustomGoal ? "#0d9488" : "#6366f1", borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: isCustomGoal ? "#0d9488" : "#6366f1" }}>{progressPct}%</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${isCustomGoal ? "#0d9488" : "#6366f1"}` }}>
            <p style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 1px" }}>{progressPct}%</p>
            <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>{isCustomGoal ? "Goal Progress" : "Progress"}</p>
          </div>
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #f59e0b" }}>
            <p style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 1px" }}>{userData?.totalPoints || 0}</p>
            <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>Total XP</p>
          </div>
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #10b981" }}>
            <p style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 1px" }}>{completedCount}/{goalTopicsList.length}</p>
            <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>{isCustomGoal ? "Goal Topics" : "Topics"}</p>
          </div>
        </div>

        {/* Current task */}
        {topics[currentTopicIndex] && (
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <p style={{ color: s.muted, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, margin: "0 0 6px", textTransform: "uppercase" }}>Current Topic</p>
            <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 4px" }}>{topics[currentTopicIndex].title}</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "#10b981" }}>+{topics[currentTopicIndex].xp} XP</span>
              <span style={{ fontSize: 11, color: s.muted }}>
                {activeGoal?.questions_per_session ? `${activeGoal.questions_per_session} Questions (~${Math.round((activeGoal.available_hours || 1) * 60)} mins)` : "~20 mins"}
              </span>
            </div>
            <button onClick={() => navigate(`/study/${activeCourseId}/${topics[currentTopicIndex].id}`)}
              style={{ padding: "8px 18px", borderRadius: 8, background: isCustomGoal ? "#0d9488" : "#6366f1", color: "white", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              Start Study Session
            </button>
          </div>
        )}

        {/* Roadmap timeline */}
        <div>
          <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 14px" }}>
            {isCustomGoal ? "Goal Learning Path (Skipping Excluded Topics)" : "Learning Path"}
          </p>
          <div style={{ position: "relative", paddingLeft: 36 }}>
            <div style={{ position: "absolute", left: 12, top: 0, bottom: 0, width: 2, background: s.border }} />

            {topics.map((topic, i) => {
              const inGoal = isTopicInGoal(topic.id);
              const isComplete = isTopicComplete(topic.id);
              const isCurrent = inGoal && i === currentTopicIndex;

              // An included topic is locked if there's an earlier included topic that is not yet completed
              let isLocked = false;
              if (inGoal && !isComplete && !isCurrent) {
                for (let prevIdx = 0; prevIdx < i; prevIdx++) {
                  if (isTopicInGoal(topics[prevIdx].id) && !isTopicComplete(topics[prevIdx].id)) {
                    isLocked = true;
                    break;
                  }
                }
              }

              return (
                <div key={topic.id} style={{ position: "relative", marginBottom: 10 }}>
                  <div style={{
                    position: "absolute", left: -36, top: 12,
                    width: 24, height: 24, borderRadius: "50%",
                    background: !inGoal
                      ? (isDark ? "#1a1f2e" : "#f1f5f9")
                      : isComplete
                      ? "#10b981"
                      : isCurrent
                      ? (isCustomGoal ? "#0d9488" : "#6366f1")
                      : (isDark ? "#232938" : "#f1f5f9"),
                    border: `2px solid ${
                      !inGoal
                        ? s.border
                        : isComplete
                        ? "#10b981"
                        : isCurrent
                        ? (isCustomGoal ? "#0d9488" : "#6366f1")
                        : s.border
                    }`,
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1
                  }}>
                    <span style={{ fontSize: 10, color: inGoal && (isComplete || isCurrent) ? "white" : s.muted }}>
                      {!inGoal ? "⏭️" : isComplete ? "✓" : isLocked ? "🔒" : i + 1}
                    </span>
                  </div>

                  <div style={{
                    background: s.card,
                    border: `1px solid ${!inGoal ? s.border : isCurrent ? (isCustomGoal ? "#0d9488" : "#6366f1") : s.border}`,
                    borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
                    opacity: !inGoal ? 0.5 : isLocked ? 0.65 : 1,
                    cursor: isLocked ? "not-allowed" : "pointer",
                    transition: "all 0.2s"
                  }}
                    onClick={() => {
                      if (!inGoal) {
                        toast("ℹ️ This topic is skipped in your active custom goal plan. You can study it, or drop your goal plan to restore full sequential learning.", { icon: "ℹ️" });
                        navigate(`/study/${activeCourseId}/${topic.id}`);
                        return;
                      }
                      if (isLocked) {
                        toast.error(`🔒 Complete "${topics[currentTopicIndex]?.title || 'earlier goal topics'}" first to unlock this!`);
                        return;
                      }
                      navigate(`/study/${activeCourseId}/${topic.id}`);
                    }}>
                    <div>
                      {!inGoal && <span style={{ fontSize: 10, color: s.muted, fontWeight: 600, display: "block" }}>⏭️ Skipped in Custom Goal</span>}
                      {inGoal && isCurrent && <span style={{ fontSize: 10, color: isCustomGoal ? "#0d9488" : "#6366f1", fontWeight: 600, display: "block" }}>⚡ Current Topic</span>}
                      {inGoal && isLocked && <span style={{ fontSize: 10, color: s.muted, fontWeight: 500, display: "block" }}>🔒 Locked</span>}
                      <p style={{ fontWeight: 500, fontSize: 14, color: isLocked || !inGoal ? s.muted : s.text, margin: 0 }}>{topic.title}</p>
                      {isComplete && <p style={{ fontSize: 11, color: "#10b981", margin: "1px 0 0" }}>✓ Completed</p>}
                    </div>
                    <span style={{ fontSize: 11, color: s.muted }}>+{topic.xp} XP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Skill Ratings Visualization */}
        {skillRatings.length > 0 && (
          <div style={{
            background: s.card,
            border: `1px solid ${s.border}`,
            borderRadius: 10,
            padding: 20,
            marginTop: 30,
            marginBottom: 10
          }}>
            <h3 style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 4px" }}>
              Your Skill Ratings per Topic
            </h3>
            <p style={{ fontSize: 12, color: s.muted, margin: "0 0 20px" }}>
              1000 = baseline · Above 1000 = stronger than average problems on this topic · Updates after every problem you solve
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
              {skillRatings.map((ratingObj, idx) => {
                const rating = ratingObj.rating;
                const matchTopic = (topics || []).find(t => t.id?.toUpperCase() === (ratingObj.topic_id || ratingObj.name)?.toUpperCase());
                const name = matchTopic ? `${matchTopic.id}: ${matchTopic.title}` : (ratingObj.name || ratingObj.topic_id);
                
                const percent = Math.min((rating / 1600) * 100, 100);
                
                let barColor = "#6366f1";
                if (rating >= 1050) barColor = "#10b981";
                else if (rating <= 950) barColor = "#ef4444";

                const baselinePct = (1000 / 1600) * 100;

                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 500, color: s.text, width: 180, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
                      {name}
                    </span>
                    
                    <div style={{ position: "relative", flex: 1, height: 16, background: isDark ? "#2d3748" : "#e2e8f0", borderRadius: 4 }}>
                      <div style={{
                        width: `${percent}%`,
                        height: "100%",
                        background: barColor,
                        borderRadius: percent >= 100 ? "4px" : "4px 0 0 4px",
                        transition: "width 0.4s"
                      }} />
                      
                      <div style={{
                        position: "absolute",
                        left: `${baselinePct}%`,
                        top: 0,
                        bottom: 0,
                        width: 2,
                        background: isDark ? "#ffffff" : "#000000",
                        opacity: 0.35,
                        zIndex: 2
                      }} />
                      
                      {idx === 0 && (
                        <div style={{
                          position: "absolute",
                          left: `${baselinePct}%`,
                          top: -16,
                          transform: "translateX(-50%)",
                          fontSize: 9,
                          fontWeight: 500,
                          color: s.muted
                        }}>
                          baseline
                        </div>
                      )}
                    </div>
                    
                    <span style={{ fontWeight: 600, color: barColor, width: 50, textAlign: "right", flexShrink: 0 }}>
                      {Math.round(rating)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default CourseOnboarding;