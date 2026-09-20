let cy;
let debounceTimer;
let currentScreenshotBase64 = null;
const SONG_TRANSITION_TO_REMOVE = { from: "circus", to: "212" };
let isApplyingFirebaseSnapshot = false;
let activeGraphRef = null;
let activeGraphValueHandler = null;
let graphAccessState = "loading";

const MAX_SCREENSHOT_SIZE_BYTES = 2 * 1024 * 1024;

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

document.addEventListener("DOMContentLoaded", () => {
  if (typeof cytoscape === "undefined") {
    const graphContainer = document.getElementById("graph-container");
    if (graphContainer) {
      graphContainer.innerHTML =
        '<div style="padding:20px;color:#fff;background:#1b1b1b;border:1px solid #333;border-radius:8px;margin:20px;line-height:1.5;">Unable to load graph engine (Cytoscape). Please check your network, disable strict content blockers for this site, and refresh.</div>';
    }
    console.error("Cytoscape library failed to load.");
    return;
  }

  // Instead of GitHub logic, we now just start empty and wait for Firebase Realtime DB.
  let graphData = { nodes: [], edges: [] };
  initGraph(graphData);
  updateGraphEmptyState();
  bindGraphResizeHandlers();

  setupEvents();
  setupAutocomplete("node1");
  setupAutocomplete("node2");
  setupGraphSearch();
  setupGraphZoomControls();

  // NEW: Setup UI improvements
  setupTabNavigation();
  setupMobileViewControls();
  setupDropdownCloseOnClickOutside();
  updateShowDetailsForModal();
  setupInfoModalDismissHandlers();

  if (typeof firebase !== "undefined" && firebase.apps.length > 0) {
    setupFirebase();
  } else {
    setGraphAccessState("signedOut");
    console.warn(
      "Firebase is not configured yet. Make sure to put your real config in app.js!",
    );
  }
});

function requestGraphResize(shouldFit = false) {
  if (!cy) return;
  window.requestAnimationFrame(() => {
    if (!cy) return;
    cy.resize();
    if (shouldFit) {
      cy.fit(undefined, 20);
    }
  });
}

function setGraphAccessState(nextState) {
  graphAccessState = nextState;
  updateGraphEmptyState();
}

function updateGraphEmptyState() {
  const emptyState = document.getElementById("graph-empty-state");
  if (!emptyState || !cy) return;

  const hasGraph = cy.nodes().length > 0;
  document.body.classList.toggle("graph-is-empty", !hasGraph);
  emptyState.hidden = hasGraph;

  if (hasGraph) {
    emptyState.innerHTML = "";
    return;
  }

  const messages = {
    loading: {
      title: "Loading Graph",
      body: "Checking your account graph.",
    },
    signedOut: {
      title: "Private Graph Locked",
      body: "Sign in with Google to load your saved transitions.",
    },
    empty: {
      title: "No Transitions Yet",
      body: "Add a transition to start building your mix graph.",
    },
  };
  const message = messages[graphAccessState] || messages.empty;
  emptyState.innerHTML = `
    <h2>${escapeHtml(message.title)}</h2>
    <p>${escapeHtml(message.body)}</p>
  `;
}

function bindGraphResizeHandlers() {
  window.addEventListener("resize", () => requestGraphResize(false));
  window.addEventListener("orientationchange", () => {
    window.setTimeout(() => requestGraphResize(true), 120);
  });
}

function saveGraphToLocal() {
  if (!cy) return;
  const elements = cy.json().elements;
  const dataToSave = {
    nodes: elements.nodes || [],
    edges: elements.edges || [],
  };
  localStorage.setItem("spotify_mix_graph_data", JSON.stringify(dataToSave));
}

function normalizeSongText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toDurationSeconds(durationMs) {
  const raw = Number(durationMs);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw / 1000);
}

function buildCanonicalSongKey(trackLike) {
  const name = normalizeSongText(trackLike?.name);
  const artist = normalizeSongText(trackLike?.artist);
  const durationSeconds = toDurationSeconds(
    trackLike?.durationMs ?? trackLike?.duration_ms,
  );
  if (!name || !artist || !durationSeconds) return "";
  return `${name}|${artist}|${durationSeconds}`;
}

function getNodeCanonicalSongKey(nodeData) {
  return nodeData?.canonicalSongKey || buildCanonicalSongKey(nodeData);
}

function findExistingNodeIdForTrack(trackLike) {
  if (!cy) return trackLike?.id;
  if (trackLike?.id && !cy.getElementById(trackLike.id).empty()) {
    return trackLike.id;
  }

  const targetKey = buildCanonicalSongKey(trackLike);
  if (!targetKey) return trackLike?.id;

  let matchedNodeId = null;
  cy.nodes().forEach((node) => {
    if (matchedNodeId) return;
    if (getNodeCanonicalSongKey(node.data()) === targetKey) {
      matchedNodeId = node.id();
    }
  });

  return matchedNodeId || trackLike?.id;
}

function applyGraphQualityFixes() {
  if (!cy) return false;

  let changed = false;

  cy.nodes().forEach((node) => {
    const nodeData = node.data();
    const key = getNodeCanonicalSongKey(nodeData);
    if (key && nodeData.canonicalSongKey !== key) {
      node.data("canonicalSongKey", key);
      changed = true;
    }
    if (nodeData.durationMs == null && nodeData.duration_ms != null) {
      node.data("durationMs", nodeData.duration_ms);
      changed = true;
    }
  });

  cy.edges().forEach((edge) => {
    const sourceNode = cy.getElementById(edge.data("source"));
    const targetNode = cy.getElementById(edge.data("target"));
    if (!sourceNode.empty() && !targetNode.empty()) {
      const sourceName = normalizeSongText(sourceNode.data("name"));
      const targetName = normalizeSongText(targetNode.data("name"));
      if (
        sourceName === SONG_TRANSITION_TO_REMOVE.from &&
        targetName === SONG_TRANSITION_TO_REMOVE.to
      ) {
        edge.remove();
        changed = true;
        return;
      }
    }

  });

  cy.nodes().forEach((node) => {
    const nextCount = node.connectedEdges().length;
    if (node.data("connectionCount") !== nextCount) {
      node.data("connectionCount", nextCount);
      changed = true;
    }
  });

  return changed;
}

function getConnectionCountForTrack(trackLike) {
  if (!cy) return 0;

  const byId = trackLike?.id ? cy.getElementById(trackLike.id) : cy.collection();
  if (trackLike?.id && !byId.empty()) {
    return byId.connectedEdges().length;
  }

  const targetKey = buildCanonicalSongKey(trackLike);
  if (!targetKey) return 0;

  let maxConnections = 0;
  cy.nodes().forEach((node) => {
    if (getNodeCanonicalSongKey(node.data()) === targetKey) {
      maxConnections = Math.max(maxConnections, node.connectedEdges().length);
    }
  });
  return maxConnections;
}

function getGraphLayoutOptions(animate = true) {
  return {
    name: "cose",
    padding: 110,
    animate,
    animationDuration: animate ? 650 : 0,
    randomize: false,
    fit: true,
    nodeOverlap: 26,
    componentSpacing: 150,
    nestingFactor: 1.1,
    gravity: 0.42,
    numIter: 3600,
    initialTemp: 1200,
    coolingFactor: 0.985,
    minTemp: 0.6,
    nodeRepulsion: (node) => 520000 + node.connectedEdges().length * 85000,
    idealEdgeLength: (edge) => {
      const sourceConnections = edge.source().connectedEdges().length;
      const targetConnections = edge.target().connectedEdges().length;
      const maxConnections = Math.max(sourceConnections, targetConnections);
      return 190 + Math.min(150, maxConnections * 8);
    },
  };
}

function runGraphLayout(animate = true) {
  if (!cy) return;
  const layout = cy.layout(getGraphLayoutOptions(animate));
  layout.one("layoutstop", () => {
    requestGraphResize(false);
  });
  layout.run();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSafeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

function listConnectedSongNames(nodeCollection) {
  const uniqueNames = new Set();
  nodeCollection.forEach((node) => {
    const name = node.data("name");
    const artist = node.data("artist");
    if (!name) return;
    uniqueNames.add(artist ? `${name} - ${artist}` : name);
  });
  return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
}

function buildConnectionListHtml(items) {
  if (items.length === 0) {
    return '<li style="color:#b3b3b3;">None</li>';
  }
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function updateGraphSelectionControls(hasSelection) {
  const clearBtn = document.getElementById("graph-search-clear-btn");
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", !hasSelection);
  }
}

function clearGraphHighlight() {
  if (!cy) return;
  cy.elements().removeClass(
    "is-dimmed is-selected is-incoming is-outgoing is-neighbor-in is-neighbor-out",
  );
  updateGraphSelectionControls(false);
}

function clearSearchSidebarSelection() {
  const searchInput = document.getElementById("graph-search-input");
  const detailsPanel = document.getElementById("details-panel");
  const detailsContent = document.getElementById("details-content");

  if (searchInput) {
    searchInput.value = "";
  }
  if (detailsPanel) {
    detailsPanel.style.display = "none";
  }
  if (detailsContent) {
    detailsContent.innerHTML = "";
  }
  updateGraphSelectionControls(false);
}

function isEditorSignedIn() {
  return Boolean(
    typeof firebase !== "undefined" &&
      firebase.apps.length > 0 &&
      firebase.auth().currentUser,
  );
}

function deleteTransition(edgeId) {
  if (!cy || !edgeId) return;
  const edge = cy.getElementById(edgeId);
  if (edge.empty()) {
    alert("Transition no longer exists.");
    return;
  }

  const sourceNode = edge.source();
  const targetNode = edge.target();
  const sourceName = sourceNode.data("name") || "Unknown";
  const targetName = targetNode.data("name") || "Unknown";

  const confirmed = window.confirm(
    `Delete transition: ${sourceName} -> ${targetName}?`,
  );
  if (!confirmed) return;

  edge.remove();

  // Remove orphan nodes so graph quality remains clean after deletions.
  [sourceNode, targetNode].forEach((node) => {
    if (!node.empty() && node.connectedEdges().length === 0) {
      node.remove();
    }
  });

  applyGraphQualityFixes();
  setGraphAccessState(cy.nodes().length > 0 ? "loaded" : "empty");
  runGraphLayout(true);
  saveGraphToFirebase();
  showDetails('<p style="color:#b3b3b3;">Transition deleted.</p>');
}

function highlightNodeConnections(node) {
  if (!cy || !node || node.empty()) return;

  clearGraphHighlight();

  const incomingEdges = node.incomers("edge");
  const outgoingEdges = node.outgoers("edge");
  const incomingNodes = incomingEdges.sources();
  const outgoingNodes = outgoingEdges.targets();

  cy.elements().addClass("is-dimmed");

  node.removeClass("is-dimmed").addClass("is-selected");
  incomingEdges.removeClass("is-dimmed").addClass("is-incoming");
  outgoingEdges.removeClass("is-dimmed").addClass("is-outgoing");
  incomingNodes.removeClass("is-dimmed").addClass("is-neighbor-in");
  outgoingNodes.removeClass("is-dimmed").addClass("is-neighbor-out");
  updateGraphSelectionControls(true);
}

function showNodeDetails(node) {
  if (!node || node.empty()) return;
  const d = node.data();
  const incomingNodes = buildNodeListFromCollection(node.incomers("edge").sources());
  const outgoingNodes = buildNodeListFromCollection(node.outgoers("edge").targets());

  showDetails(`
      <img src="${escapeHtml(d.cover)}" alt="Cover" style="width:100%; border-radius: 10px;">
      <h3 style="margin:12px 0 4px">${escapeHtml(d.name)}</h3>
      <p>${escapeHtml(d.artist)}</p>
      <p style="margin-top:8px;"><strong>${incomingNodes.length}</strong> incoming, <strong>${outgoingNodes.length}</strong> outgoing</p>
      <p style="margin-top:10px;"><strong>Incoming From</strong></p>
      <ul>${buildRelatedSongListHtml(incomingNodes)}</ul>
      <p style="margin-top:10px;"><strong>Outgoing To</strong></p>
      <ul>${buildRelatedSongListHtml(outgoingNodes)}</ul>
    `);
}

function focusNodeAndNeighborhood(node, zoomPadding = 90) {
  if (!cy || !node || node.empty()) return;
  const neighborhood = node.closedNeighborhood();
  cy.animate(
    {
      fit: { eles: neighborhood, padding: zoomPadding },
    },
    {
      duration: 420,
      easing: "ease-out-cubic",
    },
  );
}

function zoomGraphBy(factor) {
  if (!cy) return;
  const nextZoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor));
  cy.animate(
    {
      zoom: {
        level: nextZoom,
        renderedPosition: {
          x: cy.width() / 2,
          y: cy.height() / 2,
        },
      },
    },
    {
      duration: 160,
      easing: "ease-out-cubic",
    },
  );
}

function setupGraphZoomControls() {
  const zoomInBtn = document.getElementById("graph-zoom-in");
  const zoomOutBtn = document.getElementById("graph-zoom-out");

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => zoomGraphBy(1.22));
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => zoomGraphBy(1 / 1.22));
  }
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
          "background-color": "#fff7e8",
          "background-image": "data(cover)",
          "background-fit": "cover",
          width: "mapData(connectionCount, 0, 12, 58, 84)",
          height: "mapData(connectionCount, 0, 12, 58, 84)",
          label: "data(name)",
          color: "#fff7e8",
          "text-valign": "bottom",
          "text-margin-y": 10,
          "text-max-width": "140px",
          "text-wrap": "wrap",
          "font-size": "12px",
          "font-family": "IBM Plex Sans",
          "font-weight": 700,
          "text-outline-color": "#10151a",
          "text-outline-width": 3,
          "border-width": "mapData(connectionCount, 0, 12, 2, 5)",
          "border-color": "#fff7e8",
          "overlay-padding": "6px",
          opacity: 0.97,
        },
      },
      {
        selector: "edge",
        style: {
          width: 5,
          "line-color": "#c57b4a",
          "target-arrow-color": "#2ed760",
          "target-arrow-shape": "triangle",
          "arrow-scale": 1.8,
          "curve-style": "bezier",
          "control-point-step-size": 28,
          "source-distance-from-node": 8,
          "target-distance-from-node": 6,
          label: "data(hasScreenshot)",
          color: "#ffc844",
          "font-size": "13px",
          "font-family": "IBM Plex Sans",
          "font-weight": 700,
          "text-background-color": "#10151a",
          "text-background-opacity": 0.9,
          "text-background-padding": "4px",
          "text-background-shape": "roundrectangle",
          "text-rotation": "autorotate",
          "text-margin-y": -10,
          opacity: 0.82,
        },
      },
      {
        selector: ".is-dimmed",
        style: {
          opacity: 0.12,
          "text-opacity": 0.12,
        },
      },
      {
        selector: "node.is-selected",
        style: {
          "border-color": "#2ed760",
          "border-width": 6,
          "z-index": 999,
          opacity: 1,
        },
      },
      {
        selector: "node.is-neighbor-in",
        style: {
          "border-color": "#49a7ff",
          "border-width": 5,
          opacity: 1,
        },
      },
      {
        selector: "node.is-neighbor-out",
        style: {
          "border-color": "#ffc844",
          "border-width": 5,
          opacity: 1,
        },
      },
      {
        selector: "edge.is-incoming",
        style: {
          "line-color": "#49a7ff",
          "target-arrow-color": "#49a7ff",
          width: 7,
          opacity: 0.98,
        },
      },
      {
        selector: "edge.is-outgoing",
        style: {
          "line-color": "#ffc844",
          "target-arrow-color": "#ffc844",
          width: 7,
          opacity: 0.98,
        },
      },
    ],
    layout: getGraphLayoutOptions(true),
    minZoom: 0.15,
    maxZoom: 2.5,
  });

  cy.on("tap", "node", function (evt) {
    const node = evt.target;
    highlightNodeConnections(node);
    showNodeDetails(node);
  });

  cy.on("tap", "edge", function (evt) {
    const edge = evt.target;
    const sourceData = escapeHtml(
      cy.getElementById(edge.data("source")).data("name") || "Unknown",
    );
    const targetData = escapeHtml(
      cy.getElementById(edge.data("target")).data("name") || "Unknown",
    );
    const sc = edge.data("screenshot");
    const edgeId = escapeHtml(edge.id());
    const canDelete = isEditorSignedIn();

    let html = `
            <h3>Transition</h3>
            <p>${sourceData}</p>
            <p style="text-align:center;color:#1db954;margin:-4px 0;">⬇</p>
            <p>${targetData}</p>
        `;

    if (sc) {
      html += `<img src="${escapeHtml(sc)}" alt="Transition Screenshot">`;
    }

    if (canDelete) {
      html += `<button type="button" class="btn-danger-subtle" data-delete-edge-id="${edgeId}">Delete This Transition</button>`;
    } else {
      html += `<p style="font-size:0.8rem;color:#b3b3b3;margin-top:10px;">Sign in with Google to delete transitions.</p>`;
    }

    showDetails(html);
  });

  cy.on("tap", (evt) => {
    if (evt.target === cy) {
      clearGraphHighlight();
      clearSearchSidebarSelection();
    }
  });

  cy.one("layoutstop", () => {
    requestGraphResize(false);
  });

  requestGraphResize(true);
}

function showDetails(htmlContent) {
  const p = document.getElementById("details-panel");
  if (!p) return;
  p.style.display = "block";
  const detailsContent = document.getElementById("details-content");
  if (detailsContent) {
    detailsContent.innerHTML = htmlContent;
  }
}

function setupEvents() {
  const fileInput = document.getElementById("screenshot-file");
  const fileLabel = document.getElementById("file-preview-name");
  const detailsContent = document.getElementById("details-content");

  fileLabel.addEventListener("click", () => fileInput.click());

  if (detailsContent) {
    detailsContent.addEventListener("click", (event) => {
      const relatedButton = event.target.closest("[data-related-node-id]");
      if (relatedButton && cy) {
        const nodeId = relatedButton.getAttribute("data-related-node-id");
        const nextNode = cy.getElementById(nodeId);
        if (!nextNode.empty()) {
          openSongInSearchTab(nextNode);
        }
        return;
      }

      const deleteButton = event.target.closest("[data-delete-edge-id]");
      if (!deleteButton) return;

      if (!isEditorSignedIn()) {
        alert("Please sign in with Google to edit the graph.");
        return;
      }

      const edgeId = deleteButton.getAttribute("data-delete-edge-id");
      deleteTransition(edgeId);
    });
  }

  const DEFAULT_SCREENSHOT_LABEL = "Screenshot (Opt)";

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith("image/") || file.size > MAX_SCREENSHOT_SIZE_BYTES) {
        fileInput.value = "";
        fileLabel.textContent = DEFAULT_SCREENSHOT_LABEL;
        currentScreenshotBase64 = null;
        alert("Choose an image smaller than 2 MB.");
        return;
      }
      fileLabel.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (evt) => {
        currentScreenshotBase64 = evt.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      fileLabel.textContent = DEFAULT_SCREENSHOT_LABEL;
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

    let n1;
    let n2;
    try {
      n1 = JSON.parse(n1DataStr);
      n2 = JSON.parse(n2DataStr);
    } catch (error) {
      console.error("Invalid selected track data:", error);
      alert("Please select both tracks again.");
      return;
    }

    if (!n1?.id || !n1?.name || !n2?.id || !n2?.name) {
      alert("Please select valid tracks from the search autocomplete.");
      return;
    }

    let node1Id = findExistingNodeIdForTrack(n1);
    let node2Id = findExistingNodeIdForTrack(n2);

    if (cy.getElementById(node1Id).empty()) {
      cy.add({
        group: "nodes",
        data: {
          id: node1Id,
          name: n1.name,
          artist: n1.artist,
          cover: n1.cover,
          durationMs: n1.durationMs || null,
          canonicalSongKey: buildCanonicalSongKey(n1),
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
          durationMs: n2.durationMs || null,
          canonicalSongKey: buildCanonicalSongKey(n2),
        },
      });
    }

    const node1 = cy.getElementById(node1Id);
    const node2 = cy.getElementById(node2Id);
    if (!node1.empty()) {
      node1.data("canonicalSongKey", getNodeCanonicalSongKey(node1.data()));
      if (node1.data("durationMs") == null && n1.durationMs) {
        node1.data("durationMs", n1.durationMs);
      }
    }
    if (!node2.empty()) {
      node2.data("canonicalSongKey", getNodeCanonicalSongKey(node2.data()));
      if (node2.data("durationMs") == null && n2.durationMs) {
        node2.data("durationMs", n2.durationMs);
      }
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

      applyGraphQualityFixes();
      setGraphAccessState("loaded");

      runGraphLayout(true);

      // Auto-save to Firebase
      saveGraphToFirebase();

      // Reset form
      document.getElementById("node1-search").value = "";
      document.getElementById("node2-search").value = "";
      document.getElementById("node1-data").value = "";
      document.getElementById("node2-data").value = "";
      fileInput.value = "";
      fileLabel.textContent = DEFAULT_SCREENSHOT_LABEL;
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
  if (isApplyingFirebaseSnapshot) return;
  const user = firebase.auth().currentUser;
  if (!user) return;

  const elements = cy.json().elements;
  const dataToSave = {
    nodes: elements.nodes || [],
    edges: elements.edges || [],
  };

  const userGraphPath = `graphs/${user.uid}/data`;
  firebase
    .database()
    .ref(userGraphPath)
    .set(dataToSave)
    .catch((err) => {
      console.error("Save to Firebase failed:", err);
    });
}

function setupFirebase() {
  const clearGraph = () => {
    if (!cy) return;
    cy.elements().remove();
    setGraphAccessState("signedOut");
    requestGraphResize(false);
  };

  const detachGraphListener = () => {
    if (!activeGraphRef || !activeGraphValueHandler) return;
    activeGraphRef.off("value", activeGraphValueHandler);
    activeGraphRef = null;
    activeGraphValueHandler = null;
  };

  const attachGraphListenerForUser = (user) => {
    if (!user) {
      clearGraph();
      return;
    }

    setGraphAccessState("loading");
    const userGraphPath = `graphs/${user.uid}/data`;
    activeGraphRef = firebase.database().ref(userGraphPath);

    activeGraphValueHandler = (snapshot) => {
      isApplyingFirebaseSnapshot = true;
      cy.elements().remove();

      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.nodes) {
          cy.add(data.nodes.map((n) => ({ group: "nodes", data: n.data })));
        }
        if (data.edges) {
          cy.add(data.edges.map((e) => ({ group: "edges", data: e.data })));
        }

        const graphWasFixed = applyGraphQualityFixes();
        setGraphAccessState(cy.nodes().length > 0 ? "loaded" : "empty");
        runGraphLayout(false);
        isApplyingFirebaseSnapshot = false;

        if (graphWasFixed) {
          saveGraphToFirebase();
        }
        return;
      }

      isApplyingFirebaseSnapshot = false;
      setGraphAccessState("empty");
      requestGraphResize(false);
    };

    activeGraphRef.on("value", activeGraphValueHandler);
  };

  // 2. Auth State UI
  const mainPanel = document.getElementById("main-panel");
  const loginForm = document.getElementById("login-form-container");
  const loggedInUi = document.getElementById("logged-in-container");
  const dangerToggleBtn = document.getElementById("danger-toggle-btn");
  const dangerZoneContent = document.getElementById("danger-zone-content");
  const resetConfirmInput = document.getElementById("reset-confirm-input");
  const resetGraphBtn = document.getElementById("reset-graph-btn");

  if (dangerToggleBtn && dangerZoneContent) {
    dangerToggleBtn.addEventListener("click", () => {
      const willShow = dangerZoneContent.style.display === "none";
      dangerZoneContent.style.display = willShow ? "block" : "none";
    });
  }

  if (resetConfirmInput && resetGraphBtn) {
    resetConfirmInput.addEventListener("input", () => {
      const isReady = resetConfirmInput.value.trim().toUpperCase() === "RESET";
      resetGraphBtn.disabled = !isReady;
    });
  }

  firebase.auth().onAuthStateChanged((user) => {
    detachGraphListener();

    if (user) {
        mainPanel.style.display = "block";
      loginForm.style.display = "none";
      loggedInUi.style.display = "block";
      attachGraphListenerForUser(user);
      if (getActiveTabName() === "account") {
        switchToTab("add");
      }
    } else {
      mainPanel.style.display = "none";
      loginForm.style.display = "block";
      loggedInUi.style.display = "none";
      clearGraph();
      switchToTab("account");
    }

    if (resetConfirmInput) {
      resetConfirmInput.value = "";
    }
    if (resetGraphBtn) {
      resetGraphBtn.disabled = true;
    }
    if (dangerZoneContent) {
      dangerZoneContent.style.display = "none";
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
        console.error("Google sign-in failed:", error);
        errTxt.innerText = error.code
          ? `${error.code}: ${error.message}`
          : error.message;
        errTxt.style.display = "block";
      });
  });

  // 4. Logout
  document.getElementById("fb-logout-btn").addEventListener("click", () => {
    firebase.auth().signOut();
  });

  // 5. Reset Graph
  document.getElementById("reset-graph-btn").addEventListener("click", () => {
    const user = firebase.auth().currentUser;
    if (!user) {
      alert("Please sign in first.");
      return;
    }

    const typed = document
      .getElementById("reset-confirm-input")
      .value.trim()
      .toUpperCase();
    if (typed !== "RESET") {
      alert("Type RESET in Advanced Data Controls first.");
      return;
    }

    const confirmed = window.confirm(
      "Final warning: this permanently deletes your cloud graph for this account. Continue?",
    );
    if (!confirmed) return;

    const userGraphPath = `graphs/${user.uid}/data`;
    firebase
      .database()
      .ref(userGraphPath)
      .remove()
      .then(() => {
        const confirmInput = document.getElementById("reset-confirm-input");
        const button = document.getElementById("reset-graph-btn");
        if (confirmInput) confirmInput.value = "";
        if (button) button.disabled = true;
      })
      .catch((err) => {
        console.error("Reset graph failed:", err);
        alert("Could not reset graph. Please try again.");
      });
  });
}

function setupSpotifyAutocompleteLegacy(nodeId) {
  const searchInput = document.getElementById(`${nodeId}-search`);
  const resultsDiv = document.getElementById(`${nodeId}-results`);
  const hiddenData = document.getElementById(`${nodeId}-data`);
  const SPOTIFY_SEARCH_LIMIT = 10;

  let localDebounceTimer = null;
  let currentFetchQuery = "";

  const renderTracks = (tracks) => {
    resultsDiv.innerHTML = "";

    if (tracks.length === 0) {
      resultsDiv.innerHTML =
        '<div style="padding:10px; color:#b3b3b3; font-size:12px;">No results found</div>';
      resultsDiv.style.display = "block";
      return;
    }

    tracks.forEach((track) => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";

      const coverUrl = getSafeImageUrl(
        track.album && track.album.images && track.album.images.length > 0
          ? track.album.images[track.album.images.length - 1].url
          : "",
      );

      const artistName = track.artists
        ? track.artists.map((a) => a.name).join(", ")
        : "Unknown Artist";

      const minutes = Math.floor(track.duration_ms / 60000);
      const seconds = ((track.duration_ms % 60000) / 1000).toFixed(0);
      const formattedDuration =
        minutes + ":" + (seconds < 10 ? "0" : "") + seconds;

      const connectionCount = getConnectionCountForTrack({
        id: track.id,
        name: track.name,
        artist: artistName,
        durationMs: track.duration_ms,
      });

      div.innerHTML = `
                <img src="${escapeHtml(coverUrl)}" alt="Cover">
                        <div class="autocomplete-info">
                  <span class="autocomplete-name">${escapeHtml(track.name)}</span>
                  <span class="autocomplete-artist">${escapeHtml(artistName)}</span>
                  <span class="autocomplete-meta">${escapeHtml(formattedDuration)} • ${connectionCount} connection${connectionCount === 1 ? "" : "s"}</span>
                        </div>
                    `;

      div.addEventListener("click", () => {
        searchInput.value = `${track.name} - ${artistName}`;
        hiddenData.value = JSON.stringify({
          id: track.id,
          name: track.name,
          artist: artistName,
          cover:
            track.album && track.album.images && track.album.images.length > 0
              ? track.album.images[0].url
              : "",
          durationMs: track.duration_ms,
          canonicalSongKey: buildCanonicalSongKey({
            name: track.name,
            artist: artistName,
            durationMs: track.duration_ms,
          }),
        });
        resultsDiv.style.display = "none";
      });
      resultsDiv.appendChild(div);
    });

    resultsDiv.style.display = "block";
  };

  searchInput.addEventListener("input", (e) => {
    if (localDebounceTimer) clearTimeout(localDebounceTimer);
    const query = e.target.value.trim();

    if (query.length < 2) {
      resultsDiv.style.display = "none";
      return;
    }

    localDebounceTimer = setTimeout(async () => {
      currentFetchQuery = query;

      const tokenToUse =
        spotifyAccessToken || sessionStorage.getItem(SPOTIFY_TOKEN_STORAGE_KEY);
      if (!tokenToUse || tokenToUse === "undefined" || tokenToUse === "null") {
        console.warn("No spotify token available.");
        return;
      }

      try {
        const makeSearchUrl = (q, includeLimit = true) => {
          const url = new URL("https://api.spotify.com/v1/search");
          url.searchParams.set("type", "track");
          url.searchParams.set("q", q);
          if (includeLimit) {
            const safeLimit = Math.max(
              1,
              Math.min(50, Number.parseInt(SPOTIFY_SEARCH_LIMIT, 10) || 15),
            );
            url.searchParams.set("limit", String(safeLimit));
          }
          return url.toString();
        };

        const fetchSpotifySearch = (includeLimit = true) =>
          fetch(makeSearchUrl(query, includeLimit), {
            headers: {
              Authorization: `Bearer ${tokenToUse}`,
            },
          });

        let response = await fetchSpotifySearch(true);

        if (currentFetchQuery !== query) return;

        if (response.status === 401) {
          console.error("Spotify token expired, clearing token.");
          sessionStorage.removeItem(SPOTIFY_TOKEN_STORAGE_KEY);
          spotifyAccessToken = null;
          window.location.reload();
          return;
        } else if (response.status === 429) {
          resultsDiv.innerHTML = `<div style="padding:10px; color:#f44336; font-size:12px;">Too many requests. Please slow down your typing.</div>`;
          resultsDiv.style.display = "block";
          return;
        } else if (!response.ok) {
          let errMessage = "Verify your Spotify Developer App settings.";
          let errData = null;
          try {
            errData = await response.json();
            if (errData && errData.error && errData.error.message) {
              errMessage = errData.error.message;
            }
          } catch (e) {}

          // Retry once without the limit parameter for intermittent API validation issues.
          if (errMessage === "Invalid limit") {
            response = await fetchSpotifySearch(false);
            if (response.ok) {
              const data = await response.json();
              if (currentFetchQuery !== query) return;

              const tracks =
                data.tracks && data.tracks.items ? data.tracks.items : [];
              renderTracks(tracks);
              return;
            }

            try {
              errData = await response.json();
              if (errData && errData.error && errData.error.message) {
                errMessage = errData.error.message;
              }
            } catch (e) {}
          }

          console.error("Spotify API error:", errMessage);
          resultsDiv.innerHTML = `<div style="padding:10px; color:#f44336; font-size:12px;">Error: ${escapeHtml(errMessage)}</div>`;
          resultsDiv.style.display = "block";
          return;
        }

        const data = await response.json();
        if (currentFetchQuery !== query) return;

        const tracks =
          data.tracks && data.tracks.items ? data.tracks.items : [];
        renderTracks(tracks);
        
        // Verify Spotify token works and show status
        const statusSpan = document.getElementById('spotify-status');
        if (statusSpan) {
          statusSpan.style.display = 'inline';
        }
      } catch (err) {
        console.error(err);
      }
    }, 450);
  });
}

function setupAutocomplete(nodeId) {
  const searchInput = document.getElementById(`${nodeId}-search`);
  const resultsDiv = document.getElementById(`${nodeId}-results`);
  const hiddenData = document.getElementById(`${nodeId}-data`);
  const SPOTIFY_SEARCH_LIMIT = 10;

  let localDebounceTimer = null;
  let currentFetchQuery = "";

  const renderTracks = (tracks) => {
    resultsDiv.innerHTML = "";

    if (tracks.length === 0) {
      resultsDiv.innerHTML =
        '<div style="padding:10px; color:#b3b3b3; font-size:12px;">No results found</div>';
      resultsDiv.style.display = "block";
      return;
    }

    tracks.forEach((track) => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";

      const coverUrl = getSafeImageUrl(track.cover);
      const artistName = track.artist || "Unknown Artist";
      const durationMs = Number(track.durationMs) || 0;
      const minutes = Math.floor(durationMs / 60000);
      const seconds = String(Math.floor((durationMs % 60000) / 1000)).padStart(2, "0");
      const formattedDuration = `${minutes}:${seconds}`;
      const trackId = track.id;
      const connectionCount = getConnectionCountForTrack({
        id: trackId,
        name: track.name,
        artist: artistName,
        durationMs,
      });

      div.innerHTML = `
        <img src="${escapeHtml(coverUrl)}" alt="Cover">
        <div class="autocomplete-info">
          <span class="autocomplete-name">${escapeHtml(track.name)}</span>
          <span class="autocomplete-artist">${escapeHtml(artistName)}</span>
          <span class="autocomplete-meta">${escapeHtml(formattedDuration)} • ${connectionCount} connection${connectionCount === 1 ? "" : "s"}</span>
        </div>
      `;

      div.addEventListener("click", () => {
        const selectedTrack = {
          id: trackId,
          name: track.name,
          artist: artistName,
          cover: coverUrl,
          durationMs,
          canonicalSongKey: buildCanonicalSongKey({
            name: track.name,
            artist: artistName,
            durationMs,
          }),
        };
        searchInput.value = `${track.name} - ${artistName}`;
        hiddenData.value = JSON.stringify(selectedTrack);
        resultsDiv.style.display = "none";
      });
      resultsDiv.appendChild(div);
    });

    resultsDiv.style.display = "block";
  };

  searchInput.addEventListener("input", (event) => {
    if (localDebounceTimer) clearTimeout(localDebounceTimer);
    const query = event.target.value.trim();

    if (query.length < 2) {
      resultsDiv.style.display = "none";
      return;
    }

    localDebounceTimer = setTimeout(async () => {
      currentFetchQuery = query;
      const url = new URL("/api/spotify-search", window.location.origin);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", String(SPOTIFY_SEARCH_LIMIT));

      try {
        const response = await fetch(url);
        if (currentFetchQuery !== query) return;
        if (!response.ok) {
          throw new Error(`Spotify search failed (${response.status})`);
        }

        const data = await response.json();
        if (currentFetchQuery !== query) return;
        renderTracks(Array.isArray(data.results) ? data.results : []);
      } catch (error) {
        console.error("Spotify search error:", error);
        resultsDiv.innerHTML =
          '<div style="padding:10px; color:#f44336; font-size:12px;">Search is temporarily unavailable.</div>';
        resultsDiv.style.display = "block";
      }
    }, 350);
  });
}

function setupGraphSearch() {
  const searchInput = document.getElementById("graph-search-input");
  const resultsDiv = document.getElementById("graph-search-results");
  const clearBtn = document.getElementById("graph-search-clear-btn");

  if (!searchInput || !resultsDiv || !clearBtn) return;

  const hideResults = () => {
    resultsDiv.style.display = "none";
  };

  const getNodeSearchText = (node) => {
    const data = node.data();
    return normalizeSongText(`${data.name || ""} ${data.artist || ""}`);
  };

  const renderSearchResults = (matches) => {
    resultsDiv.innerHTML = "";

    if (matches.length === 0) {
      resultsDiv.innerHTML =
        '<div style="padding:10px; color:#b3b3b3; font-size:12px;">No graph matches</div>';
      resultsDiv.style.display = "block";
      return;
    }

    matches.forEach((node) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";

      const incomingCount = node.incomers("edge").length;
      const outgoingCount = node.outgoers("edge").length;
      const totalCount = node.connectedEdges().length;

      item.innerHTML = `
        <img src="${escapeHtml(node.data("cover"))}" alt="Cover">
        <div class="graph-search-result">
          <span class="graph-search-result-name">${escapeHtml(node.data("name"))}</span>
          <span class="graph-search-result-meta">${escapeHtml(node.data("artist"))}</span>
          <span class="graph-search-result-meta">${totalCount} total • ${incomingCount} in • ${outgoingCount} out</span>
        </div>
      `;

      item.addEventListener("click", () => {
        const data = node.data();
        searchInput.value = `${data.name} - ${data.artist}`;
        highlightNodeConnections(node);
        showNodeDetails(node);
        focusNodeAndNeighborhood(node, 110);
        hideResults();
      });

      resultsDiv.appendChild(item);
    });

    resultsDiv.style.display = "block";
  };

  searchInput.addEventListener("input", (event) => {
    const rawQuery = event.target.value || "";
    const query = normalizeSongText(rawQuery);

    if (!query || !cy) {
      hideResults();
      return;
    }

    const matches = cy
      .nodes()
      .toArray()
      .filter((node) => getNodeSearchText(node).includes(query))
      .sort((a, b) => {
        const aCount = a.connectedEdges().length;
        const bCount = b.connectedEdges().length;
        if (aCount !== bCount) return bCount - aCount;
        return String(a.data("name") || "").localeCompare(String(b.data("name") || ""));
      })
      .slice(0, 15);

    renderSearchResults(matches);
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideResults();
      return;
    }

    if (event.key === "Enter") {
      const firstResult = resultsDiv.querySelector(".autocomplete-item");
      if (firstResult) {
        event.preventDefault();
        firstResult.click();
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (!resultsDiv.contains(event.target) && event.target !== searchInput) {
      hideResults();
    }
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    hideResults();
    clearGraphHighlight();
    const detailsPanel = document.getElementById("details-panel");
    const detailsContent = document.getElementById("details-content");
    if (detailsPanel) {
      detailsPanel.style.display = "none";
    }
    if (detailsContent) {
      detailsContent.innerHTML = "";
    }
    updateGraphSelectionControls(false);
    requestGraphResize(false);
  });
}

// ==========================================
// TAB SWITCHING AND UI IMPROVEMENTS
// ==========================================

function isMobileViewport() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function updateResponsiveTabLabels() {
  const isMobile = isMobileViewport();
  const navBtns = document.querySelectorAll('.nav-btn[data-full][data-short]');

  navBtns.forEach((btn) => {
    const nextLabel = isMobile
      ? btn.getAttribute('data-short')
      : btn.getAttribute('data-full');
    if (nextLabel) {
      btn.textContent = nextLabel;
    }
  });

  const graphToggleBtn = document.getElementById('mobile-graph-toggle');
  if (graphToggleBtn) {
    graphToggleBtn.textContent = isMobile ? 'Graph' : 'View Graph';
  }
}

function setupMobileCardCollapse() {
  document.querySelectorAll('.panel-collapse-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = btn.closest('.panel');
      if (panel) {
        panel.classList.toggle('is-collapsed');
        requestGraphResize(false);
      }
    });
  });

  // Tapping anywhere on a collapsed card header restores it
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.addEventListener('click', (e) => {
      if (panel.classList.contains('is-collapsed') && !e.target.closest('button, input, a')) {
        panel.classList.remove('is-collapsed');
        requestGraphResize(false);
      }
    });
  });

  // Switching tabs automatically restores panel to open
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.panel.is-collapsed').forEach((p) => {
        p.classList.remove('is-collapsed');
      });
      requestGraphResize(false);
    });
  });
}

function setGraphFocusMode(enabled) {
  const shouldEnable = Boolean(enabled) && isMobileViewport();
  document.body.classList.toggle('mobile-graph-only', shouldEnable);

  const graphToggleBtn = document.getElementById('mobile-graph-toggle');
  if (graphToggleBtn) {
    graphToggleBtn.setAttribute('aria-pressed', shouldEnable ? 'true' : 'false');
  }

  requestGraphResize(true);
}

function setupMobileViewControls() {
  const graphToggleBtn = document.getElementById('mobile-graph-toggle');
  const graphExitBtn = document.getElementById('mobile-graph-exit');

  updateResponsiveTabLabels();
  setupMobileCardCollapse();

  if (graphToggleBtn) {
    graphToggleBtn.addEventListener('click', () => {
      if (cy && cy.nodes().length === 0 && !isEditorSignedIn()) {
        setGraphFocusMode(false);
        switchToTab("account");
        return;
      }
      setGraphFocusMode(true);
    });
  }

  if (graphExitBtn) {
    graphExitBtn.addEventListener('click', () => {
      setGraphFocusMode(false);
    });
  }

  window.addEventListener('resize', () => {
    updateResponsiveTabLabels();
    if (!isMobileViewport() && document.body.classList.contains('mobile-graph-only')) {
      setGraphFocusMode(false);
    }
  });
}

function setupTabNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = btn.getAttribute('data-tab');
      
      // Remove active class from all buttons
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Hide all tab contents
      tabContents.forEach(tab => tab.classList.remove('active'));
      
      // Show selected tab
      const activeTab = document.querySelector(`.tab-content[data-tab="${tabName}"]`);
      if (activeTab) {
        activeTab.classList.add('active');
      }
    });
  });
}

function switchToTab(tabName) {
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });

  tabContents.forEach((tab) => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
  });
}

function getActiveTabName() {
  const activeTab = document.querySelector('.tab-content.active');
  return activeTab ? activeTab.getAttribute('data-tab') : "";
}

// MODAL FUNCTIONS
function showModal(modal) {
  if (!modal) return;
  modal.classList.add('show');
}

function hideModal(modal) {
  if (!modal) return;
  modal.classList.remove('show');

  if (modal.id === 'info-modal') {
    const content = modal.querySelector('.modal-content');
    const body = document.getElementById('modal-body');
    const footer = document.getElementById('modal-footer');
    const close = document.getElementById('modal-close-btn');

    if (content) {
      content.classList.remove('edge-modal');
    }
    if (body) {
      body.innerHTML = '';
    }
    if (footer) {
      footer.innerHTML = '';
    }
    if (close) {
      close.style.display = 'none';
    }
  }
}

function setupInfoModalDismissHandlers() {
  const modal = document.getElementById('info-modal');
  if (!modal) return;

  const backdrop = modal.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => hideModal(modal));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!modal.classList.contains('show')) return;
    hideModal(modal);
  });
}

function showEdgeModal(edge) {
  if (!edge || edge.empty()) return;

  const modal = document.getElementById('info-modal');
  const content = modal?.querySelector('.modal-content');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  const footer = document.getElementById('modal-footer');
  const close = document.getElementById('modal-close-btn');

  if (!modal || !content || !title || !body || !footer) return;

  const sourceNode = cy.getElementById(edge.data('source'));
  const targetNode = cy.getElementById(edge.data('target'));
  const screenshot = edge.data('screenshot');
  const canDelete = isEditorSignedIn();

  const buildTransitionTrackCard = (role, node) => {
    const data = node && !node.empty() ? node.data() : {};
    const name = data.name || 'Unknown';
    const artist = data.artist || '';
    const cover = getSafeImageUrl(data.cover);
    const art = cover
      ? `<img class="transition-track-cover" src="${escapeHtml(cover)}" alt="">`
      : '<span class="transition-track-cover transition-track-cover-empty" aria-hidden="true"></span>';

    return `
      <div class="transition-track-card">
        ${art}
        <div class="transition-track-copy">
          <span class="transition-track-label">${role}</span>
          <span class="transition-track-name">${escapeHtml(name)}</span>
          ${artist ? `<span class="transition-track-artist">${escapeHtml(artist)}</span>` : ''}
        </div>
      </div>
    `;
  };

  content.classList.add('edge-modal');
  title.textContent = 'Transition';
  if (close) {
    close.style.display = 'none';
  }

  body.innerHTML = `
    <h3 class="transition-modal-title">Transition</h3>
    <div class="transition-flow">
      ${buildTransitionTrackCard('From', sourceNode)}
      <div class="transition-flow-connector" aria-hidden="true"></div>
      ${buildTransitionTrackCard('To', targetNode)}
    </div>
    ${screenshot ? `<img class="transition-shot" src="${escapeHtml(screenshot)}" alt="Transition Screenshot">` : '<p class="transition-meta">No screenshot attached.</p>'}
  `;

  if (canDelete) {
    footer.innerHTML = '<button type="button" class="btn-danger-subtle transition-delete-btn" id="delete-edge-btn">Delete Transition</button>';
    const deleteBtn = document.getElementById('delete-edge-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        deleteTransition(edge.id());
        hideModal(modal);
      });
    }
  } else {
    footer.innerHTML = '<p class="transition-meta">Sign in with Google to delete transitions.</p>';
  }

  showModal(modal);
}

function buildNodeListFromCollection(nodeCollection) {
  const uniqueById = new Map();
  nodeCollection.forEach((node) => {
    if (!node || node.empty()) return;
    uniqueById.set(node.id(), {
      id: node.id(),
      name: node.data('name') || 'Unknown',
      artist: node.data('artist') || '',
      cover: node.data('cover') || '',
    });
  });
  return Array.from(uniqueById.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildRelatedSongListHtml(items) {
  if (items.length === 0) {
    return '<li class="details-empty">None</li>';
  }

  return items
    .map(
      (item) => {
        const cover = getSafeImageUrl(item.cover);
        const art = cover
          ? `<img class="related-song-cover" src="${escapeHtml(cover)}" alt="">`
          : '<span class="related-song-cover related-song-cover-empty" aria-hidden="true"></span>';
        return `<li><button type="button" class="related-song-btn" data-related-node-id="${escapeHtml(item.id)}">${art}<span class="related-song-copy"><span class="related-song-name">${escapeHtml(item.name)}</span>${item.artist ? `<span class="related-song-artist">${escapeHtml(item.artist)}</span>` : ''}</span></button></li>`;
      },
    )
    .join('');
}

function openSongInSearchTab(node) {
  if (!node || node.empty()) return;

  switchToTab('search');
  document.querySelectorAll('.panel.is-collapsed').forEach((p) => {
    p.classList.remove('is-collapsed');
  });
  const data = node.data();
  const searchInput = document.getElementById('graph-search-input');
  if (searchInput) {
    searchInput.value = `${data.name || ''}${data.artist ? ` - ${data.artist}` : ''}`;
  }

  highlightNodeConnections(node);
  showNodeDetails(node);
  focusNodeAndNeighborhood(node, 110);
}

// UPDATE showDetails to use modal
function updateShowDetailsForModal() {
  // Override the graph click handlers
  if (!cy) return;
  
  cy.off('tap', 'node');
  cy.off('tap', 'edge');
  
  cy.on('tap', 'node', function (evt) {
    openSongInSearchTab(evt.target);
  });

  cy.on('tap', 'edge', function (evt) {
    showEdgeModal(evt.target);
  });
}

// CLICK-OUTSIDE DROPDOWN CLOSE
function setupDropdownCloseOnClickOutside() {
  document.addEventListener('click', (event) => {
    const autocompleteResults = document.querySelectorAll('.autocomplete-results');
    
    autocompleteResults.forEach(resultsDiv => {
      // Check if click is outside this results div and its associated input
      const input = resultsDiv.previousElementSibling;
      
      if (!resultsDiv.contains(event.target) && !input.contains(event.target)) {
        resultsDiv.style.display = 'none';
      }
    });
    
    // Also handle graph search results
    const graphSearchResults = document.getElementById('graph-search-results');
    const graphSearchInput = document.getElementById('graph-search-input');
    if (graphSearchResults && !graphSearchResults.contains(event.target) && event.target !== graphSearchInput) {
      graphSearchResults.style.display = 'none';
    }
  });
}

// Re-export the updateShowDetailsForModal so it's called after graph initializes
// (Already handled in DOMContentLoaded now)
