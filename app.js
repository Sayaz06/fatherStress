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
// KOD TAMBAHAN: Initialize Firebase Storage
const storage = firebase.storage();

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

            // --- KOD TAMBAHAN (INJECTED): Auto-Scroll ke penanda .last-read-mark bila buka nota ---
            setTimeout(() => {
                if(editor) {
                    const mark = editor.querySelector('.last-read-mark');
                    if (mark) {
                        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }, 300);
            // --------------------------------------------------------------------------------------
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

// --- FUNGSI BULLET HURAIAN BERSAMBUNG (DIBETULKAN TANPA WARNA) ---
window.insertBulletLine = function(level) {
    saveSelection(); 
    
    // Gunakan simbol "Em Dash" (—) yang akan bersambung rapat secara automatik
    let dash = "—"; 
    // Hanya masukkan teks tanpa sebarang format warna supaya ia ikut warna asal
    let html = dash.repeat(level) + ' ';
    
    restoreSelection(); 
    document.execCommand('insertHTML', false, html);
    if(editor) editor.focus();
    saveSelection();
};

// =========================================================================
// ==================== KOD TAMBAHAN (INJECTED) BERMULA ====================
// =========================================================================

// --- KOD TAMBAHAN (INJECTED): FUNGSI DOUBLE CLICK UNTUK PENANDA BACAAN (KLIK 2-KALI PANTAS) ---
if (editor) {
    editor.addEventListener('dblclick', () => {
        // KOD TAMBAHAN: Semak jika fungsi penanda ditutup (OFF), hentikan tindakan
        if (window.isMarkingEnabled === false) return;

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        // 1. Buang penanda lama jika ada supaya hanya ada SATU penanda dalam satu masa
        const oldMark = editor.querySelector('.last-read-mark');
        if (oldMark) {
            const parent = oldMark.parentNode;
            while(oldMark.firstChild) {
                parent.insertBefore(oldMark.firstChild, oldMark);
            }
            parent.removeChild(oldMark);
        }

        // 2. Tanda ayat/perkataan baru yang di-highlight
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'last-read-mark';
        range.surroundContents(span);
        selection.removeAllRanges();

        // 3. Wajib cetus (trigger) event 'input' supaya sistem Auto-Save menyimpan data ini
        editor.dispatchEvent(new Event('input'));
    });
}
// -----------------------------------------------------------------------------------------------

// --- KOD TAMBAHAN (INJECTED): FUNGSI TRANSLATE INLINE (🌐 T.JEMAH) ---
// Dipautkan pada ID 'btnTranslate' di index.html
const btnTranslate = document.getElementById('btnTranslate');
if (btnTranslate) {
    btnTranslate.onclick = () => {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            alert("Sila highlight (pilih) teks terlebih dahulu untuk diterjemah.");
            return;
        }
        
        const text = selection.toString().trim();
        const translation = prompt(`Masukkan maksud terjemahan untuk:\n"${text}"`);
        
        if (translation) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.className = 'has-translate text-purple-400 font-medium'; // Mewarnakan ungu secara visual
            span.dataset.en = text;
            span.dataset.ms = translation;
            span.textContent = text; // Kekalkan teks asal pada permulaannya
            
            range.surroundContents(span);
            selection.removeAllRanges();
            
            // Trigger auto-save
            if(editor) editor.dispatchEvent(new Event('input'));
        }
    };
}
// ---------------------------------------------------------------------

// --- KOD TAMBAHAN (INJECTED): FUNGSI FLIP TRANSLATE (🔄) ---
// Dipautkan pada butang bulat terapung ID 'btnFlipTranslate'
const btnFlipTranslate = document.getElementById('btnFlipTranslate');
if (btnFlipTranslate) {
    btnFlipTranslate.onclick = () => {
        const selection = window.getSelection();
        let isInsideTranslate = false;
        let targetSpan = null;
        
        // 1. Kenal pasti jika cursor / highlight semasa berada di dalam teks ungu (.has-translate)
        if (selection.rangeCount > 0 && editor) {
            let node = selection.anchorNode;
            while(node && node !== editor) {
                if(node.nodeType === 1 && node.classList.contains('has-translate')) {
                    isInsideTranslate = true;
                    targetSpan = node;
                    break;
                }
                node = node.parentNode;
            }
        }

        if (isInsideTranslate && targetSpan) {
            // 2A. Jika di dalam teks ungu, flip teks tersebut sahaja
            targetSpan.textContent = (targetSpan.textContent === targetSpan.dataset.en) ? targetSpan.dataset.ms : targetSpan.dataset.en;
        } else if (editor) {
            // 2B. Jika cursor di luar, flip KESEMUA teks terjemahan dalam nota secara serentak
            const allTranslates = editor.querySelectorAll('.has-translate');
            if(allTranslates.length === 0) return;
            
            // Kita jadikan elemen pertama sebagai penanda aras bahasa (sama ada sedang papar EN atau MS)
            const firstOne = allTranslates[0];
            const isCurrentlyEn = (firstOne.textContent === firstOne.dataset.en);
            
            allTranslates.forEach(span => {
                span.textContent = isCurrentlyEn ? span.dataset.ms : span.dataset.en;
            });
        }
        
        // 3. Trigger auto-save untuk simpan perubahan ke pangkalan data awan Firebase
        if(editor) editor.dispatchEvent(new Event('input'));
    };
}
// -------------------------------------------------------------------

// --- KOD TAMBAHAN (INJECTED): PEMBAIKAN FUNGSI CARIAN (SEARCH) SEPARA TEPAT ---
// Digunakan supaya pencarian tidak terikat hanya pada permulaan ayat, dan meliputi ID carian lama & baharu
const searchFilesInput = document.getElementById('searchFiles') || document.getElementById('search-files');
if (searchFilesInput) {
    searchFilesInput.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        // Menyokong elemen list dari index.html asal atau struktur div app.js
        const list = document.getElementById('listFiles') || document.getElementById('files-list');
        if (list) {
            Array.from(list.children).forEach(el => {
                // Tangkap semua kandungan teks di dalam elemen tanpa mengira class child
                const textContent = el.innerText.toLowerCase();
                // Gunakan kaedah 'includes' untuk padanan separa tepat
                el.style.display = textContent.includes(query) ? '' : 'none'; 
            });
        }
    });
}

const searchFoldersInput = document.getElementById('searchFolders') || document.getElementById('search-folders');
if (searchFoldersInput) {
    searchFoldersInput.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        const list = document.getElementById('listFolders') || document.getElementById('folders-list');
        if (list) {
            Array.from(list.children).forEach(el => {
                const textContent = el.innerText.toLowerCase();
                el.style.display = textContent.includes(query) ? '' : 'none';
            });
        }
    });
}
// ------------------------------------------------------------------------------

// =========================================================================
// --- KOD TAMBAHAN BARU: FUNGSI UPLOAD GAMBAR & AUDIO YANG DIBUNGKUS ---
// =========================================================================
window.handleMediaUpload = async function(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('saveLoader');
    const bar = document.getElementById('progressBar');
    const status = document.getElementById('saveStatus');

    if(loader) loader.classList.remove('hidden');
    if(bar) bar.style.width = '30%';
    if(status) status.innerText = 'Memuat naik...';

    try {
        // Upload ke Firebase Storage (folder: uploads/UserID/timestamp_filename)
        // Bergantung pada logik yang awak pakai (state.user.uid atau state.uid), saya letak sokongan untuk dua-dua
        const userId = (state.user && state.user.uid) ? state.user.uid : (state.uid || 'anonymous');
        const fileRef = storage.ref(`uploads/${userId}/${Date.now()}_${file.name}`);
        await fileRef.put(file);
        const url = await fileRef.getDownloadURL();

        if(bar) bar.style.width = '100%';
        if(status) status.innerText = 'Berjaya dimuat naik!';

        restoreSelection();
        let mediaHTML = '';
        
        // KOD YANG DIBAIKI: Saya bungkus dalam span (contenteditable="false") & letak &nbsp;
        // Ini memastikan audio/gambar berkelakuan seperti "satu huruf teks" yang mudah di-highlight dan dialih
        if (type === 'image') {
            mediaHTML = `&nbsp;<span contenteditable="false" style="display:inline-block; max-width:100%; user-select:all;"><img src="${url}" alt="gambar nota" style="max-width: 100%; border-radius: 8px; margin: 5px 0; border: 1px solid #334155;" /></span>&nbsp;`;
        } else if (type === 'audio') {
            mediaHTML = `&nbsp;<span contenteditable="false" style="display:inline-block; width:100%; max-width:400px; user-select:all;"><audio controls src="${url}" style="width: 100%; margin: 5px 0; border-radius: 8px; outline: none;"></audio></span>&nbsp;`;
        }

        // Masukkan elemen media ke dalam editor
        document.execCommand('insertHTML', false, mediaHTML);
        if(editor) editor.focus();
        saveSelection();
        
        // Wajib trigger event 'input' supaya Auto-Save pangkalan data menyimpan media ini
        if(editor) editor.dispatchEvent(new Event('input')); 

        setTimeout(() => {
            if(loader) loader.classList.add('hidden');
            if(status) status.innerText = '';
        }, 1500);

    } catch (e) {
        console.error("Muat naik gagal:", e);
        alert("Ralat muat naik: Pastikan Firebase Storage Rules anda membenarkan 'write'.");
        if(loader) loader.classList.add('hidden');
        if(status) status.innerText = 'Gagal muat naik';
    }
    
    // Reset input supaya fail yang sama boleh dipilih lagi nanti
    event.target.value = ""; 
};
// -------------------------------------------------------------------------

// =========================================================================
// --- KOD PENYELAMAT: KEMBALIKAN AUDIO HALIMUNAN ---
// =========================================================================
const editorPenyelamat = document.getElementById('editor');
if (editorPenyelamat) {
    // Gunakan addEventListener supaya ia tidak mengganggu fungsi oninput Auto-Save asal awak
    editorPenyelamat.addEventListener('input', function() {
        const semuaAudio = editorPenyelamat.querySelectorAll('audio');
        semuaAudio.forEach(audio => {
            // Jika browser buang 'controls' lepas paste, kita letak balik!
            if (!audio.hasAttribute('controls')) {
                audio.setAttribute('controls', 'controls');
            }
        });
    });
}
// =========================================================================
