// Ohne leicht verwechselbare Zeichen (0/o, 1/l/i)
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Erzeugt einen zufälligen Einladungscode, z. B. «kd7m-xq2p-9tvw» (12 Zeichen, kryptografisch zufällig). */
export function generateInviteCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const limit = 256 - (256 % ALPHABET.length) // Gleichverteilung ohne Modulo-Verzerrung
  const chars: string[] = []
  while (chars.length < 12) {
    for (const b of random(24)) {
      if (b < limit && chars.length < 12) chars.push(ALPHABET[b % ALPHABET.length])
    }
  }
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-')
}
