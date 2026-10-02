import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../firebase/auth";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const s = isDark
    ? { bg:"#0f1117",card:"#1a1f2e",border:"#2d3748",text:"#f0f4ff",muted:"#8892a4",input:"#161b27" }
    : { bg:"#f8fafc",card:"#ffffff",border:"#e2e8f0",text:"#0f172a",muted:"#64748b",input:"#f1f5f9" };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      toast.error("Invalid email or password. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh",background:s.bg,display:"flex",alignItems:"stretch" }}>
      {/* Left panel */}
      <div style={{ flex:1,background:"linear-gradient(145deg,#4338ca 0%,#6366f1 50%,#0f9b8e 100%)",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:48 }} className="hidden lg:flex">
        <div style={{ textAlign:"center",maxWidth:380 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,justifyContent:"center",marginBottom:48 }}>
            <div style={{ width:36,height:36,background:"rgba(255,255,255,0.2)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:13,fontFamily:"monospace" }}>&gt;_</div>
            <span style={{ color:"white",fontWeight:600,fontSize:22 }}>DevLingo</span>
          </div>
          <h2 style={{ color:"white",fontSize:28,fontWeight:600,margin:"0 0 12px",lineHeight:1.3 }}>Learn to code with AI-powered guidance</h2>
          <p style={{ color:"rgba(255,255,255,0.7)",fontSize:15,lineHeight:1.7 }}>Adaptive tests, real-time feedback, and a structured roadmap to master programming.</p>
          <div style={{ display:"flex",gap:10,justifyContent:"center",marginTop:32,flexWrap:"wrap" }}>
            {["Adaptive AI","Streak System","Leaderboard"].map(f => (
              <span key={f} style={{ background:"rgba(255,255,255,0.15)",color:"white",padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:500 }}>{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width:"100%",maxWidth:460,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:32 }}>
        <div style={{ width:"100%" }}>
          <div style={{ display:"flex",justifyContent:"flex-end",marginBottom:20 }}>
            <button onClick={toggleTheme} style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:6,padding:"6px 12px",fontSize:12,color:s.muted,cursor:"pointer" }}>
              {isDark ? "Light" : "Dark"}
            </button>
          </div>

          <div style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:12,padding:32 }}>
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontWeight:600,fontSize:18,color:s.text,margin:"0 0 4px" }}>Sign in</h2>
              <p style={{ color:s.muted,fontSize:13,margin:0 }}>Welcome back to DevLingo</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display:"flex",flexDirection:"column",gap:14 }}>
              <div>
                <label style={{ display:"block",fontSize:12,fontWeight:500,color:s.muted,marginBottom:5 }}>Email</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                  placeholder="you@example.com"
                  style={{ width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${s.border}`,background:s.input,color:s.text,fontSize:14,outline:"none" }} />
              </div>
              <div>
                <label style={{ display:"block",fontSize:12,fontWeight:500,color:s.muted,marginBottom:5 }}>Password</label>
                <div style={{ position:"relative" }}>
                  <input type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} required
                    placeholder="••••••••"
                    style={{ width:"100%",padding:"10px 36px 10px 12px",borderRadius:8,border:`1px solid ${s.border}`,background:s.input,color:s.text,fontSize:14,outline:"none" }} />
                  <button type="button" onClick={() => setShowPw(p=>!p)}
                    style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:s.muted,fontSize:12 }}>
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                style={{ padding:"10px",borderRadius:8,background:"#6366f1",color:"white",border:"none",fontWeight:600,fontSize:14,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,marginTop:4 }}>
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p style={{ textAlign:"center",marginTop:24,fontSize:13,color:s.muted }}>
              Don't have an account?{" "}
              <Link to="/signup" style={{ color:"#6366f1",fontWeight:500,textDecoration:"none" }}>Sign up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

