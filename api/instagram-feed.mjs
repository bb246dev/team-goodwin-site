const INSTAGRAM_MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "permalink",
  "thumbnail_url",
  "timestamp",
].join(",");

export async function loadInstagramFeed(accessToken) {
  if (!accessToken) {
    throw new Error("Missing INSTAGRAM_ACCESS_TOKEN");
  }

  const url = new URL("https://graph.instagram.com/me/media");
  url.searchParams.set("fields", INSTAGRAM_MEDIA_FIELDS);
  url.searchParams.set("limit", "24");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Instagram API returned ${response.status}`);
  }

  const imageMedia = (payload.data || [])
    .filter((item) => item.media_type === "IMAGE" || item.media_type === "CAROUSEL_ALBUM")
    .map((item) => ({
      id: item.id,
      caption: item.caption || "William Goodge Instagram image",
      media_type: item.media_type,
      media_url: item.media_url || item.thumbnail_url,
      permalink: item.permalink,
      timestamp: item.timestamp,
    }))
    .filter((item) => item.media_url)
    .slice(0, 8);

  return { data: imageMedia };
}

export default async function handler(request, response) {
  try {
    const payload = await loadInstagramFeed(process.env.INSTAGRAM_ACCESS_TOKEN);
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
    response.status(200).json(payload);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}

export async function onRequestGet({ env }) {
  try {
    const payload = await loadInstagramFeed(env.INSTAGRAM_ACCESS_TOKEN);
    return Response.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
