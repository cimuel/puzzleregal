import type { LoanStatus, NotificationRow } from './api'

export const ACTIVE: LoanStatus[] = ['requested', 'accepted', 'lent', 'return_requested']
export const isActive = (s: LoanStatus) => ACTIVE.includes(s)

export const statusLabel: Record<LoanStatus, string> = {
  requested: 'angefragt',
  accepted: 'angenommen',
  lent: 'ausgeliehen',
  return_requested: 'Rückgabe angefragt',
  returned: 'zurückgegeben',
  declined: 'abgelehnt',
  cancelled: 'storniert',
}

/** Kurze Erklärung, wie es beim jeweiligen Status weitergeht. */
export function nextStep(status: LoanStatus, role: 'owner' | 'borrower'): string {
  switch (status) {
    case 'requested': return role === 'owner' ? 'Du kannst die Anfrage annehmen oder ablehnen.' : 'Warte auf die Antwort der Besitzerin oder des Besitzers.'
    case 'accepted': return role === 'owner' ? 'Bestätige die Übergabe, sobald du das Puzzle übergeben hast.' : 'Hole das Puzzle ab. Die Besitzerin oder der Besitzer bestätigt die Übergabe.'
    case 'lent': return role === 'owner' ? 'Das Puzzle ist verliehen. Bestätige die Rückgabe, wenn du es zurück hast.' : 'Du hast das Puzzle. Melde die Rückgabe, wenn du es zurückbringst.'
    case 'return_requested': return role === 'owner' ? 'Bestätige die Rückgabe, sobald du das Puzzle zurück hast.' : 'Die Rückgabe wurde angefragt. Die Besitzerin oder der Besitzer bestätigt sie.'
    default: return ''
  }
}

export function notificationText(n: Pick<NotificationRow, 'type' | 'payload'>): string {
  const p = n.payload
  const t = `«${p.puzzle_title ?? 'Puzzle'}»`
  switch (n.type) {
    case 'loan_requested': return `${p.borrower_name} möchte ${t} ausleihen.${p.message ? ` Nachricht: ${p.message}` : ''}`
    case 'loan_accepted': return `${p.owner_name} hat deine Anfrage für ${t} angenommen. Die Übergabe wird noch bestätigt.`
    case 'loan_declined': return `${p.owner_name} hat deine Anfrage für ${t} abgelehnt.`
    case 'loan_cancelled': return `Die Ausleihe von ${t} (${p.owner_name} an ${p.borrower_name}) wurde storniert.`
    case 'loan_handed_over': return `Die Übergabe von ${t} wurde bestätigt. Das Puzzle ist jetzt in deinem Regal.`
    case 'loan_return_requested': return `Für ${t} wurde die Rückgabe angefragt (${p.owner_name}, ${p.borrower_name}).`
    case 'loan_returned': return `Die Rückgabe von ${t} wurde bestätigt.`
    case 'copy_transferred': return `${p.from_name} hat dir das Puzzle ${t} übertragen. Es steht jetzt in deinem Regal.`
    default: return 'Neue Mitteilung.'
  }
}

export function notificationLink(n: Pick<NotificationRow, 'payload'>): string {
  switch (n.payload.page) {
    case 'requests': return '/ausleihen/anfragen'
    case 'mine': return '/ausleihen/meine'
    case 'shelf': return '/mein-regal'
    default: return '/start'
  }
}
