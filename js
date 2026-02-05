const newBtn = document.getElementById("newBtn");
const dropdown = document.getElementById("dropdown");
const fileArea = document.getElementById("fileArea");

/* NEW BUTTON */

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

/* ALERT */

function showAlert(title, message) {
  document.getElementById("alertTitle").innerText = title;
  document.getElementById("alertMessage").innerText = message;
  document.getElementById("alertModal").style.display = "flex";
}

function closeAlert() {
  document.getElementById("alertModal").style.display = "none";
}

/* UPLOAD TO S3 */

async function uploadFile(input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    showAlert("Success", "Uploaded: " + data.filename);

    loadFiles();
    updateStorage();

  } catch (err) {
    showAlert("Error", "Upload failed");
  }
}

/* LOAD FILES FROM S3 */

async function loadFiles() {
  try {
    const res = await fetch("/api/files");
    const data = await res.json();

    fileArea.innerHTML = "";

    data.files.forEach(name => {
      const card = document.createElement("div");
      card.className = "file-card";

      card.innerHTML = `
        <div style="font-size:40px">📄</div>
        <div>${name}</div>
      `;

      fileArea.appendChild(card);
    });

  } catch (err) {
    console.error("Failed to load files");
  }
}

/* UPDATE STORAGE FROM S3 */

async function updateStorage() {
  try {
    const res = await fetch("/api/files");
    const data = await res.json();

    const usedMB = (data.used_bytes / (1024 * 1024)).toFixed(2);
    const totalMB = (data.total_bytes / (1024 * 1024)).toFixed(2);

    document.getElementById("storage").innerText = usedMB + " MB";

    const percent = Math.min((usedMB / totalMB) * 100, 100);

    document.getElementById("usedStorage").innerText = usedMB + " MB";
    document.getElementById("totalStorage").innerText = "3 GB";
    document.getElementById("storageUsedBar").style.width = percent + "%";

  } catch (err) {
    console.error("Storage update failed");
  }
}

/* INIT */

loadFiles();
updateStorage();

