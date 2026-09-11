import { NextResponse } from "next/server";

import { decodeSupportedImageDataUrl } from "@/lib/dromap/server/image-data-url";
import {
  dromapPublicationsConfigured,
  publicationsAdminFetch,
  type DromapPublicationRow,
} from "@/lib/dromap/server/publications";
import { parseJsonResponse } from "@/lib/dromap/server/supabase-rest";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug || !dromapPublicationsConfigured()) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const response = await publicationsAdminFetch(
      `/dromap_publications?slug=eq.${encodeURIComponent(slug)}&select=preview_data_url&limit=1`,
      { method: "GET" },
    );
    const rows = response.ok ? await parseJsonResponse<DromapPublicationRow[]>(response) : [];
    const image = await decodeSupportedImageDataUrl(rows?.[0]?.preview_data_url);
    if (!image) return new NextResponse(null, { status: 404 });

    return new NextResponse(Uint8Array.from(image.bytes), {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": String(image.bytes.byteLength),
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
