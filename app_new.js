let cy;
let debounceTimer;
let currentScreenshotBase64 = null;

// Before deploying, create a Spotify Developer App and put its Client ID here
const SPOTIFY_CLIENT_ID = "03f085f9e7054e1abb2be9a2e89a8892"; // Using a placeholder, change to yours
let spotifyAccessToken = null;

// FIREBASE CONFIGURATION
// Replace this with your own Firebase project config!
const firebaseConfig = {
  apiKey: "AIzaSyBlxSvA3ugwuF0KrNJQBGKcC0fTNtHKpCw",
  authDomain: "spotify-mix-graph.firebaseapp.com",
  databaseURL: "https://spotify-mix-graph-default-rtdb.firebaseio.com",
  projectId: "spotify-mix-graph",
  storageBucket: "spotify-mix-graph.firebasestorage.app",
  messagingSenderId: "29028758846",
  appId: "1:29028758846:web:832280a8f2d4b04adee86f",
  measurementId: "G-9WECPTZT4W",
};
// Initialize Firebase
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  firebase.initializeApp(firebaseConfig);
}

document.addEventListener("DOMContentLoaded", async () => {
  // Wait for auth to complete BEFORE doing anything else
  await checkSpotifyAuth();

  // Instead of GitHub logic, we now just start empty and wait for Firebase Realtime DB.
  let graphData = { nodes: [], edges: [] };
  initGraph(graphData);

  setupEvents();
  setupAutocomplete("node1");
  setupAutocomplete("node2");

  if (typeof firebase !== "undefined" && firebase.apps.length > 0) {
    setupFirebase();
  } else {
    console.warn(
      "Firebase is not configured yet. Make sure to put your real config in app.js!",
    );
  }
});

function saveGraphToLocal() {
  if (!cy) return;
  const elements = cy.json().elements;
  const dataToSave = {
    nodes: elements.nodes || [],
    edges: elements.edges || [],
  };
  localStorage.setItem("spotify_mix_graph_data", JSON.stringify(dataToSave));
}

function initGraph(data) {
  cy = cytoscape({
    container: document.getElementById("graph-container"),
    elements: {
      nodes: data.nodes || [],
      edges: data.edges || [],
    },
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#282828",
          "background-image": "data(cover)",
          "background-fit": "cover",
          width: 60,
          height: 60,
          label: "data(name)",
          color: "#fff",
          "text-valign": "bottom",
          "text-margin-y": 8,
          "font-size": "12px",
          "text-outline-color": "#121212",
          "text-outline-width": 2,
          "border-width": 2,
          "border-color": "#1db954",
        },
      },
      {
        selector: "edge",
        style: {
          width: 4,
          "line-color": "#535353",
          "target-arrow-color": "#535353",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(hasScreenshot)",
          color: "#1db954",
          "font-size": "14px",
          "text-background-color": "#181818",
          "text-background-opacity": 1,
          "text-background-padding": "4px",
          "text-background-shape": "roundrectangle",
        },
      },
    ],
    layout: {
      name: "cose",
      padding: 50,
      animate: true,
      nodeRepulsion: 400000,
      idealEdgeLength: 150,
    },
  });

  cy.on("tap", "node", function (evt) {
    const d = evt.target.data();
    showDetails(`
            <img src="${d.cover}" alt="Cover" style="width:100%">
            <h3 style="margin:12px 0 4px">${d.name}</h3>
            <p>${d.artist}</p>
        `);
  });

  cy.on("tap", "edge", function (evt) {
    const edge = evt.target;
    const sourceData = cy.getElementById(edge.data("source")).data("name");
    const targetData = cy.getElementById(edge.data("target")).data("name");
    const sc = edge.data("screenshot");

    let html = `
            <h3>Transition</h3>
            <p>${sourceData}</p>
            <p style="text-align:center;color:#1db954;margin:-4px 0;">⬇</p>
            <p>${targetData}</p>
        `;

    if (sc) {
      html += `<img src="${sc}" alt="Transition Screenshot">`;
    }

    showDetails(html);
  });
}

function showDetails(htmlContent) {
  const p = document.getElementById("details-panel");
  p.style.display = "block";
  document.getElementById("details-content").innerHTML = htmlContent;
}

function setupEvents() {
  const fileInput = document.getElementById("screenshot-file");
  const fileLabel = document.getElementById("file-preview-name");

  fileLabel.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      fileLabel.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (evt) => {
        currentScreenshotBase64 = evt.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      fileLabel.textContent = "No file selected";
      currentScreenshotBase64 = null;
    }
  });

  const form = document.getElementById("add-transition-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const n1DataStr = document.getElementById("node1-data").value;
    const n2DataStr = document.getElementById("node2-data").value;

    if (!n1DataStr || !n2DataStr) {
      alert("Please select tracks from the search autocomplete.");
      return;
    }

    const n1 = JSON.parse(n1DataStr);
    const n2 = JSON.parse(n2DataStr);

    let node1Id = n1.id;
    let node2Id = n2.id;

    if (cy.getElementById(node1Id).empty()) {
      cy.add({
        group: "nodes",
        data: {
          id: node1Id,
          name: n1.name,
          artist: n1.artist,
          cover: n1.cover,
        },
      });
    }
    if (cy.getElementById(node2Id).empty()) {
      cy.add({
        group: "nodes",
        data: {
          id: node2Id,
          name: n2.name,
          artist: n2.artist,
          cover: n2.cover,
        },
      });
    }

    const edgeId = `${node1Id}-${node2Id}`;
    if (cy.getElementById(edgeId).empty()) {
      cy.add({
        group: "edges",
        data: {
          id: edgeId,
          source: node1Id,
          target: node2Id,
          screenshot: currentScreenshotBase64,
          hasScreenshot: currentScreenshotBase64 ? "📸" : "",
        },
      });

      cy.layout({
        name: "cose",
        animate: true,
        nodeRepulsion: 400000,
        idealEdgeLength: 150,
      }).run();

      // Auto-save to Firebase
      saveGraphToFirebase();

      // Reset form
      document.getElementById("node1-search").value = "";
      document.getElementById("node2-search").value = "";
      document.getElementById("node1-data").value = "";
      document.getElementById("node2-data").value = "";
      fileInput.value = "";
      fileLabel.textContent = "No file selected";
      currentScreenshotBase64 = null;
    } else {
      alert("This transition already exists!");
    }
  });
}

// ========================
// FIREBASE & DATA LOGIC
// ========================

function saveGraphToFirebase() {
  if (!cy || typeof firebase === "undefined" || firebase.apps.length === 0)
    return;
  const elements = cy.json().elements;
  const dataToSave = {
    nodes: elements.nodes || [],
    edges: elements.edges || [],
  };
  firebase
    .database()
    .ref("graph/data")
    .set(dataToSave)
    .catch((err) => {
      console.error("Save to Firebase failed:", err);
    });
}

function setupFirebase() {
  // 1. Listen for Live Data
  firebase
    .database()
    .ref("graph/data")
    .on("value", (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        cy.elements().remove();
        if (data.nodes)
          cy.add(data.nodes.map((n) => ({ group: "nodes", data: n.data })));
        if (data.edges)
          cy.add(data.edges.map((e) => ({ group: "edges", data: e.data })));
        cy.layout({
          name: "cose",
          animate: true,
          nodeRepulsion: 400000,
          idealEdgeLength: 150,
        }).run();
      }
    });

  // 2. Auth State UI
  const mainPanel = document.getElementById("main-panel");
  const loginForm = document.getElementById("login-form-container");
  const loggedInUi = document.getElementById("logged-in-container");

  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      if (
        spotifyAccessToken &&
        spotifyAccessToken !== "undefined" &&
        spotifyAccessToken !== "null"
      ) {
        mainPanel.style.display = "block";
      } else {
        mainPanel.style.display = "none";
      }
      loginForm.style.display = "none";
      loggedInUi.style.display = "block";
    } else {
      mainPanel.style.display = "none";
      loginForm.style.display = "block";
      loggedInUi.style.display = "none";
    }
  });

  // 3. Google Login
  document.getElementById("google-login-btn").addEventListener("click", () => {
    const errTxt = document.getElementById("auth-error");
    errTxt.style.display = "none";

    const provider = new firebase.auth.GoogleAuthProvider();
    firebase
      .auth()
      .signInWithPopup(provider)
      .catch((error) => {
        errTxt.innerText = error.message;
        errTxt.style.display = "block";
      });
