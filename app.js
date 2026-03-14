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

// DOM References
const vHome = document.getElementById('view-home'), vFolders = document.getElementById('view-folders'),
      vNote = document.getElementById('view-note'), vLogin = document.getElementById('view-login');
const editor = document.getElementById('editor'), historyList = document.getElementById('history-list');

let state = { user: null, currentFileId: null, currentFolderId: null, currentNoteId: null, lastSavedContent: "" };

// Show View
function showPage(view) {
    [vLogin, vHome, vFolders, vNote].forEach(v => v.classList.add('hidden'));
    view.classList.remove('hidden');
    document.getElementById('btn-logout').classList.toggle('hidden', view === vLogin);
}

// Auth
auth.onAuthStateChanged(user => {
    state.user = user;
    if (user) { showPage(vHome); loadFiles(); } else { showPage(vLogin); }
});
document.getElementById('btn-google').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
document.getElementById('btn-logout').onclick = () => auth.signOut();

const getFilesRef = () => db.collection('users').doc(state.user.uid).collection('files');
const getFoldersRef = (fId) => getFilesRef().doc(fId).collection('folders');
const getNotesRef = (fId, folId) => getFoldersRef(fId).doc(folId).collection('notes');

// --- CLEAN CARD RENDERER (MENGARAH GAMBAR) ---
function renderItems(snapshot, targetEl, onOpen, onUpdate, onDelete) {
    targetEl.innerHTML = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = "relative bg-[#1e293b]/40 p-5 rounded-2xl border border-slate-800 shadow-xl group transition-all hover:border-slate-700";

        // TAJUK (BIRU SEPERTI GAMBAR)
        const titleArea = document.createElement('textarea');
        titleArea.className = "w-full bg-transparent text-blue-400 text-lg font-bold outline-none resize-none overflow-hidden leading-tight";
        titleArea.value = data.title || '';
        titleArea.rows = 1;
        titleArea.oninput = () => { titleArea.style.height = 'auto'; titleArea.style.height = titleArea.scrollHeight + 'px'; };
        titleArea.onchange = () => onUpdate(doc.id, titleArea.value);

        // TEKS PRATONTON (ITALIC SEPERTI GAMBAR)
        const preview = document.createElement('p');
        preview.className = "text-sm text-slate-400 italic mt-2 line-clamp-2 leading-relaxed";
        preview.innerText = data.preview || "Tiada kandungan tersedia...";

        // BUTTONS (HORIZONTAL SEPERTI GAMBAR)
        const footer = document.createElement('div');
        footer.className = "flex items-center gap-2 mt-5 pt-4 border-t border-slate-800/50 justify-end";

        const btnLatih = createBtn("📝 Latih", "bg-slate-700 hover:bg-slate-600", () => onOpen(doc.id, data.title));
        const btnTajuk = createBtn("✏️ Tajuk", "bg-slate-700 hover:bg-slate-600", () => titleArea.focus());
        const btnDelete = createBtn("🗑️", "bg-red-900/30 hover:bg-red-800 text-red-400", () => onDelete(doc.id));

        footer.append(btnLatih, btnTajuk, btnDelete);
        card.append(titleArea, preview, footer);
        targetEl.append(card);
        setTimeout(() => titleArea.oninput(), 0);
    });
}

function createBtn(text, cls, fn) {
    const b = document.createElement('button');
    b.className = `px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${cls}`;
    b.innerHTML = text;
    b.onclick = fn;
    return b;
}

// --- LOGIC FUNCTIONS (Files/Folders) ---
async function loadFiles() {
    const snap = await getFilesRef().orderBy('createdAt', 'desc').get();
    renderItems(snap, document.getElementById('files-list'), openFile, (id, t) => getFilesRef().doc(id).update({title: t}), deleteFile);
}

function openFile(id, title) {
    state.currentFileId = id;
    document.getElementById('current-file-name').innerText = title;
    showPage(vFolders);
    loadFolders();
}

async function deleteFile(id) {
    if(confirm("Padam fail ini?")) { await getFilesRef().doc(id).delete(); loadFiles(); }
}

async function loadFolders() {
    const snap = await getFoldersRef(state.currentFileId).orderBy('createdAt', 'desc').get();
    renderItems(snap, document.getElementById('folders-list'), openFolder, (id, t) => getFoldersRef(state.currentFileId).doc(id).update({title: t}), deleteFolder);
}

async function deleteFolder(id) {
    if(confirm("Padam folder ini?")) { await getFoldersRef(state.currentFileId).doc(id).delete(); loadFolders(); }
}

// --- NOTE & HISTORY ---
async function openFolder(id, title) {
    state.currentFolderId = id;
    document.getElementById('current-folder-name').innerText = title;
    showPage(vNote);
    const nRef = getNotesRef(state.currentFileId, id);
    const snap = await nRef.limit(1).get();
    state.currentNoteId = snap.empty ? (await nRef.add({ content: '', history: [] })).id : snap.docs[0].id;

    nRef.doc(state.currentNoteId).onSnapshot(doc => {
        const data = doc.data();
        if (editor.innerHTML !== data.content) {
            editor.innerHTML = data.content || '';
            state.lastSavedContent = data.content;
        }
        renderHistoryList(data.history || []);
    });
}

function renderHistoryList(history) {
    historyList.innerHTML = history.length ? '' : '<p class="text-[10px] text-slate-600 italic">Tiada sejarah.</p>';
    history.slice().reverse().forEach((h, i) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800 text-xs";
        div.innerHTML = `<span>Versi ${history.length - i}</span> <button class="px-2 py-1 bg-slate-700 rounded-md font-bold">RESTORE</button>`;
        div.querySelector('button').onclick = async () => {
            const content = history[history.length - 1 - i].content;
            await getNotesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId).update({ content });
        };
        historyList.appendChild(div);
    });
}

// Auto Save
let saveTimer;
editor.oninput = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        if (editor.innerHTML === state.lastSavedContent) return;
        const docRef = getNotesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
        const doc = await docRef.get();
        let hist = doc.data().history || [];
        if (state.lastSavedContent) {
            hist.push({ content: state.lastSavedContent, time: new Date() });
            if (hist.length > 5) hist.shift();
        }
        // Update content & preview text
        const plainText = editor.innerText.substring(0, 150);
        await docRef.update({ content: editor.innerHTML, history: hist, preview: plainText });
        
        // Juga update preview dalam folder untuk paparan di kad
        await getFoldersRef(state.currentFileId).doc(state.currentFolderId).update({ preview: plainText });
        
        state.lastSavedContent = editor.innerHTML;
    }, 3000);
};

// Toolbar Events
document.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => { document.execCommand(b.dataset.action); editor.focus(); };
});
document.getElementById('color-picker').oninput = (e) => document.execCommand('foreColor', false, e.target.value);
document.getElementById('btn-size-up').onclick = () => document.execCommand('fontSize', false, '5');
document.getElementById('btn-size-down').onclick = () => document.execCommand('fontSize', false, '3');

document.getElementById('btn-back-home').onclick = () => showPage(vHome);
document.getElementById('btn-back-folders').onclick = () => showPage(vFolders);

document.getElementById('btn-add-file').onclick = async () => {
    const t = prompt("Tajuk fail?");
    if(t) await getFilesRef().add({ title: t, createdAt: new Date() });
    loadFiles();
};
document.getElementById('btn-add-folder').onclick = async () => {
    const t = prompt("Tajuk folder?");
    if(t) await getFoldersRef(state.currentFileId).add({ title: t, createdAt: new Date() });
    loadFolders();
};
