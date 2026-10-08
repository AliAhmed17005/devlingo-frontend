import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase/config";
import { seedDatabase } from "./firebase/seedData";

// Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import CourseSearch from "./pages/CourseSearch";
import CourseOnboarding, { Assessment, CourseRoadmap } from "./pages/CoursePages";
import StudySession from "./pages/StudySession";
import Community from "./pages/Community";
import Leaderboard from "./pages/Leaderboard";
import Achievements from "./pages/Achievements";
import Mentorship from "./pages/Mentorship";
import Notifications from "./pages/Notifications";
import Downloads from "./pages/Downloads";
import Settings from "./pages/Settings";
import CodeHealth from "./pages/CodeHealth";
import Reports from "./pages/Reports";
import GoalPlanner from "./pages/GoalPlanner";
import BattleArena from "./pages/BattleArena";

function App() {
  useEffect(() => {
    const checkAndSeed = async () => {
      try {
        const snap = await getDocs(collection(db, "courses"));
        if (snap.empty) {
          console.log("No courses found in Firestore. Seeding default data...");
          await seedDatabase();
          console.log("Database seeded successfully!");
        }
      } catch (err) {
        console.warn("Could not check or seed database. This is normal if security rules are locked:", err);
      }
    };
    checkAndSeed();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#1e2433",
                color: "#f0f4ff",
                border: "1px solid #2d3748",
                borderRadius: "10px",
                fontSize: "14px",
              },
            }}
          />
          <Routes>
            {/* Public routes */}
            <Route path="/login"  element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* Protected routes */}
            <Route path="/dashboard"            element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/courses"              element={<ProtectedRoute><CourseSearch /></ProtectedRoute>} />
            <Route path="/onboarding/:courseId" element={<ProtectedRoute><CourseOnboarding /></ProtectedRoute>} />
            <Route path="/assessment/:courseId" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
            <Route path="/roadmap/:courseId"    element={<ProtectedRoute><CourseRoadmap /></ProtectedRoute>} />
            <Route path="/study/:courseId/:topicId" element={<ProtectedRoute><StudySession /></ProtectedRoute>} />
            <Route path="/community"            element={<ProtectedRoute><Community /></ProtectedRoute>} />
            <Route path="/leaderboard"          element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
            <Route path="/achievements"         element={<ProtectedRoute><Achievements /></ProtectedRoute>} />
            <Route path="/mentorship"           element={<ProtectedRoute><Mentorship /></ProtectedRoute>} />
            <Route path="/notifications"        element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/downloads"            element={<ProtectedRoute><Downloads /></ProtectedRoute>} />
            <Route path="/settings"             element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/code-health"          element={<ProtectedRoute><CodeHealth /></ProtectedRoute>} />
            <Route path="/reports"              element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/goals"                element={<ProtectedRoute><GoalPlanner /></ProtectedRoute>} />
            <Route path="/battle/:challengeId"  element={<ProtectedRoute><BattleArena /></ProtectedRoute>} />

            {/* Default redirect */}
            <Route path="/" element={<Landing />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
