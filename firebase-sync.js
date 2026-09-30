// Pure Offline Progress, Friends & Real-Time Chat Simulation Module for Run Raja Run
// No Firebase SDK loads, no external connections. 100% Offline and Private.

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

let syncListeners = [];

// Register callback listeners when user or sync state updates
export function onSyncStateChange(callback) {
    syncListeners.push(callback);
    callback(null, getLocalProgress());
}

function notifySyncListeners() {
    const progress = getLocalProgress();
    syncListeners.forEach(cb => cb(null, progress));
}

// Push progress (no-op offline)
export async function syncPlayerProgress(overrides = {}) {
    saveLocalProgress(overrides);
    notifySyncListeners();
    return Promise.resolve();
}

// Sign-In (no-op offline)
export async function loginWithGoogle() {
    throw new Error("Cloud Sync is deactivated. Game is running in 100% offline local mode.");
}

export async function loginAnonymouslyUser() {
    throw new Error("Cloud Sync is deactivated. Game is running in 100% offline local mode.");
}

export async function logoutUser() {
    return Promise.resolve();
}

// Fetch Global Leaderboard (offline placeholder with generated royal champions)
export async function fetchGlobalLeaderboard(limitCount = 100) {
    const local = getLocalProgress();
    const offlineChamps = [
        { id: "1", displayName: "MAHARAJA VIKRAM", highScore: 25000, totalGold: 12000, totalDistance: 8200 },
        { id: "2", displayName: "RANI PADMINI", highScore: 18400, totalGold: 7800, totalDistance: 5400 },
        { id: "3", displayName: "SENAPATI ADITYA", highScore: 14200, totalGold: 5900, totalDistance: 4300 },
        { id: "4", displayName: "LOCAL RAJA (YOU)", highScore: local.highScore, totalGold: local.totalGold, totalDistance: local.totalDistance }
    ];
    // Sort high score descending
    offlineChamps.sort((a, b) => b.highScore - a.highScore);
    return offlineChamps;
}

// Calculate Daily Top 5 ranking
export function calculateDailyTop5(leaderboard = []) {
    return leaderboard.slice(0, 5).map((player, idx) => {
        const dailyTitles = [
            { title: "EMPEROR OF THE DAY", badge: "👑", reward: "+500 🪙", medal: "🥇" },
            { title: "ROYAL CHAMPION", badge: "⚔️", reward: "+350 🪙", medal: "🥈" },
            { title: "TEMPLE VANGUARD", badge: "🛡️", reward: "+200 🪙", medal: "🥉" },
            { title: "DYNASTY WARRIOR", badge: "⚡", reward: "+100 🪙", medal: "#4" },
            { title: "SACRED SCOUT", badge: "🏹", reward: "+50 🪙", medal: "#5" }
        ];
        const meta = dailyTitles[idx] || { title: "DYNASTY RUNNER", badge: "⚔️", reward: "+25 🪙", medal: `#${idx+1}` };
        return {
            ...player,
            dailyRank: idx + 1,
            dailyTitle: meta.title,
            dailyBadge: meta.badge,
            dailyMedal: meta.medal,
            dailyReward: meta.reward,
            isActiveToday: true
        };
    });
}

// Friends simulation
export function getLocalFriends() {
    return [];
}

export function saveLocalFriends() {}

export async function addFriend() {
    return [];
}

export async function removeFriend() {
    return [];
}

export function listenToFriends(callback) {
    callback([]);
    return () => {};
}

// Chat simulation
export function getDirectChatId() {
    return null;
}

export function listenToDirectChat(friendId, onMessages) {
    onMessages([]);
    return () => {};
}

export async function sendDirectMessage() {
    return Promise.resolve();
}

export function listenToGlobalChat(onMessages) {
    onMessages([]);
    return () => {};
}

export async function sendGlobalChatMessage() {
    return Promise.resolve();
}

// Expose on window object
window.FirebaseSync = {
    app: null,
    auth: null,
    db: null,
    firebaseConfig: {},
    currentUser: null,
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
