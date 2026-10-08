'use client'

import { useActionState, useState } from 'react'
import { answerCsat } from '@/app/_actions/feedback'
import type { ActionResult } from '@/app/_actions/shared'
import { keepOnError } from '@/components/forms'
import { cn } from '@/components/ui'
import { SCORE_LABEL } from '@/lib/csat'

/** One-click CSAT: pick 1-5, optionally say why. Used on the portal home and on a delivered request. */
export function CsatPrompt({ surveyId, question, compact }: { surveyId: string; question: string; compact?: boolean }) {
  const [score, setScore] = useState<number | null>(null)
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(answerCsat, null)
  if (state?.ok) return <p role="status" className="m-0 text-[13px] font-medium text-good-ink">{state.message}</p>
  return (
    <form onSubmit={keepOnError(run)} className="flex flex-col gap-2.5">
      <input type="hidden" name="survey_id" value={surveyId} />
      <input type="hidden" name="score" value={score ?? ''} />
      <p className={cn('m-0 font-semibold', compact ? 'text-[13px]' : 'text-[14px]')}>{question}</p>
      <div role="radiogroup" aria-label="Your rating" className="grid max-w-[520px] grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={score === s} aria-label={`${s}: ${SCORE_LABEL[s]}`} onClick={() => setScore(s)}
            className={cn('flex h-[52px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border bg-white px-1 text-ink',
              score === s ? 'border-ink bg-head shadow-[inset_0_0_0_1px_#0F2A30]' : 'border-[#d5dcdf] hover:bg-head')}>
            <span className="font-mono text-[15px] font-semibold">{s}</span>
            <span className="text-[10px] leading-tight text-muted">{SCORE_LABEL[s]}</span>
          </button>
        ))}
      </div>
      {score != null ? (
        <>
          <label htmlFor={`csat-${surveyId}`} className="label">{score <= 3 ? 'What should we do better?' : 'What went well? (optional)'}</label>
          <textarea id={`csat-${surveyId}`} name="comment" rows={2} className="textarea max-w-[520px]" />
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || score == null} className="btn btn-primary">{pending ? 'Sending…' : 'Send rating'}</button>
        {state && !state.ok ? <p role="alert" className="m-0 text-xs text-crit-ink">{state.error}</p> : null}
      </div>
    </form>
  )
}
