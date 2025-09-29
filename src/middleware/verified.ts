import { Request, Response, NextFunction } from 'express'

import RequestError from '../util/error'

const isVerified = (req: Request, res: Response, next: NextFunction) => {
  if (req.verified) {
    return next()
  } else {
    throw RequestError.notVerified()
  }
}

export default isVerified
