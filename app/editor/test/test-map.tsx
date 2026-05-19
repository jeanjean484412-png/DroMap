"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  configureLeafletIcons,
  defaultMarkerIcon,
} from "@/lib/leaflet-icon";

import GeomanControls from "./geoman-controls";
import MapViewController from "./map-view-controller";
import WorkspaceBoundsLayer from "./workspace-bounds-layer";

configureLeafletIcons();

const FRANCE_CENTER: LatLngExpression = [46.603354, 1.888334];
const PARIS: LatLngExpression = [48.8566, 2.3522];

export default function TestMap() {
  return (
    <MapContainer
      center={FRANCE_CENTER}
      zoom={6}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeomanControls />
      <MapViewController />
      <WorkspaceBoundsLayer />
      <Marker position={PARIS} icon={defaultMarkerIcon}>
        <Popup>Paris</Popup>
      </Marker>
    </MapContainer>
  );
}
