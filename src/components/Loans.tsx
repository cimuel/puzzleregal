import { useState } from 'react'
import { rpc, type LoanRow } from '../lib/api'
import { nextStep, statusLabel } from '../lib/loans'
import { formatDate } from '../lib/time'
import { Button } from './ui'
import { Chip, ErrorBox } from './Parts'

const tone = (s: LoanRow['status']) => (s === 'lent' || s === 'accepted' ? 'warn' : s === 'returned' ? 'good' : 'neutral') as 'warn' | 'good' | 'neutral'
export const LoanChip = ({ status }: { status: LoanRow['status'] }) => <Chip tone={tone(status)}>{statusLabel[status]}</Chip>

/** «Ausleihe anfragen» für ein fremdes Exemplar, oder der Stand der eigenen Anfrage. */
export function RequestLoan({ copyId, mine, onDone }: { copyId: string; mine?: LoanRow; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true); setError(null)
    try { await rpc(fn, args); setOpen(false); setMessage(''); onDone() } catch (e) { setError(e instanceof Error ? e.message : 'Unbekannter Fehler.') }
    setBusy(false)
  }

  if (mine) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2"><LoanChip status={mine.status} />
          {(mine.status === 'requested' || mine.status === 'accepted') && <Button variant="secondary" disabled={busy} onClick={() => run('cancel_loan', { p_loan: mine.loan_id })}>Zurückziehen</Button>}</div>
        <ErrorBox message={error} />
      </div>
    )
  }
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Ausleihe anfragen</Button>
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm"><span className="mb-1 block font-semibold">Nachricht (optional)</span>
        <textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-lg border border-line bg-white px-3 py-2" placeholder="z. B. Darf ich es für zwei Wochen haben?" /></label>
      <div className="flex gap-2"><Button disabled={busy} onClick={() => run('request_loan', { p_copy: copyId, p_message: message || null })}>{busy ? 'Senden …' : 'Anfrage senden'}</Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button></div>
      <ErrorBox message={error} />
    </div>
  )
}

/** Eine Ausleihe mit den passenden Schaltflächen. role: aus Sicht der angemeldeten Person (admin darf wie Besitzer handeln). */
export function LoanItem({ loan, role, onChange }: { loan: LoanRow; role: 'owner' | 'borrower' | 'admin'; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const asOwner = role === 'owner' || role === 'admin'

  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true); setError(null)
    try { await rpc(fn, args); onChange() } catch (e) { setError(e instanceof Error ? e.message : 'Unbekannter Fehler.') }
    setBusy(false)
  }
  const id = { p_loan: loan.loan_id }
  const s = loan.status
  const when = loan.returned_at ?? loan.handed_over_at ?? loan.accepted_at ?? loan.requested_at

  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold">{loan.title} <span className="font-normal text-ink-soft">({loan.piece_count} Teile{loan.brand ? `, ${loan.brand}` : ''})</span></p>
          <p className="text-ink-soft">{loan.owner_name} an {loan.borrower_name} · {formatDate(when)}</p>
          {loan.message && <p className="mt-1 text-sm italic">«{loan.message}»</p>}
        </div>
        <LoanChip status={s} />
      </div>
      {role !== 'admin' && nextStep(s, asOwner ? 'owner' : 'borrower') && <p className="mt-2 text-sm text-ink-soft">{nextStep(s, asOwner ? 'owner' : 'borrower')}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {asOwner && s === 'requested' && <>
          <Button disabled={busy || loan.copy_busy} onClick={() => run('respond_loan', { ...id, p_accept: true })}>Annehmen</Button>
          <Button variant="danger" disabled={busy} onClick={() => run('respond_loan', { ...id, p_accept: false })}>Ablehnen</Button></>}
        {asOwner && s === 'requested' && loan.copy_busy && <span className="self-center text-sm text-ink-soft">Bereits an jemand anderen vergeben.</span>}
        {asOwner && s === 'accepted' && <>
          <Button disabled={busy} onClick={() => run('confirm_handover', id)}>Übergabe bestätigen</Button>
          <Button variant="secondary" disabled={busy} onClick={() => run('cancel_loan', id)}>Stornieren</Button></>}
        {asOwner && (s === 'lent' || s === 'return_requested') && <Button disabled={busy} onClick={() => run('confirm_return', id)}>Rückgabe bestätigen</Button>}
        {asOwner && s === 'lent' && <Button variant="secondary" disabled={busy} onClick={() => run('request_return', id)}>Rückgabe anfragen</Button>}
        {!asOwner && (s === 'requested' || s === 'accepted') && <Button variant="secondary" disabled={busy} onClick={() => run('cancel_loan', id)}>Zurückziehen</Button>}
        {!asOwner && s === 'lent' && <Button disabled={busy} onClick={() => run('request_return', id)}>Rückgabe melden</Button>}
      </div>
      <div className="mt-2"><ErrorBox message={error} /></div>
    </li>
  )
}
