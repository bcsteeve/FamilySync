# FamilySync

## ALPHA STATUS!!  Please note that this project was developed for my PERSONAL use and likely has a ton of bugs and/or may not fit YOUR use case.

![Version](https://img.shields.io/badge/version-0.1.0-blue) ![Docker](https://img.shields.io/badge/docker-ready-blue)

**FamilySync** is a self-hosted family dashboard designed to replace the magnet-covered fridge whiteboard. It combines a shared calendar and shopping/to-do lists. 
It is NOT intended to be everything for everyone.  I just couldn't find a FREE calendar/list app that did what I wanted, so I made this for my family and I
share it with yours.  No warrantee or promise included.

Built with **React 19**, **Tailwind CSS v4**, and **PocketBase**.

## ✨ Features

* **📅 Shared Calendar:** Support for recurring events, drag-and-drop rescheduling, and import/export (.ics).
* **🛒 Smart Shopping:** Items are automatically categorized by store. Drag items to reorder or move them between categories.
* **✅ To-Do Lists:** Shared tasks with priority levels and deadlines.
* **⏪ Time Travel:** Full **Undo/Redo** support for every action in the current session.
* **👥 Multi-User:** Color-coded avatars for every family member. See who added an item and who bought it.
* **🌓 Dark Mode:** Automatic or manual theme switching.
* **📱 Mobile First:** Installable as a PWA (Progressive Web App) on iOS and Android.

---

## 🚀 Getting Started (For Users / NAS)

If you just want to run the app on your Home Server (Synology, Unraid, Raspberry Pi), use this method. You do **not** need to download the source code.

### 1. Create a `docker-compose.yml`
Create a folder on your server (e.g., `familysync`) and create a file named `docker-compose.yml` with the following content:

```yaml
services:
  familysync:
    image: ghcr.io/bcsteeve/familysync:latest
    container_name: familysync
    restart: unless-stopped
    ports:
      - "8090:8090"
    volumes:
      # This folder stores your database and uploaded avatars
      - ./pb_data:/pb/pb_data
    environment:
      # Set your timezone
      - TZ=America/Vancouver

### 2. That's it!  If you don't know how to do step 1 (ie. you aren't familiar with Docker and Docker Compose), then I'm afraid you need to Google for a bit.
