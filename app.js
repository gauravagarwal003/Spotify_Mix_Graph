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
  });

  // 4. Logout
  document.getElementById("fb-logout-btn").addEventListener("click", () => {
    firebase.auth().signOut();
  });
}

function setupAutocomplete(nodeId) {
  const searchInput = document.getElementById(`${nodeId}-search`);
  const resultsDiv = document.getElementById(`${nodeId}-results`);
  const hiddenData = document.getElementById(`${nodeId}-data`);

  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();

    if (query.length < 2) {
      resultsDiv.style.display = "none";
      return;
    }

    debounceTimer = setTimeout(async () => {
      // Check if token exists, fallback to localStorage if global var is empty
      const tokenToUse =
        spotifyAccessToken || localStorage.getItem("spotify_access_token");
      if (!tokenToUse || tokenToUse === "undefined" || tokenToUse === "null") {
        console.warn("No spotify token available.");
        return;
      }

      try {
        const response = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`,
          {
            headers: {
              Authorization: `Bearer ${tokenToUse}`,
            },
          },
        );

        if (response.status === 401) {
          // Token expired genuinely
          console.error("Spotify token expired, clearing token.");
          localStorage.removeItem("spotify_access_token");
          spotifyAccessToken = null;
          window.location.reload();
          return;
        } else if (!response.ok) {
          const errData = await response.json();
          console.error("Spotify API error:", errData);
          resultsDiv.innerHTML = `<div style="padding:10px; color:#f44336; font-size:12px;">Error: ${errData.error?.message || "Verify your Spotify Developer App settings (are you a whitelisted user?)."}</div>`;
          resultsDiv.style.display = "block";
          return;
        }

        const data = await response.json();
        const tracks = data.tracks?.items || [];

        resultsDiv.innerHTML = "";
        if (tracks.length === 0) {
          resultsDiv.innerHTML =
            '<div style="padding:10px; color:#b3b3b3; font-size:12px;">No results found</div>';
        } else {
          tracks.forEach((track) => {
            const div = document.createElement("div");
            div.className = "autocomplete-item";

            const coverUrl =
              track.album.images.length > 0
                ? track.album.images[track.album.images.length - 1].url
                : "";
            const artistName = track.artists.map((a) => a.name).join(", ");

            // Format duration
            const minutes = Math.floor(track.duration_ms / 60000);
            const seconds = ((track.duration_ms % 60000) / 1000).toFixed(0);
            const formattedDuration =
              minutes + ":" + (seconds < 10 ? "0" : "") + seconds;

            div.innerHTML = `
                            <img src="${coverUrl}" alt="Cover">
                            <div class="autocomplete-info">
                                <span class="autocomplete-name">${track.name}</span>
                                <span class="autocomplete-artist">${artistName}</span>
                            </div>
                            <div class="autocomplete-duration">${formattedDuration}</div>
                        `;
            div.addEventListener("click", () => {
              searchInput.value = `${track.name} - ${artistName}`;
              hiddenData.value = JSON.stringify({
                id: track.id,
                name: track.name,
                artist: artistName,
                cover:
                  track.album.images.length > 0
                    ? track.album.images[0].url
                    : "",
              });
              resultsDiv.style.display = "none";
            });
            resultsDiv.appendChild(div);
          });
        }
        resultsDiv.style.display = "block";
      } catch (err) {
        console.error(err);
      }
    }, 300);
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
      resultsDiv.style.display = "none";
    }
  });
}

async function checkSpotifyAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const redirectUri = window.location.href.split("?")[0].split("#")[0]; // Clean URI for redirect

  if (code) {
    // Exchange code for access token using PKCE
    const codeVerifier = localStorage.getItem("code_verifier");
    try {
      const tokenResponse = await fetch(
        "https://accounts.spotify.com/api/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: SPOTIFY_CLIENT_ID,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        },
      );
      const data = await tokenResponse.json();

      if (data.access_token) {
        localStorage.setItem("spotify_access_token", data.access_token);
        spotifyAccessToken = data.access_token;
      } else {
        console.error("Token exchange failed: ", data);
        alert(
          "Spotify Login Failed: " +
            (data.error_description || data.error || "Unknown error"),
        );
      }
      // Clear URL
      window.history.replaceState(null, null, window.location.pathname);
    } catch (e) {
      console.error("Error exchanging token", e);
    }
  } else {
    spotifyAccessToken = localStorage.getItem("spotify_access_token");
  }

  const authPanel = document.getElementById("spotify-auth");
  const mainPanel = document.getElementById("main-panel");
  const authBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("spotify-logout");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("spotify_access_token");
      window.location.reload();
    });
  }

  if (
    spotifyAccessToken &&
    spotifyAccessToken !== "undefined" &&
    spotifyAccessToken !== "null"
  ) {
    authPanel.style.display = "none";
    mainPanel.style.display = "block";
  } else {
    authPanel.style.display = "block";
    mainPanel.style.display = "none";

    authBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        // Generate PKCE codes
        const generateRandomString = (length) => {
          const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
          const values = crypto.getRandomValues(new Uint8Array(length));
          return values.reduce(
            (acc, x) => acc + possible[x % possible.length],
            "",
          );
        };

        const sha256 = async (plain) => {
          const encoder = new TextEncoder();
          const data = encoder.encode(plain);
          return window.crypto.subtle.digest("SHA-256", data);
        };

        const base64encode = (input) => {
          return btoa(String.fromCharCode(...new Uint8Array(input)))
            .replace(/=/g, "")
            .replace(/\+/g, "-")
            .replace(/\//g, "_");
        };

        const codeVerifier = generateRandomString(64);

        if (!window.crypto || !window.crypto.subtle) {
          alert(
            "Your browser is blocking secure crypto functions. Please ensure you are accessing via http://localhost:8000 and not a network IP, or use https.",
          );
          return;
        }

        const hashed = await sha256(codeVerifier);
        const codeChallenge = base64encode(hashed);

        localStorage.setItem("code_verifier", codeVerifier);

        const authUrl = new URL("https://accounts.spotify.com/authorize");
        const params = {
          response_type: "code",
          client_id: SPOTIFY_CLIENT_ID,
          scope: "user-read-private",
          code_challenge_method: "S256",
          code_challenge: codeChallenge,
          redirect_uri: redirectUri,
        };

        authUrl.search = new URLSearchParams(params).toString();
        window.location.href = authUrl.toString();
      } catch (err) {
        console.error("Login creation failed:", err);
        alert("Error during login setup: " + err.message);
      }
    });
  }
}
