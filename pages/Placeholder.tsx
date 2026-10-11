import { Card } from '../components/ui'

export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{title}</h1>
      <Card>
        <p className="text-ink-soft">Diese Seite ist noch nicht verfügbar. Sie wird in {phase} gebaut.</p>
      </Card>
    </div>
  )
}
