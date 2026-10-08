# DevLingo Frontend - AI-Powered Adaptive Python Learning Platform 🐍

DevLingo is a next-generation web application for interactive Python learning, featuring real-time 1v1 battle duels, item response theory (IRT) dynamic difficulty scaling, Gemini AI progress coaching, and automated weekly reporting.

## 🚀 Key Features

- **Interactive Python Sandbox:** Execute Python code directly in browser using WebWorker-isolated Pyodide.
- **1v1 Battle Arena:** Real-time competitive duel arena with dual presence anti-cheat locking and live progress radar.
- **Dynamic Elo Skill Rating:** Real-time IRT-based difficulty adjustments ($K=32$) per topic.
- **AI Peer Matchmaking:** Cosine-similarity pairing for study buddies and complement mentors.
- **AI Progress Coach & Automated Reports:** Weekly progress summaries emailed via FastAPI reporting engine.
- **Google Calendar Sync:** Export study schedules directly to personal calendars.

## 👥 Contributors

- **Ali Ahmed** ([@AliAhmed17005](https://github.com/AliAhmed17005))
- **Owais** (`mowaiss1975@gmail.com`)
- **Huzaifa Yaseen** (`huzaifayaseen989@gmail.com`)

## 🛠️ Local Setup & Execution

```bash
# Install dependencies
npm install

# Run frontend development server
npm start

# Run both frontend & backend with 1-click script
npm run start:all
```
