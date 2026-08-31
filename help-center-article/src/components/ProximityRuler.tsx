/**
 * The signature element of the page.
 *
 * Every result is plotted on the same fixed 0 to 1 scale, so the gap between
 * the first answer and the third is visible rather than implied by ordering.
 * The readout is the cosine similarity the database returned, not a rounded
 * badge invented in the UI.
 */
export function ProximityRuler({ similarity }: { similarity: number }) {
  const position = Math.min(Math.max(similarity, 0), 1)

  return (
    <div className="flex w-32 shrink-0 flex-col gap-1.5">
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-2 h-px bg-edge" />
        {[0, 0.25, 0.5, 0.75, 1].map((mark) => (
          <div
            key={mark}
            className="absolute top-1 h-2 w-px bg-edge"
            style={{ left: `${mark * 100}%` }}
          />
        ))}
        <div
          className="absolute top-0 h-4 w-0.5 -translate-x-1/2 rounded-full bg-verdigris"
          style={{ left: `${position * 100}%` }}
        />
      </div>
      <span className="font-mono text-[0.6875rem] tabular-nums text-dust">
        {position.toFixed(3)}
      </span>
    </div>
  )
}

export function RulerAxis() {
  return (
    <div className="flex w-32 shrink-0 items-center justify-between font-mono text-[0.625rem] uppercase tracking-widest text-dust">
      <span>0</span>
      <span>match</span>
      <span>1</span>
    </div>
  )
}
