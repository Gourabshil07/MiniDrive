/*VARIABLES  */
const TOTAL_STORAGE_MB = 3 * 1024;
const newBtn = document.getElementById("newBtn");
const dropdown = document.getElementById("dropdown");
const fileArea = document.getElementById("fileArea");
const recentTable = document.getElementById("recentTable");
const recentBody = document.getElementById("recentBody");
const storageText = document.getElementById("storage");
const modal = document.getElementById("modal");
const folderInput = document.getElementById("folderName");
const pathTitle = document.getElementById("pathTitle");

const fileMenu = document.getElementById("fileMenu");
const detailsModal = document.getElementById("detailsModal");

const renameBtn = document.getElementById("renameBtn");
const recoverBtn = document.getElementById("recoverBtn");

const searchInput = document.getElementById("searchInput");  

/* DATA */

let data = { root: {}, trash: {}, recent: [] };

async function loadDrive() {
  const res = await fetch("/api/drive");
  data = await res.json();
  render();

}


let pathStack = ["root"];
let inTrash = false;
let inRecent = false;
let selectedFile = null;


/*  SETTINGS  */

function toggleSettings(e) {
  e.stopPropagation();   

  const panel = document.getElementById("settingsPanel");

  if (panel.style.display === "block") {
    panel.style.display = "none";
  } else {
    panel.style.display = "block";
  }
}

document.addEventListener("click", () => {
  const panel = document.getElementById("settingsPanel");
  panel.style.display = "none";
});

function setDark() {
  document.body.className = "dark";
  document.getElementById("settingsPanel").style.display = "none";

}

function setLight() {
  document.body.className = "light";
   document.getElementById("settingsPanel").style.display = "none";

  
}


/*  HELPERS  */

function getCurrentFolder() {
  let ref = data.root;
  for (let i = 1; i < pathStack.length; i++) {
    ref = ref[pathStack[i]];
  }
  return ref;
}

function save() {
  fetch("/api/drive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}


// to search files in recent section

function findInDrive(name, current = data.root, path = []) {

  for (let key in current) {

    const item = current[key];

    // if match get
    if (key === name) {
      return { item, path };
    }

    // if folder the search inside
    if (typeof item === "object" && !item.url) {
      const result = findInDrive(name, item, [...path, key]);
      if (result) return result;
    }
  }

  return null;
}


// delete pop up fix

let deleteTarget = null;

function openDeleteModal() {
  document.getElementById("deleteModal").style.display = "flex";
}

function closeDeleteModal() {
  document.getElementById("deleteModal").style.display = "none";
  deleteTarget = null;
}

function confirmPermanentDelete() {
  if (!deleteTarget) return;

  const item = data.trash[deleteTarget];

  // CASE 1: file → delete by URL
  if (item && item.url) {
    fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: item.url })
    });
  }

  //  CASE 2: folder → delete by KEY
  if (item && !item.url) {
    // build folder path key
    const folderKey = deleteTarget + "/";

    fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: folderKey })
    });
  }

  // remove from trash UI + DB
  delete data.trash[deleteTarget];

  save();
  render();
  closeDeleteModal();
}

/*  url fix when rename each files  */
function updateUrlsRecursively(folder, oldPath, newPath) {

  for (let key in folder) {

    const item = folder[key];

    // file
    if (item.url) {

      item.url = item.url.replace(oldPath, newPath);
    }
    // subfolder
    else {
      updateUrlsRecursively(item, oldPath, newPath);
    }
  }
}
/* size calculation of folder  */
function calculateFolderSize(folder) {

    let total = 0;

    for (let key in folder) {

        const item = folder[key];

        // file
        if (item.url) {
            total += Number(item.size) || 0;
        }
        // subfolder
        else {
            total += calculateFolderSize(item);
        }
    }

    return total;
}


/* SEARCH (mydrive + recent support)*/

searchInput.addEventListener("input", () => {

  const query = searchInput.value.toLowerCase();

  // if present in recent 
  if (inRecent) {
    searchRecent(query);
    return;
  }

  // if exist in Trash then search off
  if (inTrash) return;

  // My Drive search
  recentTable.style.display = "none";
  fileArea.style.display = "grid";

  searchFiles(query);
});


function searchFiles(query) {

  if (!query) {
    render();
    return;
  }

  fileArea.innerHTML = "";
  let total = 0;
  const items = getCurrentFolder();

  for (let key in items) {

    if (!key.toLowerCase().includes(query)) continue;

    const card = document.createElement("div");
    card.className = "file-card";
    const item = items[key];

    // folder
    if (typeof item === "object" && !item.url) {
      card.innerHTML = `<div style="font-size:40px">📁</div><div>${key}</div>`;
      card.onclick = () => openFolder(key);
      card.oncontextmenu = (e) => openFileMenu(e, key, "folder", "");
    }
    // file
    else {
      card.innerHTML = `<div style="font-size:40px">📄</div><div>${key}</div><small>${item.size} MB</small>`;
      card.onclick = () => openFile(item);
      card.oncontextmenu = (e) => openFileMenu(e, key, "file", item.size);
      total += Number(item.size);
    }

    fileArea.appendChild(card);
  }


}

function searchRecent(query) {

  recentBody.innerHTML = "";

  data.recent.forEach(item => {

    if (!item.name.toLowerCase().includes(query)) return;

    const row = document.createElement("tr");
    row.className = "recent-row";

    row.innerHTML = `
      <td>
        ${item.type === "folder" ? "📁" : "📄"}
        <span class="recent-name">${item.name}</span>
      </td>
      <td>${item.time}</td>
      <td>${item.owner}</td>
      <td>${item.size ? item.size + " MB" : "-"}</td>
    `;

    /* left click (open file and folder) */
    row.onclick = () => {

      const result = findInDrive(item.name, data.root);

      // if not exists anymore → alert only
      if (!result) {
        showAlert("This file or folder no longer exists in My Drive", "Not Found");
        return;
      }

      // open normally
      inRecent = false;
      inTrash = false;
      pathStack = ["root", ...result.path];
      render();

      if (result.item.url) {
        openFile(result.item);
      }
    };


    /* right click (SELECT + DELETE FROM RECENT ONLY) */
    row.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // mark as coming from recent
      selectedFile = {
        name: item.name,
        type: item.type,
        size: item.size,
        fromRecent: true
      };

      // hide rename / recover in recent
      renameBtn.style.display = "none";
      recoverBtn.style.display = "none";

      fileMenu.style.display = "block";
      fileMenu.style.left = e.pageX + "px";
      fileMenu.style.top = e.pageY + "px";
    };

    recentBody.appendChild(row);
  });
}


/* breadcrumb  */
function goToPath(index) {
  pathStack = pathStack.slice(0, index + 1);
  render();
}

function renderPath() {
  pathTitle.innerHTML = "";

  // recent breadcrumb
  if (inRecent) {
    const span = document.createElement("span");
    span.className = "current";
    span.innerText = "Recent";
    pathTitle.appendChild(span);
    return;
  }

  // Trash breadcrumb
  if (inTrash) {
    const span = document.createElement("span");
    span.className = "current";
    span.innerText = "Trash";
    pathTitle.appendChild(span);
    return;
  }

  // Normal My Drive breadcrumb
  pathStack.forEach((folder, index) => {
    const span = document.createElement("span");

    if (index === 0) span.innerText = "My Drive";
    else span.innerText = folder;

    if (index === pathStack.length - 1) {
      span.className = "current";
    } else {
      span.onclick = () => goToPath(index);
    }

    pathTitle.appendChild(span);

    if (index < pathStack.length - 1) {
      pathTitle.appendChild(document.createTextNode(" / "));
    }
  });
}


/* go back */

function goBack() {

  // From Recent or Trash always go to My Drive
  if (inRecent || inTrash) {
    openRoot();
    return;
  }

  // Normal folder back
  if (pathStack.length > 1) {
    pathStack.pop();
    render();
  }
}


/*  NEW BUTTON  */

newBtn.onclick = (e) => {
  e.stopPropagation();
  dropdown.style.display =
    dropdown.style.display === "block" ? "none" : "block";
};

document.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target) && e.target !== newBtn) {
    dropdown.style.display = "none";
  }
});


/*  NAVIGATION  */

function openRoot() {
  pathStack = ["root"];
  inTrash = false;
  inRecent = false;

  recentTable.style.display = "none";
  fileArea.style.display = "grid";

  render();
}

function openTrash() {
  inTrash = true;
  inRecent = false;

  //  history add
  window.history.pushState({ type: "trash" }, "", "");

  recentTable.style.display = "none";
  fileArea.style.display = "grid";

  render();
  pathTitle.innerHTML = `<span class="current">Trash</span>`;
}

function openRecent() {
  inRecent = true;
  inTrash = false;

  //  history add
  window.history.pushState({ type: "recent" }, "", "");

  fileArea.style.display = "none";
  recentTable.style.display = "table";

  renderRecent();
  pathTitle.innerHTML = `<span class="current">Recent</span>`;
}

function openFolder(name) {
  if (inTrash || inRecent) return;

  pathStack.push(name);

  // history add
  window.history.pushState({ type: "folder", path: [...pathStack] }, "", "");
  render();
}


/* recent add */

function addToRecent(name, type, size) {
  const now = new Date().toLocaleString();

  data.recent.unshift({
    name,
    type,
    size,
    time: now,
    owner: "me"
  });

  if (data.recent.length > 30) data.recent.pop();
}


/*  CREATE MODAL */

function openCreateModal() {
  modal.style.display = "flex";
  folderInput.value = "";
  dropdown.style.display = "none";
}

function closeModal() {
  modal.style.display = "none";
}

async function createFolder() {
  const name = folderInput.value.trim();
  if (!name) return;

  try {
    const res = await fetch("/api/create-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        path: pathStack       
      })
    });

    const result = await res.json();

    // update frontend structure only after backend success
    const current = getCurrentFolder();

    if (current[name]) {
      showAlert("Folder already exists", "Already Exists");
      return;
    }

    current[name] = {};          
    addToRecent(name, "folder", "");
    save();
    closeModal();
    render();

  } catch (err) {
    console.error("Folder create failed", err);
    showAlert("Folder creation failed", "Error");
  }
}


/*  file uploads */

async function uploadFile(input) {
  if (inTrash || inRecent) return;

  const file = input.files[0];
  if (!file) return;

  const form = new FormData();
  form.append("file", file);

  // send current folder path to backend
  form.append("path", JSON.stringify(pathStack));

  const res = await fetch("/api/upload", {
    method: "POST",
    body: form
  });

  // handle storage full and server errors
  if (!res.ok) {
    const err = await res.json();

    if (err.error === "MINIDRIVE_STORAGE_FULL") {
      showAlert(
        "MiniDrive storage is full.\nOther users have already used all available space.",
        "Storage Limit Reached"
      );
      input.value = "";
      return;
    }

    showAlert("Upload failed. Please try again.", "Upload Error");
    input.value = "";
    return;
  }

  const result = await res.json();

  const current = getCurrentFolder();

  current[result.name] = {
    size: result.size,
    url: result.url,
    type: result.type
  };

  addToRecent(result.name, "file", result.size);
  save();
  render();
  input.value = "";
}

function openFile(fileObj) {
  if (!fileObj.url) return;
  window.open(fileObj.url, "_blank");
}
/*Open file picker*/ 
const mobileFileInput = document.getElementById("mobileFileInput");

mobileFileInput.addEventListener("change", function () {
  if (this.files && this.files.length > 0) {
    uploadFile(this);
  }
});

function openFilePicker() {
  mobileFileInput.value = "";   
  mobileFileInput.click();      
}


/* File Menu*/
function openFileMenu(e, name, type, size) {
  e.preventDefault();
  e.stopPropagation();

  selectedFile = { name, type, size };

  if (inTrash) {
    renameBtn.style.display = "none";
    recoverBtn.style.display = "block";
  } else {
    renameBtn.style.display = "block";
    recoverBtn.style.display = "none";
  }

  fileMenu.style.display = "block";

  const menuHeight = fileMenu.offsetHeight;
  const menuWidth = fileMenu.offsetWidth;

  let x = e.pageX;
  let y = e.pageY;

  const windowHeight = window.innerHeight;
  const windowWidth = window.innerWidth;

  /* If near bottom → show upward */
  if (y + menuHeight > windowHeight - 20) {
    y = y - menuHeight - 10;
  }

  /* If near right edge → shift left */
  if (x + menuWidth > windowWidth - 20) {
    x = x - menuWidth - 10;
  }

  fileMenu.style.left = x + "px";
  fileMenu.style.top = y + "px";
}

/*  DELETE / RECOVER / RENAME  */


function recoverFile() {
  data.root[selectedFile.name] = data.trash[selectedFile.name];
  delete data.trash[selectedFile.name];

  save();
  render();
}


function deleteFile() {

  // If delete from RECENT TAB → only clear from recent
  if (selectedFile && selectedFile.fromRecent) {

    // remove only from recent list
    data.recent = data.recent.filter(r => r.name !== selectedFile.name);

    fileMenu.style.display = "none";
    save();
    renderRecent();      
    return;
  }


  // If already in Trash → show custom confirm modal
  if (inTrash) {

    deleteTarget = selectedFile.name;   
    fileMenu.style.display = "none";
    openDeleteModal();                  
    return;
  }

  // Normal delete from My Drive → move to trash
  const current = getCurrentFolder();

  data.trash[selectedFile.name] = current[selectedFile.name];
  delete current[selectedFile.name];

  fileMenu.style.display = "none";
  save();
  render();
}

// function renameFile() {

function renameFile() {
  // Open rename modal
  document.getElementById("renameInput").value = selectedFile.name;
  document.getElementById("renameModal").style.display = "flex";
  fileMenu.style.display = "none";
}

function closeRename() {
  document.getElementById("renameModal").style.display = "none";
}

async function confirmRename() {
  const newName = document.getElementById("renameInput").value.trim();
  if (!newName) return;

  const oldName = selectedFile.name;
  const current = getCurrentFolder();

  if (current[newName]) {
    showAlert("File or folder already exists", "Already Exists");
    return;
  }

  // UPDATE UI STRUCTURE 
  current[newName] = current[oldName];
  delete current[oldName];
  
  
  //fix url after rename

  if (selectedFile.type === "file" && current[newName].url) {
    const parts = current[newName].url.split("/");
    parts[parts.length - 1] = newName;
    current[newName].url = parts.join("/");
  }


  // UPDATE RECENT
  data.recent.forEach(item => {
    if (item.name === oldName) item.name = newName;
  });

  //BUILD S3 KEYS
  const basePath = pathStack.slice(1).join("/");
  const oldKey = basePath ? basePath + "/" + oldName : oldName;
  const newKey = basePath ? basePath + "/" + newName : newName;

  // CALL BACKEND RENAME
  await fetch("/api/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      old_key: selectedFile.type === "folder" ? oldKey + "/" : oldKey,
      new_key: selectedFile.type === "folder" ? newKey + "/" : newKey,
      is_folder: selectedFile.type === "folder"
    })
  });
  if (selectedFile.type === "file") {
    save();   
  }

  await loadDrive();  
  render();
  closeRename();
}



// pop up

function showAlert(message, title = "Notice") {
  document.getElementById("alertTitle").innerText = title;
  document.getElementById("alertMessage").innerText = message;
  document.getElementById("alertModal").style.display = "flex";
}

function closeAlert() {
  document.getElementById("alertModal").style.display = "none";
}



/*  Details*/
function showDetails() {

  document.getElementById("detailName").innerText =
      "Name: " + selectedFile.name;

  let sizeText = "";

  // file
  if (selectedFile.type === "file") {

      sizeText = selectedFile.size + " MB";
  }

  // folder
  else {

      const folder = getCurrentFolder()[selectedFile.name];

      const totalSize = calculateFolderSize(folder);

      if (totalSize >= 1024) {
          sizeText = (totalSize / 1024).toFixed(2) + " GB";
      } else {
          sizeText = totalSize.toFixed(2) + " MB";
      }
  }

  document.getElementById("detailSize").innerText =
      "Size: " + sizeText;


  /* TYPE WITH EXTENSION */
  
  let typeText = "Folder";

  if (selectedFile.type === "file") {

      const folder = getCurrentFolder();
      const file = folder[selectedFile.name];

      if (file && file.type) {

          // Example: application/pdf → pdf
          const mimePart = file.type.split("/")[1];

          typeText = mimePart
              ? mimePart.toUpperCase() + " File"
              : "File";

      } else {

          // fallback if mimetype missing
          if (selectedFile.name.includes(".")) {
              const ext = selectedFile.name.split(".").pop().toUpperCase();
              typeText = ext + " File";
          } else {
              typeText = "Unknown File";
          }
      }
  }

  document.getElementById("detailType").innerText =
    "Type: " + typeText;

    // Share (only for files) 
    const shareSection = document.getElementById("shareSection");
    shareSection.innerHTML = "";

    if (selectedFile.type === "file") {
    shareSection.innerHTML = `
        <button
        style="
            width:100%;
            margin-top:10px;
            background:#10b981;
            color:white;
            padding:10px;
            border:none;
            border-radius:8px;
            font-weight:600;
            cursor:pointer;">
        🔗 Share File
        </button>
    `;

    shareSection.querySelector("button").onclick = () => {
        shareFile(selectedFile.name);
    };
    }

    async function shareFile(fileName) {
    const folder = inTrash ? data.trash : getCurrentFolder();
    const file = folder[fileName];

    if (!file || !file.url) {
        showAlert("File not found", "Error");
        return;
    }

    const key = decodeURIComponent(
        file.url.split(".amazonaws.com/")[1]
    );

    const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
    });

    const result = await res.json();

    if (!result.share_url) {
        showAlert("Unable to generate share link", "Error");
        return;
    }

    await navigator.clipboard.writeText(result.share_url);

    showAlert(
        "Share link copied to clipboard\n(Valid for 1 hour)",
        "Link Copied"
    );
    }

  /* download button */
  const downloadSection = document.getElementById("downloadSection");

  if (selectedFile.type === "file") {
    const fileName = selectedFile.name;

      downloadSection.innerHTML = `
          <button id="downloadBtn"
            style="
              width:100%;
              margin-top:12px;
              background:#2d6cdf;
              color:white;
              padding:10px;
              border:none;
              border-radius:8px;
              font-weight:600;
              cursor:pointer;">
            Download File
          </button>
      `;

      // Safe event binding for inline click
      document
        .getElementById("downloadBtn")
        .addEventListener("click", () => {
            downloadFile(selectedFile.name);
        });

  }
  else {

      // Folder → nO button
      downloadSection.innerHTML = "";
  }

  fileMenu.style.display = "none";
  detailsModal.style.display = "flex";

}

function closeDetails() {
detailsModal.style.display = "none";
}

async function downloadFile(fileName){

   try {

       let folder;

       // Critical fix (for Trash download)
       if(inTrash){
          folder = data.trash;
       }else{
          folder = getCurrentFolder();
       }

       const file = folder[fileName];

       if(!file || !file.url){
           showAlert(
             "This file no longer exists or was permanently deleted.",
             "File Not Found"
           );
           return;
       }

       const key = decodeURIComponent(
           file.url.split(".amazonaws.com/")[1]
       );

       const res = await fetch(`/api/download?key=${encodeURIComponent(key)}`);

       if(!res.ok){
           showAlert(
             "Unable to download the file. Please try again.",
             "Download Error"
           );
           return;
       }

       const data = await res.json();

       window.location.href = data.url;

   } catch(err){

       console.error("Download error:", err);

       showAlert(
         "Something went wrong while downloading.",
         "Server Error"
       );
   }
}


/*  Render Drive */

function render() {
  fileArea.innerHTML = "";
  let total = 0;

  renderPath();
  recentTable.style.display = "none";
  fileArea.style.display = "grid";

  const items = inTrash ? data.trash : getCurrentFolder();

  for (let key in items) {
    const card = document.createElement("div");
    card.className = "file-card";
    const item = items[key];

    if (typeof item === "object" && !item.url) {
      card.innerHTML = `<div style="font-size:40px">📁</div><div>${key}</div>`;
      card.onclick = () => openFolder(key);
      card.oncontextmenu = (e) => openFileMenu(e, key, "folder", "");
    } else {
      card.innerHTML = `<div style="font-size:40px">📄</div><div>${key}</div><small>${item.size} MB</small>`;
      card.onclick = () => openFile(item);
      card.oncontextmenu = (e) => openFileMenu(e, key, "file", item.size);
      total += Number(item.size);
    }

    fileArea.appendChild(card);
  }


}

/* RENDER RECENT */

function renderRecent() {
  recentBody.innerHTML = "";

  data.recent.forEach(item => {

    const row = document.createElement("tr");
    row.className = "recent-row";

    row.innerHTML = `
      <td>
        ${item.type === "folder" ? "📁" : "📄"}
        <span class="recent-name">${item.name}</span>
      </td>
      <td>${item.time}</td>
      <td>${item.owner}</td>
      <td>${item.size ? item.size + " MB" : "-"}</td>
    `;

    /* CLICK BEHAVIOR */
    row.onclick = () => {

      // Find file/folder in drive
      const result = findInDrive(item.name, data.root);

      // If not found → show alert only (DO NOT delete from recent)
      if (!result) {
        showAlert("This file or folder no longer exists in My Drive", "Not Found");
        return;
      }

      // Open normally
      inRecent = false;
      inTrash = false;
      pathStack = ["root", ...result.path];
      render();

      // If file → open
      if (result.item.url) {
        openFile(result.item);
      }

      
    };

    row.oncontextmenu = (e) => {
      openFileMenu(e, item.name, item.type, item.size, true);
    };

  recentBody.appendChild(row);
  });
}

/* context menu hide*/

document.addEventListener("click", (e) => {
  if (!fileMenu.contains(e.target)) {
    fileMenu.style.display = "none";
  }
});

/* Browser final back */

window.onpopstate = function (e) {

  if (!e.state) {
    openRoot();
    return;
  }

  if (e.state.type === "recent") {
    openRoot();
    return;
  }

  if (e.state.type === "trash") {
    openRoot();
    return;
  }

  // Folder navigation back
  if (e.state.type === "folder" && e.state.path) {
    pathStack = e.state.path;
    render();
    return;
  }

  // fallback → always My Drive
  openRoot();
};

/*FOLDER UPLOAD TO S3  */
async function uploadFolder(input) {
  if (inTrash || inRecent) return;

  const files = input.files;
  if (!files || files.length === 0) return;

  // Extract root folder name
  const rootFolder = files[0].webkitRelativePath.split("/")[0];
  const current = getCurrentFolder();

  // Create root folder FIRST 
  if (!current[rootFolder]) {
    const res = await fetch("/api/create-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: rootFolder,
        path: pathStack
      })
    });

    if (!res.ok) {
      showAlert("Unable to create folder", "Upload Error");
      return;
    }

    current[rootFolder] = {};
  }

  // Upload files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    const parts = file.webkitRelativePath.split("/");
    const subFolders = parts.slice(1, -1); // exclude root + filename

    const fullPath = [...pathStack, rootFolder, ...subFolders];

    const form = new FormData();
    form.append("file", file);
    form.append("path", JSON.stringify(fullPath));

    const res = await fetch("/api/upload", {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      const err = await res.json();

      if (err.error === "MINIDRIVE_STORAGE_FULL") {
        showAlert(
          "MiniDrive storage is full.\nOther users have already used all available space.",
          "Storage Limit Reached"
        );
        break;
      }

      showAlert("Folder upload failed", "Upload Error");
      break;
    }

    const result = await res.json();

    // Build UI tree correctly
    let ref = current[rootFolder];
    for (let j = 0; j < subFolders.length; j++) {
      if (!ref[subFolders[j]]) ref[subFolders[j]] = {};
      ref = ref[subFolders[j]];
    }

    ref[result.name] = {
      size: result.size,
      url: result.url,
      type: result.type
    };

    addToRecent(result.name, "file", result.size);
  }

  save();
  await loadDrive();   
  render();
  input.value = "";
  await refreshStorage();
}

/*  S3 + Backend final Integration */
async function initDrive() {
  try {
    await loadDrive();          
    await refreshStorage();    
  } catch (err) {
    console.error("Drive load failed", err);
  }
}


// Refresh storage from backend 
async function refreshStorage() {
  try {
    const res = await fetch("/api/storage");
    const info = await res.json();

    const usedMB = info.used_mb;
    const percent = Math.min((usedMB / TOTAL_STORAGE_MB) * 100, 100);

    // HEADER STORAGE
    document.getElementById("storage").innerText =
      usedMB >= 1024
        ? (usedMB / 1024).toFixed(2) + " GB"
        : usedMB.toFixed(2) + " MB";

    // SIDEBAR STORAGE
    document.getElementById("usedStorage").innerText =
      usedMB >= 1024
        ? (usedMB / 1024).toFixed(2) + " GB"
        : usedMB.toFixed(2) + " MB";

    document.getElementById("totalStorage").innerText = "3 GB";
    document.getElementById("storageUsedBar").style.width = percent + "%";

  } catch (err) {
    console.error("Storage sync failed", err);
  }
}



// After upload → refresh storage again
const originalUpload = uploadFile;
uploadFile = async function (input) {
  await originalUpload(input);
  await refreshStorage();
};


// After delete → refresh storage again
const originalDelete = confirmPermanentDelete;
confirmPermanentDelete = async function () {
  await originalDelete();
  await refreshStorage();
};


// INIT FINAL
initDrive();
