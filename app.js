// ==================== PART 1: FIREBASE SETUP & AUTH ====================
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

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// DOM refs
const vLogin = document.getElementById('view-login');
const vHome = document.getElementById('view-home');
const vFolders = document.getElementById('view-folders');
const vNote = document.getElementById('view-note');

const btnGoogle = document.getElementById('btn-google');
const btnLogout = document.getElementById('btn-logout');
const btnAddFile = document.getElementById('btn-add-file');
const filesList = document.getElementById('files-list');
const searchFiles = document.getElementById('search-files');

const btnBackHome = document.getElementById('btn-back-home');
const btnAddFolder = document.getElementById('btn-add-folder');
const foldersList = document.getElementById('folders-list');
const searchFolders = document.getElementById('search-folders');
const currentFileName = document.getElementById('current-file-name');

const btnBackFolders = document.getElementById('btn-back-folders');
const currentFolderName = document.getElementById('current-folder-name');
const editor = document.getElementById('editor');
const saveStatus = document.getElementById('save-status');
const colorPicker = document.getElementById('color-picker');
const historyListDiv = document.getElementById('history-list');

let state = {
  user: null,
  files: [],
  folders: [],
  currentFileId: null,
  currentFolderId: null,
  currentNoteId: null,
  noteUnsubscribe: null,
  lastSavedContent: "" // Untuk elakkan simpan history yang sama berulang kali
};

function show(id) {
  [vLogin, vHome, vFolders, vNote].forEach(el => el.classList.add('hidden'));
  id.classList.remove('hidden');
}

// Login & Logout
btnGoogle.addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try { await auth.signInWithPopup(provider); } catch (e) { alert('Gagal: ' + e.message); }
});

btnLogout.addEventListener('click', async () => {
  try { await auth.signOut(); } catch (e) { alert('Gagal: ' + e.message); }
});

auth.onAuthStateChanged(async (user) => {
  state.user = user;
  if (!user) { show(vLogin); return; }
  show(vHome);
  loadFiles();
});

// ==================== PART 2: CORE LOGIC ====================

function filesCol() { return db.collection('users').doc(state.user.uid).collection('files'); }
function foldersCol(fileId) { return filesCol().doc(fileId).collection('folders'); }
function notesCol(fileId, folderId) { return foldersCol(fileId).doc(folderId).collection('notes'); }

// Load & Render Files (With Multi-line Title Support)
async function loadFiles() {
  const snapshot = await filesCol().orderBy('createdAt', 'asc').get();
  state.files = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderFiles();
}

function renderFiles() {
  const q = (searchFiles.value || '').toLowerCase();
  filesList.innerHTML = '';
  
  state.files
    .filter(f => (f.title || '').toLowerCase().includes(q))
    .forEach(f => {
      const row = document.createElement('div');
      row.className = 'item';

      const left = document.createElement('div');
      left.className = 'item-name';

      // Guna Textarea supaya tajuk boleh wrap ke bawah
      const nameTxt = document.createElement('textarea');
      nameTxt.value = f.title || 'Tanpa Nama';
      nameTxt.rows = 1;
      nameTxt.style.height = "auto";
      nameTxt.addEventListener('input', () => {
        nameTxt.style.height = "auto";
        nameTxt.style.height = nameTxt.scrollHeight + "px";
      });
      nameTxt.addEventListener('change', () => updateFileTitle(f.id, nameTxt.value));

      const openBtn = document.createElement('button');
      openBtn.className = 'btn-ghost';
      openBtn.textContent = 'Buka';
      openBtn.addEventListener('click', () => openFile(f.id, f.title));

      left.appendChild(nameTxt);
      left.appendChild(openBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-danger btn';
      delBtn.textContent = 'Padam';
      delBtn.addEventListener('click', () => deleteFile(f.id));

      row.appendChild(left);
      row.appendChild(delBtn);
      filesList.appendChild(row);
      
      // Adjust height textarea selepas render
      setTimeout(() => { nameTxt.style.height = nameTxt.scrollHeight + "px"; }, 0);
    });
}

// Tambah/Update/Padam Fail (Sama seperti kod asal anda...)
btnAddFile.addEventListener('click', async () => {
  const title = prompt('Nama Fail?') || 'Fail Baharu';
  await filesCol().add({ title, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  loadFiles();
});

async function updateFileTitle(id, title) {
  await filesCol().doc(id).update({ title });
}

async function deleteFile(id) {
  if (confirm('Padam fail ini?')) {
    await filesCol().doc(id).delete();
    loadFiles();
  }
}

// ==================== PART 3: FOLDERS & NOTES ====================

async function openFile(fileId, title) {
  state.currentFileId = fileId;
  currentFileName.textContent = `Fail: ${title}`;
  show(vFolders);
  loadFolders();
}

async function loadFolders() {
  const snapshot = await foldersCol(state.currentFileId).orderBy('createdAt', 'asc').get();
  state.folders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderFolders();
}

function renderFolders() {
  const q = (searchFolders.value || '').toLowerCase();
  foldersList.innerHTML = '';
  
  state.folders
    .filter(f => (f.title || '').toLowerCase().includes(q))
    .forEach(f => {
      const row = document.createElement('div');
      row.className = 'item';
      
      const left = document.createElement('div');
      left.className = 'item-name';

      const nameTxt = document.createElement('textarea');
      nameTxt.value = f.title || 'Folder Baharu';
      nameTxt.rows = 1;
      nameTxt.addEventListener('change', () => updateFolderTitle(f.id, nameTxt.value));

      const openBtn = document.createElement('button');
      openBtn.className = 'btn-ghost';
      openBtn.textContent = 'Buka';
      openBtn.addEventListener('click', () => openFolder(f.id, f.title));

      left.appendChild(nameTxt);
      left.appendChild(openBtn);
      row.appendChild(left);
      foldersList.appendChild(row);
    });
}

// ==================== PART 4: EDITOR & HISTORY ====================

async function openFolder(folderId, title) {
  state.currentFolderId = folderId;
  currentFolderName.textContent = `Folder: ${title}`;
  
  const notesRef = notesCol(state.currentFileId, folderId);
  const snap = await notesRef.limit(1).get();
  
  if (snap.empty) {
    const res = await notesRef.add({ content: '', history: [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    state.currentNoteId = res.id;
  } else {
    state.currentNoteId = snap.docs[0].id;
  }

  if (state.noteUnsubscribe) state.noteUnsubscribe();
  state.noteUnsubscribe = notesRef.doc(state.currentNoteId).onSnapshot(doc => {
    const data = doc.data();
    if (!data) return;

    // Render Editor (Hanya jika kandungan berbeza untuk elakkan cursor jump)
    if (editor.innerHTML !== data.content) {
      editor.innerHTML = data.content || '';
      state.lastSavedContent = data.content;
    }
    
    // Render History List
    renderHistory(data.history || []);
  });

  show(vNote);
}

function renderHistory(historyArray) {
  historyListDiv.innerHTML = historyArray.length ? '' : '<span class="subtext">Tiada sejarah tersedia.</span>';
  
  // Papar 5 sejarah terakhir (terkini di atas)
  historyArray.slice().reverse().forEach((h, index) => {
    const date = h.time ? new Date(h.time.seconds * 1000).toLocaleString('ms-MY') : 'Baru tadi';
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span>${date}</span>
      <button class="btn-restore" onclick="restoreHistory(${historyArray.length - 1 - index})">Restore</button>
    `;
    historyListDiv.appendChild(item);
  });
}

// Fungsi Restore
window.restoreHistory = async (index) => {
  const docRef = notesCol(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
  const doc = await docRef.get();
  const history = doc.data().history;
  const selectedContent = history[index].content;

  if (confirm("Kembali ke versi ini? Kandungan semasa akan diganti.")) {
    await docRef.update({
      content: selectedContent,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    editor.innerHTML = selectedContent;
    saveStatus.textContent = "Nota dipulihkan!";
  }
};

// Auto Save & History Logic
let saveTimer = null;
editor.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveStatus.textContent = 'Menunggu berhenti menaip...';
  saveTimer = setTimeout(saveNoteWithHistory, 3000); // Simpan selepas 3 saat berhenti menaip
});

async function saveNoteWithHistory() {
  if (!state.currentNoteId) return;
  const newContent = editor.innerHTML;
  
  // Elakkan simpan jika tiada perubahan
  if (newContent === state.lastSavedContent) {
    saveStatus.textContent = 'Tiada perubahan untuk disimpan.';
    return;
  }

  try {
    saveStatus.textContent = 'Menyimpan...';
    const docRef = notesCol(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
    const doc = await docRef.get();
    const data = doc.data();
    
    let history = data.history || [];
    
    // Simpan kandungan lama ke history SEBELUM update kandungan baru
    if (data.content && data.content !== newContent) {
      history.push({
        content: data.content,
        time: firebase.firestore.Timestamp.now()
      });
    }

    // Kekalkan hanya 5 history terakhir
    if (history.length > 5) history.shift();

    await docRef.update({
      content: newContent,
      history: history,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    state.lastSavedContent = newContent;
    saveStatus.textContent = 'Tersimpan secara automatik.';
  } catch (e) {
    saveStatus.textContent = 'Gagal simpan (Offline).';
  }
}

// Toolbar & Navigation
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.execCommand(btn.dataset.action, false, null);
    editor.focus();
  });
});

colorPicker.addEventListener('input', () => {
  document.execCommand('foreColor', false, colorPicker.value);
});

btnBackHome.addEventListener('click', () => show(vHome));
btnBackFolders.addEventListener('click', () => show(vFolders));
