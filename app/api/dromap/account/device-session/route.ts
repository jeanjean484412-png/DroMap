import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";

const LEASE_TIMEOUT_MS = 90_000;

type LeaseRow = {
  owner_id?: unknown;
  device_id?: unknown;
  last_seen_at?: unknown;
};

function normalizeDeviceId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,160}$/.test(value)
    ? value
    : null;
}

function leaseIsStale(value: unknown) {
  if (typeof value !== "string") return true;
  const time = Date.parse(value);
  return !Number.isFinite(time) || Date.now() - time > LEASE_TIMEOUT_MS;
}

async function readLease(ownerId: string, accessToken: string) {
  const response = await supabaseRestFetch(
    `/dromap_account_device_leases?owner_id=eq.${encodeURIComponent(ownerId)}&select=owner_id,device_id,last_seen_at&limit=1`,
    accessToken,
    { method: "GET" },
  );
  const rows = await parseJsonResponse<LeaseRow[]>(response);
  return response.ok && Array.isArray(rows) ? rows[0] ?? null : null;
}

async function handlePOST(request: Request) {
  if (!getSupabaseConfig()) return NextResponse.json({ error: "Compte indisponible." }, { status: 503 });
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { deviceId?: unknown; heartbeat?: unknown } | null;
  const deviceId = normalizeDeviceId(body?.deviceId);
  const heartbeat = body?.heartbeat === true;
  if (!deviceId) return NextResponse.json({ error: "Identifiant d’appareil invalide." }, { status: 400 });

  try {
    const now = new Date().toISOString();

    // Une fois le bail acquis, le heartbeat normal n'a pas besoin de relire la
    // ligne avant de l'actualiser. Si elle a expiré ou a été reprise ailleurs,
    // le PATCH ne retourne aucune ligne et on retombe sur la procédure complète.
    if (heartbeat) {
      const heartbeatResponse = await supabaseRestFetch(
        `/dromap_account_device_leases?owner_id=eq.${encodeURIComponent(auth.user.id)}&device_id=eq.${encodeURIComponent(deviceId)}&select=owner_id,device_id,last_seen_at`,
        auth.accessToken,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ last_seen_at: now }),
        },
      );
      const heartbeatRows = await parseJsonResponse<LeaseRow[]>(heartbeatResponse);
      if (heartbeatResponse.ok && Array.isArray(heartbeatRows) && heartbeatRows.length > 0) {
        return NextResponse.json({ ok: true });
      }
    }

    const existing = await readLease(auth.user.id, auth.accessToken);

    if (!existing) {
      const response = await supabaseRestFetch("/dromap_account_device_leases", auth.accessToken, {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
        body: JSON.stringify({ owner_id: auth.user.id, device_id: deviceId, last_seen_at: now }),
      });
      if (response.ok) {
        const current = await readLease(auth.user.id, auth.accessToken);
        if (current?.device_id === deviceId) return NextResponse.json({ ok: true });
      }
    }

    const current = existing ?? await readLease(auth.user.id, auth.accessToken);
    const currentDeviceId = typeof current?.device_id === "string" ? current.device_id : null;
    if (currentDeviceId && currentDeviceId !== deviceId && !leaseIsStale(current?.last_seen_at)) {
      return NextResponse.json(
        { error: "Ce compte DroMap est déjà utilisé sur un autre appareil." },
        { status: 409 },
      );
    }

    const response = await supabaseRestFetch(
      `/dromap_account_device_leases?owner_id=eq.${encodeURIComponent(auth.user.id)}`,
      auth.accessToken,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ device_id: deviceId, last_seen_at: now }),
      },
    );
    if (!response.ok) return NextResponse.json({ error: "Session appareil indisponible." }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Session appareil indisponible." }, { status: 503 });
  }
}

async function handleDELETE(request: Request) {
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ ok: true });
  const body = (await request.json().catch(() => null)) as { deviceId?: unknown } | null;
  const deviceId = normalizeDeviceId(body?.deviceId);
  if (!deviceId) return NextResponse.json({ ok: true });
  await supabaseRestFetch(
    `/dromap_account_device_leases?owner_id=eq.${encodeURIComponent(auth.user.id)}&device_id=eq.${encodeURIComponent(deviceId)}`,
    auth.accessToken,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  ).catch(() => null);
  return NextResponse.json({ ok: true });
}

export const POST = withRequestSecurity(handlePOST);
export const DELETE = withRequestSecurity(handleDELETE);
