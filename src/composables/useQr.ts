import qrcode from 'qrcode-generator';

export interface QrData {
  size: number;  // jumlah modul per sisi, termasuk zona tenang
  path: string;  // path SVG untuk seluruh modul gelap
}

const MARGIN = 4; // zona tenang minimal menurut standar QR

// URL disimpan sebagai URL.href (hanya ASCII), jadi mode Byte default aman.
// Kalau kelak mengodekan teks non-ASCII, atur qrcode.stringToBytes ke UTF-8.
export function makeQr(text: string): QrData {
  const qr = qrcode(0, 'M'); // 0 = ukuran otomatis, koreksi kesalahan M (~15%)
  qr.addData(text, 'Byte');
  qr.make();                 // melempar error bila teks terlalu panjang
  const n = qr.getModuleCount();
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c + MARGIN} ${r + MARGIN}h1v1h-1z`;
    }
  }
  return { size: n + MARGIN * 2, path };
}

// Skala bilangan bulat agar setiap modul tajam di PNG
export function qrToPngDataUrl(q: QrData, targetPx = 1024) {
  const scale = Math.max(1, Math.floor(targetPx / q.size));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = q.size * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000';
  ctx.fill(new Path2D(q.path));
  return canvas.toDataURL('image/png');
}
