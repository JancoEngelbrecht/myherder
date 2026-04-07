declare namespace Express {
  interface Request {
    user?: {
      id: string
      username: string
      full_name: string
      role: 'admin' | 'worker' | 'super_admin'
      permissions: string[]
      language: string
      farm_id: string | null
      token_version: number
      login_type?: 'password' | 'pin'
      species_code?: string
    }
    farmId?: string
  }
}
