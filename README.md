# SwahiliTech Elite Academy — STEA Website

**Platform ya kwanza ya tech kwa Watanzania 🇹🇿**

---

## ⚡ Hatua za Kwanza (Setup)

### 1. Install dependencies
```bash
npm install
```

### 2. Weka Firebase Config yako
Fungua faili hili: `src/firebaseConfig.js`
Badilisha values zote na config yako ya kweli kutoka Firebase Console.

**Jinsi ya kupata Firebase Config:**
1. Nenda https://console.firebase.google.com
2. Create project → jina: `stea-website`
3. Project Settings (⚙️) → General → Add Web App
4. Copy config → Paste ndani ya `src/firebaseConfig.js`
5. Authentication → Sign-in methods → Washa: Email/Password + Google
6. Firestore Database → Create database → Start in test mode

### 3. Run locally
```bash
npm run dev
```
Fungua: http://localhost:3000

### 4. Build kwa production
```bash
npm run build
```

---

## 🚀 Deploy kwa Vercel (Recommended)

### Option A — Vercel CLI
```bash
npm install -g vercel
vercel
```

### Option B — GitHub + Vercel (Bora zaidi)
1. Push project yako kwenye GitHub repo mpya
2. Nenda vercel.com → Add New Project
3. Import repo yako kutoka GitHub
4. Click Deploy — tayari! 🎉

URL yako itakuwa: `https://stea-website.vercel.app`

---

## 📁 Muundo wa Project

```
stea-project/
├── src/
│   ├── App.jsx          ← Website yote (component kuu)
│   ├── firebaseConfig.js ← WEKA CONFIG YAKO HAPA
│   └── main.jsx         ← Entry point
├── public/
│   └── favicon.svg      ← STEA logo icon
├── index.html           ← HTML template
├── package.json         ← Dependencies
├── vite.config.js       ← Build config
├── vercel.json          ← Vercel routing config
└── .gitignore           ← Files za kusirisha kwenye Git
```

---

## 🔧 Features Zilizopo

- ✅ Loading screen ya STEA
- ✅ Navbar sticky na blur (STEA logo tu)
- ✅ Mobile menu inafanya kazi
- ✅ Search overlay (Ctrl+K)
- ✅ Auth system (Login/Register/Google/Forgot Password)
- ✅ User chip baada ya login
- ✅ Admin dashboard (email yako = admin auto)
- ✅ Firebase Firestore (user profiles)
- ✅ Hero section na stars + typed animation
- ✅ Stats counters animate
- ✅ Tech Tips, Updates, Deals, Courses, Duka, Websites pages
- ✅ 3D tilt cards na glare effect
- ✅ Promo code copy button
- ✅ Newsletter section
- ✅ Scroll progress bar
- ✅ Back to top button
- ✅ Footer na email + WhatsApp

-------

## 📧 Mawasiliano ya STEA

- Email: swahilitecheliteacademy@gmail.com
- WhatsApp: +8619715852043

---

*SwahiliTech Elite Academy © 2026 — Teknolojia kwa Kiswahili 🇹🇿*
