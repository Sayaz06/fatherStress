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
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// DOM Elements
const vLogin = document.getElementById('view-login'), vHome = document.getElementById('view-home'),
      vFolders = document.getElementById('view-folders'), vNote = document.getElementById('view-note');
const filesList = document.getElementById('files-list'), foldersList = document.getElementById('folders-list'),
      editor = document.getElementById('editor'), historyList = document.getElementById('history-list'),
      saveStatus = document.getElementById('save-status');

let state = { user: null, currentFileId: null, currentFolderId: null, currentNoteId: null, noteUnsubscribe: null, lastSavedContent: "" };

// Helper: Show View
function show(view) {
  [vLogin, vHome, vFolders, vNote].forEach(v => v.classList.add('hidden'));
  view.classList.remove('hidden');
}

// Auth
auth.onAuthStateChanged(user => {
  state.user = user;
  if (user) { show(vHome); loadFiles(); } else { show(vLogin); }
});
document.getElementById('btn-google').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
document.getElementById('btn-logout').onclick = () => auth.signOut();

// Collections
const filesCol = () => db.collection('users').doc(state.user.uid).collection('files');
const foldersCol = (fId) => filesCol().doc(fId).collection('folders');
const notesCol = (fId, folId) => foldersCol(fId).doc(folId).collection('notes');

// --- FILES LOGIC ---
async function loadFiles() {
  const snap = await filesCol().orderBy('createdAt', 'desc').get();
  renderList(snap, filesList, openFile, updateFileTitle, deleteFile);
}

async function updateFileTitle(id, title) { await filesCol().doc(id).update({ title }); }
async function deleteFile(id) { if(confirm("Padam fail?")) { await filesCol().doc(id).delete(); loadFiles(); } }

function openFile(id, title) {
  state.currentFileId = id;
  document.getElementById('current-file-name').innerText = title;
  show(vFolders);
  loadFolders();
}

// --- FOLDERS LOGIC ---
async function loadFolders() {
  const snap = await foldersCol(state.currentFileId).orderBy('createdAt', 'desc').get();
  renderList(snap, foldersList, openFolder, updateFolderTitle, deleteFolder);
}

async function updateFolderTitle(id, title) { await foldersCol(state.currentFileId).doc(id).update({ title }); }
async function deleteFolder(id) { if(confirm("Padam folder?")) { await foldersCol(state.currentFileId).doc(id).delete(); loadFolders(); } }

// --- RENDER LIST (Shared for Files & Folders) ---
function renderList(snap, targetEl, onOpen, onUpdate, onDelete) {
  targetEl.innerHTML = '';
  snap.forEach(doc => {
    const data = doc.data();
    const item = document.createElement('div');
    item.className = 'item';

    // Tajuk guna Textarea supaya turun bawah jika panjang
    const area = document.createElement('textarea');
    area.className = 'item-textarea';
    area.value = data.title || '';
    area.rows = 1;
    area.oninput = () => { area.style.height = 'auto'; area.style.height = area.scrollHeight + 'px'; };
    area.onchange = () => onUpdate(doc.id, area.value);

    const btnRow = document.createElement('div');
    btnRow.className = 'row';
    
    const bOpen = document.createElement('button'); bOpen.className = 'btn'; bOpen.innerText = 'Buka';
    bOpen.onclick = () => onOpen(doc.id, area.value);
    
    const bDel = document.createElement('button'); bDel.className = 'btn btn-danger'; bDel.innerText = 'Padam';
    bDel.onclick = () => onDelete(doc.id);

    btnRow.append(bOpen, bDel);
    item.append(area, btnRow);
    targetEl.append(item);
    area.oninput(); // Adjust height initial
  });
}

// --- NOTE & HISTORY LOGIC ---
async function openFolder(id, title) {
  state.currentFolderId = id;
  document.getElementById('current-folder-name').innerText = title;
  show(vNote);

  const nCol = notesCol(state.currentFileId, id);
  const snap = await nCol.limit(1).get();
  state.currentNoteId = snap.empty ? (await nCol.add({ content: '', history: [] })).id : snap.docs[0].id;

  if (state.noteUnsubscribe) state.noteUnsubscribe();
  state.noteUnsubscribe = nCol.doc(state.currentNoteId).onSnapshot(doc => {
    const data = doc.data();
    if (editor.innerHTML !== data.content) {
      editor.innerHTML = data.content || '';
      state.lastSavedContent = data.content;
    }
    renderHistory(data.history || []);
  });
}

function renderHistory(history) {
  historyList.innerHTML = history.length ? '' : '<p class="subtext">Tiada sejarah.</p>';
  history.slice().reverse().forEach((h, i) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<span>Versi ${history.length - i}</span> <button class="btn-ghost">Restore</button>`;
    div.querySelector('button').onclick = () => restoreHistory(history.length - 1 - i);
    historyList.appendChild(div);
  });
}

async function restoreHistory(index) {
  const docRef = notesCol(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
  const doc = await docRef.get();
  const content = doc.data().history[index].content;
  await docRef.update({ content });
}

// Auto Save
let saveTimeout;
editor.oninput = () => {
  clearTimeout(saveTimeout);
  saveStatus.innerText = 'Menaip...';
  saveTimeout = setTimeout(saveWithHistory, 3000);
};

async function saveWithHistory() {
  if (editor.innerHTML === state.lastSavedContent) return;
  const docRef = notesCol(state.currentFileId, state.currentFolderId).doc(state.currentNoteId);
  const doc = await docRef.get();
  let hist = doc.data().history || [];
  
  // Masukkan kandungan lama ke history
  if (state.lastSavedContent) {
    hist.push({ content: state.lastSavedContent, time: new Date() });
    if (hist.length > 5) hist.shift(); // Simpan 5 sahaja
  }

  await docRef.update({ content: editor.innerHTML, history: hist });
  state.lastSavedContent = editor.innerHTML;
  saveStatus.innerText = 'Tersimpan.';
}

// Toolbar Events
document.querySelectorAll('[data-action]').forEach(b => {
  b.onclick = () => { document.execCommand(b.dataset.action); editor.focus(); };
});

// Back Navigation
document.getElementById('btn-back-home').onclick = () => show(vHome);
document.getElementById('btn-back-folders').onclick = () => show(vFolders);
document.getElementById('btn-add-file').onclick = async () => {
  await filesCol().add({ title: 'Fail Baru', createdAt: new Date() }); loadFiles();
};
document.getElementById('btn-add-folder').onclick = async () => {
  await foldersCol(state.currentFileId).add({ title: 'Folder Baru', createdAt: new Date() }); loadFolders();
};
