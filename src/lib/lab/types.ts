export type LabRegistration = {
  method: "reference" | "native-grid" | "matched" | "seeded";
  /** present for "matched" / "seeded" */
  rms_px?: number;
  patches?: number;
  scale?: number;
  rotation_deg?: number;
};

export type LabFilter = {
  name: string;
  pivot_um: number;
  file: string;
  w: number;
  h: number;
  obs_id: string;
  esa_color: string | null;
  registration: LabRegistration;
};

export type LabDataset = {
  slug: string;
  title: string;
  target: string;
  blurb: string;
  instrument: string;
  programme: number;
  programme_title: string;
  pi: string;
  observed: string;
  esa_id: string | null;
  esa_note: string | null;
  width: number;
  height: number;
  bytes: number;
  filters: LabFilter[];
};

export type LabManifest = { generated: string; datasets: LabDataset[] };

export type StretchMode = "gamma" | "asinh";
export type ToneMode = "clip" | "filmic" | "soft";

export type LayerState = {
  on: boolean;
  color: string; // #rrggbb
  black: number; // 0..1
  white: number; // 0..1
  mode: StretchMode;
  gamma: number; // 0.3..3
  asinh: number; // 1..200
  gain: number; // 0..3
};

export type GlobalState = {
  exposure: number; // stops, -3..3
  saturation: number; // 0..2
  contrast: number; // 0..1 (S-curve strength)
  tone: ToneMode;
};
