/**
 * WebGL2 additive colour compositor for single-filter frames.
 * All layers of a dataset share one size → one R8 TEXTURE_2D_ARRAY (with mipmaps).
 */
import type { GlobalState, LayerState } from "@/lib/lab/types";

export const MAX_LAYERS = 8;

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
precision mediump sampler2DArray;
uniform sampler2DArray u_layers;
uniform int u_count;
uniform vec3 u_color[${MAX_LAYERS}];
uniform float u_on[${MAX_LAYERS}];
uniform float u_black[${MAX_LAYERS}];
uniform float u_white[${MAX_LAYERS}];
uniform float u_gamma[${MAX_LAYERS}];
uniform float u_asinh[${MAX_LAYERS}];
uniform float u_mode[${MAX_LAYERS}];
uniform float u_gain[${MAX_LAYERS}];
uniform float u_exposure;
uniform float u_saturation;
uniform float u_contrast;
uniform int u_tone;
uniform vec2 u_canvas;   // device px
uniform vec2 u_center;   // image px at canvas centre
uniform float u_zoom;    // device px per image px
uniform vec2 u_img;      // image size
uniform float u_flipY;   // 1 for on-screen, 0 for export framebuffer
out vec4 o;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, mix(gl_FragCoord.y, u_canvas.y - gl_FragCoord.y, u_flipY));
  vec2 px = (frag - 0.5 * u_canvas) / u_zoom + u_center;
  vec2 uv = px / u_img;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { o = vec4(0.012, 0.016, 0.027, 1.0); return; }
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    if (i >= u_count) break;
    if (u_on[i] < 0.5) continue;
    float v = texture(u_layers, vec3(uv, float(i))).r;
    v = clamp((v - u_black[i]) / max(1e-4, u_white[i] - u_black[i]), 0.0, 1.0);
    if (u_mode[i] > 0.5) {
      float a = u_asinh[i];
      v = asinh(v * a) / asinh(a);
    } else {
      v = pow(v, 1.0 / u_gamma[i]);
    }
    acc += v * u_gain[i] * u_color[i];
  }
  acc *= u_exposure;
  float l = dot(acc, vec3(0.2126, 0.7152, 0.0722));
  acc = max(vec3(0.0), mix(vec3(l), acc, u_saturation));
  if (u_tone == 1) acc = aces(acc * 1.4);
  else if (u_tone == 2) acc = asinh(acc * 3.0) / asinh(3.0);
  acc = clamp(acc, 0.0, 1.0);
  // S-curve contrast around mid-grey
  vec3 s = acc * acc * (3.0 - 2.0 * acc);
  acc = mix(acc, s, u_contrast);
  o = vec4(acc, 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  // colours are authored in sRGB; compositing is done in that perceptual space on purpose
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export type View = { cx: number; cy: number; zoom: number };

export class Compositor {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture | null = null;
  private buf: WebGLBuffer | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  imgW = 1;
  imgH = 1;
  count = 0;
  maxTexture: number;

  static supported(): boolean {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2");
      // release the probe context right away; browsers cap live contexts per page
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      return !!gl;
    } catch {
      return false;
    }
  }

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: false, alpha: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    if (gl.isContextLost()) throw new Error("the GPU context was lost; reload the page");
    this.gl = gl;
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    this.buf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of [
      "u_layers", "u_count", "u_exposure", "u_saturation", "u_contrast", "u_tone", "u_canvas", "u_center", "u_zoom", "u_img", "u_flipY",
      "u_color", "u_on", "u_black", "u_white", "u_gamma", "u_asinh", "u_mode", "u_gain",
    ]) {
      this.loc[n] = gl.getUniformLocation(p, n) ?? gl.getUniformLocation(p, `${n}[0]`);
    }
  }

  /** Upload a dataset's frames (all the same size) into a texture array. */
  setLayers(images: (HTMLImageElement | ImageBitmap)[], w: number, h: number) {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.R8, w, h, images.length);
    images.forEach((img, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RED, gl.UNSIGNED_BYTE, img));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.imgW = w;
    this.imgH = h;
    this.count = images.length;
  }

  private uniforms(layers: LayerState[], g: GlobalState) {
    const gl = this.gl;
    const n = MAX_LAYERS;
    const col = new Float32Array(n * 3), on = new Float32Array(n), bl = new Float32Array(n), wh = new Float32Array(n);
    const ga = new Float32Array(n), as = new Float32Array(n), mo = new Float32Array(n), gn = new Float32Array(n);
    // normalise so that all-on layers at full gain stay within range per channel (scalar → no colour cast)
    const sum = [0, 0, 0];
    layers.forEach((L, i) => {
      const [r, gg, b] = hexToRgb(L.color);
      col.set([r, gg, b], i * 3);
      on[i] = L.on ? 1 : 0;
      bl[i] = L.black;
      wh[i] = L.white;
      ga[i] = L.gamma;
      as[i] = L.asinh;
      mo[i] = L.mode === "asinh" ? 1 : 0;
      gn[i] = L.gain;
      if (L.on) {
        sum[0] += r * L.gain;
        sum[1] += gg * L.gain;
        sum[2] += b * L.gain;
      }
    });
    const norm = 1 / Math.max(1, ...sum);
    gl.uniform1i(this.loc.u_layers, 0);
    gl.uniform1i(this.loc.u_count, Math.min(this.count, layers.length));
    gl.uniform3fv(this.loc.u_color, col);
    gl.uniform1fv(this.loc.u_on, on);
    gl.uniform1fv(this.loc.u_black, bl);
    gl.uniform1fv(this.loc.u_white, wh);
    gl.uniform1fv(this.loc.u_gamma, ga);
    gl.uniform1fv(this.loc.u_asinh, as);
    gl.uniform1fv(this.loc.u_mode, mo);
    gl.uniform1fv(this.loc.u_gain, gn);
    gl.uniform1f(this.loc.u_exposure, Math.pow(2, g.exposure) * norm * 1.6);
    gl.uniform1f(this.loc.u_saturation, g.saturation);
    gl.uniform1f(this.loc.u_contrast, g.contrast);
    gl.uniform1i(this.loc.u_tone, g.tone === "filmic" ? 1 : g.tone === "soft" ? 2 : 0);
    gl.uniform2f(this.loc.u_img, this.imgW, this.imgH);
  }

  render(layers: LayerState[], g: GlobalState, view: View) {
    if (!this.tex) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    this.uniforms(layers, g);
    gl.uniform2f(this.loc.u_canvas, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.loc.u_center, view.cx, view.cy);
    gl.uniform1f(this.loc.u_zoom, view.zoom);
    gl.uniform1f(this.loc.u_flipY, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Render the full frame at native resolution and return it as a PNG blob. */
  async exportPNG(layers: LayerState[], g: GlobalState, credit: string): Promise<Blob> {
    const gl = this.gl;
    const w = this.imgW, h = this.imgH;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    this.uniforms(layers, g);
    gl.uniform2f(this.loc.u_canvas, w, h);
    gl.uniform2f(this.loc.u_center, w / 2, h / 2);
    gl.uniform1f(this.loc.u_zoom, 1);
    gl.uniform1f(this.loc.u_flipY, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const px = new Uint8ClampedArray(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.putImageData(new ImageData(px, w, h), 0, 0);
    const fs = Math.max(12, Math.round(w / 140));
    ctx.font = `${fs}px ui-monospace, monospace`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = "right";
    ctx.fillText(credit, w - fs, h - fs);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
  }

  /**
   * Free GPU resources but keep the context alive: Next.js keeps visited routes mounted
   * (hidden) and re-runs effects on the same <canvas> when you come back, so losing the
   * context here would hand the next Compositor a dead context.
   */
  dispose() {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.buf) gl.deleteBuffer(this.buf);
    gl.deleteProgram(this.prog);
    this.tex = null;
    this.buf = null;
  }
}
