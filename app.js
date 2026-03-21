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

// --- RENDERER ORIGINAL ---
function renderCleanItems(snapshot, targetEl, onOpen, onUpdate, onDelete) {
    if(!targetEl) return;
    targetEl.innerHTML = '';
    let items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

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
        titleArea.readOnly = true;

        const autoHeight = () => { 
            titleArea.style.height = 'auto'; 
            titleArea.style.height = titleArea.scrollHeight + 'px'; 
        };
        
        const footer = document.createElement('div');
        footer.className = "flex items-center gap-2 mt-5 pt-4 border-t border-slate-800/50 justify-end";
        
        const btnOpen = createActionBtn("📝 BUKA", "bg-slate-800", () => onOpen(item.id, item.title));
        
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

// --- LOGIC FUNCTIONS ORIGINAL ---
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

        // --- [TAMBAHAN] AUTO-SCROLL KE PENANDA KUNING ---
        setTimeout(() => {
            if(editor) {
                const mark = editor.querySelector('.last-read-mark');
                if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 600);
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

let savedSelection = null;
function saveSelection() {
    const sel = window.getSelection();
    if (sel.getRangeAt && sel.rangeCount > 0) { savedSelection = sel.getRangeAt(0); }
}
function restoreSelection() {
    if (savedSelection) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedSelection);
    }
}

if(editor) {
    editor.addEventListener('keyup', saveSelection);
    editor.addEventListener('mouseup', saveSelection);
    editor.addEventListener('touchend', saveSelection);
    editor.addEventListener('focusout', saveSelection);

    // --- [TAMBAHAN] 5 KALI KLIK UNTUK PENANDA BACAAN ---
    let clickCount = 0;
    let clickTimer = null;

    editor.addEventListener('click', (e) => {
        clickCount++;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            if (clickCount >= 5) {
                editor.querySelectorAll('.last-read-mark').forEach(el => el.classList.remove('last-read-mark'));
                let target = e.target;
                if (target !== editor) {
                    let markTarget = target;
                    while (markTarget && markTarget.parentNode !== editor && !['DIV', 'P', 'TD', 'LI'].includes(markTarget.tagName)) {
                        if(markTarget.classList && markTarget.classList.contains('has-translate')) break;
                        markTarget = markTarget.parentNode;
                    }
                    if (markTarget && markTarget !== editor) markTarget.classList.add('last-read-mark');
                    else if(target.classList) target.classList.add('last-read-mark');
                    editor.dispatchEvent(new Event('input')); // Supaya Cloud Sync simpan warna kuning
                }
            }
            clickCount = 0;
        }, 500); // Mesti 5 klik dalam 0.5 saat
    });
}

window.doCmd = function(c, v=null) {
    restoreSelection(); 
    document.execCommand(c, false, v);
    if(editor) editor.focus();
    saveSelection(); 
};

// --- [TAMBAHAN] LOGIK TERJEMAHAN (🌐 T.JEMAH & 🔄 FLIP) ---
window.setTranslation = function() {
    saveSelection();
    const sel = window.getSelection();
    let node = sel.anchorNode;
    let span = node && node.nodeType === 3 ? node.parentNode.closest('.has-translate') : (node && node.closest ? node.closest('.has-translate') : null);
    
    if (span) {
        const newTrans = prompt("Sunting terjemahan Melayu:", span.getAttribute('data-ms'));
        if (newTrans !== null) {
            span.setAttribute('data-ms', newTrans);
            if (span.getAttribute('data-lang') === 'ms') span.innerText = newTrans;
            editor.dispatchEvent(new Event('input'));
        }
        return;
    }

    if (!sel || sel.toString().trim() === "") return alert("Sila highlight teks Inggeris dahulu!");
    const originalText = sel.toString();
    const trans = prompt("Masukkan terjemahan Melayu untuk ayat ini:");
    if (trans !== null && trans.trim() !== "") {
        const spanHTML = `<span class="has-translate" data-en="${originalText.replace(/"/g, '&quot;')}" data-ms="${trans.replace(/"/g, '&quot;')}" data-lang="en">${originalText}</span>`;
        restoreSelection();
        document.execCommand('insertHTML', false, spanHTML);
        editor.dispatchEvent(new Event('input'));
        saveSelection();
    }
};

window.toggleTranslation = function() {
    saveSelection();
    const sel = window.getSelection();
    let node = sel.anchorNode;
    let span = node && node.nodeType === 3 ? node.parentNode.closest('.has-translate') : (node && node.closest ? node.closest('.has-translate') : null);

    const flip = (s, lang) => {
        if (lang === 'ms') {
            s.innerText = s.getAttribute('data-ms');
            s.setAttribute('data-lang', 'ms');
            s.style.color = '#34d399'; // Emerald 400
        } else {
            s.innerText = s.getAttribute('data-en');
            s.setAttribute('data-lang', 'en');
            s.style.color = '';
        }
    };

    if (span) {
        const next = span.getAttribute('data-lang') === 'en' ? 'ms' : 'en';
        flip(span, next);
    } else {
        const all = document.querySelectorAll('.has-translate');
        if(all.length === 0) return;
        const nextAll = all[0].getAttribute('data-lang') === 'en' ? 'ms' : 'en';
        all.forEach(s => flip(s, nextAll));
    }
    editor.dispatchEvent(new Event('input'));
    saveSelection();
};

// --- TOOLBAR & NAV ORIGINAL ---
document.querySelectorAll('[data-action]').forEach(b => { 
    b.onclick = () => { window.doCmd(b.dataset.action); }; 
});

const colorPicker = document.getElementById('color-picker');
if(colorPicker) colorPicker.oninput = (e) => window.doCmd('foreColor', e.target.value);

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

window.insertTable = function() {
    saveSelection(); 
    const rows = prompt("Berapa baris (rows)?", "3");
    const cols = prompt("Berapa lajur (columns)?", "3");
    if (rows && cols) {
        let tableHTML = '<table style="width:100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #475569;"><tbody>';
        for (let r = 0; r < parseInt(rows); r++) {
            tableHTML += '<tr>';
            for (let c = 0; c < parseInt(cols); c++) tableHTML += `<td style="border: 1px solid #475569; padding: 8px; min-width: 50px;">Sel</td>`;
            tableHTML += '</tr>';
        }
        tableHTML += '</tbody></table><br/>';
        restoreSelection(); 
        document.execCommand('insertHTML', false, tableHTML);
        if(editor) editor.focus();
        saveSelection();
    }
};
