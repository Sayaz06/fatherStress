// Firebase Setup
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

// DOM References
const views = {
    login: document.getElementById('view-login'),
    home: document.getElementById('view-home'),
    folders: document.getElementById('view-folders'),
    note: document.getElementById('view-note')
};

const editor = document.getElementById('editor');
const historyListDiv = document.getElementById('history-list');
const saveStatus = document.getElementById('save-status');

let state = {
    user: null,
    currentFileId: null,
    currentFolderId: null,
    currentNoteId: null,
    lastSavedContent: ""
};

// Navigation
function showPage(name) {
    Object.keys(views).forEach(key => views[key].classList.add('hidden'));
    views[name].classList.remove('hidden');
    document.getElementById('btn-logout').classList.toggle('hidden', name === 'login');
}

// Auth Logic
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

// Firestore Paths
const getFilesRef = () => db.collection('users').doc(state.user.uid).collection('files');
const getFoldersRef = (fId) => getFilesRef().doc(fId).collection('folders');
const getNotesRef = (fId, folId) => getFoldersRef(fId).doc(folId).collection('notes');

// --- Render List Engine (Tajuk Panjang Auto-Wrap) ---
function renderItems(snapshot, targetEl, onOpen, onUpdate, onDelete) {
    targetEl.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = "flex flex-col gap-3 p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-indigo-500/30 transition-all";

        // Input tajuk menggunakan Textarea untuk auto-wrap
        const titleArea = document.createElement('textarea');
        titleArea.className = "bg-transparent text-lg font-bold text-slate-100 resize-none outline-none focus:text-indigo-400 transition-colors w-full overflow-hidden";
        titleArea.value = data.title || '';
        titleArea.rows = 1;
        
        // Auto-resize height
        const adjustHeight = () => {
            titleArea.style.height = 'auto';
            titleArea.style.height = titleArea.scrollHeight + 'px';
        };
        
        titleArea.oninput = adjustHeight;
        titleArea.onchange = () => onUpdate(doc.id, titleArea.value);

        const actions = document.createElement('div');
        actions.className = "flex items-center justify-end gap-2 pt-2 border-t border-slate-700/30";
        
        const bOpen = document.createElement('button');
        bOpen.className = "px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all";
        bOpen.innerText = "BUKA";
        bOpen.onclick = () => onOpen(doc.id, titleArea.value);

        const bDel = document.createElement('button');
        bDel.className = "px-4 py-1.5 text-xs font-bold rounded-lg bg-red-900/10 text-red-400 hover:bg-red-600 hover:text-white transition-all";
        bDel.innerText = "PADAM";
        bDel.onclick = () => onDelete(doc.id);

        actions.append(bOpen, bDel);
        card.append(titleArea, actions);
        targetEl.append(card);
        
        // Initial height adjustment
        setTimeout(adjustHeight, 10);
    });
}

// --- Files & Folders Actions ---
async function loadFiles() {
    const snap = await getFilesRef().orderBy('createdAt', 'desc').get();
    renderItems(snap, document.getElementById('files-list'), openFile, (id, t) => getFilesRef().doc(id).update({title: t}), deleteFile);
}

function openFile(id, title) {
    state.currentFileId = id;
    document.getElementById('current-file-name').innerText = title;
    showPage('folders');
    loadFolders();
}

async function deleteFile(id) {
    if(confirm("Padam fail ini dan semua kandungan di dalamnya?")) {
        await getFilesRef().doc(id).delete();
        loadFiles();
    }
}

async function loadFolders() {
    const snap = await getFoldersRef(state.currentFileId).orderBy('createdAt', 'desc').get();
    renderItems(snap, document.getElementById('folders-list'), openFolder, (id, t) => getFoldersRef(state.currentFileId).doc(id).update({title: t}), deleteFolder);
}

async function deleteFolder(id) {
    if(confirm("Padam folder ini?")) {
        await getFoldersRef(state.currentFileId).doc(id).delete();
        loadFolders();
    }
}

// --- Editor & History ---
async function openFolder(id, title) {
    state.currentFolderId = id;
    document.getElementById('current-folder-name').innerText = title;
    showPage('note');

    const nRef = getNotesRef(state.currentFileId, id);
    const snap = await nRef.limit(1).get();
    
    if (snap.empty) {
        const d = await nRef.add({ content: '', history: [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        state.currentNoteId = d.id;
    } else {
        state.currentNoteId = snap.docs[0].id;
    }

    // Subscribe Live
    db.collection('users').doc(state.user.uid)
      .collection('files').doc(state.currentFileId)
      .collection('folders').doc(state.currentFolderId)
      .collection('notes').doc(state.currentNoteId)
      .onSnapshot(doc => {
        const data = doc.data();
        if (!data) return;
        if (editor.innerHTML !== data.content) {
            editor.innerHTML = data.content || '';
            state.lastSavedContent = data.content;
        }
        renderHistoryList(data.history || []);
    });
}

function renderHistoryList(history) {
    historyListDiv.innerHTML = history.length ? '' : '<p class="text-xs text-slate-600 italic">Tiada sejarah tersedia.</p>';
    history.slice().reverse().forEach((h, i) => {
        const timeStr = h.time ? new Date(h.time.seconds * 1000).toLocaleString('ms-MY') : 'Baru tadi';
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 transition-all";
        div.innerHTML = `
            <div class="flex flex-col">
                <span class="text-[10px] font-bold text-slate-500 uppercase">Versi</span>
                <span class="text-xs text-slate-300">${timeStr}</span>
            </div>
            <button class="px-3 py-1 text-[10px] font-bold rounded-md bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all">RESTORE</button>
        `;
        div.querySelector('button').onclick = () => restoreHistory(history.length - 1 - i);
        historyListDiv.appendChild(div);
    });
}

async function restoreHistory(index) {
    if(!confirm("Kembali ke versi ini?")) return;
    const docRef = getNotesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
    const doc = await docRef.get();
    const content = doc.data().history[index].content;
    await docRef.update({ content });
}

// Auto Save with History
let saveTimer;
editor.oninput = () => {
    saveStatus.innerText = "Menunggu...";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        if (editor.innerHTML === state.lastSavedContent) return;
        saveStatus.innerText = "Menyimpan...";
        
        const docRef = getNotesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
        const doc = await docRef.get();
        let hist = doc.data().history || [];
        
        if (state.lastSavedContent) {
            hist.push({ content: state.lastSavedContent, time: new Date() });
            if (hist.length > 5) hist.shift();
        }

        await docRef.update({ 
            content: editor.innerHTML, 
            history: hist,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        state.lastSavedContent = editor.innerHTML;
        saveStatus.innerText = "Auto-simpan aktif";
    }, 2000);
};

// Toolbars & Events
document.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => { document.execCommand(btn.dataset.action); editor.focus(); };
});

document.getElementById('color-picker').oninput = (e) => {
    document.execCommand('foreColor', false, e.target.value);
};

document.getElementById('btn-size-up').onclick = () => document.execCommand('fontSize', false, '4');
document.getElementById('btn-size-down').onclick = () => document.execCommand('fontSize', false, '2');

document.getElementById('btn-add-file').onclick = async () => {
    const t = prompt("Tajuk fail?");
    if(t) await getFilesRef().add({ title: t, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    loadFiles();
};

document.getElementById('btn-add-folder').onclick = async () => {
    const t = prompt("Tajuk folder?");
    if(t) await getFoldersRef(state.currentFileId).add({ title: t, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    loadFolders();
};

document.getElementById('btn-back-home').onclick = () => showPage('home');
document.getElementById('btn-back-folders').onclick = () => showPage('folders');
