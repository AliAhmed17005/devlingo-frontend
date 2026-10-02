import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { logout } from "../firebase/auth";
import { collection, onSnapshot, query, where, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, BookOpen, Trophy, Award,
  GraduationCap, Download, Bell, Settings, Sun, Moon,
  LogOut, Menu, MessageSquare, Code, LineChart
} from "lucide-react";

const NAV = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/courses", label: "Courses", icon: BookOpen },
  { path: "/community", label: "Community", icon: MessageSquare },
  { path: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "/achievements", label: "Achievements", icon: Award },
  { path: "/mentorship", label: "Mentorship", icon: GraduationCap },
  { path: "/downloads", label: "Downloads", icon: Download },
  { path: "/notifications", label: "Notifications", icon: Bell, notif: true },
  { path: "/reports", label: "Reports", icon: "📊" },
  { path: "/goals", label: "Goal Planner", icon: "🎯" },
  { path: "/code-health", label: "Code Health", icon: "🔬" },
  { path: "/settings", label: "Settings", icon: Settings },
];

const pageMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: "easeOut" }
};

export default function Layout({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [userData, setUserData] = useState(null);
  const { currentUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) {
        setUserData(snap.data());
      }
    }, err => {
      console.warn("onSnapshot Layout user doc failed:", err);
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, `users/${currentUser.uid}/notifications`), where("read", "==", false));
    return onSnapshot(q, snap => setUnread(snap.size), err => {
      console.warn("onSnapshot Layout notifications failed:", err);
    });
  }, [currentUser]);

  const displayName = userData?.name || currentUser?.displayName || "User";
  const initials = displayName
    ? displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2)
    : "U";

  const s = isDark
    ? { bg: "#0f1117", sidebar: "#0f1117", border: "#1e2433", text: "#f0f4ff", muted: "#8892a4", card: "#1a1f2e" }
    : { bg: "#f8fafc", sidebar: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", card: "#ffffff" };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
    toast.success("Logged out");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: s.bg }}>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:40 }} />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside style={{
        width: 240, position: "fixed", top: 0, left: 0, height: "100vh",
        background: s.sidebar, borderRight: `1px solid ${s.border}`,
        display: "flex", flexDirection: "column", zIndex: 50,
        transition: "transform 0.2s ease",
        transform: sidebarOpen ? "translateX(0)" : window.innerWidth < 1024 ? "translateX(-100%)" : "translateX(0)"
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${s.border}`, display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30,height:30,background:"#6366f1",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:11,fontFamily:"'JetBrains Mono',monospace" }}>
            &gt;_
          </div>
          <span style={{ fontWeight:600,fontSize:17,color:s.text,letterSpacing:"-0.3px" }}>DevLingo</span>
        </div>

        {/* Nav */}
        <nav style={{ flex:1,overflowY:"auto",padding:"8px 10px" }}>
          {NAV.map(item => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path}
                onClick={() => setSidebarOpen(false)}
                style={({ isActive }) => ({
                  display:"flex",alignItems:"center",gap:10,padding:"9px 14px",
                  borderRadius:8,fontSize:13,fontWeight:isActive ? 500 : 400,
                  color: isActive ? "#6366f1" : s.muted,
                  background: isActive ? "rgba(99,102,241,0.08)" : "transparent",
                  borderLeft: isActive ? "3px solid #6366f1" : "3px solid transparent",
                  textDecoration:"none",marginBottom:1,transition:"all 0.15s"
                })}>
                {({ isActive }) => (
                  <>
                    {typeof Icon === "string" ? (
                      <span style={{ fontSize: 14, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon}</span>
                    ) : (
                      <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                    )}
                    <span style={{ flex:1 }}>{item.label}</span>
                    {item.notif && unread > 0 && (
                      <span style={{ minWidth:18,height:18,background:"#ef4444",color:"white",fontSize:10,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600,padding:"0 4px" }}>
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding:"10px",borderTop:`1px solid ${s.border}` }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",marginBottom:8 }}>
            <div style={{ width:32,height:32,borderRadius:"50%",background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:600,fontSize:12,flexShrink:0,overflow:"hidden" }}>
              {userData?.avatarUrl ? (
                <img src={userData.avatarUrl} alt="avatar" style={{ width:"100%",height:"100%",objectFit:"cover" }} />
              ) : (
                initials
              )}
            </div>
            <div style={{ flex:1,minWidth:0 }}>
              <p style={{ fontWeight:500,fontSize:13,color:s.text,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                {displayName}
              </p>
            </div>
          </div>
          <button onClick={toggleTheme} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,fontSize:13,color:s.muted,background:"transparent",border:"none",cursor:"pointer",marginBottom:2 }}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
          <button onClick={handleLogout} style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,fontSize:13,color:"#ef4444",background:"transparent",border:"none",cursor:"pointer" }}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex:1,marginLeft: window.innerWidth >= 1024 ? 240 : 0,display:"flex",flexDirection:"column",minHeight:"100vh" }}>
        {/* TopBar */}
        <header style={{ position:"sticky",top:0,zIndex:30,background: isDark ? "rgba(15,17,23,0.95)" : "rgba(255,255,255,0.95)",borderBottom:`1px solid ${s.border}`,padding:"10px 24px",display:"flex",alignItems:"center",gap:16,backdropFilter:"blur(8px)" }}>
          <button onClick={() => setSidebarOpen(p=>!p)} style={{ display: window.innerWidth < 1024 ? "flex" : "none",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",color:s.muted,cursor:"pointer",padding:4 }}>
            <Menu size={20} />
          </button>
          <h1 style={{ fontWeight:600,fontSize:17,color:s.text,margin:0 }}>{title}</h1>
          <div style={{ flex:1 }} />
          <button onClick={toggleTheme} style={{ width:32,height:32,borderRadius:8,background:s.card,border:`1px solid ${s.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:s.muted }}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={() => navigate("/notifications")} style={{ position:"relative",width:32,height:32,borderRadius:8,background:s.card,border:`1px solid ${s.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:s.muted }}>
            <Bell size={15} />
            {unread > 0 && <span style={{ position:"absolute",top:-4,right:-4,width:16,height:16,background:"#ef4444",color:"white",fontSize:9,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600 }}>{unread}</span>}
          </button>
          <button onClick={() => navigate("/settings")} 
            style={{ width:32,height:32,borderRadius:8,background:"#6366f1",color:"white",border:"none",cursor:"pointer",fontWeight:600,fontSize:12,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",padding:0 }}>
            {userData?.avatarUrl ? (
              <img src={userData.avatarUrl} alt="avatar" style={{ width:"100%",height:"100%",objectFit:"cover",borderRadius:8 }} />
            ) : (
              initials
            )}
          </button>
        </header>

        {/* Page content with animation */}
        <main style={{ flex:1,padding:24,maxWidth:1400,width:"100%" }}>
          <motion.div
            key={location.pathname}
            initial={pageMotion.initial}
            animate={pageMotion.animate}
            transition={pageMotion.transition}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
