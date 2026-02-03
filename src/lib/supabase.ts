import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// الإيميلات المسموح بها فقط
export const ALLOWED_EMAILS = [
  'ahmdalnt98@gmail.com', // غيّر هذا لإيميلك الفعلي
  'eemm5757@gmail.com',  // غيّر هذا لإيميل إيمان الفعلي
]

export const isAllowedEmail = (email: string): boolean => {
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}

// معرفات المستخدمين
export const getUserName = (email: string): string => {
  const emailLower = email.toLowerCase()
  // تحديد دقيق بناءً على الإيميل
  if (emailLower === 'ahmdalnt98@gmail.com') return 'أحمد'
  if (emailLower === 'eemm5757@gmail.com') return 'إيمان'
  // fallback للأسماء العامة
  if (emailLower.includes('ahmad')) return 'أحمد'
  if (emailLower.includes('eman') || emailLower.includes('iman')) return 'إيمان'
  return email.split('@')[0]
}

// الحصول على اسم المستخدم الآخر
export const getOtherUserName = (currentEmail: string): string => {
  const emailLower = currentEmail.toLowerCase()
  if (emailLower === 'ahmdalnt98@gmail.com') return 'إيمان'
  return 'أحمد'
}
