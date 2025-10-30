import { Request, Response, NextFunction } from 'express'
import { validationResult } from 'express-validator'

import RequestError from '../util/error'
import User from '../models/user'
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

  const username = req.body.username
  const password = req.body.password

  let user: User | null
  try {
    user = await User.findByUsername(username)
  } catch (error) {
    return next(RequestError.accountDoesNotExist())
  }

  if (user) {
    const match = await user.verifyPassword(password)

    if (match) {
      const { accessToken, refreshToken } = await user.generateTokens({
        userAgent: req.get('user-agent') ?? undefined,
        ip: req.ip,
      })

      return res.status(200).json({
        user: {
          id: user.id,
          verified: user.verified,
          displayName: user.displayName,
          username: user.username,
          email: user.email,
          profilePicURL: getUploadURL(user.profilePicURL),
        },
        accessToken: accessToken,
        refreshToken: refreshToken,
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

  const rawEmail = req.body.email
  let email: string | null = null
  if (typeof rawEmail === 'string') {
    const trimmedEmail = rawEmail.trim()
    const normalizedEmail = trimmedEmail.toLowerCase()
    if (trimmedEmail && normalizedEmail !== 'null') {
      email = normalizedEmail
    }
  }
  const password: string = req.body.password

  try {
    const usernameTaken = await User.accountWithUsernameExists(username)
    if (usernameTaken) {
      return next(
        RequestError.withMessageAndCode('This username is taken.', 409)
      )
    }

    // Check if email is taken (only if email is provided)
    if (email) {
      const emailTaken = await User.accountWithEmailExists(email)
      if (emailTaken) {
        return next(
          RequestError.withMessageAndCode('This email account is taken.', 409)
        )
      }
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

  const hashedPassword = await User.hashPassword(password)

  const STOCK_PROFILE_PICS = [
    'bird',
    'dolphin',
    'fish',
    'horse',
    'kangaroo',
    'penguin',
    'shark',
    'snake',
  ]

  const newUser = new User({
    displayName: displayName,
    username: username,
    email: email,
    hashedPassword: hashedPassword,
    verified: false,
    profilePicURL:
      STOCK_PROFILE_PICS[Math.floor(Math.random() * STOCK_PROFILE_PICS.length)],
    verifyToken: email ? User.generateVerifyToken() : null,
  })

  try {
    await newUser.create()
    if (
      email &&
      process.env.NODE_ENV === 'production' &&
      process.env.VERIFY_USERS === 'true'
    ) {
      await newUser.sendVerificationEmail()
    } else if (process.env.NODE_ENV === 'test') {
      console.log('Verification code: ', newUser.verifyToken)
    }

    const { accessToken, refreshToken } = await newUser.generateTokens({
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    })

    return res.status(201).json({
      user: {
        id: newUser.id,
        verified: newUser.verified,
        displayName: newUser.displayName,
        username: newUser.username,
        email: newUser.email,
        profilePicURL: getUploadURL(newUser.profilePicURL),
      },
      accessToken: accessToken,
      refreshToken: refreshToken,
      message:
        email && process.env.VERIFY_USERS === 'true'
          ? 'Check your email for an account verification link.'
          : 'You have successfully created your new account.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'Something went wrong creating your account.',
        500
      )
    )
  }
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
    await user.setVerifiedStatus(verifyToken as string)

    const { accessToken, refreshToken } = await user.generateTokens({
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    })

    return res.status(200).json({
      verified: user.verified,
      accessToken: accessToken,
      refreshToken: refreshToken,
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

    await user.update({ verifyToken: User.generateVerifyToken() })

    if (
      process.env.NODE_ENV === 'production' &&
      process.env.VERIFY_USERS === 'true' &&
      user.email
    ) {
      await user.sendVerificationEmail()
    } else if (process.env.NODE_ENV === 'test') {
      console.log('Verification code: ', user.verifyToken)
    }

    return res.status(200).json({
      message: 'A new verification code has been emailed.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error generating a new verification code.',
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

  try {
    await user.beginPasswordReset()
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error updating the password reset token.',
        500
      )
    )
  }

  if (process.env.NODE_ENV === 'production' && user.email) {
    try {
      await user.sendPasswordResetEmail()
    } catch (error) {
      console.log(JSON.stringify(error))
    }
  } else if (process.env.NODE_ENV === 'test') {
    console.log('Password reset token: ', user.resetPasswordToken)
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
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg,
      errors: errors.array(),
    })
  }

  const resetPasswordToken = req.body.resetPasswordToken
  const newPassword = req.body.newPassword

  try {
    const user = await User.findByResetPasswordToken(resetPasswordToken)
    if (!user) {
      return next(
        RequestError.withMessageAndCode(
          'The password reset token is invalid.',
          400
        )
      )
    }

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

export const updateProfile = async (
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

  let user: User | null
  try {
    user = await User.findById(req.userId!)
  } catch (error) {
    return next(RequestError.withMessageAndCode('Unable to find user.', 500))
  }

  if (user === null) {
    return next(RequestError.accountDoesNotExist())
  }

  try {
    const updateData: any = {}

    if (req.body.displayName !== undefined) {
      updateData.displayName = req.body.displayName.trim()
    }

    if (req.body.profilePicURL !== undefined) {
      updateData.profilePicURL = req.body.profilePicURL
    }

    await user.update(updateData)

    return res.status(200).json({
      user: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        profilePicURL: getUploadURL(user.profilePicURL),
      },
      message: 'Profile has been updated.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error updating your profile.',
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

export const logOut = async (
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

  const refreshToken = req.body.refreshToken

  if (!refreshToken || typeof refreshToken !== 'string') {
    return next(
      RequestError.withMessageAndCode(
        'A refresh token is required to log out.',
        400
      )
    )
  }

  try {
    await User.revokeSession(refreshToken)
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error logging you out.',
        500
      )
    )
  }

  return res.status(200).json({
    message: 'This refresh token is now expired.',
  })
}

export const logOutEverywhere = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.userId) {
    return next(RequestError.notAuthorized())
  }

  try {
    const user = await User.findById(req.userId)
    if (!user) {
      return next(RequestError.accountDoesNotExist())
    }

    await user.revokeAllSessions()

    return res.status(200).json({
      message: 'All sessions have been revoked.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error revoking your sessions.',
        500
      )
    )
  }
}

export const refreshSession = async (
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

  const refreshTokenValue = req.body.refreshToken

  if (!refreshTokenValue || typeof refreshTokenValue !== 'string') {
    return next(
      RequestError.withMessageAndCode(
        'A refresh token is required to refresh the session.',
        400
      )
    )
  }

  try {
    const user = await User.validateRefreshToken(refreshTokenValue)
    if (!user) {
      await User.revokeSession(refreshTokenValue)
      return next(RequestError.notAuthorized())
    }

    await User.revokeSession(refreshTokenValue)

    const { accessToken, refreshToken } = await user.generateTokens({
      userAgent: req.get('user-agent') ?? undefined,
      ip: req.ip,
    })

    return res.status(200).json({
      user: {
        id: user.id,
        verified: user.verified,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        profilePicURL: getUploadURL(user.profilePicURL),
      },
      accessToken: accessToken,
      refreshToken: refreshToken,
      message: 'Session has been refreshed.',
    })
  } catch (error) {
    return next(
      RequestError.withMessageAndCode(
        'There was an error refreshing the session.',
        500
      )
    )
  }
}
