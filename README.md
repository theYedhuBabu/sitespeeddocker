# Local Sitespeed Runner

Welcome to the **Local Sitespeed Runner**! This tool helps you check how fast your website is and identify performance issues, all from your own computer.

Think of it as a health check-up for your website. It simulates a user visiting your site and records how long it takes to load, what resources are being downloaded, and gives you advice on how to make it faster.

## 🌟 What is this tool?

This tool is a "Performance Testing Dashboard". It combines several powerful technologies into one easy-to-use interface.

Instead of typing complex commands in a black terminal window, you get a friendly web page where you can simply type in a website address (URL) and click "Run Test".

## 🧩 The Components (The Parts of the Engine)

To make this work, we use four main "building blocks". You don't need to be an expert in them, but it helps to know what they do:

### 1. The Web Dashboard (The Control Center)
*   **What it is:** This is the website you see when you open the tool in your browser (at `http://localhost:8080`).
*   **What it does:** It allows you to start new tests and view the results of previous tests. It's the "face" of the operation.

### 2. The Test Runner (Sitespeed.io)
*   **What it is:** This is the "engine" that does the hard work. It uses a tool called **Sitespeed.io**.
*   **What it does:** When you click "Run Test", this engine spins up a virtual web browser (like Chrome), visits your website, and records everything that happens. It measures things like "First Contentful Paint" (when the user first sees something) and "Speed Index" (how fast the page looks ready).

### 3. The Database (InfluxDB)
*   **What it is:** This is the "memory" of the tool.
*   **What it does:** It stores all the numbers and data from your tests. If you run a test today and another one tomorrow, this database keeps the records so you can compare them later.

### 4. The Visualizer (Grafana)
*   **What it is:** This is a tool for making beautiful charts and graphs.
*   **What it does:** It takes the data from the Database and turns it into trends. You can see if your website is getting faster or slower over time.
    *   You can access this separately at `http://localhost:3000`.

---

## 🚀 Getting Started

Follow these steps to get the tool running on your computer.

### Prerequisites (What you need first)
Before you begin, make sure you have these two programs installed on your computer:
1.  **Docker Desktop**: This is the platform that runs all the components. [Download Docker Desktop here](https://www.docker.com/products/docker-desktop/).
2.  **Git**: This helps you download this project. [Download Git here](https://git-scm.com/downloads).

### Installation (Setting it up)

1.  **Download the project**:
    Open your terminal (Command Prompt on Windows, Terminal on Mac/Linux) and run:
    ```bash
    git clone <repository-url>
    cd sitespeeddocker
    ```

2.  **Start the tool**:
    We have a magic script that sets everything up for you. Run this command:
    ```bash
    chmod +x start.sh
    ./start.sh
    ```
    *Note: The first time you run this, it might take a few minutes to download all the necessary parts.*

---

## 🎮 How to Use It

Once the installation finishes, you are ready to go!

1.  **Open the Dashboard**:
    Open your web browser (Chrome, Firefox, Safari) and go to:
    👉 **[http://localhost:8080](http://localhost:8080)**

2.  **Run a Test**:
    *   You will see a box asking for a **URL**.
    *   Type in the website you want to test (e.g., `https://www.google.com`).
    *   Click the **Run Test** button.
    *   Wait a moment! The tool is now visiting the site in the background.

3.  **View Results**:
    *   Once finished, you will see a summary of the test.
    *   You can click on the result to see a **Detailed Report**. This report shows you exactly what slowed down the page (e.g., "Images are too big", "Too many scripts").

4.  **Check Long-Term Trends (Optional)**:
    *   If you want to see graphs over time, go to:
    👉 **[http://localhost:3000](http://localhost:3000)**
    *   **Username**: `admin`
    *   **Password**: `admin123`

---

## ❓ Troubleshooting (Help, it's not working!)

*   **"I can't connect to localhost:8080"**:
    *   Make sure Docker is running. Look for the little whale icon in your taskbar.
    *   Check if the terminal where you ran `./start.sh` showed any errors.

*   **"The test failed"**:
    *   Check if the URL is correct. It must start with `http://` or `https://`.
    *   Some websites block automated tools. If one site fails, try a simple one like `https://example.com` to see if the tool is working.

*   **"How do I stop it?"**:
    *   Go back to the terminal where you started it.
    *   Press `Ctrl + C` on your keyboard.
    *   To completely clean up, you can run `docker compose down`.

---

**Happy Testing!** 🚀
