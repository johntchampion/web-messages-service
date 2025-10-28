import { Router } from 'express'
import { body } from 'express-validator'

import * as authController from '../controllers/auth'
import { authentication, authorization } from '../middleware/auth'

const router = Router()

router.get('/ping', authentication, authorization, authController.ping)

router.put(
  '/login',
  body('username').isLength({ min: 1 }).withMessage('A username is required.'),
  body('password').isLength({ min: 1 }).withMessage('A password is required.'),
  authController.logIn
)

router.post(
  '/signup',
  body('displayName')
    .isLength({ min: 1 })
    .withMessage('A display name is required.'),
  body('username')
    .isLength({ min: 1 })
    .withMessage('A username is required.')
    .isAlphanumeric()
    .withMessage('Username must contain only letters and numbers.'),
  body('email')
    .optional({ values: 'null' })
    .isEmail()
    .withMessage('Email address must be valid.'),
  body('password')
    .isLength({ min: 4 })
    .withMessage('Password must be at least four characters.'),
  authController.signUp
)

router.put(
  '/confirm-email',
  authentication,
  authorization,
  body('activateToken')
    .isLength({ min: 6, max: 6 })
    .withMessage('The activation code is 6 digits.')
    .isNumeric()
    .withMessage('The activation code should be all numeric.'),
  authController.confirmEmail
)

router.put(
  '/resend-verification-code',
  authentication,
  authorization,
  authController.resendEmailVerificationCode
)

router.put(
  '/request-new-password',
  body('email').isEmail().withMessage('Email address is required'),
  authController.requestPasswordReset
)

router.put('/reset-password', authController.resetPassword)

router.put(
  '/update-profile',
  authentication,
  authorization,
  body('displayName')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Display name cannot be empty.'),
  body('profilePicURL')
    .optional()
    .isString()
    .withMessage('Profile picture URL must be a string.'),
  authController.updateProfile
)

router.delete(
  '/delete-account',
  authentication,
  authorization,
  authController.deleteAccount
)

export default router
