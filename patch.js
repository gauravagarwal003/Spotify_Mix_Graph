function setupAutocomplete(nodeId) {
  const searchInput = document.getElementById(`${nodeId}-search`);
  const resultsDiv = document.getElementById(`${nodeId}-results`);
  const hiddenData = document.getElementById(`${nodeId}-data`);
  
  let localDebounceTimer = null;
  let currentFetchQuery = "";

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
        spotifyAccessToken || localStorage.getItem("spotify_access_token");
      if (!tokenToUse || tokenToUse === "undefined" || tokenToUse === "null") {
        console.warn("No spotify token available.");
        return;
      }

      try {
        const response = await fetch(
          `https://api.spotify.com/v1/search?type=track&limit=15&q=${encodeURIComponent(query)}`,
          {
            headers: {
              Authorization: `Bearer ${tokenToUse}`,
            },
          },
        );

        if (currentFetchQuery !== query) return;

        if (response.status === 401) {
          console.error("Spotify token expired, clearing token.");
          localStorage.removeItem("spotify_access_token");
          spotifyAccessToken = null;
          window.location.reload();
          return;
        } else if (response.status === 429) {
          resultsDiv.innerHTML = `<div style="padding:10px; color:#f44336; font-size:12px;">Too many requests. Please slow down your typing.</div>`;
          resultsDiv.style.display = "block";
          return;
        } else if (!response.ok) {
          let errMessage = "Verify your Spotify Developer App settings.";
          try {
             const errData = await response.json();
             if (errData && errData.error && errData.error.message) {
                 errMessage = errData.error.message;
             }
          } catch(e) {}
          console.error("Spotify API error:", errMessage);
          resultsDiv.innerHTML = `<div style="padding:10px; color:#f44336; font-size:12px;">Error: ${errMessage}</div>`;
          resultsDiv.style.display = "block";
          return;
        }

        const data = await response.json();
        if (currentFetchQuery !== query) return;

        const tracks = (data.tracks && data.tracks.items) ? data.tracks.items : [];

        resultsDiv.innerHTML = "";
        if (tracks.length === 0) {
          resultsDiv.innerHTML =
            '<div style="padding:10px; color:#b3b3b3; font-size:12px;">No results found</div>';
        } else {
          tracks.forEach((track) => {
            const div = document.createElement("div");
            div.className = "autocomplete-item";

            const coverUrl =
              track.album && track.album.images && track.album.images.length > 0
                ? track.album.images[track.album.images.length - 1].url
                : "";
            
            const artistName = track.artists ? track.artists.map((a) => a.name).join(", ") : "Unknown Artist";

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
                  track.album && track.album.images && track.album.images.length > 0
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
    }, 450);
  });
}