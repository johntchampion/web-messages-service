namespace Express {
  interface Request {
    userId?: string | null
    verified?: boolean
    adminGroupId: string | null
    memberGroupId: string | null
    ownerMessageId: string | null
    ownerPostId: string | null
  }
}
