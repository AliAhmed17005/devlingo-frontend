import { auth, db } from "./config";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "firebase/auth";
import { doc, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";

export async function signup(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    name, email,
    username: "@" + name.toLowerCase().replace(/\s/g, "_"),
    totalPoints: 0, currentStreak: 0, currentLevel: "easy",
    lastActiveDate: null, consecutivePasses: 0,
    achievements: [], enrolledCourses: [],
    bio: "", location: "", website: "",
    dailyGoal: 45, reminderTime: "09:00",
    preferredDifficulty: "Auto-Adaptive",
    notifications: {
      dailyReminders: true, deadlineAlerts: true,
      challengeInvites: true, communityMentions: false,
      streakWarnings: true, weeklyReport: true
    },
    isPro: false,
    createdAt: serverTimestamp()
  });
  return cred.user;
}

export const login = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

export const logout = () => signOut(auth);

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, "users", uid), data);
  if (data.name) {
    await updateProfile(auth.currentUser, { displayName: data.name });
  }
}
