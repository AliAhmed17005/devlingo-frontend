import { auth, db } from "./config";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  GoogleAuthProvider,
  GithubAuthProvider,
  linkWithPopup,
  unlink
} from "firebase/auth";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function signup(email, password, name) {
  if (!name || name.trim().length < 2) {
    throw new Error("Please enter your full name.")
  }
  if (!email || !email.includes("@")) {
    throw new Error("Please enter a valid email address.")
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters.")
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password)

  await updateProfile(cred.user, { displayName: name.trim() })

  const tagId = "DV-" + Math.random().toString(36).substr(2, 6).toUpperCase()

  await setDoc(doc(db, "users", cred.user.uid), {
    name:            name.trim(),
    email:           email.toLowerCase().trim(),
    tagId:           tagId,
    emailVerified:   false,
    username:        "@" + name.trim().toLowerCase().replace(/\s+/g, "_"),
    totalPoints:     0,
    currentStreak:   0,
    currentLevel:    "easy",
    lastActiveDate:  null,
    consecutivePasses: 0,
    achievements:    [],
    enrolledCourses: [{ courseId: "python-basics", enrolledAt: new Date().toISOString() }],
    bio:             "",
    location:        "",
    website:         "",
    dailyGoal:       45,
    reminderTime:    "09:00",
    preferredDifficulty: "Auto-Adaptive",
    notifications: {
      dailyReminders:    true,
      deadlineAlerts:    true,
      challengeInvites:  true,
      communityMentions: false,
      streakWarnings:    true,
      weeklyReport:      true
    },
    isPro:      false,
    createdAt:  serverTimestamp()
  })

  let emailSent = false;
  try {
    const actionCodeSettings = {
      url: `${window.location.origin}/login?verified=true`,
      handleCodeInApp: true,
    };
    await sendEmailVerification(cred.user, actionCodeSettings);
    emailSent = true;
  } catch (e) {
    console.warn("Verification email with ActionCodeSettings failed, trying fallback default:", e);
    try {
      await sendEmailVerification(cred.user);
      emailSent = true;
    } catch (e2) {
      console.error("Verification email failed completely:", e2);
    }
  }

  await signOut(auth)
  return { user: cred.user, emailSent }
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function resendVerification(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  if (!cred.user.emailVerified) {
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/login?verified=true`,
        handleCodeInApp: true,
      };
      await sendEmailVerification(cred.user, actionCodeSettings);
    } catch (e) {
      await sendEmailVerification(cred.user);
    }
    await signOut(auth)
    return true;
  } else {
    await signOut(auth);
    throw new Error("Email is already verified. You can sign in normally.")
  }
}

export const logout = () => signOut(auth)

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, "users", uid), data)
  if (data.name) {
    await updateProfile(auth.currentUser, { displayName: data.name })
  }
}

export async function linkGoogleAccount() {
  if (!auth.currentUser) throw new Error("No authenticated user");
  const provider = new GoogleAuthProvider();
  return await linkWithPopup(auth.currentUser, provider);
}

export async function linkGithubAccount() {
  if (!auth.currentUser) throw new Error("No authenticated user");
  const provider = new GithubAuthProvider();
  return await linkWithPopup(auth.currentUser, provider);
}

export async function unlinkAccount(providerId) {
  if (!auth.currentUser) throw new Error("No authenticated user");
  return await unlink(auth.currentUser, providerId);
}
