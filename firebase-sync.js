// Firebase Firestore, Friends & Real-Time Chat Synchronization Module for Run Raja Run
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut, 
    signInAnonymously 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { 
    getFirestore, 
    doc, 
    getDoc, 
    getDocFromServer,
    setDoc, 
    addDoc,
    deleteDoc,
    collection, 
    query, 
    orderBy, 
    limit, 
    getDocs,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Firebase configuration provisioned for raviteja--dadi
const firebaseConfig = {
    apiKey: "AIzaSyD0-UegDsgzUl6mfUiLFZUXCFs30wZbfoo",
    authDomain: "raviteja--dadi.firebaseapp.com",
    databaseURL: "https://raviteja--dadi-default-rtdb.firebaseio.com",
    projectId: "raviteja--dadi",
    storageBucket: "raviteja--dadi.firebasestorage.app",
    messagingSenderId: "1041331396864",
    appId: "1:1041331396864:web:3013490094bc799d3dd3e5",
    firestoreDatabaseId: "ai-studio-runrajarun-5a9a3cd1-829d-48b0-8a45-0dec7e9b2826"
};

// Standardized error handler adhering to Firebase skill
function handleFirestoreError(error, operationType, path) {
    const errInfo = {
        error: error instanceof Error ? error.message : String(error),
        authInfo: {
            userId: auth?.currentUser?.uid || null,
            email: auth?.currentUser?.email || null,
            emailVerified: auth?.currentUser?.emailVerified || null,
            isAnonymous: auth?.currentUser?.isAnonymous || null,
            tenantId: auth?.currentUser?.tenantId || null
        },
        operationType,
        path
    };
    console.error('Firestore Error:', JSON.stringify(errInfo));
    return errInfo;
}

// Initialize Firebase
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    try {
        db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    } catch (e) {
        console.warn("Firestore custom DB ID fallback to default:", e);
        db = getFirestore(app);
    }
    console.log("🔥 Firebase initialized for project:", firebaseConfig.projectId);

    // Initial server connection test
    (async () => {
        try {
            await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (e) {
            // expected if doc doesn't exist, confirms network reachability
        }
    })();
} catch (err) {
    console.error("Firebase init failed:", err);
}

let currentUser = null;
let syncListeners = [];
let friendsListeners = [];

// Register callback listeners when user or sync state updates
export function onSyncStateChange(callback) {
    syncListeners.push(callback);
    callback(currentUser, getLocalProgress());
}

function notifySyncListeners() {
    const progress = getLocalProgress();
    syncListeners.forEach(cb => cb(currentUser, progress));
}

// Retrieve local player progress stored in localStorage
export function getLocalProgress() {
    const totalGold = parseInt(localStorage.getItem('runrajarun_total_gold') || '0', 10);
    const highScore = parseInt(localStorage.getItem('runrajarun_high_score') || localStorage.getItem('runrajarun_highscore') || '0', 10);
    const missionMultiplier = parseInt(localStorage.getItem('runrajarun_mission_multiplier') || '0', 10);
    const totalDistance = parseInt(localStorage.getItem('runrajarun_total_distance') || '0', 10);
    const achievementsCount = JSON.parse(localStorage.getItem('runrajarun_achievements') || '[]').length;
    const claimedDays = JSON.parse(localStorage.getItem('runrajarun_claimed_days') || '[]');
    const lastClaimDate = localStorage.getItem('runrajarun_last_claim_date') || '';

    return { totalGold, highScore, missionMultiplier, totalDistance, achievementsCount, claimedDays, lastClaimDate };
}

// Save merged progress locally and update UI elements
export function saveLocalProgress(data) {
    if (data.totalGold !== undefined) {
        localStorage.setItem('runrajarun_total_gold', data.totalGold.toString());
    }
    if (data.highScore !== undefined) {
        localStorage.setItem('runrajarun_high_score', data.highScore.toString());
        localStorage.setItem('runrajarun_highscore', data.highScore.toString());
    }
    if (data.missionMultiplier !== undefined) {
        localStorage.setItem('runrajarun_mission_multiplier', data.missionMultiplier.toString());
    }
    if (data.totalDistance !== undefined) {
        localStorage.setItem('runrajarun_total_distance', data.totalDistance.toString());
    }
    if (data.claimedDays !== undefined) {
        localStorage.setItem('runrajarun_claimed_days', JSON.stringify(data.claimedDays));
    }
    if (data.lastClaimDate !== undefined) {
        localStorage.setItem('runrajarun_last_claim_date', data.lastClaimDate);
    }

    // Call global game UI refresh if available in index.html
    if (window.refreshGameCountersFromStorage && typeof window.refreshGameCountersFromStorage === 'function') {
        window.refreshGameCountersFromStorage();
    }
}

// Push progress to Firestore user document
export async function syncPlayerProgress(overrides = {}) {
    if (!db) return;

    if (!currentUser && auth) {
        try {
            await signInAnonymously(auth);
        } catch (e) {
            console.warn('Anonymous sign-in skipped:', e);
        }
    }

    if (!currentUser) return;

    const targetUid = currentUser.uid;
    const path = `users/${targetUid}`;

    try {
        const local = getLocalProgress();
        const payload = {
            totalGold: overrides.totalGold !== undefined ? overrides.totalGold : local.totalGold,
            highScore: overrides.highScore !== undefined ? overrides.highScore : local.highScore,
            totalDistance: overrides.totalDistance !== undefined ? overrides.totalDistance : local.totalDistance,
            achievementsCount: overrides.achievementsCount !== undefined ? overrides.achievementsCount : local.achievementsCount,
            missionMultiplier: overrides.missionMultiplier !== undefined ? overrides.missionMultiplier : local.missionMultiplier,
            claimedDays: overrides.claimedDays !== undefined ? overrides.claimedDays : local.claimedDays,
            lastClaimDate: overrides.lastClaimDate !== undefined ? overrides.lastClaimDate : local.lastClaimDate,
            displayName: currentUser.displayName || (currentUser.isAnonymous ? 'Royal Guest' : 'Ancient Champion'),
            photoURL: currentUser.photoURL || '',
            isAnonymous: currentUser.isAnonymous || false,
            updatedAt: new Date().toISOString()
        };

        const userDocRef = doc(db, 'users', targetUid);
        await setDoc(userDocRef, payload, { merge: true });
        console.log(`☁️ Synced to user cloud profile [/users/${targetUid}]:`, payload);
        notifySyncListeners();
    } catch (err) {
        handleFirestoreError(err, 'write', path);
    }
}

// Merge remote Firestore user profile with local storage on login
async function mergeRemoteDataOnLogin(user) {
    if (!db || !user) return;

    const path = `users/${user.uid}`;
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const snapshot = await getDoc(userDocRef);
        const local = getLocalProgress();

        if (snapshot.exists()) {
            const remote = snapshot.data();
            console.log(`☁️ Remote cloud profile loaded from [/users/${user.uid}]:`, remote);

            const mergedGold = Math.max(local.totalGold, remote.totalGold || 0);
            const mergedHighScore = Math.max(local.highScore, remote.highScore || 0);
            const mergedMultiplier = Math.max(local.missionMultiplier, remote.missionMultiplier || 0);
            const mergedDistance = Math.max(local.totalDistance, remote.totalDistance || 0);
            const mergedAchievements = Math.max(local.achievementsCount, remote.achievementsCount || 0);

            const localDaysSet = new Set(local.claimedDays);
            (remote.claimedDays || []).forEach(day => localDaysSet.add(day));
            const mergedClaimedDays = Array.from(localDaysSet).sort((a, b) => a - b);

            const merged = {
                totalGold: mergedGold,
                highScore: mergedHighScore,
                missionMultiplier: mergedMultiplier,
                totalDistance: mergedDistance,
                achievementsCount: mergedAchievements,
                claimedDays: mergedClaimedDays,
                lastClaimDate: remote.lastClaimDate || local.lastClaimDate
            };

            saveLocalProgress(merged);
            await syncPlayerProgress(merged);
        } else {
            console.log(`🆕 Creating initial user cloud profile [/users/${user.uid}]`);
            await syncPlayerProgress(local);
        }
    } catch (err) {
        handleFirestoreError(err, 'get', path);
    }
}

// Authentication state observer
if (auth) {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            console.log('👤 Firebase Auth User:', user.uid, user.displayName, user.isAnonymous ? '(Anonymous)' : '');
            await mergeRemoteDataOnLogin(user);
        } else {
            console.log('👤 Firebase Auth: Signed Out');
        }
        notifySyncListeners();
    });
}

// Sign-In with Google
export async function loginWithGoogle() {
    if (!auth) return;
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        console.log('✅ Google sign-in successful:', result.user.displayName);
        return result.user;
    } catch (err) {
        console.warn('Google Sign-In Notice:', err.code || err.message);
        if (err.code === 'auth/unauthorized-domain') {
            try {
                const guestResult = await signInAnonymously(auth);
                console.log('✅ Guest fallback sign-in successful:', guestResult.user.uid);
                err.fallbackUser = guestResult.user;
            } catch (fallbackErr) {
                console.warn('Guest fallback info:', fallbackErr.code || fallbackErr.message);
                err.fallbackError = fallbackErr;
            }
        }
        throw err;
    }
}

// Anonymous Guest Sign-In
export async function loginAnonymouslyUser() {
    if (!auth) return;
    try {
        const result = await signInAnonymously(auth);
        console.log('✅ Anonymous sign-in successful:', result.user.uid);
        return result.user;
    } catch (err) {
        console.warn('Anonymous Sign-In Notice:', err.code || err.message);
        throw err;
    }
}

// Sign Out
export async function logoutUser() {
    if (!auth) return;
    try {
        await signOut(auth);
        currentUser = null;
        console.log('👋 User signed out');
        notifySyncListeners();
    } catch (err) {
        console.error('Logout Error:', err);
    }
}

// Fetch Global Leaderboard from Firestore
export async function fetchGlobalLeaderboard(limitCount = 100) {
    if (!db) return [];
    const path = 'users';
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('highScore', 'desc'), limit(limitCount));
        const querySnapshot = await getDocs(q);

        const leaderboard = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            leaderboard.push({
                id: docSnap.id,
                displayName: data.displayName || (data.isAnonymous ? 'Royal Guest' : 'Ancient Champion'),
                photoURL: data.photoURL || '',
                highScore: data.highScore || 0,
                totalGold: data.totalGold || 0,
                totalDistance: data.totalDistance || 0,
                achievementsCount: data.achievementsCount || 0,
                missionMultiplier: data.missionMultiplier || 0,
                isAnonymous: data.isAnonymous || false,
                updatedAt: data.updatedAt || ''
            });
        });

        return leaderboard;
    } catch (err) {
        handleFirestoreError(err, 'list', path);
        return [];
    }
}

// Calculate Daily Top 5 ranking from existing Firebase user records
export function calculateDailyTop5(leaderboard = []) {
    if (!Array.isArray(leaderboard) || leaderboard.length === 0) {
        return [];
    }

    const now = new Date();
    const todayISO = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const oneDayAgoMs = now.getTime() - (24 * 60 * 60 * 1000);

    // Filter players who were active today or within the last 24 hours
    const todayActive = [];
    const priorPlayers = [];

    leaderboard.forEach(player => {
        let isToday = false;
        if (player.updatedAt) {
            const playerDate = new Date(player.updatedAt);
            if (!isNaN(playerDate.getTime())) {
                if (player.updatedAt.startsWith(todayISO) || playerDate.getTime() >= oneDayAgoMs) {
                    isToday = true;
                }
            }
        }
        if (isToday) {
            todayActive.push(player);
        } else {
            priorPlayers.push(player);
        }
    });

    // Sort by high score descending
    todayActive.sort((a, b) => (b.highScore || 0) - (a.highScore || 0));
    priorPlayers.sort((a, b) => (b.highScore || 0) - (a.highScore || 0));

    // Combine prioritizing today's active players, and fill to 5 from overall top runners
    const combined = [...todayActive, ...priorPlayers].slice(0, 5);

    const dailyTitles = [
        { title: "EMPEROR OF THE DAY", badge: "👑", reward: "+500 🪙", medal: "🥇" },
        { title: "ROYAL CHAMPION", badge: "⚔️", reward: "+350 🪙", medal: "🥈" },
        { title: "TEMPLE VANGUARD", badge: "🛡️", reward: "+200 🪙", medal: "🥉" },
        { title: "DYNASTY WARRIOR", badge: "⚡", reward: "+100 🪙", medal: "#4" },
        { title: "SACRED SCOUT", badge: "🏹", reward: "+50 🪙", medal: "#5" }
    ];

    return combined.map((player, idx) => {
        const isVerifiedToday = todayActive.some(p => p.id === player.id);
        const meta = dailyTitles[idx] || { title: "DYNASTY RUNNER", badge: "⚔️", reward: "+25 🪙", medal: `#${idx+1}` };
        return {
            ...player,
            dailyRank: idx + 1,
            dailyTitle: meta.title,
            dailyBadge: meta.badge,
            dailyMedal: meta.medal,
            dailyReward: meta.reward,
            isActiveToday: isVerifiedToday
        };
    });
}

// ==========================================
// 👥 FRIENDS MANAGEMENT SYSTEM
// ==========================================

export function getLocalFriends() {
    try {
        const stored = localStorage.getItem('runrajarun_friends');
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error("Error loading local friends:", e);
    }
    return [];
}

export function saveLocalFriends(friendsList) {
    localStorage.setItem('runrajarun_friends', JSON.stringify(friendsList));
}

// Add a friend by user profile object
export async function addFriend(friend) {
    if (!friend || !friend.id) return;
    const friendId = friend.id;
    if (currentUser && currentUser.uid === friendId) {
        console.warn("Cannot add self as friend");
        return;
    }

    const currentFriends = getLocalFriends();
    const existingIdx = currentFriends.findIndex(f => f.id === friendId);
    const friendData = {
        id: friendId,
        displayName: friend.displayName || 'Royal Runner',
        photoURL: friend.photoURL || '',
        highScore: friend.highScore || 0,
        totalGold: friend.totalGold || 0,
        addedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
        currentFriends[existingIdx] = friendData;
    } else {
        currentFriends.unshift(friendData);
    }
    saveLocalFriends(currentFriends);

    // Sync to Firestore if signed in
    if (currentUser && db) {
        const path = `users/${currentUser.uid}/friends/${friendId}`;
        try {
            await setDoc(doc(db, 'users', currentUser.uid, 'friends', friendId), friendData, { merge: true });
            console.log(`👥 Friend saved to cloud: ${friend.displayName}`);
        } catch (err) {
            handleFirestoreError(err, 'write', path);
        }
    }
    return currentFriends;
}

// Remove a friend
export async function removeFriend(friendId) {
    let currentFriends = getLocalFriends();
    currentFriends = currentFriends.filter(f => f.id !== friendId);
    saveLocalFriends(currentFriends);

    if (currentUser && db) {
        const path = `users/${currentUser.uid}/friends/${friendId}`;
        try {
            await deleteDoc(doc(db, 'users', currentUser.uid, 'friends', friendId));
            console.log(`👥 Friend removed from cloud: ${friendId}`);
        } catch (err) {
            handleFirestoreError(err, 'delete', path);
        }
    }
    return currentFriends;
}

// Real-time listener for friends subcollection
export function listenToFriends(callback) {
    // Initial local dispatch
    callback(getLocalFriends());

    if (!currentUser || !db) return () => {};

    const path = `users/${currentUser.uid}/friends`;
    try {
        const friendsRef = collection(db, 'users', currentUser.uid, 'friends');
        const unsubscribe = onSnapshot(friendsRef, (snapshot) => {
            const list = [];
            snapshot.forEach(docSnap => {
                list.push({ id: docSnap.id, ...docSnap.data() });
            });
            saveLocalFriends(list);
            callback(list);
        }, (err) => {
            handleFirestoreError(err, 'list', path);
        });
        return unsubscribe;
    } catch (err) {
        handleFirestoreError(err, 'list', path);
        return () => {};
    }
}

// ==========================================
// 💬 REAL-TIME CHAT ENGINE (DIRECT & GLOBAL)
// ==========================================

export function getDirectChatId(uid1, uid2) {
    if (!uid1 || !uid2) return null;
    return [uid1, uid2].sort().join('_');
}

// Listen to Direct Message conversation with a friend
export function listenToDirectChat(friendId, onMessages) {
    if (!db || !currentUser || !friendId) {
        onMessages([]);
        return () => {};
    }

    const chatId = getDirectChatId(currentUser.uid, friendId);
    const path = `chats/${chatId}/messages`;

    try {
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(60));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = [];
            snapshot.forEach(docSnap => {
                messages.push({ id: docSnap.id, ...docSnap.data() });
            });
            onMessages(messages);
        }, (err) => {
            handleFirestoreError(err, 'list', path);
        });

        return unsubscribe;
    } catch (err) {
        handleFirestoreError(err, 'list', path);
        return () => {};
    }
}

// Send Direct Message to a friend
export async function sendDirectMessage(friendId, text, type = 'text') {
    if (!text || !text.trim() || !friendId || !db) return;

    if (!currentUser && auth) {
        await signInAnonymously(auth);
    }
    if (!currentUser) return;

    const trimmedText = text.trim();
    const chatId = getDirectChatId(currentUser.uid, friendId);
    const path = `chats/${chatId}/messages`;

    try {
        // Ensure chat room doc exists
        const chatDocRef = doc(db, 'chats', chatId);
        await setDoc(chatDocRef, {
            chatId: chatId,
            participantIds: [currentUser.uid, friendId],
            lastMessage: trimmedText,
            lastSenderId: currentUser.uid,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        // Add message
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await addDoc(messagesRef, {
            senderId: currentUser.uid,
            senderName: currentUser.displayName || (currentUser.isAnonymous ? 'Royal Guest' : 'Ancient Champion'),
            senderPhoto: currentUser.photoURL || '',
            text: trimmedText,
            type: type,
            createdAt: new Date().toISOString()
        });

        console.log(`💬 Message sent to friend ${friendId}`);
    } catch (err) {
        handleFirestoreError(err, 'write', path);
    }
}

// Listen to Global Tavern Community Chat
export function listenToGlobalChat(onMessages) {
    if (!db) {
        onMessages([]);
        return () => {};
    }

    const path = 'global_chat/tavern/messages';
    try {
        const messagesRef = collection(db, 'global_chat', 'tavern', 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(80));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = [];
            snapshot.forEach(docSnap => {
                messages.push({ id: docSnap.id, ...docSnap.data() });
            });
            onMessages(messages);
        }, (err) => {
            handleFirestoreError(err, 'list', path);
        });

        return unsubscribe;
    } catch (err) {
        handleFirestoreError(err, 'list', path);
        return () => {};
    }
}

// Send Global Chat Message in Royal Tavern
export async function sendGlobalChatMessage(text, type = 'text') {
    if (!text || !text.trim() || !db) return;

    if (!currentUser && auth) {
        try {
            await signInAnonymously(auth);
        } catch (e) {
            console.warn("Guest sign-in skipped:", e);
        }
    }
    if (!currentUser) return;

    const trimmedText = text.trim();
    const path = 'global_chat/tavern/messages';

    try {
        const messagesRef = collection(db, 'global_chat', 'tavern', 'messages');
        await addDoc(messagesRef, {
            senderId: currentUser.uid,
            senderName: currentUser.displayName || (currentUser.isAnonymous ? 'Royal Guest' : 'Ancient Champion'),
            senderPhoto: currentUser.photoURL || '',
            text: trimmedText,
            type: type,
            createdAt: new Date().toISOString()
        });
        console.log("💬 Global message posted:", trimmedText);
    } catch (err) {
        handleFirestoreError(err, 'write', path);
    }
}

// Expose on window object
window.FirebaseSync = {
    app,
    auth,
    get db() { return db; },
    firebaseConfig,
    get currentUser() { return currentUser; },
    getLocalProgress,
    saveLocalProgress,
    onSyncStateChange,
    syncPlayerProgress,
    loginWithGoogle,
    loginAnonymouslyUser,
    logoutUser,
    fetchGlobalLeaderboard,
    calculateDailyTop5,
    // Friends
    getLocalFriends,
    addFriend,
    removeFriend,
    listenToFriends,
    // Chat
    getDirectChatId,
    listenToDirectChat,
    sendDirectMessage,
    listenToGlobalChat,
    sendGlobalChatMessage
};
