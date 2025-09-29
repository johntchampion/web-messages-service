import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { validationResult } from 'express-validator'

import RequestError from '../util/error'
import User, { AuthToken } from '../models/user'
import { getUploadURL } from '../util/upload'

export const ping = async (req: Request, res: Response, next: NextFunction) => {
  if (req.userId) {
    try {
      const user = await User.findById(req.userId!)
      if (user) {
        return res.status(200).json({
          message: 'Authenticated',
          user: {
            id: user.id,
            displayName: user.displayName,
            username: user.username,
            email: user.email,
            profilePicURL: getUploadURL(user.profilePicURL),
          },
        })
      } else {
        return next(RequestError.notAuthorized())
      }
    } catch (error) {
      return next(RequestError.notAuthorized())
    }
  } else {
    return next(RequestError.notAuthorized())
  }
}

export const logIn = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg,
      errors: errors.array(),
    })
  }

  const email = req.body.email
  const password = req.body.password

  let user: User | null
  try {
    user = await User.findByEmail(email)
  } catch (error) {
    return next(RequestError.accountDoesNotExist())
  }

  if (user) {
    const match = await bcrypt.compare(password, user.hashedPassword!)

    if (match) {
      const tokenPayload: AuthToken = {
        userId: user.id!,
        verified: user.verified || false,
      }
      const token = jwt.sign(tokenPayload, process.env.TOKEN_SECRET as string, {
        expiresIn: '1h',
      })

      return res.status(200).json({
        user: {
          id: user.id,
          displayName: user.displayName,
          username: user.username,
          email: user.email,
          profilePicURL: getUploadURL(user.profilePicURL),
        },
        token: token,
        validated: user.verified,
        message: 'You are now logged in.',
      })
    } else {
      return next(RequestError.passwordIncorrect())
    }
  } else {
    return next(RequestError.accountDoesNotExist())
  }
}

export const signUp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg,
      errors: errors.array(),
    })
  }

  const displayName: string = req.body.displayName.trim()
  const username: string = req.body.username.trim()
  const email: string = req.body.email.trim().toLowerCase()
  const password: string = req.body.password

  try {
    const emailTaken = await User.accountWithEmailExists(email)
    if (emailTaken) {
      return next(
        RequestError.withMessageAndCode('This email account is taken.', 409)
      )
    }
  } catch (error) {
    console.error(error)
    return next(
      RequestError.withMessageAndCode(
        'Something went wrong creating your account.',
        500
      )
    )
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  const newUser = new User({
    displayName: displayName,
    username: username,
    email: email,
    hashedPassword: hashedPassword,
    verified: false,
    verifyToken: User.generateVerifyToken(),
  })

  try {
    await newUser.create()
    if (process.env.NODE_ENV !== 'test') {
      await newUser.sendActivationEmail()
    }
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'Something went wrong creating your account.',
        500
      )
    )
  }

  const tokenPayload: AuthToken = {
    userId: newUser.id!,
    verified: newUser.verified || false,
  }
  const token = jwt.sign(tokenPayload, process.env.TOKEN_SECRET as string, {
    expiresIn: '1h',
  })

  return res.status(201).json({
    user: {
      id: newUser.id,
      displayName: newUser.displayName,
      username: newUser.username,
      email: newUser.email,
      profilePicURL: getUploadURL(newUser.profilePicURL),
    },
    token: token,
    verified: newUser.verified,
    message: 'Find our activation email to validate your account.',
  })
}

export const confirmEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg,
      errors: errors.array(),
    })
  }

  const verifyToken = req.body.verifyToken

  let user: User | null
  try {
    user = await User.findById(req.userId!)
  } catch (error) {
    return next(
      RequestError.withMessageAndCode('Account activation failed.', 500)
    )
  }

  if (user === null) {
    return next(
      RequestError.withMessageAndCode('Account activation failed.', 500)
    )
  }

  try {
    await user.verify(verifyToken as string)

    const tokenPayload: AuthToken = {
      userId: user.id!,
      verified: user.verified || false,
    }
    const token = jwt.sign(tokenPayload, process.env.TOKEN_SECRET as string, {
      expiresIn: '1h',
    })

    return res.status(200).json({
      verified: user.verified,
      token: token,
      message: 'You can now sign into the account.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error activating your account.',
        406
      )
    )
  }
}

export const resendEmailVerificationCode = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findById(req.userId!)
    if (user === null) {
      return next(RequestError.accountDoesNotExist())
    }

    user.verifyToken = User.generateVerifyToken()
    await user.update()

    if (process.env.NODE_ENV !== 'test') {
      await user.sendActivationEmail()
    }

    return res.status(200).json({
      message: 'A new verification code has been emailed.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error generating a new activation code.',
        500
      )
    )
  }
}

export const requestPasswordReset = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const email = req.body.email

  const buffer = crypto.randomBytes(32)
  const token = buffer.toString('hex')

  let user: User | null
  try {
    user = await User.findByEmail(email)
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'Could not request a password reset.',
        500
      )
    )
  }

  if (user === null) {
    return next(RequestError.accountDoesNotExist())
  }

  user.resetPasswordToken = token

  try {
    await user.update()
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error updating the password reset token.',
        500
      )
    )
  }

  if (process.env.NODE_ENV !== 'test') {
    await user.sendPasswordResetEmail()
  }

  return res.status(200).json({
    status: 'Reset Email Sent',
    message: 'A password reset email has been sent to the account holder.',
  })
}

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const resetPasswordToken = req.body.resetPasswordToken
  const newPassword = req.body.newPassword

  try {
    const user = await User.findByResetPasswordToken(resetPasswordToken)
    await user?.completePasswordReset(resetPasswordToken, newPassword)

    return res.status(200).json({
      status: 'Password Reset',
      message: 'Password has been reset.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error resetting your password.',
        500
      )
    )
  }
}

export const deleteAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let user: User | null
  try {
    user = await User.findById(req.userId!)
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'Unable to query for this person to delete.',
        500
      )
    )
  }
  if (user === null) {
    return next(RequestError.accountDoesNotExist())
  }

  try {
    await user.delete()
    return res.status(200).json({
      user: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        profilePicURL: getUploadURL(user.profilePicURL),
      },
      message: 'User account has been deleted.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error deleting this person.',
        500
      )
    )
  }
}
