// Plain module, deliberately NOT inside AttachmentPicker: that file is
// 'use client', and a server component importing a function out of a client
// module gets "Attempted to call formatBytes() from the server" at render time.
// The report pages are server components and all format attachment sizes.
export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
