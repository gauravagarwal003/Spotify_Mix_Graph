let cy;
let debounceTimer;
let currentScreenshotBase64 = null;

// Before deploying, create a Spotify Developer App and put its Client ID here
const SPOTIFY_CLIENT_ID = '03f085f9e7054e1abb2be9a2e89a8892'; // Using a placeholder, change to yours
let spotifyAccessToken = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth to complete BEFORE doing anything else
    await checkSpotifyAuth();
    loadGHSettings();

    let graphData = { nodes: [], edges: [] };
    let loadedFromGitHub = false;

    // 1. Try to fetch the latest from the GitHub API directly to bypass GitHub Pages limits
    const ghOwner = localStorage.getItem('gh_owner');
    const ghRepo = localStorage.getItem('gh_repo');
    const ghToken = localStorage.getItem('gh_token');

    if (ghOwner && ghRepo && ghToken) {
        try {
            const getRes = await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/data.json`, {
                headers: { 'Authorization': `token ${ghToken}` }
            });
            if (getRes.ok) {
                const getBuf = await getRes.json();
                // GitHub API returns content as base64
                const contentStr = decodeURIComponent(escape(atob(getBuf.content)));
                graphData = JSON.parse(contentStr);
                loadedFromGitHub = true;
                
                // Update local storage so it has the absolute freshest data too
                localStorage.setItem('spotify_mix_graph_data', contentStr);
            }
        } catch (e) {
            console.error("Could not fetch remote data.json from GitHub API.", e);
        }
    }

    // 2. If it couldn't fetch from GitHub, try Local Storage
    if (!loadedFromGitHub) {
        const savedLocal = localStorage.getItem('spotify_mix_graph_data');
        if (savedLocal) {
            try {
                graphData = JSON.parse(savedLocal);
            } catch (e) {
                console.error("Could not parse locally saved graph data", e);
            }
        } else {
            // 3. Otherwise, fetch from the main data.json file statically
            try {
                const response = await fetch('./data.json?v=' + Date.now());
                if (response.ok) {
                    graphData = await response.json();
                }
            } catch (e) {
                console.warn("Could not load data.json.");
            }
        }
    }

    initGraph(graphData);
    setupEvents();
    setupAutocomplete('node1');
    setupAutocomplete('node2');
});

function saveGraphToLocal() {
    if (!cy) return;
    const elements = cy.json().elements;
    const dataToSave = {
        nodes: elements.nodes || [],
        edges: elements.edges || []
    };
    localStorage.setItem('spotify_mix_graph_data', JSON.stringify(dataToSave));
}

function initGraph(data) {
    cy = cytoscape({
        container: document.getElementById('graph-container'),
        elements: {
            nodes: data.nodes || [],
            edges: data.edges || []
        },
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': '#282828',
                    'background-image': 'data(cover)',
                    'background-fit': 'cover',
                    'width': 60,
                    'height': 60,
                    'label': 'data(name)',
                    'color': '#fff',
                    'text-valign': 'bottom',
                    'text-margin-y': 8,
                    'font-size': '12px',
                    'text-outline-color': '#121212',
                    'text-outline-width': 2,
                    'border-width': 2,
                    'border-color': '#1db954'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 4,
                    'line-color': '#535353',
                    'target-arrow-color': '#535353',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'label': 'data(hasScreenshot)',
                    'color': '#1db954',
                    'font-size': '14px',
                    'text-background-color': '#181818',
                    'text-background-opacity': 1,
                    'text-background-padding': '4px',
                    'text-background-shape': 'roundrectangle'
                }
            }
        ],
        layout: {
            name: 'cose',
            padding: 50,
            animate: true,
            nodeRepulsion: 400000,
            idealEdgeLength: 150
        }
    });

    cy.on('tap', 'node', function(evt){
        const d = evt.target.data();
        showDetails(`
            <img src="${d.cover}" alt="Cover" style="width:100%">
            <h3 style="margin:12px 0 4px">${d.name}</h3>
            <p>${d.artist}</p>
        `);
    });

    cy.on('tap', 'edge', function(evt){
        const edge = evt.target;
        const sourceData = cy.getElementById(edge.data('source')).data('name');
        const targetData = cy.getElementById(edge.data('target')).data('name');
        const sc = edge.data('screenshot');

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
    const p = document.getElementById('details-panel');
    p.style.display = 'block';
    document.getElementById('details-content').innerHTML = htmlContent;
}

function setupEvents() {
    const fileInput = document.getElementById('screenshot-file');
    const fileLabel = document.getElementById('file-preview-name');
    
    fileLabel.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileLabel.textContent = file.name;
            const reader = new FileReader();
            reader.onload = (evt) => {
                currentScreenshotBase64 = evt.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            fileLabel.textContent = 'No file selected';
            currentScreenshotBase64 = null;
        }
    });

    const form = document.getElementById('add-transition-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const n1DataStr = document.getElementById('node1-data').value;
        const n2DataStr = document.getElementById('node2-data').value;

        if (!n1DataStr || !n2DataStr) {
            alert("Please select tracks from the search autocomplete.");
            return;
        }

        const n1 = JSON.parse(n1DataStr);
        const n2 = JSON.parse(n2DataStr);

        let node1Id = n1.id;
        let node2Id = n2.id;

        if(cy.getElementById(node1Id).empty()) {
            cy.add({ group: 'nodes', data: { id: node1Id, name: n1.name, artist: n1.artist, cover: n1.cover }});
        }
        if(cy.getElementById(node2Id).empty()) {
            cy.add({ group: 'nodes', data: { id: node2Id, name: n2.name, artist: n2.artist, cover: n2.cover }});
        }

        const edgeId = `${node1Id}-${node2Id}`;
        if(cy.getElementById(edgeId).empty()) {
            cy.add({ 
                group: 'edges', 
                data: { 
                    id: edgeId, 
                    source: node1Id, 
                    target: node2Id, 
                    screenshot: currentScreenshotBase64,
                    hasScreenshot: currentScreenshotBase64 ? '📸' : ''
                }
            });
            
            cy.layout({ name: 'cose', animate: true, nodeRepulsion: 400000, idealEdgeLength: 150 }).run();
            
            // Save to browser storage so it persists on refresh
            saveGraphToLocal();
            
            // Reset form
            document.getElementById('node1-search').value = '';
            document.getElementById('node2-search').value = '';
            document.getElementById('node1-data').value = '';
            document.getElementById('node2-data').value = '';
            fileInput.value = '';
            fileLabel.textContent = 'No file selected';
            currentScreenshotBase64 = null;
        } else {
            alert("This transition already exists!");
        }
    });

    document.getElementById('export-btn').addEventListener('click', async () => {
        const json = cy.json();
        const elements = json.elements;
        
        const ghOwner = localStorage.getItem('gh_owner');
        const ghRepo = localStorage.getItem('gh_repo');
        const ghToken = localStorage.getItem('gh_token');

        if (!ghOwner || !ghRepo || !ghToken) {
            alert('Please fill out the Cloud Sync Settings in the sidebar before syncing to GitHub.');
            return;
        }

        document.getElementById('export-btn').innerText = 'Syncing...';
        
        try {
            const path = 'data.json';
            const url = `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${path}`;

            // 1. Get file SHA (required by GitHub API to update a file)
            let sha = null;
            const getRes = await fetch(url, { headers: { 'Authorization': `token ${ghToken}` } });
            if (getRes.ok) {
                const getBuf = await getRes.json();
                sha = getBuf.sha;
            }

            // 2. PUT new content
            const contentStr = JSON.stringify(elements, null, 2);
            const encodedContent = btoa(unescape(encodeURIComponent(contentStr)));

            const payload = {
                message: "Update mix graph via App Sync",
                content: encodedContent,
            };
            if (sha) payload.sha = sha;

            const putRes = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${ghToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (putRes.ok) {
                alert('Successfully synced to GitHub! You can now view changes on your other devices.');
            } else {
                const err = await putRes.json();
                alert(`Error syncing: ${err.message}`);
            }
        } catch (e) {
            console.error("Sync error:", e);
            alert("Failed to sync due to a network error.");
        } finally {
            document.getElementById('export-btn').innerText = 'Sync Graph to Cloud';
        }
    });

    document.getElementById('save-gh-settings').addEventListener('click', () => {
        localStorage.setItem('gh_owner', document.getElementById('gh-owner').value.trim());
        localStorage.setItem('gh_repo', document.getElementById('gh-repo').value.trim());
        localStorage.setItem('gh_token', document.getElementById('gh-token').value.trim());
        alert('Cloud sync settings saved to this browser.');
    });
}

function loadGHSettings() {
    document.getElementById('gh-owner').value = localStorage.getItem('gh_owner') || '';
    document.getElementById('gh-repo').value = localStorage.getItem('gh_repo') || '';
    document.getElementById('gh-token').value = localStorage.getItem('gh_token') || '';
}

function setupAutocomplete(nodeId) {
    const searchInput = document.getElementById(`${nodeId}-search`);
    const resultsDiv = document.getElementById(`${nodeId}-results`);
    const hiddenData = document.getElementById(`${nodeId}-data`);

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            resultsDiv.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(async () => {
            // Check if token exists, fallback to localStorage if global var is empty
            const tokenToUse = spotifyAccessToken || localStorage.getItem('spotify_access_token');
            if (!tokenToUse || tokenToUse === 'undefined') {
                console.warn("No spotify token available.");
                return;
            }

            try {
                const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`, {
                    headers: {
                        'Authorization': `Bearer ${tokenToUse}`
                    }
                });
                
                if (response.status === 401) {
                    // Token expired
                    localStorage.removeItem('spotify_access_token');
                    spotifyAccessToken = null;
                    window.location.reload();
                    return;
                }

                const data = await response.json();
                const tracks = data.tracks?.items || [];
                
                resultsDiv.innerHTML = '';
                if (tracks.length === 0) {
                    resultsDiv.innerHTML = '<div style="padding:10px; color:#b3b3b3; font-size:12px;">No results found</div>';
                } else {
                    tracks.forEach(track => {
                        const div = document.createElement('div');
                        div.className = 'autocomplete-item';
                        
                        const coverUrl = track.album.images.length > 0 ? track.album.images[track.album.images.length - 1].url : '';
                        const artistName = track.artists.map(a => a.name).join(', ');
                        
                        // Format duration
                        const minutes = Math.floor(track.duration_ms / 60000);
                        const seconds = ((track.duration_ms % 60000) / 1000).toFixed(0);
                        const formattedDuration = minutes + ":" + (seconds < 10 ? '0' : '') + seconds;

                        div.innerHTML = `
                            <img src="${coverUrl}" alt="Cover">
                            <div class="autocomplete-info">
                                <span class="autocomplete-name">${track.name}</span>
                                <span class="autocomplete-artist">${artistName}</span>
                            </div>
                            <div class="autocomplete-duration">${formattedDuration}</div>
                        `;
                        div.addEventListener('click', () => {
                            searchInput.value = `${track.name} - ${artistName}`;
                            hiddenData.value = JSON.stringify({
                                id: track.id,
                                name: track.name,
                                artist: artistName,
                                cover: track.album.images.length > 0 ? track.album.images[0].url : ''
                            });
                            resultsDiv.style.display = 'none';
                        });
                        resultsDiv.appendChild(div);
                    });
                }
                resultsDiv.style.display = 'block';
            } catch (err) {
                console.error(err);
            }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
}

async function checkSpotifyAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const redirectUri = window.location.href.split('?')[0].split('#')[0]; // Clean URI for redirect
    
    if (code) {
        // Exchange code for access token using PKCE
        const codeVerifier = localStorage.getItem('code_verifier');
        try {
            const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: SPOTIFY_CLIENT_ID,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri,
                    code_verifier: codeVerifier,
                })
            });
            const data = await tokenResponse.json();
            
            if (data.access_token) {
                localStorage.setItem('spotify_access_token', data.access_token);
                spotifyAccessToken = data.access_token;
            }
            // Clear URL
            window.history.replaceState(null, null, window.location.pathname);
        } catch (e) {
            console.error("Error exchanging token", e);
        }
    } else {
        spotifyAccessToken = localStorage.getItem('spotify_access_token');
    }

    const authPanel = document.getElementById('spotify-auth');
    const mainPanel = document.getElementById('main-panel');
    const authBtn = document.getElementById('login-btn');

    if (spotifyAccessToken && spotifyAccessToken !== 'undefined' && spotifyAccessToken !== 'null') {
        authPanel.style.display = 'none';
        mainPanel.style.display = 'block';
    } else {
        authPanel.style.display = 'block';
        mainPanel.style.display = 'none';
        
        authBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                // Generate PKCE codes
                const generateRandomString = (length) => {
                    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                    const values = crypto.getRandomValues(new Uint8Array(length));
                    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
                };

                const sha256 = async (plain) => {
                    const encoder = new TextEncoder();
                    const data = encoder.encode(plain);
                    return window.crypto.subtle.digest('SHA-256', data);
                };

                const base64encode = (input) => {
                    return btoa(String.fromCharCode(...new Uint8Array(input)))
                        .replace(/=/g, '')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_');
                };

                const codeVerifier = generateRandomString(64);
                
                if (!window.crypto || !window.crypto.subtle) {
                    alert("Your browser is blocking secure crypto functions. Please ensure you are accessing via http://localhost:8000 and not a network IP, or use https.");
                    return;
                }

                const hashed = await sha256(codeVerifier);
                const codeChallenge = base64encode(hashed);

                localStorage.setItem('code_verifier', codeVerifier);

                const authUrl = new URL("https://accounts.spotify.com/authorize");
                const params = {
                    response_type: 'code',
                    client_id: SPOTIFY_CLIENT_ID,
                    scope: 'user-read-private',
                    code_challenge_method: 'S256',
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
