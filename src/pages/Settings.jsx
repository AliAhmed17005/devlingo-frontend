import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db, auth } from "../firebase/config";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { linkGoogleAccount, linkGithubAccount, unlinkAccount } from "../firebase/auth";
import Layout from "../components/Layout";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)}
      style={{ width:44, height:24, borderRadius:12, background: value?"#6366f1":"#374151", cursor:"pointer", position:"relative", transition:"background 0.2s", flexShrink:0 }}>
      <div style={{ position:"absolute", top:3, left: value?23:3, width:18, height:18, borderRadius:"50%", background:"white", transition:"left 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.3)" }} />
    </div>
  );
}

export default function Settings() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [userData, setUserData] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // profile fields
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername]       = useState("");
  const [bio, setBio]                 = useState("");
  const [location, setLocation]       = useState("");
  const [website, setWebsite]         = useState("");
  const [avatarUrl, setAvatarUrl]     = useState("");

  // preferences
  const [dailyGoal, setDailyGoal]   = useState(45);
  const [reminder, setReminder]     = useState("09:00");
  const [difficulty, setDifficulty] = useState("Auto-Adaptive");
  const [notifs, setNotifs] = useState({
    dailyReminders:true, deadlineAlerts:true, challengeInvites:true,
    communityMentions:false, streakWarnings:true, weeklyReport:true,
  });

  // security
  const [currPw, setCurrPw]     = useState("");
  const [newPw, setNewPw]       = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw]     = useState({ curr:false, new:false, conf:false });

  const card  = isDark ? "#1a1f2e" : "#ffffff";
  const card2 = isDark ? "#161b27" : "#f8fafc";
  const bdr   = isDark ? "#2d3748" : "#e2e8f0";
  const txt   = isDark ? "#f0f4ff" : "#0f172a";
  const muted = isDark ? "#8892a4" : "#64748b";

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setUserData(d);
        setDisplayName(d.name || currentUser.displayName || "");
        setUsername(d.username || "");
        setBio(d.bio || "");
        setLocation(d.location || "");
        setWebsite(d.website || "");
        setDailyGoal(d.dailyGoal || 45);
        setReminder(d.reminderTime || "09:00");
        setDifficulty(d.preferredDifficulty || "Auto-Adaptive");
        setAvatarUrl(d.avatarUrl || "");
        if (d.notifications) setNotifs(prev => ({ ...prev, ...d.notifications }));
      }
    });
    return unsub;
  }, [currentUser]);

  const handleConnectGoogle = async () => {
    setSaving(true);
    try {
      const res = await linkGoogleAccount();
      const googleEmail = res.user?.email || currentUser?.email || "";
      await updateDoc(doc(db, "users", currentUser.uid), {
        "connectedAccounts.google": true,
        "connectedAccounts.googleEmail": googleEmail
      });
      toast.success("Google account connected successfully!");
    } catch (err) {
      console.error("Google connect error:", err);
      if (err.code === "auth/provider-already-linked") {
        toast.error("Google account is already linked.");
      } else if (err.code === "auth/credential-already-in-use") {
        toast.error("This Google account is already used by another user.");
      } else if (err.code === "auth/popup-closed-by-user") {
        toast.error("Connection window closed.");
      } else {
        toast.error("Failed to connect Google account.");
      }
    }
    setSaving(false);
  };

  const handleConnectGithub = async () => {
    setSaving(true);
    try {
      const res = await linkGithubAccount();
      const githubEmail = res.user?.email || "";
      await updateDoc(doc(db, "users", currentUser.uid), {
        "connectedAccounts.github": true,
        "connectedAccounts.githubEmail": githubEmail
      });
      toast.success("GitHub account connected successfully!");
    } catch (err) {
      console.error("GitHub connect error:", err);
      if (err.code === "auth/provider-already-linked") {
        toast.error("GitHub account is already linked.");
      } else if (err.code === "auth/credential-already-in-use") {
        toast.error("This GitHub account is already used by another user.");
      } else if (err.code === "auth/popup-closed-by-user") {
        toast.error("Connection window closed.");
      } else {
        toast.error("Failed to connect GitHub account.");
      }
    }
    setSaving(false);
  };

  const handleDisconnect = async (providerId, accountKey) => {
    setSaving(true);
    try {
      const providerObj = currentUser?.providerData?.find(p => p.providerId === providerId);
      if (providerObj) {
        await unlinkAccount(providerId);
      }
      await updateDoc(doc(db, "users", currentUser.uid), {
        [`connectedAccounts.${accountKey}`]: false
      });
      toast.success(`${accountKey.charAt(0).toUpperCase() + accountKey.slice(1)} account disconnected.`);
    } catch (err) {
      console.error("Disconnect error:", err);
      toast.error("Failed to disconnect account.");
    }
    setSaving(false);
  };

  const isGoogleConnected = currentUser?.providerData?.some(p => p.providerId === "google.com") || Boolean(userData?.connectedAccounts?.google);
  const isGithubConnected = currentUser?.providerData?.some(p => p.providerId === "github.com") || Boolean(userData?.connectedAccounts?.github);


  const resizeImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          
          const MAX_WIDTH = 128;
          const MAX_HEIGHT = 128;
          
          canvas.width = MAX_WIDTH;
          canvas.height = MAX_HEIGHT;
          
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          
          ctx.drawImage(img, sx, sy, size, size, 0, 0, MAX_WIDTH, MAX_HEIGHT);
          
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          resolve(dataUrl);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      return toast.error("File size exceeds 5 MB");
    }
    
    try {
      const compressed = await resizeImage(file);
      setAvatarUrl(compressed);
      toast.success("Image selected! Click Save Profile to apply.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to process image");
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        name: displayName, username, bio, location, website,
        avatarUrl,
        updatedAt: serverTimestamp(),
      });
      await updateProfile(auth.currentUser, { displayName });
      toast.success("Profile saved ✓");
    } catch (e) { 
      console.error("Save profile error:", e);
      toast.error("Save failed: " + (e.message || e)); 
    }
    setSaving(false);
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        dailyGoal, reminderTime: reminder,
        preferredDifficulty: difficulty,
        notifications: notifs,
      });
      toast.success("Preferences saved ✓");
    } catch { toast.error("Save failed"); }
    setSaving(false);
  };

  const handlePasswordUpdate = async () => {
    if (newPw !== confirmPw) return toast.error("Passwords don't match");
    if (newPw.length < 6) return toast.error("Password must be 6+ characters");
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currPw);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPw);
      toast.success("Password updated ✓");
      setCurrPw(""); setNewPw(""); setConfirmPw("");
    } catch (e) {
      toast.error(e.code === "auth/wrong-password" ? "Current password is incorrect" : "Update failed");
    }
  };

  const handleSignOut = async (all = false) => {
    await signOut(auth);
    navigate("/login");
    toast.success(all ? "Signed out of all devices" : "Signed out");
  };

  const initials = displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  const pwStrength = newPw.length === 0 ? 0 : newPw.length < 6 ? 1 : newPw.length < 10 ? 2 : /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) ? 4 : 3;
  const pwColors   = ["#ef4444","#f97316","#f59e0b","#10b981"];
  const pwLabels   = ["","Weak","Fair","Good","Strong"];

  const inputStyle = {
    width:"100%", padding:"10px 12px", borderRadius:9,
    border:`1px solid ${bdr}`, background:card2,
    color:txt, fontSize:14, outline:"none",
  };

  const cardStyle = {
    background:card, border:`1px solid ${bdr}`,
    borderRadius:10, padding:"18px 20px", marginBottom:14,
  };

  const sectionTitle = (t) => (
    <p style={{ fontWeight:600, fontSize:15, color:txt, margin:"0 0 14px" }}>{t}</p>
  );

  const labelStyle = { display:"block", fontSize:12, color:muted, fontWeight:500, marginBottom:5 };

  return (
    <Layout title="Settings">
      <div style={{ display:"flex", gap:20, alignItems:"flex-start", flexWrap:"wrap" }}>

        {/* ══ LEFT COLUMN ══════════════════════════════════════════ */}
        <div style={{ flex:"0 0 calc(63% - 10px)", minWidth:280 }}>

          {/* Profile card */}
          <div style={cardStyle}>
            {sectionTitle("Public Profile")}

             {/* Avatar */}
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20 }}>
              <div style={{ width:72, height:72, borderRadius:"50%", background:"#6366f1", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:26, flexShrink:0, overflow:"hidden" }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                ) : (
                  initials
                )}
              </div>
              <div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: "none" }} />
                <button onClick={() => fileInputRef.current?.click()} style={{ color:"#6366f1", background:"none", border:"none", fontWeight:600, fontSize:14, cursor:"pointer", padding:0 }}>Change Photo</button>
                <p style={{ fontSize:12, color:muted, margin:"4px 0 0" }}>JPG, PNG up to 5 MB</p>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <div>
                <label style={labelStyle}>
                  Display Name <span style={{ fontSize:10, color:"#6366f1" }}>(Alphabets only)</span>
                </label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value.replace(/[^a-zA-Z\s]/g, ''))} style={inputStyle} placeholder="Your Name" />
              </div>
              <div>
                <label style={labelStyle}>Username</label>
                <div style={{ position:"relative" }}>
                  <input value={username} onChange={e => setUsername(e.target.value)} style={{ ...inputStyle, paddingRight:90 }} placeholder="@username" />
                  <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:11, color:"#34d399", fontWeight:600 }}>✓ Available</span>
                </div>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <div style={{ position:"relative" }}>
                  <input value={currentUser?.email || ""} readOnly style={{ ...inputStyle, opacity:0.7, cursor:"default" }} />
                  <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:11, color:"#34d399", fontWeight:600 }}>✓ Verified</span>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Your Chat Tag ID</label>
                <input value={userData?.tagId || "---"} readOnly style={{ ...inputStyle, opacity:0.8, cursor:"default", fontWeight:600, color:"#6366f1" }} />
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={labelStyle}>Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value.slice(0,150))} rows={3}
                placeholder="Tell others about yourself..."
                style={{ ...inputStyle, resize:"vertical", lineHeight:1.5 }} />
              <p style={{ fontSize:11, color:muted, margin:"3px 0 0", textAlign:"right" }}>{bio.length}/150</p>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
              <div>
                <label style={labelStyle}>Location</label>
                <input value={location} onChange={e => setLocation(e.target.value)} style={inputStyle} placeholder="City, Country" />
              </div>
              <div>
                <label style={labelStyle}>Website</label>
                <input value={website} onChange={e => setWebsite(e.target.value)} style={inputStyle} placeholder="https://" />
              </div>
            </div>

            <button onClick={saveProfile} disabled={saving}
              style={{ padding:"10px 24px", borderRadius:10, background:"#6366f1", color:"white", border:"none", fontWeight:600, fontSize:14, cursor:"pointer", float:"right" }}>
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <div style={{ clear:"both" }} />
          </div>

          {/* Learning Preferences */}
          <div style={cardStyle}>
            {sectionTitle("Learning Preferences")}

            <div style={{ marginBottom:18 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <label style={{ ...labelStyle, margin:0 }}>Daily Learning Goal</label>
                <span style={{ fontSize:13, color:"#818cf8", fontWeight:700 }}>{dailyGoal} mins</span>
              </div>
              <input type="range" min={15} max={120} step={5} value={dailyGoal} onChange={e => setDailyGoal(+e.target.value)}
                style={{ width:"100%", accentColor:"#6366f1", cursor:"pointer" }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:muted, marginTop:3 }}>
                {["15m","30m","45m","60m","90m","120m"].map(l => <span key={l}>{l}</span>)}
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
              <div>
                <label style={labelStyle}>Daily Reminder</label>
                <input type="time" value={reminder} onChange={e => setReminder(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Preferred Difficulty</label>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={{ ...inputStyle, cursor:"pointer" }}>
                  {["Beginner","Auto-Adaptive","Intermediate","Advanced"].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <p style={{ fontSize:12, fontWeight:600, color:muted, letterSpacing:"0.05em", textTransform:"uppercase", margin:"0 0 12px" }}>Notifications</p>
            <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:18 }}>
              {[
                ["dailyReminders","Daily task reminders","Get notified about your daily tasks"],
                ["deadlineAlerts","Deadline alerts","Reminders before task deadlines"],
                ["challengeInvites","Challenge invites","When someone challenges you"],
                ["communityMentions","Community mentions","When you're mentioned in groups"],
                ["streakWarnings","Streak warnings","Don't lose your streak"],
                ["weeklyReport","Weekly report","Your weekly progress summary"],
              ].map(([key, label, desc]) => (
                <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                  <div>
                    <p style={{ fontWeight:500, fontSize:14, color:txt, margin:0 }}>{label}</p>
                    <p style={{ fontSize:12, color:muted, margin:0 }}>{desc}</p>
                  </div>
                  <Toggle value={notifs[key]} onChange={v => setNotifs(prev => ({ ...prev, [key]:v }))} />
                </div>
              ))}
            </div>

            <button onClick={savePrefs} disabled={saving}
              style={{ padding:"10px 24px", borderRadius:10, background:"#6366f1", color:"white", border:"none", fontWeight:600, fontSize:14, cursor:"pointer" }}>
              Save Preferences
            </button>
          </div>

          {/* Security */}
          <div style={cardStyle}>
            {sectionTitle("Security")}
            {[
              ["Current Password","curr",currPw,setCurrPw],
              ["New Password","new",newPw,setNewPw],
              ["Confirm New Password","conf",confirmPw,setConfirmPw],
            ].map(([label,key,val,setter]) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={labelStyle}>{label}</label>
                <div style={{ position:"relative" }}>
                  <input type={showPw[key]?"text":"password"} value={val} onChange={e => setter(e.target.value)}
                    placeholder="••••••••" style={{ ...inputStyle, paddingRight:40 }} />
                  <button type="button" onClick={() => setShowPw(p => ({ ...p, [key]:!p[key] }))}
                    style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:muted, fontSize:16 }}>
                    {showPw[key]?"🙈":"👁️"}
                  </button>
                </div>
                {key==="new" && newPw && (
                  <div style={{ marginTop:6 }}>
                    <div style={{ display:"flex", gap:3, marginBottom:3 }}>
                      {[1,2,3,4].map(i => <div key={i} style={{ flex:1, height:3, borderRadius:3, background: pwStrength>=i?pwColors[pwStrength-1]:bdr, transition:"background 0.2s" }} />)}
                    </div>
                    <span style={{ fontSize:11, color:pwColors[pwStrength-1] }}>{pwLabels[pwStrength]}</span>
                  </div>
                )}
              </div>
            ))}
            <button onClick={handlePasswordUpdate}
              style={{ padding:"10px 20px", borderRadius:10, background:"#6366f1", color:"white", border:"none", fontWeight:600, fontSize:14, cursor:"pointer" }}>
              Update Password
            </button>
          </div>

          {/* Danger Zone */}
          <div style={{ ...cardStyle, borderColor:"#ef4444", borderWidth:1.5, marginBottom:0 }}>
            <p style={{ fontWeight:700, fontSize:16, color:"#ef4444", margin:"0 0 8px" }}>Danger Zone</p>
            <p style={{ fontSize:13, color:muted, margin:"0 0 14px" }}>Once you delete your account, there is no going back. Please be certain.</p>
            <button style={{ padding:"9px 20px", borderRadius:10, background:"transparent", color:"#ef4444", border:"1.5px solid #ef4444", fontWeight:600, fontSize:14, cursor:"pointer" }}>
              Delete My Account
            </button>
          </div>
        </div>

        {/* ══ RIGHT COLUMN ═════════════════════════════════════════ */}
        <div style={{ flex:"0 0 calc(37% - 10px)", minWidth:240 }}>

          {/* Profile preview */}
          <div style={{ ...cardStyle, textAlign:"center" }}>
            <p style={{ fontSize:11, fontWeight:600, color:muted, letterSpacing:"0.06em", textTransform:"uppercase", margin:"0 0 14px" }}>How Others See You</p>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"#6366f1", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:24, margin:"0 auto 10px", overflow:"hidden" }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              ) : (
                initials
              )}
            </div>
            <p style={{ fontWeight:700, fontSize:16, color:txt, margin:"0 0 2px" }}>{displayName || "Your Name"}</p>
            <p style={{ fontSize:13, color:muted, margin:"0 0 2px" }}>{username || "@username"}</p>
            <p style={{ fontSize:12, color:"#6366f1", fontWeight:600, margin:"0 0 10px" }}>Tag: {userData?.tagId || "---"}</p>
            <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
              <span style={{ background:"rgba(245,158,11,0.15)", color:"#fbbf24", padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:600 }}>Gold Tier</span>
              <span style={{ background:"rgba(99,102,241,0.15)", color:"#818cf8", padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:600 }}>{userData?.totalPoints || 0} XP</span>
            </div>
            {userData?.enrolledCourses?.[0] && (
              <p style={{ fontSize:12, color:muted, margin:"10px 0 0" }}>Current: JavaScript Mastery</p>
            )}
          </div>

          {/* Pro Member */}
          <div style={cardStyle}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <span style={{ fontSize:22 }}>👑</span>
              <p style={{ fontWeight:700, fontSize:16, color:"#fbbf24", margin:0 }}>Pro Member</p>
            </div>
            <p style={{ fontSize:13, color:muted, margin:"0 0 10px" }}>Renews on Jan 1, 2026</p>
            <div style={{ display:"flex", gap:12 }}>
              <button style={{ color:"#6366f1", background:"none", border:"none", fontWeight:600, fontSize:13, cursor:"pointer", padding:0 }}>Manage Subscription</button>
              <button style={{ color:"#ef4444", background:"none", border:"none", fontWeight:500, fontSize:13, cursor:"pointer", padding:0 }}>Cancel Plan</button>
            </div>
          </div>

          {/* Connected accounts */}
          <div style={cardStyle}>
            <p style={{ fontWeight:700, fontSize:15, color:txt, margin:"0 0 14px" }}>Connected Accounts</p>
            {[
              {
                name: "Google",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                ),
                connected: isGoogleConnected,
                onConnect: handleConnectGoogle,
                onDisconnect: () => handleDisconnect("google.com", "google")
              },
              {
                name: "GitHub",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={txt}>
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                ),
                connected: isGithubConnected,
                onConnect: handleConnectGithub,
                onDisconnect: () => handleDisconnect("github.com", "github")
              }
            ].map(acc => (
              <div key={acc.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${bdr}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {acc.icon}
                  <span style={{ fontSize:14, color:txt, fontWeight:500 }}>{acc.name}</span>
                </div>
                {acc.connected
                  ? <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize:12, color:"#34d399", fontWeight:600 }}>✓ Connected</span>
                      <button onClick={acc.onDisconnect} disabled={saving} style={{ color:muted, background:"none", border:"none", fontSize:12, cursor:"pointer" }}>Disconnect</button>
                    </div>
                  : <button onClick={acc.onConnect} disabled={saving} style={{ color:"#6366f1", background:"none", border:"none", fontWeight:600, fontSize:13, cursor:"pointer" }}>Connect</button>
                }
              </div>
            ))}
          </div>

          {/* Data export */}
          <div style={cardStyle}>
            <p style={{ fontWeight:700, fontSize:15, color:txt, margin:"0 0 12px" }}>Data Export</p>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={() => toast.success("Downloading learning history...")}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:9, background:card2, border:`1px solid ${bdr}`, color:txt, fontSize:13, cursor:"pointer", width:"100%", textAlign:"left" }}>
                ⬇️ Download learning history (CSV)
              </button>
              <button onClick={() => toast.success("Downloading certificates...")}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:9, background:card2, border:`1px solid ${bdr}`, color:txt, fontSize:13, cursor:"pointer", width:"100%", textAlign:"left" }}>
                ⬇️ Download certificates
              </button>
            </div>
          </div>

          {/* Sign out */}
          <div style={{ ...cardStyle, marginBottom:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <span>↩</span>
              <p style={{ fontWeight:700, fontSize:15, color:txt, margin:0 }}>Sign Out</p>
            </div>
            <p style={{ fontSize:13, color:muted, margin:"0 0 14px" }}>You'll be signed out of this session</p>

            {!showConfirm ? (
              <button onClick={() => setShowConfirm(true)}
                style={{ width:"100%", padding:"11px", borderRadius:10, background:"#ef4444", color:"white", border:"none", fontWeight:600, fontSize:14, cursor:"pointer", marginBottom:8 }}>
                Sign Out of This Device
              </button>
            ) : (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid #ef4444", borderRadius:10, padding:14, marginBottom:8 }}>
                <p style={{ fontWeight:600, fontSize:14, color:txt, margin:"0 0 10px" }}>Are you sure?</p>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => handleSignOut(false)} style={{ flex:1, padding:"9px", borderRadius:8, background:"#ef4444", color:"white", border:"none", fontWeight:600, fontSize:13, cursor:"pointer" }}>
                    Yes, Sign Out
                  </button>
                  <button onClick={() => setShowConfirm(false)} style={{ flex:1, padding:"9px", borderRadius:8, background:"transparent", color:muted, border:`1px solid ${bdr}`, fontSize:13, cursor:"pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => handleSignOut(true)}
              style={{ width:"100%", padding:"11px", borderRadius:10, background:"rgba(239,68,68,0.1)", color:"#f87171", border:"1.5px solid #ef4444", fontWeight:600, fontSize:14, cursor:"pointer" }}>
              Sign Out of All Devices
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
