# Hostel Cleanup Randomizer (Saturday Sync) 🧹

A premium, fully-responsive, and verifiably bias-free Saturday cleanup allocation web application built with a Node.js + Express backend and a centralized JSON database (`db.json`). 

It solves the age-old problem of students complaining about cleanup spot allocations by introducing a transparent, verifiably random, and beautiful slot-machine matching algorithm.

---

## Key Features

1. **Authentication Portal**: Log in with your **Registration Number** as both username and password.
2. **Central Database & Synchronization**: Different hostel members can log in simultaneously from their individual phones/devices. The state updates in real-time (auto-refreshes every 5 seconds) so allocations are immediately visible to everyone!
3. **Safety / Gender Constraints**: Girls are strictly excluded from being assigned **"The gutter"** cleanup spot for physical safety. The algorithm automatically filters out restricted spots during allocation.
4. **Hostel Admin (Ezeigwe Samuel)**:
   * Exempt from all cleanup tasks.
   * Only the Admin can upload/change the real picture of any cleanup spot.
   * Access to a custom **Admin Command Center** to reset allocations weekly and review stats/activity logs.
5. **Interactive Checklist**: Assigned students get a step-by-step chore checklist and a glowing "Mark as Completed" button that updates the hostel roster in real-time.
6. **WhatsApp Sharing System**: Admin can copy the final weekly roster formatted in clean WhatsApp markdown with one click, ready to paste into the hostel group chat!

---

## 🚀 Quick Start (Run Locally)

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (version 14.0.0 or higher).

### 1. Installation
Open your terminal inside the `hostel-cleanup` directory and run:
```bash
npm install
```
This will automatically install all required dependencies (`express`, `body-parser`, `cors`, and the development tool `nodemon`).

### 2. Start the Server
Run the startup script:
```bash
npm start
```
*(Or use `npm run dev` to start with auto-reload enabled for development.)*

You should see this in your terminal:
```
==================================================
 HOSTEL CLEANUP SYSTEM SERVER STARTED SUCCESSFULLY
 Local Server: http://localhost:3000
 Database Path: C:\...\hostel-cleanup\data\db.json
==================================================
```

### 3. Open in Browser
Visit **[http://localhost:3000](http://localhost:3000)** on your computer or phone browser to access the website!

---

## 🔑 Testing Credentials

For easy and convenient testing, we pre-loaded a **Testing Helper Drawer** at the bottom of the Login Card. You can click on tabs to view and click on names to instantly fill out their credentials. Here is the reference list:

### Administrator
* **Admin Name**: Ezeigwe Samuel
* **Registration Number**: `20211271537`
* *Behavior*: Work exempt. Renders the custom Admin Dashboard, Activity Logs, Global Reset, and can upload custom photos on locations.

### Boy Workers
* **Ogazie Samuel**: `20211260337`
* **Innocent David**: `20211305897`
* **Jesse**: `20201244007`
* **Oparaji Wisdom**: `202113260487`
* *Behavior*: Eligible for all tasks (including 3 slots of "The gutter"). Renders "Assign me a spot" button.

### Girl Workers
* **Eze Chidimma**: `20211284277`
* **Peace Marshall**: `20211270417`
* **Sophia**: `20211274497`
* *Behavior*: Eligible for all tasks **except** "The gutter". Renders "Assign me a spot" button and will never be assigned the gutter.

---

## 🌐 How to Deploy Live to the Web (Free!)

To allow all hostel members to access this website on their own mobile phones, you can host it live on the web in less than 5 minutes for **100% free**!

### Recommended Platform: Glitch.com
Glitch is perfect for this project because it provides **free Node.js hosting with persistent storage**. This means your database (`db.json`) and any pictures you upload will never be wiped out!

#### Step-by-Step Hosting Guide:
1. **Create a Free Account**: Go to **[Glitch.com](https://glitch.com/)** and sign up for a free account.
2. **Create a New Project**:
   * Click the **"New Project"** button in the top right.
   * Select **"Import from GitHub"**.
   * *(Alternatively, select **"glitch-hello-node"** and drag-and-drop your `package.json`, `server.js`, `public/`, and `data/` folders directly into the web editor).*
3. **Upload Your Files**:
   * If importing from GitHub, push your local `hostel-cleanup` folder to a new repository on your GitHub account, then enter your GitHub repository link in the Glitch import box (e.g. `https://github.com/your-username/hostel-cleanup`).
4. **Your Live Link**:
   * Glitch will automatically run `npm install` and boot up your Express server!
   * Click **"Share"** in the top right to copy your live web link (e.g., `https://your-hostel-cleanup.glitch.me`).
   * Share this link with your hostel members on WhatsApp!

Now, everyone can open the link on their phones, log in, get randomized, check their spot photos, and do their weekly cleanup!
