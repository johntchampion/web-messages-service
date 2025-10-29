import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

import RequestError from '../util/error'
import { AccessToken } from '../models/user'

export const authentication = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.get('Authorization')

  if (!authHeader) {
    req.userId = null
    return next()
  } else {
    const token = authHeader.split(' ')[1]
    let decodedToken: AccessToken
    try {
      decodedToken = jwt.verify(
        token,
        process.env.TOKEN_SECRET as string
      ) as AccessToken
    } catch (error) {
      req.userId = null
      return next()
    }
    if (!decodedToken) {
      req.userId = null
      return next()
    }

    req.userId = decodedToken.userId
    req.verified = decodedToken.verified
    return next()
  }
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
