import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import {
  doc, getDoc, addDoc, collection, serverTimestamp,
  updateDoc, onSnapshot, query, where, getDocs
} from "firebase/firestore";
import { runPython, askAI, updateDifficulty, checkAchievements, completeTopic, updateStreak } from "../utils/helpers";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import toast from "react-hot-toast";

export default function StudySession() {
  const { courseId, topicId } = useParams();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [problem, setProblem] = useState(null);
  const [userData, setUserData] = useState(null);
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMatched, setIsMatched] = useState(false);
  const [currentSkillRating, setCurrentSkillRating] = useState(1000);
  const [learnerState, setLearnerState] = useState(null);
  const [messagesSinceCheck, setMessagesSinceCheck] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [recentAccuracy, setRecentAccuracy] = useState(0.5);

  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);
  const [isRetry, setIsRetry] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const startTime = useRef(Date.now());

  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [codeResult, setCodeResult] = useState(null);

  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm Aria, your AI study partner. I'm here to help you understand the current topic. Ask me anything!" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const s = isDark
    ? { bg: "#0f1117", card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", input: "#161b27", header: "#161b27" }
    : { bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#f8fafc", header: "#ffffff" };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) setUserData(snap.data());
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (userData && userData.skillRatings && userData.skillRatings[topicId]) {
      setCurrentSkillRating(Math.round(userData.skillRatings[topicId]));
    }
  }, [userData, topicId]);

  const loadNextProblem = async () => {
    setLoading(true);
    setSelected(null);
    setSubmitted(false);
    setShowResult(false);
    setCodeResult(null);
    setScore(null);
    setIsRetry(false);
    startTime.current = Date.now();

    try {
      if (courseId) {
        getDoc(doc(db, "courses", courseId)).then(snap => {
          if (snap.exists()) setCourse({ id: snap.id, ...snap.data() });
        });
      }

      let p = null;
      let matchedToLevel = false;

      if (currentUser?.uid && topicId) {
        try {
          const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/difficulty/next-problem/${currentUser.uid}/${topicId}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.id) {
              p = data;
              matchedToLevel = true;
            }
          }
        } catch (err) {
          console.warn("Backend unreachable, falling back to local query:", err);
        }
      }

      if (!p || !p.id) {
        let level = "easy";
        if (currentUser?.uid) {
          const userSnap = await getDoc(doc(db, "users", currentUser.uid));
          if (userSnap.exists()) level = userSnap.data()?.currentLevel || "easy";
        }

        const allQ = query(collection(db, "problems"), where("courseId", "==", courseId || "python-basics"));
        const allSnap = await getDocs(allQ);
        const allProblems = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const targetNorm = (topicId || "").toLowerCase().replace(/^t0*/, "t");
        const topicMatched = allProblems.filter(prob => {
          const pNorm = (prob.topicId || "").toLowerCase().replace(/^t0*/, "t");
          return pNorm === targetNorm || prob.topicId?.toLowerCase() === topicId?.toLowerCase();
        });

        const levelMatched = topicMatched.filter(prob => prob.difficulty === level);
        const candidates = levelMatched.length > 0 ? levelMatched : topicMatched.length > 0 ? topicMatched : allProblems;

        if (candidates.length > 0) {
          p = candidates[Math.floor(Math.random() * candidates.length)];
        }
      }

      if (p) {
        setProblem(p);
        setIsMatched(matchedToLevel);
        if (p.type === "coding") setCode(p.starterCode || "# Write your code here\n");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load problem");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadNextProblem();
  }, [courseId, topicId, currentUser]);

  const callDifficultyUpdate = async (correct) => {
    try {
      const timeTaken = Math.floor((Date.now() - startTime.current) / 1000);
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/difficulty/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.uid,
          problem_id: problem.id,
          topic_id: topicId,
          correct: correct,
          time_taken: timeTaken,
          hour_of_day: new Date().getHours()
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentSkillRating(Math.round(data.new_skill));
        const change = Math.round(data.skill_change);
        toast(
          (t) => (
            <span>
              Skill rating: {Math.round(data.new_skill)}{" "}
              {change > 0 ? (
                <span style={{ color: "#10b981", fontWeight: "bold" }}>↑ +{change}</span>
              ) : (
                <span style={{ color: "#ef4444", fontWeight: "bold" }}>↓ {Math.abs(change)}</span>
              )}
            </span>
          ),
          { id: "difficulty-update-toast" }
        );
      }
    } catch (err) {
      console.warn("Backend difficulty engine unreachable. Bypassing ratings update:", err);
    }
  };

  const handleMCQSubmit = async () => {
    if (selected === null) return;
    const correct = selected === problem.correctAnswer;
    if (correct && !isRetry) {
      setRecentAccuracy(prev => (prev * 4 + 1) / 5);
    } else if (!correct) {
      setRecentAccuracy(prev => (prev * 4 + 0) / 5);
    }
    const timeTaken = Math.floor((Date.now() - startTime.current) / 1000);
    const earnedScore = correct ? 100 : 0;
    setScore(earnedScore);
    setSubmitted(true);
    setShowResult(true);

    const points = correct ? (isRetry ? 5 : 10) : 0;
    const newTotal = (userData?.totalPoints || 0) + points;

    if (correct) {
      try {
        await completeTopic(currentUser.uid, courseId, topicId);
      } catch (err) {
        console.warn("Failed to complete topic:", err);
      }
    }

    if (points > 0) {
      try {
        await updateDoc(doc(db, "users", currentUser.uid), { totalPoints: newTotal });
        toast.success(`+${points} XP earned!`);
        await updateStreak(currentUser.uid);
      } catch (err) {
        console.warn("Failed to update user points:", err);
      }
    }

    try {
      await addDoc(collection(db, `users/${currentUser.uid}/sessions`), {
        courseId, topicId, problemId: problem.id,
        score: earnedScore, passed: correct, isRetry, timeTaken,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.warn("Failed to save session data:", err);
    }

    try {
      await updateDifficulty(currentUser.uid, earnedScore, isRetry);
    } catch (err) {
      console.warn("Failed to update difficulty:", err);
    }

    try {
      await checkAchievements(currentUser.uid, {
        totalSolved: (userData?.totalSolved || 0) + 1,
        totalPoints: newTotal,
        currentStreak: userData?.currentStreak || 0,
        lastScore: earnedScore,
        lastSolveTime: timeTaken,
        retryPassed: isRetry && correct,
        enrolledCourses: userData?.enrolledCourses || []
      });
    } catch (err) {
      console.warn("Failed to check achievements:", err);
    }

    try {
      await addDoc(collection(db, `users/${currentUser.uid}/notifications`), {
        type: "score",
        message: correct
          ? `Correct! You scored ${earnedScore}% on ${problem.title}`
          : `Incorrect on ${problem.title}. ${isRetry ? "Difficulty adjusted." : "Try again!"}`,
        read: false, timestamp: serverTimestamp()
      });
    } catch (err) {
      console.warn("Failed to send submission notification:", err);
    }

    await callDifficultyUpdate(correct);
  };

  const handleRunCode = async (isSubmit = false) => {
    setRunning(true);
    setOutput("Loading Python runtime...");
    const result = await runPython(code);
    setOutput(result.output);
    setRunning(false);

    if (isSubmit && problem?.type === "coding" && problem?.expectedOutput) {
      const passed = result.output.trim() === problem.expectedOutput.trim();
      setCodeResult(passed);
      await callDifficultyUpdate(passed);
      if (passed) {
         const points = isRetry ? 5 : 10;
        try {
          await completeTopic(currentUser.uid, courseId, topicId);
        } catch (err) {
          console.warn("Failed to complete topic:", err);
        }

        try {
          await updateDoc(doc(db, "users", currentUser.uid), {
            totalPoints: (userData?.totalPoints || 0) + points
          });
          toast.success(`Correct output! +${points} XP`);
          await updateStreak(currentUser.uid);
        } catch (err) {
          console.warn("Failed to update user points for coding:", err);
        }

        try {
          await addDoc(collection(db, `users/${currentUser.uid}/sessions`), {
            courseId, topicId, problemId: problem.id,
            score: 100, passed: true, isRetry,
            timeTaken: Math.floor((Date.now() - startTime.current) / 1000),
            timestamp: serverTimestamp()
          });
        } catch (err) {
          console.warn("Failed to save coding session data:", err);
        }

        try {
          await checkAchievements(currentUser.uid, {
            totalSolved: (userData?.totalSolved || 0) + 1,
            totalPoints: (userData?.totalPoints || 0) + points,
            currentStreak: userData?.currentStreak || 0,
            lastScore: 100
          });
        } catch (err) {
          console.warn("Failed to check achievements for coding:", err);
        }
      } else {
        toast.error("Output doesn't match. Try again!");
      }
    }
  };

  const checkAgentState = async (userMessages) => {
    try {
      const timeTaken = Math.floor((Date.now() - startTime.current) / 1000);
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/agent/classify-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.uid,
          messages: userMessages,
          retries: retryCount,
          time_taken: timeTaken,
          recent_accuracy: recentAccuracy
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLearnerState(data);
        if ((data.action === "decrease_difficulty" || data.action === "increase_difficulty") && data.message) {
          toast(data.message, { duration: 4000 });
        }
        if (data.action === "decrease_difficulty") {
          let newLevel = "easy";
          const currentLevel = userData?.currentLevel || "easy";
          if (currentLevel === "hard") {
            newLevel = "medium";
          } else {
            newLevel = "easy";
          }
          await updateDoc(doc(db, "users", currentUser.uid), { currentLevel: newLevel });
        }
      }
    } catch (err) {
      console.warn("Error calling agent/classify-state:", err);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newHistory = [...messages, { role: "user", content: userMsg }];
    setMessages(newHistory);
    setChatLoading(true);

    const newCount = messagesSinceCheck + 1;
    setMessagesSinceCheck(newCount);
    if (newCount >= 3) {
      setMessagesSinceCheck(0);
      const userMessagesOnly = newHistory
        .filter(m => m.role === "user")
        .map(m => m.content);
      const last4UserMessages = userMessagesOnly.slice(-4);
      checkAgentState(last4UserMessages);
    }

    const topic = course?.topics?.find(t => t.id === topicId);
    const context = {
      name: currentUser?.displayName || "Student",
      topic: topic?.title || topicId,
      level: userData?.currentLevel || "easy",
      lastScore: score || 0
    };

    const reply = await askAI(userMsg, messages, context);
    setMessages(prev => [...prev, { role: "assistant", content: reply }]);

    try {
      await addDoc(collection(db, `users/${currentUser.uid}/chatHistory`), {
        role: "user", content: userMsg, topic: topic?.title, timestamp: serverTimestamp()
      });
      await addDoc(collection(db, `users/${currentUser.uid}/chatHistory`), {
        role: "assistant", content: reply, topic: topic?.title, timestamp: serverTimestamp()
      });
    } catch (dbErr) {
      console.warn("Saving chat history to Firestore failed (bypassing):", dbErr);
    }
    setChatLoading(false);
  };

  const handleRetry = () => {
    setSelected(null);
    setSubmitted(false);
    setScore(null);
    setShowResult(false);
    setIsRetry(true);
    setRetryCount(prev => prev + 1);
    startTime.current = Date.now();
  };

  const currentTopic = course?.topics?.find(t => t.id === topicId);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: s.muted, fontSize: 14 }}>Loading study session...</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: s.bg, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ background: s.header, borderBottom: `1px solid ${s.border}`, padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => navigate(`/roadmap/${courseId}`)}
            style={{ background: "transparent", border: "none", color: s.muted, cursor: "pointer", fontSize: 14 }}>
            ← Back
          </button>
          <div style={{ width: 1, height: 20, background: s.border }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>
              {course?.title} · {currentTopic?.title || topicId}
            </p>
            <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>{problem?.type === "coding" ? "Coding Challenge" : "Multiple Choice"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: "rgba(99,102,241,0.15)", color: "#6366f1", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
            Skill: {currentSkillRating}
          </span>
          <span style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
            {userData?.currentLevel || "easy"}
          </span>
          {learnerState && learnerState.sentiment && (
            <span style={{
              background:
                learnerState.sentiment === "confident" ? "rgba(16,185,129,0.15)" :
                learnerState.sentiment === "neutral" ? "rgba(99,102,241,0.15)" :
                learnerState.sentiment === "frustrated" ? "rgba(239,68,68,0.15)" :
                learnerState.sentiment === "confused" ? "rgba(245,158,11,0.15)" :
                "transparent",
              color:
                learnerState.sentiment === "confident" ? "#34d399" :
                learnerState.sentiment === "neutral" ? "#818cf8" :
                learnerState.sentiment === "frustrated" ? "#f87171" :
                learnerState.sentiment === "confused" ? "#fbbf24" :
                "inherit",
              padding: "3px 10px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500
            }}>
              {
                learnerState.sentiment === "confident" ? "Confident" :
                learnerState.sentiment === "neutral" ? "Steady" :
                learnerState.sentiment === "frustrated" ? "Struggling" :
                learnerState.sentiment === "confused" ? "Needs help" :
                learnerState.sentiment
              }
            </span>
          )}
          <span style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
            +{currentTopic?.xp || 70} XP
          </span>
        </div>
      </header>

      {/* Main split layout */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "calc(100vh - 49px)" }}>

        {/* TOP HALF - Problem + Code Editor */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, minHeight: 0, borderBottom: `1px solid ${s.border}` }}>

          {/* LEFT: Problem */}
          <div style={{ borderRight: `1px solid ${s.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${s.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: problem?.type === "coding" ? "rgba(15,155,142,0.1)" : "rgba(99,102,241,0.1)", color: problem?.type === "coding" ? "#0f9b8e" : "#6366f1", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
                {problem?.type === "coding" ? "Coding" : "MCQ"}
              </span>
              {isMatched && (
                <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                  Matched to your level
                </span>
              )}
              <span style={{ color: s.muted, fontSize: 13 }}>{problem?.title}</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
              {!problem ? (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <p style={{ color: s.muted }}>No problems found for this level.</p>
                </div>
              ) : (
                <>
                  <p style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 14px", lineHeight: 1.6 }}>
                    {problem.question || (problem.description?.split("```")[0])}
                  </p>

                  {(problem.referenceSolution || problem.description?.includes("```")) && (
                    <pre style={{ background: "#0d1117", border: `1px solid ${s.border}`, borderRadius: 6, padding: 12, fontFamily: "monospace", fontSize: 13, color: "#e2e8f0", overflowX: "auto", marginBottom: 16, lineHeight: 1.6 }}>
                      {problem.referenceSolution || problem.description?.split("```")[1]?.replace(/python\n?/, "")}
                    </pre>
                  )}

                  {/* MCQ Options */}
                  {(problem.type !== "coding" || problem.options?.length > 0) && !showResult && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                      {problem.options?.map((opt, i) => {
                        const isSelected = selected === i;
                        return (
                          <button key={i} onClick={() => !submitted && setSelected(i)}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 8, border: `1px solid ${isSelected ? "#6366f1" : s.border}`, background: isSelected ? "rgba(99,102,241,0.08)" : "transparent", color: s.text, cursor: submitted ? "default" : "pointer", textAlign: "left", width: "100%", fontSize: 14 }}>
                            <span style={{ width: 24, height: 24, borderRadius: "50%", background: isSelected ? "#6366f1" : s.border, color: isSelected ? "white" : s.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                              {["A","B","C","D"][i]}
                            </span>
                            <span style={{ fontFamily: String(opt).includes("def ") || String(opt).includes("range") || String(opt).includes("[") ? "monospace" : "inherit" }}>{opt}</span>
                          </button>
                        );
                      })}
                      {selected !== null && (
                        <button onClick={handleMCQSubmit}
                          style={{ marginTop: 6, padding: "10px", borderRadius: 8, background: "#6366f1", color: "white", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%" }}>
                          Submit Answer
                        </button>
                      )}
                    </div>
                  )}

                  {/* MCQ Result */}
                  {showResult && (problem.type !== "coding" || problem.options?.length > 0) && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                        {problem.options?.map((opt, i) => {
                          const isCorrect = i === problem.correctAnswer;
                          const isSelected = i === selected;
                          let border = s.border;
                          let bg = "transparent";
                          if (isCorrect) { bg = "rgba(16,185,129,0.08)"; border = "#10b981"; }
                          else if (isSelected && !isCorrect) { bg = "rgba(239,68,68,0.08)"; border = "#ef4444"; }
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, border: `1px solid ${border}`, background: bg }}>
                              <span style={{ width: 22, height: 22, borderRadius: "50%", background: isCorrect ? "#10b981" : isSelected ? "#ef4444" : s.border, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
                                {isCorrect ? "✓" : isSelected ? "✗" : ["A","B","C","D"][i]}
                              </span>
                              <span style={{ fontSize: 14, color: s.text }}>{opt}</span>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ background: score === 100 ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${score === 100 ? "#10b981" : "#ef4444"}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                        <p style={{ fontWeight: 600, fontSize: 14, color: score === 100 ? "#10b981" : "#ef4444", margin: "0 0 4px" }}>
                          {score === 100 ? "Correct!" : "Incorrect"}
                        </p>
                        <p style={{ fontSize: 13, color: s.muted, margin: 0, lineHeight: 1.5 }}>{problem.explanation}</p>
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        {score < 100 && !isRetry && (
                          <button onClick={handleRetry}
                            style={{ flex: 1, padding: "9px", borderRadius: 8, background: "transparent", color: s.muted, border: `1px solid ${s.border}`, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                            Try Again
                          </button>
                        )}
                        <button onClick={loadNextProblem}
                          style={{ flex: 1, padding: "9px", borderRadius: 8, background: "#6366f1", color: "white", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                          Next Question
                        </button>
                        <button onClick={() => navigate(`/roadmap/${courseId}`)}
                          style={{ flex: 1, padding: "9px", borderRadius: 8, background: "transparent", color: s.muted, border: `1px solid ${s.border}`, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                          Roadmap
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Coding result */}
                  {problem.type === "coding" && codeResult !== null && (
                    <div style={{ marginTop: 10, background: codeResult ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${codeResult ? "#10b981" : "#ef4444"}`, borderRadius: 8, padding: 12 }}>
                      <p style={{ fontWeight: 600, color: codeResult ? "#10b981" : "#ef4444", margin: "0 0 4px", fontSize: 13 }}>
                        {codeResult ? "Correct output!" : "Output doesn't match"}
                      </p>
                      {!codeResult && problem.expectedOutput && (
                        <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>Expected: <code>{problem.expectedOutput}</code></p>
                      )}
                      {codeResult && (
                        <button onClick={() => navigate(`/roadmap/${courseId}`)}
                          style={{ marginTop: 8, padding: "8px 16px", borderRadius: 6, background: "#6366f1", color: "white", border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                          Continue
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT: Code Editor */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "#0d1117" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #2d3748", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#161b27" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 500 }}>Python 3</span>
                <span style={{ fontSize: 12, color: "#4a5568" }}>|</span>
                <span style={{ fontSize: 12, color: "#8892a4" }}>Editor</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setCode(problem?.starterCode || "# Write your code here\n")}
                  style={{ padding: "4px 10px", borderRadius: 6, background: "transparent", color: "#8892a4", border: "1px solid #2d3748", fontSize: 11, cursor: "pointer" }}>
                  Reset
                </button>
                <button onClick={() => handleRunCode(false)} disabled={running}
                  style={{ padding: "4px 14px", borderRadius: 6, background: running ? "#2d3748" : "#6366f1", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: running ? "not-allowed" : "pointer" }}>
                  {running ? "Running..." : "Run"}
                </button>
                {problem?.type === "coding" && (
                  <button onClick={() => handleRunCode(true)}
                    style={{ padding: "4px 14px", borderRadius: 6, background: "#0f9b8e", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    Submit
                  </button>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto" }}>
              <CodeMirror
                value={code}
                height="100%"
                theme="dark"
                extensions={[python()]}
                onChange={val => setCode(val)}
                style={{ height: "100%", fontSize: 14 }}
              />
            </div>

            <div style={{ height: 110, borderTop: "1px solid #2d3748", background: "#0a0d14", padding: "8px 12px", overflow: "auto" }}>
              <span style={{ fontSize: 10, color: "#4a5568", fontWeight: 600, letterSpacing: 0.8 }}>OUTPUT</span>
              <pre style={{ fontFamily: "monospace", fontSize: 13, color: output?.includes("Error") || output?.includes("Traceback") ? "#ef4444" : "#10b981", margin: "4px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {output || <span style={{ color: "#4a5568" }}>Run your code to see output...</span>}
              </pre>
            </div>
          </div>
        </div>

        {/* BOTTOM HALF - AI Chatbot */}
        <div style={{ height: "35%", minHeight: 200, display: "flex", flexDirection: "column", background: s.card, borderTop: `1px solid ${s.border}` }}>
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${s.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 13, color: s.text, margin: 0 }}>AI Tutor — Aria</p>
              <span style={{ fontSize: 11, color: "#10b981" }}>Online</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {["Explain this", "Give an example", "Quiz me"].map(q => (
                <button key={q} onClick={() => setChatInput(q)}
                  style={{ padding: "3px 8px", borderRadius: 4, background: "transparent", border: `1px solid ${s.border}`, color: s.muted, fontSize: 11, cursor: "pointer" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>
                <div style={{
                  maxWidth: "80%", padding: "8px 12px", borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  background: msg.role === "user" ? "#6366f1" : s.bg,
                  border: msg.role === "user" ? "none" : `1px solid ${s.border}`,
                  color: msg.role === "user" ? "white" : s.text, fontSize: 13, lineHeight: 1.5
                }}>
                  {msg.content.split("```").map((part, j) => (
                    j % 2 === 0
                      ? <span key={j}>{part}</span>
                      : <pre key={j} style={{ background: "#0d1117", border: "1px solid #2d3748", borderRadius: 4, padding: "6px 8px", fontFamily: "monospace", fontSize: 12, color: "#e2e8f0", overflowX: "auto", margin: "4px 0", whiteSpace: "pre-wrap" }}>{part.replace(/^python\n/, "")}</pre>
                  ))}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ padding: "8px 12px", borderRadius: "12px 12px 12px 4px", background: s.bg, border: `1px solid ${s.border}`, color: s.muted, fontSize: 13, maxWidth: "60%" }}>
                Aria is thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ padding: "8px 14px", borderTop: `1px solid ${s.border}`, display: "flex", gap: 6 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChat()}
              placeholder={`Ask Aria about ${currentTopic?.title || "this topic"}...`}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${s.border}`, background: s.bg, color: s.text, fontSize: 13, outline: "none" }}
            />
            <button onClick={handleChat} disabled={chatLoading || !chatInput.trim()}
              style={{ padding: "8px 14px", borderRadius: 8, background: chatInput.trim() ? "#6366f1" : s.border, color: "white", border: "none", cursor: chatInput.trim() ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600 }}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
