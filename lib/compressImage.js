// Downscales a photo in the browser before it's uploaded.
//
// Engineers shoot these on a phone in a venue, on venue signal. A modern phone
// camera produces 4–8MB files; at 1600px on the long edge they land around
// 300–600KB with no visible loss at the sizes we ever display them (220px in
// the form, 320px on the report, ~190px in a PDF). That's the difference
// between a survey with eight photos uploading in seconds and timing out.

const MAX_EDGE = 1600;
const QUALITY = 0.8;

// Anything that isn't a bitmap the canvas can decode is passed straight
// through: HEIC from an iPhone that Safari didn't transcode, SVG, PDF, and
// anything already small enough not to be worth re-encoding.
const SKIP_BELOW_BYTES = 400 * 1024;

function canCompress(file) {
  if (!file || !file.type) return false;
  if (!file.type.startsWith('image/')) return false;
  // GIFs would lose animation, SVGs are vectors, HEIC usually can't be decoded.
  if (/(gif|svg\+xml|heic|heif)/i.test(file.type)) return false;
  return file.size > SKIP_BELOW_BYTES;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

/**
 * Returns a smaller File, or the original if it can't or shouldn't be shrunk.
 * Never throws — a failure here must not stop someone submitting a survey.
 */
export async function compressImage(file) {
  if (!canCompress(file)) return file;

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    // Already small enough in dimensions — re-encoding would only lose quality.
    if (scale === 1 && file.type === 'image/jpeg') return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file; // no win, keep the original

    // Keep the original name so uploads and the CSV still read sensibly, but
    // correct the extension since the contents are now JPEG.
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Convenience for the multi-file pickers. Order is preserved. */
export async function compressImages(files) {
  return Promise.all(Array.from(files).map(compressImage));
}
