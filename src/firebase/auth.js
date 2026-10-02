import { auth, db } from "./config";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  GithubAuthProvider,
  linkWithPopup,
  unlink
} from "firebase/auth";
import { doc, setDoc, serverTimestamp, updateDoc, collection, getDocs } from "firebase/firestore";

// ── Email + Password Signup ──
export async function signup(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  
  // Generate a unique sequential tag ID (e.g., DV-001)
  let tagId = "DV-001";
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    let nextNum = usersSnap.size + 1;
    tagId = "DV-" + String(nextNum).padStart(3, "0");
    const existingTags = new Set(usersSnap.docs.map(d => d.data().tagId).filter(Boolean));
    while (existingTags.has(tagId)) {
      nextNum++;
      tagId = "DV-" + String(nextNum).padStart(3, "0");
    }
  } catch (err) {
    console.error("Error generating tagId:", err);
  }

  await setDoc(doc(db, "users", cred.user.uid), {
    name,
    email,
    tagId,
    emailVerified: true,
    username: "@" + name.toLowerCase().replace(/\s+/g, "_"),
    totalPoints: 0,
    currentStreak: 0,
    currentLevel: "easy",
    lastActiveDate: null,
    consecutivePasses: 0,
    achievements: [],
    enrolledCourses: [{ courseId: "python-basics", enrolledAt: new Date().toISOString() }],
    bio: "",
    location: "",
    website: "",
    dailyGoal: 45,
    reminderTime: "09:00",
    preferredDifficulty: "Auto-Adaptive",
    notifications: {
      dailyReminders: true,
      deadlineAlerts: true,
      challengeInvites: true,
      communityMentions: false,
      streakWarnings: true,
      weeklyReport: true
    },
    isPro: false,
    createdAt: serverTimestamp()
  });

  return cred.user;
}

// ── Email + Password Login ──
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// ── Connect Google Account in Settings ──
export async function linkGoogleAccount() {
  if (!auth.currentUser) throw new Error("No authenticated user");
  const provider = new GoogleAuthProvider();
  return await linkWithPopup(auth.currentUser, provider);
}

// ── Connect GitHub Account in Settings ──
export async function linkGithubAccount() {
  if (!auth.currentUser) throw new Error("No authenticated user");
  const provider = new GithubAuthProvider();
  return await linkWithPopup(auth.currentUser, provider);
}

// ── Unlink Account ──
export async function unlinkAccount(providerId) {
  if (!auth.currentUser) throw new Error("No authenticated user");
  return await unlink(auth.currentUser, providerId);
}

// ── Logout ──
export const logout = () => signOut(auth);

// ── Change Password ──
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

// ── Update Profile ──
export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, "users", uid), data);
  if (data.name) {
    await updateProfile(auth.currentUser, { displayName: data.name });
  }
}

