export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  created_at: string
}

export interface Message {
  id: string
  sender_id: string
  content: string
  message_type: 'text' | 'voice'
  audio_url?: string
  audio_duration?: number
  is_read: boolean
  created_at: string
  sender?: User
}

export interface Note {
  id: string
  created_by: string
  assigned_to: string
  title: string
  content?: string
  is_completed: boolean
  priority: 'low' | 'medium' | 'high'
  created_at: string
  creator?: User
  assignee?: User
}

export interface NotificationPayload {
  title: string
  body: string
  icon?: string
  data?: {
    type: 'message' | 'note'
    id: string
  }
}

export type TabType = 'chat' | 'notes'

export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}
