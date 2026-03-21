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
        if (data && editor.innerHTML !== data.content) { 
            editor.innerHTML = data.content || ''; 
            state.lastSavedContent = data.content; 
            
            // --- INJECT: AUTO-SCROLL KE LAST READ MARK ---
            setTimeout(() => {
                const mark = document.querySelector('.last-read-mark');
                if (mark) {
                    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500); // Masa penampan untuk pastikan DOM dirender sepenuhnya
            // ---------------------------------------------
        }
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

// --- PENYELESAIAN MASALAH HILANG HIGHLIGHT DI TELEFON ---
let savedSelection = null;

function saveSelection() {
    const sel = window.getSelection();
    if (sel.getRangeAt && sel.rangeCount > 0) {
        savedSelection = sel.getRangeAt(0);
    }
}

function restoreSelection() {
    if (savedSelection) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedSelection);
    }
}

// Sentiasa perhatikan kedudukan cursor dalam editor
if(editor) {
    editor.addEventListener('keyup', saveSelection);
    editor.addEventListener('mouseup', saveSelection);
    editor.addEventListener('touchend', saveSelection);
    editor.addEventListener('focusout', saveSelection);
}

// Fungsi doCmd untuk pastikan text format tak lari
window.doCmd = function(c, v=null) {
    restoreSelection(); 
    document.execCommand(c, false, v);
    if(editor) editor.focus();
    saveSelection(); 
};
// --------------------------------------------------------

// Toolbar & Nav
document.querySelectorAll('[data-action]').forEach(b => { 
    b.onclick = () => { 
        window.doCmd(b.dataset.action); 
    }; 
});

const colorPicker = document.getElementById('color-picker');
if(colorPicker) colorPicker.oninput = (e) => window.doCmd('foreColor', e.target.value);

// Saya kekalkan juga button lama in case awak nak pakai balik di masa depan
const btnSizeUp = document.getElementById('btn-size-up');
if(btnSizeUp) btnSizeUp.onclick = () => window.doCmd('fontSize', '5');

const btnSizeDown = document.getElementById('btn-size-down');
if(btnSizeDown) btnSizeDown.onclick = () => window.doCmd('fontSize', '3');

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

// --- FUNGSI JADUAL YANG DIBAIKI (DENGAN MEMORI) ---
window.insertTable = function() {
    saveSelection(); 
    
    const rows = prompt("Berapa baris (rows) yang anda perlukan?", "3");
    const cols = prompt("Berapa lajur (columns) yang anda perlukan?", "3");
    
    if (rows && cols && !isNaN(rows) && !isNaN(cols)) {
        let tableHTML = '<table style="width:100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #475569;"><tbody>';
        for (let r = 0; r < parseInt(rows); r++) {
            tableHTML += '<tr>';
            for (let c = 0; c < parseInt(cols); c++) {
                tableHTML += `<td style="border: 1px solid #475569; padding: 8px; min-width: 50px;">Sel</td>`;
            }
            tableHTML += '</tr>';
        }
        tableHTML += '</tbody></table><br/>';
        
        restoreSelection(); 
        document.execCommand('insertHTML', false, tableHTML);
        if(editor) editor.focus();
        saveSelection();
    }
};


/* =====================================================================
   INJECT: FUNGSI BAHARU WAN-LAW V6.2 PRO (5-Klik, Translate, Flip)
   ===================================================================== */

// 1. Logik 5-Klik Pantas Untuk Penanda Bacaan
let clickCount = 0;
let clickTimer;
if (editor) {
    editor.addEventListener('click', function(e) {
        clickCount++;
        if (clickCount === 1) {
            clickTimer = setTimeout(() => { clickCount = 0; }, 800); // 800ms window untuk 5 klik
        }
        if (clickCount >= 5) {
            clearTimeout(clickTimer);
            clickCount = 0;
            applyLastReadMark();
        }
    });
}

function applyLastReadMark() {
    const sel = window.getSelection();
    if (!sel.focusNode) return;

    // Padam semua penanda kuning lama
    const oldMarks = document.querySelectorAll('.last-read-mark');
    oldMarks.forEach(mark => {
        const text = document.createTextNode(mark.textContent);
        mark.parentNode.replaceChild(text, mark);
    });

    // Tanda ayat baru tempat cursor berada
    let textNode = sel.focusNode;
    if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent.trim().length > 0) {
        let span = document.createElement('span');
        span.className = 'last-read-mark';
        span.textContent = textNode.textContent;
        textNode.parentNode.replaceChild(span, textNode);
        
        // Trigger auto-save Firebase
        if(editor) editor.dispatchEvent(new Event('input'));
    }
}

// 2. Sistem Terjemahan (Inline)
window.applyTranslation = function() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
        alert("Sila highlight/pilih teks terlebih dahulu untuk diterjemah.");
        return;
    }
    
    const originalText = sel.toString();
    const translatedText = prompt("Masukkan maksud untuk: '" + originalText + "'");
    
    if (!translatedText) return;

    const span = document.createElement('span');
    span.className = 'has-translate';
    span.setAttribute('data-en', originalText);
    span.setAttribute('data-ms', translatedText);
    span.textContent = originalText;

    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(span);
    sel.removeAllRanges();

    // Trigger auto-save Firebase
    if(editor) editor.dispatchEvent(new Event('input'));
};

// 3. Logik Flip Teks (Satu Teks Atau Semua Serentak)
window.flipTranslation = function() {
    const sel = window.getSelection();
    let targetNode = null;

    // Semak jika cursor berada di dalam elemen terjemahan
    if (sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).startContainer;
        while (node && node !== editor) {
            if (node.nodeType === 1 && node.classList.contains('has-translate')) {
                targetNode = node;
                break;
            }
            if (node.parentNode) node = node.parentNode;
            else break;
        }
    }

    if (targetNode) {
        // Kursor berada di dalam teks ungu, flip teks ini sahaja
        flipNode(targetNode);
    } else {
        // Kursor berada di tempat lain, flip SEMUA teks terjemahan dalam editor
        document.querySelectorAll('.has-translate').forEach(flipNode);
    }

    // Trigger auto-save Firebase
    if(editor) editor.dispatchEvent(new Event('input'));
};

function flipNode(node) {
    const currentText = node.textContent;
    const en = node.getAttribute('data-en');
    const ms = node.getAttribute('data-ms');
    
    if (currentText === en) {
        node.textContent = ms;
    } else {
        node.textContent = en;
    }
}
/* ===================================================================== */
