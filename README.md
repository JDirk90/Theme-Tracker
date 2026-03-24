# Theme Tracker

A highly optimized Market Dashboard to visualize capital flows, themes, sectors, and top-level macroeconomic indices. 

> **Important Deployment Note**
> Yahoo Finance aggressively blocks free cloud server IP addresses (like Render) with HTTP 429 errors. Therefore, **this project is designed to be run locally** on your own computer where your residential IP address will not be blocked.

## Running Locally

Because the project needs to bypass Cross-Origin (CORS) limits from Yahoo Finance, it consists of two parts running simultaneously:
1. **The Backend Proxy**: A lightweight Express server (`server.js`) that safely contacts Yahoo Finance.
2. **The Frontend**: A fast React application powered by Vite that displays the dashboard.

We have configured a single command to spin up both automatically!

### 1. Install Dependencies
If you just cloned the repository, run:
```bash
npm install
```

### 2. Start the Application
Run the following in your terminal:
```bash
npm start
```
This single command runs `concurrently` to boot both the proxy server and the Vite application.

### 3. Open the Dashboard
Your terminal will show a Local URL (usually `http://localhost:5173/`). `CTRL+Click` the link or copy and paste it into your browser to view your live Theme Tracker!
