import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup, resendVerification } from "../firebase/auth";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";

export default function Signup() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const s = isDark
    ? { bg:"#0f1117",card:"#1a1f2e",border:"#2d3748",text:"#f0f4ff",muted:"#8892a4",input:"#161b27" }
    : { bg:"#f8fafc",card:"#ffffff",border:"#e2e8f0",text:"#0f172a",muted:"#64748b",input:"#f1f5f9" };

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4 : 3;
  const strengthColors = ["#ef4444","#f97316","#f59e0b","#10b981"];
  const strengthLabels = ["","Weak","Fair","Good","Strong"];

  const handleFirstNameChange = (e) => {
    const val = e.target.value.replace(/[^a-zA-Z]/g, "");
    setFirstName(val);
  };

  const handleLastNameChange = (e) => {
    const val = e.target.value.replace(/[^a-zA-Z]/g, "");
    setLastName(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const fullName = `${firstName || ""} ${lastName || ""}`.trim();

    if (!fullName || fullName.length < 2) {
      setError("Please enter your name.");
      return;
    }
    if (!email) {
      setError("Please enter your email.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await signup(email, password, fullName);
      toast.success("Account created successfully! Welcome to DevLingo.");
      navigate("/dashboard");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered. If you need a verification email, click Sign in or try logging in.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else {
        setError(err.message || "Signup failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResending(true);
      await resendVerification(email, password);
      toast.success("Verification email resent! Check your inbox and spam folder.");
    } catch (err) {
      toast.error(err.message || "Failed to resend verification email.");
    } finally {
      setResending(false);
    }
  };

  if (verificationSent) {
    return (
      <div style={{ minHeight:"100vh",background:s.bg,display:"flex",alignItems:"stretch" }}>
        <div style={{ flex:1,background:"linear-gradient(145deg,#4338ca 0%,#6366f1 50%,#0f9b8e 100%)",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:48 }} className="hidden lg:flex">
          <div style={{ textAlign:"center",maxWidth:360 }}>
            <h2 style={{ color:"white",fontSize:28,fontWeight:600,margin:"0 0 12px",lineHeight:1.3 }}>Start your coding journey</h2>
            <p style={{ color:"rgba(255,255,255,0.7)",fontSize:15,lineHeight:1.7,marginBottom:32 }}>Join developers learning with AI-powered adaptive courses</p>
          </div>
        </div>

        <div style={{ width:"100%",maxWidth:480,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:32 }}>
          <div style={{ width:"100%" }}>
            <div style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:12,padding:32,textAlign:"center" }}>
              <div style={{ width:56,height:56,borderRadius:"50%",background:"rgba(99,102,241,0.1)",color:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:24 }}>
                ✉️
              </div>
              <h2 style={{ fontWeight:600,fontSize:22,color:s.text,margin:"0 0 12px" }}>Check your email!</h2>
              <p style={{ color:s.muted,fontSize:14,lineHeight:1.6,margin:"0 0 24px" }}>
                We sent a verification link to <strong style={{ color:s.text }}>{email}</strong>. Open your email inbox (or check Spam/Junk folder), click the verification link, then sign in.
              </p>

              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <button
                  onClick={() => navigate("/login")}
                  style={{ width:"100%",padding:"12px",borderRadius:8,background:"#6366f1",color:"white",border:"none",fontWeight:600,fontSize:14,cursor:"pointer" }}>
                  Go to Login
                </button>
                <button
                  onClick={handleResend}
                  disabled={resending}
                  style={{ width:"100%",padding:"10px",borderRadius:8,background:"transparent",color:s.muted,border:`1px solid ${s.border}`,fontWeight:500,fontSize:13,cursor:resending?"not-allowed":"pointer",opacity:resending?0.6:1 }}>
                  {resending ? "Resending Email..." : "Resend Verification Email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh",background:s.bg,display:"flex",alignItems:"stretch" }}>
      <div style={{ flex:1,background:"linear-gradient(145deg,#4338ca 0%,#6366f1 50%,#0f9b8e 100%)",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:48 }} className="hidden lg:flex">
        <div style={{ textAlign:"center",maxWidth:360 }}>
          <h2 style={{ color:"white",fontSize:28,fontWeight:600,margin:"0 0 12px",lineHeight:1.3 }}>Start your coding journey</h2>
          <p style={{ color:"rgba(255,255,255,0.7)",fontSize:15,lineHeight:1.7,marginBottom:32 }}>Join developers learning with AI-powered adaptive courses</p>
          <div style={{ display:"flex",flexDirection:"column",gap:10,alignItems:"flex-start",textAlign:"left" }}>
            {["Personalized study plans","Real-time progress tracking","AI coding tutor","Community leaderboard"].map(f => (
              <span key={f} style={{ color:"rgba(255,255,255,0.85)",fontSize:14,display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ width:5,height:5,background:"rgba(255,255,255,0.6)",borderRadius:"50%",flexShrink:0 }} />
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ width:"100%",maxWidth:480,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:32 }}>
        <div style={{ width:"100%" }}>
          <div style={{ background:s.card,border:`1px solid ${s.border}`,borderRadius:12,padding:32 }}>
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontWeight:600,fontSize:18,color:s.text,margin:"0 0 4px" }}>Create account</h2>
              <p style={{ color:s.muted,fontSize:13,margin:0 }}>Get started with DevLingo</p>
            </div>

            {error && (
              <div style={{ background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444",padding:"10px 12px",borderRadius:8,fontSize:13,marginBottom:16 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display:"flex",flexDirection:"column",gap:14 }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div>
                  <label style={{ display:"block",fontSize:12,fontWeight:500,color:s.muted,marginBottom:5 }}>
                    First Name <span style={{ fontSize:10, color:"#6366f1" }}>(Alphabets only)</span>
                  </label>
                  <input type="text" value={firstName} onChange={handleFirstNameChange} required
                    placeholder="First name"
                    style={{ width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${s.border}`,background:s.input,color:s.text,fontSize:14,outline:"none" }} />
                </div>
                <div>
                  <label style={{ display:"block",fontSize:12,fontWeight:500,color:s.muted,marginBottom:5 }}>
                    Last Name <span style={{ fontSize:10, color:"#6366f1" }}>(Alphabets only)</span>
                  </label>
                  <input type="text" value={lastName} onChange={handleLastNameChange} required
                    placeholder="Last name"
                    style={{ width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${s.border}`,background:s.input,color:s.text,fontSize:14,outline:"none" }} />
                </div>
              </div>

              <div>
                <label style={{ display:"block",fontSize:12,fontWeight:500,color:s.muted,marginBottom:5 }}>Email</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                  placeholder="you@example.com"
                  style={{ width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${s.border}`,background:s.input,color:s.text,fontSize:14,outline:"none" }} />
              </div>

              <div>
                <label style={{ display:"block",fontSize:12,fontWeight:500,color:s.muted,marginBottom:5 }}>Password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Min 6 characters"
                  style={{ width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${s.border}`,background:s.input,color:s.text,fontSize:14,outline:"none" }} />
                {password && (
                  <div style={{ marginTop:6 }}>
                    <div style={{ display:"flex",gap:3,marginBottom:3 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{ flex:1,height:2,borderRadius:2,background: strength>=i ? strengthColors[strength-1] : s.border }} />
                      ))}
                    </div>
                    <span style={{ fontSize:11,color: strengthColors[strength-1] }}>{strengthLabels[strength]}</span>
                  </div>
                )}
              </div>
              <div>
                <label style={{ display:"block",fontSize:12,fontWeight:500,color:s.muted,marginBottom:5 }}>Confirm Password</label>
                <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required placeholder="Repeat password"
                  style={{ width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${confirm && confirm!==password?"#ef4444":s.border}`,background:s.input,color:s.text,fontSize:14,outline:"none" }} />
                {confirm && confirm !== password && <p style={{ color:"#ef4444",fontSize:11,marginTop:3 }}>Passwords don't match</p>}
              </div>
              <button type="submit" disabled={loading}
                style={{ padding:"10px",borderRadius:8,background:"#6366f1",color:"white",border:"none",fontWeight:600,fontSize:14,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,marginTop:4 }}>
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>
            <p style={{ textAlign:"center",marginTop:18,fontSize:13,color:s.muted }}>
              Already have an account?{" "}
              <Link to="/login" style={{ color:"#6366f1",fontWeight:500,textDecoration:"none" }}>Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
