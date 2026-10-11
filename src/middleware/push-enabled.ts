import { Request, Response, NextFunction } from 'express'

import RequestError from '../util/error'
import { pushEnabled } from '../util/push-client'

const requirePushEnabled = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (pushEnabled) {
    return next()
  } else {
    throw RequestError.withMessageAndCode(
      'Push notifications are not enabled on this server.',
      503
    )
  }
}

export default requirePushEnabled
