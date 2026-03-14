const firebaseConfig = {
    apiKey: "AIzaSyCtxOE42D07yFc9eK3nLMsOy50SmeSErwI",
    authDomain: "fatherstress-9e695.firebaseapp.com",
    projectId: "fatherstress-9e695",
    storageBucket: "fatherstress-9e695.firebasestorage.app",
    messagingSenderId: "147729735248",
    appId: "1:147729735248:web:f6771fee76727436a0fb55"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let state = { user: null, currentFileId: null, currentFolderId: null, currentNoteId: null, lastSavedContent: "" };

const views = { login: document.getElementById('view-login'), home: document.getElementById('view-home'), folders: document.getElementById('view-folders'), note: document.getElementById('view-note') };
const editor = document.getElementById('editor'), historyList = document.getElementById('history-list'), saveStatus = document.getElementById('save-status');

function showPage(viewName) {
    Object.keys(views).forEach(key => views[key].classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    document.getElementById('btn-logout').classList.toggle('hidden', viewName === 'login');
}

auth.onAuthStateChanged(user => {
    state.user = user;
    if (user) { showPage('home'); loadFiles(); } else { showPage('login'); }
});

document.getElementById('btn-google').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
document.getElementById('btn-logout').onclick = () => auth.signOut();

const filesRef = () => db.collection('users').doc(state.user.uid).collection('files');
const foldersRef = (fId) => filesRef().doc(fId).collection('folders');
const notesRef = (fId, folId) => foldersRef(fId).doc(folId).collection('notes');

// --- RENDERER (Dibetulkan Susunan) ---
function renderCleanItems(snapshot, targetEl, onOpen, onUpdate, onDelete) {
    targetEl.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = "clean-card";
        const titleArea = document.createElement('textarea');
        titleArea.className = "title-textarea";
        titleArea.value = data.title || '';
        titleArea.rows = 1;
        const autoHeight = () => { titleArea.style.height = 'auto'; titleArea.style.height = titleArea.scrollHeight + 'px'; };
        titleArea.addEventListener('input', autoHeight);
        titleArea.addEventListener('change', () => onUpdate(doc.id, titleArea.value));
        const footer = document.createElement('div');
        footer.className = "flex items-center gap-2 mt-5 pt-4 border-t border-slate-800/50 justify-end";
        const btnOpen = createActionBtn("📝 BUKA", "bg-slate-800", () => onOpen(doc.id, data.title));
        const btnDelete = createActionBtn("🗑️", "bg-red-900/10 text-red-500", () => onDelete(doc.id));
        footer.append(btnOpen, btnDelete);
        card.append(titleArea, footer);
        targetEl.append(card);
        setTimeout(autoHeight, 0);
    });
}

function createActionBtn(text, cls, fn) {
    const b = document.createElement('button');
    b.className = `px-5 py-2 rounded-xl text-[10px] font-bold border border-slate-700/50 ${cls}`;
    b.innerHTML = text; b.onclick = fn; return b;
}

// --- LOGIC (Urutan desc supaya yang baru di atas) ---
async function loadFiles() {
    const snap = await filesRef().orderBy('createdAt', 'desc').get();
    renderCleanItems(snap, document.getElementById('files-list'), openFile, (id, t) => filesRef().doc(id).update({title: t}), deleteFile);
}

function openFile(id, title) {
    state.currentFileId = id;
    document.getElementById('current-file-name').innerText = title;
    showPage('folders'); loadFolders();
}

async function deleteFile(id) { if(confirm("Padam fail?")) { await filesRef().doc(id).delete(); loadFiles(); } }

async function loadFolders() {
    const snap = await foldersRef(state.currentFileId).orderBy('createdAt', 'desc').get();
    renderCleanItems(snap, document.getElementById('folders-list'), openFolder, (id, t) => foldersRef(state.currentFileId).doc(id).update({title: t}), deleteFolder);
}

async function deleteFolder(id) { if(confirm("Padam folder?")) { await foldersRef(state.currentFileId).doc(id).delete(); loadFolders(); } }

// --- LOGIK HISTORY (IKUT SLOT MASA) ---
async function openFolder(id, title) {
    state.currentFolderId = id;
    document.getElementById('current-folder-name').innerText = title;
    showPage('note');
    const nRef = notesRef(state.currentFileId, id);
    const snap = await nRef.limit(1).get();
    state.currentNoteId = snap.empty ? (await nRef.add({ content: '', history: {}, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })).id : snap.docs[0].id;

    nRef.doc(state.currentNoteId).onSnapshot(doc => {
        const data = doc.data();
        if (data && editor.innerHTML !== data.content) { editor.innerHTML = data.content || ''; state.lastSavedContent = data.content; }
        renderHistorySlots(data.history || {});
    });
}

function renderHistorySlots(historyObj) {
    historyList.innerHTML = '';
    const slots = [
        { key: 'slot3Days', label: '3 Hari Lepas' },
        { key: 'slot2Days', label: '2 Hari Lepas' },
        { key: 'slot4Hours', label: '4 Jam Lepas' },
        { key: 'slot1Hour', label: '1 Jam Terakhir' },
        { key: 'slotRealtime', label: 'Real-time (Edit Terkini)' }
    ];

    slots.forEach(slot => {
        if (historyObj[slot.key]) {
            const div = document.createElement('div');
            div.className = "flex items-center justify-between p-4 rounded-2xl bg-slate-800/30 border border-slate-800 text-xs";
            div.innerHTML = `<span class="text-slate-400 font-bold uppercase">${slot.label}</span> <button class="px-3 py-1 bg-indigo-600 rounded-lg font-bold">RESTORE</button>`;
            div.querySelector('button').onclick = async () => {
                if(confirm(`Restore versi ${slot.label}?`)) {
                    await notesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId).update({ content: historyObj[slot.key].content });
                }
            };
            historyList.appendChild(div);
        }
    });
}

// Auto Save & History Manager
let saveTimer;
editor.oninput = () => {
    saveStatus.innerText = "MENUNGGU...";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        if (editor.innerHTML === state.lastSavedContent) return;
        saveStatus.innerText = "MENYIMPAN...";
        
        const docRef = notesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
        const doc = await docRef.get();
        const data = doc.data();
        const history = data.history || {};
        const now = Date.now();

        // Logik Penentuan Slot
        const diffHours = (now - (data.updatedAt?.toMillis() || now)) / 3600000;

        // Sentiasa update Real-time
        history.slotRealtime = { content: state.lastSavedContent, time: firebase.firestore.Timestamp.now() };

        // Slot lain hanya diisi mengikut masa berlalu (snapshot)
        if (!history.slot1Hour || diffHours >= 1) history.slot1Hour = { content: state.lastSavedContent, time: firebase.firestore.Timestamp.now() };
        if (!history.slot4Hours || diffHours >= 4) history.slot4Hours = { content: state.lastSavedContent, time: firebase.firestore.Timestamp.now() };
        if (!history.slot2Days || diffHours >= 48) history.slot2Days = { content: state.lastSavedContent, time: firebase.firestore.Timestamp.now() };
        if (!history.slot3Days || diffHours >= 72) history.slot3Days = { content: state.lastSavedContent, time: firebase.firestore.Timestamp.now() };

        await docRef.update({ content: editor.innerHTML, history: history, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        state.lastSavedContent = editor.innerHTML;
        saveStatus.innerText = "AUTO-SIMPAN AKTIF";
    }, 2000);
};

// Toolbar
document.querySelectorAll('[data-action]').forEach(b => { b.onclick = () => { document.execCommand(b.dataset.action); editor.focus(); }; });
document.getElementById('color-picker').oninput = (e) => document.execCommand('foreColor', false, e.target.value);
document.getElementById('btn-size-up').onclick = () => document.execCommand('fontSize', false, '5');
document.getElementById('btn-size-down').onclick = () => document.execCommand('fontSize', false, '3');

document.getElementById('btn-back-home').onclick = () => showPage('home');
document.getElementById('btn-back-folders').onclick = () => showPage('folders');
document.getElementById('btn-add-file').onclick = async () => { const t = prompt("Nama fail?"); if(t) await filesRef().add({ title: t, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); loadFiles(); };
document.getElementById('btn-add-folder').onclick = async () => { const t = prompt("Nama folder?"); if(t) await foldersRef(state.currentFileId).add({ title: t, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); loadFolders(); };
