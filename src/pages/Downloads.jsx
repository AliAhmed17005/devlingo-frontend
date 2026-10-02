import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import Layout from "../components/Layout";
import toast from "react-hot-toast";
import { Download } from "lucide-react";

const DOWNLOADED_ITEMS = [
  { id:"d1", title:"Arrays & Methods — Full Lecture", course:"JavaScript Mastery", size:"245 MB", date:"Oct 15", type:"video", color:"#6366f1", init:"V" },
  { id:"d2", title:"ES6+ Features Cheatsheet", course:"JavaScript Mastery", size:"1.2 MB", date:"Oct 14", type:"notes", color:"#0f9b8e", init:"N" },
  { id:"d3", title:"Pandas Deep Dive", course:"Python for Data Science", size:"380 MB", date:"Oct 12", type:"video", color:"#f59e0b", init:"V" },
  { id:"d4", title:"NumPy Notes", course:"Python for Data Science", size:"0.8 MB", date:"Oct 11", type:"notes", color:"#0f9b8e", init:"N" },
  { id:"d5", title:"Test 3 — Arrays Practice", course:"JavaScript Mastery", size:"0.2 MB", date:"Oct 10", type:"test", color:"#8b5cf6", init:"T" },
  { id:"d6", title:"Hooks In Depth", course:"React & Next.js", size:"420 MB", date:"Oct 8", type:"video", color:"#6366f1", init:"V" },
];

const ACTIVE_DL = [
  { id:"a1", title:"Promises & Async/Await", course:"JS Mastery", progress:41, speed:"1.2 MB/s", color:"#6366f1", init:"JS" },
  { id:"a2", title:"Pandas Complete Guide", course:"Python DS", progress:76, speed:"0.8 MB/s", color:"#f59e0b", init:"PY" },
];

export default function Downloads() {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState("All");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [quality, setQuality] = useState("720p");
  const [wifiOnly, setWifiOnly] = useState(true);
  const [autoDelete, setAutoDelete] = useState(false);
  const [storageLimit, setStorageLimit] = useState(5);
  const [progresses, setProgresses] = useState({ a1: 41, a2: 76 });

  useEffect(() => {
    const interval = setInterval(() => {
      setProgresses(prev => ({ a1: Math.min(prev.a1 + 0.3, 99), a2: Math.min(prev.a2 + 0.15, 99) }));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#161b27" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f1f5f9" };

  const filtered = DOWNLOADED_ITEMS.filter(item => {
    if (activeTab === "Videos") return item.type === "video";
    if (activeTab === "Notes") return item.type === "notes";
    if (activeTab === "Tests") return item.type === "test";
    return true;
  });

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const Toggle = ({ value, onChange }) => (
    <div onClick={() => onChange(!value)}
      style={{ width: 40, height: 22, borderRadius: 11, background: value ? "#6366f1" : s.border, cursor: "pointer", position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: value ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
    </div>
  );

  return (
    <Layout title="Downloads">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, margin: "0 auto" }}>

        <div>
          <h2 style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 2px", display: "flex", alignItems: "center", gap: 8 }}>
            <Download size={18} color="#6366f1" />Downloads
          </h2>
          <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>Manage offline content</p>
        </div>

        {/* Storage */}
        <div className="card-hover" style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0 }}>Storage</p>
            <p style={{ fontSize: 13, color: s.muted, margin: 0 }}>2.4 GB / {storageLimit} GB</p>
          </div>
          <div style={{ height: 4, borderRadius: 4, overflow: "hidden", display: "flex", background: s.border }}>
            <div style={{ width: "36%", background: "#6366f1" }} />
            <div style={{ width: "8%", background: "#0f9b8e" }} />
            <div style={{ width: "4%", background: "#f59e0b" }} />
          </div>
        </div>

        {/* Active downloads */}
        {ACTIVE_DL.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: "0 0 10px" }}>Downloading ({ACTIVE_DL.length})</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ACTIVE_DL.map(item => (
                <div key={item.id} className="card-hover" style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: `${item.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: item.color, fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                      {item.init}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 500, fontSize: 13, color: s.text, margin: 0 }}>{item.title}</p>
                      <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>{item.course} · {item.speed}</p>
                    </div>
                    <button onClick={() => toast("Cancelled")} style={{ padding: "4px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${s.border}`, color: s.muted, fontSize: 11, cursor: "pointer" }}>Cancel</button>
                  </div>
                  <div style={{ height: 3, background: s.border, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progresses[item.id]}%`, background: item.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 10, color: s.muted }}>{Math.round(progresses[item.id])}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs and list */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 2, background: s.card, padding: 3, borderRadius: 8, border: `1px solid ${s.border}` }}>
              {["All","Videos","Notes","Tests"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: activeTab === tab ? "#6366f1" : "transparent", color: activeTab === tab ? "white" : s.muted, fontSize: 12, fontWeight: activeTab === tab ? 600 : 400, cursor: "pointer" }}>
                  {tab}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {selectMode && selected.length > 0 && (
                <button onClick={() => { setSelected([]); setSelectMode(false); toast.success(`Deleted ${selected.length} items`); }}
                  style={{ padding: "5px 12px", borderRadius: 6, background: "#ef4444", color: "white", border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Delete ({selected.length})
                </button>
              )}
              <button onClick={() => { setSelectMode(p => !p); setSelected([]); }}
                style={{ padding: "5px 12px", borderRadius: 6, background: "transparent", color: selectMode ? "#ef4444" : s.muted, border: `1px solid ${selectMode ? "#ef4444" : s.border}`, fontSize: 11, cursor: "pointer" }}>
                {selectMode ? "Cancel" : "Select"}
              </button>
            </div>
          </div>

          <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, overflow: "hidden" }}>
            {filtered.map((item, i) => (
              <div key={item.id} onClick={() => selectMode && toggleSelect(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: i < filtered.length - 1 ? `1px solid ${s.border}` : "none", background: selected.includes(item.id) ? "rgba(99,102,241,0.06)" : "transparent", cursor: selectMode ? "pointer" : "default" }}>
                {selectMode && <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} style={{ accentColor: "#6366f1" }} />}
                <div style={{ width: 32, height: 32, borderRadius: 6, background: `${item.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: item.color, fontWeight: 600, fontSize: 11, flexShrink: 0 }}>{item.init}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 500, fontSize: 13, color: s.text, margin: 0 }}>{item.title}</p>
                  <p style={{ fontSize: 11, color: s.muted, margin: 0 }}>{item.course}</p>
                </div>
                <span style={{ fontSize: 11, color: s.muted }}>{item.size}</span>
                <span style={{ fontSize: 10, color: "#10b981" }}>Offline</span>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div style={{ background: s.card, border: `1px solid ${s.border}`, borderRadius: 10, padding: 16 }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: "0 0 12px" }}>Settings</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {["360p","720p","1080p"].map(q => (
              <button key={q} onClick={() => setQuality(q)}
                style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${quality === q ? "#6366f1" : s.border}`, background: quality === q ? "rgba(99,102,241,0.08)" : "transparent", color: quality === q ? "#6366f1" : s.muted, fontSize: 12, cursor: "pointer" }}>
                {q}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: s.text }}>WiFi only</span>
              <Toggle value={wifiOnly} onChange={setWifiOnly} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: s.text }}>Auto-delete after 30 days</span>
              <Toggle value={autoDelete} onChange={setAutoDelete} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: s.text }}>Storage limit</span>
                <span style={{ fontSize: 13, color: "#6366f1", fontWeight: 500 }}>{storageLimit} GB</span>
              </div>
              <input type="range" min={1} max={10} value={storageLimit} onChange={e => setStorageLimit(+e.target.value)}
                style={{ width: "100%", accentColor: "#6366f1", cursor: "pointer" }} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
