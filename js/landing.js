// Landing page: one of the landscape photographs, broken into a pixel mosaic
// and dithered into film-like grain, drawn with WebGL. Moving the pointer drops
// ripples into a water simulation that bends the pattern (after spacefs.com's
// background, but driven by the pointer instead of scrolling).
//
// The ripple simulation runs on the CPU on a coarse grid and is uploaded as a
// small texture each frame; the shader uses its slope to displace the image.
// If WebGL is unavailable, the blurred CSS background in index.html stays.

// Landscape photographs (people only small in the scene); one is picked per visit.
const POOL = [
  "phoenix200_08", "phoenix200_09", "phoenix200_10", "phoenix200_11", "phoenix200_12",
  "phoenix200_13", "phoenix200_14", "phoenix200_15", "phoenix200_16", "phoenix200_23", "phoenix200_24",
  "portra400_01", "portra400_02", "portra400_04", "portra400_05", "portra400_06", "portra400_07",
  "portra400_08", "portra400_30", "portra400_31", "portra400_32",
  "gold200_10", "gold200_11", "gold200_12", "gold200_30", "gold200_31",
  "fujicolor200_11", "fujicolor200_12",
];
const photo = `images/film/thumbs/${POOL[Math.floor(Math.random() * POOL.length)]}.jpg`;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const CELL = 12;      // mosaic cell size, CSS px
const SIM = 6;        // ripple grid spacing, CSS px
const DAMPING = 0.982;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D uPhoto;
uniform sampler2D uRipple;
uniform vec2 uRes;         // canvas size, device px
uniform vec2 uPhotoSize;
uniform vec2 uRippleTexel; // 1 / ripple grid size
uniform float uTime;
uniform float uCell;       // device px
uniform float uDpr;
uniform float uMotion;     // 0 with reduced motion

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Device-pixel position -> photo uv, scaled to cover the screen.
vec2 coverUv(vec2 px) {
  float s = max(uRes.x / uPhotoSize.x, uRes.y / uPhotoSize.y);
  return (px - 0.5 * uRes) / (uPhotoSize * s) + 0.5;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uRes;

  // Ripple height and slope; the slope bends the image like light through water.
  float h = texture2D(uRipple, uv).r - 0.5;
  float hx = texture2D(uRipple, uv + vec2(uRippleTexel.x, 0.0)).r - texture2D(uRipple, uv - vec2(uRippleTexel.x, 0.0)).r;
  float hy = texture2D(uRipple, uv + vec2(0.0, uRippleTexel.y)).r - texture2D(uRipple, uv - vec2(0.0, uRippleTexel.y)).r;
  vec2 p = px + vec2(hx, hy) * uRes.x * 0.05;

  // A slow, faint drift so the pattern is never completely still.
  p += uMotion * uCell * 0.7 * vec2(sin(px.y * 0.004 / uDpr + uTime * 0.35), cos(px.x * 0.003 / uDpr - uTime * 0.28));

  // Pixel mosaic over a softened photo: each cell takes the average color of a
  // wide area around it (a 4x4 grid spanning about 5 cells), so only broad
  // bands of color survive and the picture turns into a pattern.
  vec2 cell = (floor(p / uCell) + 0.5) * uCell;
  vec3 col = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = (vec2(float(i), float(j)) - 1.5) * uCell * 1.6;
      col += texture2D(uPhoto, coverUv(cell + o)).rgb;
    }
  }
  col /= 16.0;

  // Richer color, like an enlarged film print.
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.45);
  col = (col - 0.5) * 1.1 + 0.5;
  col += h * 0.15; // ripple crests catch a little light

  // Film-grain dither: quantize each channel with its own noise, so colors
  // break into fine speckle instead of smooth gradients.
  vec2 g = floor(px / (1.5 * uDpr));
  float t = floor(uTime * 10.0) * uMotion;
  // Mostly shared (light/dark) noise with a little per-channel color, like film grain.
  float shared = hash(g + t * 17.0) - 0.5;
  vec3 tint = vec3(hash(g.yx + t * 31.0 + 3.7), hash(g + 11.3 + t * 7.0), hash(g * 1.7 + 5.1 + t * 13.0)) - 0.5;
  vec3 n = shared * 0.8 + tint * 0.35;
  float levels = 4.0;
  col = floor(col * levels + n * 1.3 + 0.5) / levels;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function start() {
  const canvas = document.getElementById("landing-canvas");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return;

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  // One triangle that covers the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(prog, name);
  const texture = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    // Sizes are not powers of two, so no mipmaps and no wrapping.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const photoTex = texture(0);
  const rippleTex = texture(1);
  gl.uniform1i(u("uPhoto"), 0);
  gl.uniform1i(u("uRipple"), 1);

  // ---- Ripple simulation: the classic two-buffer wave equation ----
  let W = 0, H = 0, prev, cur, bytes;
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u("uRes"), canvas.width, canvas.height);
    gl.uniform1f(u("uCell"), CELL * dpr);
    gl.uniform1f(u("uDpr"), dpr);
    W = Math.ceil(innerWidth / SIM) + 2;
    H = Math.ceil(innerHeight / SIM) + 2;
    prev = new Float32Array(W * H);
    cur = new Float32Array(W * H);
    bytes = new Uint8Array(W * H).fill(128);
    gl.uniform2f(u("uRippleTexel"), 1 / W, 1 / H);
    upload();
  }
  function step() {
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W]) * 0.5 - prev[i]) * DAMPING;
      }
    }
    [prev, cur] = [cur, prev];
  }
  function upload() {
    for (let i = 0; i < cur.length; i++) bytes[i] = Math.max(0, Math.min(255, 128 + cur[i] * 48));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rippleTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // rows aren't a multiple of 4 bytes
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, W, H, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
  }
  // Drop a small ring of disturbance at a screen point. Grid row 0 is the
  // bottom of the screen, to match the shader's gl_FragCoord.
  function drop(clientX, clientY, amount) {
    const gx = Math.round(clientX / SIM) + 1;
    const gy = H - 2 - Math.round(clientY / SIM);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = gx + dx, y = gy + dy, d = dx * dx + dy * dy;
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && d <= 5) cur[y * W + x] += amount * (1 - d / 6);
      }
    }
  }

  // Follow the pointer, filling in drops along fast moves so trails are smooth.
  let last = null;
  if (!reduceMotion) {
    addEventListener("pointermove", (e) => {
      const p = { x: e.clientX, y: e.clientY };
      if (last) {
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        const steps = Math.min(12, Math.ceil(dist / SIM));
        const amount = Math.min(1.6, 0.35 + dist / 40);
        for (let s = 1; s <= steps; s++) {
          drop(last.x + (p.x - last.x) * s / steps, last.y + (p.y - last.y) * s / steps, amount / Math.sqrt(steps));
        }
      }
      last = p;
    }, { passive: true });
    addEventListener("pointerleave", () => { last = null; });
    addEventListener("pointerdown", (e) => drop(e.clientX, e.clientY, 2.5), { passive: true });
  }

  const startTime = performance.now();
  function frame(now) {
    gl.uniform1f(u("uTime"), (now - startTime) / 1000);
    if (!reduceMotion) { step(); upload(); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  const img = new Image();
  img.onload = () => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, photoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // image rows top-down; GL is bottom-up
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.uniform2f(u("uPhotoSize"), img.naturalWidth, img.naturalHeight);
    gl.uniform1f(u("uMotion"), reduceMotion ? 0 : 1);
    resize();
    addEventListener("resize", () => { resize(); if (reduceMotion) frame(performance.now()); });
    document.body.classList.add("gl"); // hide the CSS fallback
    requestAnimationFrame(frame);
  };
  img.src = photo;
}

// Point the no-WebGL fallback at the same photo, then try WebGL.
document.querySelector(".landing-bg").style.backgroundImage = `url('${photo}')`;
try { start(); } catch (err) { console.warn("Landing effect unavailable:", err); }
