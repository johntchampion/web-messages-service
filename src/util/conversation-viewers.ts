interface ActiveView {
  convoId: string
  subscriptionId: string
}

/**
 * Tracks which push subscription each socket is actively looking at, so a
 * device isn't sent a push for the conversation already on its screen.
 * In memory only: a restart drops every entry, and clients re-report on reconnect.
 */
const activeViewsBySocketId = new Map<string, ActiveView>()

export const startViewing = (
  socketId: string,
  convoId: string,
  subscriptionId: string,
): void => {
  activeViewsBySocketId.set(socketId, { convoId, subscriptionId })
}

export const stopViewing = (socketId: string): void => {
  activeViewsBySocketId.delete(socketId)
}

export const findSubscriptionIdsViewing = (convoId: string): Set<string> => {
  const subscriptionIds = new Set<string>()
  activeViewsBySocketId.forEach((view) => {
    if (view.convoId === convoId) subscriptionIds.add(view.subscriptionId)
  })
  return subscriptionIds
}
