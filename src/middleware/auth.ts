import { Request, Response, NextFunction } from 'express'

import RequestError from '../util/error'
import User from '../models/user'

export const authentication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.get('Authorization')

  if (!authHeader) {
    req.userId = null
    return next()
  }

  const token = authHeader.split(' ')[1]

  try {
    const user = await User.validateAccessToken(token)
    if (!user) {
      req.userId = null
      req.verified = undefined
      return next()
    }

    req.userId = user.id ?? null
    req.verified = user.verified ?? false
  } catch (error) {
    req.userId = null
    req.verified = undefined
  }

  return next()
}

export const authorization = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.userId

  if (!userId) {
    throw RequestError.notAuthorized()
  } else {
    return next()
  }
}
