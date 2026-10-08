import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDocs
} from "firebase/firestore";
import Layout from "../components/Layout";
import toast from "react-hot-toast";
import { openGoogleCalendarEvent, downloadIcsFile } from "../utils/calendarSync";
import { COURSES_DATA } from "../firebase/seedData";

const EVENT_COLORS = { competition: "#ef4444", deadline: "#f59e0b", exam: "#3b82f6", other: "#6b7280" };

// Helper to extract numeric Elo rating for any topic
const getTopicElo = (topic, ratings = {}) => {
  if (!topic) return 1000;
  const tId = (topic.id || "").toLowerCase();
  const tTitle = (topic.title || topic.label || "").toLowerCase();

  if (ratings[topic.id] !== undefined) return Number(ratings[topic.id]);
  if (ratings[tId] !== undefined) return Number(ratings[tId]);
  if (ratings[tTitle] !== undefined) return Number(ratings[tTitle]);

  const cleanTitle = tTitle.replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(ratings)) {
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanK === cleanTitle || cleanK === tId || cleanTitle.includes(cleanK) || cleanK.includes(cleanTitle)) {
      return Number(v);
    }
  }
  return 1000;
};

// Helper: Determine tailored difficulty based on Elo rating
const getDifficultyFromElo = (elo) => {
  if (elo < 900) {
    return { level: "Easy", label: "🟢 Easy (Foundational)", color: "#10b981", bg: "rgba(16,185,129,0.12)" };
  }
  if (elo <= 1100) {
    return { level: "Medium", label: "🟡 Medium (Core)", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  }
  return { level: "Hard", label: "🔴 Hard (Advanced)", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
};

// Helper: Determine recommended pace based on Elo and timeline
const getPaceFromElo = (elo, daysLeft = 14, topicCount = 5) => {
  const ratio = daysLeft / Math.max(1, topicCount);
  if (elo < 950 || ratio < 2) {
    return {
      pace: "Intensive Pace",
      tag: "⚡ Intensive Pace",
      desc: "Extra drill sessions & frequent reinforcement",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.1)"
    };
  }
  if (elo <= 1100) {
    return {
      pace: "Steady Pace",
      tag: "⏱️ Steady Pace",
      desc: "Balanced rhythm & regular practice",
      color: "#6366f1",
      bg: "rgba(99,102,241,0.1)"
    };
  }
  return {
    pace: "Accelerated Pace",
    tag: "🚀 Accelerated Pace",
    desc: "Fast mastery with advanced problem load",
    color: "#10b981",
    bg: "rgba(16,185,129,0.1)"
  };
};

export default function GoalPlanner() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  // User Profile & Skill Data
  const [userData, setUserData] = useState(null);
  const [skillRatings, setSkillRatings] = useState({});
  const [availableCourses, setAvailableCourses] = useState(COURSES_DATA);
  const [selectedCourseId, setSelectedCourseId] = useState("python-basics");

  // Plan Mode: "adaptive" (Adaptive Learning Engine) vs "custom" (User's Own Plan)
  const [planMode, setPlanMode] = useState("adaptive");

  // Goal Form State
  const [goalTitle, setGoalTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [hoursPerDay, setHoursPerDay] = useState(1.0);
  const [questionsPerSession, setQuestionsPerSession] = useState(22);
  const [loading, setLoading] = useState(false);
  const [planResult, setPlanResult] = useState(null);

  // Calibration helper: maps study hours to questions per session
  // e.g. 30 mins (0.5h) -> 12 questions (range: 10-15)
  //      1 hour (1.0h) -> 22 questions (range: 20-25)
  const calcQuestionsFromHours = (hrs) => {
    if (hrs <= 0.6) return 12; // ~30 mins
    if (hrs <= 0.9) return 16; // ~45 mins
    if (hrs <= 1.2) return 22; // ~1 hour
    if (hrs <= 1.7) return 30; // ~1.5 hours
    return Math.min(50, Math.round(hrs * 20)); // ~2+ hours
  };

  const handleHoursChange = (newHours) => {
    setHoursPerDay(newHours);
    setQuestionsPerSession(calcQuestionsFromHours(newHours));
  };

  // Calendar Events State
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState("competition");
  const [eventNotes, setEventNotes] = useState("");
  const [events, setEvents] = useState([]);
  const [syncGoogle, setSyncGoogle] = useState(true);

  // Existing Plans
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  const isGoogleConnected =
    currentUser?.providerData?.some((p) => p.providerId === "google.com") ||
    currentUser?.email?.includes("@gmail.com");

  const s = isDark
    ? {
        card: "#1a1f2e",
        border: "#2d3748",
        text: "#f0f4ff",
        muted: "#8892a4",
        bg: "#0f1117",
        input: "#161b27",
        cardSub: "#141824",
        accent: "#6366f1",
        accentBg: "rgba(99,102,241,0.15)"
      }
    : {
        card: "#ffffff",
        border: "#e2e8f0",
        text: "#0f172a",
        muted: "#64748b",
        bg: "#f8fafc",
        input: "#f8fafc",
        cardSub: "#f1f5f9",
        accent: "#6366f1",
        accentBg: "rgba(99,102,241,0.08)"
      };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  // 1. Listen to User Document for enrolled courses and skill ratings
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(
      doc(db, "users", currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          const uData = snap.data();
          setUserData(uData);
          if (uData.skillRatings) {
            const raw = { ...uData.skillRatings };
            ["variables", "loops", "functions", "lists", "dictionaries", "files", "oop"].forEach(k => delete raw[k]);
            setSkillRatings(raw);
          }
        }
      },
      (err) => console.warn("Failed to listen to user data:", err)
    );
    return () => unsub();
  }, [currentUser]);

  // 2. Fetch courses from Firestore or fallback to COURSES_DATA
  useEffect(() => {
    getDocs(collection(db, "courses"))
      .then((snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setAvailableCourses(list);
        }
      })
      .catch(() => {});
  }, []);

  // 3. Resolve user's enrolled courses
  const enrolledCourses = useMemo(() => {
    const enrolledRaw = userData?.enrolledCourses || [];
    const enrolledIds = enrolledRaw.map((e) => (typeof e === "string" ? e : e?.courseId)).filter(Boolean);

    // If user has specific enrollments, find matching courses
    const matched = availableCourses.filter((c) => enrolledIds.includes(c.id));
    if (matched.length > 0) return matched;

    // Default fallback to first course or python-basics
    const def = availableCourses.find((c) => c.id === "python-basics") || availableCourses[0];
    return def ? [def] : COURSES_DATA;
  }, [userData, availableCourses]);

  // Keep selectedCourseId valid
  useEffect(() => {
    if (enrolledCourses.length > 0) {
      const exists = enrolledCourses.some((c) => c.id === selectedCourseId);
      if (!exists) {
        setSelectedCourseId(enrolledCourses[0].id);
      }
    }
  }, [enrolledCourses, selectedCourseId]);

  // Active selected enrolled course
  const currentCourse = useMemo(() => {
    return (
      enrolledCourses.find((c) => c.id === selectedCourseId) ||
      availableCourses.find((c) => c.id === selectedCourseId) ||
      COURSES_DATA[0]
    );
  }, [enrolledCourses, availableCourses, selectedCourseId]);

  // All topics of the active enrolled course
  const courseTopics = useMemo(() => {
    return currentCourse?.topics || [];
  }, [currentCourse]);

  // Auto-fill topics when course changes or in adaptive mode
  useEffect(() => {
    if (courseTopics.length > 0) {
      if (planMode === "adaptive") {
        // In adaptive mode, all topics are active
        setSelectedTopics(courseTopics.map((t) => t.id));
      } else if (selectedTopics.length === 0) {
        // Pre-select first 3 topics for custom mode convenience
        setSelectedTopics(courseTopics.slice(0, 3).map((t) => t.id));
      }
    }
  }, [currentCourse, planMode, courseTopics]);

  // Default suggested goal title
  useEffect(() => {
    if (!goalTitle && currentCourse) {
      setGoalTitle(`Master ${currentCourse.title || "Course"} by deadline`);
    }
  }, [currentCourse, goalTitle]);

  // Set default deadline 2 weeks out if empty
  useEffect(() => {
    if (!deadline) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setDeadline(d.toISOString().split("T")[0]);
    }
  }, [deadline]);

  // Fetch events from backend
  useEffect(() => {
    if (!currentUser) return;
    fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/events/${currentUser.uid}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(d.events || []))
      .catch(() => {});
  }, [currentUser]);

  // Fetch existing study plans from Firestore
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, `users/${currentUser.uid}/studyPlans`),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      const loadedPlans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPlans(loadedPlans);

      // Auto-restore most recent plan if nothing is currently selected
      if (!planResult && loadedPlans.length > 0) {
        const latest = loadedPlans[0];
        if (latest && latest.schedule) {
          setSelectedPlanId(latest.id);
          setPlanResult({
            id: latest.id,
            goal_title: latest.goal_title,
            plan_mode: latest.plan_mode || "custom",
            course_id: latest.course_id || "python-basics",
            sessions_created: latest.sessions_created || latest.schedule?.length || 0,
            days_remaining: latest.deadline
              ? Math.max(0, Math.ceil((new Date(latest.deadline) - new Date()) / (1000 * 60 * 60 * 24)))
              : 0,
            schedule: latest.schedule || []
          });
        }
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const activeGoalPlan = userData?.activeGoalPlan || null;

  const selectPlan = (p) => {
    setSelectedPlanId(p.id);
    const qCount = p.questions_per_session || calcQuestionsFromHours(p.available_hours || 1.0);
    setPlanResult({
      id: p.id,
      goal_title: p.goal_title,
      plan_mode: p.plan_mode || "custom",
      course_id: p.course_id || "python-basics",
      sessions_created: p.sessions_created || p.schedule?.length || 0,
      days_remaining: p.deadline
        ? Math.max(0, Math.ceil((new Date(p.deadline) - new Date()) / (1000 * 60 * 60 * 24)))
        : 0,
      available_hours: p.available_hours || 1.0,
      questions_per_session: qCount,
      selected_topics: p.topic_ids || p.selected_topics || p.topics || [],
      schedule: p.schedule || []
    });
    toast.success(`Loaded plan: "${p.goal_title}"`);
  };

  const activatePlan = async (planToActivate) => {
    if (!currentUser || !planToActivate) return;
    const planId = planToActivate.id || selectedPlanId || `plan_${Date.now()}`;
    const qCount = planToActivate.questions_per_session || questionsPerSession;
    const planModeToSet = planToActivate.plan_mode || planMode;
    const courseIdToSet = planToActivate.course_id || currentCourse.id || "python-basics";
    const selectedTopicIds = planModeToSet === "adaptive"
      ? courseTopics.map(t => t.id)
      : (planToActivate.selected_topics || planToActivate.topic_ids || (selectedTopics.length > 0 ? selectedTopics : courseTopics.map(t => t.id)));
    const selectedTopicTitles = courseTopics
      .filter(t => selectedTopicIds.includes(t.id))
      .map(t => t.title);

    const activePayload = {
      id: planId,
      goal_title: planToActivate.goal_title || goalTitle || "Study Plan",
      deadline: planToActivate.deadline || deadline,
      plan_mode: planModeToSet,
      course_id: courseIdToSet,
      selected_topics: selectedTopicIds,
      selected_topic_titles: selectedTopicTitles,
      available_hours: planToActivate.available_hours || hoursPerDay,
      questions_per_session: qCount,
      sessions_created: planToActivate.sessions_created || planToActivate.schedule?.length || 0,
      activated_at: new Date().toISOString()
    };

    try {
      await updateDoc(doc(db, "users", currentUser.uid), { activeGoalPlan: activePayload });
      if (planToActivate.id) {
        fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/set-active-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: currentUser.uid, plan_id: planToActivate.id })
        }).catch(() => {});
      }
      toast.success(`🎯 "${activePayload.goal_title}" set as active course goal!`);
    } catch (err) {
      console.error("Failed to activate plan:", err);
      toast.error("Could not activate plan.");
    }
  };

  const dropActiveGoal = async () => {
    if (!window.confirm("Drop your active goal plan? Your course roadmap will revert to the standard course curriculum.")) return;
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { activeGoalPlan: null });
      fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/drop-active-plan/${currentUser.uid}`, { method: "POST" }).catch(() => {});
      toast.success("🚫 Goal dropped! Your course roadmap is back to standard sequence.");
    } catch (err) {
      toast.error("Could not drop goal plan.");
    }
  };

  const deletePlanItem = async (planId) => {
    if (!window.confirm("Delete this study plan from your history?")) return;
    try {
      await deleteDoc(doc(db, `users/${currentUser.uid}/studyPlans`, planId));
      if (activeGoalPlan?.id === planId) {
        await updateDoc(doc(db, "users", currentUser.uid), { activeGoalPlan: null });
      }
      fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/delete-plan/${currentUser.uid}/${planId}`, { method: "DELETE" }).catch(() => {});
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      if (selectedPlanId === planId) {
        setSelectedPlanId(null);
        setPlanResult(null);
      }
      toast.success("Study plan removed.");
    } catch (err) {
      toast.error("Could not delete plan.");
    }
  };

  const toggleTopic = (id) => {
    setSelectedTopics((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const selectAllTopics = () => {
    setSelectedTopics(courseTopics.map((t) => t.id));
  };

  const selectWeakTopics = () => {
    const weak = courseTopics.filter((t) => getTopicElo(t, skillRatings) < 1000).map((t) => t.id);
    if (weak.length === 0) {
      toast("No low-Elo topics found! Selecting all foundational topics.", { icon: "ℹ️" });
      setSelectedTopics(courseTopics.slice(0, 4).map((t) => t.id));
    } else {
      setSelectedTopics(weak);
      toast.success(`Selected ${weak.length} weaker topics for targeted practice`);
    }
  };

  const clearTopics = () => {
    setSelectedTopics([]);
  };

  // Client-Side Elo-based schedule generator (acts as 100% resilient fallback)
  const generateClientSchedule = (activeTopicObjs, daysLeft) => {
    let sorted = [...activeTopicObjs];
    if (planMode === "adaptive") {
      // Sort lowest Elo (weakest) first
      sorted.sort((a, b) => getTopicElo(a, skillRatings) - getTopicElo(b, skillRatings));
    }

    const sessionsPerTopic = Math.max(1, Math.floor(daysLeft / Math.max(1, sorted.length)));
    const schedule = [];
    const current = new Date();
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);

    let topicIdx = 0;
    let topicCount = 0;
    const deadlineObj = new Date(deadline + "T23:59:59");

    while (current <= deadlineObj && topicIdx < sorted.length) {
      if (current.getDay() !== 0) {
        // Skip Sundays
        const currTopic = sorted[topicIdx];
        const tElo = Math.round(getTopicElo(currTopic, skillRatings));
        const diffInfo = getDifficultyFromElo(tElo);
        const paceInfo = getPaceFromElo(tElo, daysLeft, sorted.length);

        let targetCount = sessionsPerTopic;
        if (planMode === "adaptive" && tElo < 990) {
          targetCount = Math.min(sessionsPerTopic + 1, 4);
        }

        const dateStr = current.toISOString().split("T")[0];
        const endH = 9 + Math.floor(hoursPerDay);
        const endHourStr = String(endH).padStart(2, "0");

        schedule.push({
          date: dateStr,
          topic: currTopic.title || currTopic.label || currTopic.id,
          topic_id: currTopic.id,
          title: `DevLingo: ${currTopic.title || currTopic.label || currTopic.id}`,
          start: `${dateStr}T09:00:00`,
          end: `${dateStr}T${endHourStr}:00:00`,
          completed: false,
          elo: tElo,
          difficulty: diffInfo.level,
          pace: paceInfo.pace,
          plan_mode: planMode,
          course_id: currentCourse.id,
          questions_per_session: questionsPerSession,
          focus:
            planMode === "adaptive" && tElo < 1000
              ? "Priority Focus (Weak Topic)"
              : "Targeted Mastery"
        });

        topicCount++;
        if (topicCount >= targetCount) {
          topicIdx++;
          topicCount = 0;
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return schedule;
  };

  const createPlan = async () => {
    if (!goalTitle.trim()) return toast.error("Please enter a goal title");
    if (!deadline) return toast.error("Please select a deadline");

    // In adaptive mode, all course topics are used.
    // In custom mode, only user-selected topics are used.
    const activeTopicObjects =
      planMode === "adaptive"
        ? courseTopics
        : courseTopics.filter((t) => selectedTopics.includes(t.id));

    if (activeTopicObjects.length === 0) {
      return toast.error("Please select at least one topic for your plan");
    }

    const activeTopicIdentifiers = activeTopicObjects.map((t) => t.title || t.id);
    const activeTopicIds = activeTopicObjects.map((t) => t.id);

    setLoading(true);

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline + "T00:00:00");
    const daysLeft = Math.max(1, Math.ceil((deadlineDate - todayDate) / (1000 * 60 * 60 * 24)));

    let createdPlanData = null;

    // 1. Try Backend API first
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/create-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.uid,
          goal_title: goalTitle,
          deadline,
          topics: activeTopicIdentifiers,
          topic_ids: activeTopicIds,
          available_hours: hoursPerDay,
          questions_per_session: questionsPerSession,
          plan_mode: planMode,
          course_id: currentCourse.id,
          set_as_active: true
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && !data.error && data.schedule) {
          createdPlanData = data;
        }
      }
    } catch (err) {
      console.warn("Backend scheduling API unreachable, using resilient client generator:", err);
    }

    // 2. Fallback to resilient client-side generation if backend was offline
    if (!createdPlanData) {
      const fallbackSchedule = generateClientSchedule(activeTopicObjects, daysLeft);
      const planDoc = {
        goal_title: goalTitle,
        deadline,
        topics: activeTopicIdentifiers,
        topic_ids: activeTopicIds,
        available_hours: hoursPerDay,
        questions_per_session: questionsPerSession,
        plan_mode: planMode,
        course_id: currentCourse.id,
        sessions_created: fallbackSchedule.length,
        schedule: fallbackSchedule,
        timestamp: serverTimestamp()
      };

      try {
        const docRef = await addDoc(collection(db, `users/${currentUser.uid}/studyPlans`), planDoc);
        createdPlanData = {
          id: docRef.id,
          goal_title: goalTitle,
          plan_mode: planMode,
          course_id: currentCourse.id,
          available_hours: hoursPerDay,
          questions_per_session: questionsPerSession,
          sessions_created: fallbackSchedule.length,
          days_remaining: daysLeft,
          schedule: fallbackSchedule,
          status: "success"
        };
      } catch (firestoreErr) {
        console.error("Failed to save plan to Firestore:", firestoreErr);
        toast.error("Could not save plan. Please check your connection.");
        setLoading(false);
        return;
      }
    }

    setPlanResult(createdPlanData);
    if (createdPlanData.id) setSelectedPlanId(createdPlanData.id);
    
    // Automatically set the new plan as the user's active goal
    await activatePlan(createdPlanData);

    toast.success(
      `Plan created & set as active goal with ${createdPlanData.sessions_created || createdPlanData.schedule?.length} sessions! 🎉`
    );
    setLoading(false);
  };

  const toggleSessionComplete = async (idx) => {
    if (!planResult || !planResult.schedule) return;
    const updated = [...planResult.schedule];
    updated[idx] = { ...updated[idx], completed: !updated[idx].completed };
    setPlanResult((prev) => ({ ...prev, schedule: updated }));

    // Persist to Firestore if we have a plan ID
    if (selectedPlanId && currentUser) {
      try {
        const planRef = doc(db, `users/${currentUser.uid}/studyPlans`, selectedPlanId);
        await updateDoc(planRef, { schedule: updated });
        toast.success(updated[idx].completed ? "Session marked complete! 🎉" : "Session marked pending");
      } catch (e) {
        console.warn("Could not update session in Firestore:", e);
      }

      // Notify backend if available
      if (updated[idx].completed) {
        fetch(
          `${process.env.REACT_APP_BACKEND_URL}/scheduling/mark-complete/${currentUser.uid}/${selectedPlanId}/${updated[idx].date}`,
          { method: "POST" }
        ).catch(() => {});
      }
    }
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

      const createdTitle = eventTitle;
      const createdDate = eventDate;
      const createdType = eventType;
      const createdNotes = eventNotes;

      setEventTitle("");
      setEventDate("");
      setEventNotes("");

      if (syncGoogle) {
        openGoogleCalendarEvent({
          title: `DevLingo: ${createdTitle} (${createdType})`,
          startDate: createdDate,
          details: `Type: ${createdType}\nNotes: ${createdNotes || "None"}\nPlatform: DevLingo`,
          location: "DevLingo App"
        });
        toast.success("Event added & opened in Google Calendar to sync with your phone!");
      } else {
        toast.success("Event added!");
      }

      // Refresh events
      const evRes = await fetch(`${process.env.REACT_APP_BACKEND_URL}/scheduling/events/${currentUser.uid}`);
      if (evRes.ok) {
        const d = await evRes.json();
        setEvents(d.events || []);
      }
    } catch (e) {
      toast.error("Could not add event");
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${s.border}`,
    background: s.input,
    color: s.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box"
  };

  // Calculations for Custom Plan Live Preview
  const customSelectedObjs = useMemo(() => {
    return courseTopics.filter((t) => selectedTopics.includes(t.id));
  }, [courseTopics, selectedTopics]);

  const avgElo = useMemo(() => {
    const list = planMode === "adaptive" ? courseTopics : customSelectedObjs;
    if (list.length === 0) return 1000;
    const sum = list.reduce((acc, t) => acc + getTopicElo(t, skillRatings), 0);
    return Math.round(sum / list.length);
  }, [planMode, courseTopics, customSelectedObjs, skillRatings]);

  const overallDifficulty = useMemo(() => getDifficultyFromElo(avgElo), [avgElo]);
  const overallPace = useMemo(() => {
    const dLeft = deadline
      ? Math.max(1, Math.ceil((new Date(deadline + "T00:00:00") - new Date()) / (1000 * 60 * 60 * 24)))
      : 14;
    const count = planMode === "adaptive" ? courseTopics.length : customSelectedObjs.length;
    return getPaceFromElo(avgElo, dLeft, count);
  }, [avgElo, deadline, planMode, courseTopics, customSelectedObjs]);

  const canSubmit =
    goalTitle.trim() &&
    deadline &&
    (planMode === "adaptive" ? courseTopics.length > 0 : selectedTopics.length > 0) &&
    !loading;

  return (
    <Layout title="Goal Planner">
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 24, color: s.text, margin: "0 0 6px" }}>
                🎯 Smart Goal Planner & Scheduling
              </h2>
              <p style={{ color: s.muted, fontSize: 14, margin: 0 }}>
                Build an adaptive study plan tailored to your enrolled courses, target deadlines, and live Elo ratings.
              </p>
            </div>
            {isGoogleConnected && (
              <span
                style={{
                  fontSize: 12,
                  color: "#10b981",
                  background: "rgba(16,185,129,0.12)",
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6
                }}
              >
                <span>✓</span> Google Account Connected
              </span>
            )}
          </div>
        </div>

        {/* Active Goal Plan Status Banner */}
        {activeGoalPlan ? (
          <div
            style={{
              background: isDark ? "rgba(16,185,129,0.1)" : "rgba(16,185,129,0.08)",
              border: "1px solid #10b981",
              borderRadius: 14,
              padding: "16px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 14
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>🟢</span>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "#10b981", background: "rgba(16,185,129,0.18)", padding: "2px 8px", borderRadius: 4 }}>
                  Active Course Goal
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.text }}>
                  "{activeGoalPlan.goal_title}"
                </span>
              </div>
              <p style={{ fontSize: 13, color: s.muted, margin: 0 }}>
                Course: <strong>{activeGoalPlan.course_id || "python-basics"}</strong>
                {" · "}Strategy: <strong style={{ color: activeGoalPlan.plan_mode === "adaptive" ? "#818cf8" : "#0d9488" }}>
                  {activeGoalPlan.plan_mode === "adaptive" ? "🤖 AI Adaptive Engine (All topics)" : `🎯 Custom Plan (${activeGoalPlan.selected_topics?.length || 0} topics)`}
                </strong>
                {" · "}Pace: <strong>{activeGoalPlan.available_hours || 1}h daily</strong>
                {" · "}Questions: <strong style={{ color: "#6366f1" }}>{activeGoalPlan.questions_per_session || 22} Qs/session</strong>
                {" · "}Deadline: <strong>{activeGoalPlan.deadline || "None"}</strong>
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={dropActiveGoal}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  background: "rgba(239,68,68,0.12)",
                  color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.25)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.2s"
                }}
              >
                🚫 Drop Goal Plan
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: s.cardSub,
              border: `1px solid ${s.border}`,
              borderRadius: 12,
              padding: "12px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              fontSize: 13,
              color: s.muted
            }}
          >
            <span>ℹ️ No active goal plan selected. Your course roadmap follows the standard sequential curriculum.</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6366f1" }}>Generate or activate a plan below to focus your path</span>
          </div>
        )}

        {/* 1. Enrolled Course Selector */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: s.text, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              📚 Enrolled Course Curriculum
            </label>
            <span style={{ fontSize: 12, color: s.muted }}>
              {enrolledCourses.length} Enrolled Course{enrolledCourses.length > 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {enrolledCourses.map((c) => {
              const isSelected = c.id === selectedCourseId;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCourseId(c.id);
                    setSelectedTopics([]);
                    setGoalTitle(`Master ${c.title} by deadline`);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: isSelected ? "2px solid #6366f1" : `1px solid ${s.border}`,
                    background: isSelected ? s.accentBg : s.input,
                    color: isSelected ? "#6366f1" : s.text,
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  <span style={{ fontSize: 18 }}>{c.icon || "📘"}</span>
                  <div style={{ textAlign: "left" }}>
                    <div>{c.title}</div>
                    <div style={{ fontSize: 11, color: s.muted, fontWeight: 400 }}>
                      {c.topics?.length || 0} Topics Available
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ fontSize: 10, background: "#6366f1", color: "white", padding: "2px 6px", borderRadius: 4 }}>
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Choose Mode: Adaptive Learning Engine vs User's Plan */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 16, padding: 22 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: s.text, display: "block", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            ⚙️ Choose Learning Strategy
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Option A: Adaptive Learning Engine */}
            <div
              onClick={() => setPlanMode("adaptive")}
              style={{
                padding: 18,
                borderRadius: 12,
                cursor: "pointer",
                border: planMode === "adaptive" ? "2px solid #6366f1" : `1px solid ${s.border}`,
                background: planMode === "adaptive" ? (isDark ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.06)") : s.input,
                transition: "all 0.2s",
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22 }}>🤖</span>
                  <span style={{ fontWeight: 700, fontSize: 15, color: s.text }}>
                    Adaptive Learning Engine
                  </span>
                </div>
                <input
                  type="radio"
                  name="planMode"
                  checked={planMode === "adaptive"}
                  onChange={() => setPlanMode("adaptive")}
                  style={{ accentColor: "#6366f1", width: 18, height: 18 }}
                />
              </div>
              <p style={{ fontSize: 12, color: s.muted, margin: "2px 0 6px", lineHeight: 1.5 }}>
                Autonomous AI curriculum. Evaluates <strong>all {courseTopics.length} topics</strong> of your enrolled course, ranks them by your live <strong>Elo rating</strong>, and schedules weaker topics first with extra reinforcement sessions.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(99,102,241,0.18)", color: "#818cf8" }}>
                  All Course Topics
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                  Elo Auto-Sequenced
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                  Adaptive Weighting
                </span>
              </div>
            </div>

            {/* Option B: My Custom Plan */}
            <div
              onClick={() => setPlanMode("custom")}
              style={{
                padding: 18,
                borderRadius: 12,
                cursor: "pointer",
                border: planMode === "custom" ? "2px solid #0d9488" : `1px solid ${s.border}`,
                background: planMode === "custom" ? (isDark ? "rgba(13,148,136,0.12)" : "rgba(13,148,136,0.06)") : s.input,
                transition: "all 0.2s",
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22 }}>🎯</span>
                  <span style={{ fontWeight: 700, fontSize: 15, color: s.text }}>
                    My Custom Plan
                  </span>
                </div>
                <input
                  type="radio"
                  name="planMode"
                  checked={planMode === "custom"}
                  onChange={() => setPlanMode("custom")}
                  style={{ accentColor: "#0d9488", width: 18, height: 18 }}
                />
              </div>
              <p style={{ fontSize: 12, color: s.muted, margin: "2px 0 6px", lineHeight: 1.5 }}>
                You hand-pick <strong>only the topics</strong> you wish to focus on. <strong>Unchecked topics will be skipped in your course roadmap and sessions</strong>, while problem difficulty and pacing dynamically adapt to your Elo rating for the selected topics.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(13,148,136,0.18)", color: "#14b8a6" }}>
                  Selected Topics Only
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                  Unchecked Skipped
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
                  Tailored Difficulty & Pace
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Topics of the Enrolled Course Selection / Inspection */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: s.text, margin: "0 0 4px" }}>
                {planMode === "adaptive"
                  ? `🤖 All Course Topics (Auto-Optimized by Elo)`
                  : `📋 Select Topics for Your Plan (${selectedTopics.length}/${courseTopics.length})`}
              </h3>
              <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>
                {planMode === "adaptive"
                  ? `The engine will automatically sequence all ${courseTopics.length} topics from lowest to highest Elo score.`
                  : `Check the topics you wish to include in your curriculum. Unselected topics will be automatically skipped in your active roadmap.`}
              </p>
            </div>

            {/* Quick Actions for Custom Mode */}
            {planMode === "custom" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={selectAllTopics}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background: s.cardSub,
                    color: s.text,
                    border: `1px solid ${s.border}`,
                    cursor: "pointer"
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={selectWeakTopics}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background: "rgba(239,68,68,0.1)",
                    color: "#ef4444",
                    border: "1px solid rgba(239,68,68,0.2)",
                    cursor: "pointer"
                  }}
                >
                  Weak Areas (&lt;1000 Elo)
                </button>
                <button
                  type="button"
                  onClick={clearTopics}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background: s.cardSub,
                    color: s.muted,
                    border: `1px solid ${s.border}`,
                    cursor: "pointer"
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Topics Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, maxHeight: 380, overflowY: "auto", paddingRight: 4, marginBottom: 16 }}>
            {courseTopics.map((t, idx) => {
              const elo = Math.round(getTopicElo(t, skillRatings));
              const diff = getDifficultyFromElo(elo);
              const isSelected = planMode === "adaptive" ? true : selectedTopics.includes(t.id);
              const isWeak = elo < 990;

              return (
                <div
                  key={t.id || idx}
                  onClick={() => {
                    if (planMode === "custom") toggleTopic(t.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: 10,
                    cursor: planMode === "custom" ? "pointer" : "default",
                    background: isSelected
                      ? planMode === "adaptive"
                        ? isDark
                          ? "rgba(99,102,241,0.12)"
                          : "rgba(99,102,241,0.06)"
                        : isDark
                        ? "rgba(13,148,136,0.12)"
                        : "rgba(13,148,136,0.06)"
                      : s.cardSub,
                    border: isSelected
                      ? `1px solid ${planMode === "adaptive" ? "#6366f1" : "#0d9488"}`
                      : `1px solid ${s.border}`,
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    {planMode === "custom" ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTopic(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ accentColor: "#0d9488", width: 16, height: 16, cursor: "pointer" }}
                      />
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", width: 20 }}>
                        #{idx + 1}
                      </span>
                    )}
                    <div style={{ overflow: "hidden" }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: s.text, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                        {t.title || t.label || t.id}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: isWeak ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                          Elo {elo}
                        </span>
                        <span style={{ fontSize: 10, color: s.muted }}>·</span>
                        <span style={{ fontSize: 10, color: diff.color, fontWeight: 500 }}>
                          {diff.level}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                    {isWeak ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", background: "rgba(239,68,68,0.12)", padding: "2px 6px", borderRadius: 4 }}>
                        Needs Focus
                      </span>
                    ) : elo > 1100 ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981", background: "rgba(16,185,129,0.12)", padding: "2px 6px", borderRadius: 4 }}>
                        Strong
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 600, color: s.muted, background: s.input, padding: "2px 6px", borderRadius: 4 }}>
                        Steady
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Calibration Stats Bar */}
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: s.input,
              border: `1px solid ${s.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontSize: 11, color: s.muted, display: "block" }}>Active Topics</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.text }}>
                  {planMode === "adaptive" ? courseTopics.length : customSelectedObjs.length} Topics
                </span>
              </div>
              <div style={{ width: 1, height: 24, background: s.border }} />
              <div>
                <span style={{ fontSize: 11, color: s.muted, display: "block" }}>Average Topic Elo</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: avgElo < 950 ? "#ef4444" : "#10b981" }}>
                  {avgElo} Elo
                </span>
              </div>
              <div style={{ width: 1, height: 24, background: s.border }} />
              <div>
                <span style={{ fontSize: 11, color: s.muted, display: "block" }}>Calibrated Difficulty</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: overallDifficulty.color }}>
                  {overallDifficulty.label}
                </span>
              </div>
              <div style={{ width: 1, height: 24, background: s.border }} />
              <div>
                <span style={{ fontSize: 11, color: s.muted, display: "block" }}>Pace Recommendation</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: overallPace.color }}>
                  {overallPace.tag}
                </span>
              </div>
            </div>

            <div style={{ fontSize: 11, color: s.muted, fontStyle: "italic" }}>
              {planMode === "adaptive"
                ? "⚡ Engine will dynamically arrange weaker topics earlier."
                : "🎯 Schedule will contain only your selected topics."}
            </div>
          </div>
        </div>

        {/* 4. Plan Details & Generation Form */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 16, padding: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, color: s.text, margin: "0 0 16px" }}>
            🗓️ Schedule Parameters & Goal
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Goal Title */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: s.muted, display: "block", marginBottom: 6 }}>
                Goal Title
              </label>
              <input
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder="e.g. Master Python data structures before finals"
                style={inputStyle}
              />
            </div>

            {/* Deadline */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: s.muted, display: "block", marginBottom: 6 }}>
                Target Deadline
              </label>
              <input
                type="date"
                value={deadline}
                min={minDate}
                onChange={(e) => setDeadline(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Daily study time presets & custom slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: s.text, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                ⏱️ Target Study Time & Session Question Load
              </label>
              <span style={{ fontSize: 12, color: s.muted }}>
                {hoursPerDay >= 2 ? "🔥 Intensive Pace" : hoursPerDay >= 1 ? "⚡ Steady Progression" : "🌱 Focused Sprint"}
              </span>
            </div>

            {/* Quick time preset buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {[
                { label: "30 Mins (0.5h)", hrs: 0.5, qs: 12 },
                { label: "45 Mins (0.75h)", hrs: 0.75, qs: 16 },
                { label: "1 Hour (1.0h)", hrs: 1.0, qs: 22 },
                { label: "1.5 Hours (1.5h)", hrs: 1.5, qs: 30 },
                { label: "2 Hours (2.0h)", hrs: 2.0, qs: 40 }
              ].map((p) => {
                const isSelected = Math.abs(hoursPerDay - p.hrs) < 0.05;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleHoursChange(p.hrs)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      background: isSelected ? s.accentBg : s.input,
                      color: isSelected ? "#6366f1" : s.text,
                      border: isSelected ? "2px solid #6366f1" : `1px solid ${s.border}`,
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Slider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.25"
                value={hoursPerDay}
                onChange={(e) => handleHoursChange(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#6366f1", cursor: "pointer" }}
              />
              <span style={{ minWidth: 60, textAlign: "right", fontSize: 13, fontWeight: 700, color: "#6366f1" }}>
                {hoursPerDay}h / day
              </span>
            </div>

            {/* Question Calibration Box */}
            <div
              style={{
                background: s.cardSub,
                border: `1px solid ${s.border}`,
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.text }}>
                    📝 Questions per Session: <span style={{ color: "#6366f1" }}>{questionsPerSession} Questions</span>
                  </span>
                  <span style={{ fontSize: 11, color: s.muted }}>
                    (~{Math.round(((hoursPerDay * 60) / Math.max(1, questionsPerSession)) * 10) / 10} mins / question)
                  </span>
                </div>
                <p style={{ fontSize: 11, color: s.muted, margin: "3px 0 0" }}>
                  💡 Proportional Calibration: 30 mins provides 10–15 questions; 1 hour provides 20–25 questions.
                </p>
              </div>

              {/* Adjust Question Stepper */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: s.muted, marginRight: 2 }}>Adjust:</span>
                <button
                  type="button"
                  onClick={() => setQuestionsPerSession((q) => Math.max(5, q - 2))}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: `1px solid ${s.border}`,
                    background: s.input,
                    color: s.text,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  -
                </button>
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={questionsPerSession}
                  onChange={(e) => setQuestionsPerSession(Math.max(5, Math.min(50, parseInt(e.target.value) || 10)))}
                  style={{
                    width: 48,
                    textAlign: "center",
                    padding: "4px 2px",
                    borderRadius: 6,
                    border: `1px solid ${s.border}`,
                    background: s.input,
                    color: s.text,
                    fontWeight: 700,
                    fontSize: 13
                  }}
                />
                <button
                  type="button"
                  onClick={() => setQuestionsPerSession((q) => Math.min(50, q + 2))}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: `1px solid ${s.border}`,
                    background: s.input,
                    color: s.text,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={createPlan}
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 10,
              background: canSubmit
                ? planMode === "adaptive"
                  ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                  : "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)"
                : "#4b5563",
              color: "white",
              border: "none",
              fontWeight: 700,
              fontSize: 15,
              cursor: canSubmit ? "pointer" : "not-allowed",
              boxShadow: canSubmit ? "0 4px 14px rgba(99,102,241,0.3)" : "none",
              transition: "all 0.2s"
            }}
          >
            {loading
              ? "Generating Optimized Schedule..."
              : planMode === "adaptive"
              ? "🤖 Generate Adaptive AI Study Plan (Elo-Sequenced)"
              : `🎯 Generate My Custom Plan (${selectedTopics.length} Topics)`}
          </button>
        </div>

        {/* 5. Plan Result / Schedule View */}
        {planResult && (
          <div
            style={{
              background: isDark ? "#0f1f1a" : "#ecfdf5",
              border: `1px solid ${isDark ? "#065f46" : "#a7f3d0"}`,
              borderRadius: 16,
              padding: 24
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ fontWeight: 800, fontSize: 18, color: "#10b981", margin: 0 }}>
                    ✅ {planResult.goal_title || "Your Study Plan"}
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: planResult.plan_mode === "adaptive" ? "rgba(99,102,241,0.2)" : "rgba(13,148,136,0.2)",
                      color: planResult.plan_mode === "adaptive" ? "#818cf8" : "#0d9488"
                    }}
                  >
                    {planResult.plan_mode === "adaptive" ? "🤖 Adaptive Engine Plan" : "🎯 Custom Curated Plan"}
                  </span>
                  {activeGoalPlan?.id === (planResult.id || selectedPlanId) && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "rgba(16,185,129,0.2)",
                        color: "#10b981"
                      }}
                    >
                      🟢 Active Course Goal
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: s.muted, margin: "4px 0 0" }}>
                  {planResult.sessions_created || planResult.schedule?.length || 0} scheduled sessions ·{" "}
                  {planResult.days_remaining} days until target deadline ·{" "}
                  <strong style={{ color: "#6366f1" }}>
                    {planResult.questions_per_session || questionsPerSession} questions / session
                  </strong>
                </p>
              </div>

              {/* Action Buttons: Set as Active / Drop / Export / Delete */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {activeGoalPlan?.id === (planResult.id || selectedPlanId) ? (
                  <button
                    type="button"
                    onClick={dropActiveGoal}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      background: "rgba(239,68,68,0.15)",
                      color: "#ef4444",
                      border: "1px solid rgba(239,68,68,0.3)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    🚫 Drop Goal
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => activatePlan(planResult)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      background: "#10b981",
                      color: "white",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 2px 8px rgba(16,185,129,0.3)"
                    }}
                  >
                    🎯 Set as Active Goal
                  </button>
                )}

                {(planResult.id || selectedPlanId) && (
                  <button
                    type="button"
                    onClick={() => deletePlanItem(planResult.id || selectedPlanId)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      background: "rgba(239,68,68,0.1)",
                      color: "#ef4444",
                      border: "none",
                      cursor: "pointer"
                    }}
                    title="Delete Plan"
                  >
                    🗑️ Delete
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    (planResult.schedule || []).slice(0, 10).forEach((sess, idx) => {
                      setTimeout(() => {
                        downloadIcsFile({
                          title: sess.title || `DevLingo: ${sess.topic}`,
                          startDate: sess.date,
                          details: `DevLingo Study Session: ${sess.topic}\nDifficulty: ${sess.difficulty || "Adaptive"}\nPace: ${sess.pace || "Steady"}`
                        });
                      }, idx * 150);
                    });
                    toast.success("Exporting study plan calendar files (.ics)!");
                  }}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    background: isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.1)",
                    color: "#818cf8",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  📥 Export .ics
                </button>
              </div>
            </div>

            {/* Schedule List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
              {(planResult.schedule || []).map((sess, i) => {
                const isSessionWeak = sess.elo && sess.elo < 990;
                const diffLevel = sess.difficulty || getDifficultyFromElo(sess.elo || 1000).level;
                const paceTag = sess.pace || getPaceFromElo(sess.elo || 1000).pace;

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: sess.completed
                        ? isDark
                          ? "rgba(16,185,129,0.08)"
                          : "rgba(16,185,129,0.06)"
                        : s.card,
                      border: `1px solid ${sess.completed ? "rgba(16,185,129,0.3)" : s.border}`,
                      gap: 12,
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      <button
                        onClick={() => toggleSessionComplete(i)}
                        title={sess.completed ? "Mark incomplete" : "Mark completed"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 18,
                          padding: 0
                        }}
                      >
                        {sess.completed ? "✅" : "⭕"}
                      </button>

                      <div style={{ width: 85, flexShrink: 0 }}>
                        <span style={{ fontSize: 13, color: s.text, fontWeight: 600 }}>
                          {sess.date ? new Date(sess.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : `Day ${i + 1}`}
                        </span>
                      </div>

                      <div style={{ overflow: "hidden", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: s.text, textTransform: "capitalize" }}>
                            {sess.topic}
                          </span>
                          {sess.elo && (
                            <span style={{ fontSize: 11, color: isSessionWeak ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                              Elo {sess.elo}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background:
                                diffLevel === "Easy"
                                  ? "rgba(16,185,129,0.15)"
                                  : diffLevel === "Hard"
                                  ? "rgba(239,68,68,0.15)"
                                  : "rgba(245,158,11,0.15)",
                              color:
                                diffLevel === "Easy" ? "#10b981" : diffLevel === "Hard" ? "#ef4444" : "#f59e0b"
                            }}
                          >
                            {diffLevel}
                          </span>
                          <span style={{ fontSize: 10, color: s.muted, background: s.cardSub, padding: "2px 6px", borderRadius: 4 }}>
                            {paceTag}
                          </span>
                          {sess.focus && (
                            <span style={{ fontSize: 10, color: "#818cf8", fontStyle: "italic" }}>
                              {sess.focus}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {/* Direct Start Session Link */}
                      <button
                        onClick={() => {
                          const cId = sess.course_id || currentCourse.id || "python-basics";
                          const tId = sess.topic_id || sess.topic;
                          navigate(`/study/${cId}/${tId}`);
                        }}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: "#6366f1",
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4
                        }}
                      >
                        🚀 Study Now
                      </button>

                      {/* Google Cal */}
                      <button
                        onClick={() => {
                          openGoogleCalendarEvent({
                            title: sess.title || `DevLingo Study: ${sess.topic}`,
                            startDate: sess.date,
                            details: `DevLingo scheduled study session for topic: ${sess.topic}\nTarget Difficulty: ${diffLevel}\nPace: ${paceTag}`
                          });
                          toast.success("Opening Google Calendar...");
                        }}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0",
                          color: s.text,
                          border: "none",
                          cursor: "pointer"
                        }}
                      >
                        🗓️ Google
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. Calendar Events & Upcoming Deadlines */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, color: s.text, margin: 0 }}>
              📌 Add Key Deadline or Event
            </h3>
            {isGoogleConnected && (
              <span style={{ fontSize: 11, color: "#10b981", background: "rgba(16,185,129,0.12)", padding: "3px 8px", borderRadius: 12, fontWeight: 600 }}>
                ✓ Google Sync Active
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Event title (e.g. Codeforces Round 950)"
              style={inputStyle}
            />
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={inputStyle}>
              <option value="competition">🏆 Competition</option>
              <option value="deadline">⏰ Assignment / Deadline</option>
              <option value="exam">📝 Exam / Midterm</option>
              <option value="other">📌 Other Milestone</option>
            </select>
            <input
              value={eventNotes}
              onChange={(e) => setEventNotes(e.target.value)}
              placeholder="Notes (optional)"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <input
              type="checkbox"
              id="syncGoogleCheck"
              checked={syncGoogle}
              onChange={(e) => setSyncGoogle(e.target.checked)}
              style={{ cursor: "pointer", width: 16, height: 16 }}
            />
            <label htmlFor="syncGoogleCheck" style={{ fontSize: 13, color: s.text, cursor: "pointer" }}>
              🗓️ <strong>Sync to Google Calendar</strong> (instantly opens & saves to your phone / desktop calendar)
            </label>
          </div>

          <button
            onClick={addEvent}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              background: "#0d9488",
              color: "white",
              border: "none",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Add to Calendar
          </button>
        </div>

        {/* Upcoming Events List */}
        {events.length > 0 && (
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 16, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: s.text, margin: "0 0 14px" }}>
              Upcoming Milestones & Events
            </h3>
            {events.map((ev, i) => {
              const c = EVENT_COLORS[ev.event_type] || EVENT_COLORS.other;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: `1px solid ${isDark ? "#2d3748" : "#f1f5f9"}`
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                    <div style={{ width: 4, height: 36, borderRadius: 4, background: c, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>{ev.title}</p>
                      <p style={{ fontSize: 12, color: s.muted, margin: 0 }}>
                        {ev.event_date} · <span style={{ color: c, fontWeight: 500 }}>{ev.event_type}</span>
                        {ev.notes ? ` · ${ev.notes}` : ""}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        openGoogleCalendarEvent({
                          title: `DevLingo: ${ev.title}`,
                          startDate: ev.event_date,
                          details: `${ev.event_type.toUpperCase()}: ${ev.notes || ""}`
                        });
                        toast.success("Opening Google Calendar...");
                      }}
                      title="Save to Google Calendar"
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: isDark ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.1)",
                        color: "#818cf8",
                        border: "none",
                        cursor: "pointer"
                      }}
                    >
                      🗓️ Google Cal
                    </button>
                    <button
                      onClick={() => {
                        downloadIcsFile({
                          title: `DevLingo: ${ev.title}`,
                          startDate: ev.event_date,
                          details: `${ev.event_type.toUpperCase()}: ${ev.notes || ""}`
                        });
                        toast.success("Downloaded .ics file!");
                      }}
                      title="Download .ics"
                      style={{
                        padding: "5px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0",
                        color: s.text,
                        border: "none",
                        cursor: "pointer"
                      }}
                    >
                      📥 .ics
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 7. Existing Study Plans History */}
        {plans.length > 0 && (
          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 16, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: s.text, margin: "0 0 14px" }}>
              Your Study Plans History
            </h3>
            {plans.map((p) => {
              const isSelected = selectedPlanId === p.id;
              const isAdaptive = p.plan_mode === "adaptive";

              return (
                <div
                  key={p.id}
                  onClick={() => selectPlan(p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    cursor: "pointer",
                    marginBottom: 8,
                    background: isSelected
                      ? isDark
                        ? "rgba(99,102,241,0.18)"
                        : "rgba(99,102,241,0.08)"
                      : s.cardSub,
                    border: isSelected ? "1px solid #6366f1" : `1px solid ${s.border}`,
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: s.text, margin: 0 }}>
                        {p.goal_title}
                      </p>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 700,
                          background: isAdaptive ? "rgba(99,102,241,0.2)" : "rgba(13,148,136,0.2)",
                          color: isAdaptive ? "#818cf8" : "#0d9488"
                        }}
                      >
                        {isAdaptive ? "🤖 Adaptive" : "🎯 Custom"}
                      </span>
                      {isSelected && (
                        <span style={{ fontSize: 10, background: "#6366f1", color: "white", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                          Active View
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: s.muted, margin: "3px 0 0" }}>
                      Deadline: {p.deadline} · {p.sessions_created || p.schedule?.length || 0} sessions · {p.topics?.length || 0} topics
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {activeGoalPlan?.id === p.id && (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: "rgba(16,185,129,0.2)",
                          color: "#10b981"
                        }}
                      >
                        🟢 Active Goal
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectPlan(p);
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: isSelected ? "#6366f1" : isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0",
                        color: isSelected ? "white" : s.text,
                        border: "none",
                        cursor: "pointer"
                      }}
                    >
                      {isSelected ? "Viewing" : "View"}
                    </button>

                    {activeGoalPlan?.id === p.id ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dropActiveGoal();
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: "rgba(239,68,68,0.12)",
                          color: "#ef4444",
                          border: "none",
                          cursor: "pointer"
                        }}
                        title="Drop active goal"
                      >
                        🚫 Drop
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          activatePlan(p);
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: "rgba(16,185,129,0.15)",
                          color: "#10b981",
                          border: "none",
                          cursor: "pointer"
                        }}
                        title="Set this plan as your active course goal"
                      >
                        🎯 Set Active
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePlanItem(p.id);
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: "rgba(239,68,68,0.08)",
                        color: "#ef4444",
                        border: "none",
                        cursor: "pointer"
                      }}
                      title="Delete plan"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
