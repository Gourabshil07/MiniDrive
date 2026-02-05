# MiniDrive ☁️

MiniDrive is a **Google Drive–like cloud storage web application** built using  **Flask, AWS S3, and JavaScript** , and deployed on  **AWS EC2 (Linux)** . It provides a secure, user-friendly interface for file and folder management with real-time synchronization between the UI and AWS S3.

The project is designed as a  **shared storage pool model** , where a **total storage of 3GB** is allocated globally and dynamically shared among all users.

---

## 🌐 Live Demo

**Hosted URL:** [https://gourabminidrive.duckdns.org](https://gourabminidrive.duckdns.org/)
(Domain managed using DuckDNS)

🎥 **Demo Video:** *(Coming Soon – will be added here to showcase full functionality)*

---

## 🚀 Tech Stack

### Backend

* Python (Flask)
* AWS S3 (Object Storage)
* SQLite (metadata & authentication)

### Frontend

* HTML5
* CSS3
* JavaScript (Vanilla JS)

### Deployment & Infrastructure

* AWS EC2 (Linux / Ubuntu)
* AWS S3 Bucket (per-user folder structure)
* DuckDNS (Dynamic Domain Name)

---

## 🧠 System Architecture (High Level)

* The **UI (Dashboard)** communicates with Flask APIs.
* Flask handles authentication, authorization, and business logic.
* All files and folders are stored in  **AWS S3** .
* Every user has a  **separate folder namespace in S3** .
* UI actions (upload, delete, rename, move) are  **instantly synchronized with S3** .
* Metadata such as recent files, trash, and sharing info is managed server-side.

---

## 📦 Storage Model

* **Total Storage Pool:** 3GB
* **Model:** Shared storage pool (not fixed per user)
* Storage usage is calculated dynamically based on total uploaded data.
* Admin can monitor total storage usage.

⚠️ If the global storage limit is reached, uploads are restricted.

---

## 🔐 Authentication & Security

* User **Signup & Login** system
* Session-based authentication
* Each user has isolated access to their own files
* Admin cannot view user files (privacy-first design)

---

## ✨ Features

### 👤 User Features

* ✅ Signup & Login authentication
* 📁 Upload files
* 📂 Upload folders (including nested folders)
* ➕ Create new folders
* ✏️ Rename files & folders
* 🗑️ Delete files & folders
* ♻️ Trash section
* 🔁 Recover files from Trash
* ❌ Permanent delete option
* 🕒 Recent files section
* 📥 Download files

### 📄 File Details Panel

* File name
* File size
* File type
* Share option
* download option

### 🔗 File Sharing

* Generate **secure share links**
* Time-limited validity (expiry-based access)
* Auto-disable link after expiration

### 🎨 UI & Settings

* 🌙 Dark mode
* ☀️ Light mode
* Responsive and clean dashboard UI

---

## 🛡️ Admin Panel (Special Access)

Admin users have a dedicated admin dashboard with the following powers:

* 👥 View all registered users
* 🧮 Monitor total storage usage
* ❌ Remove users if required

🔒 **Privacy Guarantee:**

* Admin **cannot view user files or folders**
* Only storage statistics and user metadata are visible

---

## 🗂️ AWS S3 Integration

* Each user is assigned a **separate folder inside S3**
* Folder structure in UI mirrors S3 structure
* Any UI action:
  * Upload
  * Rename
  * Delete
  * Recover

➡️ Automatically reflects in **AWS S3 in real time**

This ensures strong consistency between UI and cloud storage.

---

## 🐧 Deployment Environment (Linux)

The application is deployed on:

* **OS:** Linux (Ubuntu on AWS EC2)
* **Web Server:** Flask (development & production-ready setup)
* **Process Management:** Manual / Gunicorn (optional)

---

## 📜 License

© 2026 Gourab. All rights reserved.

This project is  **view-only** . Modification, redistribution, or commercial use is **strictly prohibited** without explicit written permission from the author.

---

## 📌 Future Improvements

* File preview support (PDF, images)
* Two-factor authentication
* Activity logs
* Storage analytics dashboard
* Dockerized deployment

---

## 🙌 Acknowledgements

MiniDrive is built as a learning-focused yet production-grade cloud storage project to understand  **cloud architecture, security, and full-stack development** .

---

**⭐ If you like this project, consider giving it a star on GitHub!**
