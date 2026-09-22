import type { DroMapDrawnMarkerElement as Element } from "@/stores/editor-custom-markers";
import styles from "./custom-marker-designer.module.css";

export function ColorField({
  label,
  value,
  recent,
  onChange,
}: {
  label: string;
  value: string;
  recent: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.colorRow}>
        <label>
          {label}
          <input
            aria-label={label}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <input
          aria-label={`${label} HEX`}
          key={value}
          defaultValue={value}
          maxLength={7}
          onBlur={(e) => {
            if (/^#[\da-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
            else e.target.value = value;
          }}
        />
      </div>
      <div className={styles.swatches}>
        {recent.map((c) => (
          <button
            key={c}
            type="button"
            title={`Utiliser ${c} pour ${label.toLowerCase()}`}
            aria-label={`Utiliser ${c} pour ${label.toLowerCase()}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}
export function NumberField({
  label,
  value,
  min = 0,
  max = 360,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className={styles.numberField}>
      {label}
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.target.value !== "")
            onChange(Math.min(max, Math.max(min, Number(e.target.value))));
        }}
      />
    </label>
  );
}
function primaryColor(e: Element) {
  return e.type === "text"
    ? e.color
    : e.type === "shape" || (e.type === "path" && e.closed)
      ? e.fillColor
      : e.strokeColor;
}
function setPrimaryColor(e: Element, value: string): Element {
  return e.type === "text"
    ? { ...e, color: value }
    : e.type === "shape" || (e.type === "path" && e.closed)
      ? { ...e, fillColor: value, fillEnabled: true }
      : { ...e, strokeColor: value };
}
export function MarkerProperties({
  selected,
  recent,
  rememberColor,
  patch,
}: {
  selected: Element[];
  recent: string[];
  rememberColor: (v: string) => void;
  patch: (fn: (e: Element) => Element, key: string) => void;
}) {
  const current = selected.length === 1 ? selected[0] : null;
  const isLine =
    current &&
    (current.type === "line" ||
      current.type === "arrow" ||
      (current.type === "path" && !current.closed));
  const shape =
    current &&
    ((current.type === "shape" && !current.symbolId) ||
      (current.type === "path" && current.closed))
      ? current
      : null;
  const opacity = current
    ? current.type === "text"
      ? (current.opacity ?? 1)
      : current.type === "shape" || (current.type === "path" && current.closed)
        ? (current.fillOpacity ?? 1)
        : (current.strokeOpacity ?? 1)
    : 1;
  const colored = (
    label: string,
    value: string,
    fn: (e: Element, color: string) => Element,
  ) => (
    <ColorField
      label={label}
      value={value}
      recent={recent}
      onChange={(v) => {
        rememberColor(v);
        patch((e) => fn(e, v), label);
      }}
    />
  );
  return (
    <>
      {selected.length > 1 && new Set(selected.map(primaryColor)).size > 1 && (
        <p className={styles.muted}>
          Couleurs différentes — choisir une couleur l’applique à toute la
          sélection.
        </p>
      )}
      {colored(
        shape ? "Remplissage" : "Couleur",
        primaryColor(selected[0]),
        setPrimaryColor,
      )}
      <label className={styles.field}>
        Opacité{" "}
        <input
          aria-label="Opacité"
          type="range"
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(ev) =>
            patch((e) => {
              const v = Number(ev.target.value) / 100;
              return e.type === "text"
                ? { ...e, opacity: v }
                : { ...e, fillOpacity: v, strokeOpacity: v };
            }, "opacity")
          }
        />
      </label>
      {shape && (shape.type === "shape" || shape.type === "path") && (
        <>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={shape.fillEnabled}
              onChange={(ev) =>
                patch(
                  (e) =>
                    "fillEnabled" in e
                      ? { ...e, fillEnabled: ev.target.checked }
                      : e,
                  "fill",
                )
              }
            />
            Remplissage
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={shape.strokeEnabled !== false}
              onChange={(ev) =>
                patch(
                  (e) =>
                    "strokeEnabled" in e
                      ? { ...e, strokeEnabled: ev.target.checked }
                      : e,
                  "stroke",
                )
              }
            />
            Contour
          </label>
          {colored("Couleur du contour", shape.strokeColor, (e, strokeColor) =>
            e.type !== "text" ? { ...e, strokeColor } : e,
          )}
          <NumberField
            label="Épaisseur du contour"
            value={shape.strokeWidth}
            max={40}
            onChange={(strokeWidth) =>
              patch(
                (e) => (e.type !== "text" ? { ...e, strokeWidth } : e),
                "weight",
              )
            }
          />
          {shape.type === "shape" && shape.shape === "rectangle" && (
            <NumberField
              label="Arrondi"
              value={
                shape.cornerRadius ??
                Math.min(18, shape.width / 8, shape.height / 8)
              }
              max={Math.min(shape.width, shape.height) / 2}
              onChange={(cornerRadius) =>
                patch(
                  (e) => (e.type === "shape" ? { ...e, cornerRadius } : e),
                  "radius",
                )
              }
            />
          )}
        </>
      )}
      {isLine &&
        current &&
        (current.type === "line" ||
          current.type === "arrow" ||
          current.type === "path") && (
          <>
            <NumberField
              label="Épaisseur"
              value={current.strokeWidth}
              min={1}
              max={40}
              onChange={(strokeWidth) =>
                patch(
                  (e) => (e.type !== "text" ? { ...e, strokeWidth } : e),
                  "weight",
                )
              }
            />
            <label className={styles.field}>
              Style
              <select
                value={current.dashStyle ?? "solid"}
                onChange={(ev) =>
                  patch(
                    (e) =>
                      e.type !== "text"
                        ? {
                            ...e,
                            dashStyle: ev.target.value as
                              | "solid"
                              | "dashed"
                              | "dotted",
                          }
                        : e,
                    "dash",
                  )
                }
              >
                <option value="solid">Plein</option>
                <option value="dashed">Tirets</option>
                <option value="dotted">Pointillés</option>
              </select>
            </label>
            {(["arrowStart", "arrowEnd"] as const).map((key) => (
              <label key={key} className={styles.check}>
                <input
                  type="checkbox"
                  checked={
                    Boolean(current[key]) ||
                    (key === "arrowEnd" && current.type === "arrow")
                  }
                  onChange={(ev) =>
                    patch(
                      (e) =>
                        e.type === "arrow"
                          ? {
                              ...e,
                              type: "line",
                              arrowEnd: true,
                              [key]: ev.target.checked,
                            }
                          : e.type === "line" || e.type === "path"
                            ? { ...e, [key]: ev.target.checked }
                            : e,
                      key,
                    )
                  }
                />
                {key === "arrowStart"
                  ? "Flèche au départ"
                  : "Flèche à l’arrivée"}
              </label>
            ))}
          </>
        )}
      {current?.type === "text" && (
        <>
          <label className={styles.field}>
            Contenu
            <textarea
              aria-label="Contenu du texte"
              value={current.text}
              onChange={(ev) =>
                patch(
                  (e) =>
                    e.type === "text" ? { ...e, text: ev.target.value } : e,
                  "text",
                )
              }
            />
          </label>
          <NumberField
            label="Taille du texte"
            value={current.fontSize}
            min={10}
            max={1200}
            onChange={(fontSize) =>
              patch(
                (e) => (e.type === "text" ? { ...e, fontSize } : e),
                "fontSize",
              )
            }
          />
          <label className={styles.field}>
            Graisse
            <select
              value={current.fontWeight ?? 700}
              onChange={(ev) =>
                patch(
                  (e) =>
                    e.type === "text"
                      ? { ...e, fontWeight: Number(ev.target.value) }
                      : e,
                  "bold",
                )
              }
            >
              <option value={400}>Normal</option>
              <option value={700}>Gras</option>
            </select>
          </label>
          <label className={styles.field}>
            Alignement du texte
            <select
              value={current.textAlign ?? "center"}
              onChange={(ev) =>
                patch(
                  (e) =>
                    e.type === "text"
                      ? {
                          ...e,
                          textAlign: ev.target.value as
                            | "left"
                            | "center"
                            | "right",
                        }
                      : e,
                  "textAlign",
                )
              }
            >
              <option value="left">Gauche</option>
              <option value="center">Centré</option>
              <option value="right">Droite</option>
            </select>
          </label>
        </>
      )}
    </>
  );
}
