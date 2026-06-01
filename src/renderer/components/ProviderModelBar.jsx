import { memo } from 'react'
import { UpdateButton } from './UpdateButton'

const ProviderModelBar = memo(() => {
  return (
    <div className="flex items-center justify-end px-4 py-2 bg-muted/10">
      <UpdateButton />
    </div>
  )
})

export default ProviderModelBar
