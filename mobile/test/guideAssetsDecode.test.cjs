const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const guideAssets = [
  'assets/Guides/Dana.png',
  'assets/Guides/Artur.png',
  'assets/Guides/DanaSelection.png',
  'assets/Guides/ArturSelection.png',
];

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(file) {
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length > 32, `${file}: PNG is empty/truncated`);
  assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10], `${file}: invalid PNG signature`);

  let offset = 8;
  let ihdr = null;
  let sawIend = false;
  const idat = [];

  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length, `${file}: truncated chunk header`);
    const length = bytes.readUInt32BE(offset); offset += 4;
    const type = bytes.toString('ascii', offset, offset + 4); offset += 4;
    assert.ok(offset + length + 4 <= bytes.length, `${file}: truncated ${type} chunk`);
    const data = bytes.subarray(offset, offset + length); offset += length;
    offset += 4; // CRC; zlib/image reconstruction below catches corrupted IDAT content.

    if (type === 'IHDR') {
      assert.equal(length, 13, `${file}: invalid IHDR`);
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      sawIend = true;
      assert.equal(length, 0, `${file}: invalid IEND`);
      break;
    }
  }

  assert.ok(ihdr, `${file}: missing IHDR`);
  assert.ok(sawIend, `${file}: missing IEND / truncated PNG`);
  assert.ok(idat.length > 0, `${file}: missing IDAT`);
  assert.equal(ihdr.compression, 0, `${file}: unsupported compression`);
  assert.equal(ihdr.filter, 0, `${file}: unsupported filter method`);
  assert.equal(ihdr.interlace, 0, `${file}: canonical guide PNG must be non-interlaced for deterministic decode check`);
  assert.equal(ihdr.bitDepth, 8, `${file}: expected 8-bit guide PNG`);

  const channels = ({0:1,2:3,3:1,4:2,6:4})[ihdr.colorType];
  assert.ok(channels, `${file}: unsupported color type ${ihdr.colorType}`);
  const bpp = channels;
  const rowBytes = ihdr.width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  assert.equal(
    inflated.length,
    ihdr.height * (rowBytes + 1),
    `${file}: decompressed pixel stream is truncated`,
  );

  let src = 0;
  let prior = Buffer.alloc(rowBytes);
  for (let y = 0; y < ihdr.height; y += 1) {
    const filter = inflated[src++];
    assert.ok(filter >= 0 && filter <= 4, `${file}: invalid row filter ${filter}`);
    const raw = inflated.subarray(src, src + rowBytes);
    src += rowBytes;
    const recon = Buffer.allocUnsafe(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bpp ? recon[x - bpp] : 0;
      const up = prior[x] || 0;
      const upLeft = x >= bpp ? prior[x - bpp] : 0;
      const value = raw[x];
      if (filter === 0) recon[x] = value;
      else if (filter === 1) recon[x] = (value + left) & 0xff;
      else if (filter === 2) recon[x] = (value + up) & 0xff;
      else if (filter === 3) recon[x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else recon[x] = (value + paeth(left, up, upLeft)) & 0xff;
    }
    prior = recon;
  }
  assert.equal(src, inflated.length, `${file}: unexpected trailing pixel data`);
  return { width: ihdr.width, height: ihdr.height, colorType: ihdr.colorType };
}

for (const relative of guideAssets) {
  const file = path.join(root, relative);
  assert.ok(fs.existsSync(file), `${relative}: missing guide asset`);
  const decoded = decodePng(file);
  console.log(`${relative}: decoded ${decoded.width}x${decoded.height}`);
}

console.log('all canonical guide assets fully decoded');
