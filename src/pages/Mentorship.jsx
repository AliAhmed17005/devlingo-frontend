import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import {
  addDoc, collection, serverTimestamp,
  onSnapshot, query, where
} from "firebase/firestore";
import Layout from "../components/Layout";
import toast from "react-hot-toast";
import { GraduationCap } from "lucide-react";

const MENTORS = [
  { id:"mentor_sarah", name:"Dr. Sarah Khan", role:"Senior ML Engineer @ Google", expertise:["Python","ML","TensorFlow"], rating:4.9, reviews:142, sessions:248, response:"~1h", price:"Free", priceColor:"#10b981", online:true, verified:true, bio:"8 years in ML. Passionate about making AI accessible.", color:"#6366f1" },
  { id:"mentor_hassan", name:"Hassan Ali", role:"Full Stack Dev @ Meta", expertise:["React","Node.js","AWS"], rating:4.8, reviews:98, sessions:176, response:"~2h", price:"200 XP/hr", priceColor:"#f59e0b", online:true, verified:true, bio:"Building scalable apps for 6 years.", color:"#0f9b8e" },
  { id:"mentor_fatima", name:"Fatima Malik", role:"Data Scientist @ Microsoft", expertise:["Python","Pandas","SQL"], rating:4.7, reviews:64, sessions:112, response:"~3h", price:"150 XP/hr", priceColor:"#f59e0b", online:false, verified:true, bio:"Turning data into insights for beginners.", color:"#8b5cf6" },
];

const TOPICS = ["Python Basics","Functions & Scope","Data Structures","Machine Learning","React Hooks","SQL Queries","System Design","Code Review"];
const SESSION_TYPES = ["Quick Q&A","Study Plan Review","Code Review","Mock Interview"];
const TIME_SLOTS = ["6:00 PM","7:00 PM","8:00 PM","9:00 PM","10:00 PM"];

function getInitials(name) { return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2); }

function getNextDays(count = 7) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const fullDate = `${year}-${month}-${day}`;
    return { label: d.toLocaleDateString("en-US", { weekday: "short" }), date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), full: fullDate };
  });
}

export default function Mentorship() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [openModal, setOpenModal] = useState(null);
  const [requests, setRequests] = useState([]);
  const [hasSession, setHasSession] = useState(false);

  const [topic, setTopic] = useState(TOPICS[0]);
  const [sessionType, setSessionType] = useState(SESSION_TYPES[0]);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(getNextDays()[0].full);
  const [selectedTime, setSelectedTime] = useState(TIME_SLOTS[0]);
  const [submitting, setSubmitting] = useState(false);

  const s = isDark
    ? { card:"#1a1f2e", border:"#2d3748", text:"#f0f4ff", muted:"#8892a4", bg:"#161b27" }
    : { card:"#ffffff", border:"#e2e8f0", text:"#0f172a", muted:"#64748b", bg:"#f1f5f9" };

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "mentorRequests"), where("from", "==", currentUser.uid));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(docs);
      setHasSession(docs.some(r => r.status === "accepted"));
    });
    return unsub;
  }, [currentUser]);

  const handleRequest = async (mentor) => {
    if (!currentUser) return toast.error("Login required");
    setSubmitting(true);
    try {
      await addDoc(collection(db, "mentorRequests"), {
        from: currentUser.uid, fromName: currentUser.displayName || "Student",
        to: mentor.id, toName: mentor.name, topic, sessionType, message,
        selectedDate, selectedTime, status: "pending", timestamp: serverTimestamp(),
      });
      await addDoc(collection(db, `users/${currentUser.uid}/notifications`), {
        type: "mentor", message: `Request sent to ${mentor.name} for ${topic}`,
        read: false, timestamp: serverTimestamp(),
      });
      toast.success(`Request sent to ${mentor.name}`);
      setOpenModal(null);
      setMessage("");
    } catch { toast.error("Failed to send request"); }
    setSubmitting(false);
  };

  const filteredMentors = MENTORS.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) || m.expertise.some(e => e.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;
    if (filter === "Available") return m.online;
    if (filter === "Free") return m.price === "Free";
    if (filter === "Top Rated") return m.rating >= 4.8;
    return true;
  });

  const days = getNextDays();

  return (
    <Layout title="Mentorship">
      <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:1000, margin:"0 auto" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <h2 style={{ fontWeight:600, fontSize:18, color:s.text, margin:"0 0 2px", display:"flex", alignItems:"center", gap:8 }}>
              <GraduationCap size={18} color="#6366f1" />Find a Mentor
            </h2>
            <p style={{ color:s.muted, fontSize:13, margin:0 }}>Connect with experienced developers</p>
          </div>
          <button style={{ padding:"6px 14px", borderRadius:6, background:"transparent", color:"#6366f1", border:`1px solid ${s.border}`, fontWeight:500, fontSize:12, cursor:"pointer" }}>
            Become a Mentor
          </button>
        </div>

        {/* Filters */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search mentors or skills..."
            style={{ flex:1, minWidth:200, padding:"8px 12px", borderRadius:8, border:`1px solid ${s.border}`, background:s.card, color:s.text, fontSize:13, outline:"none" }} />
          {["All","Available","Free","Top Rated"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding:"5px 12px", borderRadius:6, fontSize:12, border:`1px solid ${filter===f?"#6366f1":s.border}`, background:filter===f?"rgba(99,102,241,0.08)":"transparent", color:filter===f?"#6366f1":s.muted, cursor:"pointer" }}>
              {f}
            </button>
          ))}
        </div>

        {/* Active session */}
        {hasSession && (
          <div style={{ background:s.card, border:`1px solid #0f9b8e`, borderRadius:10, padding:14, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:"#0f9b8e", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:600, fontSize:13 }}>SK</div>
              <div>
                <p style={{ fontWeight:600, fontSize:13, color:s.text, margin:0 }}>Dr. Sarah Khan</p>
                <p style={{ fontSize:12, color:s.muted, margin:0 }}>Today at 6:00 PM</p>
              </div>
            </div>
            <button style={{ padding:"6px 14px", borderRadius:6, background:"#0f9b8e", color:"white", border:"none", fontWeight:600, fontSize:12, cursor:"pointer" }}>Join</button>
          </div>
        )}

        {/* Mentor cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
          {filteredMentors.map(mentor => (
            <div key={mentor.id}>
              <div className="card-hover" style={{ background:s.card, border:`1px solid ${s.border}`, borderRadius:10, padding:16 }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:12 }}>
                  <div style={{ position:"relative", flexShrink:0 }}>
                    <div style={{ width:44, height:44, borderRadius:"50%", background:mentor.color, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:600, fontSize:16 }}>
                      {getInitials(mentor.name)}
                    </div>
                    {mentor.online && <div style={{ position:"absolute", bottom:1, right:1, width:10, height:10, borderRadius:"50%", background:"#10b981", border:`2px solid ${s.card}` }} />}
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:600, fontSize:14, color:s.text, margin:0 }}>{mentor.name}</p>
                    <p style={{ fontSize:12, color:s.muted, margin:0 }}>{mentor.role}</p>
                  </div>
                </div>

                <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:10 }}>
                  {mentor.expertise.map(e => (
                    <span key={e} style={{ fontSize:10, background:`${mentor.color}12`, color:mentor.color, padding:"2px 8px", borderRadius:4, fontWeight:500 }}>{e}</span>
                  ))}
                </div>

                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                  <span style={{ fontSize:13, color:s.text, fontWeight:500 }}>{mentor.rating}</span>
                  <span style={{ fontSize:12, color:s.muted }}>({mentor.reviews} reviews)</span>
                  <span style={{ fontSize:12, color:s.muted, marginLeft:"auto" }}>{mentor.sessions} sessions</span>
                </div>

                <p style={{ fontSize:12, color:s.muted, lineHeight:1.5, margin:"0 0 12px" }}>{mentor.bio}</p>

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:12, color:mentor.priceColor, fontWeight:500 }}>{mentor.price}</span>
                  <button onClick={() => setOpenModal(openModal === mentor.id ? null : mentor.id)}
                    style={{ padding:"6px 14px", borderRadius:6, background:"#6366f1", color:"white", border:"none", fontWeight:600, fontSize:12, cursor:"pointer" }}>
                    {openModal === mentor.id ? "Close" : "Request"}
                  </button>
                </div>
              </div>

              {openModal === mentor.id && (
                <div style={{ background:s.card, border:`1px solid #6366f1`, borderRadius:"0 0 10px 10px", borderTop:"none", padding:16, display:"flex", flexDirection:"column", gap:12 }}>
                  <p style={{ fontWeight:600, fontSize:14, color:s.text, margin:0 }}>Book {mentor.name}</p>

                  <div>
                    <label style={{ display:"block", fontSize:11, color:s.muted, marginBottom:4 }}>Topic</label>
                    <select value={topic} onChange={e => setTopic(e.target.value)}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${s.border}`, background:s.bg, color:s.text, fontSize:13, outline:"none" }}>
                      {TOPICS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display:"block", fontSize:11, color:s.muted, marginBottom:4 }}>Type</label>
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      {SESSION_TYPES.map(t => (
                        <label key={t} style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:s.text, cursor:"pointer" }}>
                          <input type="radio" name="sessionType" value={t} checked={sessionType===t} onChange={() => setSessionType(t)} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display:"block", fontSize:11, color:s.muted, marginBottom:4 }}>Date</label>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {days.map(d => (
                        <button key={d.full} onClick={() => setSelectedDate(d.full)}
                          style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${selectedDate===d.full?"#6366f1":s.border}`, background:selectedDate===d.full?"rgba(99,102,241,0.08)":"transparent", color:selectedDate===d.full?"#6366f1":s.muted, fontSize:11, cursor:"pointer" }}>
                          <span style={{ display:"block", fontWeight:500 }}>{d.label}</span>
                          <span style={{ fontSize:9 }}>{d.date}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display:"block", fontSize:11, color:s.muted, marginBottom:4 }}>Time</label>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {TIME_SLOTS.map(t => (
                        <button key={t} onClick={() => setSelectedTime(t)}
                          style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${selectedTime===t?"#6366f1":s.border}`, background:selectedTime===t?"rgba(99,102,241,0.08)":"transparent", color:selectedTime===t?"#6366f1":s.muted, fontSize:11, cursor:"pointer" }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea value={message} onChange={e => setMessage(e.target.value)}
                    placeholder="What would you like to work on?"
                    rows={2}
                    style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${s.border}`, background:s.bg, color:s.text, fontSize:13, outline:"none", resize:"vertical" }} />

                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => handleRequest(mentor)} disabled={submitting}
                      style={{ flex:1, padding:"8px", borderRadius:6, background:submitting?s.border:"#6366f1", color:"white", border:"none", fontWeight:600, fontSize:13, cursor:submitting?"not-allowed":"pointer" }}>
                      {submitting ? "Sending..." : "Confirm"}
                    </button>
                    <button onClick={() => setOpenModal(null)}
                      style={{ padding:"8px 14px", borderRadius:6, background:"transparent", color:s.muted, border:`1px solid ${s.border}`, cursor:"pointer", fontSize:13 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* My Requests */}
        {requests.length > 0 && (
          <div>
            <p style={{ fontWeight:600, fontSize:15, color:s.text, margin:"0 0 10px" }}>My Requests ({requests.length})</p>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {requests.map(req => (
                <div key={req.id} style={{ background:s.card, border:`1px solid ${s.border}`, borderRadius:10, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:"#6366f1", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:600, fontSize:12 }}>
                      {getInitials(req.toName || "M")}
                    </div>
                    <div>
                      <p style={{ fontWeight:500, fontSize:13, color:s.text, margin:0 }}>{req.toName}</p>
                      <p style={{ fontSize:11, color:s.muted, margin:0 }}>{req.topic} · {req.selectedDate} at {req.selectedTime}</p>
                    </div>
                  </div>
                  <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, fontWeight:500, background:req.status==="accepted"?"rgba(16,185,129,0.1)":"rgba(245,158,11,0.1)", color:req.status==="accepted"?"#10b981":"#f59e0b" }}>
                    {req.status==="accepted"?"Accepted":"Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
