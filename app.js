// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyCtxOE42D07yFc9eK3nLMsOy50SmeSErwI",
    authDomain: "fatherstress-9e695.firebaseapp.com",
    projectId: "fatherstress-9e695",
    storageBucket: "fatherstress-9e695.firebasestorage.app",
    messagingSenderId: "147729735248",
    appId: "1:147729735248:web:f6771fee76727436a0fb55",
    measurementId: "G-GF6HCJZ5MD"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global State
let state = {
    user: null,
    currentFileId: null,
    currentFolderId: null,
    currentNoteId: null,
    lastSavedContent: ""
};

// DOM Elements
const views = {
    login: document.getElementById('view-login'),
    home: document.getElementById('view-home'),
    folders: document.getElementById('view-folders'),
    note: document.getElementById('view-note')
};
const editor = document.getElementById('editor');
const historyList = document.getElementById('history-list');
const saveStatus = document.getElementById('save-status');

// Page Navigation
function showPage(viewName) {
    Object.keys(views).forEach(key => views[key].classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    document.getElementById('btn-logout').classList.toggle('hidden', viewName === 'login');
}

// Auth Observer
auth.onAuthStateChanged(user => {
    state.user = user;
    if (user) {
        showPage('home');
        loadFiles();
    } else {
        showPage('login');
    }
});

document.getElementById('btn-google').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
document.getElementById('btn-logout').onclick = () => auth.signOut();

// Firebase References
const filesRef = () => db.collection('users').doc(state.user.uid).collection('files');
const foldersRef = (fId) => filesRef().doc(fId).collection('folders');
const notesRef = (fId, folId) => foldersRef(fId).doc(folId).collection('notes');

// --- Kad Renderer (Gaya Clean & Lebar Penuh) ---
function renderCleanItems(snapshot, targetEl, onOpen, onUpdate, onDelete) {
    targetEl.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = "clean-card";

        // TAJUK: Auto-wrap, No White BG
        const titleArea = document.createElement('textarea');
        titleArea.className = "title-textarea";
        titleArea.value = data.title || '';
        titleArea.rows = 1;

        const autoHeight = () => {
            titleArea.style.height = 'auto';
            titleArea.style.height = titleArea.scrollHeight + 'px';
        };

        titleArea.addEventListener('input', autoHeight);
        titleArea.addEventListener('change', () => onUpdate(doc.id, titleArea.value));

        // PRATONTON: Italic
        const preview = document.createElement('p');
        preview.className = "text-sm text-slate-500 italic mt-3 line-clamp-2";
        preview.innerText = data.preview || "Sila masukkan kandungan...";

        // FOOTER: Horizontal
        const footer = document.createElement('div');
        footer.className = "flex items-center gap-2 mt-5 pt-4 border-t border-slate-800/50 justify-end";

        const btnOpen = createActionBtn("📝 BUKA", "bg-slate-800 hover:bg-slate-700", () => onOpen(doc.id, data.title));
        const btnDelete = createActionBtn("🗑️", "bg-red-900/10 text-red-500 hover:bg-red-900/30", () => onDelete(doc.id));

        footer.append(btnOpen, btnDelete);
        card.append(titleArea, preview, footer);
        targetEl.append(card);
        setTimeout(autoHeight, 0);
    });
}

function createActionBtn(text, cls, fn) {
    const b = document.createElement('button');
    b.className = `px-5 py-2 rounded-xl text-[10px] font-bold transition-all border border-slate-700/50 ${cls}`;
    b.innerHTML = text;
    b.onclick = fn;
    return b;
}

// --- Files & Folders Logic ---
async function loadFiles() {
    const snap = await filesRef().orderBy('createdAt', 'desc').get();
    renderCleanItems(snap, document.getElementById('files-list'), openFile, (id, t) => filesRef().doc(id).update({title: t}), deleteFile);
}

function openFile(id, title) {
    state.currentFileId = id;
    document.getElementById('current-file-name').innerText = title;
    showPage('folders');
    loadFolders();
}

async function deleteFile(id) {
    if(confirm("Padam fail ini?")) { await filesRef().doc(id).delete(); loadFiles(); }
}

async function loadFolders() {
    const snap = await foldersRef(state.currentFileId).orderBy('createdAt', 'desc').get();
    renderCleanItems(snap, document.getElementById('folders-list'), openFolder, (id, t) => foldersRef(state.currentFileId).doc(id).update({title: t}), deleteFolder);
}

async function deleteFolder(id) {
    if(confirm("Padam folder ini?")) { await foldersRef(state.currentFileId).doc(id).delete(); loadFolders(); }
}

// --- Note Editor & History ---
async function openFolder(id, title) {
    state.currentFolderId = id;
    document.getElementById('current-folder-name').innerText = title;
    showPage('note');

    const nRef = notesRef(state.currentFileId, id);
    const snap = await nRef.limit(1).get();
    state.currentNoteId = snap.empty ? (await nRef.add({ content: '', history: [] })).id : snap.docs[0].id;

    nRef.doc(state.currentNoteId).onSnapshot(doc => {
        const data = doc.data();
        if (data && editor.innerHTML !== data.content) {
            editor.innerHTML = data.content || '';
            state.lastSavedContent = data.content;
        }
        renderHistory(data.history || []);
    });
}

function renderHistory(history) {
    historyList.innerHTML = history.length ? '' : '<p class="text-[10px] text-slate-600 italic">Tiada sejarah tersedia.</p>';
    history.slice().reverse().forEach((h, i) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-4 rounded-2xl bg-slate-800/30 border border-slate-800 text-xs";
        const date = h.time ? new Date(h.time.seconds * 1000).toLocaleString('ms-MY') : 'Baru tadi';
        div.innerHTML = `<span class="text-slate-400 font-medium">${date}</span> <button class="px-3 py-1 bg-indigo-600 rounded-lg font-bold text-[10px]">RESTORE</button>`;
        div.querySelector('button').onclick = async () => {
            const content = history[history.length - 1 - i].content;
            await notesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId).update({ content });
        };
        historyList.appendChild(div);
    });
}

// Auto Save
let saveTimer;
editor.oninput = () => {
    saveStatus.innerText = "MENUNGGU...";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        if (editor.innerHTML === state.lastSavedContent) return;
        saveStatus.innerText = "MENYIMPAN...";
        
        const docRef = notesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
        const doc = await docRef.get();
        let hist = doc.data().history || [];
        
        if (state.lastSavedContent) {
            hist.push({ content: state.lastSavedContent, time: new Date() });
            if (hist.length > 5) hist.shift();
        }

        const plainText = editor.innerText.substring(0, 100);
        await docRef.update({ content: editor.innerHTML, history: hist });
        await foldersRef(state.currentFileId).doc(state.currentFolderId).update({ preview: plainText });
        
        state.lastSavedContent = editor.innerHTML;
        saveStatus.innerText = "AUTO-SIMPAN AKTIF";
    }, 2000);
};

// Toolbar Setup
document.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => { document.execCommand(b.dataset.action); editor.focus(); };
});
document.getElementById('color-picker').oninput = (e) => document.execCommand('foreColor', false, e.target.value);
document.getElementById('btn-size-up').onclick = () => document.execCommand('fontSize', false, '5');
document.getElementById('btn-size-down').onclick = () => document.execCommand('fontSize', false, '3');

// Navigation
document.getElementById('btn-back-home').onclick = () => showPage('home');
document.getElementById('btn-back-folders').onclick = () => showPage('folders');

// Add Items
document.getElementById('btn-add-file').onclick = async () => {
    const t = prompt("Nama fail baru?");
    if(t) await filesRef().add({ title: t, createdAt: new Date() });
    loadFiles();
};
document.getElementById('btn-add-folder').onclick = async () => {
    const t = prompt("Nama folder baru?");
    if(t) await foldersRef(state.currentFileId).add({ title: t, createdAt: new Date() });
    loadFolders();
};
