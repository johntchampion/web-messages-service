import { Request } from 'express'
import multer from 'multer'

const supportedFileTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif']

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads')
  },
  filename: (req, file, cb) => {
    cb(null, new Date().toISOString() + '-' + file.originalname)
  },
})
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (supportedFileTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('This file type is unsupported.'))
  }
}

const upload = multer({ storage: storage, fileFilter: fileFilter })

export const getUploadURL = (
  filename: string | null | undefined
): string | null => {
  if (filename) {
    const lastDotIndex = filename.lastIndexOf('.')

    // If no extension found, return filename unchanged
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return filename
    }

    return (
      (process.env.BASE_URL
        ? `${process.env.BASE_URL}/uploads/`
        : 'http://localhost:8000/uploads/') + filename
    )
  } else {
    return null
  }
}

export default upload
