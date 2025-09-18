# Anime Style Serene Grassland

A serene and interactive 3D grassland scene with an anime/Ghibli-inspired art style, created with React and Three.js.

**[Live Demo](https://comfortable-whoever-839576.framer.app/home-4)**

---

## TL;DR (Explain Like I'm 5)

**What is it?**
Imagine a peaceful, interactive cartoon world you can explore right in your web browser. It's a 3D grassland with big, fluffy clouds, a calm pond, and stylized pine trees.

**What can you do?**
- **Explore:** You can look around the beautiful scenery. The camera gently floats around on its own.
- **Play a Game:** Click on the blue cube (or press Spacebar on a computer) to start a simple game. You can then run around and collect glowing orbs to get a high score.
- **Control the World:** The scene changes from a bright sunny day to a starry night, with beautiful sunrises and sunsets in between.

This project is a showcase of how to build a detailed and interactive 3D world for the web.

---

## Directory Tree Map

This project is structured as a single-file React application using Three.js for 3D rendering. All the logic is consolidated into `flat.tsx` for simplicity.

```
.
├── README.md              # You are here! Project explanation.
├── index.html             # The main HTML file that loads the app.
├── index.tsx              # The entry point that starts the React application.
├── flat.tsx               # The core of the application. This single file contains:
│   ├── The main React component (`ModelViewer`).
│   ├── All 3D scene setup (sky, lighting, ground).
│   ├── Procedural asset generation (grass, trees, clouds, water).
│   ├── The complete game logic (`Game` class).
│   └── UI and event handling for both spectator and game modes.
└── metadata.json          # Basic project metadata.
```
