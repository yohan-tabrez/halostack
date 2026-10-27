'use client'

import CommandRunBar, { type LibraryPick } from '@/components/CommandRunBar'

export default function GroupCommandExecutor({
  groupId,
  onlineCount,
  library = [],
}: {
  groupId: string
  onlineCount: number
  library?: LibraryPick[]
}) {
  return (
    <CommandRunBar mode="group" groupId={groupId} onlineCount={onlineCount} library={library} />
  )
}
