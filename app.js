// ==================== PART 1: FIREBASE SETUP & AUTH ====================

// Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCtxOE42D07yFc9eK3nLMsOy50SmeSErwI",
  authDomain: "fatherstress-9e695.firebaseapp.com",
  projectId: "fatherstress-9e695",
  storageBucket: "fatherstress-9e695.firebasestorage.app",
  messagingSenderId: "147729735248",
  appId: "1:147729735248:web:f6771fee76727436a0fb55",
  measurementId: "G-GF6HCJZ5MD"
};

// Initialize Firebase sekali sahaja
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence untuk Firestore
// db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// Pastikan sesi login kekal selepas refresh
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
const fontSizeInput = document.getElementById('font-size');

let state = {
  user: null,
  files: [],
  folders: [],
  currentFileId: null,
  currentFileTitle: '',
  currentFolderId: null,
  currentFolderTitle: '',
  currentNoteId: null,
  noteUnsubscribe: null,
};

// View helpers
function show(id) {
  [vLogin, vHome, vFolders, vNote].forEach(el => el.classList.add('hidden'));
  id.classList.remove('hidden');
}

// Login dengan Google
btnGoogle.addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    alert('Log masuk gagal: ' + e.message);
  }
});

// Logout
btnLogout.addEventListener('click', async () => {
  try {
    await auth.signOut();
  } catch (e) {
    alert('Logout gagal: ' + e.message);
  }
});

// Restore sesi bila refresh
auth.onAuthStateChanged(async (user) => {
  state.user = user;
  if (!user) {
    show(vLogin);
    return;
  }
  show(vHome);
  loadFiles();
});

// ==================== PART 2: FILES & FOLDERS ====================

// Collections paths
function filesCol() {
  return db.collection('users').doc(state.user.uid).collection('files');
}
function foldersCol(fileId) {
  return filesCol().doc(fileId).collection('folders');
}
function notesCol(fileId, folderId) {
  return foldersCol(fileId).doc(folderId).collection('notes');
}

// Files (Home)
async function loadFiles() {
  const snapshot = await filesCol().orderBy('createdAt', 'asc').get();
  state.files = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderFiles();
}

function renderFiles() {
  const q = (searchFiles.value || '').toLowerCase();
  filesList.innerHTML = '';
  state.files
    .filter(f => !q || (f.title || '').toLowerCase().includes(q))
    .forEach(f => {
      const row = document.createElement('div');
      row.className = 'item';
      const left = document.createElement('div');
      left.className = 'item-name';
      const nameInput = document.createElement('input');
      nameInput.value = f.title || 'Tanpa Nama';
      nameInput.addEventListener('change', () => updateFileTitle(f.id, nameInput.value));
      const openBtn = document.createElement('button');
      openBtn.className = 'btn-ghost';
      openBtn.textContent = 'Buka';
      openBtn.addEventListener('click', () => openFile(f.id, nameInput.value));
      left.appendChild(nameInput);
      left.appendChild(openBtn);

      const right = document.createElement('div');
      right.className = 'row';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-danger btn';
      delBtn.textContent = 'Padam';
      delBtn.addEventListener('click', () => deleteFile(f.id));

      row.appendChild(left);
      right.appendChild(delBtn);
      row.appendChild(right);
      filesList.appendChild(row);
    });
}

searchFiles.addEventListener('input', renderFiles);

async function updateFileTitle(id, title) {
  await filesCol().doc(id).set({ title, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

async function deleteFile(id) {
  const ok = confirm('Padam fail ini? Semua folder & nota di dalamnya akan dipadam.');
  if (!ok) return;
  const folderSnap = await foldersCol(id).get();
  for (const f of folderSnap.docs) {
    const notesSnap = await foldersCol(id).doc(f.id).collection('notes').get();
    for (const n of notesSnap.docs) {
      await foldersCol(id).doc(f.id).collection('notes').doc(n.id).delete();
    }
    await foldersCol(id).doc(f.id).delete();
  }
  await filesCol().doc(id).delete();
  await loadFiles();
}

btnAddFile.addEventListener('click', async () => {
  const title = prompt('Nama Fail?') || 'Fail Baharu';
  await filesCol().add({
    title,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await loadFiles();
});

// Open File → Folders view
async function openFile(fileId, fileTitle) {
  state.currentFileId = fileId;
  state.currentFileTitle = fileTitle;
  currentFileName.textContent = `Fail: ${fileTitle}`;
  show(vFolders);
  await loadFolders();
}

// Folders (Subfolder page)
async function loadFolders() {
  const snapshot = await foldersCol(state.currentFileId).orderBy('createdAt', 'asc').get();
  state.folders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderFolders();
}

function renderFolders() {
  const q = (searchFolders.value || '').toLowerCase();
  foldersList.innerHTML = '';
  state.folders
    .filter(f => {
      if (!q) return true;
      const name = (f.title || '').toLowerCase();
      return q.split('').some(ch => name.includes(ch));
    })
    .forEach(f => {
      const row = document.createElement('div');
      row.className = 'item';
      const left = document.createElement('div');
      left.className = 'item-name';

      const nameInput = document.createElement('input');
      nameInput.value = f.title || 'Folder Baharu';
      nameInput.addEventListener('change', () => updateFolderTitle(f.id, nameInput.value));

      const openBtn = document.createElement('button');
      openBtn.className = 'btn-ghost';
      openBtn.textContent = 'Buka';
      openBtn.addEventListener('click', () => openFolder(f.id, nameInput.value));

      left.appendChild(nameInput);
      left.appendChild(openBtn);

      const right = document.createElement('div');
      right.className = 'row';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-danger btn';
      delBtn.textContent = 'Padam';
      delBtn.addEventListener('click', () => deleteFolder(f.id));

      row.appendChild(left);
      right.appendChild(delBtn);
      row.appendChild(right);
      foldersList.appendChild(row);
    });
}

searchFolders.addEventListener('input', renderFolders);

async function updateFolderTitle(id, title) {
  await foldersCol(state.currentFileId).doc(id)
    .set({ title, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

btnAddFolder.addEventListener('click', async () => {
  const title = prompt('Tajuk subfolder?') || 'Subfolder Baharu';
  await foldersCol(state.currentFileId).add({
    title,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await loadFolders();
});

async function deleteFolder(id) {
  const ok = confirm('Padam subfolder ini? Semua nota di dalamnya akan dipadam.');
  if (!ok) return;
  const notesSnap = await notesCol(state.currentFileId, id).get();
  for (const n of notesSnap.docs) {
    await notesCol(state.currentFileId, id).doc(n.id).delete();
  }
  await foldersCol(state.currentFileId).doc(id).delete();
  await loadFolders();
}

// ==================== PART 3: NOTES & EDITOR ====================

// Open Folder → Note view
async function openFolder(folderId, folderTitle) {
  state.currentFolderId = folderId;
  state.currentFolderTitle = folderTitle;
  currentFolderName.textContent = `Folder: ${folderTitle}`;

  // Ensure a single note document exists (simplify UX: one note per subfolder)
  const notesRef = notesCol(state.currentFileId, folderId);
  const snap = await notesRef.limit(1).get();
  if (snap.empty) {
    const created = await notesRef.add({
      content: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    state.currentNoteId = created.id;
  } else {
    state.currentNoteId = snap.docs[0].id;
  }

  // Subscribe to the note for live updates
  if (state.noteUnsubscribe) state.noteUnsubscribe();
  state.noteUnsubscribe = notesRef.doc(state.currentNoteId).onSnapshot(doc => {
    const data = doc.data();
    if (data && typeof data.content === 'string') {
      // Avoid cursor jump: only update if different
      if (editor.innerHTML !== data.content) {
        editor.innerHTML = data.content;
      }
    }
  });

  show(vNote);
}

// Toolbar actions
document.querySelectorAll('.toolbar .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'bold') document.execCommand('bold');
    if (action === 'underline') document.execCommand('underline');
    editor.focus();
  });
});

colorPicker.addEventListener('input', () => {
  document.execCommand('foreColor', false, colorPicker.value);
  editor.focus();
});

fontSizeInput.addEventListener('change', () => {
  const sizePt = Math.max(1, Math.min(60, Number(fontSizeInput.value) || 14));
  document.execCommand('fontSize', false, 7); // apply largest, then replace with pt
  const els = editor.querySelectorAll('font[size="7"]');
  els.forEach(el => {
    el.removeAttribute('size');
    el.style.fontSize = `${sizePt}pt`;
  });
  editor.focus();
});

// Auto-save (debounced)
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNote, 500);
}
editor.addEventListener('input', scheduleSave);
editor.addEventListener('keyup', scheduleSave);
editor.addEventListener('paste', scheduleSave);

async function saveNote() {
  if (!state.currentNoteId) return;
  try {
    saveStatus.textContent = 'Menyimpan…';
    await notesCol(state.currentFileId, state.currentFolderId).doc(state.currentNoteId)
      .set({
        content: editor.innerHTML,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    saveStatus.textContent = 'Auto-simpan diaktifkan.';
  } catch (e) {
    saveStatus.textContent = 'Simpan gagal (offline). Akan cuba semula.';
  }
}

// Navigation
btnBackHome.addEventListener('click', () => {
  show(vHome);
  if (state.noteUnsubscribe) { state.noteUnsubscribe(); state.noteUnsubscribe = null; }
  state.currentFolderId = null;
  state.currentNoteId = null;
  loadFiles();
});
btnBackFolders.addEventListener('click', () => {
  show(vFolders);
  if (state.noteUnsubscribe) { state.noteUnsubscribe(); state.noteUnsubscribe = null; }
});
