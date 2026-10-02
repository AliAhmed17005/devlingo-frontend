import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { db } from "../firebase/config";
import {
  onSnapshot, doc, updateDoc, serverTimestamp, collection, query, where, getDocs, limit, arrayUnion, arrayRemove, addDoc, deleteDoc
} from "firebase/firestore";
import {
  sendDM, listenToDM,
  sendGroupMessage, listenToGroup,
  sendCommunityMessage, listenToCommunity,
  createRTDBGroup, leaveRTDBGroup, deleteRTDBGroup, clearRTDBChat, syncGroupMemberRTDB
} from "../firebase/realtime";
import Layout from "../components/Layout";
import { MessageSquare, UserPlus, Check, X, Plus, Search, MessageCircle, Trash, Trash2, LogOut } from "lucide-react";
import toast from "react-hot-toast";

const COLORS = ["#6366f1", "#0f9b8e", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6", "#f97316"];

export default function Community() {
  const { currentUser } = useAuth();
  const { isDark } = useTheme();

  // Navigation and views
  const [viewMode, setViewMode] = useState("dms"); // "dms" | "groups" | "community"
  const [activeDM, setActiveDM] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [activeCommunity, setActiveCommunity] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [matchResults, setMatchResults] = useState(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const chatEndRef = useRef(null);

  const findMatch = async () => {
    setMatchLoading(true);
    setMatchResults(null);
    try {
      const res = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/matching/find-match/${currentUser.uid}`
      );
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else setMatchResults(data);
    } catch (e) {
      toast.error('Could not connect to matching service right now');
    }
    setMatchLoading(false);
  };

  // Firestore collections states
  const [currentUserData, setCurrentUserData] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [dbSearchResults, setDbSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [groups, setGroups] = useState([]);

  // Group creation states
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState(new Set());

  const s = isDark
    ? { card: "#1a1f2e", border: "#2d3748", text: "#f0f4ff", muted: "#8892a4", bg: "#0f1117", input: "#161b27", hover: "#232938" }
    : { card: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b", bg: "#f8fafc", input: "#f1f5f9", hover: "#f1f5f9" };

  // 1. Listen to Current User document
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, "users", currentUser.uid), snap => {
      if (snap.exists()) setCurrentUserData(snap.data());
    }, err => {
      console.warn("onSnapshot user doc failed:", err);
    });
    return unsub;
  }, [currentUser]);

  // 2. Fetch initial users list from Firestore on load (to display under Classroom Peers)
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "users"), limit(50));
    getDocs(q).then(snap => {
      const list = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      const filtered = list.filter(u => u.uid !== currentUser.uid);
      setAllUsers(filtered);
    }).catch(err => {
      console.warn("Failed to load initial users list:", err);
    });
  }, [currentUser]);

  // 2.6 Firestore Search Fallback (to find users if listing the collection is blocked)
  useEffect(() => {
    const term = search.trim();
    if (!term || !currentUser) {
      setDbSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const uppercaseTerm = term.toUpperCase().replace("#", "").trim();
        const formattedTag = uppercaseTerm.startsWith("DV-") ? uppercaseTerm : `DV-${uppercaseTerm.padStart(3, "0")}`;

        // 1. Query Firestore by exact tagId format (e.g. DV-001)
        const q1 = query(collection(db, "users"), where("tagId", "==", formattedTag));
        const snap1 = await getDocs(q1);
        let results = snap1.docs.map(d => ({ uid: d.id, ...d.data() }));

        // 2. Try raw uppercase term if first query is empty (e.g. 001)
        if (results.length === 0) {
          const q2 = query(collection(db, "users"), where("tagId", "==", uppercaseTerm));
          const snap2 = await getDocs(q2);
          results = snap2.docs.map(d => ({ uid: d.id, ...d.data() }));
        }

        // 3. Try exact name match if still empty
        if (results.length === 0) {
          const q3 = query(collection(db, "users"), where("name", "==", term));
          const snap3 = await getDocs(q3);
          results = snap3.docs.map(d => ({ uid: d.id, ...d.data() }));
        }

        const filteredResults = results.filter(u => u.uid !== currentUser.uid);
        setDbSearchResults(filteredResults);
      } catch (err) {
        console.warn("Direct Firestore user query failed (this is normal if rules block search):", err);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, currentUser]);

  // 3. Update online status
  useEffect(() => {
    if (!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {});
    const handleBeforeUnload = () => {
      updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      updateDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }).catch(() => {});
    };
  }, [currentUser]);

  // 4. Global Friend Requests & Friends Listener (via Firestore root-level challenges collection)
  useEffect(() => {
    if (!currentUser) return;

    // A. Incoming requests (where receiver is current user and status is pending)
    const qIncoming = query(
      collection(db, "challenges"),
      where("to", "==", currentUser.uid),
      where("type", "==", "friendRequest"),
      where("status", "==", "pending")
    );
    const unsubIncoming = onSnapshot(qIncoming, snap => {
      const incoming = snap.docs.map(d => {
        const r = d.data();
        return {
          uid: r.from,
          name: r.fromName,
          tagId: r.fromTag,
          requestId: d.id
        };
      });
      setFriendRequests(incoming);

      // Create notifications for newly discovered requests
      incoming.forEach(async (req) => {
        try {
          const notifQ = query(
            collection(db, `users/${currentUser.uid}/notifications`),
            where("requestId", "==", req.requestId)
          );
          const notifSnap = await getDocs(notifQ);
          if (notifSnap.empty) {
            await addDoc(collection(db, `users/${currentUser.uid}/notifications`), {
              type: "friend_request",
              message: `${req.name} sent you a friend request.`,
              requestId: req.requestId,
              read: false,
              timestamp: serverTimestamp()
            });
          }
        } catch (err) {
          console.warn("Error creating friend request notification:", err);
        }
      });
    }, err => {
      console.warn("Listen to incoming friend requests failed:", err);
    });

    // B. Outgoing requests (where sender is current user)
    const qOutgoing = query(
      collection(db, "challenges"),
      where("from", "==", currentUser.uid),
      where("type", "==", "friendRequest")
    );
    const unsubOutgoing = onSnapshot(qOutgoing, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Filter out pending outgoing requests
      const pendingOutgoing = docs.filter(r => r.status === "pending");
      setSentRequests(pendingOutgoing.map(r => ({
        uid: r.to,
        name: r.toName,
        tagId: r.toTag,
        requestId: r.id
      })));

      // Auto-process accepted outgoing requests
      const accepted = docs.filter(r => r.status === "accepted");
      accepted.forEach(async (req) => {
        try {
          const currentFriends = currentUserData?.friends || [];
          if (!currentFriends.some(f => f.uid === req.to)) {
            await updateDoc(doc(db, "users", currentUser.uid), {
              friends: arrayUnion({
                uid: req.to,
                name: req.toName,
                tagId: req.toTag,
                lastMessage: "You are now friends! Say hello."
              })
            });
          }

          // Create notification for accepted request
          try {
            await addDoc(collection(db, `users/${currentUser.uid}/notifications`), {
              type: "friend_accepted",
              message: `${req.toName} accepted your friend request!`,
              read: false,
              timestamp: serverTimestamp()
            });
          } catch (notifErr) {
            console.warn("Error creating friend accepted notification:", notifErr);
          }

          // Clean up by deleting the processed accepted document from the root collection
          await deleteDoc(doc(db, "challenges", req.id));
        } catch (err) {
          console.warn("Error processing accepted friend request:", err);
        }
      });
    }, err => {
      console.warn("Listen to outgoing friend requests failed:", err);
    });

    return () => {
      unsubIncoming();
      unsubOutgoing();
    };
  }, [currentUser, currentUserData]);

  // C. Update friends array from currentUserData
  useEffect(() => {
    if (currentUserData) {
      setFriends(currentUserData.friends || []);
    }
  }, [currentUserData]);

  // 5. Listen to Groups that user belongs to (via Firestore root-level challenges collection)
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "challenges"),
      where("type", "==", "group"),
      where("members", "array-contains", currentUser.uid)
    );
    const unsub = onSnapshot(q, snap => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.warn("onSnapshot groups failed:", err);
    });
    return unsub;
  }, [currentUser]);

  // 6. Listen to messages for active DM, Group, or Community
  useEffect(() => {
    if (!currentUser) return;
    let unsub = () => {};

    if (viewMode === "dms" && activeDM) {
      unsub = listenToDM(currentUser.uid, activeDM.uid, setMessages);
    } else if (viewMode === "groups" && activeGroup) {
      let active = true;
      // Sync membership to RTDB leaf node first, then establish listener
      syncGroupMemberRTDB(activeGroup.id, currentUser.uid).then(() => {
        if (!active) return;
        unsub = listenToGroup(activeGroup.id, setMessages);
      }).catch(err => {
        console.warn("Failed to sync membership or listen to group:", err);
      });
      return () => {
        active = false;
        unsub();
      };
    } else if (activeCommunity) {
      unsub = listenToCommunity(activeCommunity.id, setMessages);
    } else {
      setMessages([]);
    }

    return () => {
      unsub();
    };
  }, [viewMode, activeDM, activeGroup, activeCommunity, currentUser]);

  // 7. Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 7.5 Auto-close active group if it gets deleted/removed from groups list
  useEffect(() => {
    if (viewMode === "groups" && activeGroup) {
      const exists = groups.some(g => g.id === activeGroup.id);
      if (!exists) {
        setActiveGroup(null);
        setMessages([]);
      }
    }
  }, [groups, activeGroup, viewMode]);

  // Friend Requests logic using Firestore root-level challenges collection
  const sendFriendRequest = async (targetUser) => {
    try {
      const myTag = currentUserData?.tagId || "---";
      const myName = currentUserData?.name || currentUser.displayName || "User";

      await addDoc(collection(db, "challenges"), {
        type: "friendRequest",
        from: currentUser.uid,
        fromName: myName,
        fromTag: myTag,
        to: targetUser.uid,
        toName: targetUser.name || "User",
        toTag: targetUser.tagId || "",
        status: "pending",
        topic: "Friendship",
        xpStake: 0,
        timestamp: serverTimestamp()
      });

      // Create notification for outgoing request
      try {
        await addDoc(collection(db, `users/${currentUser.uid}/notifications`), {
          type: "friend_sent",
          message: `Friend request sent to ${targetUser.name}!`,
          read: false,
          timestamp: serverTimestamp()
        });
      } catch (notifErr) {
        console.warn("Error creating friend sent notification:", notifErr);
      }

      toast.success(`Friend request sent to ${targetUser.name}!`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to send request: " + e.message);
    }
  };

  const acceptFriendRequest = async (request) => {
    try {
      // 1. Update B's notification status to 'accepted'
      await updateDoc(doc(db, "challenges", request.requestId), {
        status: "accepted"
      });

      // 2. Add A to B's friends list
      await updateDoc(doc(db, "users", currentUser.uid), {
        friends: arrayUnion({
          uid: request.uid,
          name: request.name,
          tagId: request.tagId,
          lastMessage: "You are now friends! Say hello."
        })
      });

      // 3. Send initial system message in DM RTDB
      await sendDM(currentUser.uid, request.uid, "You are now friends! Say hello.", {
        uid: "system",
        displayName: "System"
      });

      toast.success(`Accepted friend request from ${request.name}!`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to accept request: " + e.message);
    }
  };

  const declineFriendRequest = async (request) => {
    try {
      // 1. Delete request document from root challenges
      await deleteDoc(doc(db, "challenges", request.requestId));
      toast.success(`Declined friend request from ${request.name}.`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to decline request: " + e.message);
    }
  };

  // Group creation logic
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }
    if (selectedFriends.size === 0) {
      toast.error("Please select at least one friend to add");
      return;
    }
    try {
      const members = [currentUser.uid, ...Array.from(selectedFriends)];
      const groupDocRef = await addDoc(collection(db, "challenges"), {
        type: "group",
        name: newGroupName.trim(),
        members,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        // satisfy challenges rules schema
        from: currentUser.uid,
        to: currentUser.uid,
        status: "group",
        topic: "Group",
        xpStake: 0,
        timestamp: serverTimestamp()
      });

      // Initialize group members in RTDB to enable write permissions
      await createRTDBGroup(groupDocRef.id, members);

      // Send initial system message in group chat
      await sendGroupMessage(groupDocRef.id, `Group "${newGroupName}" created by ${currentUser.displayName || "User"}`, { uid: "system", displayName: "System" });

      toast.success(`Group "${newGroupName}" created!`);
      setNewGroupName("");
      setSelectedFriends(new Set());
      setShowCreateGroup(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to create group: " + e.message);
    }
  };

  // Leave Group logic
  const handleLeaveGroup = async (group) => {
    if (!group || !currentUser) return;
    const confirmLeave = window.confirm(`Are you sure you want to leave the group "${group.name}"?`);
    if (!confirmLeave) return;

    try {
      // 1. Send system message to notify others
      const myName = currentUserData?.name || currentUser.displayName || "User";
      await sendGroupMessage(group.id, `${myName} has left the group.`, { uid: "system", displayName: "System" });

      // 2. Remove member from Firestore challenges collection group doc
      const groupRef = doc(db, "challenges", group.id);
      await updateDoc(groupRef, {
        members: arrayRemove(currentUser.uid)
      });

      // 3. Remove membership from Realtime Database
      await leaveRTDBGroup(group.id, currentUser.uid);

      toast.success(`You have left the group "${group.name}".`);
      setActiveGroup(null);
      setMessages([]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to leave group: " + e.message);
    }
  };

  // Delete Group logic
  const handleDeleteGroup = async (group) => {
    if (!group || !currentUser) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete the group "${group.name}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    try {
      // 1. Delete Firestore challenges collection group doc
      const groupRef = doc(db, "challenges", group.id);
      try {
        await deleteDoc(groupRef);
      } catch (firestoreErr) {
        console.warn("deleteDoc failed, falling back to updateDoc:", firestoreErr);
        // Fallback: update document to disassociate all members and mark as deleted
        await updateDoc(groupRef, {
          members: [],
          type: "deleted_group",
          deletedAt: serverTimestamp()
        });
      }

      // 2. Delete RTDB group members and messages individually
      await deleteRTDBGroup(group.id, group.members || []);

      toast.success(`Group "${group.name}" has been deleted.`);
      setActiveGroup(null);
      setMessages([]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete group: " + e.message);
    }
  };

  // Clear Chat messages logic
  const handleClearChat = async () => {
    let path = "";
    let chatName = "";

    if (viewMode === "dms" && activeDM) {
      const key = [currentUser.uid, activeDM.uid].sort().join("_");
      path = `dms/${key}/messages`;
      chatName = activeDM.name;
    } else if (viewMode === "groups" && activeGroup) {
      path = `channels/${activeGroup.id}/messages`;
      chatName = activeGroup.name;
    } else if (activeCommunity) {
      path = `channels/${activeCommunity.id}/messages`;
      chatName = activeCommunity.name;
    }

    if (!path) return;

    const confirmClear = window.confirm(`Are you sure you want to clear all messages in "${chatName}"? This will delete the messages for everyone.`);
    if (!confirmClear) return;

    try {
      await clearRTDBChat(path);
      toast.success("Chat history cleared.");
      setMessages([]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to clear chat: " + e.message);
    }
  };

  // Message sending logic
  const handleSend = async () => {
    if (!input.trim() || !currentUser) return;
    try {
      if (viewMode === "groups" && activeGroup) {
        await sendGroupMessage(activeGroup.id, input.trim(), currentUser);
      } else if (activeCommunity) {
        await sendCommunityMessage(activeCommunity.id, input.trim(), currentUser);
      } else if (viewMode === "dms" && activeDM) {
        await sendDM(currentUser.uid, activeDM.uid, input.trim(), currentUser);
        
        // Update lastMessage locally in the user's friends list
        const updatedFriends = friends.map(f => {
          if (f.uid === activeDM.uid) {
            return { ...f, lastMessage: input.trim() };
          }
          return f;
        });
        await updateDoc(doc(db, "users", currentUser.uid), { friends: updatedFriends });
      }
      setInput("");
    } catch (e) {
      console.error(e);
      toast.error("Failed to send message: " + e.message);
    }
  };

  // Switch to direct DM chat with a friend
  const startDM = (friend) => {
    setActiveDM({ uid: friend.uid, name: friend.name, tagId: friend.tagId });
    setActiveGroup(null);
    setActiveCommunity(null);
    setViewMode("dms");
    setSearch("");
  };

  // Initials and colors helpers
  const initials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };
  const getColor = (name) => COLORS[(name || "U").charCodeAt(0) % COLORS.length];

  const timeAgo = (ts) => {
    if (!ts?.seconds) return "";
    const diff = Date.now() - ts.seconds * 1000;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  // Course matcher helper
  const getSharedCourses = (otherUser) => {
    const myCourses = currentUserData?.enrolledCourses?.map(e => e.courseId || e) || [];
    const theirCourses = otherUser.enrolledCourses?.map(e => e.courseId || e) || [];
    const shared = myCourses.filter(cid => theirCourses.includes(cid));

    const courseMap = {
      "python-basics": "🐍 Python Basics",
      "javascript-mastery": "🟨 JS Mastery",
      "react-nextjs": "⚛️ React & Next.js"
    };

    return shared.map(id => courseMap[id] || id).join(", ");
  };

  // Compute My communities based on course enrollments
  const myCommunities = (currentUserData?.enrolledCourses || []).map(e => {
    const cid = e.courseId || e;
    const courseMap = {
      "python-basics": "Python Basics Community",
      "javascript-mastery": "JS Mastery Community",
      "react-nextjs": "React & Next.js Community"
    };
    return { id: cid, name: courseMap[cid] || cid };
  });

  // FILTERING AND SEARCH LOGIC
  const localSearchedUsers = allUsers.filter(u => {
    const term = search.trim().toLowerCase();
    if (!term) return false;
    
    const uppercaseTerm = term.toUpperCase().replace("#", "").trim();
    const normUserTag = (u.tagId || "").toUpperCase().replace("DV-", "").replace(/^0+/, "");
    const normSearchTerm = uppercaseTerm.replace("DV-", "").replace(/^0+/, "");
    
    const matchesTag = u.tagId === uppercaseTerm || 
                       u.tagId === "DV-" + uppercaseTerm || 
                       (u.tagId || "").toUpperCase() === uppercaseTerm ||
                       (normUserTag && normUserTag === normSearchTerm);
                       
    const matchesName = (u.name || "").toLowerCase().includes(term);
    return matchesTag || matchesName;
  });

  // Merge local RTDB searched users with direct Firestore queried users
  const searchedUsers = [...localSearchedUsers];
  dbSearchResults.forEach(dbUser => {
    if (!searchedUsers.some(u => u.uid === dbUser.uid)) {
      searchedUsers.push(dbUser);
    }
  });

  // Filter Community Classroom Peers
  const communityUsers = allUsers.filter(u => {
    const isFriend = friends.some(f => f.uid === u.uid);
    if (isFriend) return false;

    const myCourses = currentUserData?.enrolledCourses?.map(e => e.courseId || e) || [];
    const theirCourses = u.enrolledCourses?.map(e => e.courseId || e) || [];
    const hasCommonCourse = myCourses.some(cid => theirCourses.includes(cid));
    return hasCommonCourse;
  });

  // Filter Active View
  const chatTitle = activeCommunity
    ? activeCommunity.name
    : viewMode === "groups"
      ? activeGroup?.name || "Select a group"
      : activeDM?.name || "Select a conversation";

  const activeFriendInfo = activeDM ? allUsers.find(u => u.uid === activeDM.uid) : null;
  const chatDesc = activeCommunity
    ? "Classroom Discussion Channel"
    : viewMode === "groups"
      ? activeGroup ? `${activeGroup.members?.length || 0} members` : ""
      : activeDM ? (activeFriendInfo?.isOnline ? "Online" : "Offline") : "";

  return (
    <Layout title="Community">
      <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 100px)" }}>

        {/* Top bar with User Tag */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 14px", flexShrink: 0 }}>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: 18, color: s.text, margin: "0 0 2px", display: "flex", alignItems: "center", gap: 8 }}>
              <MessageSquare size={18} color="#6366f1" />Chat Hub
            </h2>
            <p style={{ color: s.muted, fontSize: 13, margin: 0 }}>
              Your Tag: <strong style={{ color: "#6366f1" }}>{currentUserData?.tagId || "---"}</strong>
            </p>
          </div>
          
          {/* Tabs selector */}
          <div style={{ display: "flex", gap: 2, background: s.card, padding: 3, borderRadius: 8, border: `1px solid ${s.border}` }}>
            {[
              { id: "community", label: "Community" },
              { id: "groups", label: "Groups" },
              { id: "dms", label: "DMs" }
            ].map(tab => (
              <button key={tab.id} onClick={() => setViewMode(tab.id)}
                style={{ padding: "6px 14px", borderRadius: 6, background: viewMode === tab.id ? "#6366f1" : "transparent", color: viewMode === tab.id ? "white" : s.muted, border: "none", fontWeight: 500, fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main WhatsApp-style Grid Layout */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr", gap: 0, minHeight: 0, border: `1px solid ${s.border}`, borderRadius: 10, overflow: "hidden" }}>

          {/* Sidebar Panel */}
          <div style={{ background: s.card, borderRight: `1px solid ${s.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            
            {/* Search Input */}
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${s.border}` }}>
              <div style={{ position: "relative" }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by Tag ID (e.g. DV-001)..."
                  style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 6, border: `1px solid ${s.border}`, background: s.input, color: s.text, fontSize: 12, outline: "none" }} />
                <Search size={14} color={s.muted} style={{ position: "absolute", left: 10, top: 11 }} />
                {search && (
                  <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: 8, background: "none", border: "none", color: s.muted, cursor: "pointer", fontSize: 12 }}>✕</button>
                )}
              </div>
            </div>

            {/* List Body */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              
              {/* SEARCH MODE ACTIVE */}
              {search && (
                <>
                  <p style={{ fontSize: 10, fontWeight: 600, color: s.muted, letterSpacing: 0.8, padding: "10px 14px 4px", margin: 0, textTransform: "uppercase" }}>Search Results</p>
                  {searchedUsers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: s.muted }}>
                      <p style={{ fontSize: 12 }}>No users found matching "{search}"</p>
                    </div>
                  ) : (
                    searchedUsers.map(user => {
                      const isFriend = friends.some(f => f.uid === user.uid);
                      const isIncoming = friendRequests.some(r => r.uid === user.uid);
                      const isOutgoing = sentRequests.some(r => r.uid === user.uid);

                      return (
                        <div key={user.uid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${s.border}` }}>
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: getColor(user.name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 11 }}>
                              {initials(user.name)}
                            </div>
                            {user.isOnline && <div style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: "#10b981", border: `2px solid ${s.card}` }} />}
                          </div>
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontWeight: 500, fontSize: 13, color: s.text, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{user.name}</span>
                              <span style={{ fontSize: 10, color: "#6366f1", fontWeight: 600 }}>{user.tagId || "---"}</span>
                            </div>
                            <span style={{ fontSize: 11, color: s.muted, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {user.enrolledCourses ? getSharedCourses(user) || "No shared courses" : "No courses"}
                            </span>
                          </div>

                          <div style={{ flexShrink: 0 }}>
                            {isFriend ? (
                              <button onClick={() => startDM(user)} style={{ padding: "4px 8px", background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 500 }}>
                                Chat
                              </button>
                            ) : isOutgoing ? (
                              <span style={{ fontSize: 11, color: s.muted }}>Requested</span>
                            ) : isIncoming ? (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={() => {
                                  const req = friendRequests.find(r => r.uid === user.uid);
                                  if (req) acceptFriendRequest(req);
                                }} style={{ padding: 4, background: "#10b981", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
                                  <Check size={12} />
                                </button>
                                <button onClick={() => {
                                  const req = friendRequests.find(r => r.uid === user.uid);
                                  if (req) declineFriendRequest(req);
                                }} style={{ padding: 4, background: "#ef4444", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => sendFriendRequest(user)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#6366f1", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 500 }}>
                                <UserPlus size={12} /> Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {/* SEARCH MODE INACTIVE */}
              {!search && (
                <>
                  {/* COMMUNITY TABS */}
                  {viewMode === "community" && (
                    <>
                      <div style={{ padding: "12px 14px 0" }}>
                        <div style={{ marginBottom: 24 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', marginBottom: 16
                          }}>
                            <div>
                              <h3 style={{ fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>
                                Find a Learning Partner
                              </h3>
                              <p style={{ fontSize: 13, margin: 0, opacity: 0.6 }}>
                                Match with someone who complements your skills
                              </p>
                            </div>
                            <button
                              onClick={findMatch}
                              disabled={matchLoading}
                              style={{
                                padding: '9px 20px', borderRadius: 10,
                                background: matchLoading ? '#2d3748' : '#6366f1',
                                color: 'white', border: 'none',
                                fontWeight: 600, fontSize: 13, cursor: 'pointer'
                              }}>
                              {matchLoading ? 'Finding...' : '🔍 Find Match'}
                            </button>
                          </div>

                          {matchResults && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>

                              {matchResults.complement && (
                                <div style={{
                                  background: isDark ? '#1e2433' : '#f8fafc',
                                  border: '1px solid rgba(99,102,241,0.3)',
                                  borderRadius: 14, padding: 16
                                }}>
                                  <p style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Best Complement
                                  </p>
                                  <p style={{ fontSize: 11, opacity: 0.6, margin: '0 0 10px' }}>Strong where you are weak</p>
                                  <p style={{ fontWeight: 700, fontSize: 17, margin: '0 0 10px' }}>
                                    {matchResults.complement.name}
                                  </p>
                                  <div style={{ height: 6, background: isDark ? '#2d3748' : '#e2e8f0', borderRadius: 20, marginBottom: 6 }}>
                                    <div style={{ height: '100%', width: `${matchResults.complement.match_score}%`, background: '#6366f1', borderRadius: 20 }} />
                                  </div>
                                  <p style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, margin: '0 0 10px' }}>
                                    {matchResults.complement.match_score}% match
                                  </p>
                                  {matchResults.complement.strong_in?.length > 0 && (
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                      {matchResults.complement.strong_in.map(t => (
                                        <span key={t} style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '2px 8px', borderRadius: 20 }}>
                                          {t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {matchResults.study_buddy && (
                                <div style={{
                                  background: isDark ? '#1e2433' : '#f8fafc',
                                  border: '1px solid rgba(15,155,142,0.3)',
                                  borderRadius: 14, padding: 16
                                }}>
                                  <p style={{ fontSize: 10, fontWeight: 700, color: '#0f9b8e', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Study Buddy
                                  </p>
                                  <p style={{ fontSize: 11, opacity: 0.6, margin: '0 0 10px' }}>Similar level to you</p>
                                  <p style={{ fontWeight: 700, fontSize: 17, margin: '0 0 10px' }}>
                                    {matchResults.study_buddy.name}
                                  </p>
                                  <div style={{ height: 6, background: isDark ? '#2d3748' : '#e2e8f0', borderRadius: 20, marginBottom: 6 }}>
                                    <div style={{ height: '100%', width: `${matchResults.study_buddy.similarity}%`, background: '#0f9b8e', borderRadius: 20 }} />
                                  </div>
                                  <p style={{ fontSize: 12, color: '#0f9b8e', fontWeight: 600, margin: 0 }}>
                                    {matchResults.study_buddy.similarity}% similar
                                  </p>
                                  {matchResults.your_weak_topics?.length > 0 && (
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
                                      {matchResults.your_weak_topics.map(t => (
                                        <span key={t} style={{ fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '2px 8px', borderRadius: 20 }}>
                                          practice: {t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {matchResults?.total_users < 2 && (
                            <div style={{
                              background: 'rgba(245,158,11,0.1)',
                              border: '1px solid rgba(245,158,11,0.3)',
                              borderRadius: 12, padding: 14, marginBottom: 16
                            }}>
                              <p style={{ fontSize: 13, color: '#fbbf24', margin: 0 }}>
                                Need at least 2 users with skill data for matching. Complete some study sessions first.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Course Communities Group Chat Channels */}
                      <p style={{ fontSize: 10, fontWeight: 600, color: s.muted, letterSpacing: 0.8, padding: "10px 14px 4px", margin: 0, textTransform: "uppercase" }}>My Communities</p>
                      {myCommunities.length === 0 ? (
                        <div style={{ padding: "10px 14px", color: s.muted, fontSize: 12 }}>
                          Enroll in a course to join a community group!
                        </div>
                      ) : (
                        myCommunities.map(comm => {
                          const isActive = activeCommunity?.id === comm.id;
                          return (
                            <button key={comm.id} onClick={() => { setActiveCommunity(comm); setActiveDM(null); setActiveGroup(null); }}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: isActive ? "rgba(99,102,241,0.08)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", borderLeft: isActive ? "3px solid #6366f1" : "3px solid transparent", borderBottom: `1px solid ${s.border}` }}>
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 14 }}>
                                🏫
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 500, fontSize: 13, color: s.text, display: "block" }}>{comm.name}</span>
                                <span style={{ fontSize: 10, color: s.muted }}>Enrolled discussion channel</span>
                              </div>
                            </button>
                          );
                        })
                      )}

                      {/* Incoming Friend Requests Section */}
                      {friendRequests.length > 0 && (
                        <div style={{ borderBottom: `2px solid ${s.border}`, borderTop: `2px solid ${s.border}`, paddingBottom: 6, marginTop: 10 }}>
                          <p style={{ fontSize: 10, fontWeight: 600, color: s.muted, letterSpacing: 0.8, padding: "10px 14px 4px", margin: 0, textTransform: "uppercase" }}>Friend Requests ({friendRequests.length})</p>
                          {friendRequests.map(req => (
                            <div key={req.uid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: getColor(req.name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 10 }}>
                                  {initials(req.name)}
                                </div>
                                <div>
                                  <span style={{ fontSize: 12, color: s.text, fontWeight: 500, display: "block" }}>{req.name}</span>
                                  <span style={{ fontSize: 10, color: s.muted }}>{req.tagId}</span>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={() => acceptFriendRequest(req)} style={{ padding: "4px 8px", background: "#10b981", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
                                  Accept
                                </button>
                                <button onClick={() => declineFriendRequest(req)} style={{ padding: "4px 8px", background: s.border, color: s.text, border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
                                  Decline
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <p style={{ fontSize: 10, fontWeight: 600, color: s.muted, letterSpacing: 0.8, padding: "10px 14px 4px", margin: 0, textTransform: "uppercase" }}>Classroom Peers</p>
                      {communityUsers.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 30, color: s.muted }}>
                          <p style={{ fontSize: 13, margin: "0 0 6px" }}>No classmates discovered yet</p>
                          <p style={{ fontSize: 11, margin: 0 }}>Enroll in courses to find study buddies!</p>
                        </div>
                      ) : (
                        communityUsers.map(user => {
                          const isIncoming = friendRequests.some(r => r.uid === user.uid);
                          const isOutgoing = sentRequests.some(r => r.uid === user.uid);

                          return (
                            <div key={user.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${s.border}` }}>
                              <div style={{ position: "relative", flexShrink: 0 }}>
                                <div style={{ width: 32, height: 32, borderRadius: "50%", background: getColor(user.name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 11 }}>
                                  {initials(user.name)}
                                </div>
                                {user.isOnline && <div style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: "#10b981", border: `2px solid ${s.card}` }} />}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontWeight: 500, fontSize: 13, color: s.text, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{user.name}</span>
                                  <span style={{ fontSize: 10, color: s.muted }}>{user.tagId || "---"}</span>
                                </div>
                                <span style={{ fontSize: 11, color: "#10b981", fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {getSharedCourses(user)}
                                </span>
                              </div>

                              <div style={{ flexShrink: 0 }}>
                                {isOutgoing ? (
                                  <span style={{ fontSize: 11, color: s.muted }}>Sent</span>
                                ) : isIncoming ? (
                                  <button onClick={() => {
                                    const req = friendRequests.find(r => r.uid === user.uid);
                                    if (req) acceptFriendRequest(req);
                                  }} style={{ padding: "4px 8px", background: "#10b981", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
                                    Accept
                                  </button>
                                ) : (
                                  <button onClick={() => sendFriendRequest(user)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#6366f1", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 500 }}>
                                    <UserPlus size={12} /> Add
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </>
                  )}

                  {/* GROUPS TAB */}
                  {viewMode === "groups" && (
                    <>
                      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${s.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: s.muted, textTransform: "uppercase" }}>My Groups ({groups.length})</span>
                        <button onClick={() => setShowCreateGroup(true)}
                          style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "none", borderRadius: 4, display: "flex", alignItems: "center", justifyItems: "center", gap: 4, padding: "4px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          <Plus size={12} /> New Group
                        </button>
                      </div>

                      {groups.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: s.muted }}>
                          <p style={{ fontSize: 13, margin: "0 0 6px" }}>No groups created yet</p>
                          <button onClick={() => setShowCreateGroup(true)} style={{ background: "none", border: "none", color: "#6366f1", fontWeight: 500, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Create one now</button>
                        </div>
                      ) : (
                        groups.map(group => {
                          const isActive = activeGroup?.id === group.id;
                          return (
                            <button key={group.id} onClick={() => { setActiveGroup(group); setActiveDM(null); setActiveCommunity(null); }}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: isActive ? "rgba(99,102,241,0.08)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", borderLeft: isActive ? "3px solid #6366f1" : "3px solid transparent", borderBottom: `1px solid ${s.border}` }}>
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: getColor(group.name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 11 }}>
                                {initials(group.name)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span style={{ fontWeight: 500, fontSize: 13, color: s.text }}>{group.name}</span>
                                </div>
                                <span style={{ fontSize: 11, color: s.muted }}>{group.members?.length || 0} members</span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </>
                  )}

                  {/* DIRECT MESSAGES (DM) TAB */}
                  {viewMode === "dms" && (
                    <>
                      <p style={{ fontSize: 10, fontWeight: 600, color: s.muted, letterSpacing: 0.8, padding: "10px 14px 4px", margin: 0, textTransform: "uppercase" }}>Direct Messages ({friends.length})</p>
                      {friends.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: s.muted }}>
                          <p style={{ fontSize: 13, margin: "0 0 6px" }}>No friends added yet</p>
                          <p style={{ fontSize: 11, margin: 0 }}>Go to the <strong style={{ color: "#6366f1", cursor: "pointer" }} onClick={() => setViewMode("community")}>Community</strong> tab or search by Tag ID to find people.</p>
                        </div>
                      ) : (
                        friends.map(friend => {
                          const isActive = activeDM?.uid === friend.uid;
                          const userObj = allUsers.find(u => u.uid === friend.uid);
                          
                          return (
                            <button key={friend.uid} onClick={() => startDM(friend)}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: isActive ? "rgba(99,102,241,0.08)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", borderLeft: isActive ? "3px solid #6366f1" : "3px solid transparent", borderBottom: `1px solid ${s.border}` }}>
                              <div style={{ position: "relative", flexShrink: 0 }}>
                                <div style={{ width: 32, height: 32, borderRadius: "50%", background: getColor(friend.name), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 11 }}>
                                  {initials(friend.name)}
                                </div>
                                {userObj?.isOnline && <div style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: "#10b981", border: `2px solid ${s.card}` }} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontWeight: 500, fontSize: 13, color: s.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {friend.name}
                                  </span>
                                  <span style={{ fontSize: 10, color: s.muted }}>{timeAgo(friend.timestamp)}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                                  <p style={{ fontSize: 11, color: s.muted, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                    {friend.lastMessage || "Click to open chat"}
                                  </p>
                                  <span style={{ fontSize: 9, color: "#6366f1", marginLeft: 4, fontWeight: 600 }}>{friend.tagId}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Chat Conversation Area */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: isDark ? "#0f1117" : "#f8fafc" }}>
            
            {/* Active Chat Header */}
            {((viewMode === "dms" && activeDM) || (viewMode === "groups" && activeGroup) || activeCommunity) ? (
              <>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${s.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: s.card, flexShrink: 0 }}>
                  
                  {/* Left part: Chat Icon and info */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ position: "relative" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: getColor(chatTitle), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 12 }}>
                        {activeCommunity ? "🏫" : initials(chatTitle)}
                      </div>
                      {viewMode === "dms" && activeFriendInfo?.isOnline && (
                        <div style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: "#10b981", border: `2px solid ${s.card}` }} />
                      )}
                    </div>

                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, color: s.text, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        {chatTitle}
                        {viewMode === "dms" && activeDM?.tagId && (
                          <span style={{ fontSize: 10, color: "#6366f1", background: "rgba(99,102,241,0.08)", padding: "1px 6px", borderRadius: 4, fontWeight: 500 }}>{activeDM.tagId}</span>
                        )}
                      </p>
                      <p style={{ fontSize: 11, color: chatDesc === "Online" ? "#10b981" : s.muted, margin: 0 }}>{chatDesc}</p>
                    </div>
                  </div>

                  {/* Right part: Action buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Clear Chat Button (DMs and Groups only) */}
                    {!activeCommunity && (
                      <button
                        onClick={handleClearChat}
                        title="Clear Chat"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 6,
                          borderRadius: 6,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: s.muted,
                          transition: "all 0.2s"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"; e.currentTarget.style.color = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = s.muted; }}
                      >
                        <Trash size={16} />
                      </button>
                    )}

                    {/* Group specific action buttons */}
                    {viewMode === "groups" && activeGroup && (
                      <>
                        {activeGroup.createdBy === currentUser?.uid ? (
                          /* Delete Group Button (for Creator) */
                          <button
                            onClick={() => handleDeleteGroup(activeGroup)}
                            title="Delete Group"
                            style={{
                              background: "none",
                              border: "none",
                              padding: 6,
                              borderRadius: 6,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: s.muted,
                              transition: "all 0.2s"
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"; e.currentTarget.style.color = "#ef4444"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = s.muted; }}
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          /* Leave Group Button (for Members) */
                          <button
                            onClick={() => handleLeaveGroup(activeGroup)}
                            title="Leave Group"
                            style={{
                              background: "none",
                              border: "none",
                              padding: 6,
                              borderRadius: 6,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: s.muted,
                              transition: "all 0.2s"
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"; e.currentTarget.style.color = "#f59e0b"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = s.muted; }}
                          >
                            <LogOut size={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Messages Box */}
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {messages.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: s.muted, margin: "auto 0" }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: s.text, marginBottom: 4 }}>No messages yet</p>
                      <p style={{ fontSize: 12 }}>Send a message to start the conversation!</p>
                    </div>
                  ) : (
                    messages.map(msg => {
                      const isMe = msg.uid === currentUser?.uid;
                      const isSystem = msg.uid === "system";

                      if (isSystem) {
                        return (
                          <div key={msg.id} style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                            <div style={{ padding: "4px 12px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", borderRadius: 6, color: s.muted, fontSize: 11, fontWeight: 500 }}>
                              {msg.text}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", gap: 6 }}>
                          {!isMe && (
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: getColor(msg.name || "U"), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 600, flexShrink: 0, marginTop: 2 }}>
                              {initials(msg.name || "U")}
                            </div>
                          )}
                          <div style={{ maxWidth: "70%" }}>
                            {!isMe && (viewMode === "groups" || activeCommunity) && (
                              <p style={{ fontSize: 11, color: s.muted, margin: "0 0 1px 4px", fontWeight: 600 }}>{msg.name}</p>
                            )}
                            <div style={{ padding: "7px 11px", borderRadius: isMe ? "12px 12px 4px 12px" : "12px 12px 12px 4px", background: isMe ? "#6366f1" : s.card, border: isMe ? "none" : `1px solid ${s.border}`, color: isMe ? "white" : s.text, fontSize: 13, lineHeight: 1.5 }}>
                              {msg.text}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input Controls */}
                <div style={{ padding: "10px 14px", borderTop: `1px solid ${s.border}`, display: "flex", gap: 6, background: s.card, flexShrink: 0 }}>
                  <input value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSend()}
                    placeholder={activeCommunity ? `Message ${activeCommunity.name}...` : viewMode === "groups" ? `Message ${activeGroup?.name}...` : `Message ${activeDM?.name}...`}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${s.border}`, background: s.input, color: s.text, fontSize: 13, outline: "none" }} />
                  <button onClick={handleSend} disabled={!input.trim()}
                    style={{ padding: "8px 14px", borderRadius: 8, background: input.trim() ? "#6366f1" : s.border, color: "white", border: "none", cursor: input.trim() ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                    Send
                  </button>
                </div>
              </>
            ) : (
              // Empty State
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 40, color: s.muted, textAlign: "center" }}>
                <MessageCircle size={64} color="#6366f1" style={{ marginBottom: 16, opacity: 0.8 }} />
                <h3 style={{ fontSize: 16, color: s.text, fontWeight: 600, margin: "0 0 8px" }}>Welcome to Chat Hub</h3>
                <p style={{ fontSize: 13, maxWidth: 320, margin: 0 }}>
                  {viewMode === "dms" && "Select a friend from the left sidebar to start messaging. If you don't have friends yet, search by their unique tag ID."}
                  {viewMode === "groups" && "Select a group chat to participate, or create a new group to chat with multiple friends."}
                  {viewMode === "community" && "Select a classroom community discussion channel to chat with peers, or add them as friends."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREATE GROUP MODAL */}
      {showCreateGroup && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 100, backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: s.card, border: `1px solid ${s.border}`,
            borderRadius: 12, width: 400, padding: 24, boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
          }}>
            <h3 style={{ margin: "0 0 16px", color: s.text, fontWeight: 600 }}>Create New Group</h3>
            
            <label style={{ display: "block", fontSize: 12, color: s.muted, marginBottom: 6 }}>Group Name</label>
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="Enter group name..."
              style={{
                width: "100%", padding: "10px", borderRadius: 8,
                border: `1px solid ${s.border}`, background: s.input,
                color: s.text, fontSize: 14, outline: "none", marginBottom: 16
              }}
            />
            
            <label style={{ display: "block", fontSize: 12, color: s.muted, marginBottom: 8 }}>Select Friends</label>
            <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, padding: "4px" }}>
              {friends.length === 0 ? (
                <p style={{ fontSize: 12, color: s.muted, margin: "10px 0" }}>You need to have friends to make a group! Try adding some course peers first.</p>
              ) : (
                friends.map(friend => (
                  <label key={friend.uid} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: s.text, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={selectedFriends.has(friend.uid)}
                      onChange={() => {
                        const copy = new Set(selectedFriends);
                        if (copy.has(friend.uid)) copy.delete(friend.uid);
                        else copy.add(friend.uid);
                        setSelectedFriends(copy);
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{friend.name}</span>
                    <span style={{ fontSize: 11, color: s.muted }}>{friend.tagId}</span>
                  </label>
                ))
              )}
            </div>
            
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => {
                  setShowCreateGroup(false);
                  setNewGroupName("");
                  setSelectedFriends(new Set());
                }}
                style={{
                  padding: "8px 16px", borderRadius: 8, background: "transparent",
                  border: `1px solid ${s.border}`, color: s.muted, cursor: "pointer", fontSize: 13
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={friends.length === 0}
                style={{
                  padding: "8px 16px", borderRadius: 8, background: friends.length === 0 ? s.border : "#6366f1",
                  color: "white", border: "none", cursor: friends.length === 0 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13
                }}
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
