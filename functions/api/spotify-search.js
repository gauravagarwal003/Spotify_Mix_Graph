let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getSpotifyAccessToken(env) {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const clientId = String(env.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SPOTIFY_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing Spotify Pages secret");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Spotify token request failed", {
      status: response.status,
      body: errorText.slice(0, 300),
    });
    throw new Error(`Spotify token request failed (${response.status})`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + Math.max(60, data.expires_in - 60) * 1000;
  return cachedToken;
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const query = String(requestUrl.searchParams.get("q") || "").trim();
  const limit = Math.min(
    10,
    Math.max(1, Number.parseInt(requestUrl.searchParams.get("limit"), 10) || 10),
  );

  if (query.length < 2 || query.length > 100) {
    return Response.json({ error: "Search query must be 2-100 characters" }, { status: 400 });
  }

  try {
    const token = await getSpotifyAccessToken(context.env);
    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "track");
    searchUrl.searchParams.set("limit", String(limit));

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text().catch(() => "");
      console.error("Spotify search request failed", {
        status: searchResponse.status,
        body: errorText.slice(0, 300),
      });
      return Response.json(
        { error: "Spotify search is temporarily unavailable" },
        { status: searchResponse.status === 429 ? 429 : 502 },
      );
    }

    const data = await searchResponse.json();
    const results = (data.tracks?.items || []).map((track) => ({
      id: `spotify-${track.id}`,
      name: track.name,
      artist: (track.artists || []).map((artist) => artist.name).join(", "),
      cover: track.album?.images?.[0]?.url || "",
      durationMs: track.duration_ms || 0,
    }));

    return Response.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=120",
        },
      },
    );
  } catch (error) {
    console.error("Spotify search proxy failed", error);
    return Response.json(
      { error: "Music search is temporarily unavailable" },
      { status: 502 },
    );
  }
}
