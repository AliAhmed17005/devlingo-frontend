import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import Layout from "../components/Layout";
import { BookOpen } from "lucide-react";

export default function CourseSearch() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [difficulty, setDifficulty] = useState("All");
  const [enrolledIds, setEnrolledIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", input: "#161b27" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", input: "#f1f5f9" };

  const categories = ["All", "Programming", "Web Dev", "Data Science", "AI & ML", "Design"];
  const difficulties = ["All", "Beginner", "Intermediate", "Advanced"];

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, "courses"));
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (currentUser) {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (userSnap.exists()) {
          const enrolled = userSnap.data().enrolledCourses || [];
          setEnrolledIds(enrolled.map(e => e.courseId || e));
        }
      }
      setLoading(false);
    }
    load();
  }, [currentUser]);

  const filtered = courses.filter(c => {
    const matchSearch = c.title?.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "All" || c.category === category;
    const matchDiff = difficulty === "All" || c.level === difficulty;
    return matchSearch && matchCat && matchDiff;
  });

  const levelColors = { Beginner: "#10b981", Intermediate: "#f59e0b", Advanced: "#ef4444" };

  return (
    <Layout title="Courses">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div>
          <h2 style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={18} color="#6366f1" />Browse Courses
          </h2>
          <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>{courses.length} courses available</p>
        </div>

        {/* Search bar */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search courses, topics, skills..."
          style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${s.border}`, background: s.card, color: s.text, fontSize: 14, outline: "none" }}
        />

        {/* Filters */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${category === cat ? "#6366f1" : s.border}`, background: category === cat ? "#6366f1" : "transparent", color: category === cat ? "white" : s.muted, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              {cat}
            </button>
          ))}
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
            style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${s.border}`, background: s.card, color: s.text, fontSize: 12, cursor: "pointer", outline: "none" }}>
            {difficulties.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        {/* Results */}
        <p style={{ color: s.muted, fontSize: 12, margin: 0 }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: s.muted, fontSize: 14 }}>Loading courses...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: s.text, marginBottom: 4 }}>No courses found</p>
            <p style={{ color: s.muted, fontSize: 13 }}>Try adjusting your filters</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
            {filtered.map(course => {
              const isEnrolled = enrolledIds.includes(course.id);
              return (
                <div key={course.id}
                  className="card-hover"
                  style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, overflow: "hidden", cursor: "pointer" }}
                  onClick={() => navigate(isEnrolled ? `/roadmap/${course.id}` : `/onboarding/${course.id}`)}>
                  <div style={{ height: 3, background: course.color || "#6366f1" }} />
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, background: `${levelColors[course.level] || "#6366f1"}15`, color: levelColors[course.level] || "#6366f1", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                        {course.level}
                      </span>
                      {isEnrolled && (
                        <span style={{ fontSize: 11, color: "#10b981", fontWeight: 500 }}>Enrolled</span>
                      )}
                    </div>
                    <h3 style={{ fontWeight: 600, fontSize: 15, color: s.text, margin: "0 0 4px" }}>{course.title}</h3>
                    <p style={{ fontSize: 13, color: s.muted, margin: "0 0 10px", lineHeight: 1.5 }}>{course.description}</p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: s.muted }}>{course.instructor}</span>
                      <span style={{ fontSize: 12, color: s.muted }}>{course.rating}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                      <span style={{ fontSize: 12, color: s.muted }}>{course.lessons} lessons</span>
                      <span style={{ fontSize: 12, color: s.muted }}>{course.weeks} weeks</span>
                    </div>
                    <button
                      style={{ width: "100%", padding: "8px", borderRadius: 8, background: isEnrolled ? "transparent" : "#6366f1", color: isEnrolled ? "#6366f1" : "white", border: isEnrolled ? `1px solid ${s.border}` : "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                      {isEnrolled ? "Continue" : "Enroll Free"}
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
