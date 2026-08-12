import fs from 'node:fs';
import zlib from 'node:zlib';

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function inspectRgbaPng(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.subarray(1, 4).toString() !== 'PNG') throw new Error(`${file} is not a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString();
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`${file} must be non-interlaced 8-bit RGBA`);
    } else if (type === 'IDAT') idat.push(data);
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const source = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const target = pixels.subarray(row * stride, (row + 1) * stride);
    const previous = row ? pixels.subarray((row - 1) * stride, row * stride) : null;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= 4 ? target[index - 4] : 0;
      const up = previous?.[index] ?? 0;
      const upperLeft = previous && index >= 4 ? previous[index - 4] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : -1;
      if (predictor < 0) throw new Error(`${file} uses unsupported PNG filter ${filter}`);
      target[index] = (source[index] + predictor) & 0xff;
    }
  }
  const alpha = Buffer.alloc(width * height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = pixels[index * 4 + 3];
  return { width, height, alpha };
}
