import { describe, it, expect } from "vitest";
import { detectGeoFile, GEO_MAX_FILE_BYTES } from "@/lib/geospatial";

// jsdom ne fournit pas Blob.arrayBuffer/text
const read = (b: Blob, as: "buf" | "txt") => new Promise<ArrayBuffer | string>((res) => {
  const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer | string);
  if (as === "buf") r.readAsArrayBuffer(b); else r.readAsText(b);
});
Blob.prototype.arrayBuffer = function () { return read(this, "buf") as Promise<ArrayBuffer>; };
Blob.prototype.text = function () { return read(this, "txt") as Promise<string>; };

const f = (content: string, name: string) => new File([content], name);

describe("détection des fichiers géospatiaux", () => {
  it("accepte un GeoJSON FeatureCollection", async () => {
    const r = await detectGeoFile(f(JSON.stringify({ type: "FeatureCollection", features: [] }), "a.geojson"));
    expect(r).toMatchObject({ ok: true, format: "GeoJSON" });
  });
  it("refuse un JSON sans géométrie", async () => {
    expect((await detectGeoFile(f('{"a":1}', "a.json"))).ok).toBe(false);
  });
  it("refuse un faux ZIP", async () => {
    expect((await detectGeoFile(f("hello", "a.zip"))).ok).toBe(false);
  });
  it("refuse un exécutable", async () => {
    expect((await detectGeoFile(f("x", "virus.exe"))).ok).toBe(false);
  });
  it("refuse un fichier au-delà de la limite", async () => {
    const big = new File([new Uint8Array(GEO_MAX_FILE_BYTES + 1)], "big.kml");
    expect((await detectGeoFile(big)).ok).toBe(false);
  });
});
