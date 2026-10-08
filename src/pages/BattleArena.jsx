import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import {
  doc, onSnapshot, updateDoc, serverTimestamp,
  getDoc, addDoc, collection
} from "firebase/firestore";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { runPython, checkAchievements, updateStreak } from "../utils/helpers";
import { getBattleProblemById, BATTLE_PROBLEMS } from "../utils/battleProblems";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords, Play, CheckCircle2, XCircle, Trophy,
  Timer, Flag, Terminal, ArrowLeft,
  Sparkles, RefreshCw, AlertCircle, Lock, Copy, Users
} from "lucide-react";

export default function BattleArena() {
  const { challengeId } = useParams();
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  // Firestore battle state
  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Editor and test states
  const [code, setCode] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResults, setTestResults] = useState([]);
  const [consoleOutput, setConsoleOutput] = useState("");
  const [activeTab, setActiveTab] = useState("tests"); // "tests" | "console" | "hint"

  // Local battle timer
  const [timeLeft, setTimeLeft] = useState(300);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  const hasAwardedRewards = useRef(false);

  // Determine user role (player1 or player2)
  const isPlayer1 = challenge?.from === currentUser?.uid;
  const isPlayer2 = challenge?.to === currentUser?.uid;
  const myRole = isPlayer1 ? "player1" : isPlayer2 ? "player2" : null;
  const opponentRole = isPlayer1 ? "player2" : "player1";

  const myData = challenge?.[myRole] || {};
  const opponentData = challenge?.[opponentRole] || {};

  // Current problem
  const problem = useMemo(() => {
    if (challenge?.battleProblem?.id) {
      return getBattleProblemById(challenge.battleProblem.id);
    }
    return challenge?.battleProblem || BATTLE_PROBLEMS[0];
  }, [challenge]);

  // Color theme styles
  const s = isDark
    ? {
        bg: "#0c0e14",
        card: "#151923",
        cardSubtle: "#1c2230",
        border: "#262f40",
        text: "#f0f4ff",
        muted: "#8a96a8",
        accent: "#6366f1",
        accentGlow: "rgba(99, 102, 241, 0.25)",
        danger: "#ef4444",
        success: "#10b981",
        warning: "#f59e0b",
      }
    : {
        bg: "#f3f5f9",
        card: "#ffffff",
        cardSubtle: "#f8fafc",
        border: "#e2e8f0",
        text: "#0f172a",
        muted: "#64748b",
        accent: "#4f46e5",
        accentGlow: "rgba(79, 70, 229, 0.15)",
        danger: "#dc2626",
        success: "#059669",
        warning: "#d97706",
      };

  // 1. Subscribe to Firestore Challenge updates
  useEffect(() => {
    if (!challengeId) return;

    const challengeRef = doc(db, "challenges", challengeId);
    const unsub = onSnapshot(
      challengeRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const data = { id: snapshot.id, ...snapshot.data() };
        setChallenge(data);
        setLoading(false);

        // Auto-initialize code ONLY when match is live or finished (anti-cheat lock)
        const isLiveOrDone = (data.status === "in_battle" && Boolean(data.startedAt)) || data.status === "finished";
        if (isLiveOrDone && !code) {
          setCode(data.battleProblem?.starterCode || problem?.starterCode || "");
        }
      },
      (err) => {
        console.error("Battle snapshot error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [challengeId, problem, code]);

  // Dual presence and live match state
  const isOpponentInArena = Boolean(challenge?.[opponentRole]?.inArena);
  const amIInArena = Boolean(challenge?.[myRole]?.inArena);
  const isMatchLive = challenge?.status === "in_battle" && Boolean(challenge?.startedAt);

  // Auto-initialize code immediately when duel transitions to live
  useEffect(() => {
    if (isMatchLive && !code) {
      setCode(challenge?.battleProblem?.starterCode || problem?.starterCode || "");
    }
  }, [isMatchLive, challenge, problem, code]);

  // 2. Mark current player presence in arena & auto-start ONLY when BOTH are in arena
  useEffect(() => {
    if (!challenge || !myRole || !currentUser) return;

    const updatePayload = {};

    // 1. Mark current user as actively inside the arena
    if (!challenge[myRole]?.inArena) {
      updatePayload[`${myRole}.inArena`] = true;
      updatePayload[`${myRole}.name`] = currentUser.displayName || "Rival Coder";
      updatePayload[`${myRole}.uid`] = currentUser.uid;
      updatePayload[`${myRole}.lastJoined`] = Date.now();
    }

    // 2. ONLY start the battle if BOTH players are actively in the arena and the battle has NOT started yet
    const myInArena = Boolean(challenge[myRole]?.inArena) || Boolean(updatePayload[`${myRole}.inArena`]);
    const otherInArena = Boolean(challenge[opponentRole]?.inArena);

    if (myInArena && otherInArena && !challenge.startedAt && challenge.status !== "finished") {
      updatePayload.status = "in_battle";
      updatePayload.startedAt = Date.now();
      updatePayload.timeLimit = problem.timeLimit || 300;
    }

    if (Object.keys(updatePayload).length > 0) {
      updateDoc(doc(db, "challenges", challenge.id), updatePayload).catch(console.warn);
    }

    // Cleanup when player leaves the page
    return () => {
      if (challenge?.id && challenge?.status !== "finished") {
        updateDoc(doc(db, "challenges", challenge.id), {
          [`${myRole}.inArena`]: false
        }).catch(() => {});
      }
    };
  }, [challenge, myRole, currentUser, opponentRole, problem]);

  // 3. Handle Match Expiration
  const handleTimeExpired = React.useCallback(async () => {
    if (!challenge || challenge.status === "finished") return;

    // Pick winner based on score or declare draw
    const p1Score = challenge.player1?.score || 0;
    const p2Score = challenge.player2?.score || 0;

    let winnerUid = null;
    let winnerName = null;
    let outcome = "draw";

    if (p1Score > p2Score) {
      winnerUid = challenge.player1?.uid || challenge.from;
      winnerName = challenge.player1?.name || challenge.fromName;
      outcome = "winner";
    } else if (p2Score > p1Score) {
      winnerUid = challenge.player2?.uid || challenge.to;
      winnerName = challenge.player2?.name || challenge.toName;
      outcome = "winner";
    }

    try {
      await updateDoc(doc(db, "challenges", challenge.id), {
        status: "finished",
        winner: winnerUid,
        winnerName: winnerName,
        finishReason: "time_expired",
        outcome: outcome,
        finishedAt: serverTimestamp(),
      });
      toast("Time expired! Battle completed.", { icon: "⌛" });
    } catch (e) {
      console.warn("Failed to finalize time expiration:", e);
    }
  }, [challenge]);

  // 4. Battle Timer Countdown (Only runs when match is actively live)
  useEffect(() => {
    if (!challenge || challenge.status !== "in_battle" || !challenge.startedAt) return;

    const limit = challenge.timeLimit || problem.timeLimit || 300;
    const started = challenge.startedAt;

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = Math.max(0, limit - elapsed);
      setTimeLeft(remaining);

      // Handle time expiration
      if (remaining === 0 && challenge.status === "in_battle") {
        handleTimeExpired();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => clearInterval(timerRef.current);
  }, [challenge, problem, handleTimeExpired]);

  // Format MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // 5. Run Test Cases
  const handleRunTests = async (shouldSubmit = false) => {
    if (isRunning || isSubmitting || challenge?.status === "finished") return;
    setIsRunning(true);
    setActiveTab("tests");
    setConsoleOutput("🚀 Executing Python test suite in WebWorker sandbox...\n");

    const tests = problem.testCases || [];
    let passedCount = 0;
    let results = [];
    let consoleLogs = "";

    try {
      // Build unified Python test suite runner to evaluate all test cases in 1 fast pass
      const testCasesJson = JSON.stringify(
        tests.map((t, idx) => ({
          index: idx + 1,
          input: t.input,
          expected: String(t.expected).trim()
        }))
      );

      const suiteHarness = `
${code}

# --- DEVLINGO_TEST_SUITE_RUNNER ---
import json

__tests__ = ${testCasesJson}
__suite_results__ = []

for __tc__ in __tests__:
    try:
        __eval_val__ = eval(__tc__["input"])
        __suite_results__.append({
            "index": __tc__["index"],
            "input": __tc__["input"],
            "expected": __tc__["expected"],
            "actual": str(__eval_val__),
            "error": None
        })
    except Exception as __e__:
        __suite_results__.append({
            "index": __tc__["index"],
            "input": __tc__["input"],
            "expected": __tc__["expected"],
            "actual": None,
            "error": type(__e__).__name__ + ": " + str(__e__)
        })

print("__DEVLINGO_SUITE_RESULT__:" + json.dumps(__suite_results__))
`;

      const execution = await runPython(suiteHarness);

      // Abort immediately if opponent surrendered while test execution was in progress
      if (challenge?.status === "finished") {
        setIsRunning(false);
        return;
      }

      const rawOutput = execution.output || "";

      // Check if Python suite returned structured results
      let parsedResults = null;
      let userStdout = "";

      const lines = rawOutput.split("\n");
      const markerPrefix = "__DEVLINGO_SUITE_RESULT__:";

      for (const line of lines) {
        if (line.startsWith(markerPrefix)) {
          try {
            parsedResults = JSON.parse(line.substring(markerPrefix.length));
          } catch (e) {
            console.warn("Could not parse test results JSON:", e);
          }
        } else {
          userStdout += line + "\n";
        }
      }

      if (parsedResults && Array.isArray(parsedResults)) {
        // Evaluate each test case
        results = parsedResults.map((pr) => {
          const normActual = (pr.actual || "").replace(/\s+/g, "").toLowerCase();
          const normExpected = (pr.expected || "").replace(/\s+/g, "").toLowerCase();
          const isPassed = !pr.error && normActual === normExpected;
          if (isPassed) passedCount++;

          consoleLogs += `[Test ${pr.index}] ${isPassed ? "PASSED ✅" : "FAILED ❌"}\nInput: ${pr.input}\nExpected: ${pr.expected}\nActual: ${pr.actual || pr.error}\n\n`;

          return {
            index: pr.index,
            input: pr.input,
            expected: pr.expected,
            actual: pr.error ? `Error: ${pr.error}` : pr.actual,
            passed: isPassed,
            error: pr.error,
          };
        });
      } else {
        // Top-level syntax error or runtime exception
        const topError = execution.stderr || execution.output || "Syntax or Runtime error";
        consoleLogs = `[Compilation Error]\n${topError}\n`;
        results = tests.map((t, idx) => ({
          index: idx + 1,
          input: t.input,
          expected: String(t.expected),
          actual: `Error: ${topError}`,
          passed: false,
          error: topError,
        }));
      }

      setTestResults(results);
      setConsoleOutput(
        (userStdout.trim() ? `[Program Output]\n${userStdout.trim()}\n\n` : "") + consoleLogs
      );

      // Update progress in Firestore for live opponent visibility
      const progressPercent = Math.round((passedCount / (tests.length || 1)) * 100);
      if (myRole && challenge?.id) {
        await updateDoc(doc(db, "challenges", challenge.id), {
          [`${myRole}.progress`]: progressPercent,
          [`${myRole}.passedCount`]: passedCount,
          [`${myRole}.totalTests`]: tests.length,
          [`${myRole}.lastRunAt`]: Date.now(),
        });
      }

      if (passedCount === tests.length) {
        toast.success(`All ${tests.length} tests passed! Ready to submit! 🎯`);
      } else {
        toast.error(`${passedCount}/${tests.length} tests passed. Check test details.`);
      }

      // If called from Submit button, verify and finalize victory
      if (shouldSubmit) {
        await finalizeSubmission(passedCount === tests.length, passedCount, tests.length);
      }
    } catch (err) {
      console.error("Test execution error:", err);
      toast.error("Execution failed: " + err.message);
      setConsoleOutput((prev) => prev + "\nRuntime error: " + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // 6. Finalize Submission & Score
  const finalizeSubmission = async (allPassed, passedCount, totalCount) => {
    if (!challenge || !myRole) return;
    setIsSubmitting(true);

    try {
      const isWinner = allPassed;
      const score = Math.round((passedCount / totalCount) * 100);

      const updateData = {
        [`${myRole}.status`]: "submitted",
        [`${myRole}.passed`]: allPassed,
        [`${myRole}.score`]: score,
        [`${myRole}.submittedAt`]: Date.now(),
        [`${myRole}.code`]: code,
      };

      if (isWinner) {
        updateData.status = "finished";
        updateData.winner = currentUser.uid;
        updateData.winnerName = currentUser.displayName || "Champion";
        updateData.outcome = "winner";
        updateData.finishReason = "all_tests_passed";
        updateData.finishedAt = Date.now();
      } else {
        // If current player did not pass all tests, check if opponent already submitted
        const opp = challenge[opponentRole];
        if (opp?.status === "submitted") {
          // Both players have submitted! Conclude match
          const oppScore = opp.score || 0;
          updateData.status = "finished";
          updateData.finishedAt = Date.now();

          if (score > oppScore) {
            updateData.winner = currentUser.uid;
            updateData.winnerName = currentUser.displayName || "Champion";
            updateData.outcome = "winner";
            updateData.finishReason = "higher_score";
          } else if (oppScore > score) {
            updateData.winner = opp.uid;
            updateData.winnerName = opp.name || "Opponent";
            updateData.outcome = "winner";
            updateData.finishReason = "higher_score";
          } else {
            updateData.outcome = "draw";
            updateData.finishReason = "equal_score_draw";
          }
        }
      }

      await updateDoc(doc(db, "challenges", challenge.id), updateData);

      if (isWinner) {
        toast.success("VICTORY! All tests passed first! 🏆");
      } else {
        toast("Submitted! Match recorded.", { icon: "🏁" });
      }
    } catch (err) {
      toast.error("Submission failed: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. Surrender / Forfeit
  const handleSurrender = async () => {
    if (!window.confirm("Are you sure you want to surrender this battle?")) return;
    if (!challenge || !myRole) return;

    try {
      const opponentUid = opponentData?.uid || (isPlayer1 ? challenge.to : challenge.from);
      const opponentName = opponentData?.name || (isPlayer1 ? challenge.toName : challenge.fromName);

      await updateDoc(doc(db, "challenges", challenge.id), {
        status: "finished",
        winner: opponentUid,
        winnerName: opponentName,
        outcome: "forfeit",
        finishReason: "forfeit",
        finishedAt: Date.now(),
        [`${myRole}.status`]: "forfeited",
      });
      toast("You surrendered the battle.", { icon: "🏳️" });
    } catch (err) {
      toast.error("Action failed: " + err.message);
    }
  };

  // 8. Reward distribution when battle concludes
  useEffect(() => {
    if (!challenge || challenge.status !== "finished" || hasAwardedRewards.current) return;
    if (!currentUser) return;

    const isWinner = challenge.winner === currentUser.uid;
    const stake = challenge.xpStake || 100;
    hasAwardedRewards.current = true;

    const awardRewards = async () => {
      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return;

        const uData = userSnap.data();
        const earnedXP = isWinner ? stake : 15; // 100 XP to winner, 15 XP consolation
        const newWins = isWinner ? (uData.challengeWins || 0) + 1 : (uData.challengeWins || 0);

        await updateDoc(userRef, {
          totalPoints: (uData.totalPoints || 0) + earnedXP,
          challengeWins: newWins,
          battlesPlayed: (uData.battlesPlayed || 0) + 1,
        });

        if (isWinner) {
          await updateStreak(currentUser.uid);
          await checkAchievements(currentUser.uid, {
            challengeWins: newWins,
            totalPoints: (uData.totalPoints || 0) + earnedXP,
            lastScore: 100,
          });
        }

        // Add history log notification
        await addDoc(collection(db, `users/${currentUser.uid}/notifications`), {
          type: "battle_result",
          message: isWinner
            ? `🏆 Battle Won vs ${opponentData.name || "Opponent"}! (+${earnedXP} XP)`
            : `⚔️ Battle Finished vs ${opponentData.name || "Opponent"}. Good effort! (+${earnedXP} XP)`,
          read: false,
          timestamp: serverTimestamp(),
        });
      } catch (e) {
        console.warn("Reward update failed:", e);
      }
    };

    awardRewards();
  }, [challenge, currentUser, opponentData.name]);

  // Loading & Error States
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: s.bg,
          color: s.text,
          flexDirection: "column",
          gap: 16,
        }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
        >
          <Swords size={48} color={s.accent} />
        </motion.div>
        <h2 style={{ margin: 0, fontWeight: 700 }}>Entering Battle Arena...</h2>
        <p style={{ color: s.muted, margin: 0, fontSize: 14 }}>Connecting real-time duel link</p>
      </div>
    );
  }

  if (notFound || !challenge) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: s.bg,
          color: s.text,
          flexDirection: "column",
          gap: 16,
          padding: 24,
        }}
      >
        <AlertCircle size={52} color={s.danger} />
        <h2 style={{ margin: 0, fontWeight: 700 }}>Battle Not Found</h2>
        <p style={{ color: s.muted, margin: 0 }}>This match may have expired or been removed.</p>
        <button
          onClick={() => navigate("/leaderboard")}
          style={{
            background: s.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontWeight: 600,
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          Return to Leaderboard
        </button>
      </div>
    );
  }

  const isFinished = challenge.status === "finished";
  const amIWinner = challenge.winner === currentUser?.uid;
  const isDraw = challenge.outcome === "draw";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: s.bg,
        color: s.text,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      {/* ================= TOP BATTLE ARENA HEADER ================= */}
      <header
        style={{
          background: s.card,
          borderBottom: `1px solid ${s.border}`,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        {/* Left: Back & Topic */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: s.cardSubtle,
              border: `1px solid ${s.border}`,
              color: s.muted,
              borderRadius: 8,
              padding: "7px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
            }}
          >
            <ArrowLeft size={16} /> Leave
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  background: s.accentGlow,
                  color: s.accent,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 6,
                  letterSpacing: 0.5,
                }}
              >
                1v1 Code Duel
              </span>
              <span style={{ fontSize: 13, color: s.muted }}>•</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {isMatchLive || isFinished ? problem.title : "🔒 Hidden Challenge"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: s.muted, marginTop: 2 }}>
              Stake: <strong style={{ color: s.warning }}>{challenge.xpStake || 100} XP</strong> •
              Difficulty:{" "}
              <span style={{ color: s.accent }}>
                {isMatchLive || isFinished ? problem.difficulty : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Live VS Matchup & Progress */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            background: s.cardSubtle,
            border: `1px solid ${s.border}`,
            borderRadius: 30,
            padding: "6px 20px",
          }}
        >
          {/* Player 1 (You) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "right" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.text }}>
                {currentUser?.displayName || "You"} (You)
              </div>
              <div style={{ fontSize: 11, color: isMatchLive ? s.muted : s.success }}>
                {isMatchLive
                  ? myData?.passedCount !== undefined
                    ? `${myData.passedCount}/${problem.testCases?.length || 3} tests`
                    : "Coding..."
                  : isFinished
                  ? myData?.passed
                    ? "✅ Solved"
                    : "Finished"
                  : "🟢 In Arena"}
              </div>
            </div>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: s.accent,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                border: `2px solid ${myData.passed ? s.success : s.accent}`,
              }}
            >
              {(currentUser?.displayName || "U")[0].toUpperCase()}
            </div>
          </div>

          {/* VS Badge & Timer */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                background: "linear-gradient(135deg, #ef4444, #f59e0b)",
                color: "#fff",
                fontWeight: 900,
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
                letterSpacing: 1,
              }}
            >
              <Swords size={12} /> VS
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                fontWeight: 700,
                color: isMatchLive ? (timeLeft < 60 ? s.danger : s.warning) : s.muted,
                marginTop: 2,
              }}
            >
              <Timer size={12} />{" "}
              {isMatchLive
                ? formatTime(timeLeft)
                : isFinished
                ? "Finished"
                : "Waiting"}
            </div>
          </div>

          {/* Player 2 (Opponent) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "#64748b",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                border: `2px solid ${opponentData?.passed ? s.success : isOpponentInArena ? s.success : s.border}`,
              }}
            >
              {(opponentData?.name || challenge.toName || "O")[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.text }}>
                {opponentData?.name || (isPlayer1 ? challenge.toName : challenge.fromName) || "Rival"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: opponentData?.passed
                    ? s.success
                    : isOpponentInArena
                    ? s.success
                    : s.warning,
                }}
              >
                {isMatchLive
                  ? opponentData?.passed
                    ? "✅ Solved!"
                    : opponentData?.passedCount !== undefined
                    ? `${opponentData.passedCount}/${problem.testCases?.length || 3} tests`
                    : "Coding..."
                  : isFinished
                  ? opponentData?.passed
                    ? "✅ Solved"
                    : "Finished"
                  : isOpponentInArena
                  ? "🟢 In Arena"
                  : "⏳ Not in Arena"}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleSurrender}
            disabled={!isMatchLive || isFinished}
            style={{
              background: "transparent",
              border: `1px solid ${s.border}`,
              color: s.muted,
              borderRadius: 8,
              padding: "7px 12px",
              cursor: !isMatchLive || isFinished ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 5,
              opacity: !isMatchLive || isFinished ? 0.4 : 1,
            }}
          >
            <Flag size={14} /> Surrender
          </button>
        </div>
      </header>

      {/* ================= CONDITIONAL WORKSPACE: WAITING LOBBY OR ACTIVE DUEL ================= */}
      {!isMatchLive && !isFinished ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 20px",
            background: isDark
              ? "radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.15) 0%, rgba(12, 14, 20, 1) 75%)"
              : "radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.08) 0%, rgba(243, 245, 249, 1) 75%)",
          }}
        >
          <div
            style={{
              maxWidth: 640,
              width: "100%",
              background: s.card,
              border: `1px solid ${s.border}`,
              borderRadius: 24,
              padding: "40px 32px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
              textAlign: "center",
            }}
          >
            {/* Pulsing Duel Radar Icon */}
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: s.accentGlow,
                color: s.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                position: "relative",
              }}
            >
              <Users size={38} />
              <div
                style={{
                  position: "absolute",
                  inset: -8,
                  borderRadius: "50%",
                  border: `2px dashed ${s.accent}`,
                  opacity: 0.6,
                }}
              />
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 8px 0", color: s.text }}>
              Waiting for Rival to Enter Arena
            </h2>
            <p
              style={{
                color: s.muted,
                fontSize: 14,
                maxWidth: 480,
                margin: "0 auto 24px",
                lineHeight: 1.6,
              }}
            >
              Both duelists must be actively present in this arena before the match begins. To ensure fair play, the question, code editor, and the 5-minute timer remain locked.
            </p>

            {/* Anti-Cheat Fair Play Lock Notice */}
            <div
              style={{
                background: isDark ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                borderRadius: 14,
                padding: "14px 18px",
                marginBottom: 28,
                display: "flex",
                alignItems: "center",
                gap: 14,
                textAlign: "left",
              }}
            >
              <Lock size={24} color="#f59e0b" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: isDark ? "#fde68a" : "#b45309", lineHeight: 1.5 }}>
                <strong>Anti-Cheat Fair Play Lock Active:</strong> Question description and starter code are securely hidden. When your opponent connects, both screens reveal the challenge and the 5-minute clock starts together!
              </div>
            </div>

            {/* Dual Player Presence Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: 16,
                alignItems: "center",
                marginBottom: 32,
              }}
            >
              {/* You Card */}
              <div
                style={{
                  background: s.cardSubtle,
                  border: `1.5px solid ${s.accent}`,
                  borderRadius: 16,
                  padding: "20px 14px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: s.accent,
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                  }}
                >
                  {(currentUser?.displayName || "Y")[0].toUpperCase()}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: s.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {currentUser?.displayName || "You"} (You)
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: s.success,
                    marginTop: 8,
                    background: isDark ? "rgba(16, 185, 129, 0.15)" : "rgba(5, 150, 105, 0.1)",
                    padding: "4px 12px",
                    borderRadius: 12,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: amIInArena ? s.success : s.warning,
                      display: "inline-block",
                    }}
                  />
                  {amIInArena ? "In Arena (Ready)" : "Entering Arena..."}
                </div>
              </div>

              {/* VS */}
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 15,
                  color: s.muted,
                  background: s.cardSubtle,
                  borderRadius: "50%",
                  width: 38,
                  height: 38,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `1px solid ${s.border}`,
                }}
              >
                VS
              </div>

              {/* Opponent Card */}
              <div
                style={{
                  background: s.cardSubtle,
                  border: `1.5px solid ${isOpponentInArena ? s.success : s.border}`,
                  borderRadius: 16,
                  padding: "20px 14px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: isOpponentInArena ? s.success : "#64748b",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                  }}
                >
                  {((isPlayer1 ? challenge.toName : challenge.fromName) || "R")[0].toUpperCase()}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: s.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {(isPlayer1 ? challenge.toName : challenge.fromName) || "Opponent"}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: isOpponentInArena ? s.success : s.warning,
                    marginTop: 8,
                    background: isOpponentInArena
                      ? isDark ? "rgba(16, 185, 129, 0.15)" : "rgba(5, 150, 105, 0.1)"
                      : isDark ? "rgba(245, 158, 11, 0.15)" : "rgba(217, 119, 6, 0.1)",
                    padding: "4px 12px",
                    borderRadius: 12,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isOpponentInArena ? s.success : s.warning,
                      display: "inline-block",
                    }}
                  />
                  {isOpponentInArena ? "In Arena (Connecting...)" : "Waiting to Join..."}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  setCopied(true);
                  toast.success("Battle Arena link copied!");
                  setTimeout(() => setCopied(false), 2500);
                }}
                style={{
                  background: s.accent,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 22px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: `0 6px 16px ${s.accentGlow}`,
                }}
              >
                <Copy size={16} />
                {copied ? "Link Copied to Clipboard! ✓" : "Copy Battle Arena Link"}
              </button>

              <button
                onClick={() => navigate(-1)}
                style={{
                  background: s.cardSubtle,
                  color: s.text,
                  border: `1px solid ${s.border}`,
                  borderRadius: 10,
                  padding: "12px 20px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <ArrowLeft size={16} />
                Leave Arena
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ================= MAIN ARENA WORKSPACE ================= */
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "minmax(320px, 420px) 1fr",
            overflow: "hidden",
            height: "calc(100vh - 65px)",
          }}
        >
        {/* ================= LEFT COLUMN: PROBLEM DESCRIPTION & TESTS ================= */}
        <div
          style={{
            borderRight: `1px solid ${s.border}`,
            background: s.card,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          {/* Navigation Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: `1px solid ${s.border}`,
              background: s.cardSubtle,
              padding: "0 16px",
            }}
          >
            {[
              { id: "tests", label: "Problem & Tests" },
              { id: "console", label: "Execution Logs" },
              { id: "hint", label: "Hint" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === tab.id ? `2px solid ${s.accent}` : "2px solid transparent",
                  color: activeTab === tab.id ? s.text : s.muted,
                  padding: "12px 14px",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "color 0.2s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Problem statement & Test cases */}
          {activeTab === "tests" && (
            <div style={{ padding: 20, flex: 1 }}>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px 0" }}>
                  {problem.title}
                </h2>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <span
                    style={{
                      background: s.cardSubtle,
                      border: `1px solid ${s.border}`,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      color: s.accent,
                    }}
                  >
                    {problem.topic || "Python"}
                  </span>
                  <span
                    style={{
                      background: s.cardSubtle,
                      border: `1px solid ${s.border}`,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      color: s.warning,
                    }}
                  >
                    ⏱ {Math.round((problem.timeLimit || 300) / 60)} min
                  </span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: s.text, margin: 0 }}>
                  {problem.description}
                </p>
              </div>

              {/* Opponent Live Status Radar */}
              <div
                style={{
                  background: s.cardSubtle,
                  border: `1px solid ${s.border}`,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: s.muted }}>
                    ⚡ OPPONENT RADAR
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: opponentData?.passed ? s.success : s.accent,
                    }}
                  >
                    {opponentData?.passed
                      ? "Solved All Tests!"
                      : opponentData?.passedCount
                      ? `${opponentData.passedCount}/${problem.testCases?.length || 3} Tests Passed`
                      : "Writing Code..."}
                  </span>
                </div>
                {/* Progress bar */}
                <div
                  style={{
                    height: 6,
                    background: isDark ? "#242c3d" : "#e2e8f0",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${opponentData?.progress || 0}%` }}
                    transition={{ duration: 0.5 }}
                    style={{
                      height: "100%",
                      background: opponentData?.passed
                        ? s.success
                        : "linear-gradient(90deg, #6366f1, #ec4899)",
                    }}
                  />
                </div>
              </div>

              {/* Test Cases Checklist */}
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px 0" }}>
                Test Cases ({problem.testCases?.length || 0})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(problem.testCases || []).map((tc, idx) => {
                  const result = testResults.find((r) => r.index === idx + 1);
                  const isPassed = result?.passed;
                  const hasRun = !!result;

                  return (
                    <div
                      key={idx}
                      style={{
                        background: s.cardSubtle,
                        border: `1px solid ${
                          hasRun
                            ? isPassed
                              ? "rgba(16, 185, 129, 0.4)"
                              : "rgba(239, 68, 68, 0.4)"
                            : s.border
                        }`,
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 600, color: s.text }}>
                          Test Case #{idx + 1}
                        </span>
                        {hasRun ? (
                          isPassed ? (
                            <span
                              style={{
                                color: s.success,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              <CheckCircle2 size={14} /> Passed
                            </span>
                          ) : (
                            <span
                              style={{
                                color: s.danger,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              <XCircle size={14} /> Failed
                            </span>
                          )
                        ) : (
                          <span style={{ color: s.muted, fontSize: 11 }}>Not executed yet</span>
                        )}
                      </div>
                      <div
                        style={{
                          fontFamily: "monospace",
                          background: isDark ? "#0e1118" : "#f1f5f9",
                          padding: "6px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          color: s.text,
                        }}
                      >
                        {tc.input}
                      </div>
                      <div style={{ fontSize: 11, color: s.muted, marginTop: 4 }}>
                        Expected output: <code style={{ color: s.accent }}>{tc.expected}</code>
                      </div>
                      {hasRun && !isPassed && (
                        <div style={{ fontSize: 11, color: s.danger, marginTop: 4 }}>
                          Your output: <code>{result.actual || "No return value"}</code>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Execution Console Logs */}
          {activeTab === "console" && (
            <div style={{ padding: 16, flex: 1, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  flex: 1,
                  background: isDark ? "#090a0f" : "#1e293b",
                  color: isDark ? "#10b981" : "#f8fafc",
                  fontFamily: "Consolas, 'Courier New', monospace",
                  fontSize: 12,
                  padding: 12,
                  borderRadius: 8,
                  whiteSpace: "pre-wrap",
                  overflowY: "auto",
                  lineHeight: 1.5,
                }}
              >
                {consoleOutput || "No executions logged yet. Click 'Run Tests' below."}
              </div>
            </div>
          )}

          {/* Tab 3: Hint */}
          {activeTab === "hint" && (
            <div style={{ padding: 20 }}>
              <div
                style={{
                  background: s.accentGlow,
                  border: `1px solid ${s.accent}`,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 700,
                    color: s.accent,
                    marginBottom: 6,
                  }}
                >
                  <Sparkles size={16} /> Solution Hint
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: s.text }}>
                  {problem.hint || "Review basic string slicing, loops, or standard python library methods."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ================= RIGHT COLUMN: CODE EDITOR & TEST CONTROLS ================= */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: isDark ? "#0e1118" : "#ffffff",
            overflow: "hidden",
          }}
        >
          {/* Editor Header Bar */}
          <div
            style={{
              padding: "10px 16px",
              background: s.cardSubtle,
              borderBottom: `1px solid ${s.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Terminal size={16} color={s.accent} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Python 3 Editor</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setCode(problem.starterCode || "")}
                style={{
                  background: "transparent",
                  border: `1px solid ${s.border}`,
                  color: s.muted,
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <RefreshCw size={12} /> Reset
              </button>
            </div>
          </div>

          {/* CodeMirror Workspace */}
          <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
            <CodeMirror
              value={code}
              height="100%"
              theme={isDark ? "dark" : "light"}
              extensions={[python()]}
              onChange={(value) => setCode(value)}
              style={{ fontSize: 14 }}
            />
          </div>

          {/* Bottom Action Footer Bar */}
          <div
            style={{
              padding: "14px 20px",
              background: s.card,
              borderTop: `1px solid ${s.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 12, color: s.muted }}>
              Press <strong>Run Tests</strong> to test locally. First to pass all and submit wins!
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => handleRunTests(false)}
                disabled={isRunning || isFinished}
                style={{
                  background: s.cardSubtle,
                  border: `1px solid ${s.border}`,
                  color: s.text,
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: isRunning || isFinished ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: isRunning || isFinished ? 0.6 : 1,
                }}
              >
                <Play size={15} color={s.accent} />
                {isRunning ? "Running Tests..." : "Run Tests"}
              </button>

              <button
                onClick={() => handleRunTests(true)}
                disabled={isRunning || isSubmitting || isFinished}
                style={{
                  background: `linear-gradient(135deg, ${s.accent}, #8b5cf6)`,
                  border: "none",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "10px 22px",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: isRunning || isSubmitting || isFinished ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: `0 4px 12px ${s.accentGlow}`,
                  opacity: isFinished ? 0.5 : 1,
                }}
              >
                <Swords size={16} />
                {isSubmitting ? "Submitting..." : "Submit Solution"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

      {/* ================= VICTORY / MATCH CONCLUSION MODAL ================= */}
      <AnimatePresence>
        {isFinished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.8)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 100,
              padding: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              style={{
                background: s.card,
                border: `2px solid ${amIWinner ? s.warning : s.border}`,
                borderRadius: 16,
                padding: 32,
                maxWidth: 480,
                width: "100%",
                textAlign: "center",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              }}
            >
              {amIWinner ? (
                <>
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      background: "rgba(245, 158, 11, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <Trophy size={48} color={s.warning} />
                  </div>
                  <h2 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 8px 0" }}>
                    VICTORY! 🏆
                  </h2>
                  <p style={{ color: s.muted, fontSize: 14, margin: "0 0 20px 0" }}>
                    {challenge?.finishReason === "forfeit"
                      ? `Your opponent (${opponentData?.name || "your rival"}) surrendered the battle! You win by forfeit! 🏳️🏆`
                      : `You crushed the 1v1 battle against ${opponentData?.name || "your rival"}!`}
                  </p>
                  <div
                    style={{
                      background: s.cardSubtle,
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 24,
                    }}
                  >
                    <div style={{ fontSize: 12, color: s.muted }}>REWARD EARNED</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.warning, marginTop: 4 }}>
                      +{challenge.xpStake || 100} XP
                    </div>
                    <div style={{ fontSize: 12, color: s.success, marginTop: 4 }}>
                      +1 Duel Win Added to Leaderboard
                    </div>
                  </div>
                </>
              ) : isDraw ? (
                <>
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      background: "rgba(100, 116, 139, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <Swords size={48} color={s.muted} />
                  </div>
                  <h2 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 8px 0" }}>
                    DRAW MATCH! 🤝
                  </h2>
                  <p style={{ color: s.muted, fontSize: 14, margin: "0 0 20px 0" }}>
                    Time expired and scores were tied. Both competitors fought honorably!
                  </p>
                  <div
                    style={{
                      background: s.cardSubtle,
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 24,
                    }}
                  >
                    <div style={{ fontSize: 12, color: s.muted }}>PARTICIPATION REWARD</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: s.accent, marginTop: 4 }}>
                      +15 XP
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      background: "rgba(239, 68, 68, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}
                  >
                    <XCircle size={48} color={s.danger} />
                  </div>
                  <h2 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 8px 0" }}>
                    DEFEAT ⚔️
                  </h2>
                  <p style={{ color: s.muted, fontSize: 14, margin: "0 0 20px 0" }}>
                    <strong>{challenge.winnerName || "Opponent"}</strong> solved the challenge first.
                    Great effort! Practice makes perfect.
                  </p>
                  <div
                    style={{
                      background: s.cardSubtle,
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 24,
                    }}
                  >
                    <div style={{ fontSize: 12, color: s.muted }}>CONSOLATION REWARD</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.accent, marginTop: 4 }}>
                      +15 XP
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => navigate("/leaderboard")}
                  style={{
                    background: s.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 20px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  View Leaderboard
                </button>
                <button
                  onClick={() => navigate("/community")}
                  style={{
                    background: s.cardSubtle,
                    color: s.text,
                    border: `1px solid ${s.border}`,
                    borderRadius: 8,
                    padding: "10px 20px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Back to Community
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
