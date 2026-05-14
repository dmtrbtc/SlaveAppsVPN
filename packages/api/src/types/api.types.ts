export interface ApiResponse<T> {
  data: T
  status: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
}

export interface ApiErrorBody {
  detail?: string
  message?: string
  code?: string
}
