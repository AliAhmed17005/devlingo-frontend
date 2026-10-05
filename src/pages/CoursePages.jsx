import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import { doc, getDoc, updateDoc, arrayUnion, onSnapshot } from "firebase/firestore";
import Layout from "../components/Layout";
import { motion } from "framer-motion";
import { dropCourse } from "../utils/helpers";

// ============ COURSE ONBOARDING ============
export function CourseOnboarding() {
  const { courseId } = useParams();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(false);

  const s = isDark
    ? { bg: "#0f1117", card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4" }
    : { bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

  useEffect(() => {
    getDoc(doc(db, "courses", courseId)).then(snap => {
      if (snap.exists()) setCourse({ id: snap.id, ...snap.data() });
    }).catch(err => console.error("Error fetching course:", err));
  }, [courseId]);

  const enroll = async (isNew) => {
    setLoading(true);
    await updateDoc(doc(db, "users", currentUser.uid), {
      enrolledCourses: arrayUnion({
        courseId, enrolledAt: new Date().toISOString(),
        level: isNew ? "easy" : "pending", completedTopics: []
      })
    });
    if (isNew) navigate(`/roadmap/${courseId}`);
    else navigate(`/assessment/${courseId}`);
  };

  if (!course) return (
    <div style={{ minHeight: "100vh", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: s.muted, fontSize: 14 }}>Loading...</p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ minHeight: "100vh", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div style={{ maxWidth: 500, width: "100%" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontWeight: 600, fontSize: 22, color: s.text, margin: "0 0 6px" }}>Enroll in {course.title}</h1>
          <p style={{ color: s.muted, fontSize: 14 }}>Choose your experience level to personalize your path</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => enroll(true)} disabled={loading}
            className="card-hover"
            style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 20, textAlign: "left", cursor: "pointer", width: "100%" }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 4px" }}>I'm new to this</p>
            <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>Start from the beginning with a beginner plan</p>
          </button>
          <button onClick={() => enroll(false)} disabled={loading}
            className="card-hover"
            style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 20, textAlign: "left", cursor: "pointer", width: "100%" }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 4px" }}>I know the basics</p>
            <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>Take an assessment to find your starting point</p>
          </button>
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
  const [course, setCourse] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const [level, setLevel] = useState("");

  const s = isDark
    ? { bg: "#0f1117", card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4" }
    : { bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

  useEffect(() => {
    getDoc(doc(db, "courses", courseId)).then(snap => {
      if (snap.exists()) setCourse({ id: snap.id, ...snap.data() });
    });
  }, [courseId]);

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
      await updateDoc(doc(db, "users", currentUser.uid), { currentLevel: assignedLevel });
    }
  };

  if (!course) return <div style={{ minHeight: "100vh", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", color: s.muted }}>Loading...</div>;

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
        <button onClick={() => navigate(`/roadmap/${courseId}`)}
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
  const [course, setCourse] = useState(null);
  const [userData, setUserData] = useState(null);
  const [skillRatings, setSkillRatings] = useState([]);

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#0f1117" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f8fafc" };

  useEffect(() => {
    getDoc(doc(db, "courses", courseId)).then(snap => {
      if (snap.exists()) setCourse({ id: snap.id, ...snap.data() });
    }).catch(err => console.error("Error fetching course:", err));
    if (!currentUser) return;
    return onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [courseId, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/difficulty/skill-ratings/${currentUser.uid}`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Failed to fetch skill ratings");
      })
      .then(data => {
        if (data.ratings) {
          setSkillRatings(data.ratings);
        }
      })
      .catch(err => {
        console.warn("Could not load skill ratings from backend:", err);
      });
  }, [currentUser]);

  const enrollment = userData?.enrolledCourses?.find(e => (e.courseId || e) === courseId);
  const completedTopics = enrollment?.completedTopics || [];
  const topics = course?.topics || [];
  const completedCount = completedTopics.length;
  const progressPct = topics.length ? Math.round((completedCount / topics.length) * 100) : 0;
  const currentTopicIndex = completedCount < topics.length ? completedCount : topics.length - 1;

  return (
    <Layout title="Roadmap">
      {!course ? (
        <div style={{ textAlign: "center", padding: 40, color: s.muted }}>Loading...</div>
      ) : (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {/* Course header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <h2 style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 4px" }}>{course.title}</h2>
                <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>
                  {course.level} · {course.lessons} Lessons · {course.weeks} Weeks
                </p>
              </div>
              <button onClick={async () => {
                if (window.confirm(`Are you sure you want to drop ${course.title}?`)) {
                  await dropCourse(currentUser.uid, course.id);
                  navigate("/dashboard");
                }
              }} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}>
                Drop Course
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1, height: 4, background: s.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: "#6366f1", borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#6366f1" }}>{progressPct}%</span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
            <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #6366f1" }}>
              <p style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 1px" }}>{progressPct}%</p>
              <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>Progress</p>
            </div>
            <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #f59e0b" }}>
              <p style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 1px" }}>{userData?.totalPoints || 0}</p>
              <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>Total XP</p>
            </div>
            <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #10b981" }}>
              <p style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 1px" }}>{completedCount}/{topics.length}</p>
              <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>Topics</p>
            </div>
          </div>

          {/* Current task */}
          {topics[currentTopicIndex] && (
            <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <p style={{ color: s.muted, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, margin: "0 0 6px", textTransform: "uppercase" }}>Current Topic</p>
              <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 4px" }}>{topics[currentTopicIndex].title}</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#10b981" }}>+{topics[currentTopicIndex].xp} XP</span>
                <span style={{ fontSize: 11, color: s.muted }}>~20 mins</span>
              </div>
              <button onClick={() => navigate(`/study/${courseId}/${topics[currentTopicIndex].id}`)}
                style={{ padding: "8px 18px", borderRadius: 8, background: "#6366f1", color: "white", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Start
              </button>
            </div>
          )}

          {/* Roadmap timeline */}
          <div>
            <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 14px" }}>Learning Path</p>
            <div style={{ position: "relative", paddingLeft: 36 }}>
              <div style={{ position: "absolute", left: 12, top: 0, bottom: 0, width: 2, background: s.border }} />

              {topics.map((topic, i) => {
                const isComplete = completedTopics.includes(topic.id);
                const isCurrent = i === currentTopicIndex;
                const isLocked = !isComplete && !isCurrent;

                return (
                  <div key={topic.id} style={{ position: "relative", marginBottom: 10 }}>
                    <div style={{
                      position: "absolute", left: -36, top: 12,
                      width: 24, height: 24, borderRadius: "50%",
                      background: isComplete ? "#10b981" : isCurrent ? "#6366f1" : s.card,
                      border: `2px solid ${isComplete ? "#10b981" : isCurrent ? "#6366f1" : s.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1
                    }}>
                      <span style={{ fontSize: 10, color: isComplete || isCurrent ? "white" : s.muted }}>
                        {isComplete ? "✓" : isCurrent ? i + 1 : i + 1}
                      </span>
                    </div>

                    <div style={{
                      background: s.card, border: `1px solid ${isCurrent ? "#6366f1" : s.border}`,
                      borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
                      opacity: isLocked ? 0.5 : 1, cursor: !isLocked ? "pointer" : "default"
                    }}
                      onClick={() => !isLocked && navigate(`/study/${courseId}/${topic.id}`)}>
                      <div>
                        {isCurrent && <span style={{ fontSize: 10, color: "#6366f1", fontWeight: 500 }}>Current</span>}
                        <p style={{ fontWeight: 500, fontSize: 14, color: s.text, margin: 0 }}>{topic.title}</p>
                        {isComplete && <p style={{ fontSize: 11, color: "#10b981", margin: "1px 0 0" }}>Completed</p>}
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
                  const name = ratingObj.name;
                  
                  // Bar width as percentage of 1400 (max expected rating)
                  const percent = Math.min((rating / 1400) * 100, 100);
                  
                  // Bar fill color: green if rating > 1050, indigo if 950-1050, red if below 950
                  let barColor = "#6366f1"; // Indigo
                  if (rating > 1050) barColor = "#10b981"; // Green
                  else if (rating < 950) barColor = "#ef4444"; // Red

                  // Baseline marker at 1000 position
                  const baselinePct = (1000 / 1400) * 100;

                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontWeight: 500, color: s.text, width: 140, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </span>
                      
                      <div style={{ position: "relative", flex: 1, height: 16, background: isDark ? "#2d3748" : "#e2e8f0", borderRadius: 4 }}>
                        {/* Bar fill */}
                        <div style={{
                          width: `${percent}%`,
                          height: "100%",
                          background: barColor,
                          borderRadius: percent >= 100 ? "4px" : "4px 0 0 4px",
                          transition: "width 0.4s"
                        }} />
                        
                        {/* Baseline line */}
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
                        
                        {/* Baseline label */}
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
      )}
    </Layout>
  );
}

export default CourseOnboarding;