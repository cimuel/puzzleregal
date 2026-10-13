import { supabase } from './supabase'

const BUCKET = 'puzzle-images'
const MAX_SIDE = 1280
const MAX_BYTES = 900_000 // Der Speicher erlaubt 1 MB pro Bild

export function imageUrl(path: string | null | undefined): string | null {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null
}

/** Verkleinert ein Foto im Browser (längste Seite 1280 px) und wandelt es in WebP (oder JPEG) um. */
export async function prepareImage(file: File): Promise<{ blob: Blob; ext: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('Dieses Bildformat kann nicht gelesen werden. Bitte JPEG, PNG oder WebP verwenden.')
  })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let last: Blob | null = null
  for (const quality of [0.85, 0.72, 0.58, 0.45]) {
    last = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality))
    if (last && last.size <= MAX_BYTES) break
  }
  if (!last) throw new Error('Das Bild konnte nicht verarbeitet werden.')
  if (last.size > MAX_BYTES) throw new Error('Das Bild ist auch nach dem Verkleinern zu gross. Bitte ein anderes Foto verwenden.')
  // Manche Browser (ältere Safari) liefern statt WebP ein PNG: das ist erlaubt, nur grösser.
  const ext = last.type === 'image/webp' ? 'webp' : last.type === 'image/jpeg' ? 'jpg' : 'png'
  return { blob: last, ext }
}

/** Lädt ein Bild in den eigenen Ordner hoch und gibt den Pfad zurück. */
export async function uploadImage(userId: string, file: File): Promise<string> {
  const { blob, ext } = await prepareImage(file)
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type })
  if (error) throw new Error(`Das Foto konnte nicht gespeichert werden (${error.message}).`)
  return path
}

export async function removeImage(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]) // bewusst ohne Fehlermeldung: Aufräumen darf scheitern
}
