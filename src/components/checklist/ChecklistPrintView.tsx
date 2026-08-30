import {
  CATEGORY_BLURBS,
  categoryProgress,
  dueLabel,
  itemQuantity,
  progressOf,
  type ChecklistItem,
  type DerivedQuantities,
} from '@/lib/checklist'
import { DerivedQuantitiesPanel } from './DerivedQuantitiesPanel'

/**
 * The version the committee prints and carries to the venue: no gradients,
 * no animation, real tick boxes, and every derived quantity spelled out so
 * nobody has to look anything up on their phone in the car park.
 */
export interface ChecklistPrintViewProps {
  items: ChecklistItem[]
  derived: DerivedQuantities
  nowIso: string
  dateLabel: string
}

export function ChecklistPrintView({
  items,
  derived,
  nowIso,
  dateLabel,
}: ChecklistPrintViewProps) {
  const now = new Date(nowIso)
  const overall = progressOf(items)
  const groups = categoryProgress(items)
  const printed = now.toISOString().slice(0, 10)

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black print:p-0">
      <header className="mb-5 border-b-2 border-black pb-3">
        <h1 className="text-2xl font-extrabold" style={{ color: '#000' }}>
          Sunday Smashers — venue checklist
        </h1>
        <p className="text-sm">
          Christmas Mini Tournament · {dateLabel} · printed {printed}
        </p>
        <p className="text-sm font-semibold">
          {overall.done} of {overall.total} jobs done ({overall.percent}%)
        </p>
      </header>

      <section className="mb-5">
        <h2 className="mb-2 text-lg font-bold" style={{ color: '#000' }}>
          Quantities
        </h2>
        <DerivedQuantitiesPanel derived={derived} print />
      </section>

      {groups.map((group) => (
        <section key={group.category} className="mb-5 break-inside-avoid">
          <h2 className="text-lg font-bold" style={{ color: '#000' }}>
            {group.category}{' '}
            <span className="text-sm font-normal">
              ({group.done}/{group.total})
            </span>
          </h2>
          <p className="mb-2 text-sm">{CATEGORY_BLURBS[group.category]}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="w-8 py-1">✓</th>
                <th className="py-1">Job</th>
                <th className="py-1">How many</th>
                <th className="py-1">Owner</th>
                <th className="py-1">Due</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.id} className="border-b border-neutral-300 align-top">
                  <td className="py-1.5">
                    <span
                      className="inline-block h-4 w-4 border border-black text-center text-xs leading-4"
                      aria-hidden="true"
                    >
                      {item.done ? '✓' : ''}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <span className="font-semibold">{item.label}</span>
                    {item.detail && <span className="block text-xs">{item.detail}</span>}
                    {item.notes && <span className="block text-xs italic">{item.notes}</span>}
                  </td>
                  <td className="py-1.5">{itemQuantity(item, derived) || '—'}</td>
                  <td className="py-1.5">{item.owner || '—'}</td>
                  <td className="py-1.5">{item.dueDate ? dueLabel(item, now) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <footer className="mt-6 border-t border-black pt-2 text-xs">
        Loot bags for everyone, trophies for the champions, medals for the podium. Merry smashing. 🎄
      </footer>
    </div>
  )
}
