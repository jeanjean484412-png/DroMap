"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditorFeatureSettingsPreview } from "@/stores/editor-feature-settings-preview";

import type {
  DromapGeoJsonFeature,
  DromapGeoJsonFeatureSettingsPatch,
  DromapGeoJsonLayer,
  DromapGeoJsonLayerStyle,
} from "@/stores/editor-geojson-layers";
import { ColorPicker } from "./color-picker";
import { getGeoJsonFeatureName } from "./geojson-layer-conversion";
import { getEffectiveGeoJsonFeatureStyle } from "./geojson-layer-style";

const fieldClassName = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600";
const actionClassName = "rounded-lg border border-teal-200 bg-white px-3 py-2 text-left text-xs font-semibold text-teal-900 disabled:opacity-50 motion-safe:transition-transform motion-safe:enabled:hover:scale-[1.015]";

type GeoJsonFeatureSettingsProps = {
  layer: DromapGeoJsonLayer;
  feature: DromapGeoJsonFeature;
  zIndex: number;
  onClose: () => void;
  onApply: (patch: DromapGeoJsonFeatureSettingsPatch) => void;
  onOpenLayer: () => void;
  onConvertFeature: () => void;
  onConvertLayer: () => void;
};

export function GeoJsonFeatureSettings({
  layer, feature, zIndex, onClose, onApply, onOpenLayer, onConvertFeature, onConvertLayer,
}: GeoJsonFeatureSettingsProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<DromapGeoJsonFeatureSettingsPatch>({});
  const originalName = getGeoJsonFeatureName(feature);
  const originalStyle = getEffectiveGeoJsonFeatureStyle(layer, feature);
  const name = draft.name ?? originalName;
  const style = { ...originalStyle, ...draft.style };

  const geometry = feature.geometry.type;
  const isPoint = geometry === "Point" || geometry === "MultiPoint";
  const isZone = geometry === "Polygon" || geometry === "MultiPolygon";
  const hasDraft = draft.name !== undefined || draft.style !== undefined;
  const canApply = Boolean(name.trim() && hasDraft);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    return () => useEditorFeatureSettingsPreview.setState({ geoJson: null });
  }, []);

  useLayoutEffect(() => {
    useEditorFeatureSettingsPreview.setState({
      geoJson: hasDraft && feature.id !== undefined ? { layerId: layer.id, featureId: feature.id, patch: draft } : null,
    });
  }, [draft, feature.id, hasDraft, layer.id]);

  function updateStyle<K extends keyof DromapGeoJsonLayerStyle>(key: K, value: DromapGeoJsonLayerStyle[K]) {
    setDraft((current) => ({ ...current, style: { ...current.style, [key]: value } }));
  }

  function applyDraft() {
    if (!canApply) return;
    onApply(draft);
    setDraft({});
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="Paramètres de l’élément GeoJSON"
      data-dromap-geojson-feature-settings="true"
      data-dromap-ignore-shortcuts="true"
      className="absolute right-4 top-[7.5rem] flex max-h-[calc(100%-8.5rem)] w-[min(23rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-lg focus:outline-none"
      style={{ zIndex }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.target === event.currentTarget) onClose();
      }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">Paramètres de l’élément</h2>
          <p className="truncate text-xs text-slate-500">Calque GeoJSON « {layer.name} »</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-800 motion-safe:transition-transform motion-safe:hover:scale-105">Fermer</button>
      </header>

      <form className="space-y-4 overflow-y-auto p-4" onSubmit={(event) => { event.preventDefault(); applyDraft(); }}>
        <label className="block text-xs font-medium text-slate-700">
          Nom de l’élément
          <input className={fieldClassName} value={name} required onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>

        <div className="grid grid-cols-2 gap-3 text-xs font-medium text-slate-700">
          <div>
            <div className="mb-1">{isPoint ? "Couleur du point" : "Couleur du trait"}</div>
            <ColorPicker value={style.strokeColor} onChange={(value) => updateStyle("strokeColor", value)} ariaLabel={isPoint ? "Couleur du point" : "Couleur du trait"} className="w-full" />
          </div>
          <label>
            {isPoint ? "Taille du point" : "Épaisseur du trait"}
            <input
              className={fieldClassName}
              type="number"
              min={isPoint ? 2 : 1}
              max={isPoint ? 80 : 24}
              step="any"
              value={isPoint ? style.markerSize : style.strokeWeight}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value)) updateStyle(isPoint ? "markerSize" : "strokeWeight", value);
              }}
            />
          </label>
          <label>
            {isPoint ? "Opacité du point" : "Opacité du trait"} · {Math.round(style.strokeOpacity * 100)} %
            <input className="mt-2 w-full accent-teal-600" type="range" min={0} max={100} value={Math.round(style.strokeOpacity * 100)} onChange={(event) => updateStyle("strokeOpacity", event.target.valueAsNumber / 100)} />
          </label>
          {!isPoint ? (
            <label>
              Type de trait
              <select className={fieldClassName} value={style.dashStyle} onChange={(event) => updateStyle("dashStyle", event.target.value as DromapGeoJsonLayerStyle["dashStyle"])}>
                <option value="solid">Plein</option>
                <option value="dashed">Tirets</option>
                <option value="dotted">Pointillés</option>
              </select>
            </label>
          ) : null}
          {isZone ? (
            <>
              <div>
                <div className="mb-1">Couleur du fond</div>
                <ColorPicker value={style.fillColor} onChange={(value) => updateStyle("fillColor", value)} ariaLabel="Couleur du fond" className="w-full" />
              </div>
              <label>
                Opacité du fond · {Math.round(style.fillOpacity * 100)} %
                <input className="mt-2 w-full accent-teal-600" type="range" min={0} max={100} value={Math.round(style.fillOpacity * 100)} onChange={(event) => updateStyle("fillOpacity", event.target.valueAsNumber / 100)} />
              </label>
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" disabled={!hasDraft} onClick={() => setDraft({})} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Annuler</button>
          <button type="submit" disabled={!canApply} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:bg-slate-100 disabled:text-slate-500">Appliquer à cet élément</button>
        </div>

        <div className="grid gap-2 border-t border-slate-200 pt-3">
          <button type="button" className={actionClassName} disabled={hasDraft} onClick={onOpenLayer}>Modifier tout le calque GeoJSON</button>
          <button type="button" className={actionClassName} disabled={hasDraft} onClick={onConvertFeature}>Transformer cet élément en objet DroMap</button>
          <button type="button" className={actionClassName} disabled={hasDraft} onClick={onConvertLayer}>Transformer tout le calque en objets DroMap</button>
        </div>
      </form>
    </aside>
  );
}
