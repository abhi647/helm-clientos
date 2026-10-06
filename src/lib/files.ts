/** File types the platform accepts (also enforced by the storage bucket). The MIME type comes from the extension, never the browser. */
export const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ppt: 'application/vnd.ms-powerpoint',
  csv: 'text/csv', txt: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  zip: 'application/zip',
}
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const ACCEPT = Object.keys(FILE_TYPES).map((e) => `.${e}`).join(',')
export const ALLOWED_LABEL = 'PDF, Word, Excel, PowerPoint, CSV, text, images or ZIP'

export function fileType(name: string): { ext: string; mime: string } | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return FILE_TYPES[ext] ? { ext, mime: FILE_TYPES[ext]! } : null
}

/** Types that open safely in the browser (served from the storage domain, never from the app). */
export const PREVIEWABLE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'])
