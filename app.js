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
    if(views[viewName]) views[viewName].classList.remove('hidden');
    
    const btnLogout = document.getElementById('btn-logout');
    if(btnLogout) btnLogout.classList.toggle('hidden', viewName === 'login');
}

auth.onAuthStateChanged(user => {
    state.user = user;
    if (user) { showPage('home'); loadFiles(); } else { showPage('login'); }
});

const btnGoogle = document.getElementById('btn-google');
if(btnGoogle) btnGoogle.onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());

const btnLogout = document.getElementById('btn-logout');
if(btnLogout) btnLogout.onclick = () => auth.signOut();

const filesRef = () => db.collection('users').doc(state.user.uid).collection('files');
const foldersRef = (fId) => filesRef().doc(fId).collection('folders');
const notesRef = (fId, folId) => foldersRef(fId).doc(folId).collection('notes');

// --- RENDERER DENGAN BUTTON EDIT KHUSUS & SUSUNAN ABJAD/ANGKA ---
function renderCleanItems(snapshot, targetEl, onOpen, onUpdate, onDelete) {
    if(!targetEl) return;
    targetEl.innerHTML = '';
    let items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

    // SUSUNAN TEGAR: Angka & Abjad A-Z
    items.sort((a, b) => {
        let titleA = (a.title || "").toLowerCase();
        let titleB = (b.title || "").toLowerCase();
        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    });

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = "clean-card";
        
        const titleArea = document.createElement('textarea');
        titleArea.className = "title-textarea";
        titleArea.value = item.title || '';
        titleArea.rows = 1;
        titleArea.readOnly = true; // Kunci supaya tak boleh edit terus

        const autoHeight = () => { 
            titleArea.style.height = 'auto'; 
            titleArea.style.height = titleArea.scrollHeight + 'px'; 
        };
        
        const footer = document.createElement('div');
        footer.className = "flex items-center gap-2 mt-5 pt-4 border-t border-slate-800/50 justify-end";
        
        const btnOpen = createActionBtn("📝 BUKA", "bg-slate-800", () => onOpen(item.id, item.title));
        
        // BUTTON EDIT TAJUK KHUSUS
        const btnEditTitle = createActionBtn("✏️ TAJUK", "bg-slate-800 text-blue-400", () => {
            const newTitle = prompt("Masukkan tajuk baharu:", item.title);
            if (newTitle !== null && newTitle.trim() !== "") {
                onUpdate(item.id, newTitle.trim());
                if(state.currentFileId && views.folders && views.folders.classList.contains('hidden')) {
                     loadFiles();
                } else {
                     loadFolders();
                }
            }
        });

        const btnDelete = createActionBtn("🗑️", "bg-red-900/10 text-red-500", () => onDelete(item.id));
        
        footer.append(btnOpen, btnEditTitle, btnDelete);
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

// --- LOGIC FUNCTIONS ---
async function loadFiles() {
    const snap = await filesRef().get(); 
    renderCleanItems(snap, document.getElementById('files-list'), openFile, (id, t) => filesRef().doc(id).update({title: t}), deleteFile);
}

function openFile(id, title) {
    state.currentFileId = id;
    const currentFileName = document.getElementById('current-file-name');
    if(currentFileName) currentFileName.innerText = title;
    showPage('folders'); loadFolders();
}

async function deleteFile(id) { if(confirm("Padam fail?")) { await filesRef().doc(id).delete(); loadFiles(); } }

async function loadFolders() {
    const snap = await foldersRef(state.currentFileId).get();
    renderCleanItems(snap, document.getElementById('folders-list'), openFolder, (id, t) => foldersRef(state.currentFileId).doc(id).update({title: t}), deleteFolder);
}

async function deleteFolder(id) { if(confirm("Padam folder?")) { await foldersRef(state.currentFileId).doc(id).delete(); loadFolders(); } }

// --- LOGIK HISTORY KEKAL ---
async function openFolder(id, title) {
    state.currentFolderId = id;
    const currentFolderName = document.getElementById('current-folder-name');
    if(currentFolderName) currentFolderName.innerText = title;
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
    if(!historyList) return;
    historyList.innerHTML = '';
    const slots = [
        { key: 'lastWeek', label: 'Minggu Lepas' },
        { key: 'yesterday', label: 'Semalam' },
        { key: 'fourHours', label: '4 Jam Lepas' },
        { key: 'oneHour', label: '1 Jam Lepas' },
        { key: 'realtime', label: 'Terkini (Real-time)' }
    ];
    slots.forEach(slot => {
        if (historyObj[slot.key]) {
            const div = document.createElement('div');
            div.className = "flex items-center justify-between p-4 rounded-2xl bg-slate-800/30 border border-slate-800 text-xs";
            div.innerHTML = `<span class="text-slate-400 font-bold uppercase">${slot.label}</span> <button class="px-3 py-1 bg-indigo-600 rounded-lg font-bold">RESTORE</button>`;
            div.querySelector('button').onclick = async () => {
                if(confirm(`Pulihkan versi ${slot.label}?`)) {
                    await notesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId).update({ content: historyObj[slot.key].content });
                }
            };
            historyList.appendChild(div);
        }
    });
}

// Auto Save & History Manager
let saveTimer;
if(editor) {
    editor.oninput = () => {
        if(saveStatus) saveStatus.innerText = "MENAIP...";
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            if (editor.innerHTML === state.lastSavedContent) return;
            if(saveStatus) saveStatus.innerText = "MENYIMPAN...";
            
            const docRef = notesRef(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
            const doc = await docRef.get();
            const data = doc.data();
            const history = data.history || {};
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            history.realtime = { content: state.lastSavedContent, date: todayStr };

            if (!history.yesterday || (history.realtime.date !== todayStr)) {
                history.yesterday = { content: history.realtime.content, date: history.realtime.date };
            }
            const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const weekStr = oneWeekAgo.toISOString().split('T')[0];
            if (!history.lastWeek || (history.lastWeek.date < weekStr)) {
                history.lastWeek = { content: state.lastSavedContent, date: todayStr };
            }
            const lastUpdate = data.updatedAt?.toMillis() || Date.now();
            const diffHours = (Date.now() - lastUpdate) / 3600000;
            if (!history.oneHour || diffHours >= 1) history.oneHour = { content: state.lastSavedContent };
            if (!history.fourHours || diffHours >= 4) history.fourHours = { content: state.lastSavedContent };

            await docRef.update({ content: editor.innerHTML, history: history, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            state.lastSavedContent = editor.innerHTML;
            if(saveStatus) saveStatus.innerText = "AUTO-SIMPAN AKTIF";
        }, 2000);
    };
}

// Toolbar & Nav
document.querySelectorAll('[data-action]').forEach(b => { b.onclick = () => { document.execCommand(b.dataset.action); if(editor) editor.focus(); }; });

const colorPicker = document.getElementById('color-picker');
if(colorPicker) colorPicker.oninput = (e) => document.execCommand('foreColor', false, e.target.value);

// Saya biarkan kod butang saiz lama ni kat sini as failsafe, supaya kalau awak nak guna button lama balik di masa depan, skrip tak crash.
const btnSizeUp = document.getElementById('btn-size-up');
if(btnSizeUp) btnSizeUp.onclick = () => document.execCommand('fontSize', false, '5');

const btnSizeDown = document.getElementById('btn-size-down');
if(btnSizeDown) btnSizeDown.onclick = () => document.execCommand('fontSize', false, '3');

const btnBackHome = document.getElementById('btn-back-home');
if(btnBackHome) btnBackHome.onclick = () => showPage('home');

const btnBackFolders = document.getElementById('btn-back-folders');
if(btnBackFolders) btnBackFolders.onclick = () => showPage('folders');

const btnAddFile = document.getElementById('btn-add-file');
if(btnAddFile) btnAddFile.onclick = async () => { 
    const t = prompt("Nama fail?"); 
    if(t) { await filesRef().add({ title: t, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); loadFiles(); }
};

const btnAddFolder = document.getElementById('btn-add-folder');
if(btnAddFolder) btnAddFolder.onclick = async () => { 
    const t = prompt("Nama folder?"); 
    if(t) { await foldersRef(state.currentFileId).add({ title: t, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); loadFolders(); }
};

// --- FUNGSI BARU TAMBAH JADUAL (Dipanggil dari HTML) ---
window.insertTable = function() {
    const rows = prompt("Berapa baris (rows) yang anda perlukan?", "3");
    const cols = prompt("Berapa lajur (columns) yang anda perlukan?", "3");
    
    // Semak jika user tekan ok dan masukkan nombor yang sah
    if (rows && cols && !isNaN(rows) && !isNaN(cols)) {
        let tableHTML = '<table style="width:100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #475569;"><tbody>';
        for (let r = 0; r < parseInt(rows); r++) {
            tableHTML += '<tr>';
            for (let c = 0; c < parseInt(cols); c++) {
                // style inline supaya nampak jelas walau tak ada css tambahan
                tableHTML += `<td style="border: 1px solid #475569; padding: 8px; min-width: 50px;">Sel</td>`;
            }
            tableHTML += '</tr>';
        }
        tableHTML += '</tbody></table><br/>';
        
        const editorRef = document.getElementById('editor');
        if(editorRef) editorRef.focus();
        document.execCommand('insertHTML', false, tableHTML);
    }
};
