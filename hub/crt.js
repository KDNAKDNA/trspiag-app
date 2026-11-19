// Filtro de TV análoga en WebGL: curvatura, scanlines, máscara RGB, colores corridos,
// ruido, barra que rueda y glitches de circuit bending.
// Dibuja una fuente (el canvas de texto del hub o un <video>) en el canvas #crt.
const CRT = (() => {
  const VS = `
    attribute vec2 p; varying vec2 vUv;
    void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

  const FS = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform vec2 uRes, uSrcRes;
    uniform float uTime, uCurv, uScan, uBend, uNoise, uPower, uIsText;
    varying vec2 vUv;

    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    vec2 curva(vec2 uv){
      uv = uv * 2.0 - 1.0;
      vec2 o = abs(uv.yx);
      uv += uv * o * o * uCurv;
      return uv * 0.5 + 0.5;
    }

    void main(){
      vec2 uv = curva(vUv);

      // encendido: primero una línea, luego se abre la imagen
      float sy = mix(0.004, 1.0, smoothstep(0.15, 0.6, uPower));
      float sx = smoothstep(0.0, 0.15, uPower);
      vec2 c = uv - 0.5;
      if (abs(c.y) > sy * 0.5 || abs(c.x) > sx * 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      uv.y = 0.5 + c.y / max(sy, 0.004);

      float t = uTime;
      // circuit bending: franjas horizontales que se corren
      float nb = mix(6.0, 40.0, rnd(vec2(floor(t * 12.0), 1.0)));
      float band = floor(uv.y * nb);
      float r = rnd(vec2(band, floor(t * 15.0)));
      float shift = (r > 1.0 - uBend * 0.6) ? (rnd(vec2(band, t)) - 0.5) * 0.25 * uBend : 0.0;

      // barra de interferencia que rueda
      float roll = fract(t * 0.07);
      float rb = smoothstep(0.0, 0.05, abs(uv.y - roll));
      shift += (1.0 - rb) * 0.004;

      // temblor de tracking por línea
      shift += (rnd(vec2(floor(uv.y * uSrcRes.y), floor(t * 30.0))) - 0.5) * 0.0015 * (uNoise * 2.0 + uBend * 4.0);

      vec2 s = vec2(uv.x + shift, uv.y);
      float ab = 0.0012 + uBend * 0.012;
      vec3 col;
      col.r = texture2D(uTex, s + vec2(ab, 0.0)).r;
      col.g = texture2D(uTex, s).g;
      col.b = texture2D(uTex, s - vec2(ab, 0.0)).b;
      if (uBend > 0.55 && r > 0.8) col = col.brg;     // canales cruzados

      // brillo del fósforo que se corre hacia los lados (solo texto)
      vec3 g = texture2D(uTex, s + vec2(1.5 / uSrcRes.x, 0.0)).rgb + texture2D(uTex, s - vec2(1.5 / uSrcRes.x, 0.0)).rgb;
      col += g * 0.22 * uIsText;

      // scanlines (una por línea de la fuente) y máscara de apertura RGB
      float sl = sin(uv.y * uSrcRes.y * 6.28318) * 0.5 + 0.5;
      col *= mix(1.0, 0.6 + 0.4 * sl, uScan);
      float m = mod(gl_FragCoord.x, 3.0);
      vec3 mask = vec3(m < 1.0 ? 1.0 : 0.78, (m >= 1.0 && m < 2.0) ? 1.0 : 0.78, m >= 2.0 ? 1.0 : 0.78);
      col *= mix(vec3(1.0), mask, uScan * 0.7);

      // nieve, parpadeo y viñeta
      col += (rnd(uv * uRes + t * 60.0) - 0.5) * uNoise;
      col *= 1.0 - (1.0 - rb) * 0.12;
      col *= 0.965 + 0.035 * sin(t * 113.0);
      vec2 v = uv * (1.0 - uv);
      col *= pow(clamp(v.x * v.y * 16.0, 0.0, 1.0), 0.22 + uCurv);

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);

      // destello verde al encender
      col += (1.0 - smoothstep(0.25, 0.8, uPower)) * vec3(0.5, 1.0, 0.6) * step(0.001, uPower);
      gl_FragColor = vec4(col, 1.0);
    }`;

  let gl, prog, tex, U = {}, canvas;
  const P = { curv: 0.06, scan: 1, bend: 0, noise: 0.05, power: 1, isText: 1 };

  function init(cv) {
    canvas = cv;
    gl = cv.getContext("webgl", { antialias: false, preserveDrawingBuffer: false });
    if (!gl) { alert("Este navegador no tiene WebGL."); return; }
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uTex", "uRes", "uSrcRes", "uTime", "uCurv", "uScan", "uBend", "uNoise", "uPower", "uIsText"]) {
      U[n] = gl.getUniformLocation(prog, n);
    }
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  // fuente: canvas o video; pixelado = true para el texto (bordes duros)
  function dibujar(fuente, srcW, srcH, pixelado, tiempo) {
    if (!gl) return;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const f = pixelado ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, fuente); } catch (e) { return; }
    gl.uniform1i(U.uTex, 0);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform2f(U.uSrcRes, srcW, srcH);
    gl.uniform1f(U.uTime, tiempo);
    gl.uniform1f(U.uCurv, P.curv);
    gl.uniform1f(U.uScan, P.scan);
    gl.uniform1f(U.uBend, P.bend);
    gl.uniform1f(U.uNoise, P.noise);
    gl.uniform1f(U.uPower, P.power);
    gl.uniform1f(U.uIsText, P.isText);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { init, dibujar, P };
})();
