"use client";
/* eslint-disable @next/next/no-img-element -- Local vector data URLs must use the same native SVG renderer as saved markers. */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  DroMapCustomMarkerDefinition,
  DroMapDrawnMarkerElement as Element,
  DroMapDrawnMarkerShapeKind,
} from "@/stores/editor-custom-markers";
import {
  CustomMarkerFabricCanvas,
  type DesignerTool,
} from "./custom-marker-fabric-canvas";
import { createDrawnMarkerDataUrl } from "./custom-marker-rendering";
import {
  DROMAP_BUILTIN_MARKER_SYMBOLS,
  getBuiltinMarkerCompositionSvg,
} from "./marker-symbol";
import {
  alignMarkerElements,
  markerElementLabel,
  translateMarkerElement,
  type MarkerAlignment,
} from "./custom-marker-composition";
import {
  MarkerProperties,
  ColorField,
  NumberField,
} from "./custom-marker-properties";
import styles from "./custom-marker-designer.module.css";
import { loadMarkerFontCss } from "./custom-marker-font";

type Props = {
  initialMarker?: DroMapCustomMarkerDefinition | null;
  onCancel: () => void;
  onSave: (input: {
    name: string;
    elements: Element[];
    dataUrl: string;
  }) => void;
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const id = () => `marker-element-${crypto.randomUUID()}`;
const ZONE = {
  strokeEnabled: true,
  color: "#194858",
  opacity: 1,
  weight: 2,
  dashStyle: "solid" as const,
  fillEnabled: true,
  fillColor: "#2bada3",
  fillOpacity: 1,
  hatchingStyle: "none" as const,
  hatchingColor: "#194858",
  hatchingWeight: 2,
  hatchingSpacing: 14,
  dotsEnabled: false,
  dotsColor: "#194858",
  dotsRadius: 2,
  dotsSpacing: 14,
  smoothing: 45,
};
const TEXT = {
  color: "#194858",
  opacity: 1,
  fontSize: 42,
  backgroundEnabled: false,
  backgroundColor: "#ffffff",
  backgroundOpacity: 1,
  borderEnabled: false,
  borderColor: "#194858",
  borderWidth: 0,
};
const SHAPES: [DroMapDrawnMarkerShapeKind, string, string, number?][] = [
  ["circle", "Cercle", "○"],
  ["ellipse", "Ellipse", "⬭"],
  ["rectangle", "Rectangle", "▭", 0],
  ["rectangle", "Rectangle arrondi", "▢", 18],
  ["triangle", "Triangle", "△"],
];
const ALIGN: [MarkerAlignment, string][] = [
  ["centerX", "Centrer horizontalement"],
  ["centerY", "Centrer verticalement"],
  ["left", "Aligner à gauche"],
  ["right", "Aligner à droite"],
  ["top", "Aligner en haut"],
  ["bottom", "Aligner en bas"],
];
const normalizeSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function CustomMarkerDesignerModal({
  initialMarker,
  onCancel,
  onSave,
}: Props) {
  const [elements, setElements] = useState<Element[]>(() =>
    clone(initialMarker?.elements ?? []),
  );
  const elementsRef = useRef(elements);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<DesignerTool>("select");
  const [drawer, setDrawer] = useState<"shapes" | "symbols" | null>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState(initialMarker?.name ?? "");
  const [error, setError] = useState("");
  const [fontCss, setFontCss] = useState("");
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([
    "#194858",
    "#2bada3",
    "#a7f3d0",
    "#ffffff",
    "#ef4444",
    "#f59e0b",
    "#2563eb",
    "#111827",
  ]);
  const [linePreset, setLinePreset] = useState({
    color: "#194858",
    opacity: 1,
    weight: 4,
    dashStyle: "solid" as "solid" | "dashed" | "dotted",
    arrowStart: false,
    arrowEnd: false,
    smoothing: 45,
  });
  const history = useRef<Element[][]>([clone(elements)]);
  const index = useRef(0);
  const coalesced = useRef<{ key: string; time: number } | null>(null);
  const [, refreshHistory] = useState(0);
  const clipboard = useRef<Element[]>([]);
  const dialog = useRef<HTMLElement>(null);
  const selected = elements.filter((e) => selectedIds.includes(e.id));
  const current = selected.length === 1 ? selected[0] : null;
  const svgUrl = useMemo(
    () => createDrawnMarkerDataUrl(elements, fontCss),
    [elements, fontCss],
  );
  const results = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return DROMAP_BUILTIN_MARKER_SYMBOLS.filter((s) =>
      normalizeSearch(`${s.label} ${s.keywords.join(" ")}`).includes(query),
    ).slice(0, 90);
  }, [search]);

  function commit(next: Element[], key?: string) {
    if (JSON.stringify(next) === JSON.stringify(elementsRef.current)) return;
    const time = Date.now();
    if (
      key &&
      coalesced.current?.key === key &&
      time - coalesced.current.time < 550 &&
      index.current === history.current.length - 1
    )
      history.current[index.current] = clone(next);
    else {
      history.current = [
        ...history.current.slice(0, index.current + 1),
        clone(next),
      ];
      index.current++;
    }
    coalesced.current = key ? { key, time } : null;
    elementsRef.current = next;
    setElements(next);
    setError("");
    refreshHistory((v) => v + 1);
  }
  function travel(delta: number) {
    const nextIndex = index.current + delta;
    if (nextIndex < 0 || nextIndex >= history.current.length) return;
    index.current = nextIndex;
    coalesced.current = null;
    const next = clone(history.current[nextIndex]);
    elementsRef.current = next;
    setElements(next);
    setSelectedIds((ids) =>
      ids.filter((value) => next.some((e) => e.id === value)),
    );
    refreshHistory((v) => v + 1);
  }
  function patch(fn: (e: Element) => Element, key: string) {
    commit(
      elementsRef.current.map((e) => (selectedIds.includes(e.id) ? fn(e) : e)),
      `${selectedIds.join()}:${key}`,
    );
  }
  function add(element: Element) {
    commit([
      ...elementsRef.current,
      element.type === "text" ? element : { ...element, strokeScales: true },
    ]);
    setSelectedIds([element.id]);
    setTool("select");
    setDrawer(null);
  }
  function shape(
    kind: DroMapDrawnMarkerShapeKind,
    radius?: number,
    symbolId?: string,
  ) {
    add({
      id: id(),
      type: "shape",
      shape: kind,
      x: 90,
      y: kind === "ellipse" ? 120 : 90,
      width: 180,
      height: kind === "ellipse" ? 120 : 180,
      rotation: 0,
      fillEnabled: true,
      fillColor: symbolId ? "#194858" : ZONE.fillColor,
      fillOpacity: 1,
      strokeEnabled: !symbolId,
      strokeColor: ZONE.color,
      strokeWidth: symbolId ? 0 : 2,
      strokeOpacity: 1,
      cornerRadius: radius,
      symbolId,
    });
  }
  function remove() {
    commit(elementsRef.current.filter((e) => !selectedIds.includes(e.id)));
    setSelectedIds([]);
  }
  function paste(source = clipboard.current) {
    if (!source.length) return;
    const groups = new Map<string, string>();
    const copies = source.map((e) => {
      if (e.groupId && !groups.has(e.groupId)) groups.set(e.groupId, id());
      return {
        ...translateMarkerElement(clone(e), 12, 12),
        id: id(),
        groupId: e.groupId ? groups.get(e.groupId) : undefined,
      };
    });
    commit([...elementsRef.current, ...copies]);
    setSelectedIds(copies.map((e) => e.id));
    setTool("select");
  }
  function order(direction: "front" | "back" | "up" | "down") {
    let next = [...elementsRef.current];
    if (direction === "front" || direction === "back") {
      const chosen = next.filter((e) => selectedIds.includes(e.id)),
        rest = next.filter((e) => !selectedIds.includes(e.id));
      next =
        direction === "front" ? [...rest, ...chosen] : [...chosen, ...rest];
    } else {
      const units: Element[][] = [];
      for (const e of next) {
        const previous = units.at(-1);
        if (e.groupId && previous?.[0].groupId === e.groupId) previous.push(e);
        else units.push([e]);
      }
      const chosen = (unit: Element[]) =>
        unit.some((e) => selectedIds.includes(e.id));
      if (direction === "up") {
        for (let i = units.length - 2; i >= 0; i--)
          if (chosen(units[i]) && !chosen(units[i + 1]))
            [units[i], units[i + 1]] = [units[i + 1], units[i]];
      } else {
        for (let i = 1; i < units.length; i++)
          if (chosen(units[i]) && !chosen(units[i - 1]))
            [units[i], units[i - 1]] = [units[i - 1], units[i]];
      }
      next = units.flat();
    }
    commit(next);
  }
  function group() {
    const groupId = id();
    const rest = elementsRef.current.filter((e) => !selectedIds.includes(e.id));
    commit([...rest, ...selected.map((e) => ({ ...e, groupId }))]);
  }

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    let active = true;
    void loadMarkerFontCss()
      .then((css) => {
        if (active) setFontCss(css);
      })
      .catch(() => {
        /* Retry and report only if text is saved. */
      });
    dialog.current?.focus();
    return () => {
      active = false;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (event.key === "Tab") {
        const controls = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, textarea, select, [tabindex="0"]',
          ) ?? [],
        ).filter((e) => e.getClientRects().length);
        if (
          event.shiftKey &&
          (target === controls[0] || target === dialog.current)
        ) {
          event.preventDefault();
          controls.at(-1)?.focus();
        } else if (!event.shiftKey && target === controls.at(-1)) {
          event.preventDefault();
          controls[0]?.focus();
        }
        return;
      }
      if (target.matches("input, textarea, select") || target.isContentEditable)
        return;
      const mod = event.ctrlKey || event.metaKey,
        key = event.key.toLowerCase();
      if (mod && ["z", "y", "c", "v", "d"].includes(key)) {
        event.preventDefault();
        if (key === "z") travel(event.shiftKey ? 1 : -1);
        if (key === "y") travel(1);
        if (key === "c") clipboard.current = clone(selected);
        if (key === "v") paste();
        if (key === "d") paste(selected);
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        remove();
      } else if (key.startsWith("arrow") && selected.length) {
        event.preventDefault();
        const d = event.shiftKey ? 10 : 1;
        patch(
          (e) =>
            translateMarkerElement(
              e,
              key === "arrowleft" ? -d : key === "arrowright" ? d : 0,
              key === "arrowup" ? -d : key === "arrowdown" ? d : 0,
            ),
          "nudge",
        );
      } else if (key === "escape") {
        event.preventDefault();
        setTool("select");
        setDrawer(null);
        setSelectedIds([]);
      }
    }
    const node = dialog.current;
    node?.addEventListener("keydown", keydown);
    return () => node?.removeEventListener("keydown", keydown);
  });
  async function save() {
    if (!elements.length) {
      setError("Ajoutez au moins un élément avant d’enregistrer.");
      return;
    }
    if (!name.trim()) {
      setError("Donnez un nom à votre marqueur.");
      dialog.current
        ?.querySelector<HTMLInputElement>('[name="marker-name"]')
        ?.focus();
      return;
    }
    setSaving(true);
    try {
      const css = elements.some((e) => e.type === "text")
        ? fontCss || (await loadMarkerFontCss())
        : "";
      onSave({
        name: name.trim(),
        elements,
        dataUrl: createDrawnMarkerDataUrl(elements, css),
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Impossible de préparer le marqueur.",
      );
    } finally {
      setSaving(false);
    }
  }
  function choose(next: DesignerTool) {
    setTool(next);
    setDrawer(null);
    setSelectedIds([]);
  }
  const button = (
    label: string,
    icon: string,
    action: () => void,
    active = false,
  ) => (
    <button type="button" title={label} aria-pressed={active} onClick={action}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
  return typeof document === "undefined"
    ? null
    : createPortal(
        <div className={styles.backdrop} data-dromap-tool-settings-panel="true">
          <section
            ref={dialog}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="marker-designer-title"
            className={styles.dialog}
          >
            <header className={styles.header}>
              <div>
                <h2 id="marker-designer-title">
                  {initialMarker ? "Modifier le marqueur" : "Créer un marqueur"}
                </h2>
                <p>Composez votre symbole, directement dans le dessin.</p>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={index.current === 0}
                  onClick={() => travel(-1)}
                  title="Annuler — Ctrl+Z"
                >
                  ↶ Annuler
                </button>
                <button
                  type="button"
                  disabled={index.current === history.current.length - 1}
                  onClick={() => travel(1)}
                  title="Rétablir — Ctrl+Y"
                >
                  ↷ Rétablir
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  aria-label="Fermer le créateur"
                >
                  ×
                </button>
              </div>
            </header>
            <div className={styles.workspace}>
              <aside className={styles.tools} aria-label="Ajouter au marqueur">
                {button(
                  "Sélection",
                  "↖",
                  () => choose("select"),
                  tool === "select" && !drawer,
                )}
                {button(
                  "Symbole",
                  "✣",
                  () => {
                    choose("select");
                    setDrawer(drawer === "symbols" ? null : "symbols");
                  },
                  drawer === "symbols",
                )}
                {button(
                  "Formes",
                  "○",
                  () => {
                    choose("select");
                    setDrawer(drawer === "shapes" ? null : "shapes");
                  },
                  drawer === "shapes",
                )}
                {drawer === "shapes" && (
                  <div className={styles.shapeChoices}>
                    {SHAPES.map(([kind, label, icon, radius]) => (
                      <button
                        key={label}
                        type="button"
                        title={label}
                        onClick={() => shape(kind, radius)}
                      >
                        <span aria-hidden="true">{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {button("Ligne", "╱", () => choose("line"), tool === "line")}
                {button(
                  "Trait courbe",
                  "⌒",
                  () => choose("curved-line"),
                  tool === "curved-line",
                )}
                {button("Flèche", "→", () => choose("arrow"), tool === "arrow")}
                {button(
                  "Polygone",
                  "⬠",
                  () => choose("polygon"),
                  tool === "polygon",
                )}
                {button("Texte", "T", () => {
                  setDrawer(null);
                  add({
                    id: id(),
                    type: "text",
                    x: 80,
                    y: 145,
                    width: 200,
                    height: 70,
                    rotation: 0,
                    text: "Texte",
                    fontSize: 42,
                    fontWeight: 700,
                    textAlign: "center",
                    color: "#194858",
                    opacity: 1,
                  });
                })}
                {button(
                  "Dessin libre",
                  "〰",
                  () => choose("freehand-line"),
                  tool === "freehand-line",
                )}
              </aside>
              <main className={styles.stage}>
                {drawer === "symbols" && (
                  <section
                    className={styles.symbols}
                    aria-label="Bibliothèque de symboles"
                  >
                    <div className={styles.symbolSearch}>
                      <input
                        autoFocus
                        aria-label="Rechercher un symbole"
                        placeholder="Église, gare, croix…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setDrawer(null)}
                        aria-label="Fermer les symboles"
                      >
                        ×
                      </button>
                    </div>
                    <div className={styles.symbolGrid}>
                      {results.map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          title={s.label}
                          aria-label={`Ajouter ${s.label}`}
                          onClick={() => {
                            shape("rectangle", 0, s.id);
                            setDrawer(null);
                          }}
                        >
                          <img
                            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(getBuiltinMarkerCompositionSvg(s.id, "#194858"))}`}
                            alt=""
                          />
                          <span>{s.label}</span>
                        </button>
                      ))}
                      {!results.length && <p>Aucun symbole trouvé.</p>}
                    </div>
                  </section>
                )}
                <div className={styles.canvas}>
                  <CustomMarkerFabricCanvas
                    elements={elements}
                    activeTool={tool}
                    selectedElementIds={selectedIds}
                    linePreset={linePreset}
                    zonePreset={ZONE}
                    textPreset={TEXT}
                    onSelectElements={setSelectedIds}
                    onCommitElements={commit}
                    onSwitchToSelect={() => setTool("select")}
                  />
                  {elements.length === 0 && tool === "select" && (
                    <p className={styles.empty}>
                      Ajoutez une forme, un symbole, du texte ou dessinez
                      directement.
                    </p>
                  )}
                </div>
                <p className={styles.hint}>
                  {tool === "polygon"
                    ? "Cliquez pour ajouter un sommet. Double-cliquez ou cliquez sur le premier point pour terminer. Échap pour annuler."
                    : tool === "line" || tool === "curved-line" || tool === "arrow"
                      ? tool === "curved-line"
                        ? "Cliquez au départ, puis à l’arrivée. Déplacez ensuite la poignée centrale ; double-cliquez sur le trait pour en ajouter une."
                        : "Cliquez au départ, puis à l’arrivée. Les directions parallèles et à 90° s’aimantent. Échap pour annuler."
                      : tool === "freehand-line"
                        ? "Cliquez et glissez pour dessiner. Relâchez pour terminer."
                        : "Déplacez, redimensionnez et tournez avec les poignées. Fond transparent."}
                </p>
              </main>
              <aside
                className={styles.properties}
                aria-label="Propriétés de la sélection"
              >
                <h3>
                  {current
                    ? markerElementLabel(current)
                    : selected.length
                      ? `${selected.length} éléments sélectionnés`
                      : "Votre sélection"}
                </h3>
                {!selected.length && tool === "select" && (
                  <p className={styles.muted}>
                    Cliquez sur un élément du dessin pour le modifier.
                  </p>
                )}
                {!selected.length &&
                  ["line", "curved-line", "arrow", "freehand-line"].includes(tool) && (
                    <>
                      <ColorField
                        label="Couleur du trait"
                        value={linePreset.color}
                        recent={recent}
                        onChange={(color) =>
                          setLinePreset((p) => ({ ...p, color }))
                        }
                      />
                      <NumberField
                        label="Épaisseur"
                        value={linePreset.weight}
                        min={1}
                        max={24}
                        onChange={(weight) =>
                          setLinePreset((p) => ({ ...p, weight }))
                        }
                      />
                    </>
                  )}
                {selected.length > 0 && (
                  <>
                    <MarkerProperties
                      selected={selected}
                      recent={recent}
                      rememberColor={(value) =>
                        setRecent((r) =>
                          [value, ...r.filter((c) => c !== value)].slice(0, 8),
                        )
                      }
                      patch={patch}
                    />
                    <div className={styles.section}>
                      <h4>
                        Aligner{" "}
                        {selected.length === 1
                          ? "sur le marqueur"
                          : "la sélection"}
                      </h4>
                      <div className={styles.smallGrid}>
                        {ALIGN.filter(
                          (_, i) => selected.length > 1 || i < 2,
                        ).map(([direction, label]) => (
                          <button
                            type="button"
                            key={direction}
                            title={label}
                            onClick={() =>
                              commit(
                                alignMarkerElements(
                                  elementsRef.current,
                                  selectedIds,
                                  direction,
                                ),
                              )
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.section}>
                      <h4>Superposition</h4>
                      <div className={styles.smallGrid}>
                        {(
                          [
                            ["front", "Premier plan"],
                            ["up", "Avancer"],
                            ["down", "Reculer"],
                            ["back", "Arrière-plan"],
                          ] as const
                        ).map(([d, label]) => (
                          <button
                            type="button"
                            key={d}
                            onClick={() => order(d)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.smallGrid}>
                      {selected.length > 1 && (
                        <button type="button" onClick={group}>
                          Grouper
                        </button>
                      )}
                      {selected.some((e) => e.groupId) && (
                        <button
                          type="button"
                          onClick={() =>
                            patch(
                              (e) => ({ ...e, groupId: undefined }),
                              "ungroup",
                            )
                          }
                        >
                          Dégrouper
                        </button>
                      )}
                      <button type="button" onClick={() => paste(selected)}>
                        Dupliquer
                      </button>
                      <button type="button" onClick={remove}>
                        Supprimer
                      </button>
                    </div>
                  </>
                )}
                {!!elements.length && (
                  <details className={styles.section}>
                    <summary>Éléments ({elements.length})</summary>
                    <div className={styles.elementList}>
                      {elements
                        .filter(
                          (e, i, all) =>
                            !e.groupId ||
                            all.findIndex((x) => x.groupId === e.groupId) === i,
                        )
                        .slice()
                        .reverse()
                        .map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            aria-pressed={selectedIds.includes(e.id)}
                            onClick={() => {
                              setTool("select");
                              setSelectedIds(
                                e.groupId
                                  ? elements
                                      .filter((x) => x.groupId === e.groupId)
                                      .map((x) => x.id)
                                  : [e.id],
                              );
                            }}
                          >
                            {markerElementLabel(e)}
                          </button>
                        ))}
                    </div>
                  </details>
                )}
                <div className={styles.preview}>
                  <h4>Aperçu sur la carte</h4>
                  <div>
                    {([24, 40, 64] as const).map((size, i) => (
                      <figure key={size}>
                        <img
                          src={svgUrl}
                          width={size}
                          height={size}
                          alt={`Aperçu ${["petit", "normal", "grand"][i]}`}
                        />
                        <figcaption>
                          {["Petit", "Normal", "Grand"][i]}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
            <footer className={styles.footer}>
              <div>
                <p className={styles.shortcuts}>
                  Maj + clic : sélection multiple · Suppr : supprimer · Ctrl+Z :
                  annuler
                </p>
                {error && (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                )}
              </div>
              <label>
                Nom du marqueur
                <input
                  name="marker-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mon marqueur"
                  maxLength={100}
                />
              </label>
              <button
                type="button"
                className={styles.save}
                disabled={saving}
                onClick={save}
              >
                {saving ? "Enregistrement…" : "Enregistrer le marqueur"}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      );
}
