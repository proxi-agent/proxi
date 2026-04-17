import { StepProgress } from '@/components/primitives'
import { stageIndex, STAGES } from '@/lib/transfer/copy'
import type { TransferStage } from '@/lib/transfer/types'

export function TransferStageTracker({ stage, subset }: { stage: TransferStage; subset?: TransferStage[] }) {
  const current = stageIndex(stage)
  const stages = subset ? STAGES.filter(s => subset.includes(s.id)) : STAGES

  const items = stages.map(s => {
    const idx = stageIndex(s.id)
    const state = idx < current ? 'done' : idx === current ? 'current' : 'upcoming'
    return { label: s.title, state: state as 'current' | 'done' | 'upcoming', value: s.description }
  })

  return <StepProgress steps={items} />
}
