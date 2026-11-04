// Kiiro — monta a imagem de "Me indica na Kiiro" (1200x630): moldura amarela + foto do profissional num círculo.
// Sem pacote externo: usa o jpeg-js (MIT) que está em ./jpeg.
import decode from "./jpeg/decoder.js";
import encode from "./jpeg/encoder.js";
import { MOLDE, SELO, CIRCULO } from "./og-molde.mjs";

let base = null;
const molde = () => (base ||= decode(Buffer.from(MOLDE, "base64"), { useTArray: true, formatAsRGBA: true }));
const seloA = Buffer.from(SELO.a, "base64");

export function montarImagem(fotoJpeg) {
  const m = molde();
  const W = m.width, H = m.height;
  const out = Buffer.from(m.data); // cópia RGBA
  let foto = null;
  if (fotoJpeg) {
    try { foto = decode(fotoJpeg, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 40, maxMemoryUsageInMB: 256 }); } catch { foto = null; }
  }
  if (foto && foto.width > 10 && foto.height > 10) {
    const { cx, cy, r } = CIRCULO;
    // recorte quadrado da foto, um pouco para cima (rosto costuma ficar no terço de cima)
    const lado = Math.min(foto.width, foto.height);
    const ox = (foto.width - lado) / 2;
    const oy = Math.max(0, Math.min(foto.height - lado, (foto.height - lado) * 0.3));
    const esc = lado / (2 * r);
    const fw = foto.width, fh = foto.height, fd = foto.data;
    const pega = (x, y, c) => fd[(Math.min(fh - 1, Math.max(0, y)) * fw + Math.min(fw - 1, Math.max(0, x))) * 4 + c];
    for (let y = cy - r - 1; y <= cy + r + 1; y++) {
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        let a = Math.max(0, Math.min(1, r - dist + 0.5)); // borda suave
        if (a <= 0) continue;
        // o selo "Me indica na Kiiro" fica por cima da foto
        const sx = x - SELO.x, sy = y - SELO.y;
        if (sx >= 0 && sy >= 0 && sx < SELO.w && sy < SELO.h) a *= 1 - seloA[sy * SELO.w + sx] / 255;
        if (a <= 0) continue;
        // amostra com média de 2x2 (bilinear simples)
        const fx = ox + (x - (cx - r)) * esc, fy = oy + (y - (cy - r)) * esc;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const i = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          const v = pega(x0, y0, c) * (1 - tx) * (1 - ty) + pega(x0 + 1, y0, c) * tx * (1 - ty) + pega(x0, y0 + 1, c) * (1 - tx) * ty + pega(x0 + 1, y0 + 1, c) * tx * ty;
          out[i + c] = Math.round(out[i + c] * (1 - a) + v * a);
        }
      }
    }
  }
  return Buffer.from(encode({ data: out, width: W, height: H }, 86).data);
}
