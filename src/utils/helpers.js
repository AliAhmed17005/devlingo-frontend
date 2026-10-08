// ============ STREAK UTILITY ============
import { db } from "../firebase/config";
import {
  doc, updateDoc, getDoc, setDoc, serverTimestamp,
  addDoc, collection, arrayUnion, getDocs
} from "firebase/firestore";
import toast from "react-hot-toast";

export async function updateStreak(uid) {
  try {
    const getLocalDateString = (date = new Date()) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const today = getLocalDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getLocalDateString(yesterdayDate);

    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    const { lastActiveDate, currentStreak = 0 } = snap.data();
    let newStreak = currentStreak;
    if (lastActiveDate === yesterday) newStreak = currentStreak + 1;
    else if (lastActiveDate !== today) newStreak = 1;
    await updateDoc(doc(db, "users", uid), {
      currentStreak: newStreak, lastActiveDate: today
    });
    try {
      await setDoc(doc(db, `users/${uid}/activityLog/${today}`), {
        date: today, studied: true, timestamp: serverTimestamp()
      });
    } catch (err) {
      console.warn("Failed to write activity log (bypassing):", err);
    }
    return newStreak;
  } catch (e) { console.error("updateStreak:", e); }
}

// ============ ACHIEVEMENT UTILITY ============
const BADGES = {
  first_blood: {
    label: "First Blood", icon: "lightning", category: "Course",
    desc: "Complete your first lesson", rarity: "Common", xp: 50,
    condition: s => s.totalSolved >= 1
  },
  on_fire: {
    label: "On Fire", icon: "flame", category: "Streak",
    desc: "Maintain a 7-day streak", rarity: "Rare", xp: 100,
    condition: s => s.currentStreak >= 7
  },
  perfect_score: {
    label: "Perfect Score", icon: "gem", category: "Test",
    desc: "Score 100% on any test", rarity: "Legendary", xp: 150,
    condition: s => s.lastScore === 100
  },
  speed_coder: {
    label: "Speed Coder", icon: "rocket", category: "Speed",
    desc: "Complete a test in under 2 minutes", rarity: "Rare", xp: 120,
    condition: s => s.lastSolveTime <= 120
  },
  social_butterfly: {
    label: "Social Butterfly", icon: "star", category: "Social",
    desc: "Connect with 10 community members", rarity: "Common", xp: 75,
    condition: s => s.communityConnections >= 10
  },
  marathon_coder: {
    label: "Marathon Coder", icon: "trophy", category: "Course",
    desc: "Complete 30 lessons total", rarity: "Rare", xp: 200,
    condition: s => s.totalSolved >= 30
  },
  challenger: {
    label: "Challenger", icon: "swords", category: "Challenge",
    desc: "Win 5 user challenges", rarity: "Rare", xp: 150,
    condition: s => s.challengeWins >= 5
  },
  knowledge_seeker: {
    label: "Knowledge Seeker", icon: "book", category: "Course",
    desc: "Enroll in 3 courses", rarity: "Common", xp: 100,
    condition: s => s.enrolledCourses?.length >= 3
  },
  century: {
    label: "Century", icon: "100", category: "Points",
    desc: "Earn 100 total points", rarity: "Common", xp: 50,
    condition: s => s.totalPoints >= 100
  },
  comeback_kid: {
    label: "Comeback Kid", icon: "flex", category: "Resilience",
    desc: "Pass a retry test after failing", rarity: "Rare", xp: 80,
    condition: s => s.retryPassed === true
  },
  night_owl: {
    label: "Night Owl", icon: "owl", category: "Streak",
    desc: "Study for 30 consecutive days", rarity: "Legendary", xp: 500,
    condition: s => s.currentStreak >= 30
  },
  top_learner: {
    label: "Top Learner", icon: "crown", category: "Rank",
    desc: "Reach top 10 on the leaderboard", rarity: "Legendary", xp: 300,
    condition: s => s.globalRank <= 10
  }
};

export const getAllBadges = () => BADGES;

export async function checkAchievements(uid, stats) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    const earned = snap.data().achievements || [];
    const newBadges = [];
    for (const [id, badge] of Object.entries(BADGES)) {
      if (!earned.includes(id) && badge.condition(stats)) newBadges.push(id);
    }
    if (newBadges.length > 0) {
      await updateDoc(doc(db, "users", uid), { achievements: arrayUnion(...newBadges) });
      for (const id of newBadges) {
        toast.success(`Badge unlocked: ${BADGES[id].label}!`, { duration: 4000 });
        await addDoc(collection(db, `users/${uid}/notifications`), {
          type: "badge", message: `You earned: ${BADGES[id].label}`,
          icon: BADGES[id].icon, read: false, timestamp: serverTimestamp()
        });
      }
    }
    return newBadges;
  } catch (e) { console.error("checkAchievements:", e); }
}

// ============ DIFFICULTY UTILITY ============
export async function updateDifficulty(uid, score, isRetry) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return { changed: false };
    const { currentLevel = "easy", consecutivePasses = 0 } = snap.data();
    const up = { easy: "medium", medium: "hard", hard: "hard" };
    const down = { hard: "medium", medium: "easy", easy: "easy" };
    if (score >= 80 && consecutivePasses + 1 >= 2) {
      const newLevel = up[currentLevel];
      await updateDoc(doc(db, "users", uid), { currentLevel: newLevel, consecutivePasses: 0 });
      toast.success(`Level Up! Now on ${newLevel} difficulty`);
      return { changed: true, direction: "up", newLevel };
    } else if (score < 50 && isRetry) {
      const newLevel = down[currentLevel];
      await updateDoc(doc(db, "users", uid), { currentLevel: newLevel, consecutivePasses: 0 });
      toast(`Difficulty adjusted to ${newLevel}`, { icon: "i" });
      return { changed: true, direction: "down", newLevel };
    } else if (score >= 80) {
      await updateDoc(doc(db, "users", uid), { consecutivePasses: consecutivePasses + 1 });
    }
    return { changed: false };
  } catch (e) { console.error("updateDifficulty:", e); return { changed: false }; }
}

// ============ COMPILER UTILITY (Pyodide — Web Worker with Timeout) ============
const EXEC_TIMEOUT = 5000; // 5 seconds max

const workerCode = `
importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js");
let pyodide = null;
async function init() {
  pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.0/full/" });
  self.postMessage({ type: "status", status: "ready" });
}
const ready = init();
self.onmessage = async (e) => {
  try {
    await ready;
    pyodide.runPython(\`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
\`);
    try {
      pyodide.runPython(e.data);
    } catch (err) {
      const stderr = pyodide.runPython("sys.stderr.getvalue()");
      self.postMessage({ type: "result", success: false, output: stderr || err.message, stderr: stderr || err.message });
      return;
    }
    const stdout = pyodide.runPython("sys.stdout.getvalue()");
    const stderr = pyodide.runPython("sys.stderr.getvalue()");
    self.postMessage({ type: "result", success: !stderr, output: stdout || stderr || "No output", stderr: stderr || "" });
  } catch (err) {
    self.postMessage({ type: "result", success: false, output: "Runtime error: " + err.message, stderr: err.message });
  }
};
`;

let worker = null;
let workerBlobURL = null;
let isWorkerReady = false;
let workerReadyResolve = null;
let workerReadyPromise = new Promise((resolve) => {
  workerReadyResolve = resolve;
});

function createWorker() {
  if (workerBlobURL) URL.revokeObjectURL(workerBlobURL);
  isWorkerReady = false;
  workerReadyPromise = new Promise((resolve) => {
    workerReadyResolve = resolve;
  });

  const blob = new Blob([workerCode], { type: "application/javascript" });
  workerBlobURL = URL.createObjectURL(blob);
  worker = new Worker(workerBlobURL);

  worker.onmessage = (e) => {
    const data = e.data;
    if (data.type === "status" && data.status === "ready") {
      isWorkerReady = true;
      if (workerReadyResolve) workerReadyResolve();
    }
  };

  worker.onerror = (e) => {
    console.error("Worker error:", e);
    createWorker();
  };
}

// Pre-initialize the worker so it loads Pyodide immediately in background
if (typeof window !== "undefined") {
  createWorker();
}

export async function runPython(code) {
  try {
    if (!worker) createWorker();

    if (!isWorkerReady) {
      // Wait for initialization to complete before starting execution timer
      await workerReadyPromise;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (worker) {
          worker.terminate();
          worker = null;
        }
        resolve({
          success: false,
          output: "Execution timed out (5s limit). Your code may contain an infinite loop.\nTip: Add a break condition to while/for loops.",
          stderr: "Timeout"
        });
        createWorker();
      }, EXEC_TIMEOUT);

      const originalOnMessage = worker.onmessage;
      worker.onmessage = (e) => {
        const data = e.data;
        if (data.type === "status" && data.status === "ready") {
          isWorkerReady = true;
          if (workerReadyResolve) workerReadyResolve();
        } else if (data.type === "result") {
          clearTimeout(timer);
          if (worker) worker.onmessage = originalOnMessage;
          resolve(data);
        }
      };

      worker.onerror = (e) => {
        clearTimeout(timer);
        if (worker) {
          worker.terminate();
          worker = null;
        }
        resolve({
          success: false,
          output: "Python runtime error: " + (e.message || "Unknown error"),
          stderr: e.message || "Error"
        });
        createWorker();
      };

      worker.postMessage(code);
    });
  } catch (e) {
    return {
      success: false,
      output: "Failed to start Python runtime. Please refresh and try again.\n" + e.message,
      stderr: e.message
    };
  }
}

// ============ USER TAG ID UTILITY ============
export async function ensureUserTagId(uid) {
  if (!uid) return;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data();
    
    let updates = {};
    let tagId = data.tagId;

    if (!data.tagId || !data.tagId.startsWith("DV-")) {
      const usersSnap = await getDocs(collection(db, "users"));
      let nextNum = usersSnap.size + 1;
      tagId = "DV-" + String(nextNum).padStart(3, "0");
      const existingTags = new Set(usersSnap.docs.map(d => d.data().tagId).filter(Boolean));
      while (existingTags.has(tagId)) {
        nextNum++;
        tagId = "DV-" + String(nextNum).padStart(3, "0");
      }
      updates.tagId = tagId;
    }

    // Auto-enroll pre-existing users in python-basics if not enrolled
    const enrolled = data.enrolledCourses || [];
    const hasPythonBasics = enrolled.some(e => (e.courseId || e) === "python-basics");
    if (!hasPythonBasics) {
      updates.enrolledCourses = [
        ...enrolled,
        { courseId: "python-basics", enrolledAt: new Date().toISOString() }
      ];
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(userRef, updates);
    }

    return tagId;
  } catch (e) {
    console.error("ensureUserTagId error:", e);
  }
}

export async function completeTopic(uid, courseId, topicId) {
  if (!uid || !courseId || !topicId) return;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const userData = snap.data();
    const enrolled = userData.enrolledCourses || [];
    let updated = false;

    const nextEnrolled = enrolled.map(e => {
      const cid = e.courseId || e;
      if (cid === courseId) {
        const completed = e.completedTopics || [];
        if (!completed.includes(topicId)) {
          updated = true;
          return {
            ...e,
            courseId: cid,
            completedTopics: [...completed, topicId]
          };
        }
      }
      return e;
    });

    if (updated) {
      await updateDoc(userRef, { enrolledCourses: nextEnrolled });
    }
  } catch (err) {
    console.error("completeTopic error:", err);
  }
}

export async function dropCourse(uid, courseId) {
  if (!uid || !courseId) return;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const userData = snap.data();
    const enrolled = userData.enrolledCourses || [];
    const nextEnrolled = enrolled.filter(e => (e.courseId || e) !== courseId);
    await updateDoc(userRef, { enrolledCourses: nextEnrolled });
    toast.success("Course dropped successfully.");
  } catch (err) {
    console.error("dropCourse error:", err);
    toast.error("Failed to drop course");
  }
}

// ============ CHATBOT UTILITY ============
export async function askAI(userMessage, history = [], context = {}) {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";

  const res = await fetch(`${backendUrl}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: context?.userId || "student",
      message: userMessage,
      topic: context?.topic || "variables",
      level: context?.level || "easy",
      score: context?.lastScore || 0
    })
  });

  if (!res.ok) {
    throw new Error(`Backend /agent/chat error: ${res.status}`);
  }

  const data = await res.json();
  return data.reply;
}

